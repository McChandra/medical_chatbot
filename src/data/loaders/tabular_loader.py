"""
tabular_loader.py

Purpose:
    Load tabular data files into Pandas DataFrames.

Currently supported:
    - CSV
    - Excel (.xlsx)

This module is responsible only for READING tabular data.

Cleaning, duplicate removal, missing-value handling, and other
transformations belong in preprocessing.py.
"""

from pathlib import Path

import pandas as pd


# ------------------------------------------------------------------
# SUPPORTED TABULAR FORMATS
# ------------------------------------------------------------------

SUPPORTED_TABULAR_TYPES = {
    ".csv",
    ".xlsx",
}


# ------------------------------------------------------------------
# PUBLIC FUNCTION
# ------------------------------------------------------------------

def load_tabular(file_path: str | Path) -> pd.DataFrame:
    """
    Load a tabular file into a Pandas DataFrame.

    Parameters
    ----------
    file_path : str | Path
        Path to the CSV or Excel file.

    Returns
    -------
    pd.DataFrame
        Loaded tabular dataset.
    """

    # Convert input into a Path object.
    path = Path(file_path)

    # --------------------------------------------------------------
    # STEP 1: Check whether file exists
    # --------------------------------------------------------------

    if not path.exists():

        raise FileNotFoundError(
            f"File does not exist: {file_path}"
        )

    # --------------------------------------------------------------
    # STEP 2: Make sure input is actually a file
    # --------------------------------------------------------------

    if not path.is_file():

        raise ValueError(
            f"Expected a file but received: {file_path}"
        )

    # --------------------------------------------------------------
    # STEP 3: Detect file extension
    # --------------------------------------------------------------

    extension = path.suffix.lower()

    # --------------------------------------------------------------
    # STEP 4: Check whether format is supported
    # --------------------------------------------------------------

    if extension not in SUPPORTED_TABULAR_TYPES:

        raise ValueError(
            f"Unsupported tabular format: {extension}"
        )

    # --------------------------------------------------------------
    # STEP 5: Load according to file format
    # --------------------------------------------------------------

    if extension == ".csv":

        dataframe = pd.read_csv(path)

    elif extension == ".xlsx":

        dataframe = pd.read_excel(path)

    # --------------------------------------------------------------
    # STEP 6: Return DataFrame
    # --------------------------------------------------------------

    return dataframe