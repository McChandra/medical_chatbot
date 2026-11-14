import json
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile
from adapter_artifact import inspect_export
from evaluation_checks import check_output


class EvaluationTests(unittest.TestCase):
    def fixture(self):
        source={'id':'S1','deck':3,'text':'This intact passage is supplied as evaluation evidence.'}
        case={'kind':'generation','input':{'mode':'search'},'evidence':{'sources':[source]}}
        claim={'text':source['text'],'support':[{'id':'S1','quote':source['text']}]}
        answer={'answer':{'claims':[claim]},'decks':[{'id':n,'claims':[claim] if n==3 else []} for n in range(1,7)]}
        return case,answer

    def test_exact_quotes_are_not_reported_as_clinical_accuracy(self):
        case,answer=self.fixture();r=check_output(json.dumps(answer),case)
        self.assertTrue(r['schema_passed']);self.assertTrue(r['manual_review_required'])
        self.assertEqual(r['clinical_accuracy'],'not assessed');self.assertEqual(r['populated_decks'],[3])
        self.assertFalse(check_output(json.dumps(answer),case,truncated=True)['schema_passed'])

    def test_unknown_citations_and_misfiled_decks_fail(self):
        case,answer=self.fixture();answer['answer']['claims'][0]['support'][0]['id']='invented'
        self.assertFalse(check_output(json.dumps(answer),case)['schema_passed'])
        case,answer=self.fixture();answer['decks'][0]['claims']=answer['decks'][2]['claims'];answer['decks'][2]['claims']=[]
        self.assertFalse(check_output(json.dumps(answer),case)['schema_passed'])

    def test_reviewer_answer_schema_is_not_a_pass(self):
        case,answer=self.fixture();case.update(kind='review',draft={'answer':{'claims':[{'id':'C1'}]},'decks':[]},expected_supported=False)
        self.assertFalse(check_output(json.dumps(answer),case)['schema_passed'])
        review={'questionAnswered':True,'checks':[{'id':'C1','verdict':'supported'}]}
        self.assertFalse(check_output(json.dumps(review),case)['contract_passed'])
        review['checks'][0]['verdict']='insufficient'
        self.assertTrue(check_output(json.dumps(review),case)['contract_passed'])

    def test_archive_traversal_and_duplicate_entries_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            archive=Path(directory,'bad.zip')
            for names in [['../escape.json'],['adapter//config.json'],['adapter/./config.json'],
                          ['adapter/config.json','adapter/config.json']]:
                with self.subTest(names=names), warnings.catch_warnings():
                    warnings.simplefilter('ignore',UserWarning)
                    with zipfile.ZipFile(archive,'w') as z:
                        for name in names:z.writestr(name,'{}')
                    with self.assertRaisesRegex(ValueError,'Unsafe'):inspect_export(archive)


if __name__=='__main__':unittest.main()
