"""
document_loader.py

Purpose:
    Extract text from supported document files.

Currently supported:
    - TXT
    - PDF
    - DOCX

Output:
    str containing the extracted document text.

Important:
    This loader extracts text only.
    Text cleaning and NLP preprocessing belong in preprocessing.py.
"""

from pathlib import Path

from pypdf import PdfReader
from docx import Document


SUPPORTED_DOCUMENT_TYPES = {
    ".txt",
    ".pdf",
    ".docx",
}


def load_document(file_path: str | Path) -> str:
    """
    Load and extract text from a document.

    Parameters
    ----------
    file_path : str | Path
        Path to TXT, PDF, or DOCX document.

    Returns
    -------
    str
        Extracted document text.
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
    # STEP 2: Check that the path represents a file
    # --------------------------------------------------------------

    if not path.is_file():
        raise ValueError(
            f"Expected a file but received: {file_path}"
        )

    # --------------------------------------------------------------
    # STEP 3: Detect and validate extension
    # --------------------------------------------------------------

    extension = path.suffix.lower()

    if extension not in SUPPORTED_DOCUMENT_TYPES:
        raise ValueError(
            f"Unsupported document format: {extension}"
        )

    # --------------------------------------------------------------
    # STEP 4: TXT
    # --------------------------------------------------------------

    if extension == ".txt":

        text = path.read_text(
            encoding="utf-8"
        )

    # --------------------------------------------------------------
    # STEP 5: PDF
    # --------------------------------------------------------------

    elif extension == ".pdf":

        reader = PdfReader(path)

        pages = []

        for page in reader.pages:

            page_text = page.extract_text()

            # Some PDF pages may contain no extractable text.
            if page_text:
                pages.append(page_text)

        text = "\n".join(pages)

    # --------------------------------------------------------------
    # STEP 6: DOCX
    # --------------------------------------------------------------

    elif extension == ".docx":

        document = Document(path)

        paragraphs = []

        for paragraph in document.paragraphs:

            if paragraph.text:
                paragraphs.append(
                    paragraph.text
                )

        text = "\n".join(paragraphs)

    # --------------------------------------------------------------
    # STEP 7: Return extracted text
    # --------------------------------------------------------------

    return text