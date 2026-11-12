"""Run the real gateway/reviewer/repair chain on a private, loopback GPU service.

No retraining, public server, tunnel, or user-account connection. Run fixtures only.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from adapter_artifact import EXPECTED_ADAPTER_SHA256
from model_settings import validate_adapter

HERE=Path(__file__).resolve().parent


def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def preflight(artifact):
    config=json.loads((artifact/'experiment.json').read_text())
    validate_adapter(artifact/'adapter',config['model'],config['base_revision'])
    if digest(artifact/'adapter/adapter_model.safetensors')!=EXPECTED_ADAPTER_SHA256:
        raise ValueError('Adapter differs from the evaluated export')
    node=shutil.which('node')
    if not node:raise RuntimeError('Node.js is required; run the notebook setup cell')
    version=subprocess.check_output([node,'--version'],text=True).strip()
    if int(version.lstrip('v').split('.')[0])<22:
        raise RuntimeError('Use Node.js 22 or newer for the gateway evaluation')
    fixtures=json.loads((HERE/'evaluation-v2/cases.json').read_text())
    return config,node,version,fixtures


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--validate-only',action='store_true')
    args=parser.parse_args()
    config,node,node_version,fixtures=preflight(args.artifact)
    if args.validate_only:
        print(json.dumps({'validated':True,'pipeline_cases':len(fixtures['cases']),'generator_routes':2,
                          'review_controls':len(fixtures['controls']),'gpu_run':False}))
        return
    if not os.environ.get('HF_TOKEN'):raise RuntimeError('Set HF_TOKEN in Colab Secrets')
    # nvidia-smi does not create a second model/CUDA context in this supervisor.
    gpu=subprocess.check_output(['nvidia-smi','--query-gpu=name,driver_version,memory.total','--format=csv,noheader'],text=True).strip()
    packages={name:importlib.metadata.version(name) for name in ['torch','transformers','peft','bitsandbytes','lm-format-enforcer','jsonschema']}
    runtime={'adapter_sha256':EXPECTED_ADAPTER_SHA256,'base_model':config['model'],'base_revision':config['base_revision'],
             'node':node_version,'python':sys.version,'packages':packages,'gpu':gpu,
             'inference_hashes':{name:digest(HERE/name) for name in ['serve.py','structured_output.py','model_settings.py','run_grounded_pipeline.py','requirements.txt']}}
    args.output.mkdir(parents=True,exist_ok=True)
    runtime_path=args.output/'runtime.json'
    if runtime_path.exists() and json.loads(runtime_path.read_text())!=runtime:
        raise ValueError('Code or runtime changed. Preserve this run and use a new evaluation name')
    runtime_path.write_text(json.dumps(runtime,indent=2))
    key=secrets.token_urlsafe(40)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'USE_TF':'0','USE_FLAX':'0','MODEL_ID':config['model'],'MODEL_REVISION':config['base_revision'],
         'ADAPTER_PATH':str((args.artifact/'adapter').resolve()),'SERVED_MODEL_ID':'healthbrowse-general-qlora',
         'BASE_MODEL_ALIAS':'healthbrowse-general-base-review','LOAD_IN_4BIT':'1','ALLOW_RESEARCH_ADAPTER':'1',
         'MAX_INPUT_TOKENS':'6144','INFERENCE_API_KEY':key}
    log_dir=args.output/'logs';log_dir.mkdir(exist_ok=True)
    log_path=log_dir/('service-'+time.strftime('%Y%m%dT%H%M%S')+'-'+secrets.token_hex(3)+'.log')
    process=subprocess.Popen([sys.executable,'-m','uvicorn','serve:app','--host','127.0.0.1','--port',str(port),
                              '--no-access-log','--workers','1'],cwd=HERE,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    def pump():
        with log_path.open('w') as log:
            for line in process.stdout:
                line=line.replace(key,'[REDACTED]').replace(os.environ['HF_TOKEN'],'[REDACTED]')
                log.write(line);log.flush()
    thread=threading.Thread(target=pump,daemon=True);thread.start()
    base=f'http://127.0.0.1:{port}/'
    print('Loading the pinned model on loopback only. Service log:',log_path,flush=True)
    try:
        ready=False
        for second in range(900):
            if process.poll() is not None:
                thread.join(timeout=2)
                raise RuntimeError('GPU service failed during loading:\n'+log_path.read_text()[-12000:])
            try:
                with urllib.request.urlopen(base+'healthz',timeout=2) as response:
                    ready=json.load(response).get('ready') is True
            except (OSError,ValueError):pass
            if ready:break
            if second and second%30==0:print('Still downloading/loading the model…',flush=True)
            time.sleep(1)
        if not ready:raise RuntimeError('Model load timed out. Inspect '+str(log_path))
        subprocess.run([node,str(HERE.parent/'scripts/run-grounded-evaluation.mjs'),str(args.output.resolve()),base],env=env,check=True)
        print('Completed gateway evaluation:',args.output,flush=True)
    finally:
        process.terminate()
        try:process.wait(timeout=20)
        except subprocess.TimeoutExpired:process.kill();process.wait()
        thread.join(timeout=3)


if __name__=='__main__':main()
