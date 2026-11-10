import csv
import json
from pathlib import Path
import tempfile
import unittest

from features.data_splitting import split_data
from research.data import clean_records, grouped_split, chunk_records, provenance_valid, normalize
from research.metrics import retrieval_metrics
from research.statistics import wilson, bootstrap, paired_test, holm
from research.retrieval import LexicalIndex, rrf, focus_lookup, require_revision, cached_vectors
from research.annotations import read_grades, agreement, export_pool
from research.compare import compare
import pandas as pd


def records():
    return [{'record_id': str(i), 'focus_area': f'Disease {i}', 'question': f'What is disease {i}?',
             'answer': f'Disease {i} is a fictional condition. ' + 'long text ' * 60,
             'source_url': 'https://example.org/'+str(i), 'source': 'fixture', 'question_type': 'definition'} for i in range(20)]


class SplitTests(unittest.TestCase):
    def test_connected_duplicate_answers_cannot_cross_splits(self):
        rows = records()
        rows[1]['answer'] = rows[0]['answer'].upper()
        rows[2]['focus_area'] = rows[1]['focus_area']
        rows[3]['question'] = rows[2]['question']
        split = grouped_split(rows)
        self.assertEqual(len({split['assignments'][str(i)] for i in range(4)}), 1)
        self.assertTrue(all(n == 0 for d in split['normalized_overlap_counts'].values() for n in d.values()))

    def test_reordering_does_not_change_split(self):
        self.assertEqual(grouped_split(records()), grouped_split(list(reversed(records()))))

    def test_too_few_groups_fails(self):
        with self.assertRaises(ValueError): grouped_split(records()[:2])

    def test_missing_focus_is_not_implicitly_shared_unknown(self):
        rows = records(); rows[0]['focus_area'] = 'Unknown'
        with self.assertRaises(ValueError): grouped_split(rows)

    def test_duplicates_keep_aliases(self):
        rows = records(); rows.append({**rows[0], 'record_id': 'alias'})
        clean, report = clean_records(rows)
        self.assertEqual(report['duplicate_records_removed'], 1)
        self.assertEqual(next(r for r in clean if r['record_id'] == '0')['aliases'], ['0', 'alias'])

    def test_training_pipeline_defaults_to_safe_split(self):
        a, b, c, report = split_data(pd.DataFrame(records()))
        self.assertEqual(report['protocol'], 'connected-focus-question-answer-v1')
        self.assertEqual(len(a)+len(b)+len(c), 20)
        with self.assertRaises(ValueError): split_data(pd.DataFrame([{'question':'hello'}]))


class ProvenanceTests(unittest.TestCase):
    def test_encoder_cache_resumes_and_rejects_corruption(self):
        calls = []
        def encode(texts):
            calls.append(texts)
            return [[len(t),1] for t in texts]
        with tempfile.TemporaryDirectory() as d:
            a = cached_vectors(['abc','d'], encode, 'model-v1', d, 1)
            cached_vectors(['abc','d'], encode, 'model-v1', d, 1)
            self.assertEqual(len(calls), 2)
            next(Path(d).rglob('0.npy')).write_bytes(b'corrupt')
            b = cached_vectors(['abc','d'], encode, 'model-v1', d, 1)
            self.assertEqual(len(calls), 3); self.assertTrue((a == b).all())
            cached_vectors(['abc','different'], encode, 'model-v1', d, 1)
            self.assertEqual(len(calls), 5)

    def test_chunks_preserve_offsets_and_long_sentence_content(self):
        rows = records()[:1]; passages = chunk_records(rows, 20)
        self.assertGreater(len(passages), 1)
        self.assertEqual(' '.join(p['text'] for p in passages), rows[0]['answer'].strip())
        self.assertTrue(all(provenance_valid(p, {'0':rows[0]}) for p in passages))

    def test_corruption_and_wrong_source_fail(self):
        rows = records(); p = chunk_records(rows)[0]; index = {r['record_id']:r for r in rows}
        for change in [{'text': p['text']+' invented'}, {'source_url':'https://evil.example'},
                       {'focus_area':'Different'}, {'record_id':'missing'}, {'start':-1}, {'end':999999},
                       {'quote_sha256':'bad'}]:
            self.assertFalse(provenance_valid(p|change, index))


