# Grounded v2: evaluate claim support and the full gateway

This is an opt-in development update for the failure modes in the [completed v1 evaluation](releases/llama3-general-research-002-evaluation.md). It preserves the trained adapter and historical results. The focused GPU run is complete and failed the release criteria. [Read the audited results](releases/llama3-general-research-002-grounded-v2-evaluation.md). Neither generator produced an accepted browser answer; the four accepted buddy responses contained unfinished sentences. The model pair is not activated on the public website.

## What changed

- The generator emits short claims and source IDs. The server resolves the selected passages and URLs from its retrieved evidence. Model-authored quotations are no longer required in this protocol. This reduces repeated generated text; the completed T4 run still encountered five gateway deadline failures across both routes.
- Generation uses a JSON schema with at most 180 characters per claim, three direct-answer claims, one claim per deck, and known source IDs. The private GPU server constrains decoding with pinned LM Format Enforcer, then validates completed JSON again. Syntax constraints do not establish factual support.
- Question facets make compound requests explicit. The reviewer checks every direct-answer facet and every claim, seeing only the passages cited for that claim. A missed facet or unsupported claim permits at most one repair when sufficient time remains; a second failure is withheld. Evidence gaps are declared, reviewed and rendered without fabricated citations.
- Retrieval prioritizes question facets before filling domains. Complete, independently scoped diabetes treatment list items can fit the context; arbitrary long paragraphs and unscoped list items are not truncated. Historical staging material is excluded from this profile. Age/population text and hypertension complications are assigned to their relevant domains.
- Targeted CDC passages cover sore-throat course, when to seek care, antibiotics, prevention and strep complications. An NCI passage supports AML-specific complications. Claims using subtype-specific added passages must name the subtype. No source is labeled clinically certified or endorsed by its publisher.

The 120-second total gateway deadline remains. Search generation is capped at 1,100 output tokens and buddy generation at 450, versus the prior compact 2,048-token budget. Review is capped at 700. Shorter limits can cause truncation or omissions; the new evaluation counts failures instead of assuming they are fixed.

## Completed evaluation (historical reproduction)

**No repeat run is requested.** The notebook remains pinned to the completed experiment. New CPU guards reject unfinished sentences and require relevant evidence types for non-gap facets; they do not prove corrected generation quality.

[Open the historical grounded-v2 notebook](https://colab.research.google.com/github/McChandra/medical_chatbot/blob/feature/responsive-healthbrowse-auth/healthbrowse/inference/HealthBrowse_Grounded_V2_Colab.ipynb).

Use a fresh GPU runtime, the existing `HF_TOKEN` secret and the saved `llama3-general-research-002` Drive folder. Do not retrain or rerun the historical 78-generation notebook. Results are saved separately under `evaluation-grounded-v2-001`.

The notebook runs the actual JavaScript gateway against a private authenticated **loopback-only** GPU service. It compares both base and adapter generation on eight selected browser/buddy questions, always using the base model for review. It then runs six reviewer controls derived from the observed citation and compound-question failures. The 22 final records may involve multiple model calls because review and one repair are included.

The loopback service stops at the end. No tunnel, public listener, hosted API or patient-data integration is created. Identity and quota checks use fixed synthetic fixtures, so this is not a live Supabase, UI, concurrency or clinical test. Existing separate tests exercise account and request controls.

Each completed case is written atomically and reused on resume. Code, source, adapter and runtime hashes prevent mixing runs with changed settings. Changed GPU type or package versions require a new evaluation name. Known tokens are redacted from service diagnostics; exported results contain only the fixed public/synthetic benchmark and exclude logs and weights.

Read `summary.json` together with raw outputs in `results.jsonl`:

- `gateway_accepted` means automated source/coverage checks passed, **not** that medical accuracy was established.
- `declared_question_gaps` and deck coverage expose incomplete evidence; an accepted all-gap response is not a successful substantive answer.
- Reviewer false acceptances and false rejections are reported separately from request failures.
- Timing includes the gateway's actual generation/review/repair chain. Timeouts remain failures.

These are development regressions selected after inspecting v1 errors. They must not be treated as an untouched final test set. No clinical release approval is generated automatically.

## Optional gateway configuration after evaluation

**The completed run does not qualify either tested route for public activation.** The settings below document the research protocol. The existing route remains `legacy` by default. A schema-capable private endpoint can opt in with these server-side settings:

```text
MODEL_GENERAL_PROTOCOL=grounded-v2
MODEL_GENERAL_URL=https://YOUR_PRIVATE_HOST/v1/chat/completions
MODEL_GENERAL_ID=healthbrowse-general-qlora
MODEL_GENERAL_REVIEW_ID=healthbrowse-general-base-review
MODEL_GENERAL_CONTEXT_TOKENS=8192
MODEL_GENERAL_KEY=<private server secret>
```

If the base generator performs better in the focused evaluation, select its alias instead; do not assume fine-tuning improved medical answers. Providers without JSON-schema support will fail closed under this profile. Both routes still require evaluation, appropriate clinical review, authorized GPU hosting and a full live integration test before public activation. No deployment settings or keys were changed by this update.

## Evidence provenance and review status

`dist/grounded-sources.json` contains bounded text excerpts, publisher URLs, headings, subtype limits, source dates where verified, retrieval date and text checksums. HTML link/list markup is normalized. All clinical-review flags are false. The local text checksum proves consistency of that snapshot, not currentness of the remote page or correctness of an answer.

Sources checked on 2026-11-12:

- [Sore Throat Basics — CDC](https://www.cdc.gov/sore-throat/about/index.html), page dated 2024-04-17.
- [About Strep Throat — CDC](https://www.cdc.gov/group-a-strep/about/strep-throat.html), page dated 2026-01-15.
- [Acute Myeloid Leukemia Treatment (PDQ®)–Patient Version — NCI](https://www.cancer.gov/types/leukemia/patient/adult-aml-treatment-pdq), publication date not independently verified. This is an AML source, not a prognosis estimate for all leukemia.
- [CDC reuse policy](https://www.cdc.gov/other/agencymaterials.html) and [NCI reuse policy](https://www.cancer.gov/policies/copyright-reuse). Retain attribution and source links, respect exceptions and international reuse requirements. No logos or images are copied, and no institutional endorsement is claimed.

Technical reference: [LM Format Enforcer](https://github.com/noamgat/lm-format-enforcer), pinned to 0.11.3. Its formatting constraint does not provide semantic or medical validation.
