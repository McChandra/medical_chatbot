# Evaluation decision: keep this adapter in research

Reviewed on 2026-11-12. The uploaded `HealthBrowse-Adapter-Evaluation.zip` contains all **78 expected, unique model results**: both base and adapter for 12 production-prompt questions, two synthetic review controls and 25 separate extraction holdouts. Archive CRC, fixture hashes and the three evaluator source hashes match the pinned experiment. All 78 deterministic checks were re-scored with no discrepancies, and the saved summary reproduces exactly. This is a completed evaluation run, not an execution failure.

**Decision: do not activate this adapter as the public general-user model yet.** It improved the tested output format, but the raw answers show unsupported claim-to-citation relationships, incomplete question answering, sparse source coverage and latency incompatible with the current gateway for at least one query. These are engineering/evidence findings, not a clinician's approval or an estimate of clinical accuracy.

## Recorded results

| Task | Base Llama | QLoRA adapter | What this measures |
| --- | ---: | ---: | --- |
| Browser format/source checks | 0/5 | 3/5 | JSON shape, claim limits, source IDs and exact quote membership |
| Buddy format/source checks | 0/7 | 6/7 | Same checks for follow-up answers |
| Separate extraction holdouts | 0/25 | 25/25 | Performance under the short copying/extraction prompt |
| Synthetic reviewer controls | 2/2 | 2/2 | Two simple reviewer-contract examples only |

The adapter's combined production-prompt format result is **9/12 (75%)**, not 75% medical accuracy. The base model's 0/12 is a contract failure under these prompts, not evidence that it has no medical knowledge. Most base outputs have malformed JSON or place `decks` inside `answer`. The adapter failures are malformed JSON for untreated leukemia course and hypertension, plus an overlength LDL claim (the validator's error wording also mentions prescription checks, but the observed LDL defect is length).

Of the three valid browser outputs, leukemia populated 5/6 decks, sore throat 2/6 and diabetes 4/6. That is **11 populated and 7 empty slots across valid browser outputs**. Two invalid browser outputs are unassessable, not an additional 12 measured empty decks. No valid browser response populated all six decks. In these three valid outputs the supplied non-overview deck coverage was used; the gaps cannot be repaired by asking a model to invent more content. Source/domain correctness still requires review: an AML staging excerpt is currently offered under prognosis/complications.

The original summary's `answered` field means only a nonempty direct-answer array. Its `empty_search_decks` counts an invalid output as six empty decks. [The CPU audit](../audit_evaluation.py) reports these concepts separately without changing the historical evaluation files. [Audited metrics](llama3-general-research-002-evaluation.json) retain all suite/route/mode denominators.

## Evidence-support failures visible in the raw answers

These cases pass quote/format checks yet are not fully supported by their **cited passage**. This does not assert that every statement is medically false; it establishes that the citation does not substantiate the response.

| Case ID | Observed problem |
| --- | --- |
| `leukemia-outlook` | The answer lists complications and marrow failure, but cites an excerpt about the absence of a standard adult AML staging system. |
| `buddy-treatment` | The answer adds antibiotic efficacy, complications and resistance claims while citing only a list of sore-throat causes. |
| `diabetes-management` | The direct answer adds treatment modalities while its citation explains insulin/glucose dysfunction and says management is possible; it does not supply those treatment details. |
| `sore-throat-personal` | The question asks both causes and when to seek care, but the answer addresses causes only. A deck also combines causes with anatomy while citing only the anatomy passage. |
| `leukemia-population` | The answer adds risk factors beyond its age-risk quote and does not address the prevention part of the question. |

The existing gateway's automated reviewer is supposed to reject these mismatches, but this experiment evaluated first-pass generation and two separate synthetic review controls. **It did not send these actual generated claims through the reviewer or repair path.** Two easy controls therefore do not establish detection of these failures. Both reviewers called the unsupported cure control “contradicted” rather than “insufficient”; it was safely rejected, but that distinction also needs evaluation.

## Response time and instruction adherence

| Adapter task | Median per generation | Range |
| --- | ---: | ---: |
| Browser search | 98.320 s | 51.344–129.785 s |
| Buddy follow-up | 15.240 s | 12.248–22.922 s |

These are measured in this run, before gateway networking, support review or repair. Hardware identity and package runtime metadata are not included in the exported evaluation manifest, so these are not a general hardware benchmark. The leukemia overview alone took **129.785 seconds**, exceeding the gateway's 120-second total deadline. Replaying its valid draft through the actual compact-review planner requires two review batches on top of generation.

Eight of the nine format-passing adapter production outputs violate at least one requested 200-character claim/quote limit. The current deterministic validator allows up to 600 characters; therefore its pass does not imply the stricter prompt limit was followed. Extensive excerpt copying is consistent with the original extraction targets and contributes to lengthy responses, but this run does not isolate training targets as the sole cause of latency or errors.

## Next development work

1. Add the observed citation mismatches, compound-question omissions and subtype/domain errors as explicit negative controls. Evaluate actual generated claims through the reviewer and repair path; report false acceptance as well as JSON compliance.
2. Improve retrieval and review the source labels for missing domains. Preserve source scope, dates and permissions; never populate six decks with unrelated evidence.
3. Prepare short, direct, source-supported targets and evidence-gap examples in the existing review packet. Have them actually reviewed before treating them as clinically reviewed training data. More steps on the same copying targets are not a demonstrated remedy.
4. Align generation constraints with the validated contract and test shorter outputs/hosting performance. Do not increase the timeout and call that an answer-quality fix.
5. Re-evaluate changed components on development cases, keep a new untouched final test set if findings influence further training, and test the full authenticated gateway on an authorized GPU host before public integration.

No new training, model weights, hosting endpoint or clinical approval is supplied by this audit. The original completed adapter and evaluation are preserved; there is no need to repeat the unchanged 78-generation run.

Reproduce the completeness and recorded-metric audit from `healthbrowse/` without a GPU:

```bash
python inference/audit_evaluation.py /path/to/HealthBrowse-Adapter-Evaluation.zip
```

Provenance: evaluation ZIP SHA-256 `693228c1701f758675af5d4d23818f350daeab7abd1318ea0a6a56fa4aaeed66`; adapter SHA-256 `9fd872b09372d3d079aa7f359e4072cdb66954d0e5e77b130f5a0441a397e5c5`; evaluation source commit `cc573995880e62755c7005f8a3a5c1d77179f77d`. The uploaded archive remains the source of the raw outputs; neither weights nor credentials are published here.
