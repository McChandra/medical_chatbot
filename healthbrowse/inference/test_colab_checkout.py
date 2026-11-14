"""Exercise the notebook's actual checkout helper against a local Git repository."""
import ast
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class ColabCheckoutTests(unittest.TestCase):
    def setUp(self):
        notebook = json.loads(Path(__file__).with_name('HealthBrowse_Llama_QLoRA_Colab.ipynb').read_text())
        source = ''.join(next(c for c in notebook['cells'] if c['id']=='hb-02')['source'])
        tree = ast.parse(source)
        helper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name=='ensure_checkout')
        namespace = {'Path':Path,'subprocess':subprocess,'tempfile':tempfile,'re':re}
        exec(compile(ast.Module(body=[helper],type_ignores=[]),'checkout-cell','exec'),namespace)
        self.checkout = namespace['ensure_checkout']
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.origin = root/'origin'; self.origin.mkdir()
        self.cache = root/'content'
        subprocess.run(['git','init','--quiet',str(self.origin)],check=True)
        (self.origin/'prepare_research_data.py').write_text('# test source\n')
        subprocess.run(['git','-C',str(self.origin),'add','.'],check=True)
        subprocess.run(['git','-C',str(self.origin),'-c','user.name=Test','-c','user.email=test@example.invalid',
                        'commit','--quiet','-m','Test source'],check=True)
        self.commit = subprocess.check_output(['git','-C',str(self.origin),'rev-parse','HEAD'],text=True).strip()

    def test_preserves_stale_folder_and_reuses_the_exact_pinned_checkout(self):
        old = self.cache/'medical_chatbot'; old.mkdir(parents=True)
        (old/'local-work.txt').write_text('keep this')
        repo = self.checkout(self.cache,self.commit,str(self.origin))
        self.assertEqual((old/'local-work.txt').read_text(),'keep this')
        self.assertTrue((repo/'prepare_research_data.py').is_file())
        # Add a later remote commit; repeat must stay at the pinned revision.
        (self.origin/'new.txt').write_text('new remote work')
        subprocess.run(['git','-C',str(self.origin),'add','.'],check=True)
        subprocess.run(['git','-C',str(self.origin),'-c','user.name=Test','-c','user.email=test@example.invalid',
                        'commit','--quiet','-m','Later source'],check=True)
        self.assertEqual(self.checkout(self.cache,self.commit,str(self.origin)),repo)
        self.assertFalse((repo/'new.txt').exists())
        (repo/'local-work.txt').write_text('preserve changes')
        with self.assertRaisesRegex(RuntimeError,'local edits'):
            self.checkout(self.cache,self.commit,str(self.origin))
        self.assertEqual((repo/'local-work.txt').read_text(),'preserve changes')

    def test_failed_download_is_retryable_without_a_partial_final_directory(self):
        with patch('subprocess.run',side_effect=subprocess.CalledProcessError(1,['git'])):
            with self.assertRaises(subprocess.CalledProcessError):
                self.checkout(self.cache,self.commit,str(self.origin))
        self.assertEqual(list(self.cache.iterdir()),[])
        repo = self.checkout(self.cache,self.commit,str(self.origin))
        self.assertTrue((repo/'prepare_research_data.py').is_file())

    def test_unversioned_files_and_invalid_source_refs_are_preserved(self):
        with self.assertRaises(ValueError):
            self.checkout(self.cache,'main',str(self.origin))
        destination = self.cache/('healthbrowse-qlora-'+self.commit[:12]); destination.mkdir(parents=True)
        (destination/'file.txt').write_text('unrelated')
        with self.assertRaisesRegex(RuntimeError,'other files'):
            self.checkout(self.cache,self.commit,str(self.origin))
        self.assertEqual((destination/'file.txt').read_text(),'unrelated')


if __name__=='__main__':
    unittest.main()
