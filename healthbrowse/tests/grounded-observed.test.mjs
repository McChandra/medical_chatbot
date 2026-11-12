import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeGrounded,groundedDraftIssues,groundedReviewPasses,groundedEvidence,prepareGrounded} from '../server/model-grounded.mjs';
import {modelAPI} from '../server/model-api.mjs';
const observed=JSON.parse(readFileSync(new URL('./fixtures/grounded-v2-observed.json',import.meta.url)));
test('all four observed accepted answers are now withheld for unfinished sentences',()=>{
 assert.equal(observed.acceptedDrafts.length,4);
 for(const c of observed.acceptedDrafts)assert.throws(()=>decodeGrounded(c.raw,c.input,c.prepared),/incomplete sentence/,c.route+': '+c.id);
});
test('observed reviewer false acceptances cannot override missing cited facet evidence',()=>{
 for(const c of observed.controls){
  assert.equal(groundedReviewPasses(c.review,c.draft,c.prepared),c.expectedSupported,c.id);
 }
 const c=structuredClone(observed.controls.find(c=>c.id==='wrong-mechanism-for-management'));
 c.prepared.evidence.sources[0].intent='mechanism';
 assert.equal(groundedReviewPasses(c.review,c.draft,c.prepared),false,'classified mechanism evidence is still not therapy evidence');
});
test('complete answers and explicitly disclosed gaps remain eligible for support review',()=>{
 const c=structuredClone(observed.controls.find(c=>c.id==='missing-when-to-seek-care'));
 c.draft.gaps=['F2'];c.review.coverage.find(f=>f.id==='F2').verdict='gap';
 assert.equal(groundedReviewPasses(c.review,c.draft,c.prepared),true);
 const positive=observed.controls.find(c=>c.expectedSupported);
 for(const text of ['If a virus causes a sore throat, antibiotics will not help.', 'Antibiotics do not help a sore throat caused by a virus.']){
  const d=structuredClone(positive.draft);d.answer.claims[0].text=text;
  assert.deepEqual(groundedDraftIssues(d,positive.prepared),[]);
 }
 for(const text of ['The treatment includes', 'The treatment includes.', 'The treatment (including examples.', 'The treatment includes...']){
  const d=structuredClone(positive.draft);d.answer.claims[0].text=text;
  assert.ok(groundedDraftIssues(d,positive.prepared).some(s=>s.includes('incomplete sentence')),text);
 }
});
test('a slow rejected generation does not trigger another full cycle beyond the remaining budget',async t=>{
 const assets=Object.fromEntries(['medline-topics','clinical-passages','grounded-sources'].map(n=>['/'+n+'.json',{text:readFileSync(new URL('../dist/'+n+'.json',import.meta.url),'utf8')}]));
 const input={topic:'Sore Throat',question:'What causes sore throat?',role:'General reader',mode:'chat',deck:1};
 const p=prepareGrounded(input,groundedEvidence(assets,input)),source=p.evidence.sources.find(s=>s.intent==='risk');
 const env={SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public',MODEL_GENERAL_URL:'https://gpu.example/v1/chat/completions',MODEL_GENERAL_KEY:'test-key',MODEL_GENERAL_ID:'adapter',MODEL_GENERAL_REVIEW_ID:'base',MODEL_GENERAL_CONTEXT_TOKENS:'8192',MODEL_GENERAL_PROTOCOL:'grounded-v2',DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:1}})}}}}}};
 let clock=1000000,calls=0;t.mock.method(Date,'now',()=>clock);
 t.mock.method(globalThis,'fetch',async(url)=>{
  if(String(url).includes('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  calls++;clock+=80000;
  return Response.json({choices:[{message:{content:JSON.stringify({answer:[{text:'Sore throat can be caused by',sources:[source.id]}],decks:{},gaps:[]})},finish_reason:'stop'}]});
 });
 const response=await modelAPI(new Request('https://site.test/api/ai/answer',{method:'POST',headers:{Authorization:'Bearer test-session-token','Content-Type':'application/json'},body:JSON.stringify(input)}),env,assets);
 assert.equal(calls,1);assert.equal(response.status,503);assert.equal((await response.json()).code,'repair_budget_exhausted');
});
