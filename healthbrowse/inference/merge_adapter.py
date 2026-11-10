"""Export full FP16 safetensors for a provider that cannot load bare adapters.

Does not upload, activate, certify or pay for hosting. Review the export before
publication and include the base license/model card when distributing weights.
"""
import argparse
import json
from pathlib import Path
from model_settings import GENERAL_BASE, validate_adapter


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--model", default=GENERAL_BASE)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    manifest = validate_adapter(args.adapter, args.model, args.revision)
    output = Path(args.output)
    if output.exists() and any(output.iterdir()):
        raise ValueError("Choose an empty export directory")
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    if not torch.cuda.is_available():
        raise RuntimeError("This export profile requires a CUDA GPU with room for full FP16 weights")
    # Reload the unquantized base, not the NF4 training copy, before merging.
    base = AutoModelForCausalLM.from_pretrained(args.model, revision=args.revision,
        torch_dtype=torch.float16, device_map={"": 0}, trust_remote_code=False)
    model = PeftModel.from_pretrained(base, args.adapter).merge_and_unload(safe_merge=True)
    model.save_pretrained(output, safe_serialization=True, max_shard_size="4GB")
    AutoTokenizer.from_pretrained(args.model, revision=args.revision,
        trust_remote_code=False).save_pretrained(output)
    Path(output, "training-manifest.json").write_text(json.dumps({**manifest, "export": "merged-fp16",
        "clinical_release_approved": False}, indent=2))


if __name__ == "__main__":
    main()
