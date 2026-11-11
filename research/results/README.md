# Measured Phase IV revision results

Executed 10 November 2026 on the pinned MedQuAD snapshot. These are **new protocol results**, not exact reproductions of MQ-017/MQ-018 or the audit's separately rebuilt split. The current hosted app was not deployed or clinically evaluated in this work.

## Data verification

- The original four-column preprocessing reproduces **16,359** records from 16,412 rows (48 duplicates, five missing answers removed).
- The new known-focus protocol retains **16,345** records, additionally excluding 14 missing-focus records. It produces **29,345** sentence-aware, 160-word-bounded chunks.
- Connected focus/question/answer grouping produces 4,214 components. The largest has 2,117 records; proportions therefore differ at row level: **13,791 train / 1,363 validation / 1,191 test**. All measured normalized exact question/answer/focus overlaps are zero. Synonyms and near-duplicates remain unmeasured.
- Validation comprises 1,363 queries in 421 components. **The test set has not been scored.**
- The checked-in clinical passage asset was rebuilt byte-identically. SHA-256: `5c8c33590e6ca0c775b24a1b4f10e69db836e3cfd3ae582aa055f612538a49c4`.
- The notebook's **15,864** cleaned-record count and original **38,544**-passage artifacts remain unreconciled.

## Lexical retrieval and label control

All methods below use the same frozen queries and corpus. Parentheses are 95% cluster-bootstrap intervals, not clinical confidence.

| System | Focus Match@5 | Gold-record Hit@5, no prefix | Gold-record Hit@5, disease prefix |
| --- | --- | --- | --- |
| bm25 | 91.6% | 62.4% (58.2–66.7) | 73.1% (69.2–77.0) |
| tfidf | 88.3% | 55.4% (50.9–60.1) | 65.4% (61.2–69.8) |
| fusion_bm25_tfidf | 91.3% | 59.5% (55.3–63.8) | 70.1% (66.1–74.2) |

Longest-focus substring lookup, which retrieves no passages, has **99.4% (99.0–99.8)** label accuracy. It is not directly comparable to a relevance score. Its high value demonstrates why explicit disease names can make this label metric easy. Neither label matching nor recovery of a chunk from the original answer establishes that the chunk answers the question.

Adding a disease prefix improves BM25 gold-record Hit@5 by about **10.6 percentage points** on this validation protocol. The paired cluster-randomization/Holm result is recorded in `ablations.json`; this is an automatic record-recovery result, not superiority on human relevance. Generic/biomedical dense superiority cannot be inferred from these lexical numbers.

The top-1,000/top-5,000 training-vocabulary gates do not change these rankings: after removing the topic words, the templated validation vocabulary fits both gates. This absence of effect does not show coverage on arbitrary real user questions. The provenance on/off runs are also identical because the imported passages are intact; this is expected and does not establish semantic verification effectiveness.

## Legacy copilot and provenance probes

The 581-question, eight-deck Python probe reproduces **244/581 (42.0%)** any-excerpt coverage before the patch. After requiring a definition-like body clause and normalizing treatment/risk wording, coverage is **186/581 (32.0%)**. The decrease is reported, not hidden: definition/information coverage falls from 191/191 to 86/191 when the arbitrary deck-one shortcut is removed. The conservative rule can also reject genuine definitions.

Treatment coverage rises from 0/103 to 5/103; risk/susceptibility from 0/66 to 43/66; symptoms remain 45/53. These are returned-excerpt counts **without relevance grades**. They concern the legacy Python service, not the newer hosted six-deck browser.

The synthetic integrity check accepts 100 intact passages and rejects 100 examples of each of six designed alterations (text, URL, focus, record ID, offset, hash). Its no-verification control accepts all 700 inputs. This tests known corruption patterns only. Intact but irrelevant, outdated or misleading evidence can still pass; no hallucination-detection sensitivity or clinical accuracy is claimed.

## Reproducibility and unfinished work

`split-manifest.csv` retains every split/component assignment. `*.ranks.json` retains ordered query IDs, passage-ID dictionaries and top-five index lists. Identical runs reuse one rank file and preserve separate configurations. The metadata, artifact index and summary files retain hashes and environment details. Full medical texts and two randomized blank reviewer CSVs (11,198 unique pooled pairs for the lexical/prefix runs) can be regenerated with the documented commands. Include future neural outputs in the pool before final annotation.

Human relevance, clinical support labels, annotator agreement, clinical correctness, prospective usability and final neural comparisons are **not measured in these results**. Do not treat the preserved historical notebook percentages as independently verified. The initial literature review is not a completed systematic review or novelty finding.

## Validation status

- 25 methodology tests passed, including overlap isolation, metric separation, strict incomplete judgments, paired statistics, blind pools and cache integrity.
- Five legacy copilot tests passed. One HTTP integration test was skipped because the environment lacks an application dependency (`itsdangerous`); HTTP/auth deployment is not verified by this work.
- Python compilation and diff whitespace checks passed.
- Real MiniLM, MedCPT query/article encoder and cross-encoder execution passed on a deterministic **32-passage / three-query smoke corpus**. No quality score is published for it. Model revisions and runtime versions are recorded in `neural-smoke.json`. Full-corpus CPU runs were interrupted while adding resumable caching; their partial logs contain no completed benchmark. Full neural/reranker-depth experiments remain pending and can use the new cache on suitable compute.
