import {frameworkVersion} from '../dist/disease-framework.js';
import {inspectInput} from '../dist/clinical-engine.js';
import {isReadingRole,normalizeReadingRole} from '../dist/reading-profiles.js';
import {workspaceExport} from './workspace-export.mjs';
const themes=['system','light','dark'];
const uuid=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
class InputError extends Error {constructor(message,status=400){super(message);this.status=status}}
const fail=(message,status=400)=>{throw new InputError(message,status)};
const only=(body,keys)=>{if(Object.keys(body).some(key=>!keys.includes(key)))fail('Unexpected field.')};
function value(input,max,label){if(typeof input!=='string'||!input.trim()||input.trim().length>max)fail('Check '+label+'.');return input.trim()}
function publicText(input,max,label){const text=value(input,max,label);if(inspectInput(text)!=='ok')fail('Save public research only. Remove personal details.');return text}
function sourceURL(input){let url;try{url=new URL(input)}catch{fail('Invalid source link.')}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>2048)fail('Invalid source link.');return url.href}
async function body(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('Use application/json.',415);
 const reader=request.body?.getReader();if(!reader)fail('Missing request body.');let size=0,raw='';const decoder=new TextDecoder();
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>28000){await reader.cancel();fail('Request too large.',413)}raw+=decoder.decode(chunk.value,{stream:true})}}finally{reader.releaseLock()}
 let data;try{data=JSON.parse(raw+decoder.decode())}catch{fail('Invalid JSON.')}
 if(!data||typeof data!=='object'||Array.isArray(data))fail('Invalid request.');return data;
}
function preferences(row){return {readingMode:normalizeReadingRole(row.reading_mode),theme:row.theme,timezone:row.timezone||'UTC',saveHistory:!!row.save_history,saveChats:!!row.save_chats,historyEpoch:row.history_epoch}}
function profile(row,user){return {name:row.display_name,firstName:row.first_name||'',lastName:row.last_name||'',phone:row.phone||'',avatar:row.avatar||'',email:user.email||'',pendingEmail:user.new_email||''}}
function optionalText(input,max,label){if(typeof input!=='string'||input.trim().length>max||/[\u0000-\u001f\u007f]/.test(input))fail('Check '+label+'.');return input.trim()}
const chatView=row=>({id:row.id,title:row.title,topic:row.topic,readingMode:normalizeReadingRole(row.reading_mode),createdAt:row.created_at,updatedAt:row.updated_at});
export async function workspaceAPI(request,db,user){
 try{
  const path=new URL(request.url).pathname,method=request.method,owner=user.id;
  const sql=(query,...args)=>db.prepare(query).bind(...args);
  const metadataName=String(user.user_metadata?.full_name||user.user_metadata?.name||'').slice(0,100);
  await sql('INSERT OR IGNORE INTO hb_accounts (user_id,display_name) VALUES (?,?)',owner,metadataName).run();
  const account=await sql('SELECT * FROM hb_accounts WHERE user_id=?',owner).first();
  if(path==='/api/me/export'&&method==='GET')return workspaceExport(db,owner,profile(account,user),preferences(account));
  if(path==='/api/me/buddy-intro'){
   if(method!=='POST')return response({error:'Use POST.'},405);
   const b=await body(request);only(b,[]);
   // Atomic account-level claim: reloads, simultaneous tabs and other devices
   // cannot each show a welcome. Never reset this when chats are deleted.
   const result=await sql('UPDATE hb_accounts SET buddy_intro_seen=1 WHERE user_id=? AND buddy_intro_seen=0',owner).run();
   return response({showWelcome:result.meta?.changes===1});
  }
  const ownedChat=async id=>{if(!uuid.test(id))fail('Invalid chat.');const row=await sql('SELECT * FROM hb_chats WHERE id=? AND user_id=?',id,owner).first();if(!row)fail('This chat was deleted or is unavailable.',404);return row};
  if(path==='/api/me/profile'){
   if(method==='GET')return response({profile:profile(account,user)});
   if(method==='PATCH'){
    const b=await body(request);only(b,['name','firstName','lastName','phone','avatar']);
    if(!Object.keys(b).length)fail('No profile changes supplied.');
    const first=b.firstName===undefined?account.first_name:optionalText(b.firstName,50,'first name'),last=b.lastName===undefined?account.last_name:optionalText(b.lastName,50,'last name');
    const name=b.name===undefined?(b.firstName!==undefined||b.lastName!==undefined?[first,last].filter(Boolean).join(' '):account.display_name):optionalText(b.name,100,'name');
    if(!name)fail('Enter your name.');
    const phone=b.phone===undefined?account.phone:optionalText(b.phone,16,'phone number');
    if(phone&&!/^\+[1-9]\d{6,14}$/.test(phone))fail('Use an international phone number, such as +919876543210.');
    const avatar=b.avatar===undefined?account.avatar:b.avatar;
    if(typeof avatar!=='string'||avatar.length>18000||(avatar&&!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(avatar)))fail('Use a small JPEG profile image.');
    await sql('UPDATE hb_accounts SET display_name=?,first_name=?,last_name=?,phone=?,avatar=? WHERE user_id=?',name,first,last,phone,avatar,owner).run();
    return response({profile:profile({...account,display_name:name,first_name:first,last_name:last,phone,avatar},user)});
   }
  }else if(path==='/api/me/settings'){
   if(method==='GET')return response({settings:preferences(account)});
   if(method==='PATCH'){
    const b=await body(request);only(b,['saveChats','saveHistory','readingMode','theme','timezone']);
    for(const key of ['saveChats','saveHistory'])if(b[key]!==undefined&&typeof b[key]!=='boolean')fail('Invalid history preference.');
    if(b.readingMode!==undefined){if(!isReadingRole(b.readingMode))fail('Invalid reading mode.');b.readingMode=normalizeReadingRole(b.readingMode)}if(b.theme!==undefined&&!themes.includes(b.theme))fail('Invalid theme.');
    if(b.timezone!==undefined){if(typeof b.timezone!=='string'||b.timezone.length>80)fail('Invalid timezone.');try{new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format()}catch{fail('Invalid timezone.')}}
    const stmts=[sql('UPDATE hb_accounts SET save_chats=COALESCE(?,save_chats),save_history=COALESCE(?,save_history),reading_mode=COALESCE(?,reading_mode),theme=COALESCE(?,theme),timezone=COALESCE(?,timezone) WHERE user_id=?',b.saveChats===undefined?null:Number(b.saveChats),b.saveHistory===undefined?null:Number(b.saveHistory),b.readingMode??null,b.theme??null,b.timezone??null,owner)];
    if(b.saveHistory===false)stmts.push(sql('DELETE FROM hb_research_history WHERE user_id=?',owner));
    await db.batch(stmts);return response({settings:preferences(await sql('SELECT * FROM hb_accounts WHERE user_id=?',owner).first())});
   }
  }else if(path==='/api/me/chats'){
   if(method==='GET'){
    const rows=await sql('SELECT * FROM hb_chats WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 100',owner).all();
    return response({items:rows.results.map(chatView),settings:preferences(account)});
   }
   if(method==='POST'){
    const b=await body(request);only(b,['id','topic','readingMode','historyEpoch']);if(!uuid.test(b.id))fail('Invalid chat.');
    const topic=publicText(b.topic,160,'topic');if(!isReadingRole(b.readingMode))fail('Invalid reading mode.');b.readingMode=normalizeReadingRole(b.readingMode);
    if(!Number.isSafeInteger(b.historyEpoch))fail('Reload chat history.');
    const existing=await sql('SELECT * FROM hb_chats WHERE id=? AND user_id=?',b.id,owner).first();
    if(existing){if(existing.topic!==topic||normalizeReadingRole(existing.reading_mode)!==b.readingMode)fail('Chat changed. Start a new chat.',409);return response({chat:chatView(existing)})}
    const now=new Date().toISOString();
    const saved=await sql(`INSERT OR IGNORE INTO hb_chats (id,user_id,title,topic,reading_mode,created_at,updated_at)
     SELECT ?,user_id,?,?,?, ?,? FROM hb_accounts WHERE user_id=? AND save_chats=1 AND history_epoch=?
     AND (SELECT count(*) FROM hb_chats WHERE user_id=?)<100`,b.id,topic,topic,b.readingMode,now,now,owner,b.historyEpoch,owner).run();
    if(!saved.meta.changes)fail('Chat was not saved. Refresh history, enable saving, or remove a chat if you have reached 100.',409);
    return response({chat:chatView(await ownedChat(b.id))},201);
   }
   if(method==='DELETE'){
    const b=await body(request);only(b,['confirmation']);if(b.confirmation!=='DELETE_ALL_CHATS')fail('Confirm deletion first.');
    // One atomic batch prevents partial deletion; epoch invalidates queued new-chat writes.
    await db.batch([sql('UPDATE hb_accounts SET history_epoch=history_epoch+1 WHERE user_id=?',owner),sql('DELETE FROM hb_chat_turns WHERE chat_id IN (SELECT id FROM hb_chats WHERE user_id=?)',owner),sql('DELETE FROM hb_chats WHERE user_id=?',owner),sql('DELETE FROM hb_research_history WHERE user_id=?',owner)]);
    return response({cleared:true,historyEpoch:(await sql('SELECT history_epoch FROM hb_accounts WHERE user_id=?',owner).first()).history_epoch});
   }
  }else if(path.startsWith('/api/me/chats/')){
   const parts=path.slice('/api/me/chats/'.length).split('/'),id=parts[0];
   if(parts.length>2||(parts[1]&&parts[1]!=='turns'))fail('Chat resource unavailable.',404);
   const chat=await ownedChat(id);
   if(parts[1]==='turns'&&method==='POST'){
    const b=await body(request);only(b,['id','question','text','deck','citations','overview','historyEpoch','frameworkVersion']);
    if(!uuid.test(b.id)||!Number.isInteger(b.deck)||b.deck<1||b.deck>7||!Number.isSafeInteger(b.historyEpoch))fail('Invalid chat turn.');
    const question=publicText(b.question,2000,'question'),text=value(b.text,16000,'answer');
    if(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b(?:MRN|SSN|medical record number|patient name)\b/i.test(text))fail('Remove personal identifiers from saved text.');
    if(!Array.isArray(b.citations)||b.citations.length>30)fail('Invalid citations.');
    const citations=b.citations.map(c=>({title:value(c?.title,500,'citation title'),url:sourceURL(c?.url)}));
    if(b.frameworkVersion!==undefined&&b.frameworkVersion!==frameworkVersion)fail('Unknown research framework.');
    const turn=JSON.stringify({frameworkVersion:b.frameworkVersion||'seven-section-v1',topic:chat.topic,question,text,deck:b.deck,citations,overview:b.overview===true});
    const previous=await sql('SELECT turn_json FROM hb_chat_turns WHERE id=? AND chat_id=?',b.id,id).first();
    if(previous){if(previous.turn_json!==turn)fail('This message ID was already used.',409);return response({saved:true,id:b.id})}
    const now=new Date().toISOString();
    const result=await db.batch([
     sql(`INSERT OR IGNORE INTO hb_chat_turns (id,chat_id,turn_json,created_at)
      SELECT ?,c.id,?,? FROM hb_chats c JOIN hb_accounts a ON a.user_id=c.user_id
      WHERE c.id=? AND c.user_id=? AND a.save_chats=1 AND a.history_epoch=?
      AND (SELECT count(*) FROM hb_chat_turns WHERE chat_id=c.id)<200`,b.id,turn,now,id,owner,b.historyEpoch),
     sql('UPDATE hb_chats SET updated_at=? WHERE id=? AND user_id=? AND EXISTS (SELECT 1 FROM hb_chat_turns WHERE id=? AND chat_id=?)',now,id,owner,b.id,id)
    ]);
    if(!result[0].meta.changes)fail('Message not saved. Chat history changed, saving is off, or this chat reached 200 messages.',409);
    return response({saved:true,id:b.id},201);
   }
   if(parts.length===1){
    if(method==='GET'){const rows=await sql('SELECT id,turn_json,created_at FROM hb_chat_turns WHERE chat_id=? ORDER BY created_at,rowid LIMIT 200',id).all();return response({chat:chatView(chat),turns:rows.results.map(r=>({...JSON.parse(r.turn_json),id:r.id,savedAt:r.created_at})),historyEpoch:account.history_epoch})}
    if(method==='PATCH'){const b=await body(request);only(b,['title']);const title=publicText(b.title,160,'title');await sql('UPDATE hb_chats SET title=? WHERE id=? AND user_id=?',title,id,owner).run();return response({chat:chatView({...chat,title})})}
    if(method==='DELETE'){await db.batch([sql('DELETE FROM hb_chat_turns WHERE chat_id IN (SELECT id FROM hb_chats WHERE id=? AND user_id=?)',id,owner),sql('DELETE FROM hb_chats WHERE id=? AND user_id=?',id,owner)]);return response({removed:true})}
   }
  }else if(path==='/api/me/history'){
   if(method==='GET'){const rows=await sql('SELECT id,topic,kind,section,created_at FROM hb_research_history WHERE user_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 100',owner,new Date(Date.now()-30*86400000).toISOString()).all();return response({items:rows.results.map(r=>({...r,questionLabel:'Research '+r.topic+' · Section '+r.section}))})}
   if(method==='POST'){
    const b=await body(request);only(b,['topic','kind','section']);const topic=publicText(b.topic,160,'topic');if(!['chat','search'].includes(b.kind)||!Number.isInteger(b.section)||b.section<1||b.section>7)fail('Invalid research event.');
    const saved=await sql('INSERT INTO hb_research_history (id,user_id,topic,kind,section,created_at) SELECT ?,user_id,?,?,?,? FROM hb_accounts WHERE user_id=? AND save_history=1',crypto.randomUUID(),topic,b.kind,b.section,new Date().toISOString(),owner).run();
    await sql('DELETE FROM hb_research_history WHERE user_id=? AND id NOT IN (SELECT id FROM hb_research_history WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100)',owner,owner).run();return response({saved:!!saved.meta.changes});
   }
   if(method==='DELETE'){await sql('DELETE FROM hb_research_history WHERE user_id=?',owner).run();return response({cleared:true})}
  }else if(path==='/api/me/saved'){
   if(method==='GET'){const rows=await sql('SELECT id,topic,kind,title,url,created_at FROM hb_bookmarks WHERE user_id=? ORDER BY created_at DESC LIMIT 200',owner).all();return response({items:rows.results})}
   if(method==='POST'){
    const b=await body(request);only(b,['topic','kind','title','url']);const topic=publicText(b.topic,160,'topic'),title=publicText(b.title||topic,300,'title'),url=b.url?sourceURL(b.url):'';if(!['bookmark','favourite'].includes(b.kind))fail('Invalid saved kind.');
    const existing=await sql('SELECT id,topic,kind,title,url,created_at FROM hb_bookmarks WHERE user_id=? AND topic=? AND kind=? AND url=?',owner,topic,b.kind,url).first();if(existing)return response({item:existing});
    const id=crypto.randomUUID();await sql('INSERT INTO hb_bookmarks (id,user_id,topic,kind,title,url,created_at) VALUES (?,?,?,?,?,?,?)',id,owner,topic,b.kind,title,url,new Date().toISOString()).run();return response({item:{id,topic,kind:b.kind,title,url}},201);
   }
  }else if(path.startsWith('/api/me/saved/')){
   const id=path.slice('/api/me/saved/'.length);if(!uuid.test(id))fail('Invalid saved item.');if(method==='DELETE'){await sql('DELETE FROM hb_bookmarks WHERE id=? AND user_id=?',id,owner).run();return response({removed:true})}
  }else return response({error:'Account resource unavailable.'},404);
  return response({error:'Method not supported.'},405);
 }catch(error){return response({error:error instanceof InputError?error.message:'Workspace storage is unavailable. Please retry.'},error instanceof InputError?error.status:503)}
}
