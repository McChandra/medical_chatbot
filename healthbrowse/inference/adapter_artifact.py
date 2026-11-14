"""Read the user's adapter export without executing archive content."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile
from model_settings import validate_adapter

EXPECTED_ADAPTER_SHA256 = '9fd872b09372d3d079aa7f359e4072cdb66954d0e5e77b130f5a0441a397e5c5'


def inspect_export(path):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 100 or sum(e.file_size for e in entries) > 512 * 1024**2:
            raise ValueError('Archive exceeds this adapter export profile')
        names = set()
        for entry in entries:
            p = PurePosixPath(entry.filename)
            if (entry.filename in names or not p.parts or p.as_posix() != entry.filename
                    or p.is_absolute() or '..' in p.parts or '\\' in entry.filename
                    or stat.S_ISLNK(entry.external_attr >> 16) or entry.is_dir()):
                raise ValueError('Unsafe or duplicate archive member')
            if not (p.parts[0] in {'adapter','data'} or entry.filename in {'experiment.json','comparison.json'}):
                raise ValueError('Unexpected export member')
            if p.suffix not in {'.json','.jsonl','.safetensors','.model','.txt'}:
                raise ValueError('Unexpected export file type')
            names.add(entry.filename)
        for name in ['adapter/adapter_model.safetensors','adapter/adapter_config.json','adapter/training-manifest.json','experiment.json']:
            if name not in names:
                raise ValueError('Incomplete adapter export')
        if archive.testzip():
            raise ValueError('Archive CRC check failed')
        weights = archive.read('adapter/adapter_model.safetensors')
        manifest = json.loads(archive.read('adapter/training-manifest.json'))
        experiment = json.loads(archive.read('experiment.json'))
        config = json.loads(archive.read('adapter/adapter_config.json'))
        if config.get('peft_type') != 'LORA' or config.get('task_type') != 'CAUSAL_LM':
            raise ValueError('Expected a causal-LM LoRA adapter')
        if manifest.get('base_model') != experiment.get('model') or manifest.get('revision') != experiment.get('base_revision'):
            raise ValueError('Experiment and adapter base pins differ')
        if 'data/dataset-manifest.json' in names:
            data_manifest = json.loads(archive.read('data/dataset-manifest.json'))
            for name, expected in data_manifest['file_sha256'].items():
                if name not in {'train.jsonl','validation.jsonl','test.jsonl'}:
                    raise ValueError('Unexpected dataset filename')
                if hashlib.sha256(archive.read('data/'+name)).hexdigest() != expected:
                    raise ValueError('Dataset checksum mismatch')
            for name, field in [('train.jsonl','train_sha256'),('validation.jsonl','validation_sha256')]:
                if data_manifest['file_sha256'].get(name) != manifest.get(field):
                    raise ValueError('Training data hashes differ from the dataset manifest')
        return {'adapter_sha256':hashlib.sha256(weights).hexdigest(),'manifest':manifest,'experiment':experiment,'files':sorted(names)}


def extract_export(path, output, expected_sha=EXPECTED_ADAPTER_SHA256):
    report = inspect_export(path)
    if report['adapter_sha256'] != expected_sha:
        raise ValueError('This is not the reviewed artifact checksum; inspect the new export before using it')
    output = Path(output)
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use a new empty artifact directory; existing files are preserved')
    output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(path) as archive:
        for name in report['files']:
            target = output / name
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(archive.read(name))
    validate_adapter(output/'adapter',report['manifest']['base_model'],report['manifest']['revision'])
    return report


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('archive',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--expected-sha',default=EXPECTED_ADAPTER_SHA256)
    args=parser.parse_args()
    report=extract_export(args.archive,args.output,args.expected_sha) if args.output else inspect_export(args.archive)
    print(json.dumps(report,indent=2))
