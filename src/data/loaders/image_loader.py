"""
image_loader.py

Purpose:
    Load standard image files and medical DICOM files.

Currently recognized:
    - JPG
    - JPEG
    - PNG
    - DICOM (.dcm)

Important:
    This loader only reads the image.

    Operations such as:
        - resizing
        - normalization
        - augmentation
        - MRI-specific preprocessing

    should be implemented separately.
"""

from pathlib import Path

from PIL import Image
import pydicom


STANDARD_IMAGE_TYPES = {
    ".jpg",
    ".jpeg",
    ".png",
}

MEDICAL_IMAGE_TYPES = {
    ".dcm",
}

SUPPORTED_IMAGE_TYPES = (
    STANDARD_IMAGE_TYPES
    | MEDICAL_IMAGE_TYPES
)


def load_image(file_path: str | Path):
    """
    Load a standard image or DICOM medical image.

    Parameters
    ----------
    file_path : str | Path
        Path to an image.

    Returns
    -------
    PIL.Image.Image
        For JPG, JPEG, or PNG.

    pydicom.dataset.FileDataset
        For DICOM files.
    """

    path = Path(file_path)

    # --------------------------------------------------------------
    # STEP 1: Check whether file exists
    # --------------------------------------------------------------

    if not path.exists():
        raise FileNotFoundError(
            f"File does not exist: {file_path}"
        )

    # --------------------------------------------------------------
    # STEP 2: Check that input is a file
    # --------------------------------------------------------------

    if not path.is_file():
        raise ValueError(
            f"Expected a file but received: {file_path}"
        )

    # --------------------------------------------------------------
    # STEP 3: Detect extension
    # --------------------------------------------------------------

    extension = path.suffix.lower()

    if extension not in SUPPORTED_IMAGE_TYPES:
        raise ValueError(
            f"Unsupported image format: {extension}"
        )

    # --------------------------------------------------------------
    # STEP 4: Standard image
    # --------------------------------------------------------------

    if extension in STANDARD_IMAGE_TYPES:

        image = Image.open(path)

        return image

    # --------------------------------------------------------------
    # STEP 5: Medical DICOM image
    # --------------------------------------------------------------

    if extension in MEDICAL_IMAGE_TYPES:

        dicom_data = pydicom.dcmread(path)

        return dicom_data