"""Paired ablation comparisons; reject runs with different questions or corpora."""
import argparse
from research.evaluate import read, write
from research.metrics import retrieval_metrics
from research.statistics import paired_test, holm
from research.annotations import read_grades


def compare(baseline, candidates, system='bm25', qrels=None, metric='gold_record_hit@5', resamples=5000):
    result = []
    ids = [q['query_id'] for q in baseline['queries']]
    for candidate in candidates:
        if (candidate['query_manifest_sha256'] != baseline['query_manifest_sha256'] or
                candidate['passages_sha256'] != baseline['passages_sha256'] or
                [q['query_id'] for q in candidate['queries']] != ids):
            raise ValueError('Paired comparison requires identical ordered queries and passage manifests')
        left, right, clusters = [], [], []
        for a, b in zip(baseline['queries'], candidate['queries']):
            if a['cluster'] != b['cluster']:
                raise ValueError('Cluster definitions differ')
            judgments = None if qrels is None else {p:g for (q,p),g in qrels.items() if q == a['query_id']}
            x = retrieval_metrics(a, a['rankings'][system], judgments).get(metric)
            y = retrieval_metrics(b, b['rankings'][system], judgments).get(metric)
            if x is not None and y is not None:
                left.append(x); right.append(y); clusters.append(a['cluster'])
        if not left:
            raise ValueError('No jointly measured queries for this metric')
        result.append({'candidate_config':candidate['config'], 'system':system, 'metric':metric,
                       'joint_queries':len(left), 'excluded_queries':len(ids)-len(left),
                       **paired_test(left, right, clusters, resamples)})
    for row, p in zip(result, holm([r['p_two_sided'] for r in result])):
        row['p_holm'] = p
    return {'baseline_config':baseline['config'], 'family':'All candidates supplied in this invocation',
            'comparisons':result, 'warning':'Do not split a predeclared comparison family across invocations to evade multiplicity correction.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True); parser.add_argument('--candidates', nargs='+', required=True)
    parser.add_argument('--system', default='bm25'); parser.add_argument('--metric', default='gold_record_hit@5')
    parser.add_argument('--qrels'); parser.add_argument('--output', required=True)
    args = parser.parse_args()
    write(args.output, compare(read(args.baseline), [read(p) for p in args.candidates], args.system,
                              read_grades(args.qrels) if args.qrels else None, args.metric))


if __name__ == '__main__': main()
