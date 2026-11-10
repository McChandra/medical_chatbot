"""Do not conflate a label match, record recovery, relevance or clinical accuracy."""
import math
from research.data import normalize


def retrieval_metrics(query, ranked, qrels=None, k=5):
    if k <= 0 or len({p['passage_id'] for p in ranked}) != len(ranked):
        raise ValueError("Positive k and unique passage IDs required")
    top = ranked[:k]
    matches = [normalize(p["focus_area"]) == normalize(query["focus_area"]) for p in top]
    gold = [p["record_id"] == query["record_id"] for p in top]
    result = {f"focus_match@{k}": float(any(matches)), f"gold_record_hit@{k}": float(any(gold)),
              f"gold_record_mrr@{k}": next((1/(i+1) for i, hit in enumerate(gold) if hit), 0.),
              "returned": len(top)}
    if qrels is None:
        return result
    if any(type(v) is not int or v not in range(4) for v in qrels.values()):
        raise ValueError("Judgments must be integer grades 0..3")
    judged = sum(p["passage_id"] in qrels for p in top)
    result[f"judged_fraction@{k}"] = judged / len(top) if top else 1.
    # Strict incomplete-judgment policy: never silently count unjudged as irrelevant.
    complete = judged == len(top)
    grades = [qrels[p["passage_id"]] for p in top] if complete else []
    positives = sum(g >= 2 for g in qrels.values())
    ideal = sum((2**g - 1)/math.log2(i+2) for i, g in enumerate(sorted(qrels.values(), reverse=True)[:k]))
    dcg = sum((2**g-1)/math.log2(i+2) for i, g in enumerate(grades))
    result.update({f"precision@{k}": sum(g >= 2 for g in grades)/k if complete else None,
                   f"pooled_recall@{k}": sum(g >= 2 for g in grades)/positives if complete and positives else None,
                   f"pooled_ndcg@{k}": dcg/ideal if complete and ideal else None})
    return result
