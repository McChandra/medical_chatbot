import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountAPI} from '../server/account-api.mjs';
import {openWorkspace} from '../server/sqlite-workspace.mjs';
const users={a:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.test',user_metadata:{full_name:'Researcher A'}},b:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.test'}};
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url)));
function fixture(t){
 const DB=openWorkspace(':memory:');for(const entry of journal.entries)DB.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));
 t.after(()=>DB.close());t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'https://auth.example/auth/v1/user');const user=users[options.headers.Authorization.slice(7)];return user?Response.json(user):Response.json({error:'invalid'},{status:401});
 });
 const env={DB,SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public'};
 const call=(path,method='GET',body,token='a')=>accountAPI(new Request('https://site.test/api/me/'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)}),env);
 return {DB,call};
}
const chat=()=>({id:crypto.randomUUID(),topic:'Leukemia',readingMode:'General reader',historyEpoch:0});
const turn=()=>({id:crypto.randomUUID(),question:'What is leukemia?',text:'Section 1 · A saved research answer.',deck:1,citations:[{title:'Leukemia · MedlinePlus',url:'https://medlineplus.gov/leukemia.html'}],overview:true,historyEpoch:0});
test('workspace trusts verified auth, keeps emails in Supabase, and denies owner/role injection',async t=>{
 const {call,DB}=fixture(t);
 assert.equal((await call('profile','GET',undefined,'invalid')).status,401);assert.equal((await DB.prepare('SELECT count(*) AS n FROM hb_accounts').bind().first()).n,0);
 assert.equal((await (await call('profile')).json()).profile.name,'Researcher A');
 assert.equal((await call('profile','PATCH',{name:'New Researcher'})).status,200);
 assert.equal((await (await call('profile')).json()).profile.name,'New Researcher');
 for(const body of [{name:'Injected',user_id:users.b.id},{name:'Injected',email:'new@example.test'},{name:'Injected',role:'admin'}])assert.equal((await call('profile','PATCH',body)).status,400);
 assert.equal((await (await call('profile','GET',undefined,'b')).json()).profile.name,'');
});
test('new chat, messages, citations, reopen, rename, and single-delete use real SQL',async t=>{
 const {call}=fixture(t),c=chat(),m=turn();
 assert.equal((await call('chats','POST',c)).status,201);
 assert.equal((await call('chats/'+c.id+'/turns','POST',m)).status,201);
 assert.equal((await call('chats/'+c.id+'/turns','POST',m)).status,200);
 const read=await (await call('chats/'+c.id)).json();assert.equal(read.turns.length,1);assert.equal(read.turns[0].citations[0].url,m.citations[0].url);
 assert.equal((await call('chats/'+c.id+'/turns','POST',{...m,text:'Changed payload'})).status,409);
 assert.equal((await call('chats/'+c.id,'PATCH',{title:'Leukemia research'})).status,200);
 assert.equal((await (await call('chats')).json()).items[0].title,'Leukemia research');
 assert.equal((await call('chats/'+c.id,'DELETE')).status,200);assert.equal((await call('chats/'+c.id)).status,404);
});
test('another account cannot read, rename, append, or delete a chat; bulk delete stays owner scoped',async t=>{
 const {call}=fixture(t),a=chat(),b=chat();await call('chats','POST',a);await call('chats','POST',b,'b');await call('chats/'+b.id+'/turns','POST',turn(),'b');
 for(const [path,method,data] of [['chats/'+a.id,'GET'],['chats/'+a.id,'PATCH',{title:'Other'}],['chats/'+a.id,'DELETE'],['chats/'+a.id+'/turns','POST',turn()]])assert.equal((await call(path,method,data,'b')).status,404);
 assert.equal((await (await call('chats','GET',undefined,'b')).json()).items.length,1);
 await call('chats','DELETE',{confirmation:'DELETE_ALL_CHATS'});assert.equal((await call('chats/'+b.id,'GET',undefined,'b')).status,200);
});
test('delete-all clears messages and activity, keeps profile/bookmarks, rejects stale writes',async t=>{
 const {call,DB}=fixture(t),c=chat();await call('settings','PATCH',{saveHistory:true});await call('chats','POST',c);await call('chats/'+c.id+'/turns','POST',turn());
 await call('history','POST',{topic:'Leukemia',kind:'search',section:1});await call('saved','POST',{topic:'Leukemia',kind:'bookmark'});
 assert.equal((await call('chats','DELETE',{confirmation:'wrong'})).status,400);
 const result=await (await call('chats','DELETE',{confirmation:'DELETE_ALL_CHATS'})).json();assert.equal(result.historyEpoch,1);
 for(const table of ['hb_chats','hb_chat_turns','hb_research_history'])assert.equal((await DB.prepare('SELECT count(*) AS n FROM '+table).bind().first()).n,0);
 assert.equal((await (await call('saved')).json()).items.length,1);assert.equal((await call('profile')).status,200);
 assert.equal((await call('chats/'+c.id+'/turns','POST',turn())).status,404);assert.equal((await call('chats','POST',chat())).status,409);
 assert.equal((await call('chats','POST',{...chat(),historyEpoch:1})).status,201);
});
test('saving preference and privacy validation prevent new saved messages',async t=>{
 const {call}=fixture(t),c=chat();await call('chats','POST',c);await call('settings','PATCH',{saveChats:false});
 assert.equal((await call('chats/'+c.id+'/turns','POST',turn())).status,409);
 assert.equal((await call('chats','POST',chat())).status,409);await call('settings','PATCH',{saveChats:true});
 for(const question of ['My name is John and my symptoms are severe.','Contact me at patient@example.com'])assert.equal((await call('chats/'+c.id+'/turns','POST',{...turn(),question})).status,400);
 assert.equal((await call('chats/'+c.id+'/turns','POST',{...turn(),citations:[{title:'Unsafe',url:'javascript:alert(1)'}]})).status,400);
 assert.equal((await call('chats/'+c.id+'/turns','POST',{...turn(),user_id:users.b.id})).status,400);
});
