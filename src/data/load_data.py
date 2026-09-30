"""
load_data.py

Purpose:
    Discover and classify raw data files.

The input can be:
    - A single file
    - A folder
    - A folder containing subfolders

This module DOES NOT read the contents of the files.
Actual file reading is handled by modules inside:
    src/data/loaders/
"""

from pathlib import Path


# ------------------------------------------------------------------
# FILE TYPE DEFINITIONS
# ------------------------------------------------------------------

# Each category contains the file extensions that belong to it.
#
# We define future formats here even though their loaders are not
# implemented yet. This allows the discovery layer to recognize them.

FILE_TYPES = {
    "tabular": {".csv", ".xlsx"},
    "json": {".json"},
    "parquet": {".parquet"},
    "document": {".pdf", ".txt", ".doc", ".docx"},
    "image": {".jpg", ".jpeg", ".png", ".dcm"},
}


# ------------------------------------------------------------------
# PUBLIC FUNCTION
# ------------------------------------------------------------------

def discover_data(input_path: str) -> dict:
    """
    Discover and classify files from a file or directory.

    Parameters
    ----------
    input_path : str
        Path to either:
        - a single file
        - a directory containing files/subdirectories

    Returns
    -------
    dict
        Dictionary containing discovered files grouped by type.

    Example
    -------
    {
        "tabular": [Path("data/raw/medquad.csv")],
        "json": [],
        "parquet": [],
        "document": [],
        "image": [],
        "unsupported": []
    }
    """

    # Convert the supplied string path into a Path object.
    path = Path(input_path)

    # --------------------------------------------------------------
    # STEP 1: Check whether the path exists
    # --------------------------------------------------------------

    if not path.exists():
        raise FileNotFoundError(
            f"Path does not exist: {input_path}"
        )

    # --------------------------------------------------------------
    # STEP 2: Determine whether input is a file or folder
    # --------------------------------------------------------------

    if path.is_file():

        # User provided one file.
        files = [path]

    elif path.is_dir():

        # User provided a folder.
        #
        # rglob("*") recursively searches the folder AND all
        # subfolders.
        files = [
            file
            for file in path.rglob("*")
            if file.is_file()
        ]

    else:

        raise ValueError(
            f"Input must be a file or directory: {input_path}"
        )

    # --------------------------------------------------------------
    # STEP 3: Prepare classification result
    # --------------------------------------------------------------

    discovered_files = {
        "tabular": [],
        "json": [],
        "parquet": [],
        "document": [],
        "image": [],
        "unsupported": [],
    }

    # --------------------------------------------------------------
    # STEP 4: Classify every discovered file
    # --------------------------------------------------------------

    for file in files:

        # Example:
        #
        # medquad.csv
        #       ↓
        # ".csv"
        #
        # lower() also handles .CSV, .Csv, etc.
        extension = file.suffix.lower()

        # Assume the file hasn't been recognized yet.
        file_matched = False

        # Check the extension against every category.
        for file_type, extensions in FILE_TYPES.items():

            if extension in extensions:

                discovered_files[file_type].append(file)

                file_matched = True

                # We found its category, so there is no reason
                # to continue checking other categories.
                break

        # If no category matched, record it as unsupported.
        if not file_matched:
            discovered_files["unsupported"].append(file)

    # --------------------------------------------------------------
    # STEP 5: Return discovered files
    # --------------------------------------------------------------

    return discovered_files


# ------------------------------------------------------------------
# MANUAL TEST
# ------------------------------------------------------------------

if __name__ == "__main__":

    # Ask the user for either a file or folder.
    user_path = input(
        "Enter the path to a raw data file or folder: "
    )

    try:

        result = discover_data(user_path)

        print("\nDATA DISCOVERY RESULTS")
        print("-" * 50)

        # Display every category and the files discovered inside it.
        for category, files in result.items():

            print(f"\n{category.upper()}: {len(files)} file(s)")

            for file in files:
                print(f"  - {file}")

    except (FileNotFoundError, ValueError) as error:

        print(f"\nError: {error}")