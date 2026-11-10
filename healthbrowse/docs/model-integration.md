# HealthBrowse model-backed answers

## Implementation status

The site previously used deterministic excerpt selection and audience guidance. It did not run an LLM. This change implements a server-side inference gateway, server-owned retrieval, answer/deck schema, source checks, automated review and one correction attempt. Browser search and the closed-by-default buddy call that gateway. Source excerpts remain available during generation and on failure, explicitly labeled when generation is unavailable.

**The General route is wired to the requested Hugging Face base model, but no HF token, trained adapter, GPU training result or clinically validated model is included in this release.** The Clinicians route is configured separately for DR7; General still has no Hugging Face credential at inspection. A configured model ID does not establish working inference. Model integration tests use simulated provider responses. They establish application behavior, not medical accuracy or real model performance. Inference containers and training are prepared but have not been run on a GPU. No visitor conversation is used for training.

## Model choice

| User type | Generator route | Response style |
|---|---|---|
| General | `meta-llama/Meta-Llama-3-8B-Instruct:featherless-ai` via Hugging Face | Plain-language, cited education; QLoRA preparation uses the same base without the provider suffix |
| Clinicians | DR7 API ID `medgemma-4b-it` (dedicated-weight base: `google/medgemma-4b-it`) | Clinical terminology, diagnostic considerations and evidence limitations |

Only these two choices appear in the research desk and account settings. The specialty selector has been removed. Existing Patient/Medical student preferences map to General, and Medical professional/Advanced professional preferences map to Clinicians. Stored IDs remain `General reader` and `Medical professional` for account compatibility.

Model IDs are configurable: use the exact model ID served by the endpoint. An adapter is loaded on the inference service; the browser cannot select arbitrary models or adapters. A reading-mode choice changes presentation, not credential verification or permission to access patient data.

The original repository's `models/train.py` / `models/run_training.py` remain available as a FLAN-T5-small experiment. Its reported baseline predictions include incorrect medical answers, so it is not promoted to production. FLAN-T5 can be evaluated as a small seq2seq baseline with shorter passage-level tasks; the provided chat server supports Llama and MedGemma, not T5. BioBERT and PubMedBERT/BiomedBERT are encoder models. They could be adapted and evaluated for entity extraction, retrieval or reranking; they are not drop-in chat generators. No biomedical encoder has been added in this change.

## Request flow

1. The browser resolves the disease and sends the question, reading mode and topic to `/api/ai/answer`. It does not submit clinical evidence, URLs, an endpoint or a model key.
2. The server checks input bounds/privacy patterns and emergencies, verifies the Supabase session, and applies a six-request-per-minute per-account counter in D1. The counter stores no questions or answers. Configure provider-wide spending and concurrency caps too; per-account limits do not stop account-farming.
3. Retrieval uses the existing MedlinePlus public-domain summary index and the attributed historical MedQuAD excerpts. It reserves evidence from each available domain, ranks question overlap and audience source preferences, and assigns source IDs. This retrieval is currently lexical, not neural embedding retrieval. Retrieval is bounded to 24 passages / 26,000 characters before the model-specific context budget is applied. The requested Llama 3 model has an 8,192-token context; its profile selects complete passages across domains, retains their qualifiers, and uses conservative UTF-8 byte bounds with output/template reserves. It never silently cuts the question or a passage. Six decks remain present, with explicit gaps where retrieved evidence is insufficient.
4. The generator receives the precise question, audience instructions, six domain definitions and source passages. A search returns a direct answer plus six expanded decks. A buddy request includes the browser question, active deck and last four user questions; it answers the follow-up without repeating all decks.
5. Every factual statement must identify source IDs and exact supporting quotations. Unknown sources, invented quotes, invalid schemas, missing decks and detected prescribing statements fail validation. Source URLs and dates come only from trusted server records.
6. Subsequent model calls check whether each complete statement follows from its evidence, including subtype, negation, population, timing and causal qualifications, and whether the question was answered. These are separate calls to the **same configured model**, not an independent clinical reviewer. For the short-context profile, review is batched when needed; every claim and the complete direct answer must pass before display. One repair is allowed, followed by another check. Provider access, credit, model configuration and capacity failures return specific errors without repeated calls. Persistent failure returns a labeled excerpt fallback. The total model deadline is 120 seconds; tune against measured latency before launch. No unchecked partial tokens are streamed.
7. Sources and their supporting passages are inspectable beside the answer. Missing evidence stays missing. Generated text is never labeled an exact excerpt or medically certified.

