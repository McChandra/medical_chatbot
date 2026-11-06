"""LoRA/QLoRA for the general-user Llama route. Never trains on visitor data.

Input JSONL rows: topic, source_urls, license_reviewed, clinical_reviewed, messages.
Messages must contain the source-grounded gateway prompt and clinician-reviewed
JSON answer, not just legacy MedQuAD question/answer pairs. Validation is held out
by disease AND publisher page. This script does not certify clinical quality.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit


def load_examples(path):
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    if not rows:
        raise ValueError("Empty dataset")
    for row in rows:
        if row.get("license_reviewed") is not True or row.get("clinical_reviewed") is not True:
            raise ValueError("Every example needs recorded license and clinical review")
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
    parser.add_argument("--model", default="meta-llama/Llama-3.1-8B-Instruct")
    parser.add_argument("--revision", required=True, help="Reviewed base-model commit")
    parser.add_argument("--method", choices=["lora", "qlora"], default="qlora")
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-length", type=int, default=16384)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    train, validation = load_examples(args.train), load_examples(args.validation)
    validate_split(train, validation)
    if args.validate_only:
        print(json.dumps({"train_examples": len(train), "validation_examples": len(validation), "split_check": "passed"}))
        return
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments, DataCollatorForSeq2Seq
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    if not torch.cuda.is_available():
        raise RuntimeError("This training profile requires a CUDA GPU")
    tokenizer = AutoTokenizer.from_pretrained(args.model, revision=args.revision, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                              bnb_4bit_compute_dtype=torch.bfloat16) if args.method == "qlora" else None
    model = AutoModelForCausalLM.from_pretrained(args.model, revision=args.revision, trust_remote_code=False,
                                               torch_dtype=torch.bfloat16, quantization_config=quant, device_map={"": 0})
    if quant:
        model = prepare_model_for_kbit_training(model)
    model = get_peft_model(model, LoraConfig(task_type="CAUSAL_LM", r=16, lora_alpha=32,
                                           lora_dropout=0.05, target_modules="all-linear"))
    model.config.use_cache = False

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

    training = TrainingArguments(output_dir=args.output, num_train_epochs=2, per_device_train_batch_size=1,
        per_device_eval_batch_size=1, gradient_accumulation_steps=8, gradient_checkpointing=True,
        learning_rate=2e-4, bf16=True, logging_steps=10, eval_strategy="epoch", save_strategy="epoch",
        save_total_limit=2, report_to="none", seed=42)
    trainer = Trainer(model=model, args=training, train_dataset=encode(train), eval_dataset=encode(validation),
                      processing_class=tokenizer, data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True))
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    manifest = {"base_model": args.model, "revision": args.revision, "method": args.method,
                "train_sha256": hashlib.sha256(Path(args.train).read_bytes()).hexdigest(),
                "validation_sha256": hashlib.sha256(Path(args.validation).read_bytes()).hexdigest(),
                "clinical_release_approved": False}
    Path(args.output, "training-manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
