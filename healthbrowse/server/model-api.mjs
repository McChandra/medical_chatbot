import {isReadingRole,normalizeReadingRole} from '../dist/reading-profiles.js';
import {inspectInput} from '../dist/clinical-engine.js';
import {evidenceFor,generationMessages,validateDraft,reviewMessages,reviewPasses,presentDraft} from './model-evidence.mjs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
class Failure extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
const fail=(status,code,message)=>{throw new Failure(status,code,message)};
function endpoint(env,route){
 const prefix=route==='professional'?'MODEL_PROFESSIONAL_':'MODEL_GENERAL_';
 const url=env[prefix+'URL'],key=env[prefix+'KEY'],model=env[prefix+'ID'];
 if(!url||!key||!model)return null;
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!u.hostname.includes('.')||/^(?:[\d.]+|\[)/.test(u.hostname)||/\.(?:local|internal|localhost)$/.test(u.hostname))return null}catch{return null}
 return {url,key,model};
}
export function modelStatus(env){return {general:{configured:!!endpoint(env,'general')},professional:{configured:!!endpoint(env,'professional')},validation:'Automated support review; independent clinical validation pending'};}
async function boundedJSON(stream,max){
 const reader=stream?.getReader();if(!reader)throw Error('Missing body');const decoder=new TextDecoder();let n=0,text='';
 try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>max){await reader.cancel();throw Error('Body too large')}text+=decoder.decode(value,{stream:true})}}finally{reader.releaseLock()}
 return JSON.parse(text+decoder.decode());
}
async function identity(request,env){
 const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]{10,8192})$/i)?.[1];
 if(!token)fail(401,'sign_in','Sign in to use AI synthesis.');
 let base;try{base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error()}catch{fail(503,'auth_unavailable','The sign-in service is not configured.')}
 const res=await fetch(base.origin+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!res.ok)fail(res.status===401||res.status===403?401:503,'auth_unavailable','Sign-in could not be verified.');
 const user=await res.json();if(!/^[a-f\d-]{36}$/i.test(user.id||''))fail(401,'sign_in','Invalid sign-in session.');return user.id;
}
async function reserve(env,user){
 if(!env.DB)fail(503,'quota_unavailable','AI request limits are not configured.');
 const bucket=Math.floor(Date.now()/60000);
 // Store only one rolling counter per user, never the medical question.
 const result=await env.DB.prepare(`INSERT INTO hb_model_limits (user_id, bucket, requests) VALUES (?, ?, 1)
 ON CONFLICT(user_id) DO UPDATE SET bucket=excluded.bucket, requests=CASE WHEN hb_model_limits.bucket=excluded.bucket THEN hb_model_limits.requests+1 ELSE 1 END
 WHERE hb_model_limits.bucket<>excluded.bucket OR hb_model_limits.requests<6`).bind(user,bucket).run();
 if(!result.meta?.changes)fail(429,'rate_limited','Please wait a minute before another AI request.');
}
async function complete(config,messages,signal,maxTokens=6000){
 const res=await fetch(config.url,{method:'POST',headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},redirect:'error',signal,
  body:JSON.stringify({model:config.model,messages,temperature:0,max_tokens:maxTokens,stream:false,response_format:{type:'json_object'}})});
 if(!res.ok)throw Error('Inference service unavailable');
 const data=await boundedJSON(res.body,120000),content=data.choices?.[0]?.message?.content;
 if(data.choices?.[0]?.finish_reason==='length'||typeof content!=='string')throw Error('Incomplete model response');
 return JSON.parse(content.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
}
export async function modelAPI(request,env,assets){
 const url=new URL(request.url);
 if(url.pathname==='/api/ai/status'&&request.method==='GET')return reply(modelStatus(env));
 if(url.pathname!=='/api/ai/answer')return reply({error:'Unknown AI route.'},404);
 if(request.method!=='POST')return reply({error:'Use POST.'},405);
 try{
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)fail(403,'origin','Cross-origin requests are not supported.');
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'body','Use JSON.');
  let b;try{b=await boundedJSON(request.body,12000)}catch{fail(400,'body','Invalid or oversized question.')}
  if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['topic','question','role','mode','deck','history','searchQuery'].includes(k)))fail(400,'body','Unexpected input.');
  if(typeof b.topic!=='string'||b.topic.length>160||typeof b.question!=='string'||!b.question.trim()||b.question.length>1600||!isReadingRole(b.role)||!['search','chat'].includes(b.mode)||!Number.isInteger(b.deck)||b.deck<0||b.deck>6)fail(400,'body','Check the topic, question and reading mode.');
  if(b.history!==undefined&&(!Array.isArray(b.history)||b.history.length>4||b.history.some(q=>typeof q!=='string'||q.length>1600)))fail(400,'body','Invalid follow-up context.');
  if(b.searchQuery!==undefined&&(typeof b.searchQuery!=='string'||b.searchQuery.length>1600))fail(400,'body','Invalid browser context.');
  for(const text of [b.question,b.topic,b.searchQuery||'',...(b.history||[])]){const status=inspectInput(text);if(status!=='ok')fail(422,status,status==='emergency'?'If this danger is happening now, contact local emergency services. Do not wait for an AI response.':'Remove personal identifiers and ask a general educational question.')}
  b.role=normalizeReadingRole(b.role);
  const route=b.role==='Medical professional'?'professional':'general',config=endpoint(env,route);
  if(!config)fail(503,'model_not_configured','AI synthesis is not connected yet. Showing source excerpts instead.');
  const user=await identity(request,env),evidence=evidenceFor(assets,b.topic,b.role,b.question);
  if(!evidence?.sources.length)fail(422,'no_evidence','No indexed sources support this topic.');
  await reserve(env,user);
  // The deadline includes both generation, review and one possible repair.
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(120000)]);
  let reason='';
  for(let attempt=0;attempt<2;attempt++){
   try{
    const raw=await complete(config,generationMessages(b,evidence,reason),signal);
    const draft=validateDraft(raw,b,evidence),review=await complete(config,reviewMessages(draft,evidence,b),signal,2500);
    if(!reviewPasses(review,draft)){reason='The direct answer was incomplete or a claim was unsupported. '+JSON.stringify(review).slice(0,1200);continue}
    return reply(presentDraft(draft,evidence,b,config.model,attempt>0));
   }catch(error){if(signal.aborted)throw error;reason='The draft failed validation: '+error.message}
  }
  fail(502,'verification_failed','The generated answer did not pass source checks. Showing source excerpts instead.');
 }catch(error){return reply({status:'unavailable',code:error.code||'model_unavailable',error:error instanceof Failure?error.message:'AI synthesis is temporarily unavailable. Showing source excerpts instead.'},error.status||503)}
}
