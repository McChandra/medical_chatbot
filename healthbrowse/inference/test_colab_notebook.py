"""CPU checks for a runnable, clean notebook; not a GPU execution claim."""
import ast
import json
import unittest
from pathlib import Path


class ColabNotebookTests(unittest.TestCase):
    def test_notebook_cells_compile_and_contain_no_saved_execution(self):
        notebook = json.loads(Path(__file__).with_name("HealthBrowse_Llama_QLoRA_Colab.ipynb").read_text())
        self.assertEqual(notebook["nbformat"], 4)
        ids = set()
        for index, cell in enumerate(notebook["cells"]):
            self.assertNotIn(cell["id"], ids)
            ids.add(cell["id"])
            if cell["cell_type"] == "code":
                source = "".join(cell["source"])
                ast.parse(source, filename=f"colab-cell-{index}")
                compile(source, f"colab-cell-{index}", "exec")
                self.assertEqual(cell["outputs"], [])
                self.assertIsNone(cell["execution_count"])


if __name__ == "__main__":
    unittest.main()
