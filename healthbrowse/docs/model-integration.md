# HealthBrowse model-backed answers

## Implementation status

The site previously used deterministic excerpt selection and audience guidance. It did not run an LLM. This change implements a server-side inference gateway, server-owned retrieval, answer/deck schema, source checks, automated review and one correction attempt. Browser search and the closed-by-default buddy call that gateway. Source excerpts remain available during generation and on failure, explicitly labeled when generation is unavailable.

**No Llama or MedGemma endpoint, trained adapter, GPU training result or clinically validated model is included in this release.** Production had only Supabase configuration at inspection. Model integration tests use simulated provider responses. They establish application behavior, not medical accuracy or real model performance. Inference containers and training are prepared but have not been run on a GPU. No visitor conversation is used for training.

## Model choice

| Audience | Initial generator | Adaptation |
|---|---|---|
| General user | `meta-llama/Llama-3.1-8B-Instruct` | Reviewed plain-language RAG examples; LoRA or QLoRA |
| Patient | General endpoint with patient education and safety prompt | Separately evaluate safety and readability; no individual prescribing |
| Medical student | General endpoint with supervised educational prompt | Separately evaluate mechanisms, explanation and educational reasoning |
| Medical professional | `google/medgemma-4b-it` | Clinical terminology and evidence-focused prompt; evaluate against current guidelines |
| Advanced professional | Same MedGemma endpoint, separate technical prompt | Evaluate subtype distinctions, uncertainty and methodological appraisal |

Model IDs are configurable: use the exact model ID served by the endpoint. An adapter is loaded on the inference service; the browser cannot select arbitrary models or adapters. A reading-mode choice changes presentation, not credential verification or permission to access patient data.

The original repository's `models/train.py` / `models/run_training.py` remain available as a FLAN-T5-small experiment. Its reported baseline predictions include incorrect medical answers, so it is not promoted to production. FLAN-T5 can be evaluated as a small seq2seq baseline with shorter passage-level tasks; the provided chat server supports Llama and MedGemma, not T5. BioBERT and PubMedBERT/BiomedBERT are encoder models. They could be adapted and evaluated for entity extraction, retrieval or reranking; they are not drop-in chat generators. No biomedical encoder has been added in this change.

## Request flow

1. The browser resolves the disease and sends the question, reading mode and topic to `/api/ai/answer`. It does not submit clinical evidence, URLs, an endpoint or a model key.
2. The server checks input bounds/privacy patterns and emergencies, verifies the Supabase session, and applies a six-request-per-minute per-account counter in D1. The counter stores no questions or answers. Configure provider-wide spending and concurrency caps too; per-account limits do not stop account-farming.
3. Retrieval uses the existing MedlinePlus public-domain summary index and the attributed historical MedQuAD excerpts. It reserves evidence from each available domain, ranks question overlap and audience source preferences, and assigns source IDs. This retrieval is currently lexical, not neural embedding retrieval. Evidence is bounded to 24 passages / 26,000 characters.
4. The generator receives the precise question, audience instructions, six domain definitions and source passages. A search returns a direct answer plus six expanded decks. A buddy request includes the browser question, active deck and last four user questions; it answers the follow-up without repeating all decks.
5. Every factual statement must identify source IDs and exact supporting quotations. Unknown sources, invented quotes, invalid schemas, missing decks and detected prescribing statements fail validation. Source URLs and dates come only from trusted server records.
6. A second model call checks whether each complete statement follows from its evidence, including subtype, negation, population, timing and causal qualifications, and whether the question was answered. This is a separate call to the **same configured model**, not an independent clinical reviewer. One repair is allowed, followed by another check. Persistent failure returns a labeled excerpt fallback. The total model deadline is 120 seconds; tune against measured latency before launch. No unchecked partial tokens are streamed.
7. Sources and their supporting passages are inspectable beside the answer. Missing evidence stays missing. Generated text is never labeled an exact excerpt or medically certified.

This pipeline mitigates some errors; neither valid citations nor model self-review guarantees factual entailment or clinical reliability. Existing regex privacy/emergency filters are limited, not validated de-identification or triage. The current education corpus is not sufficient for comprehensive professional guideline synthesis. Improving that coverage requires rights-reviewed current guideline passages and study-level evidence, not merely a larger model. Background paper/trial/grant discovery remains separately attributed and does not turn metadata into clinical recommendations.

## Host the model endpoints

The Site Worker cannot hold model weights (128 MB isolate memory). Host inference separately on a GPU service, for example a controlled GPU VM/service or a compatible managed inference endpoint. No paid service or GPU was provisioned by this change.

The included `inference/serve.py` serves an authenticated `/v1/chat/completions` endpoint. It supports a Llama causal LM or the existing MedGemma-4B multimodal model in **text-only** use. It does not add image upload or image interpretation to HealthBrowse.

1. Accept the model's applicable license/terms and obtain authorized weight access. Select and record an exact base-model revision, not a mutable branch.
2. On a CUDA GPU host, build `docker build -t healthbrowse-inference ./inference` and run one model process per GPU allocation. The image requires GPU device/runtime configuration supplied by the host. Test VRAM and output latency with realistic prompts; fitting weights alone is insufficient.
3. Supply these **server secrets/settings** through the host's secret manager or protected environment file:

   ```dotenv
   MODEL_ID=meta-llama/Llama-3.1-8B-Instruct
   MODEL_REVISION=<reviewed-model-commit>
   HF_TOKEN=<authorized-read-token>
   INFERENCE_API_KEY=<random-secret-at-least-32-characters>
   # Optional only after evaluated training:
   ADAPTER_PATH=/models/reviewed-general-adapter
   MAX_INPUT_TOKENS=16000
   ```

   Run a second service with `MODEL_ID=google/medgemma-4b-it`, its pinned revision and a separate key. Do not reuse an incompatible Llama adapter for MedGemma. Keep HF tokens out of Docker layers and repository files.
