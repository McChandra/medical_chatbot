import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {groundedEvidence,prepareGrounded,decodeGrounded,groundedReview,groundedReviewPasses,presentGrounded} from '../server/model-grounded.mjs';
import {modelAPI} from '../server/model-api.mjs';
const assets=Object.fromEntries(['medline-topics','clinical-passages','grounded-sources'].map(n=>['/'+n+'.json',{text:readFileSync(new URL('../dist/'+n+'.json',import.meta.url),'utf8')}]));
const input={topic:'Sore Throat',question:'I have a sore throat and fever. What can cause this, and when should someone seek care?',role:'General reader',mode:'search',deck:0};
const prepare=i=>prepareGrounded(i,groundedEvidence(assets,i));
function output(p,i=input){
 const s=p.evidence.sources.find(s=>s.intent==='risk')||p.evidence.sources[0];
 const text=s.text.split('. ')[0]+'.';
 return {answer:[{text:text.slice(0,180),sources:[s.id]}],decks:i.mode==='chat'?{}:Object.fromEntries(Array.from({length:6},(_,j)=>[j+1,[]])),gaps:[]};
}
function review(d,p,override){return {checks:[...d.answer.claims,...d.decks.flatMap(s=>s.claims)].map(c=>({id:c.id,verdict:override||'supported'})),coverage:p.facets.map(f=>({id:f.id,verdict:d.gaps.includes(f.id)?'gap':'answered'}))};}
test('new source text has a hash, attribution, date and unapproved clinical status',()=>{
 for(const s of JSON.parse(assets['/grounded-sources.json'].text).passages){assert.equal(createHash('sha256').update(s.text).digest('hex'),s.textSha256);assert.match(s.url,/https:\/\/www\.(cdc|cancer)\.gov\//);assert.equal(s.clinicalReviewed,false);assert.equal(s.retrievedAt,'2026-11-12');}
});
test('retrieval improves six-deck coverage without using historical staging as prognosis',()=>{
 for(const topic of ['Leukemia','Sore Throat']){
  const p=prepare({...input,topic,question:'What is '+topic+'?'});
  assert.deepEqual([...new Set(p.evidence.sources.filter(s=>!s.overview).map(s=>s.deck))].sort(),[1,2,3,4,5,6]);
  assert.ok(p.evidence.sources.every(s=>!s.historical));
  assert.ok(p.evidence.sources.filter(s=>s.deck===5).every(s=>!s.text.includes('no standard staging')));
 }
});
test('compound care question retains both facets and escalation evidence; diabetes keeps subtype qualifiers',()=>{
 const p=prepare(input);assert.deepEqual(p.facets.map(f=>f.key),['causes','care']);
 assert.ok(p.evidence.sources.some(s=>s.intent==='escalation'&&/severe|Difficulty breathing/.test(s.text)));
 const d=prepare({...input,topic:'Diabetes',question:'How is diabetes managed?'});
 assert.ok(d.evidence.sources.some(s=>/If you have type 1 diabetes/.test(s.text)));
 assert.ok(d.evidence.sources.some(s=>/If you have type 2 diabetes/.test(s.text)));
 assert.ok(!d.evidence.sources.some(s=>s.text==='Are not physically active.'));
});
test('server resolves quotes and refuses arbitrary fields, long claims, missing sources and subtype loss',()=>{
 const p=prepare(input),raw=output(p),draft=decodeGrounded(raw,input,p);
 assert.equal(draft.answer.claims[0].support[0].quote,p.evidence.sources.find(s=>s.id===raw.answer[0].sources[0]).text);
 for(const mutate of [r=>r.answer[0].quote='fake',r=>r.answer[0].text='x'.repeat(181),r=>r.answer[0].sources=['invented'],r=>r.decks['7']=[]]){const bad=structuredClone(raw);mutate(bad);assert.throws(()=>decodeGrounded(bad,input,p));}
 const aml=prepare({...input,topic:'Leukemia',question:'What complications are described?'}),src=aml.evidence.sources.find(s=>s.scopeTerms?.includes('AML'));
 assert.ok(src);assert.throws(()=>decodeGrounded({...output(aml),answer:[{text:'Leukemia can cause anemia.',sources:[src.id]}]},input,aml),/subtype/);
});
test('review sees only each claim’s cited passages and rejects missed facets and unsafe support',()=>{
 const p=prepare(input),draft=decodeGrounded(output(p),input,p),r=groundedReview(draft,p,input);
 const payload=JSON.parse(r.messages[1].content);assert.equal(payload.claims[0].citedPassages.length,1);assert.equal(payload.claims[0].citedPassages[0].id,draft.answer.claims[0].support[0].id);
 assert.equal(groundedReviewPasses(review(draft,p,'insufficient'),draft,p),false);
 const ok=review(draft,p);ok.coverage[1].verdict='missed';assert.equal(groundedReviewPasses(ok,draft,p),false);
 ok.coverage[1].verdict='answered';assert.equal(groundedReviewPasses(ok,draft,p),true);
});
test('empty answers must disclose all gaps and are clearly presented',()=>{
 const p=prepare(input),raw={...output(p),answer:[]};assert.throws(()=>decodeGrounded(raw,input,p));
 raw.gaps=p.facets.map(f=>f.id);const d=decodeGrounded(raw,input,p);
 const display=presentGrounded(d,p,input,'test',false);assert.equal(display.gaps.length,2);assert.match(display.answer.text,/When to seek medical care/);
});
test('actual API uses schema requests, repairs once, and does not release failed support',async t=>{
 let calls=0;const statuses=[];
 const env={SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public',MODEL_GENERAL_URL:'https://gpu.example/v1/chat/completions',MODEL_GENERAL_KEY:'private-key',MODEL_GENERAL_ID:'adapter',MODEL_GENERAL_REVIEW_ID:'base',MODEL_GENERAL_CONTEXT_TOKENS:'8192',MODEL_GENERAL_PROTOCOL:'grounded-v2',DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:1}})}}}}}};
 let fail=true;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  if(String(url).includes('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  calls++;const b=JSON.parse(opts.body);assert.equal(b.response_format.type,'json_schema');const data=JSON.parse(b.messages[1].content);let value;
  if(data.claims){assert.equal(b.model,'base');value={checks:data.claims.map(c=>({id:c.id,verdict:fail?'insufficient':'supported'})),coverage:data.facets.map(f=>({id:f.id,verdict:'answered'}))};}
  else{const p=prepare(input);value=output(p);assert.ok(b.max_tokens<=1100);}
  return Response.json({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]});
 });
 const request=()=>new Request('https://site.test/api/ai/answer',{method:'POST',headers:{Authorization:'Bearer test-session-token','Content-Type':'application/json'},body:JSON.stringify(input)});
 const denied=await modelAPI(request(),env,assets);assert.equal(denied.status,502);assert.equal(calls,4);
 fail=false;const accepted=await modelAPI(request(),env,assets);assert.equal(accepted.status,200);assert.equal((await accepted.json()).protocol,'grounded-v2');
});
test('focused benchmark stays synchronized with the real gateway and includes observed failure controls',()=>{
 const raw=readFileSync(new URL('../inference/evaluation-v2/cases.json',import.meta.url),'utf8'),f=JSON.parse(raw);
 const manifest=JSON.parse(readFileSync(new URL('../inference/evaluation-v2/manifest.json',import.meta.url)));
 assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.sha256);
 for(const [file,sha] of Object.entries(manifest.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),sha);
 assert.equal(f.cases.length,8);assert.equal(f.controls.length,6);
 for(const c of f.cases)assert.deepEqual(prepare(c.input),c.prepared);
 for(const c of f.controls){assert.deepEqual(groundedReview(c.draft,c.prepared,c.input),c.request);if(!c.expectedSupported)assert.match(c.id,/wrong|missing/);}
});
