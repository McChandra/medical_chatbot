"""Coverage and synthetic provenance controls; neither is clinical validation."""
import argparse
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import subprocess
import types
from unittest.mock import patch

from backend import copilot_engine
from research.data import load_medquad, normalize, provenance_valid, digest
from research.evaluate import write, read
from research.statistics import bootstrap, paired_test


def coverage(engine, rows):
    outcome = []
    for row in rows:
        topic = next(t for t in engine.TOPICS if normalize(t) == normalize(row['focus_area']))
        replies = [engine.answer(topic, deck, row['question']) for deck in range(1, len(engine.DECKS)+1)]
        outcome.append({'query_id': row['record_id'], 'focus_area': row['focus_area'],
                        'question_type': row['question_type'],
                        'covered': any(r['status'] == 'excerpt' for r in replies),
                        'deck_statuses': [r['status'] for r in replies]})
    groups = defaultdict(list)
    for row in outcome: groups[row['question_type']].append(row)
    return {'per_query': outcome,
            'coverage': bootstrap([int(r['covered']) for r in outcome], [normalize(r['focus_area']) for r in outcome]),
            'by_question_type': {name:{'queries':len(items), 'covered':sum(r['covered'] for r in items)}
                                 for name, items in groups.items()}}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dataset', required=True); p.add_argument('--medquad', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--baseline-ref', default='87bc6f1586657a0a92f43a3a3c15b1434d64b650')
    args = p.parse_args()
    data = Path(args.dataset)
    records, passages = read(data/'records.json'), read(data/'passages.json')
    by_id = {r['record_id']:r for r in records}
    # One intact passage and six altered versions per sampled original record.
    sample, seen = [], set()
    for row in passages:
        if row['record_id'] in seen: continue
        seen.add(row['record_id']); sample.append(row)
        if len(sample) == 100: break
    mutations = [('text', lambda p: p | {'text':p['text']+' Unsupported extra text.'}),
                 ('source_url', lambda p: p | {'source_url':'https://invalid.example'}),
                 ('focus', lambda p: p | {'focus_area':'unrelated focus'}),
                 ('record', lambda p: p | {'record_id':'nonexistent'}),
                 ('offset', lambda p: p | {'start':-1}),
                 ('hash', lambda p: p | {'quote_sha256':'invalid'})]
    integrity = {'valid_passages': len(sample),
                 'valid_accepted': sum(provenance_valid(p, by_id) for p in sample),
                 'alterations_rejected': {name:sum(not provenance_valid(mutate(p), by_id) for p in sample)
                                         for name, mutate in mutations},
                 'no_verification_control_accepted': len(sample)*(1+len(mutations)),
                 'limitation': 'Synthetic integrity attacks, not naturally occurring hallucinations. Intact but irrelevant/outdated quotes can pass.'}
    raw, _ = load_medquad(args.medquad)
    topics = {normalize(t) for t in copilot_engine.TOPICS}
    queries = [r for r in raw if normalize(r['focus_area']) in topics]
    legacy = types.ModuleType('legacy_copilot'); legacy.__file__ = 'backend/copilot_engine.py'
    code = subprocess.check_output(['git','show',args.baseline_ref+':backend/copilot_engine.py'], text=True)
    exec(compile(code, legacy.__file__, 'exec'), legacy.__dict__)
    with patch.dict(os.environ, MEDQUAD_PASSAGES_PATH=str(Path('healthbrowse/dist/clinical-passages.json').resolve())):
        before, after = coverage(legacy, queries), coverage(copilot_engine, queries)
    comparison = paired_test([int(r['covered']) for r in before['per_query']],
                             [int(r['covered']) for r in after['per_query']],
                             [normalize(r['focus_area']) for r in after['per_query']])
    write(args.output, {'baseline_commit':args.baseline_ref, 'query_sha256':digest(queries),
                        'synthetic_provenance_control':integrity, 'legacy_before':before, 'legacy_after':after,
                        'paired_coverage_comparison':comparison,
                        'scope':'Legacy Python eight-deck excerpt engine only; not the current hosted six-deck browser or model gateway.',
                        'interpretation':'Coverage is returned excerpts, not question relevance, safety or accuracy.'})
    print(json.dumps({'queries':len(queries), 'before':before['coverage']['mean'], 'after':after['coverage']['mean']}))


if __name__ == '__main__': main()
