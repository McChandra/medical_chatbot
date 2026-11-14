"""CPU checks for a runnable, clean notebook; not a GPU execution claim."""
import ast
import json
import unittest
from pathlib import Path


class ColabNotebookTests(unittest.TestCase):
    def test_notebook_cells_compile_and_contain_no_saved_execution(self):
        notebooks = list(Path(__file__).parent.glob("*Colab.ipynb"))
        self.assertGreaterEqual(len(notebooks), 2)
        for path in notebooks:
            with self.subTest(notebook=path.name):
                notebook = json.loads(path.read_text())
                self.assertEqual(notebook["nbformat"], 4)
                ids = set()
                for index, cell in enumerate(notebook["cells"]):
                    self.assertNotIn(cell["id"], ids)
                    ids.add(cell["id"])
                    if cell["cell_type"] == "code":
                        source = "".join(cell["source"])
                        ast.parse(source, filename=f"{path.name}-cell-{index}")
                        compile(source, f"{path.name}-cell-{index}", "exec")
                        self.assertEqual(cell["outputs"], [])
                        self.assertIsNone(cell["execution_count"])


if __name__ == "__main__":
    unittest.main()
