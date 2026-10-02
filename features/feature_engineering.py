"""
feature_engineering.py

Purpose:
    Prepare the cleaned MedQuAD dataset for FLAN-T5 model training.

Responsibilities:
    - Validate required model features
    - Construct FLAN-T5 input text
    - Construct target text
    - Load the FLAN-T5 tokenizer
    - Calculate input and target token lengths
    - Analyze token-length distributions
    - Analyze the impact of sequence-length truncation

Future responsibilities:
    - Tokenize model inputs and targets
    - Create train/validation/test splits

Important:
    This module prepares data for model training.
    It does NOT train the model.
"""

import pandas as pd

from transformers import AutoTokenizer


# ------------------------------------------------------------------
# REQUIRED COLUMNS
# ------------------------------------------------------------------

REQUIRED_COLUMNS = [
    "question",
    "answer"
]


# ------------------------------------------------------------------
# SEQUENCE LENGTH CONFIGURATION
# ------------------------------------------------------------------

# Our 500-record development sample had a maximum input length
# of 38 tokens.
#
# 64 tokens therefore provides sufficient room for the current
# FLAN-T5 input format.
MAX_INPUT_LENGTH = 64


# Our initial development baseline for target answers.
#
# Analysis of the 500-record sample showed:
#
#   > 128 tokens  = 69.00%
#   > 256 tokens  = 43.80%
#   > 512 tokens  = 14.20%
#   > 768 tokens  =  6.60%
#   > 1024 tokens =  3.40%
#   > 2048 tokens =  0.80%
#
# Therefore, 512 tokens is selected as an initial balance between
# answer coverage and computational cost.
#
# This is a development configuration and can be changed after
# further experimentation.
MAX_TARGET_LENGTH = 512


# ------------------------------------------------------------------
# VALIDATE DATAFRAME
# ------------------------------------------------------------------

def _validate_dataframe(
    dataframe: pd.DataFrame
) -> None:
    """
    Validate that the supplied DataFrame contains the
    information required for model preparation.
    """

    if not isinstance(dataframe, pd.DataFrame):
        raise TypeError(
            "Feature engineering expects a Pandas DataFrame."
        )

    if dataframe.empty:
        raise ValueError(
            "Cannot perform feature engineering on an empty DataFrame."
        )

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in dataframe.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Required columns are missing: {missing_columns}"
        )


# ------------------------------------------------------------------
# CREATE MODEL TEXT FEATURES
# ------------------------------------------------------------------

def create_text_features(
    dataframe: pd.DataFrame
) -> pd.DataFrame:
    """
    Construct the input and target text used by FLAN-T5.

    Input:
        answer medical question: <question>

    Target:
        <answer>

    The original columns are preserved so that metadata such as
    source and focus_area remains available for later analysis.
    """

    _validate_dataframe(dataframe)

    # Work on a copy so the original DataFrame is not modified.
    df = dataframe.copy()

    # --------------------------------------------------------------
    # INPUT FEATURE
    # --------------------------------------------------------------

    df["input_text"] = (
        "answer medical question: "
        + df["question"].astype(str)
    )

    # --------------------------------------------------------------
    # TARGET FEATURE
    # --------------------------------------------------------------

    df["target_text"] = (
        df["answer"].astype(str)
    )

    return df


# ------------------------------------------------------------------
# LOAD TOKENIZER
# ------------------------------------------------------------------

def load_tokenizer(
    model_name: str = "google/flan-t5-small"
):
    """
    Load the tokenizer associated with the FLAN-T5 model.

    FLAN-T5 Small is used initially because it is appropriate
    for low-cost development and pipeline testing.
    """

    tokenizer = AutoTokenizer.from_pretrained(
        model_name
    )

    return tokenizer


# ------------------------------------------------------------------
# ADD TOKEN LENGTH FEATURES
# ------------------------------------------------------------------

def add_token_length_features(
    dataframe: pd.DataFrame,
    tokenizer
) -> pd.DataFrame:
    """
    Calculate the number of FLAN-T5 tokens required for each
    model input and target.

    No truncation is applied here because the purpose is to
    understand the real token-length distribution before
    applying sequence-length limits.
    """

    required_columns = [
        "input_text",
        "target_text"
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in dataframe.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Missing model text columns: {missing_columns}"
        )

    df = dataframe.copy()

    # --------------------------------------------------------------
    # INPUT TOKEN LENGTH
    # --------------------------------------------------------------

    df["input_token_length"] = (
        df["input_text"]
        .apply(
            lambda text: len(
                tokenizer.encode(
                    text,
                    add_special_tokens=True,
                    truncation=False
                )
            )
        )
    )

    # --------------------------------------------------------------
    # TARGET TOKEN LENGTH
    # --------------------------------------------------------------

    df["target_token_length"] = (
        df["target_text"]
        .apply(
            lambda text: len(
                tokenizer.encode(
                    text,
                    add_special_tokens=True,
                    truncation=False
                )
            )
        )
    )

    return df


