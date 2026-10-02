"""
sampling.py

Purpose:
    Create a smaller sample from the cleaned MedQuAD dataset
    for development, testing, and low-cost experimentation.

Responsibilities:
    - Validate the input DataFrame
    - Randomly sample a fixed number of records
    - Make sampling reproducible using random_state
    - Generate a sampling report

Important:
    Sampling does NOT replace the final train/validation/test split.
"""

import pandas as pd


# ------------------------------------------------------------------
# PRIVATE HELPER: Validate DataFrame
# ------------------------------------------------------------------

def _validate_dataframe(dataframe: pd.DataFrame) -> None:
    """
    Validate the DataFrame before sampling.
    """

    if not isinstance(dataframe, pd.DataFrame):
        raise TypeError(
            "Sampling expects a Pandas DataFrame."
        )

    if dataframe.empty:
        raise ValueError(
            "Cannot sample from an empty DataFrame."
        )


# ------------------------------------------------------------------
# PUBLIC FUNCTION: Random Sampling
# ------------------------------------------------------------------

def random_sample(
    dataframe: pd.DataFrame,
    sample_size: int = 500,
    random_state: int = 42
) -> tuple[pd.DataFrame, dict]:
    """
    Create a reproducible random sample.

    Parameters
    ----------
    dataframe : pd.DataFrame
        Cleaned MedQuAD dataset.

    sample_size : int
        Number of records to select.
        Default = 500.

    random_state : int
        Random seed used for reproducibility.
        Default = 42.

    Returns
    -------
    sampled_df : pd.DataFrame
        Randomly sampled dataset.

    report : dict
        Summary of the sampling operation.
    """

    # --------------------------------------------------------------
    # STEP 1: Validate DataFrame
    # --------------------------------------------------------------

    _validate_dataframe(dataframe)


    # --------------------------------------------------------------
    # STEP 2: Validate sample size
    # --------------------------------------------------------------

    if not isinstance(sample_size, int):
        raise TypeError(
            "sample_size must be an integer."
        )

    if sample_size <= 0:
        raise ValueError(
            "sample_size must be greater than 0."
        )

    if sample_size > len(dataframe):
        raise ValueError(
            f"sample_size ({sample_size}) cannot be larger than "
            f"the dataset ({len(dataframe)} rows)."
        )


    # --------------------------------------------------------------
    # STEP 3: Random sampling
    # --------------------------------------------------------------

    sampled_df = dataframe.sample(
        n=sample_size,
        random_state=random_state
    )


    # --------------------------------------------------------------
    # STEP 4: Reset index
    # --------------------------------------------------------------

    sampled_df = sampled_df.reset_index(
        drop=True
    )


    # --------------------------------------------------------------
    # STEP 5: Create sampling report
    # --------------------------------------------------------------

    sample_percentage = (
        len(sampled_df) / len(dataframe)
    ) * 100

    report = {
        "sampling_method": "random_sampling",
        "original_rows": len(dataframe),
        "sampled_rows": len(sampled_df),
        "sample_percentage": round(
            sample_percentage,
            2
        ),
        "random_state": random_state,
    }


    # --------------------------------------------------------------
    # STEP 6: Return results
    # --------------------------------------------------------------

    return sampled_df, report