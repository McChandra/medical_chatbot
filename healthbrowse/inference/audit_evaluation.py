"""Audit an exported evaluation on CPU; format checks are not clinical accuracy.

Usage: python inference/audit_evaluation.py HealthBrowse-Adapter-Evaluation.zip
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import statistics
import zipfile

REQUIRED = {
    'evaluation-manifest.json', 'results.jsonl', 'summary.json',
    'evaluation-fixtures/manifest.json', 'evaluation-fixtures/production-cases.jsonl',
    'evaluation-fixtures/review-packet.jsonl',
}


def summarize_rows(rows):
    """Keep invalid outputs unassessable instead of counting their decks as empty."""
    groups = []
    keys = sorted({(r['suite'], r['model_route'], r['mode']) for r in rows})
    for suite, route, mode in keys:
        selected = [r for r in rows if (r['suite'], r['model_route'], r['mode']) == (suite, route, mode)]
        valid = [r for r in selected if r['checks'].get('schema_passed') is True]
        group = {
            'suite': suite, 'route': route, 'mode': mode, 'cases': len(selected),
            'recorded_schema_passes': len(valid),
            'nonempty_answers_in_valid_outputs': sum(bool(r['checks'].get('answer_present')) for r in valid),
            'direct_question_answering': 'not established by format checks',
            'claim_support': 'not established by quote matches',
            'latency_seconds': {
                'mean': round(statistics.mean(r['seconds'] for r in selected), 3),
                'median': round(statistics.median(r['seconds'] for r in selected), 3),
                'min': min(r['seconds'] for r in selected),
                'max': max(r['seconds'] for r in selected),
            },
            'errors': dict(Counter(r['checks'].get('error', 'unspecified') for r in selected if r not in valid)),
        }
        if suite == 'review':
            group['synthetic_contract_passes'] = sum(bool(r['checks'].get('contract_passed')) for r in selected)
        if mode == 'search':
            group['search_decks'] = {
                'valid_outputs': len(valid),
                'invalid_outputs_not_scored_as_empty': len(selected) - len(valid),
                'populated_slots_in_valid_outputs': sum(len(r['checks'].get('populated_decks', [])) for r in valid),
                'empty_slots_in_valid_outputs': sum(6 - len(r['checks'].get('populated_decks', [])) for r in valid),
                'unfilled_evidence_slots_in_valid_outputs': sum(len(r['checks'].get('unfilled_evidence_decks', [])) for r in valid),
                'all_six_populated_valid_outputs': sum(len(r['checks'].get('populated_decks', [])) == 6 for r in valid),
            }
        groups.append(group)
    return groups


def audit(path):
    with zipfile.ZipFile(path) as archive:
        info = archive.infolist()
        if len(info) != len(REQUIRED) or {i.filename for i in info} != REQUIRED:
            raise ValueError('Unexpected, missing or duplicate evaluation files')
        if sum(i.file_size for i in info) > 5 * 1024**2:
            raise ValueError('Evaluation export exceeds size limit')
        if archive.testzip():
            raise ValueError('Evaluation archive failed CRC checks')
        content = {n: archive.read(n) for n in REQUIRED}
    manifest = json.loads(content['evaluation-manifest.json'])
    fixture_manifest = json.loads(content['evaluation-fixtures/manifest.json'])
    fixture_hash = hashlib.sha256(content['evaluation-fixtures/production-cases.jsonl']).hexdigest()
    if fixture_hash != manifest['fixture_sha256'] or fixture_hash != fixture_manifest['fixture_sha256']:
        raise ValueError('Fixture checksum mismatch')
    fixtures = [json.loads(line) for line in content['evaluation-fixtures/production-cases.jsonl'].splitlines() if line.strip()]
    rows = [json.loads(line) for line in content['results.jsonl'].splitlines() if line.strip()]
    case_ids = manifest['case_ids']
    if len(set(case_ids)) != len(case_ids):
        raise ValueError('Duplicate case IDs in manifest')
    intercepts = {c['id'] for c in fixtures if c['kind'] == 'intercept'}
    expected = {(c, route) for c in case_ids if c not in intercepts for route in ['base', 'adapter']}
    keys = [(r['case_id'], r['model_route']) for r in rows]
    if len(keys) != len(set(keys)) or set(keys) != expected:
        raise ValueError('Incomplete, duplicate or unexpected model results')
    return {
        'audit_version': 1, 'evaluation_zip_sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
        'adapter_sha256': manifest['adapter_sha256'], 'fixture_sha256': fixture_hash,
        'base_revision': manifest['revision'], 'expected_results': len(expected), 'observed_results': len(rows),
        'archive_crc_passed': True, 'fixture_hashes_match': True,
        'clinical_release_approved': False, 'groups': summarize_rows(rows),
        'limitations': [
            'This audit validates export completeness and aggregates recorded deterministic checks; it does not rerun a model.',
            'A nonempty answer is not evidence that the question was answered correctly or completely.',
            'Invalid search responses have unknown deck coverage, not six measured empty decks.',
            'Quote presence does not establish that the cited passage supports the claim.',
            'No clinical accuracy score or clinician review is provided.',
        ],
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.archive), indent=2))