4. Terminate HTTPS at controlled ingress. Restrict ingress as supported, disable request-body logging, set retention policies, protect the model cache, apply concurrency/spending limits, and ensure ingress timeouts permit generation. The included service rejects concurrent work with 429 rather than building an unbounded GPU queue. Scaling and batching require an appropriate serving runtime and load testing.
5. Verify readiness and authenticated generation directly on the host with synthetic public medical questions. Do not upload real patient records. Validate JSON generation and reviewer outputs. The Python service asks the model for JSON but does not implement constrained token decoding; invalid output is rejected by the gateway. A production engine with grammar-constrained decoding can reduce retries.

## Connect the Site

In the Site's runtime environment settings, configure:

| Key | Value |
|---|---|
| `MODEL_GENERAL_URL` | Full HTTPS endpoint ending in `/v1/chat/completions` |
| `MODEL_GENERAL_ID` | Exact served Llama model ID |
| `MODEL_GENERAL_KEY` | Secret inference bearer key |
| `MODEL_PROFESSIONAL_URL` | Full HTTPS MedGemma endpoint |
| `MODEL_PROFESSIONAL_ID` | Exact served MedGemma model ID |
| `MODEL_PROFESSIONAL_KEY` | Separate secret inference bearer key |

Use the settings/secret interface, not chat messages or browser JavaScript. Redeploy after updating runtime values. Apply the new Drizzle migration for `hb_model_limits`; native Sites deployment handles declared D1 migrations, while standalone deployments must run their normal migration step. Keep Supabase URL/key configured for session validation.

`GET /api/ai/status` exposes only whether each route is configured; it is not a live readiness or quality check. A professional route never silently uses the general endpoint. If unconfigured, the public site retains honest excerpt-based answers with an explicit notice.

## Train the general-user adapter

Install `inference/requirements.txt` in a dedicated training environment. Prepare JSONL containing `topic`, `source_urls`, `license_reviewed: true`, `clinical_reviewed: true`, and `messages` (system, user, assistant). The user content must be the same JSON payload produced by `generationMessages()` in `server/model-evidence.mjs`, including `role: "General reader"`, `mode`, and `evidence`. The assistant target must follow the gateway schema with source IDs and exact quotes. Training is answer-token-only; prompt tokens are masked from loss. Existing question/answer-only MedQuAD rows are **not** already reviewed six-deck targets.

Include direct questions, multipart questions, misspellings, follow-ups, genuine evidence gaps, negation, contradictory sources and instruction-injection cases. Keep all examples from a disease and its publisher source pages in one split; split by disease/source before augmentation. Preserve licenses and source dates. Never mark generated labels as clinically reviewed without actual review.

```bash
python inference/train_adapter.py --train /data/reviewed-train.jsonl \
  --validation /data/reviewed-validation.jsonl \
  --revision <reviewed-model-commit> --output /models/general-adapter \
  --method qlora --validate-only

# Only on the configured GPU host, after input validation:
python inference/train_adapter.py --train /data/reviewed-train.jsonl \
  --validation /data/reviewed-validation.jsonl \
  --revision <reviewed-model-commit> --output /models/general-adapter \
  --method qlora
```

`--method lora` uses the unquantized base; QLoRA uses NF4 4-bit weights and trains LoRA parameters. Training creates an adapter and a manifest with dataset hashes. It does not automatically deploy the adapter. It rejects oversized examples rather than silently truncating evidence. No training data or weights were generated in this change.

Compare the base Llama, trained Llama and existing FLAN-T5 baseline on a separate, frozen test set. Measure direct-answer relevance, claim-support accuracy (human review, not just model scores), citation precision/coverage, six-deck coverage, safe abstention, general-user readability, follow-up quality, patient-safety failures, subgroup behavior, latency and cost. Evaluate professional prompts separately against appropriate recent clinical references. Set release thresholds with clinical reviewers; aggregate similarity/ROUGE scores cannot establish safe medical behavior. Keep the previous model available for rollback.

## Primary technical resources

- [Llama 3.1 model card and license](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct)
- [FLAN-T5 model card](https://huggingface.co/google/flan-t5-base)
- [MedGemma-4B model card](https://huggingface.co/google/medgemma-4b-it)
- [Google MedGemma documentation and limitations](https://developers.google.com/health-ai-developer-foundations/medgemma/model-card)
- [PEFT quantization and QLoRA](https://huggingface.co/docs/peft/en/developer_guides/quantization)
- [QLoRA research paper](https://arxiv.org/abs/2305.14314)
- [BiomedBERT, formerly PubMedBERT](https://huggingface.co/microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract-fulltext)
- [BioBERT implementation](https://github.com/dmis-lab/biobert)

Reviewed 2026-11-06. Model family documentation can describe newer releases; the configured IDs and pinned revisions, not family labels, determine what actually runs.
