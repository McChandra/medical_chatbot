"""Exercise the notebook launcher with small child processes, without a GPU."""
import ast
from collections import deque
from contextlib import redirect_stdout
from datetime import datetime, timezone
import importlib.metadata
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock
import uuid


class TrainingLauncherTests(unittest.TestCase):
    def setUp(self):
        notebook = json.loads(Path(__file__).with_name('HealthBrowse_Llama_QLoRA_Colab.ipynb').read_text())
        source = ''.join(next(c for c in notebook['cells'] if c['id']=='hb-12')['source'])
        tree = ast.parse(source)
        helper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name=='run_training')
        namespace = dict(globals())
        exec(compile(ast.Module(body=[helper],type_ignores=[]),'training-cell','exec'),namespace)
        self.launch = namespace['run_training']

    def test_failure_includes_actual_child_traceback_and_redacts_known_token(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'HF_TOKEN':'test-secret-value'}):
            console = io.StringIO()
            with redirect_stdout(console), self.assertRaises(RuntimeError) as error:
                self.launch([sys.executable,'-c',
                             "import os; print(os.environ['HF_TOKEN']); raise ValueError('ACTUAL_TRAINING_ERROR')"],directory)
            self.assertIn('ValueError: ACTUAL_TRAINING_ERROR',str(error.exception))
            logs = list(Path(directory).glob('*.log'))
            self.assertEqual(len(logs),1)
            saved = logs[0].read_text()
            self.assertIn('ValueError: ACTUAL_TRAINING_ERROR',saved)
            self.assertIn('python',json.loads(saved.splitlines()[0]))
            for text in [saved,console.getvalue(),str(error.exception)]:
                self.assertNotIn('test-secret-value',text)
                self.assertIn('[REDACTED]',text)

    def test_success_and_repeated_runs_preserve_both_logs(self):
        with tempfile.TemporaryDirectory() as directory, redirect_stdout(io.StringIO()):
            first = self.launch([sys.executable,'-c',"print('completed')"],directory)
            second = self.launch([sys.executable,'-c',"print('another attempt')"],directory)
            self.assertNotEqual(first,second)
            self.assertIn('completed',first.read_text())
            self.assertIn('another attempt',second.read_text())

    def test_interrupt_stops_the_child_process(self):
        class InterruptedStream:
            def __iter__(self):
                raise KeyboardInterrupt
            def close(self):
                pass
        process = Mock(stdout=InterruptedStream())
        process.wait.side_effect = [subprocess.TimeoutExpired('python',10),0]
        with tempfile.TemporaryDirectory() as directory, patch('subprocess.Popen',return_value=process), redirect_stdout(io.StringIO()):
            with self.assertRaises(KeyboardInterrupt):
                self.launch([sys.executable,'-c','pass'],directory)
        process.terminate.assert_called_once()
        process.kill.assert_called_once()


if __name__=='__main__':
    unittest.main()
