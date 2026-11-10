"""CLI: prepare -> run paired baselines -> pool -> independent grade -> evaluate.

Run ``python -m research.evaluate --help``. This module has no serving integration.
"""
import argparse
from collections import Counter
from hashlib import sha256
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess

from research.data import (load_medquad, clean_records, grouped_split, chunk_records,
                           digest, normalize, provenance_valid)
from research.retrieval import LexicalIndex, DenseIndex, MedCPTIndex, Reranker, rrf, focus_lookup, tokenize
from research.metrics import retrieval_metrics
from research.statistics import bootstrap, paired_test, holm
from research.annotations import export_pool, read_grades, agreement


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n')


def read(path):
    return json.loads(Path(path).read_text())


def prepare(args):
    raw, provenance = load_medquad(args.medquad)
    records, cleaning = clean_records(raw)
    split = grouped_split(records, seed=args.seed)
    passages = chunk_records(records, args.words)
    path = Path(args.output)
    write(path/'records.json', records)
    write(path/'passages.json', passages)
    write(path/'split.json', split)
    # Reproduce the old four-column preprocessing separately from the new protocol.
    import pandas as pd
    from src.data.preprocessing import preprocess_data
    legacy_df = pd.DataFrame([{k: (r[k] or None) for k in ('question','answer','source','focus_area')} for r in raw])
    _, legacy_report = preprocess_data(legacy_df)
    answers = Counter(normalize(r['answer']) for r in records)
    write(path/'dataset-report.json', {**provenance, 'cleaning': cleaning,
          'legacy_four_column_preprocessing': legacy_report,
          'records': len(records), 'passages': len(passages), 'chunk_words': args.words,
          'records_sha256': digest(records), 'passages_sha256': digest(passages),
          'focus_in_question_fraction': sum(normalize(r['focus_area']) in normalize(r['question']) for r in records)/len(records),
          'duplicated_normalized_answer_groups': sum(n > 1 for n in answers.values()),
          'limitation': 'New reproducible protocol, not a reconstruction of undocumented notebook rows or chunking.'})
    print(json.dumps({'records': len(records), 'passages': len(passages), 'split_counts': split['counts']}))


def run(args):
    code_files = {str(p): sha256(p.read_bytes()).hexdigest() for p in sorted(Path('research').glob('*.py'))}
    path = Path(args.dataset)
    records, passages, split = read(path/'records.json'), read(path/'passages.json'), read(path/'split.json')
    source_report = read(path/'dataset-report.json')
    if (digest(records) != split['records_sha256'] or digest(records) != source_report['records_sha256']
            or digest(passages) != source_report['passages_sha256']):
        raise ValueError('Dataset manifest mismatch')
    queries = [r for r in records if split['assignments'][r['record_id']] == args.split]
    # Deterministic hash sample, never a sample selected by system success/regression.
    queries.sort(key=lambda q: digest([args.seed, q['record_id']]))
    if args.limit:
        queries = queries[:args.limit]
    texts = [(p['focus_area'] + ': ' if args.prefix else '') + p['text'] for p in passages]
    lexical = LexicalIndex(texts)
    dense = DenseIndex(texts, args.encoder, args.encoder_revision, args.device, args.cache_dir) if args.encoder else None
    if args.medcpt:
        dense = MedCPTIndex(texts, args.query_revision, args.article_revision, args.device, args.cache_dir)
    reranker = Reranker(args.reranker, args.reranker_revision, args.device) if args.reranker else None
    if reranker and not dense:
        raise ValueError('Reranker ablation requires the dense baseline on the same corpus')
    vocabulary = Counter(t for r in records if split['assignments'][r['record_id']] == 'train'
                         for t in tokenize(r['question']))
    allowed = {t for t, _ in sorted(vocabulary.items(), key=lambda v: (-v[1], v[0]))[:args.vocabulary_gate]}
    by_record = {r['record_id']: r for r in records}
    verified = [provenance_valid(p, by_record) for p in passages]
    output = []
    labels = {normalize(r['focus_area']) for r in records}
    for query in queries:
        ranks = lexical.search(query['question'], args.depth)
        if dense:
            ranks['dense'] = dense.search(query['question'], args.depth)
            ranks['hybrid_bm25_dense'] = rrf([ranks['bm25'], ranks['dense']], args.depth)
            if reranker:
                ranks['dense_reranked'] = reranker.rank(query['question'], ranks['dense'], texts)
        else:
            # Explicitly lexical fusion; never label this a sparse+dense hybrid.
            ranks['fusion_bm25_tfidf'] = rrf(list(ranks.values()), args.depth)
        unknown = set(tokenize(query['question'])) - set(tokenize(query['focus_area'])) - allowed
        gate_passed = not args.vocabulary_gate or not unknown
        ranked = {name: [passages[i] for i in indices if (not args.verification or verified[i])][:5]
                  if gate_passed else [] for name, indices in ranks.items()}
        output.append({'query_id': query['record_id'], 'question': query['question'],
                       'focus_area': query['focus_area'], 'record_id': query['record_id'],
                       'cluster': split['clusters'][query['record_id']], 'question_type': query['question_type'],
                       'lookup_focus': focus_lookup(query['question'], labels),
                       'gate_passed': gate_passed, 'rankings': ranked})
    versions = {'python': platform.python_version()}
    for name in ['numpy','scipy','scikit-learn','pandas','torch','transformers','sentence-transformers']:
        try: versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError: versions[name] = 'not installed'
    code_sha = subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip()
    if any(sha256(Path(p).read_bytes()).hexdigest() != h for p, h in code_files.items()):
        raise RuntimeError('Research source changed during execution; rerun before reporting results')
    result = {'protocol': 'phase-iv-v1', 'config': vars(args) | {'function': args.function.__name__},
              'code_commit': code_sha, 'code_file_sha256': code_files, 'environment': versions,
              'records_sha256': digest(records), 'passages_sha256': digest(passages),
              'query_manifest_sha256': digest([q['query_id'] for q in output]),
              'split_sha256': digest(split), 'queries': output,
              'warnings': ['Public retrieval corpus intentionally includes held-out gold answers; this is not closed-book generalization.',
                           'Gold-record metrics are automatic recovery proxies, not human relevance or clinical correctness.',
                           'Verification here checks stored provenance/offsets only, not semantic support or medical currency.']}
    write(args.output, result)
    write(str(args.output)+'.summary.json', summarize(result, None, args.resamples))
    print(json.dumps({'queries': len(output), 'systems': list(output[0]['rankings']), 'output': args.output}))