# ------------------------------------------------------------------
# TOKEN LENGTH ANALYSIS
# ------------------------------------------------------------------

def token_length_analysis(
    dataframe: pd.DataFrame,
    column: str
) -> dict:
    """
    Analyze a token-length feature.

    Useful for:
        input_token_length
        target_token_length
    """

    if column not in dataframe.columns:
        raise ValueError(
            f"Column '{column}' does not exist."
        )

    lengths = dataframe[column]

    statistics = {

        "count": int(
            lengths.count()
        ),

        "minimum": int(
            lengths.min()
        ),

        "maximum": int(
            lengths.max()
        ),

        "mean": round(
            float(lengths.mean()),
            2
        ),

        "median": float(
            lengths.median()
        ),

        "90th_percentile": float(
            lengths.quantile(0.90)
        ),

        "95th_percentile": float(
            lengths.quantile(0.95)
        ),

        "99th_percentile": float(
            lengths.quantile(0.99)
        ),
    }

    return statistics


# ------------------------------------------------------------------
# TRUNCATION ANALYSIS
# ------------------------------------------------------------------

def truncation_analysis(
    dataframe: pd.DataFrame,
    input_limit: int = MAX_INPUT_LENGTH,
    target_limit: int = MAX_TARGET_LENGTH
) -> dict:
    """
    Analyze the impact of the selected sequence-length limits.

    The function checks how many input and target sequences exceed
    the configured limits.

    Important:
        This function DOES NOT truncate or modify the dataset.

        It only reports how many records WOULD require truncation
        during model tokenization.

    Parameters
    ----------
    dataframe : pd.DataFrame
        Feature-engineered MedQuAD dataset containing:
            - input_token_length
            - target_token_length

    input_limit : int
        Maximum number of input tokens.
        Default = MAX_INPUT_LENGTH (64).

    target_limit : int
        Maximum number of target tokens.
        Default = MAX_TARGET_LENGTH (512).

    Returns
    -------
    report : dict
        Summary of the expected truncation impact.
    """

    # --------------------------------------------------------------
    # STEP 1: Validate DataFrame
    # --------------------------------------------------------------

    if not isinstance(dataframe, pd.DataFrame):
        raise TypeError(
            "truncation_analysis() expects a Pandas DataFrame."
        )

    if dataframe.empty:
        raise ValueError(
            "Cannot perform truncation analysis on an empty DataFrame."
        )

    # --------------------------------------------------------------
    # STEP 2: Validate required token-length columns
    # --------------------------------------------------------------

    required_columns = [
        "input_token_length",
        "target_token_length"
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in dataframe.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Required token-length columns are missing: "
            f"{missing_columns}"
        )

    # --------------------------------------------------------------
    # STEP 3: Validate limits
    # --------------------------------------------------------------

    if input_limit <= 0:
        raise ValueError(
            "input_limit must be greater than 0."
        )

    if target_limit <= 0:
        raise ValueError(
            "target_limit must be greater than 0."
        )

    # --------------------------------------------------------------
    # STEP 4: Count records exceeding limits
    # --------------------------------------------------------------

    total_records = len(dataframe)

    input_exceeded = int(
        (
            dataframe["input_token_length"]
            > input_limit
        ).sum()
    )

    target_exceeded = int(
        (
            dataframe["target_token_length"]
            > target_limit
        ).sum()
    )

    # --------------------------------------------------------------
    # STEP 5: Calculate records fitting within limits
    # --------------------------------------------------------------

    inputs_fitting = (
        total_records - input_exceeded
    )

    targets_fitting = (
        total_records - target_exceeded
    )

    # --------------------------------------------------------------
    # STEP 6: Create truncation report
    # --------------------------------------------------------------

    report = {

        "total_records": total_records,

        # Input analysis
        "max_input_length": input_limit,

        "inputs_exceeding_limit":
            input_exceeded,

        "inputs_fitting_limit":
            inputs_fitting,

        "input_truncation_percentage": round(
            (input_exceeded / total_records) * 100,
            2
        ),

        "input_coverage_percentage": round(
            (inputs_fitting / total_records) * 100,
            2
        ),

        # Target analysis
        "max_target_length": target_limit,

        "targets_exceeding_limit":
            target_exceeded,

        "targets_fitting_limit":
            targets_fitting,

        "target_truncation_percentage": round(
            (target_exceeded / total_records) * 100,
            2
        ),

        "target_coverage_percentage": round(
            (targets_fitting / total_records) * 100,
            2
        ),
    }

    return report