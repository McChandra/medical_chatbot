
"""
MedQuad AI — Llama Baseline

Purpose:
    Evaluate a pretrained Llama model on MedQuAD
    questions before QLoRA fine-tuning.

This script does not train the model.
"""

import pandas as pd
import torch

from pathlib import Path
from transformers import AutoTokenizer, AutoModelForCausalLM


# --------------------------------------------------
# MODEL CONFIGURATION
# --------------------------------------------------

MODEL_NAME = "meta-llama/Llama-3.2-1B-Instruct"

PROJECT_ROOT = Path(__file__).resolve().parent.parent

TEST_PATH = PROJECT_ROOT / "data" / "processed" / "test.csv"

MAX_NEW_TOKENS = 256


# --------------------------------------------------
# LOAD PRETRAINED LLAMA MODEL AND TOKENIZER
# --------------------------------------------------

def load_model_and_tokenizer():
    """
    Load the pretrained Llama model and its tokenizer.

    Returns:
        tokenizer: Converts text into model tokens.
        model: Pretrained causal language model.
    """

    print(f"Loading tokenizer: {MODEL_NAME}")

    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME
    )

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print(f"Loading model: {MODEL_NAME}")

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        torch_dtype=torch.float16,
        device_map="auto"
    )

    model.eval()

    return tokenizer, model


# --------------------------------------------------
# GENERATE MEDICAL ANSWERS
# --------------------------------------------------

def generate_medical_answer(
    question: str,
    tokenizer,
    model
) -> str:
    """
    Generate a general medical explanation using Llama.
    """

    messages = [
        {
            "role": "system",
            "content": (
                "You are MedQuad AI, a medical education "
                "assistant. Provide clear, factual, general "
                "medical explanations. Do not diagnose patients "
                "or recommend personalized treatments. "
                "If you are uncertain, say so. "
                "Do not invent medical references."
            )
        },
        {
            "role": "user",
            "content": question
        }
    ]

    prompt = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )

    inputs = tokenizer(
        prompt,
        return_tensors="pt"
    ).to(model.device)

    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id
        )

    generated_tokens = outputs[0][
        inputs["input_ids"].shape[-1]:
    ]

    answer = tokenizer.decode(
        generated_tokens,
        skip_special_tokens=True
    )

    return answer.strip()


# --------------------------------------------------
# MAIN EXECUTION
# --------------------------------------------------

def main():
    """
    Run a single baseline inference test.
    """

    print("Starting MedQuad AI Llama baseline...")

    # Load pretrained model and tokenizer.
    tokenizer, model = load_model_and_tokenizer()

    # Use one medical question for initial testing.
    question = "What is endocarditis?"

    print(f"\nQuestion: {question}")
    print("\nGenerating answer...")

    answer = generate_medical_answer(
        question=question,
        tokenizer=tokenizer,
        model=model
    )

    print(f"\nModel answer:\n{answer}")


if __name__ == "__main__":
    main()
