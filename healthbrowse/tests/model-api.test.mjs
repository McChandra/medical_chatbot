import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {modelAPI,modelStatus} from '../server/model-api.mjs';
import {evidenceFor,validateDraft,reviewPasses,generationMessages} from '../server/model-evidence.mjs';
import {openWorkspace} from '../server/sqlite-workspace.mjs';
import {requestSynthesis,synthesisKey} from '../dist/model-client.js';
const assets=Object.fromEntries(['medline-topics','clinical-passages'].map(name=>['/'+name+'.json',{text:readFileSync(new URL('../dist/'+name+'.json',import.meta.url),'utf8')}]));
const input={topic:'Leukemia',question:'What is leukemia?',role:'General reader',mode:'search',deck:0};
const evidence=evidenceFor(assets,input.topic,input.role,input.question);
function draftFor(e=evidence,mode='search'){
 const claim=s=>({text:s.text.slice(0,Math.min(300,s.text.length)),support:[{id:s.id,quote:s.text.slice(0,Math.min(300,s.text.length))}]});
 return {answer:{claims:[claim(e.sources[0])]},decks:mode==='chat'?[]:Array.from({length:6},(_,i)=>({id:i+1,claims:e.sources.find(s=>s.deck===i+1&&!s.overview)?[claim(e.sources.find(s=>s.deck===i+1&&!s.overview))]:[]}))};
}
function fixture(t,provider){
 const DB=openWorkspace(':memory:');const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url)));
 for(const e of journal.entries)DB.exec(readFileSync(new URL('../drizzle/'+e.tag+'.sql',import.meta.url),'utf8'));t.after(()=>DB.close());
 const env={DB,SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public',MODEL_GENERAL_URL:'https://llama.example/v1/chat/completions',MODEL_GENERAL_KEY:'server-secret',MODEL_GENERAL_ID:'llama-adapter',MODEL_PROFESSIONAL_URL:'https://medgemma.example/v1/chat/completions',MODEL_PROFESSIONAL_KEY:'other-server-secret',MODEL_PROFESSIONAL_ID:'medgemma'};
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  if(url==='https://auth.example/auth/v1/user')return opts.headers.Authorization.endsWith('invalid-token')?Response.json({}, {status:401}):Response.json({id:'11111111-1111-4111-8111-111111111111'});
  const b=JSON.parse(opts.body);calls.push({url,body:b});
  if(provider)return provider(b,calls);
  const data=JSON.parse(b.messages[1].content);
  const output=data.draft?{questionAnswered:true,checks:[...data.draft.answer.claims,...data.draft.decks.flatMap(d=>d.claims)].map(c=>({id:c.id,verdict:'supported'}))}:draftFor({sources:data.evidence},data.mode);
  return Response.json({choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop'}]});
 });
 const call=(body=input,options={})=>modelAPI(new Request('https://site.test/api/ai/answer',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(options.token||'valid-token-12345'),...options.headers},body:JSON.stringify(body),signal:options.signal}),env,assets);
 return {call,env,calls,DB};
}
test('model response returns a direct answer and exactly six source-linked decks',async t=>{
 const {call,calls}=fixture(t);const response=await call();assert.equal(response.status,200);const r=await response.json();
 assert.equal(r.status,'generated');assert.equal(r.decks.length,6);assert.equal(calls.length,2);assert.equal(calls[0].body.model,'llama-adapter');
 for(const b of [r.answer,...r.decks].flatMap(s=>s.blocks)){assert.ok(b.references.length);assert.ok(b.references.every(s=>s.text.includes(s.quote)));assert.match(b.verification,/Not independent/)}
 assert.equal(r.answer.checks.length,0,'Do not falsely label paraphrases as exact source matches');
});
test('both model routes accept the two labels and normalize legacy roles',async t=>{
 const {call,calls}=fixture(t);for(const role of ['General','Clinicians','Patient','Medical student','Medical professional','Advanced professional']){const r=await call({...input,role});assert.equal(r.status,200);assert.equal(calls.at(-1).body.model,(role.includes('professional')||role==='Clinicians')?'medgemma':'llama-adapter')}
 assert.notEqual(generationMessages(input,evidence)[0].content,generationMessages({...input,role:'Medical professional'},evidence)[0].content);
});
test('server owns retrieval and citations; rejects fabricated citations, altered quotes and misfiled decks',()=>{
 for(const mutate of [d=>d.answer.claims[0].support[0].id='fake',d=>d.answer.claims[0].support[0].quote='Made-up evidence about an imaginary cure',d=>d.decks[0].id=2,d=>d.answer.claims[0].support=[],d=>d.answer.claims[0].text='You have leukemia.']){const draft=draftFor();mutate(draft);assert.throws(()=>validateDraft(draft,input,evidence))}
 const valid=validateDraft(draftFor(),input,evidence);assert.equal(reviewPasses({questionAnswered:true,checks:[]},valid),false);
});
test('failed automated support review triggers one repair then withholds unsafe output',async t=>{
 const {call,calls}=fixture(t,async b=>{const data=JSON.parse(b.messages[1].content);return Response.json({choices:[{message:{content:JSON.stringify(data.draft?{questionAnswered:false,checks:[]}:draftFor())}}]})});
 const r=await call();assert.equal(r.status,502);assert.equal((await r.json()).code,'verification_failed');assert.equal(calls.length,4);assert.match(calls[2].body.messages.at(-1).content,/failed source/);
});
test('one repaired draft can pass but is labeled corrected, not certified',async t=>{
 const {call}=fixture(t,async(b,calls)=>{const data=JSON.parse(b.messages[1].content);let d;
  if(data.draft)d={questionAnswered:true,checks:[...data.draft.answer.claims,...data.draft.decks.flatMap(s=>s.claims)].map(c=>({id:c.id,verdict:'supported'}))};
  else{d=draftFor();if(calls.length===1)d.answer.claims[0].support[0].id='invented'}
  return Response.json({choices:[{message:{content:JSON.stringify(d)}}]});});
 const r=await (await call()).json();assert.equal(r.status,'generated');assert.equal(r.corrected,true);
});
test('absence, auth, PHI, body tampering and cross-origin requests never invoke model',async t=>{
 const {call,env,calls}=fixture(t);assert.equal((await call(input,{token:'invalid-token'})).status,401);
 for(const b of [{...input,question:'My name is John Smith and my diagnosis is leukemia'},{...input,history:['patient@example.com']}])assert.equal((await call(b)).status,422);
 assert.equal((await call({...input,evidence:[{text:'fake'}]})).status,400);
 assert.equal((await call(input,{headers:{Origin:'https://attacker.test'}})).status,403);
 delete env.MODEL_GENERAL_KEY;assert.equal((await call()).status,503);assert.equal(modelStatus(env).general.configured,false);assert.equal(calls.length,0);
 assert.doesNotMatch(JSON.stringify(modelStatus(env)),/secret|medgemma.example/);
});
test('real SQL enforces six requests per account per minute',async t=>{
 const {call,DB}=fixture(t);for(let i=0;i<6;i++)assert.equal((await call()).status,200);assert.equal((await call()).status,429);
 const row=await DB.prepare('SELECT * FROM hb_model_limits').bind().first();assert.deepEqual(Object.keys(row).sort(),['bucket','requests','user_id']);assert.equal(row.requests,6);
});
test('buddy sends its own question, search context and active deck; returns no repeated deck array',async t=>{
 const {call,calls}=fixture(t);const r=await (await call({...input,mode:'chat',question:'Explain that further',searchQuery:'What is leukemia?',deck:4,history:['How is it treated?']})).json();
 assert.equal(r.status,'generated');assert.deepEqual(r.decks,[]);assert.equal(r.answer.deck,4);const p=JSON.parse(calls[0].body.messages[1].content);assert.equal(p.browserQuestion,'What is leukemia?');assert.equal(p.priorQuestions[0],'How is it treated?');
});
test('browser gracefully labels unconfigured models and cancels superseded authentication',async()=>{
 let tokens=0;const context={...input,query:input.question};
 const r=await requestSynthesis(context,input.question,{fetcher:async()=>Response.json({general:{configured:false}}),tokenProvider:async()=>{tokens++;return 'token'}});
 assert.equal(tokens,0);assert.match(r.message,/not a model-generated/);
 const controller=new AbortController();const pending=requestSynthesis(context,input.question,{signal:controller.signal,fetcher:async()=>Response.json({general:{configured:true}}),tokenProvider:()=>new Promise(()=>{})});controller.abort();await assert.rejects(pending);
 assert.notEqual(synthesisKey(context),synthesisKey({...context,role:'Patient'}));assert.notEqual(synthesisKey(context),synthesisKey({...context,query:'How is it treated?'}));
});
test('an unresponsive AI capability check falls back after five seconds',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const pending=requestSynthesis({...input,query:input.question},input.question,{fetcher:()=>new Promise(()=>{})});
 t.mock.timers.tick(5001);
 const result=await pending;assert.equal(result.status,'unavailable');assert.match(result.message,/Source excerpts/);
});
