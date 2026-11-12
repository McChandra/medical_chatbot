# Completed grounded-v2 evaluation: do not activate this model pair

The uploaded `HealthBrowse-Grounded-V2-Evaluation.zip` contains all **22 expected records**: eight questions on each of two generator routes and six base-model reviewer controls. The run is complete. Do not repeat the unchanged notebook or retrain the same extraction targets.

## Verified outcome

| Measure | Base Llama 3 8B | QLoRA adapter |
| --- | ---: | ---: |
| Accepted browser answers | 0/5 | 0/5 |
| Accepted buddy answers under the old automated checks | 1/3 | 3/3 |
| Accepted answers containing unfinished sentences | 1/1 | 3/3 |
| Browser median elapsed time, including failed requests | 65.786 s | 120.038 s |
| Recorded deadline failures across eight questions | 1 | 4 |

The base reviewer falsely accepted **2 of 5 negative controls**: management supported only by a disease-mechanism passage, and a causes-only answer that omitted when to seek care. The single positive control passed. These small, selected controls do not estimate general medical accuracy.

No browser answer survived the gateway, so no six-deck response was released. This does not mean retrieval returned no sources; invalid final answers have unassessed deck quality. The adapter's three buddy acceptances are also not successful answers: all contain unfinished text, and its population answer omits prevention despite the reviewer declaring both question facets answered.

## What failed

1. **Text completeness.** Constrained decoding produced parseable JSON while claims often ran into the 180-character boundary. One accepted claim ends “do not become healthy white”. JSON completion did not ensure sentence completion. The adapter frequently copied long source passages rather than producing short complete answers.
2. **Review reliability.** A supported verdict sometimes reflected plausible medical knowledge instead of what the cited passage actually contained. Facet verdicts also missed omissions. A second call to the same base model is not an independent source of clinical truth.
3. **Latency and repair.** Adapter browser generation alone took 55–81 seconds on recorded successful first calls. A full regeneration and review often could not fit the remaining 120-second budget. One LDL adapter call returned a generic inference 503; the exported records do not establish its underlying exception, so an out-of-memory cause must not be asserted.
4. **Prompt conflict.** The generic audience instruction requested multiple sentences per deck while the compact contract allowed one bounded claim. This conflicting instruction has been removed for grounded-v2.

## Implemented after inspecting this run

- Reject unfinished sentence markers, unbalanced parentheses and selected dangling conjunctions before support review. Do not silently truncate, append punctuation or rewrite a model answer as if verified.
- Require direct-answer citations of the relevant evidence type for each non-gap facet. Mechanism evidence cannot alone satisfy a management facet; a causes-only source cannot satisfy a seek-care facet. Unknown source intent fails closed for these typed facets.
- Apply those structural checks again when accepting reviewer verdicts. These are necessary checks, **not semantic entailment**, and can conservatively reject otherwise useful answers when source metadata is incomplete.
- Skip a full retry when the observed first cycle, with a five-second margin, exceeds the remaining deadline. Return a specific timeout/budget code instead of a numeric DOM exception code.
- Preserve the four originally accepted drafts and all six controls as CPU regression fixtures. Replay now blocks all four unfinished answers and both falsely accepted controls, while retaining the positive control. This measures rejection of observed defects, not improved generation quality, recall or medical accuracy.

The new safeguards have not been GPU-evaluated. No model is deployed or enabled by this audit. The existing notebook remains pinned to the completed experiment; it is a historical reproduction, not a request for another run.

## Reproducibility

- Audit date: 12 November 2026.
- Original implementation: `842dab12a047dce6506cd8a99b54b3d84f1706f5`.
- Notebook commit: `99e02e3953ef9720ce4770baf986de62d18079de`.
- Archive SHA256: `0a9e16dcd79b334a2e01fc41e45ca78ef1c1742248a673656087c59b6c6d4d4f`.
- Adapter SHA256: `9fd872b09372d3d079aa7f359e4072cdb66954d0e5e77b130f5a0441a397e5c5`.
- Hardware: Tesla T4, 15,360 MiB; NF4 serving. Exact versions are in the [machine-readable audit](llama3-general-research-002-grounded-v2-evaluation.json).
- ZIP CRC, fixture/runtime agreement, all 23 recorded source hashes, record completeness, summary totals and reviewer-control scores were verified on CPU. Hashes establish consistency, not clinical validity.

Recheck an export without inference:

```bash
python inference/audit_grounded_evaluation.py HealthBrowse-Grounded-V2-Evaluation.zip
```

Optionally pass `--source-root /path/to/pinned-checkout/healthbrowse` to verify the original source hashes. A newer modified checkout should fail that check rather than silently being treated as the evaluated implementation.

## Decision

Keep this adapter and base-reviewer pair in research. More identical training steps, a longer timeout, or a faster host would not by themselves address unsupported claims and missing answer parts. Before another GPU comparison, establish independently reviewed short-answer targets, explicit expected gaps, and a held-out evaluation for completeness and source support. The source-backed browser can remain available with honest excerpt labeling. Public AI synthesis also still requires an authorized inference host and an end-to-end integration test; uploading an adapter ZIP does not provide that host.
