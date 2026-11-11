# Research protocol and review rubric

## Questions and scope

RQ1: How far can disease-label matching overstate answer retrieval on templated consumer-health questions? RQ2: What do exact provenance checks reject, and what unsupported interpretations remain undetected? RQ3: How do lexical, generic dense, biomedical dense, hybrid and reranked systems compare on the **same human-judged queries**?

Candidate contribution: a reproducible failure analysis of label-based evaluation and source-integrity gates in a constrained medical research browser. Novelty is not established. No clinical decision-making study or claim of superiority is included.

## Data and splits

Use the pinned MedQuAD revision and complete loader manifest. Keep 14 missing-focus records out of disease-disjoint evaluation, recording their IDs. Deduplicate normalized Q/A/focus while retaining aliases. Build connected components on normalized focus, exact question and exact answer; assign entire components with seed 42. Report actual counts, the largest component, and overlap checks. Do not tune grouping rules to maximize scores. Source families are not held out in this split; cross-source and externally collected consumer questions are separate future evaluation tracks.

The public retrieval corpus includes every retained answer, including validation/test answers. This is intentional answer retrieval, **not closed-book generalization**. Generation training may use only training components; evaluate on held-out components. Retrieving the public corpus at test time must be stated. Deduplication cannot detect synonyms, near paraphrases, unknown foundation-model pretraining exposure or source-specific stylistic leakage.

## Locked comparisons and ablations

Before human annotation, archive code hashes, dataset/split/query manifests, configurations, seeds, model revisions and environment. Use full validation, or an explicitly recorded hash-based sample independent of system outcome. Use the same question and corpus manifests for all systems. The held-out test set remains unscored until model/parameter decisions are frozen.

Baselines: substring longest-focus lookup (label diagnostic only), TF-IDF, BM25 (k1=1.2,b=.75), generic dense, MedCPT domain-adapted dense, BM25+dense RRF (constant=60), and generic dense plus cross-encoder. BM25+TF-IDF fusion is an additional lexical control, not a substitute for a neural hybrid. No oracle record IDs or focus labels are used for ranking. The optional vocabulary gate uses the known topic context, so it is a separate scoped-reader experiment.

One-factor ablations: disease prefix off/on; dense candidate depth 20/50/100 before reranking; vocabulary gate off/top-1,000/top-5,000 training-question terms; exact provenance gate off/on. A vocabulary gate rejects a query when a non-topic token is outside the learned vocabulary. Its coverage cost must be reported. It is an offline proxy for vocabulary gating, not the exact production allowlist. No-verification flags exist only in the offline runner and never disable serving safety checks.

Primary automatic comparison family: each baseline against BM25 on gold-record Hit@5. Primary human family, when judgments exist: each baseline against BM25 on pooled nDCG@5. Predeclare all ablation contrasts together and use `research.compare` on that whole family. Label-matching metrics are diagnostics, not primary relevance outcomes. Avoid post hoc selection of only favorable metrics or queries.

## Blinded relevance annotation

Use two independent reviewers with consumer-health information expertise; at least one clinician should review clinical interpretation/safety. Declare affiliations and conflicts. Neither reviewer sees system names, ranks, success labels or the other reviewer's grades. Preserve original judgments. Pilot the rubric on separate training examples, then freeze it. Do not use the historical ten regression-selected questions as a representative sample.

| Grade | Definition |
| --- | --- |
| 0 | Irrelevant, wrong disease/context, or does not address the question |
| 1 | Same topic or tangential background; does not materially answer the requested information |
| 2 | Partially answers the question, with a material omission or qualification still needed |
| 3 | Directly answers the requested aspect with sufficient context for the stated task |

Record clinical support separately in the `support` column (`supported`, `unsupported`, `uncertain`, `not_applicable`) with notes for outdated, harmful or population-mismatched material. Relevance grade alone is not clinical validation. The current evaluator scores relevance only; support labels require a separately reviewed analysis before unsupported-claim-rate claims can be made.

Compute exact agreement and linear-weighted Cohen's kappa before adjudication. Undefined kappa (all grades identical) must remain undefined. Report disagreements and their causes, then resolve them with an independent adjudicator or documented consensus. Do not treat passage judgments from one question as independent. Cluster-resampled agreement uncertainty and reviewer credentials remain required for publication; the current tool reports only descriptive agreement.

Pool top-five passages from all locked systems and ablations. Add a random nonretrieved sample if estimating pool bias; record its sampling rule. Pooled recall and pooled nDCG are relative to known judgments, not exhaustive relevance. Unjudged results are missing, never assumed negative. All comparisons must disclose the common judged query denominator and exclusions; unequal annotation coverage can bias comparisons.

## Statistics

Report per-query outcomes, means, 95% percentile bootstrap intervals and paired two-sided randomization tests. Resample/swap complete connected disease/answer clusters; query-only resampling is available for truly independent query sets. Holm controls the declared family-wise error rate at 0.05. Report effect sizes alongside adjusted p-values. Statistical significance is not clinical importance. Related disease synonyms can still violate the independence assumption.

Wilson intervals describe binary independent-unit proportions; never apply them to 50 passages as if ten underlying questions were 50 independent samples. Audit intervals derived from rounded historical percentages are illustrative. Overlapping marginal confidence intervals do not constitute a paired significance test. Small-cluster estimates should be treated as unstable rather than definitive.

## Verification, coverage and release boundaries

The synthetic integrity control includes intact quotes and altered text, record IDs, focus labels, URLs, offsets and hashes. Its perfect detection of designed attacks, if observed, establishes only those programmed checks. Intact but irrelevant, outdated, incomplete or misleading sources can pass. A semantic-support study must use separately annotated claims and measure false acceptance, false rejection, coverage and correct abstention on the same inputs with verification on/off.

The legacy Python copilot's eight-deck probe is reported separately from the hosted six-deck system. Empty residual queries previously admitted arbitrary deck-one excerpts; the patch requires a definition-like clause in the body. Treatment plurals and risk-question function words are normalized. This intentionally conservative heuristic can reject valid definitions and is not a semantic verifier.

## Threats to validity and publication gates

Construct: label agreement, record recovery, coverage and integrity are distinct from clinical correctness. Internal: old notebook artifacts remain absent; new splits/chunks cannot recreate them. External: templated NIH-style questions and historical sources do not represent all user requests, diseases, languages or current care. Statistical: few independent diseases, selected examples, multiple comparisons and annotator dependence limit inference.

Before a performance/clinical paper: complete pinned neural runs and reranker ablations; collect independent graded relevance and clinical-support judgments; assess agreement uncertainty; add external consumer-question evaluation; document errors and source rights; and obtain appropriate institutional review/governance for any human or patient study. Usability/time-to-answer and business outcomes remain separate prospective studies. No patient data are needed for this offline public-corpus revision.
