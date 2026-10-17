
import argparse
import json
from pathlib import Path
import boto3

import torch
from transformers import AutoModelForImageTextToText, AutoProcessor


MODEL_ID = "google/medgemma-4b-it"


def get_huggingface_token():
    """
    Retrieve the Hugging Face token securely
    from AWS Secrets Manager.
    """

    client = boto3.client(
        "secretsmanager",
        region_name="us-east-1"
    )

    response = client.get_secret_value(
        SecretId="medquad/huggingface-token"
    )

    token = response.get("SecretString", "").strip()

    if not token:
        raise RuntimeError(
            "Hugging Face token is missing or empty."
        )

    print("Hugging Face authentication: READY")
    return token



def load_medgemma():
    """Load MedGemma on a CUDA GPU."""

    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA GPU unavailable. "
            "MedGemma requires the planned GPU environment."
        )

    hf_token = get_huggingface_token()

    print("Loading MedGemma:", MODEL_ID)

    processor = AutoProcessor.from_pretrained(
        MODEL_ID,
        token=hf_token
    )

    model = AutoModelForImageTextToText.from_pretrained(
        MODEL_ID,
        token=hf_token,
        dtype=torch.bfloat16,
        device_map="auto"
    )

    model.eval()

    print("MedGemma loaded successfully.")

    return model, processor


def generate_answer(prompt, model, processor, max_new_tokens=256):
    """Generate an answer from an evidence-grounded prompt."""

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt}
            ],
        }
    ]

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )

    inputs = {
        key: value.to(model.device)
        for key, value in inputs.items()
    }

    with torch.inference_mode():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
        )

    generated_ids = output_ids[
        0, inputs["input_ids"].shape[-1]:
    ]

    return processor.decode(
        generated_ids,
        skip_special_tokens=True,
    ).strip()


def run_experiments(config_path, output_dir):
    """Run configured RAG experiments using one model load."""

    import time

    config_path = Path(config_path)
    input_dir = config_path.parent
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    config = json.loads(
        config_path.read_text(encoding="utf-8")
    )

    if config["model_id"] != MODEL_ID:
        raise ValueError("Unexpected model ID in configuration.")

    # Validate all inputs before loading the model.
    for experiment in config["experiments"]:
        prompt_path = input_dir / experiment["prompt_file"]
        if not prompt_path.is_file():
            raise FileNotFoundError(prompt_path)

    model, processor = load_medgemma()
    results = []

    for experiment in config["experiments"]:
        prompt_path = input_dir / experiment["prompt_file"]
        prompt = prompt_path.read_text(encoding="utf-8")

        print("Running:", experiment["name"])

        if torch.cuda.is_available():
            torch.cuda.synchronize()

        start = time.perf_counter()

        answer = generate_answer(
            prompt=prompt,
            model=model,
            processor=processor,
            max_new_tokens=config["generation"]["max_new_tokens"],
        )

        if torch.cuda.is_available():
            torch.cuda.synchronize()

        latency = time.perf_counter() - start

        result = {
            "experiment_id": config["experiment_id"],
            "experiment": experiment["name"],
            "model": MODEL_ID,
            "question": config["question"],
            "evidence_count": experiment["evidence_count"],
            "answer": answer,
            "generation_latency_seconds": round(latency, 3),
        }

        output_path = output_dir / experiment["output_file"]

        output_path.write_text(
            json.dumps(result, indent=2),
            encoding="utf-8",
        )

        results.append(result)
        print("Saved:", output_path)

    summary_path = output_dir / "experiment_results.json"

    summary_path.write_text(
        json.dumps(results, indent=2),
        encoding="utf-8",
    )

    print("All experiments completed.")
    return results


def main():
    parser = argparse.ArgumentParser(
        description="MedQuad AI — MedGemma inference"
    )

    parser.add_argument(
        "--config-file", "--config_file",
        dest="config_file",
        type=str,
        default=None
    )

    parser.add_argument(
        "--prompt-file", "--prompt_file",
        dest="prompt_file",
        type=str,
        default=None
    )

    parser.add_argument(
        "--output-file", "--output_file",
        dest="output_file",
        type=str,
        default=None
    )

    parser.add_argument(
        "--output-dir", "--output_dir",
        dest="output_dir",
        type=str,
        default=None
    )

    args = parser.parse_args()

    if args.config_file:
        if not args.output_dir:
            parser.error(
                "--output-dir is required with --config-file"
            )

        run_experiments(
            config_path=args.config_file,
            output_dir=args.output_dir
        )

    elif args.prompt_file and args.output_file:
        prompt = Path(args.prompt_file).read_text(
            encoding="utf-8"
        )

        model, processor = load_medgemma()

        answer = generate_answer(
            prompt=prompt,
            model=model,
            processor=processor
        )

        output_path = Path(args.output_file)
        output_path.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        output_path.write_text(
            json.dumps(
                {"model": MODEL_ID, "answer": answer},
                indent=2
            ),
            encoding="utf-8"
        )

        print("Answer saved:", output_path)

    else:
        parser.error(
            "Provide --config-file with --output-dir, "
            "or --prompt-file with --output-file"
        )


if __name__ == "__main__":
    main()

