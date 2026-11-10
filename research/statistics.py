"""Query/cluster resampling, paired comparisons and multiplicity correction."""
from collections import defaultdict
import math
import numpy as np


def wilson(successes, n, z=1.959963984540054):
    if n <= 0 or not 0 <= successes <= n:
        raise ValueError("Require n > 0 and 0 <= successes <= n")
    p = successes / n
    denominator = 1 + z*z/n
    center = (p + z*z/(2*n)) / denominator
    half = z * math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / denominator
    return [max(0., center-half), min(1., center+half)]


def cluster_arrays(values, clusters=None):
    if not len(values) or not np.isfinite(values).all():
        raise ValueError("Finite, nonempty observations required")
    clusters = list(range(len(values))) if clusters is None else clusters
    if len(values) != len(clusters):
        raise ValueError("One cluster ID per query required")
    groups = defaultdict(list)
    for value, cluster in zip(values, clusters):
        groups[str(cluster)].append(float(value))
    return list(groups.values())


def bootstrap(values, clusters=None, iterations=2000, seed=42):
    if iterations < 100:
        raise ValueError("Use at least 100 resamples")
    groups = cluster_arrays(values, clusters)
    totals = np.array([sum(g) for g in groups])
    sizes = np.array([len(g) for g in groups])
    rng = np.random.default_rng(seed)
    means = []
    for _ in range(iterations):
        indices = rng.integers(0, len(groups), len(groups))
        means.append(float(totals[indices].sum() / sizes[indices].sum()))
    return {"mean": float(np.mean(values)), "ci95": np.quantile(means, [.025, .975]).tolist(),
            "queries": len(values), "clusters": len(groups), "resamples": iterations,
            "unit": "cluster" if clusters is not None else "query", "seed": seed,
            "warning": "Few independent clusters; interval is unstable" if len(groups) < 20 else None}


def paired_test(left, right, clusters=None, iterations=5000, seed=42):
    if len(left) != len(right):
        raise ValueError("Use identical ordered query IDs for paired comparisons")
    if iterations < 100:
        raise ValueError("Use at least 100 randomizations")
    delta = np.asarray(right, dtype=float) - np.asarray(left, dtype=float)
    groups = cluster_arrays(delta, clusters)
    totals = np.array([sum(g) for g in groups])
    observed = abs(float(delta.mean()))
    rng = np.random.default_rng(seed)
    extreme = 0
    # Flip all query differences in a dependency cluster together.
    for _ in range(iterations):
        value = abs(float((totals * rng.choice([-1, 1], len(groups))).sum() / len(delta)))
        extreme += value >= observed - 1e-15
    return {"difference_right_minus_left": bootstrap(delta, clusters, iterations, seed),
            "p_two_sided": (extreme + 1) / (iterations + 1),
            "test": "paired cluster sign randomization", "randomizations": iterations}


def holm(p_values):
    if any(not math.isfinite(p) or not 0 <= p <= 1 for p in p_values):
        raise ValueError("Invalid p-value")
    order = sorted(range(len(p_values)), key=lambda i: p_values[i])
    adjusted, previous = [0.] * len(order), 0.
    for rank, index in enumerate(order):
        previous = max(previous, min(1., (len(order) - rank) * p_values[index]))
        adjusted[index] = previous
    return adjusted
