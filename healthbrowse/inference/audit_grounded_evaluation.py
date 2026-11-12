"""Audit a saved grounded-v2 export on CPU, without rerunning inference.

Optional --source-root is the healthbrowse/ directory of the original pinned
checkout, not a newer implementation. No model quality is inferred from hashes.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import statistics
import zipfile

REQUIRED = {
    'evaluation-manifest.json', 'runtime.json', 'results.jsonl', 'summary.json',
    'evaluation-fixtures/cases.json', 'evaluation-fixtures/manifest.json',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def historical_review_passes(review, draft, prepared):
    """Original v2 verdict-only rule, deliberately independent of later fixes."""
    claims = draft['answer']['claims'] + [c for d in draft['decks'] for c in d['claims']]
    checks, coverage = review.get('checks', []), review.get('coverage', [])
    return (len(checks) == len(claims)
            and len({c['id'] for c in checks}) == len(claims)
            and all(any(r['id'] == c['id'] and r['verdict'] == 'supported' for r in checks) for c in claims)
            and len(coverage) == len(prepared['facets'])
            and len({f['id'] for f in coverage}) == len(prepared['facets'])
            and all(any(r['id'] == f['id'] and r['verdict'] == ('gap' if f['id'] in draft['gaps'] else 'answered')
                        for r in coverage) for f in prepared['facets']))


def recorded_summary(rows, fixtures):
    groups = []
    for route in ['base', 'adapter']:
        selected = [r for r in rows if r['kind'] == 'pipeline' and r['route'] == route]
        groups.append({
            'route': route, 'cases': len(selected),
            'gateway_accepted': sum(r['gateway_accepted'] for r in selected),
            'source_fallbacks': sum(not r['gateway_accepted'] for r in selected),
            'declared_question_gaps': sum(len(r['response'].get('gaps', [])) for r in selected),
            'elapsed_seconds': [{'id': r['id'], 'seconds': r['seconds']} for r in selected],
            'all_six_decks_populated': sum(len(r['response'].get('decks', [])) == 6 and
                all(d.get('supported') for d in r['response']['decks']) for r in selected),
        })
    controls = [r for r in rows if r['kind'] == 'control']
    return {
        'groups': groups,
        'controls': {
            'completed': len(controls), 'expected': len(fixtures['controls']),
            'false_acceptances': sum(not r.get('request_error') and not r['expectedSupported'] and r['accepted'] for r in controls),
            'false_rejections': sum(not r.get('request_error') and r['expectedSupported'] and not r['accepted'] for r in controls),
            'request_failures': sum(bool(r.get('request_error')) for r in controls),
        },
    }


def audit(path, source_root=None):
    with zipfile.ZipFile(path) as archive:
        info = archive.infolist()
        if len(info) != len(REQUIRED) or {i.filename for i in info} != REQUIRED:
            raise ValueError('Unexpected, duplicate or missing evaluation files')
        if sum(i.file_size for i in info) > 8 * 1024**2:
            raise ValueError('Evaluation archive exceeds size limit')
        if archive.testzip():
            raise ValueError('Archive CRC failure')
        content = {name: archive.read(name) for name in REQUIRED}
    manifest = json.loads(content['evaluation-manifest.json'])
    fm = json.loads(content['evaluation-fixtures/manifest.json'])
    fixtures = json.loads(content['evaluation-fixtures/cases.json'])
    runtime = json.loads(content['runtime.json'])
    summary = json.loads(content['summary.json'])
    rows = [json.loads(line) for line in content['results.jsonl'].splitlines() if line.strip()]
    if digest(content['evaluation-fixtures/cases.json']) != fm['sha256'] or fm['sha256'] != manifest['fixture_sha256']:
        raise ValueError('Fixture checksum mismatch')
    if runtime != manifest['runtime']:
        raise ValueError('Runtime metadata mismatch')
    expected = {('pipeline', c['id'], route) for c in fixtures['cases'] for route in ['base', 'adapter']}
    expected |= {('control', c['id'], 'base') for c in fixtures['controls']}
    keys = [(r['kind'], r['id'], r['route']) for r in rows]
    if len(set(keys)) != len(keys) or set(keys) != expected:
        raise ValueError('Incomplete, duplicate or unexpected evaluation records')
    cases = {c['id']: c for c in fixtures['cases']}
    controls = {c['id']: c for c in fixtures['controls']}
    for row in rows:
        if row['kind'] == 'pipeline':
            if row['question'] != cases[row['id']]['input']['question']:
                raise ValueError('Question does not match fixture')
            accepted = 200 <= row['http_status'] < 300 and row['response'].get('status') == 'generated'
            if row['gateway_accepted'] != accepted:
                raise ValueError('Gateway acceptance flag mismatch')
        else:
            c = controls[row['id']]
            if c['expectedSupported'] != row['expectedSupported']:
                raise ValueError('Reviewer control expectation mismatch')
            if not row.get('request_error') and historical_review_passes(row['response'], c['draft'], c['prepared']) != row['accepted']:
                raise ValueError('Reviewer control score mismatch')
    recomputed = recorded_summary(rows, fixtures)
    if summary['completed'] != len(rows) or summary['expected'] != len(expected) or any(summary[k] != v for k, v in recomputed.items()):
        raise ValueError('Summary does not match raw records')
    checked = 0
    if source_root is not None:
        root = Path(source_root).resolve()
        hashes = dict(fm['sourceHashes'])
        hashes.update({'inference/' + p: h for p, h in runtime['inference_hashes'].items()})
        hashes['scripts/run-grounded-evaluation.mjs'] = manifest['script_sha256']
        for name, expected_hash in hashes.items():
            target = (root / name).resolve()
            if not target.is_relative_to(root) or digest(target.read_bytes()) != expected_hash:
                raise ValueError('Pinned source mismatch: ' + name)
            checked += 1
    groups = []
    for route in ['base', 'adapter']:
        selected = [r for r in rows if r['kind'] == 'pipeline' and r['route'] == route]
        search = [r for r in selected if cases[r['id']]['input']['mode'] == 'search']
        chat = [r for r in selected if cases[r['id']]['input']['mode'] == 'chat']
        accepted = [r for r in selected if r['gateway_accepted']]
        unfinished = []
        for row in accepted:
            blocks = row['response']['answer'].get('blocks', [])
            if any(not re.search(r'[.!?]["”’)]?$', b['text'].strip()) for b in blocks):
                unfinished.append(row['id'])
        groups.append({
            'route': route, 'cases': len(selected), 'gateway_accepted': len(accepted),
            'browser_cases': len(search), 'browser_accepted': sum(r['gateway_accepted'] for r in search),
            'buddy_cases': len(chat), 'buddy_accepted': sum(r['gateway_accepted'] for r in chat),
            'accepted_answers_with_unfinished_sentence_markers': unfinished,
            'observed_deadline_failures': sum(any('timeout' in t.get('error', '').lower() for t in r.get('trace', [])) for r in selected),
            'browser_seconds': {'min': min(r['seconds'] for r in search), 'median': round(statistics.median(r['seconds'] for r in search), 3), 'max': max(r['seconds'] for r in search)},
            'buddy_seconds': {'min': min(r['seconds'] for r in chat), 'median': round(statistics.median(r['seconds'] for r in chat), 3), 'max': max(r['seconds'] for r in chat)},
            'gateway_failure_codes': dict(Counter(str(r['response'].get('code')) for r in selected if not r['gateway_accepted'])),
        })
    return {
        'audit_version': 2, 'archive_sha256': digest(Path(path).read_bytes()),
        'file_sha256': {name: digest(value) for name, value in sorted(content.items())},
        'expected_results': len(expected), 'observed_results': len(rows),
        'archive_crc_passed': True, 'summary_recomputed': True, 'controls_rescored': True,
        'pinned_source_files_verified': checked, 'runtime': runtime,
        'groups': groups, 'controls': recomputed['controls'],
        'false_accepted_controls': [r['id'] for r in rows if r['kind'] == 'control' and not r['expectedSupported'] and r['accepted'] and not r.get('request_error')],
        'clinical_release_approved': False,
        'limitations': [
            'This is a CPU audit of saved records, not a new model run or clinical review.',
            'Gateway acceptance and valid JSON do not establish claim support or answer quality.',
            'Terminal punctuation is a structural warning, not a complete grammatical or factual check.',
            'No browser answer was accepted; missing final decks do not measure retrieval coverage.',
            'Source hashes establish reproducibility, not medical currency or correctness.',
            'This selected development suite is not an untouched final test set.',
        ],
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--source-root', type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.archive, args.source_root), indent=2))
