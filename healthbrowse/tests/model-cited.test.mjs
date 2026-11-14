import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {citedEvidence,prepareCited,presentCited,prepareCitedReview,applyCitedReview} from '../server/model-cited.mjs';
import {modelAPI,modelStatus} from '../server/model-api.mjs';
import {modelEndpoint,GROQ_CHAT_URL} from '../server/model-provider.mjs';
import {openWorkspace} from '../server/sqlite-workspace.mjs';
const assets=Object.fromEntries(['medline-topics','clinical-passages','grounded-sources'].map(n=>['/'+n+'.json',{text:readFileSync(new URL('../dist/'+n+'.json',import.meta.url),'utf8')}]));
const input={topic:'Leukemia',question:'What is leukemia?',role:'General reader',mode:'search',deck:0};
const prepared=prepareCited(input,citedEvidence(assets,input));
function rawFor(p=prepared,mode='search'){
 const claim=s=>({text:s.text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()||s.text+'.',sources:[s.id]});
 return {answer:[claim(p.evidence.sources.find(s=>s.overview)||p.evidence.sources[0])],decks:mode==='chat'?{}:Object.fromEntries(Array.from({length:6},(_,i)=>{
  const s=p.evidence.sources.find(s=>s.deck===i+1&&!s.overview);return [i+1,s?[claim(s)]:[]];
 }))};
}
test('Groq uses only its own key and a fixed endpoint for both reading modes',()=>{
 const env={MODEL_PROVIDER:'groq',HF_TOKEN:'must-not-leak',MODEL_PROFESSIONAL_KEY:'must-not-leak'};
 assert.equal(modelEndpoint(env,'general'),null);assert.equal(modelEndpoint(env,'professional'),null);
 env.GROQ_API_KEY='test-only';
 for(const route of ['general','professional']){const c=modelEndpoint(env,route);assert.equal(c.url,GROQ_CHAT_URL);assert.equal(c.key,'test-only');assert.equal(c.model,'openai/gpt-oss-120b');}
 assert.equal(modelEndpoint({...env,GROQ_MODEL:'unverified'},'general'),null);
 assert.doesNotMatch(JSON.stringify(modelStatus(env)),/test-only|must-not-leak/);
});
test('six decks have source coverage for leukemia and sore throat, including scoped complications',()=>{
 for(const topic of ['Leukemia','Sore Throat','Cold Sores']){
  const p=prepareCited({...input,topic},citedEvidence(assets,{...input,topic}));
  for(const deck of (topic==='Cold Sores'?[1,2,3,5,6]:[1,2,3,4,5,6]))assert.ok(p.evidence.sources.some(s=>s.deck===deck&&!s.overview),topic+' deck '+deck);
  assert.ok(JSON.stringify(p.messages).length<18000);assert.ok(p.evidence.sources.every(s=>!s.historical));
  assert.equal(p.maxTokens,2400);assert.equal(prepareCitedReview(rawFor(p),p,input).maxTokens,1400);
  assert.doesNotMatch(JSON.stringify(p.schema),/maxLength/,'Schema must not truncate sentences');
 }
});
test('one unsupported claim does not remove the other decks; no false certification',()=>{
 const raw=rawFor();raw.decks['3']=[{text:'Invented clinical statement.',sources:['FAKE']}];
 const r=presentCited(raw,prepared,input,'test');assert.equal(r.decks.length,6);assert.ok(r.answer.generation);
 assert.ok(r.decks[0].generation);assert.equal(r.decks[2].generation,undefined);assert.match(r.decks[2].modelNotice,/Source excerpt/);
 assert.equal(r.validation.withheldClaims,1);
 for(const b of [r.answer,...r.decks].flatMap(s=>s.blocks)){assert.ok(b.references.every(ref=>ref.text===ref.quote));assert.doesNotMatch(b.verification,/review passed|certified/);}
});
test('misfiled IDs, unfinished sentences, doses and omitted subtype are withheld',()=>{
 const prepared=prepareCited({...input,question:'AML complications bleeding'},citedEvidence(assets,input));
 const subtype=prepared.evidence.sources.find(s=>s.scopeTerms?.includes('AML'));
 for(const claim of [
  {text:'Leukemia causes bleeding.',sources:[subtype.id]},
  {text:'The treatment includes.',sources:[prepared.evidence.sources[0].id]},
  {text:'Take 20 mg daily.',sources:[prepared.evidence.sources[0].id]},
  {text:'You have leukemia.',sources:[prepared.evidence.sources[0].id]},
 ]){const r=presentCited({...rawFor(),answer:[claim]},prepared,input,'test');assert.equal(r.answer.generation,undefined);assert.equal(r.validation.withheldClaims,1);}
 const raw=rawFor();raw.decks['4']=[{text:'A complete sentence.',sources:[prepared.evidence.sources[0].id]}];
 assert.equal(presentCited(raw,prepared,input,'test').decks[3].generation,undefined);
});
test('empty evidence sections remain visible as truthful gaps',()=>{
 const p={...prepared,evidence:{...prepared.evidence,sources:[]}};
 const r=presentCited({answer:[],decks:{}},p,input,'test');assert.equal(r.decks.length,6);
 assert.ok(r.decks.every(d=>d.modelNotice.startsWith('Evidence gap')));
});
test('Buddy schema avoids unsupported empty-object shapes; reviews must cover every claim',()=>{
 const chat={...input,mode:'chat'};
 assert.deepEqual(Object.keys(prepareCited(chat,citedEvidence(assets,chat)).schema.properties),['answer']);
 const raw=rawFor(),check=prepareCitedReview(raw,prepared,input);
 const rejected=applyCitedReview({checks:[]},check,prepared,input);assert.equal(rejected.answer.length,0);
 const checks=check.claims.map(c=>({id:c.id,verdict:'supported',sources:c.sources}));
 checks[0].sources=['invented'];const reviewed=applyCitedReview({checks},check,prepared,input);assert.equal(reviewed.answer.length,0);assert.ok(reviewed.decks[1].length);
 checks[0].sources=check.claims[0].sources;assert.equal(applyCitedReview({checks},check,prepared,input).answer.length,1);
});
test('both modes and Buddy generate once and review support once through the API contract',async t=>{
 const DB=openWorkspace(':memory:');t.after(()=>DB.close());
 for(const e of JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url))).entries)DB.exec(readFileSync(new URL('../drizzle/'+e.tag+'.sql',import.meta.url),'utf8'));
 const env={DB,SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public',MODEL_PROVIDER:'groq',GROQ_API_KEY:'test-only'};
 const calls=[];let providerStatus=200;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  if(url==='https://auth.example/auth/v1/user')return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  assert.equal(url,GROQ_CHAT_URL);assert.equal(opts.headers.Authorization,'Bearer test-only');
  const body=JSON.parse(opts.body);calls.push(body);if(providerStatus!==200)return Response.json({}, {status:providerStatus});
  const p=JSON.parse(body.messages[1].content);
  if(p.claims)return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({checks:p.claims.map(c=>({id:c.id,verdict:'supported',sources:c.sources}))})}}]});
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(rawFor({evidence:{sources:p.evidence}},p.mode))}}]});
 });
 const call=b=>modelAPI(new Request('https://site.test/api/ai/answer',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-session-12345'},body:JSON.stringify(b)}),env,assets);
 for(const role of ['General','Clinicians']){const r=await (await call({...input,role})).json();assert.equal(r.status,'generated');assert.equal(r.decks.length,6);}
 assert.equal(calls.length,4);assert.notEqual(calls[0].messages[0].content,calls[2].messages[0].content);
 assert.equal(calls[0].response_format.type,'json_schema');assert.equal(calls[0].reasoning_effort,'low');assert.equal(calls[0].include_reasoning,false);
 const chat={...input,mode:'chat',deck:4,question:'Explain that further',searchQuery:input.question,history:['What treatments are used?'],browserContext:'Current deck: treatment depends on the leukemia subtype.'};
 const r=await (await call(chat)).json();assert.deepEqual(r.decks,[]);assert.equal(calls.length,6);
 assert.equal(JSON.parse(calls[4].messages[1].content).browserContext,chat.browserContext);
 assert.equal((await call({...chat,browserContext:'x'.repeat(1201)})).status,400);
 providerStatus=429;const busy=await call(input);assert.equal((await busy.json()).code,'provider_busy');assert.equal(calls.length,7,'No repeated billable retries');
 delete env.GROQ_API_KEY;assert.equal((await call(input)).status,503);assert.equal(calls.length,7);
});

test('withheld overview wording can use an independently supported deck claim from the same evidence',()=>{
 const p=prepareCited({...input,topic:'Sore Throat'},citedEvidence(assets,{...input,topic:'Sore Throat'}));
 const source=p.evidence.sources.find(s=>s.key==='cdc-throat-causes');
 const supported={text:source.text,sources:[source.id]};
 const raw={answer:[{text:source.text+' It proves a personal diagnosis.',sources:[source.id]}],decks:{1:[supported]}};
 const check=prepareCitedReview(raw,p,input);
 const review={checks:check.claims.map(c=>({id:c.id,verdict:c.deck?'supported':'unsupported',sources:c.deck?c.sources:[]}))};
 const result=applyCitedReview(review,check,p,input);
 assert.deepEqual(result.answer,[supported]);assert.ok(result.answerRecoveredFromDecks);assert.doesNotMatch(result.answer[0].text,/personal diagnosis/);
 assert.equal(result.withheldClaims,1,'The rejected original remains counted as withheld');
});
