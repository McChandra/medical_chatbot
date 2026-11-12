import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from audit_grounded_evaluation import audit


class GroundedAuditTests(unittest.TestCase):
    def export(self, directory, mutate=None):
        fixtures = {'cases': [
            {'id': 'search', 'input': {'question': 'A public research question?', 'mode': 'search'}},
            {'id': 'chat', 'input': {'question': 'An educational follow-up?', 'mode': 'chat'}},
        ], 'controls': []}
        fixture_bytes = json.dumps(fixtures).encode()
        fixture_hash = hashlib.sha256(fixture_bytes).hexdigest()
        runtime = {'inference_hashes': {}}
        rows = []
        for c in fixtures['cases']:
            for route in ['base', 'adapter']:
                rows.append({'kind': 'pipeline', 'id': c['id'], 'route': route,
                             'question': c['input']['question'], 'seconds': 1,
                             'http_status': 502, 'gateway_accepted': False,
                             'response': {'status': 'unavailable', 'code': 'verification_failed'}, 'trace': []})
        groups = [{'route': route, 'cases': 2, 'gateway_accepted': 0,
                   'source_fallbacks': 2, 'declared_question_gaps': 0,
                   'elapsed_seconds': [{'id': 'search', 'seconds': 1}, {'id': 'chat', 'seconds': 1}],
                   'all_six_decks_populated': 0} for route in ['base', 'adapter']]
        data = {
            'evaluation-fixtures/cases.json': fixture_bytes,
            'evaluation-fixtures/manifest.json': json.dumps({'sha256': fixture_hash, 'sourceHashes': {}}).encode(),
            'evaluation-manifest.json': json.dumps({'fixture_sha256': fixture_hash, 'runtime': runtime}).encode(),
            'runtime.json': json.dumps(runtime).encode(),
            'summary.json': json.dumps({'completed': 4, 'expected': 4, 'groups': groups,
                                       'controls': {'completed': 0, 'expected': 0, 'false_acceptances': 0, 'false_rejections': 0, 'request_failures': 0}}).encode(),
            'results.jsonl': ('\n'.join(json.dumps(r) for r in rows) + '\n').encode(),
        }
        if mutate:
            mutate(data)
        path = Path(directory) / 'export.zip'
        with zipfile.ZipFile(path, 'w') as z:
            for name, value in data.items():
                z.writestr(name, value)
        return path

    def test_complete_run_is_audited_without_inference(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = audit(self.export(tmp))
        self.assertEqual(report['observed_results'], 4)
        self.assertTrue(report['summary_recomputed'])
        self.assertFalse(report['clinical_release_approved'])

    def test_modified_summary_is_rejected(self):
        def mutate(data):
            summary = json.loads(data['summary.json'])
            summary['groups'][0]['gateway_accepted'] = 2
            data['summary.json'] = json.dumps(summary).encode()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'Summary'):
                audit(self.export(tmp, mutate))

    def test_duplicate_record_and_modified_fixtures_are_rejected(self):
        def duplicate(data):
            data['results.jsonl'] += data['results.jsonl'].splitlines()[0] + b'\n'
        def changed(data):
            data['evaluation-fixtures/cases.json'] += b' '
        for mutate, message in [(duplicate, 'duplicate'), (changed, 'checksum')]:
            with self.subTest(message=message), tempfile.TemporaryDirectory() as tmp:
                with self.assertRaisesRegex(ValueError, message):
                    audit(self.export(tmp, mutate))


if __name__ == '__main__':
    unittest.main()
