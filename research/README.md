# Reproducible medical retrieval evaluation

This replaces ad hoc notebook comparisons with a versioned **evaluation-validity and provenance-gated retrieval** workflow. It does not establish clinical reliability, novelty, or system superiority. The website's six decks, two reading modes, accounts and model gateway are separate from these offline experiments.

## Run the lightweight experiments

Python 3.11 or 3.12; run from the repository root. No cloud account, model API key or GPU is needed for these lexical experiments.

```sh
python -m pip install -r research/requirements.txt
python -m unittest discover -s research/tests -v
git clone https://github.com/abachaa/MedQuAD.git ../MedQuAD
python -m research.evaluate prepare --medquad ../MedQuAD --output artifacts/phase-iv/dataset
python -m research.evaluate run --dataset artifacts/phase-iv/dataset --output artifacts/phase-iv/lexical.json
python -m research.evaluate run --dataset artifacts/phase-iv/dataset --output artifacts/phase-iv/prefix.json --prefix
python -m research.evaluate run --dataset artifacts/phase-iv/dataset --output artifacts/phase-iv/no-verification.json --no-verification
python -m research.evaluate run --dataset artifacts/phase-iv/dataset --output artifacts/phase-iv/gate-1000.json --vocabulary-gate 1000
python -m research.evaluate run --dataset artifacts/phase-iv/dataset --output artifacts/phase-iv/gate-5000.json --vocabulary-gate 5000
python -m research.compare --baseline artifacts/phase-iv/lexical.json --candidates artifacts/phase-iv/prefix.json artifacts/phase-iv/no-verification.json artifacts/phase-iv/gate-1000.json artifacts/phase-iv/gate-5000.json --output artifacts/phase-iv/ablations.json
python -m research.diagnostics --dataset artifacts/phase-iv/dataset --medquad ../MedQuAD --output artifacts/phase-iv/diagnostics.json
```

The loader reads Git objects at `577bd37b96c02d1833b2c9eed2de9f96964e96cb`, regardless of the working-tree checkout. Collections 10–12 are excluded: their answers were removed upstream for copyright. This is a historical snapshot, not current clinical guidance. Do not publish new source text without reviewing publisher rights.

The new dataset contains 16,345 records: 48 normalized Q/A/focus duplicates and 19 records lacking an answer or focus are removed from 16,412 rows. The separate original four-column preprocessing reproduces 16,359 by removing 48 duplicates and five missing answers while retaining 14 unknown-focus rows. These are different, explicitly recorded protocols. No step explains the old notebook count of 15,864.

Splitting connects records sharing a normalized disease, question **or answer**, including transitive links. Entire components go into one split; proportions target component counts and can differ substantially at row level. Current counts: 13,791 train, 1,363 validation, 1,191 test. All normalized exact overlap counts are zero. Disease synonyms, near-duplicates and model pretraining contamination remain unmeasured. `features.split_data` now defaults to this protocol; `protocol="legacy_question"` is available only for historical replication.

Outputs include records, alias IDs, split assignments, component IDs, passage offsets, hashes, exact query IDs, top-five ranks, model/configuration/environment metadata, paired statistics and warnings. Full local artifacts are in `artifacts/phase-iv/`; compact committed records are in [results](results/). The large source text and blank annotation pools can be deterministically regenerated; they are not included as new public content assets.

## Optional dense, domain-adapted and reranked runs

Install `research/requirements-dense.txt` in an isolated environment. Record `python -m pip freeze` with the run. Obtain model repository commit hashes from the model provider and replace each placeholder below with an actual 40-character revision. Moving aliases such as `main` fail validation. Check model licenses before downloading. A real-weight smoke check passed for MiniLM, the cross-encoder and both MedCPT encoders on 32 passages and three queries. **The full neural benchmark is not complete.** Initial full-corpus CPU runs were interrupted while adding resumable caches; no partial model score is reported. There is no CUDA device here. Use the commands below on suitable compute for the full comparison.

