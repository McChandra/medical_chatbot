"""
preprocessing.py

Purpose:
    Validate and clean loaded tabular data before EDA and
    feature engineering.

Responsibilities:
    - Validate the input DataFrame
    - Remove completely empty rows
    - Remove duplicate rows
    - Clean column names
    - Clean text columns
    - Validate required Q&A fields
    - Handle missing metadata
    - Report preprocessing statistics
"""

import re
import pandas as pd


# ------------------------------------------------------------------
# PRIVATE HELPER: Clean column names
# ------------------------------------------------------------------

def _clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardize DataFrame column names.

    Example:
        "Question Type" -> "question_type"
        " Answer "      -> "answer"
    """

    df = df.copy()

    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(" ", "_", regex=False)
    )

    return df


# ------------------------------------------------------------------
# PRIVATE HELPER: Clean text
# ------------------------------------------------------------------

def _clean_text(value):
    """
    Perform conservative text cleaning.

    The goal is NOT to aggressively modify medical text.

    Operations:
        - Strip leading/trailing whitespace
        - Replace repeated whitespace with one space
    """

    # Keep missing values unchanged.
    if pd.isna(value):
        return value

    # Only clean strings.
    if not isinstance(value, str):
        return value

    # Remove leading/trailing whitespace.
    value = value.strip()

    # Replace multiple spaces, tabs, and newlines with one space.
    value = re.sub(r"\s+", " ", value)

    return value


# ------------------------------------------------------------------
# PUBLIC FUNCTION
# ------------------------------------------------------------------

def preprocess_data(
    dataframe: pd.DataFrame
) -> tuple[pd.DataFrame, dict]:
    """
    Clean and validate the MedQuAD tabular dataset.

    Parameters
    ----------
    dataframe : pd.DataFrame
        Raw DataFrame returned by the tabular loader.

    Returns
    -------
    cleaned_df : pd.DataFrame
        Cleaned dataset.

    report : dict
        Summary of preprocessing operations.
    """

    # --------------------------------------------------------------
    # STEP 1: Validate input
    # --------------------------------------------------------------

    if not isinstance(dataframe, pd.DataFrame):
        raise TypeError(
            "preprocess_data() expects a Pandas DataFrame."
        )

    if dataframe.empty:
        raise ValueError(
            "The supplied DataFrame is empty."
        )

    # Work on a copy so the original raw DataFrame is unchanged.
    df = dataframe.copy()

    original_rows = len(df)
    original_columns = len(df.columns)


    # --------------------------------------------------------------
    # STEP 2: Clean column names
    # --------------------------------------------------------------

    df = _clean_column_names(df)


    # --------------------------------------------------------------
    # STEP 3: Remove completely empty rows
    # --------------------------------------------------------------

    empty_rows = int(
        df.isna().all(axis=1).sum()
    )

    df = df.dropna(how="all")


    # --------------------------------------------------------------
    # STEP 4: Remove exact duplicate rows
    # --------------------------------------------------------------

    duplicate_rows = int(
        df.duplicated().sum()
    )

    df = df.drop_duplicates()


    # --------------------------------------------------------------
    # STEP 5: Clean text columns
    # --------------------------------------------------------------

    text_columns = df.select_dtypes(
        include=["object", "string"]
    ).columns

    for column in text_columns:
        df[column] = df[column].map(_clean_text)


    # --------------------------------------------------------------
    # STEP 6: Validate required Q&A columns
    # --------------------------------------------------------------

    # These columns are essential for supervised Q&A training.
    required_columns = [
        "question",
        "answer"
    ]

    missing_required_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_required_columns:
        raise ValueError(
            f"Required columns are missing: "
            f"{missing_required_columns}"
        )


    # --------------------------------------------------------------
    # STEP 7: Count missing required values
    # --------------------------------------------------------------

    missing_questions = int(
        df["question"].isna().sum()
    )

    missing_answers = int(
        df["answer"].isna().sum()
    )


    # --------------------------------------------------------------
    # STEP 8: Remove rows with missing question/answer
    # --------------------------------------------------------------

    # A Q&A training example is unusable if either the input question
    # or target answer is missing.

    df = df.dropna(
        subset=["question", "answer"]
    )


    # --------------------------------------------------------------
    # STEP 9: Remove empty question/answer strings
    # --------------------------------------------------------------

    # NaN is not the only form of missing data.
    # A value containing only spaces becomes "" after _clean_text().

    empty_questions = int(
        df["question"]
        .astype("string")
        .str.strip()
        .eq("")
        .sum()
    )

    empty_answers = int(
        df["answer"]
        .astype("string")
        .str.strip()
        .eq("")
        .sum()
    )

    df = df[
        df["question"].astype("string").str.strip().ne("")
        &
        df["answer"].astype("string").str.strip().ne("")
    ]


    # --------------------------------------------------------------
    # STEP 10: Handle missing focus_area metadata
    # --------------------------------------------------------------

    # focus_area is useful metadata, but it is not required to form
    # a valid question-answer pair.
    #
    # Therefore, preserve the row and label missing values "Unknown".

    if "focus_area" in df.columns:

        missing_focus_areas = int(
            df["focus_area"].isna().sum()
        )

        df["focus_area"] = (
            df["focus_area"]
            .fillna("Unknown")
        )

    else:
        missing_focus_areas = 0


    # --------------------------------------------------------------
    # STEP 11: Reset index
    # --------------------------------------------------------------

    df = df.reset_index(drop=True)


    # --------------------------------------------------------------
    # STEP 12: Create preprocessing report
    # --------------------------------------------------------------

    report = {
        "original_rows": original_rows,
        "final_rows": len(df),
        "rows_removed": original_rows - len(df),

        "original_columns": original_columns,
        "final_columns": len(df.columns),

        "empty_rows_found": empty_rows,
        "duplicate_rows_found": duplicate_rows,

        "missing_questions_removed": missing_questions,
        "missing_answers_removed": missing_answers,

        "empty_questions_removed": empty_questions,
        "empty_answers_removed": empty_answers,

        "missing_focus_areas_filled": missing_focus_areas,

        "text_columns_cleaned": text_columns.tolist(),

        "remaining_missing_values": int(
            df.isna().sum().sum()
        ),
    }

    return df, report