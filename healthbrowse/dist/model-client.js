import {getAccessToken} from './account-client.js';
function abortable(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(new DOMException('Aborted','AbortError'));if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))})}
export async function requestSynthesis(context,question,{mode='search',deck=0,history=[],signal,fetcher=fetch,tokenProvider=getAccessToken}={}){
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,135000);
 try{
  const route=['Medical professional','Advanced professional'].includes(context.role)?'professional':'general';
  const status=await fetcher('/api/ai/status',{signal:controller.signal,cache:'no-store'});
  if(!status.ok)throw Error('AI synthesis is temporarily unavailable.');
  if(!(await status.json())[route]?.configured)return {status:'unavailable',message:'AI synthesis is not connected yet. These are source excerpts, not a model-generated answer.'};
  const token=await abortable(Promise.resolve().then(tokenProvider),controller.signal);if(!token)return {status:'unavailable',message:'Sign in to use AI synthesis. Source excerpts are available below.'};
  if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
  const response=await fetcher('/api/ai/answer',{method:'POST',redirect:'error',signal:controller.signal,cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({topic:context.topic,question,searchQuery:context.query||context.topic,role:context.role,mode,deck,history:history.slice(-4).map(t=>typeof t==='string'?t:t.question)})});
  const data=await response.json();
  if(!response.ok)return {status:'unavailable',message:data.error||'AI synthesis could not finish. Source excerpts are shown below.'};
  if(data.status!=='generated'||!data.answer||!Array.isArray(data.decks))throw Error('Invalid AI response');
  return data;
 }catch(error){if(signal?.aborted)throw error;return {status:'unavailable',message:'AI synthesis could not finish. Source excerpts are shown below.'}}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
export const synthesisKey=c=>JSON.stringify([c?.topic,c?.role,c?.query]);
