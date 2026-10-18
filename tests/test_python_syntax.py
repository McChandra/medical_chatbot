import ast
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

SOURCE_DIRECTORIES = [
    "backend",
    "frontend",
    "features",
    "models",
    "src",
]


def test_project_python_syntax():
    python_files = []

    for directory in SOURCE_DIRECTORIES:
        source_path = PROJECT_ROOT / directory

        if source_path.exists():
            python_files.extend(source_path.rglob("*.py"))

    assert python_files, "No Python source files found."

    for file_path in python_files:
        source = file_path.read_text(encoding="utf-8")
        ast.parse(source, filename=str(file_path))
