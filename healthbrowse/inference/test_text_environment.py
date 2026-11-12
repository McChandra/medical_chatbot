"""Check dependency repair ordering and fresh-process failure reporting."""
import ast
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch


class TextEnvironmentTests(unittest.TestCase):
    def load_helper(self, modules=None):
        notebook = json.loads(Path(__file__).with_name('HealthBrowse_Llama_QLoRA_Colab.ipynb').read_text())
        source = ''.join(next(c for c in notebook['cells'] if c['id']=='hb-02')['source'])
        helper = next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='prepare_text_environment')
        namespace = {'subprocess':subprocess,'sys':SimpleNamespace(executable=sys.executable,modules=modules or {}),
                     'os':SimpleNamespace(environ={})}
        exec(compile(ast.Module(body=[helper],type_ignores=[]),'setup-cell','exec'),namespace)
        return namespace['prepare_text_environment'],namespace

    def test_removal_precedes_install_and_import_probe(self):
        helper,namespace = self.load_helper()
        done = subprocess.CompletedProcess([],0,stdout='Text training imports: OK\n')
        with patch('subprocess.run',return_value=done) as run, redirect_stdout(io.StringIO()):
            helper(Path('requirements.txt'))
        commands = [c.args[0] for c in run.call_args_list]
        self.assertEqual(commands[0][1:],['-m','pip','uninstall','-y','torchvision','torchaudio'])
        self.assertEqual(commands[1][1:4],['-m','pip','install'])
        self.assertEqual(commands[2][1],'-c')
        self.assertIn('Trainer',commands[2][2])
        self.assertIn('peft',commands[2][2])
        self.assertIn('bitsandbytes',commands[2][2])
        self.assertEqual(namespace['os'].environ,{'USE_TF':'0','USE_FLAX':'0'})

    def test_underlying_import_error_survives(self):
        helper,_ = self.load_helper()
        ok = subprocess.CompletedProcess([],0,stdout='')
        failure = subprocess.CompletedProcess([],1,stdout='RuntimeError: operator torchvision::nms does not exist')
        with patch('subprocess.run',side_effect=[ok,ok,failure]), redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'torchvision::nms'):
                helper('requirements.txt')

    def test_cached_modules_require_restart_after_repair(self):
        helper,_ = self.load_helper({'transformers':object()})
        done = subprocess.CompletedProcess([],0,stdout='Text training imports: OK\n')
        with patch('subprocess.run',return_value=done), redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'Restart session'):
                helper('requirements.txt')


if __name__=='__main__':
    unittest.main()
