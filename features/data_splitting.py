"""Disease/answer/question-grouped splits for generation research.

The old question-only protocol remains explicitly opt-in for historical replication.
Never compare its scores directly with the new held-out-disease protocol.
"""
from pathlib import Path
import pandas as pd
from research.data import digest, grouped_split

TRAIN_SIZE, VALIDATION_SIZE, TEST_SIZE, RANDOM_STATE = .8, .1, .1, 42


def split_data(dataframe, train_size=TRAIN_SIZE, validation_size=VALIDATION_SIZE,
               test_size=TEST_SIZE, random_state=RANDOM_STATE, *, protocol="grouped"):
    if not isinstance(dataframe, pd.DataFrame) or dataframe.empty:
        raise ValueError("A nonempty Pandas DataFrame is required")
    sizes = (train_size, validation_size, test_size)
    if any(x <= 0 for x in sizes) or abs(sum(sizes)-1) > 1e-8:
        raise ValueError("Positive split fractions must sum to one")
    required = ["question"] if protocol == "legacy_question" else ["question", "answer", "focus_area"]
    if any(c not in dataframe.columns for c in required) or dataframe[required].isna().any().any():
        raise ValueError("Missing required split columns or values: " + str(required))
    frame = dataframe.copy()
    if protocol == "legacy_question":
        from sklearn.model_selection import GroupShuffleSplit
        first = GroupShuffleSplit(n_splits=1, train_size=train_size, random_state=random_state)
        a, temp = next(first.split(frame, groups=frame["question"]))
        second = GroupShuffleSplit(n_splits=1, train_size=validation_size/(validation_size+test_size), random_state=random_state)
        b, c = next(second.split(frame.iloc[temp], groups=frame.iloc[temp]["question"]))
        parts = [frame.iloc[a], frame.iloc[temp[b]], frame.iloc[temp[c]]]
        report = {"protocol": protocol, "warning": "Question-only replication permits focus and answer overlap; not a generation generalization benchmark."}
    elif protocol == "grouped":
        # Preserve stable source IDs when supplied; content hashes are a fallback.
        if "record_id" not in frame:
            frame["record_id"] = [digest([str(row.get(k, "")) for k in ("question","answer","focus_area","source")])
                                  for row in frame.to_dict("records")]
        input_count = len(frame)
        frame = frame.drop_duplicates(subset=["question", "answer", "focus_area"]).copy()
        report = grouped_split(frame.to_dict("records"), sizes, random_state)
        report["duplicate_rows_removed"] = input_count-len(frame)
        parts = [frame[frame.record_id.map(report["assignments"]) == name] for name in ("train","validation","test")]
    else:
        raise ValueError("Unknown protocol; use grouped or legacy_question")
    report.update({"total_records": len(frame), "random_state": random_state})
    for name, part in zip(("train","validation","test"), parts):
        report[name+"_records"] = len(part)
        report[name+"_percentage"] = round(100*len(part)/len(frame), 2)
        report[name+"_unique_questions"] = part.question.nunique()
    return *(part.reset_index(drop=True).copy() for part in parts), report


def save_splits(
    train_df: pd.DataFrame,
    validation_df: pd.DataFrame,
    test_df: pd.DataFrame,
    output_dir: str | Path = "data/processed"
) -> dict:
    """
    Save train, validation, and test datasets as CSV files.

    Parameters
    ----------
    train_df : pd.DataFrame
        Training dataset.

    validation_df : pd.DataFrame
        Validation dataset.

    test_df : pd.DataFrame
        Test dataset.

    output_dir : str | Path
        Directory where the datasets will be saved.

        Default:
            data/processed

    Returns
    -------
    report : dict
        Information about the saved datasets and their paths.
    """

    # --------------------------------------------------------------
    # STEP 1: Validate datasets
    # --------------------------------------------------------------

    datasets = {
        "train": train_df,
        "validation": validation_df,
        "test": test_df
    }

    for name, dataframe in datasets.items():

        if not isinstance(
            dataframe,
            pd.DataFrame
        ):
            raise TypeError(
                f"{name}_df must be a Pandas DataFrame."
            )

        if dataframe.empty:
            raise ValueError(
                f"{name}_df cannot be empty."
            )


    # --------------------------------------------------------------
    # STEP 2: Create output directory
    # --------------------------------------------------------------

    output_path = Path(
        output_dir
    )

    output_path.mkdir(
        parents=True,
        exist_ok=True
    )


    # --------------------------------------------------------------
    # STEP 3: Define output files
    # --------------------------------------------------------------

    train_path = (
        output_path / "train.csv"
    )

    validation_path = (
        output_path / "validation.csv"
    )

    test_path = (
        output_path / "test.csv"
    )


    # --------------------------------------------------------------
    # STEP 4: Save CSV files
    # --------------------------------------------------------------

    train_df.to_csv(
        train_path,
        index=False,
        encoding="utf-8"
    )

    validation_df.to_csv(
        validation_path,
        index=False,
        encoding="utf-8"
    )

    test_df.to_csv(
        test_path,
        index=False,
        encoding="utf-8"
    )


    # --------------------------------------------------------------
    # STEP 5: Verify files were created
    # --------------------------------------------------------------

    saved_files = [
        train_path,
        validation_path,
        test_path
    ]

    for file_path in saved_files:

        if not file_path.exists():
            raise RuntimeError(
                f"Dataset was not saved successfully: "
                f"{file_path}"
            )


    # --------------------------------------------------------------
    # STEP 6: Create save report
    # --------------------------------------------------------------

    report = {

        "output_directory":
            str(output_path),

        "train_path":
            str(train_path),

        "validation_path":
            str(validation_path),

        "test_path":
            str(test_path),

        "train_records":
            len(train_df),

        "validation_records":
            len(validation_df),

        "test_records":
            len(test_df),

        "total_records_saved": (
            len(train_df)
            + len(validation_df)
            + len(test_df)
        )
    }

    return report