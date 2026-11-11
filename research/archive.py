"""Publish compact reproducibility records without copying medical answer text."""
import argparse
import csv
from hashlib import sha256
import json
from pathlib import Path
from research.data import digest
from research.evaluate import read, write


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True); parser.add_argument('--output', required=True)
    args = parser.parse_args()
    source, target = Path(args.input), Path(args.output)
    target.mkdir(parents=True, exist_ok=True)
    split = read(source/'dataset/split.json')
    write(target/'dataset-report.json', read(source/'dataset/dataset-report.json'))
    write(target/'split-summary.json', {k:v for k,v in split.items() if k not in ('assignments','clusters')})
    with (target/'split-manifest.csv').open('w', newline='') as f:
        writer = csv.writer(f); writer.writerow(['record_id','split','component'])
        writer.writerows((rid, split['assignments'][rid], split['clusters'][rid]) for rid in sorted(split['assignments']))
    lookup, index = {}, {}
    for path in sorted(source.glob('*.json')):
        run = read(path)
        if not isinstance(run, dict) or 'query_manifest_sha256' not in run or 'queries' not in run:
            continue
        if not isinstance(run['queries'], list): continue
        pool = sorted({p['passage_id'] for q in run['queries'] for ranked in q['rankings'].values() for p in ranked})
        positions = {pid:i for i,pid in enumerate(pool)}
        compact = {'passage_ids': pool, 'query_ids': [q['query_id'] for q in run['queries']],
                   'rankings': {s:[[positions[p['passage_id']] for p in q['rankings'][s]] for q in run['queries']]
                                for s in run['queries'][0]['rankings']},
                   'lookup_focus': [q['lookup_focus'] for q in run['queries']]}
        identity = digest(compact)
        if identity not in lookup:
            lookup[identity] = path.stem+'.ranks.json'
            (target/lookup[identity]).write_text(json.dumps(compact, separators=(',',':'))+'\n')
        metadata = {k:v for k,v in run.items() if k != 'queries'}
        metadata['compact_ranks_file'] = lookup[identity]
        metadata['compact_ranks_sha256'] = identity
        write(target/(path.stem+'.metadata.json'), metadata)
        write(target/(path.stem+'.summary.json'), read(str(path)+'.summary.json'))
        index[path.stem] = {'full_run_sha256':sha256(path.read_bytes()).hexdigest(), 'ranks':lookup[identity]}
    for name in ['ablations.json','model-revisions.json']:
        if (source/name).exists(): write(target/name, read(source/name))
    if (source/'diagnostics.json').exists():
        d = read(source/'diagnostics.json')
        for name in ['legacy_before','legacy_after']:
            del d[name]['per_query']
        write(target/'diagnostics-summary.json', d)
    write(target/'artifact-index.json', index)
    print(json.dumps({'runs_archived':len(index), 'unique_rank_files':len(lookup)}))


if __name__ == '__main__': main()
