# Evaluate and privately serve the completed HealthBrowse adapter

The uploaded `llama3-general-research-002` export is a completed **research extraction/formatting adapter**. Its recorded audit is in [releases/llama3-general-research-002.json](releases/llama3-general-research-002.json). The archive and weights are not published to GitHub. The base is `meta-llama/Meta-Llama-3-8B-Instruct`, pinned to `8afb486c1db24fe5011ec46dfbe5b5dccdb575c2`.

## Evaluate before connecting

For the current development update, use the [focused grounded-v2 workflow](grounded-v2.md). It reuses the adapter and evaluates the full gateway, including actual support review and repair.

**Completed-run decision:** the uploaded evaluation contains all 78 expected results. [The audit](releases/llama3-general-research-002-evaluation.md) found unsupported citations, incomplete answers and a browser generation exceeding the gateway deadline. Keep this adapter in research; do not activate it publicly or repeat the same run unchanged. The notebook below remains the reproducible historical workflow.

[Open the evaluation notebook](https://colab.research.google.com/github/McChandra/medical_chatbot/blob/feature/responsive-healthbrowse-auth/healthbrowse/inference/HealthBrowse_Adapter_Evaluation_Colab.ipynb). It reuses `MyDrive/HealthBrowse/llama3-general-research-002`; no retraining or paid inference API is required. Use an authorized GPU and the existing `HF_TOKEN` Colab secret. If using an exported ZIP instead, the notebook verifies and extracts the exact uploaded adapter checksum.

The development benchmark contains 12 browser/buddy queries generated with the actual gateway retrieval and compact prompts, two reviewer-schema controls, and three interception checks. The separate 25-example extraction test split can be evaluated once with the frozen adapter. Results for these different tasks are reported separately, not pooled into a medical accuracy score. The GPU workload compares both the base and adapter, saves each finished case in Drive, and resumes with the same hashes/settings. Interrupted cases can be retried; changing prompts or weights requires a new evaluation directory.

Generate fixtures after any retrieval/prompt change, from `healthbrowse/`:

```bash
node scripts/build-model-evaluation.mjs
python inference/evaluate_adapter.py --artifact /path/to/export \
  --output /path/to/new-evaluation --include-holdout --validate-only
python inference/evaluate_adapter.py --artifact /path/to/export \
  --output /path/to/new-evaluation --include-holdout
```

`results.jsonl` contains raw outputs, latency, token counts, quote/schema checks and deck coverage. `summary.json` summarizes those observations. It never grants clinical release approval. No successful production-prompt GPU evaluation is claimed by the implementation or CPU tests.

## Review the source-backed targets

`evaluation/review-packet.jsonl` has one review packet per development question, with all six clinical domains and the original source passages/URLs. Target claim fields are intentionally blank and approval fields remain false. A reviewer must establish relevance, full source support, correct domain assignment, currentness, reading level and missing evidence. Marking every row reviewed without doing that work is not a valid training set.

The existing snapshot mislabeled LDL target-goal text as a cause because it contained “high risk.” A narrow heading-based correction now maps treatment-goal headings to management while preserving publisher text, citation URL and source IDs. Future source ingestion uses the same heading precedence. This addresses one observed label problem; it does not validate the rest of the taxonomy or guarantee six sources for every disease.

Promote only actually reviewed targets into the existing `train_adapter.py` reviewed-data format. Additional optimization of sparse copying targets will not supply missing evidence or clinical reasoning. Keep a fresh final test set if these development questions influence subsequent training.

## Private GPU host

Use a GPU computer or university/institutional GPU service that you are authorized to operate as a server. Free managed Colab remains an interactive evaluation environment; this workflow does not expose it through a tunnel. The current Sites runtime cannot host Llama weights itself. A paid provider is not required if you have suitable authorized compute, but reliable public compute is not guaranteed free.

Inspect/extract the ZIP without executing archive content:

```bash
python inference/adapter_artifact.py Llama-3-HealthBrowse-General-QLoRA.zip \
  --output /secure/healthbrowse-artifact
```

On the GPU host, configure secrets through its secret manager or protected shell environment. Never put tokens in source control or browser JavaScript. Set `HF_TOKEN`, a random `INFERENCE_API_KEY` of at least 32 characters, and `ARTIFACT_DIR=/secure/healthbrowse-artifact`, then run from `healthbrowse/`:

```bash
docker compose -f inference/compose.research.yml up --build -d
curl --fail http://127.0.0.1:8080/healthz
```

The container listens through a loopback-only published port. It loads the base in NF4 and applies the adapter; it chooses FP16 on T4-class hardware and BF16 where natively supported. Quantization reduces memory use but does not guarantee that a particular GPU can handle every request. One generation runs at a time. A disconnected client cannot cause overlapping base/adapter generation. The API requires a bearer token, limits request bodies, rejects unsupported model aliases and labels the adapter as research-only. JSON generation is not grammar-constrained; the gateway must keep validating and withholding failed drafts.

Configure authenticated HTTPS ingress on that host before any remote integration. Keep raw prompts out of access logs and allow access only from your test clients/gateway. The compose file does not provision a GPU, DNS, TLS or an external cloud account, and has not been GPU-deployed by this change.

## Gateway settings after evaluation and host readiness

The generator and reviewer have different schemas. The extraction adapter must not silently be assumed to review claims. The private service exposes two explicit aliases: `healthbrowse-general-qlora` uses the adapter; `healthbrowse-general-base-review` disables it on the same pinned base. Both require the same private endpoint authentication. The base reviewer still requires evaluation and is not independent clinical review.

After testing the endpoint, configure these **server-side** values in the updated gateway:

```text
MODEL_GENERAL_URL=https://YOUR_AUTHORIZED_HOST/v1/chat/completions
MODEL_GENERAL_ID=healthbrowse-general-qlora
MODEL_GENERAL_KEY=<server secret matching INFERENCE_API_KEY>
MODEL_GENERAL_CONTEXT_TOKENS=8192
MODEL_GENERAL_REVIEW_ID=healthbrowse-general-base-review
```

With no review URL supplied, the reviewer uses the exact same endpoint and key. A separate `MODEL_GENERAL_REVIEW_URL` requires a separate `MODEL_GENERAL_REVIEW_KEY`; credentials never follow a changed host implicitly. An incomplete reviewer configuration fails closed. Existing clinician routing remains separate.

Deploy the updated gateway only when ready, then test signed-in search and buddy generation through the full API, including review, repair, latency, insufficient evidence, provider failure, emergency interception and safe fallback. The gateway's 120-second total deadline includes generation plus all review/repair calls; the evaluation records per-call timings so slow hosting can be identified. Passing a JSON contract alone is not a release criterion. This change does not modify the live Site's model keys or claim it is connected.

References: [PEFT adapters](https://huggingface.co/docs/peft/v0.17.0/en/package_reference/peft_model), [bitsandbytes](https://huggingface.co/docs/transformers/v4.57.1/quantization/bitsandbytes), [Colab usage restrictions](https://research.google.com/colaboratory/faq.html).
