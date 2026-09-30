"""
Data loader package.
"""

from .tabular_loader import load_tabular
from .json_loader import load_json
from .parquet_loader import load_parquet
from .document_loader import load_document
from .image_loader import load_image


__all__ = [
    "load_tabular",
    "load_json",
    "load_parquet",
    "load_document",
    "load_image",
]