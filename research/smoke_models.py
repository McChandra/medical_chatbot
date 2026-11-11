"""Exercise real model adapters on a small deterministic corpus; no quality score."""
import argparse
import importlib.metadata
from research.evaluate import read, write
from research.data import digest
from research.retrieval import DenseIndex, MedCPTIndex, Reranker, rrf


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', required=True); parser.add_argument('--revisions', required=True)
    parser.add_argument('--output', required=True); parser.add_argument('--device', default='cpu')
    args = parser.parse_args()
    records = sorted(read(args.dataset+'/records.json'), key=lambda r:digest(r['record_id']))[:32]
    texts = [r['answer'][:700] for r in records]
    pins = read(args.revisions)
    dense_name, reranker_name = 'sentence-transformers/all-MiniLM-L6-v2', 'cross-encoder/ms-marco-MiniLM-L-6-v2'
    cache = 'artifacts/phase-iv/model-cache-smoke'
    generic = DenseIndex(texts, dense_name, pins[dense_name]['revision'], args.device, cache)
    medical = MedCPTIndex(texts, pins['ncbi/MedCPT-Query-Encoder']['revision'],
                         pins['ncbi/MedCPT-Article-Encoder']['revision'], args.device, cache)
    reranker = Reranker(reranker_name, pins[reranker_name]['revision'], args.device)
    for record in records[:3]:
        a, b = generic.search(record['question'], 20), medical.search(record['question'], 20)
        reranked = reranker.rank(record['question'], a, texts)
        assert len(a) == len(b) == len(reranked) == 20
        assert set(a) == set(reranked)
        assert len(rrf([a,b], 5)) == 5
    versions = {name:importlib.metadata.version(name) for name in
                ['torch','transformers','sentence-transformers','numpy','scipy','scikit-learn']}
    write(args.output, {'status':'passed', 'scope':'Adapter execution only; not retrieval quality or historical replication',
                        'passages':32, 'queries':3, 'device':args.device, 'model_revisions':pins,
                        'input_record_ids':[r['record_id'] for r in records], 'environment':versions})
    print('Real-model adapter smoke check passed; no quality score reported.')


if __name__ == '__main__': main()
