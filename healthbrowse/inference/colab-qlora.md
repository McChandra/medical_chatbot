# Llama 3 QLoRA without a paid inference API

[Open the training notebook in Colab](https://colab.research.google.com/github/McChandra/medical_chatbot/blob/feature/responsive-healthbrowse-auth/healthbrowse/inference/HealthBrowse_Llama_QLoRA_Colab.ipynb).

Use **File → Save a copy in Drive**, then choose a GPU runtime and follow the notebook cells. The workflow uses `meta-llama/Meta-Llama-3-8B-Instruct`, NF4 weights, LoRA adapters, assistant-only loss, source-cited targets and a held-out validation set. It uses Hugging Face to download authorized weights, not its paid inference service. A read token is still needed for gated model downloads.

## What is ready

- A notebook for an interactive Colab experiment, including data checks and adapter evaluation.
- FP16 fallback for T4-class GPUs and BF16 on GPUs with native support.
- A starting profile of 2,048 tokens, rank 8, batch size 1, gradient accumulation 8 and a 50-step experiment. These settings are not a memory or completion guarantee.
- Checkpoints in your Drive every 10 optimizer steps, with two retained; a resume guard checks the base revision, data hashes and training settings.
- A comparison of the quantized base and adapter on the same held-out prompts, plus adapter/report download.

No GPU training was performed while preparing these files. No fine-tuned weights, accuracy score, successful live inference, or clinical validation is claimed. The default `research_demo` mode prepares the JSONL files automatically from the existing MedlinePlus snapshot; generated targets are not clinically reviewed. The first 50 steps are a pipeline experiment; choose a new run name for a full training experiment. Resume with identical settings, not a new step budget.

## Start now without uploading files

If your old copy is waiting for `train.jsonl` or reports a missing `prepare_research_data.py`, reopen the GitHub notebook above and save a **new copy** in Drive. An old Drive copy does not update when GitHub changes. Run the new setup cell and then continue from the top with a GPU runtime. The setup downloads the known source commit into `/content/healthbrowse-qlora-520b78eb7b93`, leaving an older `/content/medical_chatbot` and Drive experiments untouched. You do not need to delete the runtime for this stale-checkout fix. Successful setup prints `Data preparation script: ready`.

Keep `DATA_MODE = 'research_demo'` and the new default run name `llama3-general-research-002`. Section 4 prepares the data automatically. After the data and token-length checks pass, run **6. Train the adapter**, then the base-versus-adapter comparison and ZIP export. This fixes the missing-upload step; no trained model or successful GPU run is implied.

Files are created in `MyDrive/HealthBrowse/<RUN_NAME>/data/`:

- `train.jsonl`: optimization examples.
- `validation.jsonl`: validation loss and the five-example comparison.
- `test.jsonl`: separate holdout, not opened by training or comparison.
- `dataset-manifest.json`: source snapshot hash, policy, split counts, data hashes, tokenizer revision, and limitations.

The export ZIP includes these data files as well as adapter files and reports. `prepare_research_data.py` can also be run locally without a GPU:

```bash
python inference/prepare_research_data.py --output /tmp/healthbrowse-research-data
```

Run that command from `healthbrowse/`. CPU preparation does not check tokenizer lengths; the notebook does so with the pinned Llama tokenizer before writing its own data. It never truncates evidence. Re-running preparation is deterministic and refuses to replace different existing data.

### What this dataset teaches—and does not

This is a small **source-extraction and JSON-format baseline**, not a clinically validated six-domain corpus. It uses only short, intact passages from the existing MedlinePlus health-topic XML summaries, under the [MedlinePlus reuse policy](https://medlineplus.gov/about/using/usingcontent/). Source: MedlinePlus, National Library of Medicine. No NLM endorsement is implied. It excludes encyclopedia and drug monographs, linked resources, visitor chats and MedQuAD archives with separate rights conditions.

Each target copies source text exactly and records citations. It keeps `clinical_reviewed: false`, `research_only: true`, and `target_method: "extractive"`. The scope-specific license check is recorded separately; that is not clinical approval. `--research-only` explicitly permits this experiment; the trainer's default still rejects unreviewed data. Training manifests remain `clinical_release_approved: false`.

Short summaries and sparse deck coverage bias the dataset. Existing deck labels are heuristic, the compact exercise prompt differs from the full production prompt, and targets do not teach broad medical synthesis, patient-specific reasoning or every kind of evidence gap. Copying quoted text is not a test of factual reasoning. A loss reduction or valid JSON does not demonstrate safe answers. Use fresh retrieval, independently reviewed targets, production prompts and clinical evaluation before any deployment.

Groups sharing canonical topic titles, aliases, publisher pages or identical selected passages stay in one split. The script selects 120 groups by stable hashes and partitions groups 80/10/10; actual row counts depend on available passages and token limits. Related-disease and near-duplicate leakage is not ruled out. Keep the test set untouched while tuning; conduct a separate final evaluation and manual source-support review later.

## Optional clinically reviewed training data

Change `DATA_MODE` to `reviewed_upload` with a new run name to upload your own files. `train_adapter.py` in its default reviewed mode accepts one JSON object per line in `train.jsonl` and `validation.jsonl`. Each row needs:

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

Mount the same Drive, select the same run name and use the original source commit. The notebook records its pinned source SHA and base-model SHA in `experiment.json`. It refuses changed settings instead of mixing experiments. To resume an older compatible experiment, set `SOURCE_COMMIT` in the setup cell to its recorded full SHA; setup will use that version in a separate directory. A pre-data-preparation commit cannot support the new research demo. For the updated workflow use the new default run name instead. Do not discard local code changes without reviewing them.

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