This pipeline mitigates some errors; neither valid citations nor model self-review guarantees factual entailment or clinical reliability. Existing regex privacy/emergency filters are limited, not validated de-identification or triage. The current education corpus is not sufficient for comprehensive professional guideline synthesis. Improving that coverage requires rights-reviewed current guideline passages and study-level evidence, not merely a larger model. Background paper/trial/grant discovery remains separately attributed and does not turn metadata into clinical recommendations.

## Connect the requested Hugging Face base model

The backend implements the equivalent of the supplied OpenAI-compatible Python call using native server `fetch`; no Python process or OpenAI SDK is needed in the browser or Worker.

```dotenv
MODEL_GENERAL_URL=https://router.huggingface.co/v1/chat/completions
MODEL_GENERAL_ID=meta-llama/Meta-Llama-3-8B-Instruct:featherless-ai
MODEL_GENERAL_CONTEXT_TOKENS=8192
# Set HF_TOKEN as a secret in the server runtime, not in source control.
```

Create a fine-grained Hugging Face token with **Make calls to Inference Providers** permission. Confirm model/provider access and available inference credits. Add the token as the server secret `HF_TOKEN`, then redeploy. `MODEL_GENERAL_KEY` is an optional explicit override. An HF token is used only for the exact Hugging Face chat URL and General route; it is never reused for Clinicians or sent to a custom endpoint. The URL above is the full REST URL, whereas the Python SDK uses `https://router.huggingface.co/v1` as its `base_url`.

The token alone can enable the default General route. Production explicitly records the URL/model/context settings as well. `/api/ai/status` stays unconfigured until a credential exists. After configuration, sign in to HealthBrowse and test a public question such as “What causes sore throat? How is it treated?”, its six decks, and a buddy follow-up. Check citations, missing-evidence sections, rate limits and provider failures. Do not treat a green configuration status as a live inference or clinical-quality test.

**This model ID serves the base model. It does not apply our QLoRA weights.** No training is triggered by a completion call. Keep the base model as the evaluated baseline; activate a separately evaluated adapter deployment only after training and comparison.

## Clinicians through DR7

Use the provider's documented OpenAI-compatible endpoint and MedGemma ID:

```dotenv
MODEL_PROFESSIONAL_URL=https://dr7.ai/api/v1/medical/chat/completions
MODEL_PROFESSIONAL_ID=medgemma-4b-it
# MODEL_PROFESSIONAL_KEY is a server secret; never put the real key in this file.
```

The provided key is stored as a secret in the production runtime, separate from Hugging Face. This route uses the existing clinical audience prompt, server-owned sources, six-deck schema, citation checks and support review. The provider model name is configuration, not proof of independently verified model provenance, medical certification or clinical suitability.

DR7 documents 401 for invalid keys, 402 for insufficient credit and 429 for rate limits. The gateway returns distinct safe messages without repeating these requests. A stored key does not prove a funded account or successful inference. Automated integration tests use simulated provider responses; live provider acceptance and answer quality must be checked with a signed-in public educational query. An unauthenticated network probe from the development environment returned HTTP 403 with error code 1010, so it does not establish whether this key is valid. Live authenticated provider generation has not been verified. No new subscription or credits were purchased.

Keep patient identifiers out of requests. DR7's documentation describes the models as research tools and requires a signed data processing agreement before sending directly identifiable patient information. This connection does not establish such an agreement or certify compliance. Rotate keys exposed in chat, update the runtime secret and redeploy; no source change is needed.

## Host a dedicated model or adapter endpoint

The Site Worker cannot hold model weights (128 MB isolate memory). Host inference separately on a GPU service, for example a controlled GPU VM/service or a compatible managed inference endpoint. No paid service or GPU was provisioned by this change.

The included `inference/serve.py` serves an authenticated `/v1/chat/completions` endpoint. It supports a Llama causal LM or the existing MedGemma-4B multimodal model in **text-only** use. It does not add image upload or image interpretation to HealthBrowse.

