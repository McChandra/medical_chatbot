import unittest
from audit_evaluation import summarize_rows


class EvaluationAuditTests(unittest.TestCase):
    def test_invalid_search_is_not_reported_as_six_empty_decks(self):
        row = {'suite':'generation','model_route':'adapter','mode':'search','seconds':10,
               'checks':{'schema_passed':False,'error':'invalid JSON'}}
        report = summarize_rows([row])[0]
        self.assertEqual(report['search_decks']['invalid_outputs_not_scored_as_empty'],1)
        self.assertEqual(report['search_decks']['empty_slots_in_valid_outputs'],0)
        self.assertEqual(report['search_decks']['valid_outputs'],0)

    def test_nonempty_is_not_a_clinical_or_question_answering_score(self):
        row = {'suite':'generation','model_route':'adapter','mode':'search','seconds':10,
               'checks':{'schema_passed':True,'answer_present':True,'populated_decks':[1,4],
                         'unfilled_evidence_decks':[]}}
        report = summarize_rows([row])[0]
        self.assertEqual(report['nonempty_answers_in_valid_outputs'],1)
        self.assertEqual(report['search_decks']['empty_slots_in_valid_outputs'],4)
        self.assertEqual(report['search_decks']['all_six_populated_valid_outputs'],0)
        self.assertEqual(report['claim_support'],'not established by quote matches')


if __name__=='__main__':unittest.main()
