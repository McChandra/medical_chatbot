"""
json_loader.py

Purpose:
    Load JSON data from a JSON file.

The loader returns the original Python data structure rather than
automatically converting everything into a Pandas DataFrame.

Possible outputs:
    - dict
    - list

Any later transformation into tabular data belongs in preprocessing.
"""

from pathlib import Path
import json


SUPPORTED_JSON_TYPES = {
    ".json",
}


def load_json(file_path: str | Path):
    """
    Load a JSON file.

    Parameters
    ----------
    file_path : str | Path
        Path to the JSON file.

    Returns
    -------
    dict | list
        Parsed JSON data.
    """

    # Convert the input into a Path object.
    path = Path(file_path)

    # --------------------------------------------------------------
    # STEP 1: Check whether the file exists
    # --------------------------------------------------------------

    if not path.exists():
        raise FileNotFoundError(
            f"File does not exist: {file_path}"
        )

    # --------------------------------------------------------------
    # STEP 2: Check whether the path is actually a file
    # --------------------------------------------------------------

    if not path.is_file():
        raise ValueError(
            f"Expected a file but received: {file_path}"
        )

    # --------------------------------------------------------------
    # STEP 3: Check the file extension
    # --------------------------------------------------------------

    extension = path.suffix.lower()

    if extension not in SUPPORTED_JSON_TYPES:
        raise ValueError(
            f"Unsupported JSON format: {extension}"
        )

    # --------------------------------------------------------------
    # STEP 4: Open and parse JSON
    # --------------------------------------------------------------

    with path.open(
        mode="r",
        encoding="utf-8"
    ) as file:

        data = json.load(file)

    # --------------------------------------------------------------
    # STEP 5: Return parsed JSON
    # --------------------------------------------------------------

    return data