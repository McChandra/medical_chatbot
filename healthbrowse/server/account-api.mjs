// No service key, authorization header, contact body or feedback body is logged.
const modes=['General reader','Patient','Medical student','Medical professional','Advanced professional'];
const themes=['system','light','dark'];
const sections=['Education and definitions','Identification','Research and evidence','Data and AI resources','Prediction and genetics','Physiology, symptoms and treatments','Care facilities'];
const uuid=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const email=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const privateText=/\b(?:my name is|my (?:symptoms|diagnosis|medication|address)|patient (?:id|name)|my patient|date of birth|medical record (?:number|id)|MRN|SSN)\b|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|(?:\d[\s()+.-]*){10,}/i;
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
class ClientError extends Error {constructor(status,message){super(message);this.status=status}}
const reject=(status,message)=>{throw new ClientError(status,message)};
function bounded(value,max,label){if(typeof value!=='string'||!value.trim()||value.trim().length>max)reject(400,'Invalid '+label+'.');return value.trim()}
function oneOf(value,allowed,label){if(!allowed.includes(value))reject(400,'Invalid '+label+'.');return value}
function config(env){
  let url;try{url=new URL(env.SUPABASE_URL)}catch{reject(503,'Accounts are not configured.')}
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/' ||
     (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))))reject(503,'Invalid account service configuration.');
  if(!env.SUPABASE_ANON_KEY)reject(503,'Accounts are not configured.');
  return url.origin;
}
async function jsonBody(request){
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))reject(415,'Use application/json.');
  if(Number(request.headers.get('Content-Length'))>8192)reject(413,'Request too large.');
  const reader=request.body?.getReader();if(!reader)reject(400,'Missing request body.');
  const decoder=new TextDecoder();let total=0,text='';
  try{while(true){
    const part=await reader.read();if(part.done)break;
    total+=part.value.byteLength;if(total>8192){await reader.cancel();reject(413,'Request too large.')}
    text+=decoder.decode(part.value,{stream:true});
  }}finally{reader.releaseLock()}
  text+=decoder.decode();
  let value;try{value=JSON.parse(text)}catch{reject(400,'Invalid JSON.')}
  if(!value||typeof value!=='object'||Array.isArray(value))reject(400,'Invalid request object.');
  return value;
}
function only(value,keys){if(Object.keys(value).some(k=>!keys.includes(k)))reject(400,'Unexpected request field.')}
function credentials(key,token){return {apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
function freshFetch(url,options){return fetch(url,{...options,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)})}
async function database(base,headers,path,method='GET',body,prefer){
  const res=await freshFetch(base+'/rest/v1/'+path,{method,headers:{...headers,...(prefer?{Prefer:prefer}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!res.ok){
    const error=await res.json().catch(()=>({}));
    if(error.message==='rate_limited')reject(429,'Please wait before submitting another message.');
    if(['23503','23514','22001','22P02'].includes(error.code))reject(400,'Check the topic and submitted fields.');
    if(res.status===401)reject(401,'Sign in again.');if(res.status===403)reject(403,'Access denied.');
    reject(503,'Account storage is temporarily unavailable.');
  }
  const text=await res.text();return text?JSON.parse(text):null;
}
function settings(row){return {saveHistory:row?.save_history??false,readingMode:row?.reading_mode??modes[0],theme:row?.theme??'system'}}
function historyItem(row){
  const name=sections[row.section-1],q=row.kind==='chat'?'Explore '+name+' for '+row.topic:'Research '+row.topic+' · '+name;
  return {...row,questionLabel:q,href:'/?'+new URLSearchParams({topic:row.topic,section:String(row.section)})};
}
export function triageFeedback(message){
  const text=message.toLowerCase();
  const type=/\b(wrong|incorrect|inaccurate|outdated|citation|misleading|misinformation)\b/.test(text)?'source-correction'
    :/\b(crash(?:es|ed)?|broken|bug|error|fails?|failing)\b/.test(text)?'bug'
    :/\b(feature|request|add|suggestion|wish)\b/.test(text)?'feature'
    :/\b(confusing|navigate|layout|usability|accessible|accessibility)\b/.test(text)?'usability':'general';
  const positive=/\b(love|great|helpful|excellent|thanks|easy|useful)\b/.test(text);
  const negative=/\b(hate|bad|broken|frustrat\w*|unhelpful|wrong|confusing|poor|fails?|error)\b/.test(text)||/\bnot (?:helpful|useful|good)\b/.test(text);
  return {type,sentiment:positive&&negative?'mixed':positive?'positive':negative?'negative':'neutral',reviewStatus:'pending'};
}
function publicUrl(value){
  if(value==null||value==='')return '';
  let url;try{url=new URL(value)}catch{reject(400,'Use a public HTTPS source URL.')}
  if(url.protocol!=='https:'||url.username||url.password||url.href.length>2048||!url.hostname.includes('.')||/^(?:[\d.]+|\[)/.test(url.hostname)||/\.(?:local|localhost|internal)$/.test(url.hostname))reject(400,'Use a public HTTPS source URL.');
  return url.href;
}
async function digest(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('')}
async function contact(env,base,headers,user,body){
  only(body,['name','email','message','requestId']);
  const name=bounded(body.name,100,'name'),address=bounded(body.email,254,'email'),message=bounded(body.message,2000,'message');
  if(!email.test(address)||/\r|\n/.test(name)||!uuid.test(body.requestId))reject(400,'Check contact details and request ID.');
  if(privateText.test(message))reject(400,'Remove personal medical details and identifiers from your message.');
  if(!env.RESEND_API_KEY||!env.SUPABASE_SERVICE_ROLE_KEY||!email.test(env.CONTACT_FROM||'')||!email.test(env.CONTACT_TO||''))reject(503,'Corporate mail delivery is not configured.');
  const requestId=body.requestId;
  const payload={from:env.CONTACT_FROM,to:[env.CONTACT_TO],reply_to:address,subject:'HealthBrowse contact request',
    text:'Name: '+name+'\nReply email: '+address+'\n\n'+message};
  const hash=await digest(JSON.stringify(payload));
  const state=await database(base,headers,'rpc/hb_reserve_contact','POST',{p_request:requestId,p_digest:hash});
  if(state==='sent')return reply({status:'sent',requestId});
  if(state==='conflict'||state==='expired')reject(409,state==='conflict'?'This ID was used for another message.':'The retry window expired. Delivery cannot be confirmed.');
  if(state==='limited')reject(429,'Contact limit reached. Please try later.');
  if(state!=='pending')reject(503,'Mail reservation could not be confirmed.');
  const delivery=await freshFetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,
    'Content-Type':'application/json','Idempotency-Key':'hb-contact/'+user+'/'+requestId},body:JSON.stringify(payload)});
  if(!delivery.ok)reject(503,'Mail delivery is unconfirmed. Retry with the same request ID.');
  const provider=(await delivery.json()).id;
  if(typeof provider!=='string'||!provider)reject(503,'Mail delivery is unconfirmed. Retry with the same request ID.');
  const service={apikey:env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
  if(!env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_'))service.Authorization='Bearer '+env.SUPABASE_SERVICE_ROLE_KEY;
  const complete=await database(base,service,'rpc/hb_complete_contact','POST',{p_user:user,p_request:requestId,p_digest:hash,p_provider:provider});
  if(complete!==true)reject(503,'Delivery receipt pending. Retry with the same request ID.');
  return reply({status:'sent',requestId}); // Provider accepted the message. Inbox receipt is not implied.
}
export async function accountAPI(request,env){
  try{
    const {pathname:path}=new URL(request.url),method=request.method;
    const token=request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if(!token)reject(401,'Sign in to access your account.');
    const base=config(env),headers=credentials(env.SUPABASE_ANON_KEY,token);
    const auth=await freshFetch(base+'/auth/v1/user',{headers});
    if(!auth.ok)reject(auth.status===401||auth.status===403?401:503,'The account session could not be verified.');
    const user=(await auth.json()).id;if(!uuid.test(user||''))reject(401,'Invalid account session.');
    const db=(...args)=>database(base,headers,...args);
    const owner='user_id=eq.'+user;
    if(path==='/api/me/settings'){
      if(method==='GET')return reply({settings:settings((await db('hb_settings?'+owner+'&select=save_history,reading_mode,theme'))[0])});
      if(method==='PATCH'){const b=await jsonBody(request);only(b,['saveHistory','readingMode','theme']);
        if(b.saveHistory!==undefined&&typeof b.saveHistory!=='boolean')reject(400,'Invalid history setting.');
        if(b.readingMode!==undefined)oneOf(b.readingMode,modes,'reading mode');if(b.theme!==undefined)oneOf(b.theme,themes,'theme');
        const rows=await db('rpc/hb_update_settings','POST',{p_history:b.saveHistory??null,p_mode:b.readingMode??null,p_theme:b.theme??null});
        return reply({settings:settings(rows[0])});}
    }else if(path==='/api/me/saved'){
      if(method==='GET')return reply({items:await db('hb_saved?'+owner+'&select=id,topic,kind,title,url,created_at&order=created_at.desc&limit=200')});
      if(method==='POST'){
        const b=await jsonBody(request);only(b,['topic','title','url','kind']);
        const topic=bounded(b.topic,160,'topic'),url=publicUrl(b.url),title=bounded(b.title||topic,300,'title');
        if(privateText.test(title))reject(400,'Save only public-source titles.');
        const kind=oneOf(b.kind,['bookmark','favourite'],'saved kind');
        await db('hb_saved?on_conflict=user_id,topic,kind,url','POST',{topic,title,url,kind},'resolution=ignore-duplicates,return=minimal');
        const filter=new URLSearchParams({select:'id,topic,kind,title,url,created_at',topic:'eq.'+topic,url:'eq.'+url,kind:'eq.'+kind,user_id:'eq.'+user});
        const item=(await db('hb_saved?'+filter))[0];if(!item)reject(409,'The saved record changed. Refresh and retry.');
        return reply({item},201);
      }
    }else if(path.startsWith('/api/me/saved/')){
      const id=path.slice('/api/me/saved/'.length);if(!uuid.test(id))reject(400,'Invalid saved record.');
      if(method==='DELETE'){await db('hb_saved?id=eq.'+id+'&'+owner,'DELETE');return reply({removed:true});}
    }else if(path==='/api/me/history'){
      if(method==='GET'){
        const cutoff=new Date(Date.now()-30*86400000).toISOString();
        const rows=await db('hb_history?'+owner+'&created_at=gte.'+encodeURIComponent(cutoff)+'&select=id,topic,kind,section,created_at&order=created_at.desc&limit=100');
        return reply({items:rows.map(historyItem)});
      }
      if(method==='POST'){
        const b=await jsonBody(request);only(b,['topic','kind','section']);const kind=oneOf(b.kind,['chat','search'],'event kind');
        const section=b.section??(kind==='search'?1:null);
        if(!Number.isInteger(section)||section<1||section>7)reject(400,'Choose section 1 through 7.');
        return reply({saved:await db('rpc/hb_record_history','POST',{p_topic:bounded(b.topic,160,'topic'),p_kind:kind,p_section:section})});
      }
      if(method==='DELETE'){await db('hb_history?'+owner,'DELETE');return reply({cleared:true});}
    }else if(path==='/api/feedback' && method==='POST'){
      const b=await jsonBody(request);only(b,['message']);const message=bounded(b.message,3000,'feedback');
      if(privateText.test(message))reject(400,'Remove identifiers and personal medical details.');
      const feedback=triageFeedback(message);
      const id=await db('rpc/hb_submit_feedback','POST',{p_message:message,p_type:feedback.type,p_sentiment:feedback.sentiment});
      return reply({feedback:{id,...feedback}},201);
    }else if(path==='/api/contact' && method==='POST'){
      return await contact(env,base,headers,user,await jsonBody(request));
    }else if(!['/api/contact','/api/feedback'].includes(path))return reply({error:'Account resource unavailable.'},404);
    return reply({error:'Method not supported.'},405);
  }catch(error){
    if(error instanceof ClientError)return reply({error:error.message},error.status);
    return reply({error:'Account service unavailable. If retrying contact delivery, reuse the same request ID.'},503);
  }
}
