"""
data_splitting.py

Purpose:
    Split the feature-engineered MedQuAD dataset into
    training, validation, and test datasets and optionally
    save those datasets for model training.

Responsibilities:
    - Validate the input dataset
    - Create train/validation/test splits
    - Keep identical questions in the same split
    - Reduce train/test data leakage
    - Make splitting reproducible
    - Generate a splitting report
    - Save the resulting datasets as CSV files

Important:
    Splitting is performed using the question as a grouping
    variable so repeated questions cannot appear across
    different dataset splits.
"""

from pathlib import Path

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit


# ------------------------------------------------------------------
# SPLIT CONFIGURATION
# ------------------------------------------------------------------

TRAIN_SIZE = 0.80
VALIDATION_SIZE = 0.10
TEST_SIZE = 0.10

RANDOM_STATE = 42


# ------------------------------------------------------------------
# VALIDATE DATAFRAME
# ------------------------------------------------------------------

def _validate_dataframe(
    dataframe: pd.DataFrame
) -> None:
    """
    Validate the dataset before splitting.
    """

    if not isinstance(dataframe, pd.DataFrame):
        raise TypeError(
            "Data splitting expects a Pandas DataFrame."
        )

    if dataframe.empty:
        raise ValueError(
            "Cannot split an empty DataFrame."
        )

    if "question" not in dataframe.columns:
        raise ValueError(
            "The dataset must contain a 'question' column."
        )


# ------------------------------------------------------------------
# GROUP-AWARE DATA SPLITTING
# ------------------------------------------------------------------

def split_data(
    dataframe: pd.DataFrame,
    train_size: float = TRAIN_SIZE,
    validation_size: float = VALIDATION_SIZE,
    test_size: float = TEST_SIZE,
    random_state: int = RANDOM_STATE
) -> tuple[
    pd.DataFrame,
    pd.DataFrame,
    pd.DataFrame,
    dict
]:
    """
    Split MedQuAD into train, validation, and test datasets.

    Repeated questions are kept together to reduce data leakage.

    Default split:
        Train      = 80%
        Validation = 10%
        Test       = 10%

    Parameters
    ----------
    dataframe : pd.DataFrame
        Feature-engineered MedQuAD dataset.

    train_size : float
        Proportion assigned to training.

    validation_size : float
        Proportion assigned to validation.

    test_size : float
        Proportion assigned to testing.

    random_state : int
        Random seed for reproducibility.

    Returns
    -------
    train_df : pd.DataFrame
        Training dataset.

    validation_df : pd.DataFrame
        Validation dataset.

    test_df : pd.DataFrame
        Test dataset.

    report : dict
        Summary of the splitting operation.
    """

    # --------------------------------------------------------------
    # STEP 1: Validate DataFrame
    # --------------------------------------------------------------

    _validate_dataframe(dataframe)


    # --------------------------------------------------------------
    # STEP 2: Validate split percentages
    # --------------------------------------------------------------

    total_size = (
        train_size
        + validation_size
        + test_size
    )

    if abs(total_size - 1.0) > 1e-8:
        raise ValueError(
            "train_size + validation_size + test_size "
            "must equal 1.0."
        )

    if (
        train_size <= 0
        or validation_size <= 0
        or test_size <= 0
    ):
        raise ValueError(
            "All split sizes must be greater than 0."
        )


    # --------------------------------------------------------------
    # STEP 3: First split
    #
    # Separate training data from the temporary dataset.
    #
    # 80% -> Train
    # 20% -> Temporary
    # --------------------------------------------------------------

    groups = dataframe["question"]

    first_split = GroupShuffleSplit(
        n_splits=1,
        train_size=train_size,
        random_state=random_state
    )

    train_index, temp_index = next(
        first_split.split(
            dataframe,
            groups=groups
        )
    )

    train_df = dataframe.iloc[
        train_index
    ].copy()

    temp_df = dataframe.iloc[
        temp_index
    ].copy()


    # --------------------------------------------------------------
    # STEP 4: Split temporary dataset
    #
    # The remaining 20% is divided into:
    #
    # 10% -> Validation
    # 10% -> Test
    # --------------------------------------------------------------

    relative_validation_size = (
        validation_size
        / (validation_size + test_size)
    )

    temp_groups = temp_df["question"]

    second_split = GroupShuffleSplit(
        n_splits=1,
        train_size=relative_validation_size,
        random_state=random_state
    )

    validation_index, test_index = next(
        second_split.split(
            temp_df,
            groups=temp_groups
        )
    )

    validation_df = temp_df.iloc[
        validation_index
    ].copy()

    test_df = temp_df.iloc[
        test_index
    ].copy()


    # --------------------------------------------------------------
    # STEP 5: Reset indexes
    # --------------------------------------------------------------

    train_df = train_df.reset_index(
        drop=True
    )

    validation_df = validation_df.reset_index(
        drop=True
    )

    test_df = test_df.reset_index(
        drop=True
    )


    # --------------------------------------------------------------
    # STEP 6: Check for question leakage
    # --------------------------------------------------------------

    train_questions = set(
        train_df["question"]
    )

    validation_questions = set(
        validation_df["question"]
    )

    test_questions = set(
        test_df["question"]
    )

    train_validation_overlap = (
        train_questions
        & validation_questions
    )

    train_test_overlap = (
        train_questions
        & test_questions
    )

    validation_test_overlap = (
        validation_questions
        & test_questions
    )


    # --------------------------------------------------------------
    # STEP 7: Safety check
    #
    # GroupShuffleSplit should prevent identical questions from
    # appearing in different splits. If leakage is detected,
    # stop the pipeline rather than silently continuing.
    # --------------------------------------------------------------

    if (
        train_validation_overlap
        or train_test_overlap
        or validation_test_overlap
    ):
        raise RuntimeError(
            "Question leakage detected between dataset splits."
        )


    # --------------------------------------------------------------
    # STEP 8: Create splitting report
    # --------------------------------------------------------------

    total_records = len(dataframe)

    report = {

        "total_records":
            total_records,

        "train_records":
            len(train_df),

        "validation_records":
            len(validation_df),

        "test_records":
            len(test_df),

        "train_percentage": round(
            len(train_df)
            / total_records
            * 100,
            2
        ),

        "validation_percentage": round(
            len(validation_df)
            / total_records
            * 100,
            2
        ),

        "test_percentage": round(
            len(test_df)
            / total_records
            * 100,
            2
        ),

        "train_unique_questions":
            train_df["question"].nunique(),

        "validation_unique_questions":
            validation_df["question"].nunique(),

        "test_unique_questions":
            test_df["question"].nunique(),

        "train_validation_question_overlap":
            len(train_validation_overlap),

        "train_test_question_overlap":
            len(train_test_overlap),

        "validation_test_question_overlap":
            len(validation_test_overlap),

        "random_state":
            random_state,
    }

    return (
        train_df,
        validation_df,
        test_df,
        report
    )


# ------------------------------------------------------------------
# SAVE DATASET SPLITS
# ------------------------------------------------------------------

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