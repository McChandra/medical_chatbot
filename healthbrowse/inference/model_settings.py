"""CPU-only validation shared by training, adapter export and serving."""
import json
import re
from pathlib import Path

GENERAL_BASE = "meta-llama/Meta-Llama-3-8B-Instruct"
GENERAL_CONTEXT = 8192


def validate_base(model, revision, max_length=None):
    if ":" in model or not re.fullmatch(r"[\w.-]+/[\w.-]+", model):
        raise ValueError("Use a Hugging Face base-model repository, without a provider suffix")
    if not re.fullmatch(r"[a-f0-9]{40}", revision or ""):
        raise ValueError("Pin the base model to its reviewed 40-character commit SHA")
    if max_length is not None and (max_length < 1 or (model == GENERAL_BASE and max_length > GENERAL_CONTEXT)):
        raise ValueError("Llama 3 training examples must fit its 8192-token context")


def validate_adapter(path, model, revision):
    validate_base(model, revision)
    manifest = json.loads(Path(path, "training-manifest.json").read_text())
    config = json.loads(Path(path, "adapter_config.json").read_text())
    if manifest.get("base_model") != model or manifest.get("revision") != revision:
        raise ValueError("Adapter manifest does not match the pinned base model")
    if config.get("base_model_name_or_path") != model or config.get("revision") not in (None, revision):
        raise ValueError("PEFT adapter configuration does not match the base model")
    return manifest
