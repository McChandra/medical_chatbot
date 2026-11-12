// Runs the actual model gateway against a loopback-only private GPU service.
// Identity/quota are fixed test fixtures; this is not a live Supabase/UI test.
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {modelAPI} from '../server/model-api.mjs';
import {groundedReviewPasses} from '../server/model-grounded.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [outputArg,baseArg]=process.argv.slice(2);
if(!outputArg||!baseArg)throw Error('Usage: node scripts/run-grounded-evaluation.mjs OUTPUT LOOPBACK_BASE');
const base=new URL(baseArg);
if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.pathname!=='/'||base.username||base.password||base.search||base.hash)throw Error('Use a loopback-only service URL');
const key=process.env.INFERENCE_API_KEY;if(!key||key.length<32)throw Error('Missing private evaluation key');
const out=resolve(outputArg),dir=resolve(out,'cases');mkdirSync(dir,{recursive:true});
const file=resolve(root,'inference/evaluation-v2/cases.json'),raw=readFileSync(file,'utf8'),fixtures=JSON.parse(raw);
const fixtureManifest=JSON.parse(readFileSync(resolve(root,'inference/evaluation-v2/manifest.json')));
const hash=value=>createHash('sha256').update(value).digest('hex');
if(hash(raw)!==fixtureManifest.sha256)throw Error('Fixture hash mismatch');
for(const [path,expected] of Object.entries(fixtureManifest.sourceHashes))if(hash(readFileSync(resolve(root,path)))!==expected)throw Error('Source changed: '+path);
const runtime=JSON.parse(readFileSync(resolve(out,'runtime.json')));
const manifest={version:2,fixture_sha256:hash(raw),runtime,script_sha256:hash(readFileSync(fileURLToPath(import.meta.url))),routes:['base','adapter'],reviewer:'healthbrowse-general-base-review',clinical_release_approved:false,identity:'synthetic fixed identity; quota stub; no live auth test'};
const manifestPath=resolve(out,'evaluation-manifest.json');
if(existsSync(manifestPath)&&JSON.stringify(JSON.parse(readFileSync(manifestPath)))!==JSON.stringify(manifest))throw Error('Evaluation code/environment changed; use a new output directory');
writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
const assets=Object.fromEntries(['medline-topics','clinical-passages','grounded-sources'].map(n=>['/'+n+'.json',{text:readFileSync(resolve(root,'dist',n+'.json'),'utf8')}]));
const nativeFetch=globalThis.fetch,results=[];let trace=[];
const redact=s=>String(s).replaceAll(key,'[REDACTED]');
async function idle(){
 for(let n=0;n<180;n++){
  const r=await nativeFetch(new URL('healthz',base),{signal:AbortSignal.timeout(5000)});
  if(r.ok&&!(await r.json()).busy)return;
  if(n&&n%30===0)console.log('Waiting for cancelled GPU work to finish…');
  await new Promise(r=>setTimeout(r,1000));
 }
 throw Error('GPU did not become idle after a cancelled request; preserve results and inspect the service log');
}
function save(row){
 const name=row.kind+'-'+row.id+'-'+row.route+'.json';const path=resolve(dir,name),temp=path+'.tmp';
 writeFileSync(temp,JSON.stringify(row,null,2));renameSync(temp,path);results.push(row);reports();
}
function existing(kind,id,route){
 const path=resolve(dir,kind+'-'+id+'-'+route+'.json');
 if(!existsSync(path))return false;const row=JSON.parse(readFileSync(path));
 if(row.id!==id||row.route!==route||row.kind!==kind)throw Error('Saved result identity mismatch');results.push(row);return true;
}
function reports(){
 const groups=['base','adapter'].map(route=>{
  const rows=results.filter(r=>r.kind==='pipeline'&&r.route===route);
  return {route,cases:rows.length,gateway_accepted:rows.filter(r=>r.gateway_accepted).length,
   source_fallbacks:rows.filter(r=>!r.gateway_accepted).length,
   declared_question_gaps:rows.reduce((n,r)=>n+(r.response?.gaps?.length||0),0),
   elapsed_seconds:rows.map(r=>({id:r.id,seconds:r.seconds})),
   all_six_decks_populated:rows.filter(r=>r.response?.decks?.length===6&&r.response.decks.every(d=>d.supported)).length};
 });
 const controls=results.filter(r=>r.kind==='control');
 const summary={version:2,completed:results.length,expected:fixtures.cases.length*2+fixtures.controls.length,groups,
  controls:{completed:controls.length,expected:fixtures.controls.length,false_acceptances:controls.filter(r=>!r.request_error&&r.expectedSupported===false&&r.accepted).length,false_rejections:controls.filter(r=>!r.request_error&&r.expectedSupported===true&&!r.accepted).length,request_failures:controls.filter(r=>r.request_error).length},
  clinical_release_approved:false,limitations:['Gateway acceptance means automated checks passed, not medical accuracy.','Identity/quota are test fixtures; no live Supabase, UI, load or clinical validation.','Cases were selected after observing v1 failures; this is a development regression suite.']};
 writeFileSync(resolve(out,'results.jsonl'),results.map(r=>JSON.stringify(r)).join('\n')+'\n');
 writeFileSync(resolve(out,'summary.json'),JSON.stringify(summary,null,2));
}
globalThis.fetch=async(url,opts)=>{
 if(url==='https://auth.example/auth/v1/user')return Response.json({id:'11111111-1111-4111-8111-111111111111'});
 if(url!=='https://evaluation.example/v1/chat/completions')throw Error('Unexpected evaluation network request');
 const body=JSON.parse(opts.body),start=performance.now();
 try{
  const r=await nativeFetch(new URL('v1/chat/completions',base),{...opts,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'}});
  const text=redact(await r.text());trace.push({model:body.model,request:body,response_text:text,http_status:r.status,seconds:(performance.now()-start)/1000});
  return new Response(text,{status:r.status,headers:{'Content-Type':'application/json'}});
 }catch(e){trace.push({model:body.model,error:redact(e.message),seconds:(performance.now()-start)/1000});throw e;}
};
try{
 for(const c of fixtures.cases)for(const route of ['base','adapter']){
  if(existing('pipeline',c.id,route))continue;await idle();trace=[];const start=performance.now();
  const env={SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'synthetic',MODEL_GENERAL_URL:'https://evaluation.example/v1/chat/completions',MODEL_GENERAL_KEY:key,MODEL_GENERAL_ID:route==='adapter'?'healthbrowse-general-qlora':'healthbrowse-general-base-review',MODEL_GENERAL_REVIEW_ID:'healthbrowse-general-base-review',MODEL_GENERAL_PROTOCOL:'grounded-v2',MODEL_GENERAL_CONTEXT_TOKENS:'8192',DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:1}})}}}}}};
  const request=new Request('https://site.example/api/ai/answer',{method:'POST',headers:{Authorization:'Bearer synthetic-test-session','Content-Type':'application/json'},body:JSON.stringify(c.input)});
  const r=await modelAPI(request,env,assets),response=await r.json();
  const row={kind:'pipeline',id:c.id,route,question:c.input.question,seconds:Math.round((performance.now()-start))/1000,http_status:r.status,gateway_accepted:r.ok&&response.status==='generated',response,trace};save(row);
  console.log(JSON.stringify({id:c.id,route,gateway_accepted:row.gateway_accepted,seconds:row.seconds}));
 }
 for(const c of fixtures.controls){
  if(existing('control',c.id,'base'))continue;await idle();const start=performance.now();let response,accepted=false,request_error;
  try{
   const r=await nativeFetch(new URL('v1/chat/completions',base),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model:'healthbrowse-general-base-review',messages:c.request.messages,max_tokens:c.request.maxTokens,temperature:0,stream:false,response_format:{type:'json_schema',json_schema:{name:'healthbrowse_review',strict:true,schema:c.request.schema}}})});
   response=await r.json();if(!r.ok||response.choices?.[0]?.finish_reason==='length')throw Error('Reviewer request failed or truncated');
   response=JSON.parse(response.choices[0].message.content);accepted=groundedReviewPasses(response,c.draft,c.prepared);
  }catch(e){request_error=redact(e.message);}
  const row={kind:'control',id:c.id,route:'base',expectedSupported:c.expectedSupported,accepted,response,request_error,seconds:Math.round(performance.now()-start)/1000};save(row);
  console.log(JSON.stringify({id:c.id,accepted,expected:c.expectedSupported,request_error}));
 }
 reports();console.log('Saved full gateway results:',out);
}finally{globalThis.fetch=nativeFetch;}