```sh
python -m research.evaluate run --dataset artifacts/phase-iv/dataset --output artifacts/phase-iv/dense.json --encoder sentence-transformers/all-MiniLM-L6-v2 --encoder-revision FULL_MODEL_COMMIT
python -m research.evaluate run --dataset artifacts/phase-iv/dataset --output artifacts/phase-iv/reranked-20.json --encoder sentence-transformers/all-MiniLM-L6-v2 --encoder-revision FULL_MODEL_COMMIT --reranker cross-encoder/ms-marco-MiniLM-L-6-v2 --reranker-revision FULL_RERANKER_COMMIT --depth 20
python -m research.evaluate run --dataset artifacts/phase-iv/dataset --output artifacts/phase-iv/medcpt.json --medcpt --query-revision FULL_QUERY_MODEL_COMMIT --article-revision FULL_ARTICLE_MODEL_COMMIT
```

Each dense run also evaluates BM25 and TF-IDF on identical queries and adds BM25+dense reciprocal-rank fusion. Without a dense model, the separately named BM25+TF-IDF fusion is lexical-only. MedCPT uses separate NCBI query/article encoders, CLS representations and inner-product ranking. Queries are truncated to 64 model tokens and article inputs to 512; generic encoder limits follow the pinned model. Report truncation effects in the neural study. BioBERT/PubMedBERT alone are not conversational answer generators.

Embedding batches are cached under `artifacts/phase-iv/model-cache`, keyed by text, model revision, device, runtime versions and retrieval code. Checksums detect altered/incomplete shards; reruns resume safely. Source edits during an experiment abort result publication.

Repeat neural runs with `--prefix` and rerank depths 20, 50, 100. Depth is the candidate pool, not the number of judged results. Baseline ranking metrics use five passages. Freeze the validation protocol before test-set evaluation (`--split test`); the test questions have not been scored in this revision.

## Independent relevance judgments

```sh
python -m research.evaluate pool --runs artifacts/phase-iv/lexical.json artifacts/phase-iv/prefix.json --output artifacts/phase-iv/annotation
# Two independent humans complete reviewer-A.csv and reviewer-B.csv.
python -m research.evaluate agreement --a artifacts/phase-iv/annotation/reviewer-A.csv --b artifacts/phase-iv/annotation/reviewer-B.csv --output artifacts/phase-iv/agreement.json
# Adjudicate disagreements in a separate CSV; preserve both original files.
python -m research.evaluate grade --run artifacts/phase-iv/lexical.json --adjudicated artifacts/phase-iv/annotation/adjudicated.csv --output artifacts/phase-iv/graded.json
```

Use the [protocol and rubric](PROTOCOL.md). Pool every preregistered system before annotation. Ranking/system names are hidden and row order differs across reviewers. Blank grades are rejected, never silently interpreted as irrelevant. `grade` reports pooled nDCG, pooled recall, P@5 and judged fraction; queries with unjudged retrieved passages are excluded from relevance means and counted explicitly. Independent review cannot be replaced by two prompts to the same model. Agreement is descriptive linear-weighted Cohen's kappa; its uncertainty is not computed here.

## What the numbers mean

| Measure | What it establishes | What it does not establish |
| --- | --- | --- |
| Focus Match@5 / substring accuracy | Disease-label agreement | Passage relevance |
| Gold-record Hit@5 / MRR@5 | Recovery of a chunk from the original Q/A record | Sufficiency of that chunk, alternate relevant answers or medical accuracy |
| Human P@5 / pooled nDCG / pooled recall | Judged question relevance within the reviewed pool | Exhaustive corpus relevance or clinical safety |
| Copilot coverage | At least one excerpt was returned | That it answers the question |
| Provenance acceptance | Stored offsets/text/identity match | Entailment, current guidance, quality of original source |

Paired randomization swaps whole dependency clusters, percentile bootstrap resamples clusters, and Holm adjusts the declared comparison family. These choices do not repair selection bias or create power from a small independent sample. See [audit response](AUDIT_RESPONSE.md), [results](results/README.md), and [related work](RELATED_WORK.md).

To reproduce the adapter smoke check (not a performance evaluation):

```sh
python -m research.smoke_models --dataset artifacts/phase-iv/dataset --revisions research/results/model-revisions.json --output artifacts/phase-iv/neural-smoke.json
```

The checked-in model revision list records the exact public provider revisions used on 10 November 2026. MedCPT model cards identify their license as public domain; retain the original model license notices. The model card notes that released weights differ slightly from those used in its paper, so do not attribute published MedCPT scores to this run.
