"""Blind, two-reviewer passage grading; disagreements require adjudication."""
import csv
import json
from pathlib import Path
import random


def export_pool(run_files, output):
    runs = [json.loads(Path(p).read_text()) for p in run_files]
    if not runs or len({r['query_manifest_sha256'] for r in runs}) != 1 or len({r['passages_sha256'] for r in runs}) != 1:
        raise ValueError("Pool only identical query/passage manifests")
    pool = {}
    for run in runs:
        for query in run['queries']:
            for ranking in query['rankings'].values():
                for passage in ranking:
                    key = (query['query_id'], passage['passage_id'])
                    pool[key] = {'query_id': key[0], 'passage_id': key[1], 'question': query['question'],
                                 'passage': passage['text'], 'source_url': passage['source_url'],
                                 'grade': '', 'support': '', 'notes': ''}
    rows = list(pool.values())
    for reviewer, seed in [('A', 101), ('B', 202)]:
        random.Random(seed).shuffle(rows)
        path = Path(output) / f'reviewer-{reviewer}.csv'
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else
                                    ['query_id','passage_id','question','passage','source_url','grade','support','notes'])
            writer.writeheader(); writer.writerows(rows)
    return {'pairs': len(rows), 'reviewers': 2, 'status': 'ungraded; independent humans required'}


def read_grades(path):
    result = {}
    with open(path, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            key = (row['query_id'], row['passage_id'])
            if key in result or row['grade'] not in ('0', '1', '2', '3'):
                raise ValueError('Every pair needs one integer grade 0..3; blanks are not zero')
            result[key] = int(row['grade'])
    if not result:
        raise ValueError('No judgments supplied')
    return result


def agreement(left, right):
    if set(left) != set(right):
        raise ValueError('Reviewers must independently grade the same pool')
    n = len(left)
    if not n:
        raise ValueError('Empty judgment pool')
    # Linear weighted Cohen kappa for the ordered 0..3 scale.
    observed = sum(abs(left[k]-right[k])/3 for k in left)/n
    a = [sum(v == i for v in left.values())/n for i in range(4)]
    b = [sum(v == i for v in right.values())/n for i in range(4)]
    expected = sum(a[i]*b[j]*abs(i-j)/3 for i in range(4) for j in range(4))
    return {'pairs': n, 'exact_agreement': sum(left[k] == right[k] for k in left)/n,
            'linear_weighted_kappa': 1-observed/expected if expected else None,
            'disagreements': [{'query_id': k[0], 'passage_id': k[1], 'A': left[k], 'B': right[k]}
                              for k in sorted(left) if left[k] != right[k]],
            'warning': 'Descriptive agreement only; query-clustered uncertainty and adjudication still required.'}