def summarize(run_result, qrels=None, resamples=2000):
    queries = run_result['queries']
    if not queries:
        raise ValueError('No evaluation queries')
    if qrels is not None and {q for q, _ in qrels} - {q['query_id'] for q in queries}:
        raise ValueError('Judgments contain queries outside the frozen run')
    cluster = [q['cluster'] for q in queries]
    systems = sorted(queries[0]['rankings'])
    summary = {'query_count': len(queries), 'query_manifest_sha256': run_result['query_manifest_sha256'],
               'passages_sha256': run_result['passages_sha256'], 'systems': {},
               'string_lookup_focus_accuracy': bootstrap([float(q['lookup_focus'] == normalize(q['focus_area']))
                                                         for q in queries], cluster, resamples),
               'graded_relevance': 'provided' if qrels is not None else 'not measured; two independent reviewers required',
               'warnings': run_result['warnings']}
    values = {}
    for system in systems:
        results = [retrieval_metrics(q, q['rankings'][system], None if qrels is None else
                                    {pid: grade for (qid, pid), grade in qrels.items() if qid == q['query_id']}) for q in queries]
        values[system] = results
        summary['systems'][system] = {}
        for metric in results[0]:
            valid = [i for i, row in enumerate(results) if row[metric] is not None]
            summary['systems'][system][metric] = (bootstrap([results[i][metric] for i in valid],
                                                           [cluster[i] for i in valid], resamples) if valid else None)
            if valid:
                summary['systems'][system][metric]['excluded_unjudged_queries'] = len(queries)-len(valid)
    # Predeclared family: each available system versus BM25 on gold-record Hit@5.
    comparisons = []
    for system in systems:
        if system == 'bm25': continue
        test = paired_test([v['gold_record_hit@5'] for v in values['bm25']],
                           [v['gold_record_hit@5'] for v in values[system]], cluster, resamples)
        comparisons.append({'left': 'bm25', 'right': system, 'metric': 'gold_record_hit@5', **test})
    for comparison, adjusted in zip(comparisons, holm([c['p_two_sided'] for c in comparisons])):
        comparison['p_holm'] = adjusted
    summary['paired_comparisons'] = comparisons
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('prepare'); p.set_defaults(function=prepare)
    p.add_argument('--medquad', required=True); p.add_argument('--output', required=True)
    p.add_argument('--seed', type=int, default=42); p.add_argument('--words', type=int, default=160)
    p = sub.add_parser('run'); p.set_defaults(function=run)
    p.add_argument('--dataset', required=True); p.add_argument('--output', required=True)
    p.add_argument('--split', choices=['validation','test'], default='validation')
    p.add_argument('--limit', type=int, default=0); p.add_argument('--seed', type=int, default=42)
    p.add_argument('--prefix', action='store_true'); p.add_argument('--depth', type=int, default=50)
    p.add_argument('--vocabulary-gate', type=int, default=0)
    p.add_argument('--verification', action=argparse.BooleanOptionalAction, default=True)
    p.add_argument('--encoder'); p.add_argument('--encoder-revision')
    p.add_argument('--medcpt', action='store_true'); p.add_argument('--query-revision'); p.add_argument('--article-revision')
    p.add_argument('--reranker'); p.add_argument('--reranker-revision')
    p.add_argument('--device', default='cpu'); p.add_argument('--resamples', type=int, default=2000)
    p.add_argument('--cache-dir', default='artifacts/phase-iv/model-cache')
    p = sub.add_parser('pool'); p.add_argument('--runs', nargs='+', required=True); p.add_argument('--output', required=True)
    p.set_defaults(function=lambda a: print(json.dumps(export_pool(a.runs, a.output))))
    p = sub.add_parser('agreement'); p.add_argument('--a', required=True); p.add_argument('--b', required=True); p.add_argument('--output', required=True)
    p.set_defaults(function=lambda a: write(a.output, agreement(read_grades(a.a), read_grades(a.b))))
    p = sub.add_parser('grade'); p.add_argument('--run', required=True); p.add_argument('--adjudicated', required=True); p.add_argument('--output', required=True)
    p.set_defaults(function=lambda a: write(a.output, summarize(read(a.run), read_grades(a.adjudicated))))
    args = parser.parse_args()
    if args.command == 'run' and (args.limit < 0 or args.depth < 5 or args.vocabulary_gate < 0):
        parser.error('limit/gate must be nonnegative and depth at least 5')
    if args.command == 'run' and args.medcpt and args.encoder:
        parser.error('Run MedCPT and the generic encoder separately on the same frozen query manifest')
    args.function(args)


if __name__ == '__main__':
    main()