1. Accept the model's applicable license/terms and obtain authorized weight access. Select and record an exact base-model revision, not a mutable branch.
2. On a CUDA GPU host, build `docker build -t healthbrowse-inference ./inference` and run one model process per GPU allocation. The image requires GPU device/runtime configuration supplied by the host. Test VRAM and output latency with realistic prompts; fitting weights alone is insufficient.
3. Supply these **server secrets/settings** through the host's secret manager or protected environment file:

   ```dotenv
   MODEL_ID=meta-llama/Meta-Llama-3-8B-Instruct
   MODEL_REVISION=<reviewed-model-commit>
   HF_TOKEN=<authorized-read-token>
   INFERENCE_API_KEY=<random-secret-at-least-32-characters>
   # Optional only after evaluated training:
   ADAPTER_PATH=/models/reviewed-general-adapter
   MAX_INPUT_TOKENS=6144
   ```

   Run a second service with `MODEL_ID=google/medgemma-4b-it`, its pinned revision and a separate key. Do not reuse an incompatible Llama adapter for MedGemma. Training, merging and serving check the base repository and pinned commit against the adapter manifest/configuration. Serving checks actual prompt plus output tokens against the model context window. Keep HF tokens out of Docker layers and repository files.
4. Terminate HTTPS at controlled ingress. Restrict ingress as supported, disable request-body logging, set retention policies, protect the model cache, apply concurrency/spending limits, and ensure ingress timeouts permit generation. The included service rejects concurrent work with 429 rather than building an unbounded GPU queue. Scaling and batching require an appropriate serving runtime and load testing.
5. Verify readiness and authenticated generation directly on the host with synthetic public medical questions. Do not upload real patient records. Validate JSON generation and reviewer outputs. The Python service asks the model for JSON but does not implement constrained token decoding; invalid output is rejected by the gateway. A production engine with grammar-constrained decoding can reduce retries.

## Connect the Site

In the Site's runtime environment settings, configure:

| Key | Value |
|---|---|
| `MODEL_GENERAL_URL` | Full HTTPS endpoint ending in `/v1/chat/completions` |
| `MODEL_GENERAL_ID` | Exact served Llama model ID |
| `MODEL_GENERAL_KEY` | Optional explicit secret inference key; required for a dedicated custom endpoint |
| `HF_TOKEN` | Secret Hugging Face Inference Providers token; General router only |
| `MODEL_GENERAL_CONTEXT_TOKENS` | `8192` for Llama 3 and its adapters |
| `MODEL_PROFESSIONAL_URL` | Full HTTPS MedGemma endpoint |
| `MODEL_PROFESSIONAL_ID` | Exact served MedGemma model ID |
| `MODEL_PROFESSIONAL_KEY` | Separate secret inference bearer key |

Use the settings/secret interface, not chat messages or browser JavaScript. Redeploy after updating runtime values. Apply the new Drizzle migration for `hb_model_limits`; native Sites deployment handles declared D1 migrations, while standalone deployments must run their normal migration step. Keep Supabase URL/key configured for session validation.

`GET /api/ai/status` exposes only whether each route is configured; it is not a live readiness or quality check. A professional route never silently uses the general endpoint. If unconfigured, the public site retains honest excerpt-based answers with an explicit notice.

## Train the general-user adapter

Install `inference/requirements.txt` in a dedicated training environment. Prepare JSONL containing `topic`, `source_urls`, `license_reviewed: true`, `clinical_reviewed: true`, and `messages` (system, user, assistant). The user content must be the same JSON payload produced by `generationMessages()` in `server/model-evidence.mjs`, including `role: "General reader"`, `mode`, and `evidence`. For this Llama 3 deployment, use the selected prompt returned by `compactGeneration()` in `server/model-context.mjs` so examples match the serving context budget. The assistant target must follow the gateway schema with source IDs and exact quotes. Training is answer-token-only; prompt tokens are masked from loss. Existing question/answer-only MedQuAD rows are **not** already reviewed six-deck targets.

Include direct questions, multipart questions, misspellings, follow-ups, genuine evidence gaps, negation, contradictory sources and instruction-injection cases. Keep all examples from a disease and its publisher source pages in one split; split by disease/source before augmentation. Preserve licenses and source dates. Never mark generated labels as clinically reviewed without actual review.

