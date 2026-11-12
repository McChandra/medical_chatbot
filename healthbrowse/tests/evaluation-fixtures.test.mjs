import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectQuery} from '../dist/clinical-engine.js';
import {compactGeneration} from '../server/model-context.mjs';
import {evidenceFor} from '../server/model-evidence.mjs';
import {modelReviewEndpoint} from '../server/model-provider.mjs';
const path=new URL('../inference/evaluation/production-cases.jsonl',import.meta.url);
const raw=readFileSync(path,'utf8'),cases=raw.trim().split('\n').map(JSON.parse);
const assets=Object.fromEntries(['medline-topics','clinical-passages'].map(n=>['/'+n+'.json',{text:readFileSync(new URL('../dist/'+n+'.json',import.meta.url),'utf8')}]));
test('benchmark fixtures match the actual current production prompts and preserve evidence',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../inference/evaluation/manifest.json',import.meta.url)));
 assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.fixture_sha256);
 for(const c of cases){
  if(c.kind==='generation'){
   const evidence=evidenceFor(assets,c.input.topic,c.input.role,c.input.question);
   const p=compactGeneration(c.input,evidence);assert.deepEqual(p.messages,c.messages);
   assert.deepEqual(p.evidence,c.evidence);assert.ok(c.context_upper_bound<=8192);
  }else if(c.kind==='intercept'){
   const expected=inspectQuery(c.input.question);
   if(c.expected==='no_evidence')assert.equal(evidenceFor(assets,c.input.topic,c.input.role,c.input.question),null);
   else assert.equal(expected,c.expected);
  }
 }
});
test('reviewer credentials never follow a changed host implicitly',()=>{
 const env={MODEL_GENERAL_URL:'https://gpu.example/v1/chat/completions',MODEL_GENERAL_ID:'adapter',MODEL_GENERAL_KEY:'key',MODEL_GENERAL_CONTEXT_TOKENS:'8192'};
 assert.equal(modelReviewEndpoint(env,'general').model,'adapter');
 env.MODEL_GENERAL_REVIEW_ID='base-review';assert.equal(modelReviewEndpoint(env,'general').key,'key');
 env.MODEL_GENERAL_REVIEW_URL='https://other.example/v1/chat/completions';assert.equal(modelReviewEndpoint(env,'general'),null);
 env.MODEL_GENERAL_REVIEW_KEY='review-key';assert.equal(modelReviewEndpoint(env,'general').key,'review-key');
 delete env.MODEL_GENERAL_REVIEW_ID;assert.equal(modelReviewEndpoint(env,'general'),null);
});
