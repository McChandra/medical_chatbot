// Manual provider smoke test: public example questions only, never user records.
// Usage: GROQ_API_KEY from your secret manager, or hidden interactive input.
// Authentication is a local fixture; generation and citation handling are real.
import {readFileSync,writeFileSync} from 'node:fs';
import {modelAPI} from '../server/model-api.mjs';
import {openWorkspace} from '../server/sqlite-workspace.mjs';
async function hiddenKey(){
 if(process.env.GROQ_API_KEY)return process.env.GROQ_API_KEY;
 if(!process.stdin.isTTY)throw Error('Provide GROQ_API_KEY through a secret manager.');
 process.stdin.setRawMode(true);process.stdout.write('Groq key (hidden): ');
 return new Promise(resolve=>{let key='';const onData=data=>{for(const c of data.toString()){
  if(c==='\u0003')process.exit(130);
  if(c==='\r'||c==='\n'){process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(key);return;}
  key+=c;
 }};process.stdin.on('data',onData);});
}
const key=await hiddenKey(),topic=process.argv[2]||'Leukemia',role=process.argv[3]||'General',mode=process.argv[4]||'search';
const question=process.argv[5]||(mode==='chat'?'Explain the treatment options in more detail.':'What is '+topic+'?');
const assets=Object.fromEntries(['medline-topics','clinical-passages','grounded-sources'].map(n=>['/'+n+'.json',{text:readFileSync(new URL('../dist/'+n+'.json',import.meta.url),'utf8')}]));
const DB=openWorkspace(':memory:');
for(const e of JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url))).entries)DB.exec(readFileSync(new URL('../drizzle/'+e.tag+'.sql',import.meta.url),'utf8'));
const realFetch=globalThis.fetch;let usage=null,providerStatus=null;const drafts=[];
globalThis.fetch=async(url,options)=>{
 if(url==='https://auth.example/auth/v1/user')return Response.json({id:'11111111-1111-4111-8111-111111111111'});
 const r=await realFetch(url,options),copy=await r.clone().json();usage=copy.usage;providerStatus=r.status;
 if(copy.choices?.[0]?.message?.content)drafts.push(copy.choices[0].message.content);
 if(!r.ok)console.error(JSON.stringify({providerStatus,errorType:copy.error?.type,errorCode:copy.error?.code,message:copy.error?.message?.slice(0,300)}));
 return r;
};
const request=new Request('https://site.test/api/ai/answer',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-session-12345'},body:JSON.stringify({topic,role,mode,question,deck:mode==='chat'?4:0,searchQuery:'What is '+topic+'?'})});
const start=Date.now();
const response=await modelAPI(request,{DB,SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public',MODEL_PROVIDER:'groq',GROQ_API_KEY:key},assets);
const result=await response.json();DB.close();
const report={topic,role,mode,question,status:response.status,providerStatus,elapsedMs:Date.now()-start,usage,result};
if(process.argv[6])writeFileSync(process.argv[6],JSON.stringify({...report,drafts},null,2));
console.log(JSON.stringify({...report,result:{status:result.status,error:result.error,answer:result.answer?.text,decks:result.decks?.map(d=>({id:d.id,generated:!!d.generation,text:d.text})),validation:result.validation}},null,2));
process.exitCode=response.ok?0:1;