class MetricTests(unittest.TestCase):
    def setUp(self):
        self.query = records()[0]; self.p = chunk_records(records())[0]

    def test_same_disease_is_not_same_answer(self):
        p = self.p | {'record_id':'wrong-answer'}
        m = retrieval_metrics(self.query, [p])
        self.assertEqual(m['focus_match@5'], 1)
        self.assertEqual(m['gold_record_hit@5'], 0)

    def test_unjudged_is_not_zero(self):
        m = retrieval_metrics(self.query, [self.p], {})
        self.assertIsNone(m['precision@5']); self.assertIsNone(m['pooled_ndcg@5'])

    def test_known_relevance_and_abstention(self):
        judgments = {self.p['passage_id']:3}
        m = retrieval_metrics(self.query, [self.p], judgments)
        self.assertEqual(m['precision@5'], .2); self.assertEqual(m['pooled_ndcg@5'], 1)
        self.assertEqual(retrieval_metrics(self.query, [], judgments)['precision@5'], 0)

    def test_duplicate_rankings_fail(self):
        with self.assertRaises(ValueError): retrieval_metrics(self.query, [self.p, self.p])

    def test_lexical_and_label_control(self):
        index = LexicalIndex(['cats need treatment', 'dogs need tests', 'cats are animals'])
        self.assertEqual(index.search('cats treatment')['bm25'][0], 0)
        self.assertEqual(index.search('xyz')['bm25'], [])
        self.assertEqual(focus_lookup('what is lung cancer?', ['cancer', 'lung cancer']), 'lung cancer')

    def test_rrf_favors_agreement(self):
        self.assertEqual(rrf([[0,1,2],[2,1,0]], 3)[0], 0)
        self.assertEqual(rrf([[0,1],[1,2]], 3)[0], 1)

    def test_model_revisions_must_be_pinned(self):
        with self.assertRaises(ValueError): require_revision('main')
        require_revision('a'*40)


class StatisticalTests(unittest.TestCase):
    def test_wilson_reference(self):
        lo, hi = wilson(41, 50)
        self.assertAlmostEqual(lo, .6920, places=3); self.assertAlmostEqual(hi, .9023, places=3)

    def test_identical_paired_systems(self):
        result = paired_test([0,1,1], [0,1,1], iterations=200)
        self.assertEqual(result['p_two_sided'], 1)
        self.assertEqual(result['difference_right_minus_left']['ci95'], [0,0])

    def test_strong_paired_difference(self):
        self.assertLess(paired_test([0]*30, [1]*30, iterations=1000)['p_two_sided'], .01)

    def test_cluster_is_resampling_unit(self):
        result = bootstrap([0]*50+[1]*50, ['a']*50+['b']*50, iterations=300)
        self.assertEqual(result['clusters'], 2); self.assertEqual(result['ci95'], [0,1])

    def test_holm_known_values(self):
        self.assertEqual(holm([.01,.04,.03]), [.03,.06,.06])


class AnnotationTests(unittest.TestCase):
    def test_ablation_mismatched_queries_rejected(self):
        baseline = {'queries':[], 'query_manifest_sha256':'a', 'passages_sha256':'b'}
        candidate = baseline | {'query_manifest_sha256':'different'}
        with self.assertRaises(ValueError): compare(baseline, [candidate])

    def test_agreement_known_and_degenerate(self):
        a = {('q',str(i)): i for i in range(4)}
        self.assertEqual(agreement(a, a)['linear_weighted_kappa'], 1)
        self.assertIsNone(agreement({('q','a'):3}, {('q','a'):3})['linear_weighted_kappa'])

    def test_blank_judgments_fail(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/'a.csv'; path.write_text('query_id,passage_id,grade\nq,p,\n')
            with self.assertRaises(ValueError): read_grades(path)

    def test_pool_blinds_system_and_rank(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/'run.json'
            path.write_text(json.dumps({'query_manifest_sha256':'q', 'passages_sha256':'p',
                'queries':[{'query_id':'q', 'question':'Q?', 'rankings':{'bm25':[{
                    'passage_id':'p','text':'Answer','source_url':'https://example.org'}]}}]}))
            report = export_pool([path], d)
            self.assertEqual(report['pairs'], 1)
            with (Path(d)/'reviewer-A.csv').open() as f: row = next(csv.DictReader(f))
            self.assertNotIn('system', row); self.assertNotIn('rank', row); self.assertEqual(row['grade'], '')


if __name__ == '__main__': unittest.main()
