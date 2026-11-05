import {accountRequest} from './account-client.js';
// getRandomValues also supports local HTTP development previews.
function newId(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')}
const $=id=>document.getElementById(id);
const node=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
const message=text=>{$('chatSaveStatus').textContent=text};
export function createChatHistory(getContext){
 let current=null,epoch=null,saving=true,queue=Promise.resolve(),generation=0,available=false;
 let onRestore=()=>{},onNew=()=>{};
 const setCurrent=value=>{current=value;$('chatTitle').textContent=value?.title||'New chat';if(value?.id){const url=new URL(location.href);url.searchParams.set('chat',value.id);history.replaceState(null,'',url.pathname+url.search)}};
 async function refresh(){
  const result=await accountRequest('/api/me/chats');available=true;epoch=result.settings.historyEpoch;saving=result.settings.saveChats;
  const root=$('chatHistoryItems');root.replaceChildren();
  for(const item of result.items){const row=node('div','');row.className='chat-row';
   const open=node('button',item.title);open.type='button';open.className='chat-open';open.onclick=()=>load(item.id);
   const date=node('small',new Date(item.updatedAt).toLocaleDateString());
   row.append(open,date);root.append(row);
  }
  if(!result.items.length)root.append(node('p','No saved chats yet. Ask a research question to begin.'));
  $('chatCount').textContent=String(result.items.length);return result;
 }
 function reset(){generation++;setCurrent(null);onNew();message(saving?'New chat. Research conversations are saved to your account.':'New chat. Saving is off in settings.');const url=new URL(location.href);url.searchParams.delete('chat');history.replaceState(null,'',url.pathname+url.search);}
 async function load(id){
  const run=++generation;message('Opening saved chat…');
  try{const data=await accountRequest('/api/me/chats/'+encodeURIComponent(id));if(run!==generation)return;
   await onRestore(data);if(run!==generation)return;setCurrent(data.chat);epoch=data.historyEpoch;
   message('Saved conversation loaded. Sources may have changed since these answers were saved.');$('chatHistoryPanel').open=false;
   const url=new URL(location.href);url.searchParams.set('chat',id);history.replaceState(null,'',url.pathname+url.search);
  }catch(error){if(run===generation)message(error.message)}
 }
 function saveTurn(turn){
  const context=getContext();if(!context)return;const run=generation,turnId=newId();
  queue=queue.catch(()=>{}).then(async()=>{
   if(run!==generation)return;
   if(!available)await refresh();if(run!==generation)return;
   if(!saving){message('Saving is off. This conversation stays in this tab.');return}
   message('Saving chat…');
   if(!current||current.topic!==context.topic||current.readingMode!==context.role){
    const created=await accountRequest('/api/me/chats',{method:'POST',body:{id:newId(),topic:context.topic,readingMode:context.role,historyEpoch:epoch}});
    if(run!==generation)return;setCurrent(created.chat);
   }
   const id=current.id;
   await accountRequest('/api/me/chats/'+encodeURIComponent(id)+'/turns',{method:'POST',body:{id:turnId,question:turn.question,text:turn.text,deck:turn.deck,citations:turn.citations||[],overview:!!turn.overview,historyEpoch:epoch}});
   if(run===generation){message('Saved to your account.');await refresh()}
  }).catch(error=>{if(run===generation)message('Not saved: '+error.message+' Your answer remains visible.');});
  return queue;
 }
 $('newChat').onclick=reset;
 window.addEventListener('storage',event=>{if(event.key==='hb-history-cleared'){reset();available=false;refresh().catch(()=>{});message('Chat history was deleted. Start a new research conversation.')}});
 $('chatHistoryPanel').addEventListener('toggle',()=>{if($('chatHistoryPanel').open)refresh().catch(error=>message(error.message))});
 return {saveTurn,reset,load,setHandlers(handlers){onRestore=handlers.restore;onNew=handlers.newChat},async init(){try{await refresh();message(saving?'Research chats are saved to your account. Keep personal medical details out.':'Chat saving is off. Change this in settings.')}catch(error){message('Chat history unavailable: '+error.message)}},invalidate(){generation++;setCurrent(null)}};
}
