"""LoRA/QLoRA for the general-user Llama route. Never trains on visitor data.

Input JSONL rows: topic, source_urls, license_reviewed, clinical_reviewed, messages.
Messages must contain the source-grounded gateway prompt and clinician-reviewed
JSON answer, not just legacy MedQuAD question/answer pairs. Explicit
--research-only allows marked, intact extractive targets without clinical review. Validation is held out
by disease AND publisher page. This script does not certify clinical quality.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
from model_settings import GENERAL_BASE, GENERAL_CONTEXT, validate_base


def precision_flags(major, bf16_available):
    """Use native BF16 only; T4/older CUDA cards use FP16 mixed precision."""
    bf16 = major >= 8 and bf16_available
    return {"bf16": bf16, "fp16": not bf16}


def check_resume(output, checkpoint, manifest):
    output = Path(output)
    recorded = output / "training-manifest.json"
    if checkpoint:
        checkpoint = Path(checkpoint).resolve()
        if checkpoint.parent != output.resolve() or not (checkpoint / "trainer_state.json").is_file():
            raise ValueError("Resume from a Trainer checkpoint in this output directory")
        if not recorded.is_file() or json.loads(recorded.read_text()) != manifest:
            raise ValueError("Resume requires the same base, data, training settings and output directory")
    elif output.exists() and any(output.iterdir()):
        raise ValueError("Output is not empty; choose a new directory or explicitly resume a checkpoint")


def load_examples(path, research_only=False):
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    if not rows:
        raise ValueError("Empty dataset")
    for row in rows:
        if row.get("license_reviewed") is not True:
            raise ValueError("Every example needs recorded license review")
        if row.get("clinical_reviewed") is not True:
            if not (research_only and row.get("research_only") is True and
                    row.get("clinical_reviewed") is False and row.get("target_method") == "extractive"):
                raise ValueError("Unreviewed targets require explicitly marked extractive research data and --research-only")
        if not isinstance(row.get("topic"), str) or not row["topic"].strip() or not row.get("source_urls"):
            raise ValueError("Topic and source provenance are required")
        for url in row["source_urls"]:
            if urlsplit(url).scheme != "https" or not urlsplit(url).hostname:
                raise ValueError("Invalid source URL")
        messages = row.get("messages", [])
        if [m.get("role") for m in messages] != ["system", "user", "assistant"] or any(not isinstance(m.get("content"), str) or not m["content"].strip() for m in messages):
            raise ValueError("Expected system, user and reviewed assistant messages")
        payload = json.loads(messages[1]["content"])
        answer = json.loads(messages[2]["content"])
        evidence = {s["id"]: s for s in payload["evidence"]}
        if payload.get("role") != "General reader":
            raise ValueError("This adapter is for general-user examples")
        if payload.get("mode") not in {"search", "chat"}:
            raise ValueError("Unknown example mode")
        if payload["mode"] == "search" and sorted(d["id"] for d in answer["decks"]) != [1, 2, 3, 4, 5, 6]:
            raise ValueError("Search targets require six decks")
        if payload["mode"] == "chat" and answer["decks"]:
            raise ValueError("Chat targets must not repeat all decks")
        for part in [answer["answer"], *answer["decks"]]:
            for claim in part["claims"]:
                if not claim["text"].strip() or not claim["support"]:
                    raise ValueError("Missing cited claim")
                for cite in claim["support"]:
                    source = evidence[cite["id"]]
                    if len(cite["quote"].strip()) < 20 or cite["quote"] not in source["text"]:
                        raise ValueError("Unsupported target citation")
                    if row.get("clinical_reviewed") is False and (
                        claim["text"] != source["text"] or cite["quote"] != source["text"]
                    ):
                        raise ValueError("Unreviewed research targets must copy the intact source passage")
    return rows


def validate_split(train, validation):
    topics = lambda rows: {r["topic"].lower().strip() for r in rows}
    sources = lambda rows: {urlsplit(url)._replace(fragment="", query="").geturl().rstrip("/") for r in rows for url in r["source_urls"]}
    if topics(train) & topics(validation) or sources(train) & sources(validation):
        raise ValueError("Training/validation leakage: hold out topics and source pages")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", required=True)
    parser.add_argument("--validation", required=True)
    parser.add_argument("--model", default=GENERAL_BASE)
    parser.add_argument("--revision", required=True, help="Reviewed base-model commit")
    parser.add_argument("--method", choices=["lora", "qlora"], default="qlora")
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-length", type=int, default=GENERAL_CONTEXT)
    parser.add_argument("--max-steps", type=int, default=-1, help="Positive step limit overrides epochs")
    parser.add_argument("--epochs", type=float, default=2)
    parser.add_argument("--save-steps", type=int, default=25)
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--resume-from-checkpoint")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--research-only", action="store_true", help="Allow marked unreviewed extractive experiments, never clinical release")
    args = parser.parse_args()
    if args.max_steps == 0 or args.max_steps < -1 or args.epochs <= 0 or args.save_steps < 1 or args.lora_rank < 1:
        parser.error("Use positive epochs, save steps and rank; max steps is -1 or positive")
    validate_base(args.model, args.revision, args.max_length)
    train, validation = load_examples(args.train, args.research_only), load_examples(args.validation, args.research_only)
    validate_split(train, validation)
    manifest = {"base_model": args.model, "revision": args.revision, "method": args.method, "max_length": args.max_length,
                "train_sha256": hashlib.sha256(Path(args.train).read_bytes()).hexdigest(),
                "validation_sha256": hashlib.sha256(Path(args.validation).read_bytes()).hexdigest(),
                "training_settings": {"max_steps": args.max_steps, "epochs": args.epochs, "lora_rank": args.lora_rank,
                                      "save_steps": args.save_steps, "seed": 42},
                "research_only": args.research_only,
                "clinical_reviewed": all(r.get("clinical_reviewed") is True for r in train + validation),
                "clinical_release_approved": False}
    check_resume(args.output, args.resume_from_checkpoint, manifest)
    if args.validate_only:
        print(json.dumps({"base_model": args.model, "method": args.method, "max_length": args.max_length,
                          "train_examples": len(train), "validation_examples": len(validation),
                          "split_check": "passed", "research_only": args.research_only,
                          "clinical_release_approved": False, "token_lengths_checked": False, "training_run": False}))
        return
    import torch
    from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments, DataCollatorForSeq2Seq, set_seed
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    if not torch.cuda.is_available():
        raise RuntimeError("This training profile requires a CUDA GPU")
    flags = precision_flags(torch.cuda.get_device_capability()[0], torch.cuda.is_bf16_supported())
    dtype = torch.bfloat16 if flags["bf16"] else torch.float16
    set_seed(42)
    config = AutoConfig.from_pretrained(args.model, revision=args.revision, trust_remote_code=False)
    if args.max_length > config.max_position_embeddings:
        raise ValueError("Training length exceeds the base model's context window")
    tokenizer = AutoTokenizer.from_pretrained(args.model, revision=args.revision, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    def encode(rows):
        result = []
        for row in rows:
            prefix = tokenizer.apply_chat_template(row["messages"][:-1], tokenize=True, add_generation_prompt=True)
            full = tokenizer.apply_chat_template(row["messages"], tokenize=True)
            if full[:len(prefix)] != prefix or len(full) <= len(prefix):
                raise ValueError("Template does not preserve the prompt/response boundary")
            if len(full) > args.max_length:
                raise ValueError("Example exceeds max length; shorten it explicitly, never silently truncate evidence")
            result.append({"input_ids": full, "attention_mask": [1] * len(full),
                           "labels": [-100] * len(prefix) + full[len(prefix):]})
        return result

    # Validate actual lengths before allocating the large model. Never truncate citations.
    encoded_train, encoded_validation = encode(train), encode(validation)
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                              bnb_4bit_compute_dtype=dtype) if args.method == "qlora" else None
    model = AutoModelForCausalLM.from_pretrained(args.model, revision=args.revision, trust_remote_code=False,
                                               torch_dtype=dtype, quantization_config=quant, device_map={"": 0})
    if quant:
        model = prepare_model_for_kbit_training(model, gradient_checkpointing_kwargs={"use_reentrant": False})
    model = get_peft_model(model, LoraConfig(task_type="CAUSAL_LM", r=args.lora_rank, lora_alpha=2 * args.lora_rank,
                                           lora_dropout=0.05, target_modules="all-linear"))
    model.config.use_cache = False
    training = TrainingArguments(output_dir=args.output, num_train_epochs=args.epochs, max_steps=args.max_steps, per_device_train_batch_size=1,
        per_device_eval_batch_size=1, gradient_accumulation_steps=8, gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        learning_rate=2e-4, **flags, logging_steps=5, eval_strategy="steps", eval_steps=args.save_steps,
        save_strategy="steps", save_steps=args.save_steps, prediction_loss_only=True,
        optim="paged_adamw_8bit" if args.method == "qlora" else "adamw_torch",
        save_total_limit=2, report_to="none", seed=42)
    trainer = Trainer(model=model, args=training, train_dataset=encoded_train, eval_dataset=encoded_validation,
                      processing_class=tokenizer, data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True))
    Path(args.output).mkdir(parents=True, exist_ok=True)
    Path(args.output, "training-manifest.json").write_text(json.dumps(manifest, indent=2))
    result = trainer.train(resume_from_checkpoint=args.resume_from_checkpoint)
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    trainer.save_metrics("train", result.metrics)
    trainer.save_metrics("eval", trainer.evaluate())


if __name__ == "__main__":
    main()