```bash
python inference/train_adapter.py --train /data/reviewed-train.jsonl \
  --validation /data/reviewed-validation.jsonl \
  --revision <reviewed-model-commit> --output /models/general-adapter \
  --model meta-llama/Meta-Llama-3-8B-Instruct --max-length 8192 \
  --method qlora --validate-only

# Only on the configured GPU host, after input validation:
python inference/train_adapter.py --train /data/reviewed-train.jsonl \
  --validation /data/reviewed-validation.jsonl \
  --revision <reviewed-model-commit> --output /models/general-adapter \
  --model meta-llama/Meta-Llama-3-8B-Instruct --max-length 8192 \
  --method qlora
```

`--method lora` uses the unquantized base; QLoRA uses NF4 4-bit weights and trains LoRA parameters. Training creates an adapter and a manifest with dataset hashes. It does not automatically deploy the adapter. `--validate-only` checks structure, provenance flags and split leakage without downloading weights; it does not certify review or check tokenized lengths. The GPU training path checks exact tokenized lengths and rejects oversized examples rather than silently truncating evidence. Use the base model repository, without `:featherless-ai`, and an exact reviewed 40-character commit SHA. Llama 3 has an 8,192-token limit, unlike the previous Llama 3.1 template. No training data or weights were generated in this change.

Compare the base Llama, trained Llama and existing FLAN-T5 baseline on a separate, frozen test set. Measure direct-answer relevance, claim-support accuracy (human review, not just model scores), citation precision/coverage, six-deck coverage, safe abstention, general-user readability, follow-up quality, patient-safety failures, subgroup behavior, latency and cost. Evaluate professional prompts separately against appropriate recent clinical references. Set release thresholds with clinical reviewers; aggregate similarity/ROUGE scores cannot establish safe medical behavior. Keep the previous model available for rollback.

## Serve or export the trained QLoRA adapter

For a dedicated GPU service, use the pinned base plus `ADAPTER_PATH` with `inference/serve.py`. Set `MODEL_GENERAL_URL` to that service, `MODEL_GENERAL_KEY` to its own secret, and `MODEL_GENERAL_ID` to the ID it serves. Keep `MODEL_GENERAL_CONTEXT_TOKENS=8192`.

Featherless currently requires **full weights, not bare LoRA/QLoRA adapters**, in compatible FP16 safetensors. To prepare an evaluated adapter for provider review:

```bash
python inference/merge_adapter.py --adapter /models/general-adapter \
  --revision <same-reviewed-base-commit> --output /models/healthbrowse-general-merged
```

This reloads the unquantized pinned base, checks adapter compatibility and merges to FP16 safetensors. It requires sufficient GPU memory for full weights, not merely the smaller QLoRA training allocation. It does not upload or deploy anything. Supply a model card, applicable license/attribution and evaluation report. Follow the provider's model acceptance process; a new Hub repository is not automatically a routable inference model. Only after the merged model is actually supported should `MODEL_GENERAL_ID` change to its accepted provider ID. Alternatively retain the dedicated adapter endpoint. Neither route can use our trained adapter by continuing to call the original base-model ID.

## Primary technical resources

- [Llama 3 model card and license](https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct)
- [DR7 API documentation](https://dr7.ai/docs)
- [DR7 API access and data-use terms](https://dr7.ai/access-api)
- [Hugging Face Featherless integration](https://huggingface.co/docs/inference-providers/en/providers/featherless-ai)
- [Featherless model compatibility and full-weight requirements](https://featherless.ai/docs/models-model-compatibility)
- [Featherless JSON output guidance](https://featherless.ai/docs/tool-calling)
- [FLAN-T5 model card](https://huggingface.co/google/flan-t5-base)
- [MedGemma-4B model card](https://huggingface.co/google/medgemma-4b-it)
- [Google MedGemma documentation and limitations](https://developers.google.com/health-ai-developer-foundations/medgemma/model-card)
- [PEFT quantization and QLoRA](https://huggingface.co/docs/peft/en/developer_guides/quantization)
- [QLoRA research paper](https://arxiv.org/abs/2305.14314)
- [BiomedBERT, formerly PubMedBERT](https://huggingface.co/microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract-fulltext)
- [BioBERT implementation](https://github.com/dmis-lab/biobert)

Reviewed 2026-11-10. Model family documentation can describe newer releases; the configured IDs and pinned revisions, not family labels, determine what actually runs.
