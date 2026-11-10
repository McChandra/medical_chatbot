# Llama 3 QLoRA without a paid inference API

[Open the training notebook in Colab](https://colab.research.google.com/github/McChandra/medical_chatbot/blob/feature/responsive-healthbrowse-auth/healthbrowse/inference/HealthBrowse_Llama_QLoRA_Colab.ipynb).

Use **File → Save a copy in Drive**, then choose a GPU runtime and follow the notebook cells. The workflow uses `meta-llama/Meta-Llama-3-8B-Instruct`, NF4 weights, LoRA adapters, assistant-only loss, source-cited targets and a held-out validation set. It uses Hugging Face to download authorized weights, not its paid inference service. A read token is still needed for gated model downloads.

## What is ready

- A notebook for an interactive Colab experiment, including data checks and adapter evaluation.
- FP16 fallback for T4-class GPUs and BF16 on GPUs with native support.
- A starting profile of 2,048 tokens, rank 8, batch size 1, gradient accumulation 8 and a 50-step experiment. These settings are not a memory or completion guarantee.
- Checkpoints in your Drive every 10 optimizer steps, with two retained; a resume guard checks the base revision, data hashes and training settings.
- A comparison of the quantized base and adapter on the same held-out prompts, plus adapter/report download.

No GPU training was performed while preparing these files. No fine-tuned weights, accuracy score, successful live inference, or clinical validation is claimed. The checkout does not contain the required training/validation JSONL. The first 50 steps are a pipeline experiment; choose a new run name for a full training experiment. Resume with identical settings, not a new step budget.

## Data required before training

The existing `train_adapter.py` accepts one JSON object per line in `train.jsonl` and `validation.jsonl`. Each row needs:

| Field | Meaning |
|---|---|
| `topic` | Canonical disease or symptom used for the split |
| `source_urls` | Original HTTPS publisher pages, with provenance recorded |
| `license_reviewed` | `true` only after the applicable training-use terms have been checked |
| `clinical_reviewed` | `true` only after the target has actually been reviewed |
| `messages` | Exactly system, user and assistant messages |

The user message's `content` is a JSON string using the HealthBrowse generation payload: `role: "General reader"`, `mode: "search"` or `"chat"`, `topic`, `question`, `browserQuestion`, `activeDeck`, `priorQuestions`, `domains`, and `evidence`. Use the output of `generationMessages()` / `compactGeneration()` from the existing server modules to keep prompts aligned with the browser. Prepare shorter complete examples for the notebook's 2,048-token starting profile; its 8,192-token production context is a separate limit.

The assistant message's `content` is a JSON string with `answer.claims` and `decks`. Every nonempty claim must have `text` and `support: [{"id": "S1", "quote": "exact text from supplied evidence"}]`. For search, include all six deck IDs exactly once; leave unsupported sections' claim arrays empty. For chat, use an empty `decks` array. A source ID or an exact quotation alone does not prove that the claim is supported; review the whole meaning.

Raw MedQuAD question-answer pairs, MedQA and MedMCQA exam rows are **not** already source-cited six-deck targets. Preserve useful examples, verify source provenance and permitted uses, and create/review the target format before training. Do not fabricate source references or automatically set review flags. Keep all examples from the same disease and publisher page in the same split. Maintain a separate untouched test set for final evaluation; the notebook's five-row comparison is only a sanity check.

Train for direct answers, plain-language explanations, requested follow-ups, safe uncertainty and citation use. Include genuine evidence gaps. Do not train on HealthBrowse visitors' conversations or patient identifiers. Assess factual support and dangerous omissions as well as readability and loss; fine-tuning does not replace retrieval or source verification.

## Interrupted sessions

Mount the same Drive, select the same run name and use the original source commit. The notebook records the source SHA (or a training-source fingerprint for an uploaded ZIP) and base-model SHA in `experiment.json`. It refuses changed settings instead of mixing experiments. To fetch the original code in a fresh clone, fetch that recorded SHA and check it out, then rerun the notebook. Do not discard local code changes without reviewing them.

Trainer checkpoints include optimizer/scheduler state. Only your own complete checkpoints should be resumed. Work after the last completed save may be lost. If the session ended before any checkpoint completed, preserve the partial run and start a new run name. The final ZIP is an inference adapter export, not a substitute for a full optimizer checkpoint.

If memory is exhausted, stop the job, free the runtime, and create a new experiment with a smaller sequence length/rank after reviewing which examples fit. Do not silently truncate source text or increase Colab resource usage through keep-alive or multi-account workarounds. Check Drive quota and notebook hardware availability before a long run.

## Public website connection

Free Colab is for interactive research; it is not an always-on website backend. It does not make the public HealthBrowse AI connection active. The existing website continues to show labeled excerpts until a working inference endpoint is configured.

After evaluation, serve the pinned base and adapter on your own GPU or an authorized shared/university host. The existing `serve.py` can load the adapter behind a bearer-protected endpoint, but it loads full-precision base weights: its memory needs differ from the notebook's 4-bit evaluation loader. Configure HTTPS, then set the Site's `MODEL_GENERAL_URL`, `MODEL_GENERAL_ID`, secret `MODEL_GENERAL_KEY`, and `MODEL_GENERAL_CONTEXT_TOKENS=8192`. Redeploy and test actual search and buddy generation. These would be your own server credentials, not a paid provider's API key.

The notebook does not expose a tunnel, buy compute, upload a model publicly, or alter the live Site's provider settings. Zero paid API usage is feasible for the notebook; reliable public hosting still needs available compute and connectivity.

## Sources

- [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314)
- [PEFT quantization](https://huggingface.co/docs/peft/v0.17.0/developer_guides/quantization)
- [Transformers Trainer and checkpoints](https://huggingface.co/docs/transformers/v4.57.1/en/main_classes/trainer)
- [Meta Llama 3 model access and terms](https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct)
- [Colab FAQ, limits and permitted uses](https://research.google.com/colaboratory/faq.html)

Built with Meta Llama 3. Review the base model's terms and attribution requirements before distributing an adapter or offering a model service.
