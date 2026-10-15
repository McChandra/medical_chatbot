
from pathlib import Path

import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM


MODEL_PATH = Path("artifacts/models/flan-t5-medquad")


def load_fine_tuned_model():
    """Load the fine-tuned FLAN-T5 model and tokenizer."""

    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)

    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_PATH)
    model.eval()

    return tokenizer, model


def generate_answer(question, tokenizer, model):
    """Generate a medical information response."""

    # Match the input prefix used during fine-tuning.
    input_text = f"answer medical question: {question}"

    inputs = tokenizer(
        input_text,
        return_tensors="pt",
        truncation=True,
        max_length=64,
    )

    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=150,
            num_beams=4,
            do_sample=False,
            no_repeat_ngram_size=3,
            repetition_penalty=1.2,
            early_stopping=True,
        )

    return tokenizer.decode(
        outputs[0],
        skip_special_tokens=True,
    )


if __name__ == "__main__":
    tokenizer, model = load_fine_tuned_model()

    question = "What is diabetes?"

    answer = generate_answer(question, tokenizer, model)

    print("\nQuestion:", question)
    print("\nGenerated answer:", answer)
