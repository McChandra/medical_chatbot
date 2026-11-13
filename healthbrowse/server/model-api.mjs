import {assessSafety,safetyAnswer,safetyPolicyVersion} from '../dist/safety-policy.js';
import {securityVariants,assessBuddySafety,buddySafetyAnswer,buddyHelpAnswer,buddyPolicyVersion} from '../dist/buddy-policy.js';
import {citedEvidence,prepareCited,presentCited,prepareCitedReview,applyCitedReview} from './model-cited.mjs';
import {isReadingRole,normalizeReadingRole} from '../dist/reading-profiles.js';
import {inspectQuery} from '../dist/clinical-engine.js';
import {evidenceFor,generationMessages,validateDraft,reviewMessages,reviewPasses,presentDraft} from './model-evidence.mjs';
import {modelEndpoint as endpoint,modelReviewEndpoint} from './model-provider.mjs';
import {compactGeneration,compactReviews,ContextLimit} from './model-context.mjs';
import {groundedEvidence,prepareGrounded,decodeGrounded,groundedReview,groundedReviewPasses,presentGrounded} from './model-grounded.mjs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(body,status=200)=>Response.json(body,{status,headers:{...headers,...(body.retryAfterSeconds!==undefined?{'Retry-After':String(body.retryAfterSeconds)}:{})}});
class Failure extends Error{constructor(status,code,message,retryAfterSeconds){super(message);this.status=status;this.code=code;this.retryAfterSeconds=retryAfterSeconds}}
const fail=(status,code,message,retryAfterSeconds)=>{throw new Failure(status,code,message,retryAfterSeconds)};
export function retryDelay(value,now=Date.now()){
 if(typeof value!=='string'||!value.trim())return undefined;
 const raw=value.trim();const seconds=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):(Date.parse(raw)-now)/1000;
 return Number.isFinite(seconds)&&seconds>=0&&seconds<=604800?Math.ceil(seconds):undefined;
}
export function modelStatus(env){return {general:{configured:!!endpoint(env,'general')},professional:{configured:!!endpoint(env,'professional')},validation:env.MODEL_PROVIDER==='groq'?'Server-resolved citations; AI interpretation is not independently clinically validated':'Automated support review; independent clinical validation pending'};}
async function boundedJSON(stream,max){
 const reader=stream?.getReader();if(!reader)throw Error('Missing body');const decoder=new TextDecoder();let n=0,text='';
 try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>max){await reader.cancel();throw Error('Body too large')}text+=decoder.decode(value,{stream:true})}}finally{reader.releaseLock()}
 return JSON.parse(text+decoder.decode());
}
async function identity(request,env){
 const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]{10,8192})$/i)?.[1];
 if(!token)fail(401,'sign_in','Sign in to use AI synthesis.');
 let base;try{base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error()}catch{fail(503,'auth_unavailable','The sign-in service is not configured.')}
 const res=await fetch(base.origin+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(8000)});
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
 if(!result.meta?.changes)fail(429,'rate_limited','Your request limit has been reached. The cited sources remain available.',Math.ceil((60000-Date.now()%60000)/1000));
}
async function complete(config,messages,signal,maxTokens=6000,schema){
 const payload=config.protocol==='groq-cited-v1'&&schema?{model:config.model,messages,temperature:0,max_completion_tokens:maxTokens,stream:false,reasoning_effort:'low',include_reasoning:false,response_format:{type:'json_schema',json_schema:{name:'healthbrowse_answer',strict:true,schema}}}:{model:config.model,messages,temperature:0,max_tokens:maxTokens,stream:false,response_format:schema?{type:'json_schema',json_schema:{name:'healthbrowse',strict:true,schema}}:{type:'json_object'}};
 const res=await fetch(config.url,{method:'POST',headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},redirect:'manual',signal,
  body:JSON.stringify(payload)});
 // Configuration/credit failures are not hallucinations; do not repeat billable requests.
 if(!res.ok){
  if(res.status===401||res.status===403)fail(503,'provider_access','The AI provider rejected access. The site owner must check the token and model access.');
  if(res.status===402)fail(503,'provider_credits','AI provider credits are unavailable. Showing source excerpts instead.');
  if(res.status===429)fail(503,'provider_busy','The AI service has reached a usage limit. '+(config.protocol==='groq-cited-v1'?'General and Clinicians modes share this provider quota. ':'')+'Cited source excerpts remain available.',retryDelay(res.headers.get('retry-after')));
  if(res.status===400||res.status===404||res.status===422)fail(503,'provider_configuration','The AI provider could not accept this model request. Showing source excerpts instead.');
  fail(503,'provider_unavailable','The AI provider is temporarily unavailable. Showing source excerpts instead.');
 }
 const data=await boundedJSON(res.body,120000),content=data.choices?.[0]?.message?.content;
 if(data.choices?.[0]?.finish_reason==='length'||typeof content!=='string')throw Error('Incomplete model response');
 return JSON.parse(content.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
}
export async function modelAPI(request,env,assets){
 const url=new URL(request.url);
 if(url.pathname==='/api/ai/status'&&request.method==='GET')return reply(modelStatus(env));
 if(url.pathname!=='/api/ai/answer')return reply({error:'Unknown AI route.'},404);
 if(request.method!=='POST')return reply({error:'Use POST.'},405);
 let phase='input';
 try{
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)fail(403,'origin','Cross-origin requests are not supported.');
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'body','Use JSON.');
  let b;try{b=await boundedJSON(request.body,12000)}catch{fail(400,'body','Invalid or oversized question.')}
  if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['topic','question','role','mode','deck','history','searchQuery','browserContext'].includes(k)))fail(400,'body','Unexpected input.');
  if(typeof b.topic!=='string'||b.topic.length>160||typeof b.question!=='string'||!b.question.trim()||b.question.length>1600||!isReadingRole(b.role)||!['search','chat'].includes(b.mode)||!Number.isInteger(b.deck)||b.deck<0||b.deck>6)fail(400,'body','Check the topic, question and reading mode.');
  if(b.history!==undefined&&(!Array.isArray(b.history)||b.history.length>4||b.history.some(q=>typeof q!=='string'||q.length>1600)))fail(400,'body','Invalid follow-up context.');
  if(b.searchQuery!==undefined&&(typeof b.searchQuery!=='string'||b.searchQuery.length>1600))fail(400,'body','Invalid browser context.');
  if(b.browserContext!==undefined&&(typeof b.browserContext!=='string'||b.browserContext.length>1200))fail(400,'body','Invalid browser summary.');
  const context=[b.topic,b.searchQuery||'',...(b.history||[])].join(' ');
  const screened=assessSafety(b.question,context);
  const inputs=[b.question,b.topic,b.searchQuery||'',b.browserContext||'',...(b.history||[])];
  const expanded=inputs.flatMap(securityVariants);
  const clinicalDecision=screened.action!=='allow'?screened:expanded.map(text=>assessSafety(text,context)).find(result=>result.action!=='allow');
  const buddyDecision=inputs.map(assessBuddySafety).find(result=>result.action!=='allow');
  const statuses=inputs.map(inspectQuery);
  // Log only policy outcomes, never query text, identity, tokens or medical details.
  const category=statuses.includes('emergency')?'emergency':statuses.includes('private')?'private':clinicalDecision?.category||buddyDecision?.category||(statuses.includes('unsafe')?'unsafe_context':'educational');
  console.info(JSON.stringify({event:'safety_screened',policyVersion:buddyDecision&&!clinicalDecision?buddyPolicyVersion:safetyPolicyVersion,action:category==='educational'?'allow':'redirect',category}));
  if(statuses.includes('emergency'))fail(422,'emergency','If this danger is happening now, contact local emergency services. Do not wait for an AI response.');
  if(statuses.includes('private'))fail(422,'private','Remove names, contact details, birth dates, record numbers, passwords or tokens. You can describe symptoms in your own words.');
  if(category!=='educational'){
   return reply({status:'blocked',code:'unsafe_request',answer:clinicalDecision?safetyAnswer(clinicalDecision.category):buddySafetyAnswer(buddyDecision?.category),decks:[]},422);
  }
  b.role=normalizeReadingRole(b.role);
  const help=b.mode==='chat'?buddyHelpAnswer(b.question):null;
  if(help){phase='authentication';await identity(request,env);return reply({status:'platform',answer:help,decks:[]})}
  const route=b.role==='Medical professional'?'professional':'general',config=endpoint(env,route);
  if(!config)fail(503,'model_not_configured','AI synthesis is not connected yet. Showing source excerpts instead.');
  const reviewer=modelReviewEndpoint(env,route);
  if(!reviewer)fail(503,'reviewer_not_configured','The support reviewer is not configured. Showing source excerpts instead.');
  phase='authentication';
  const user=await identity(request,env),grounded=config.protocol==='grounded-v2';
  phase='evidence';
  const evidence=config.protocol==='groq-cited-v1'?citedEvidence(assets,b):grounded?groundedEvidence(assets,b):evidenceFor(assets,b.topic,b.role,b.question);
  if(!evidence?.sources.length)fail(422,'no_evidence','No indexed sources support this topic.');
  phase='quota';
  await reserve(env,user);
  // The deadline includes both generation, review and one possible repair.
  const started=Date.now(),deadline=AbortSignal.timeout(120000);
  // Incoming Request.signal is absent on older Workers compatibility dates.
  const signal=request.signal?AbortSignal.any([request.signal,deadline]):deadline;
  if(config.protocol==='groq-cited-v1'){
   const prepared=prepareCited(b,evidence);
   phase='generation';
   const raw=await complete(config,prepared.messages,signal,prepared.maxTokens,prepared.schema);
   const check=prepareCitedReview(raw,prepared,b);
   phase='support_review';
   const review=check.claims.length?await complete(config,check.messages,signal,check.maxTokens,check.schema):{checks:[]};
   phase='presentation';
   return reply(presentCited(applyCitedReview(review,check,prepared,b),prepared,b,config.model));
  }
  let reason='';
  for(let attempt=0;attempt<2;attempt++){
   // Do not start another whole generation/review cycle when the first cycle
   // already consumed more than the remaining budget (plus a small margin).
   // This is a conservative estimate, not a latency guarantee.
   if(grounded&&attempt&&Date.now()-started+5000>=120000-(Date.now()-started))
    fail(503,'repair_budget_exhausted','The draft failed checks and there is insufficient time to recheck a replacement. Showing source excerpts instead.');
   try{
    if(grounded){
     const prepared=prepareGrounded(b,evidence,reason);
     const raw=await complete(config,prepared.messages,signal,prepared.maxTokens,prepared.schema);
     const draft=decodeGrounded(raw,b,prepared),check=groundedReview(draft,prepared,b);
     const review=await complete(reviewer,check.messages,signal,check.maxTokens,check.schema);
     if(!groundedReviewPasses(review,draft,prepared)){reason='Claim support or direct-answer facet coverage failed: '+JSON.stringify(review).slice(0,350);continue;}
     return reply(presentGrounded(draft,prepared,b,config.model,attempt>0));
    }
    const prepared=config.compact?compactGeneration(b,evidence,reason):{messages:generationMessages(b,evidence,reason),evidence,maxTokens:6000};
    phase='generation';
    const raw=await complete(config,prepared.messages,signal,prepared.maxTokens);
    const draft=validateDraft(raw,b,prepared.evidence);
    const batches=(config.compact||reviewer.compact)?compactReviews(draft,prepared.evidence,b):[{draft,messages:reviewMessages(draft,prepared.evidence,b),maxTokens:2500}];
    let passed=true;
    for(const batch of batches){
     phase='support_review';
     const review=await complete(reviewer,batch.messages,signal,batch.maxTokens);
     if(!reviewPasses(review,batch.draft)){passed=false;reason='The direct answer was incomplete or a claim was unsupported. '+JSON.stringify(review).slice(0,300);break}
    }
    if(!passed)continue;
    return reply(presentDraft(draft,prepared.evidence,b,config.model,attempt>0));
   }catch(error){
    if(error instanceof ContextLimit)fail(422,'context_limit','This question and its evidence exceed the model context. Try a shorter question or explore one deck with the buddy.');
    if(signal.aborted){
     if(request.signal?.aborted)fail(499,'request_cancelled','The request was cancelled.');
     fail(503,'model_timeout','AI generation and verification exceeded the response deadline. Showing source excerpts instead.');
    }
    if(error instanceof Failure)throw error;
    reason='The draft failed validation: '+error.message;
   }
  }
  fail(502,'verification_failed','The generated answer did not pass source checks. Showing source excerpts instead.');
 }catch(error){
  // Never log questions, tokens, provider bodies, identities or error messages.
  if(error.code==='provider_busy')console.warn(JSON.stringify({event:'ai_provider_limited',phase,...(error.retryAfterSeconds!==undefined?{retryAfterSeconds:error.retryAfterSeconds}:{})}));
  if(!(error instanceof Failure))console.error(JSON.stringify({event:'ai_request_failed',phase,kind:['TypeError','SyntaxError','TimeoutError','AbortError'].includes(error?.name)?error.name:'Error'}));
  return reply({status:'unavailable',code:error.code||'model_unavailable',error:error instanceof Failure?error.message:'AI synthesis is temporarily unavailable. Showing source excerpts instead.',...(error.retryAfterSeconds!==undefined?{retryAfterSeconds:error.retryAfterSeconds}:{})},error.status||503)}
}
