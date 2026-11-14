"""Evaluate a fixed adapter with production prompts and separate extraction holdout.

No training and no model upload. Resume completed cases under an identical manifest.
"""
import argparse
from collections import defaultdict
from contextlib import nullcontext
import hashlib
import json
import os
from pathlib import Path
import time
from adapter_artifact import EXPECTED_ADAPTER_SHA256
from model_settings import validate_adapter
from evaluation_checks import check_output


def sha(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as file:
        for block in iter(lambda:file.read(1024*1024),b''):
            digest.update(block)
    return digest.hexdigest()


def load_cases(path, artifact, include_holdout):
    manifest=json.loads(path.with_name('manifest.json').read_text())
    if sha(path)!=manifest['fixture_sha256']:
        raise ValueError('Evaluation fixture checksum changed; rebuild and record a new manifest')
    cases=[json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    if include_holdout:
        data=artifact/'data/test.jsonl'
        dataset_manifest=json.loads((artifact/'data/dataset-manifest.json').read_text())
        if sha(data)!=dataset_manifest['file_sha256']['test.jsonl']:
            raise ValueError('Holdout checksum mismatch')
        for i,line in enumerate(data.read_text().splitlines()):
            if not line.strip():continue
            row=json.loads(line);payload=json.loads(row['messages'][1]['content'])
            cases.append({'id':f'holdout-{i:03d}','kind':'holdout-extraction','input':payload,
                          'messages':row['messages'][:-1],'evidence':{'sources':payload['evidence']},
                          'max_tokens':1024,'target':row['messages'][2]['content']})
    return cases,manifest


def summarize(results):
    groups=defaultdict(list)
    for row in results:
        groups[(row['suite'],row['model_route'])].append(row)
    return {'groups':[{'suite':suite,'model_route':route,'cases':len(rows),
            'schema_passed':sum(r['checks'].get('schema_passed',False) for r in rows),
            'review_contract_passed':sum(r['checks'].get('contract_passed',False) for r in rows),
            'answered':sum(r['checks'].get('answer_present',False) for r in rows),
            'empty_search_decks':sum(6-len(r['checks'].get('populated_decks',[])) for r in rows if r['mode']=='search'),
            'seconds_total':round(sum(r['seconds'] for r in rows),2)} for (suite,route),rows in groups.items()],
            'clinical_release_approved':False,'manual_review_required':True,
            'limitations':['First-pass outputs only; not an end-to-end gateway or clinical benchmark.',
                'The 25 extraction holdouts use a compact copying prompt and must not be pooled with production questions.',
                'Quotes, JSON and lower loss do not establish relevance, full support, completeness or patient safety.',
                'Reviewer tests are synthetic contract controls, not independent medical validation.']}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact',type=Path,required=True)
    parser.add_argument('--cases',type=Path,default=Path(__file__).with_name('evaluation')/'production-cases.jsonl')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--expected-adapter-sha',default=EXPECTED_ADAPTER_SHA256)
    parser.add_argument('--include-holdout',action='store_true')
    parser.add_argument('--validate-only',action='store_true')
    args=parser.parse_args()
    experiment=json.loads((args.artifact/'experiment.json').read_text())
    model_id,revision=experiment['model'],experiment['base_revision']
    validate_adapter(args.artifact/'adapter',model_id,revision)
    weights_sha=sha(args.artifact/'adapter/adapter_model.safetensors')
    if weights_sha!=args.expected_adapter_sha:raise ValueError('Adapter checksum mismatch')
    cases,fixtures=load_cases(args.cases,args.artifact,args.include_holdout)
    config={'version':1,'model':model_id,'revision':revision,'adapter_sha256':weights_sha,
            'fixture_sha256':fixtures['fixture_sha256'],'include_holdout':args.include_holdout,
            'case_ids':[c['id'] for c in cases],'generation':'greedy; NF4; pinned base; output limit from fixture',
            'clinical_release_approved':False,
            'evaluator_sha256':{name:sha(Path(__file__).with_name(name)) for name in ['evaluate_adapter.py','evaluation_checks.py','model_settings.py']}}
    if args.include_holdout:config['test_sha256']=sha(args.artifact/'data/test.jsonl')
    args.output.mkdir(parents=True,exist_ok=True)
    manifest_path=args.output/'evaluation-manifest.json'
    if manifest_path.exists() and json.loads(manifest_path.read_text())!=config:
        raise ValueError('Evaluation settings/artifact differ. Use a new output directory')
    manifest_path.write_text(json.dumps(config,indent=2))
    if args.validate_only:
        print(json.dumps({'validated':True,'cases':len(cases),'intercepts':sum(c['kind']=='intercept' for c in cases),'gpu_run':False}))
        return
    os.environ['USE_TF']='0';os.environ['USE_FLAX']='0'
    import torch
    from transformers import AutoModelForCausalLM,AutoTokenizer,BitsAndBytesConfig
    from peft import PeftModel
    if not torch.cuda.is_available():raise RuntimeError('Run model evaluation on an authorized CUDA GPU')
    dtype=torch.bfloat16 if torch.cuda.get_device_capability()[0]>=8 and torch.cuda.is_bf16_supported() else torch.float16
    tokenizer=AutoTokenizer.from_pretrained(model_id,revision=revision,trust_remote_code=False)
    tokenizer.pad_token=tokenizer.eos_token
    quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=dtype)
    base=AutoModelForCausalLM.from_pretrained(model_id,revision=revision,trust_remote_code=False,
                                            quantization_config=quant,torch_dtype=dtype,device_map={'':0})
    model=PeftModel.from_pretrained(base,str(args.artifact/'adapter'));model.eval()
    result_path=args.output/'results.jsonl'
    results=[json.loads(line) for line in result_path.read_text().splitlines() if line.strip()] if result_path.exists() else []
    completed={(r['case_id'],r['model_route']) for r in results}
    with result_path.open('a') as output:
        for case in cases:
            if case['kind']=='intercept':continue  # Checked with actual gateway guards by Node tests, never sent to a model.
            for route in ['base','adapter']:
                if (case['id'],route) in completed:continue
                inputs=tokenizer.apply_chat_template(case['messages'],tokenize=True,add_generation_prompt=True,
                                                     return_tensors='pt',return_dict=True).to(model.device)
                count=inputs['input_ids'].shape[-1]
                if count+case['max_tokens']>model.config.max_position_embeddings:
                    raise ValueError(f"Case {case['id']} exceeds model context; no silent truncation")
                start=time.monotonic();torch.cuda.reset_peak_memory_stats()
                with (model.disable_adapter() if route=='base' else nullcontext()),torch.inference_mode():
                    generated=model.generate(**inputs,max_new_tokens=case['max_tokens'],do_sample=False,pad_token_id=tokenizer.eos_token_id)
                tokens=generated[0,count:];text=tokenizer.decode(tokens,skip_special_tokens=True)
                row={'case_id':case['id'],'suite':case['kind'],'model_route':route,'mode':case['input']['mode'],
                     'question':case['input']['question'],'prompt_tokens':count,'output_tokens':len(tokens),
                     'seconds':round(time.monotonic()-start,3),'peak_gpu_bytes':torch.cuda.max_memory_allocated(),
                     'output':text,'checks':check_output(text,case,len(tokens)>=case['max_tokens'])}
                results.append(row);output.write(json.dumps(row,ensure_ascii=False)+'\n');output.flush()
                (args.output/'summary.json').write_text(json.dumps(summarize(results),indent=2))
                print(json.dumps({k:row[k] for k in ['case_id','model_route','seconds','checks']}),flush=True)
    print(json.dumps(summarize(results),indent=2))


if __name__=='__main__':main()
