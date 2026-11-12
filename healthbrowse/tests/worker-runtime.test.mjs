// Exercise Cloudflare's real workerd runtime, not Node's more permissive fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,Response as WorkerResponse} from 'miniflare';
const assets=Object.fromEntries(['medline-topics','clinical-passages','grounded-sources'].map(n=>['/'+n+'.json',{text:readFileSync(new URL('../dist/'+n+'.json',import.meta.url),'utf8')}]));
const response=data=>WorkerResponse.json(data);
const input={topic:'Sore Throat',question:'I have a sore throat anf fever. What it could possibly be?',role:'General',mode:'search',deck:0};

test('Workers runtime supports authenticated accounts, both six-deck modes and Buddy without following redirects',async t=>{
 const built=await build({stdin:{contents:`import {respond} from './worker/routes.mjs';const assets=${JSON.stringify(assets)};export default {fetch(r,e){return respond(r,e,assets)}}`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false});
 let authMode='ok',providerMode='ok';const calls=[];
 const mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2024-11-01',cf:false,d1Databases:['DB'],
  bindings:{SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public-fixture',MODEL_PROVIDER:'groq',GROQ_API_KEY:'fixture-only'},
  outboundService:async request=>{
   const url=new URL(request.url);calls.push(url.origin);
   if(url.origin==='https://auth.example'){
    if(authMode==='redirect')return new WorkerResponse(null,{status:302,headers:{Location:'https://untrusted.example/steal'}});
    if(authMode==='invalid')return new WorkerResponse('{}',{status:401});
    return response({id:'11111111-1111-4111-8111-111111111111'});
   }
   assert.equal(url.origin,'https://api.groq.com','Credentials must never follow a redirect');
   if(providerMode==='redirect')return new WorkerResponse(null,{status:307,headers:{Location:'https://untrusted.example/steal'}});
   const payload=JSON.parse((await request.json()).messages[1].content);
   let raw;
   if(payload.claims)raw={checks:payload.claims.map(c=>({id:c.id,verdict:'supported',sources:c.sources}))};
   else {
    const claim=s=>({text:s.text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()||s.text+'.',sources:[s.id]});
    raw={answer:[claim(payload.evidence.find(s=>s.deck===1))],...(payload.mode==='search'?{decks:Object.fromEntries(Array.from({length:6},(_,i)=>{const s=payload.evidence.find(s=>s.deck===i+1);return [i+1,s?[claim(s)]:[]]}))}:{})};
   }
   return response({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]});
  }});
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 for(const entry of JSON.parse(readFileSync('drizzle/meta/_journal.json')).entries){
  for(const sql of readFileSync('drizzle/'+entry.tag+'.sql','utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 }
 const call=b=>mf.dispatchFetch('https://site.test/api/ai/answer',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-session-12345'},body:JSON.stringify(b)});
 for(const role of ['General','Clinicians']){
  const res=await call({...input,role}),data=await res.json();assert.equal(res.status,200,JSON.stringify(data));assert.equal(data.status,'generated');assert.ok(data.answer.generation);assert.equal(data.decks.length,6);
 }
 const chat=await call({...input,mode:'chat',deck:3,question:'How is strep throat tested?'});assert.equal(chat.status,200);assert.deepEqual((await chat.json()).decks,[]);
 const settings=await mf.dispatchFetch('https://site.test/api/me/settings',{headers:{Authorization:'Bearer fixture-session-12345'}});assert.equal(settings.status,200);assert.ok((await settings.json()).settings);
 authMode='invalid';assert.equal((await call(input)).status,401);
 authMode='redirect';assert.equal((await call(input)).status,503);
 authMode='ok';providerMode='redirect';assert.equal((await call(input)).status,503);
 assert.ok(calls.includes('https://api.groq.com'));assert.ok(calls.every(u=>!u.includes('untrusted')));
});
