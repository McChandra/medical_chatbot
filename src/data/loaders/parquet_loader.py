"""
parquet_loader.py

Purpose:
    Load Apache Parquet files into Pandas DataFrames.

Parquet is useful for efficiently storing larger structured datasets.

Primary engine:
    PyArrow

Fallback engine:
    FastParquet
"""

from pathlib import Path
import pandas as pd


def load_parquet(file_path: str | Path) -> pd.DataFrame:
    """
    Load a Parquet file and return it as a Pandas DataFrame.

    The function first attempts to read the file using PyArrow.

    If PyArrow cannot read the file because of a compatibility issue,
    FastParquet is used as a fallback.

    Parameters
    ----------
    file_path : str | Path
        Path to the Parquet file.

    Returns
    -------
    pd.DataFrame
        Loaded Parquet dataset.
    """

    # --------------------------------------------------------------
    # STEP 1: Convert input into a Path object
    # --------------------------------------------------------------

    path = Path(file_path)


    # --------------------------------------------------------------
    # STEP 2: Check whether the file exists
    # --------------------------------------------------------------

    if not path.exists():
        raise FileNotFoundError(
            f"File does not exist: {file_path}"
        )


    # --------------------------------------------------------------
    # STEP 3: Make sure the path points to a file
    # --------------------------------------------------------------

    if not path.is_file():
        raise ValueError(
            f"Expected a file: {file_path}"
        )


    # --------------------------------------------------------------
    # STEP 4: Validate the file extension
    # --------------------------------------------------------------

    if path.suffix.lower() != ".parquet":
        raise ValueError(
            f"Expected a .parquet file, received: {path.suffix}"
        )


    # --------------------------------------------------------------
    # STEP 5: Try loading with PyArrow
    # --------------------------------------------------------------

    try:

        dataframe = pd.read_parquet(
            path,
            engine="pyarrow"
        )

        print(
            f"Parquet loaded successfully using PyArrow: {path.name}"
        )

        return dataframe


    # --------------------------------------------------------------
    # STEP 6: If PyArrow fails, try FastParquet
    # --------------------------------------------------------------

    except Exception as pyarrow_error:

        print(
            f"PyArrow could not load {path.name}."
        )

        print(
            f"Reason: {pyarrow_error}"
        )

        print(
            "Trying FastParquet..."
        )


    # --------------------------------------------------------------
    # STEP 7: FastParquet fallback
    # --------------------------------------------------------------

    try:

        dataframe = pd.read_parquet(
            path,
            engine="fastparquet"
        )

        print(
            f"Parquet loaded successfully using FastParquet: {path.name}"
        )

        return dataframe


    # --------------------------------------------------------------
    # STEP 8: Both engines failed
    # --------------------------------------------------------------

    except Exception as fastparquet_error:

        raise RuntimeError(
            f"\nUnable to load Parquet file: {path}\n\n"
            f"PyArrow error:\n"
            f"{pyarrow_error}\n\n"
            f"FastParquet error:\n"
            f"{fastparquet_error}"
        ) from fastparquet_error