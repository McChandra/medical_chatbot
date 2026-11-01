import test from 'node:test';
import assert from 'node:assert/strict';
import {accountAPI,triageFeedback} from '../server/account-api.mjs';

const user='11111111-1111-4111-8111-111111111111',reqId='99999999-9999-4999-8999-999999999999';
const env={SUPABASE_URL:'https://project.example',SUPABASE_ANON_KEY:'publishable',SUPABASE_SERVICE_ROLE_KEY:'secret-key',
  RESEND_API_KEY:'mail-key',CONTACT_FROM:'desk@example.org',CONTACT_TO:'info@example.org'};
const request=(path,method='GET',body,token='jwt')=>new Request('https://service.test'+path,{method,
  headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
function mock(t,handle){
  const fetch=t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url==='https://project.example/auth/v1/user'){
      assert.equal(options.headers.Authorization,'Bearer jwt');assert.equal(options.headers.apikey,'publishable');
      return Response.json({id:user});
    }
    return handle(url,options);
  });return fetch;
}

test('requires validated identity, rejects a spoofed hosting header, does not call DB on invalid token',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json({error:'invalid'}, {status:401}));
  let r=await accountAPI(new Request('https://svc.test/api/me/settings',{headers:{'oai-authenticated-user-id':user}}),env);
  assert.equal(r.status,401);assert.equal(fetch.mock.callCount(),0);
  r=await accountAPI(request('/api/me/settings'),env);assert.equal(r.status,401);assert.equal(fetch.mock.callCount(),1);
});
test('settings default off and partial writes cannot choose owner or privileged role',async t=>{
  const fetch=mock(t,(url,opts)=>{
    if(url.includes('hb_settings?')){assert.ok(url.includes(user));return Response.json([])}
    assert.ok(url.endsWith('rpc/hb_update_settings'));assert.equal(opts.headers.Authorization,'Bearer jwt');
    assert.deepEqual(JSON.parse(opts.body),{p_history:true,p_mode:null,p_theme:null});return Response.json([{save_history:true}]);
  });
  let r=await accountAPI(request('/api/me/settings'),env);
  assert.deepEqual((await r.json()).settings,{saveHistory:false,readingMode:'General reader',theme:'system'});
  r=await accountAPI(request('/api/me/settings','PATCH',{saveHistory:true}),env);assert.equal((await r.json()).settings.saveHistory,true);
  r=await accountAPI(request('/api/me/settings','PATCH',{user_id:'another',theme:'dark'}),env);assert.equal(r.status,400);assert.equal(fetch.mock.callCount(),5);
});
test('saves a bookmark idempotently using the verified owner; deletion is owner-filtered',async t=>{
  const row={id:reqId,user_id:user,topic:'Leukemia',kind:'bookmark',title:'Leukemia',url:''};
  const fetch=mock(t,(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer jwt');
    if(options.method==='POST'){assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');assert.ok(!Object.hasOwn(JSON.parse(options.body),'user_id'));return new Response(null,{status:201})}
    assert.ok(url.includes('user_id=eq.'+user));
    return options.method==='DELETE'?new Response(null,{status:204}):Response.json([row]);
  });
  for(let i=0;i<2;i++){const response=await accountAPI(request('/api/me/saved','POST',{topic:'Leukemia',kind:'bookmark'}),env);assert.equal((await response.json()).item.id,reqId)}
  assert.equal((await accountAPI(request('/api/me/saved/'+reqId,'DELETE'),env)).status,200);
  assert.equal(fetch.mock.callCount(),8);
});
test('history is canonical and opt-in, never accepts free questions as arbitrary fields',async t=>{
  const row={id:reqId,topic:'Leukemia',kind:'chat',section:5,created_at:'2026-11-01'};
  mock(t,(url,opts)=>{
    if(url.includes('/rpc/hb_record_history')){
      assert.deepEqual(JSON.parse(opts.body),{p_topic:'Leukemia',p_kind:'chat',p_section:5});return Response.json(false);
    }
    assert.ok(url.includes('created_at=gte.'));return Response.json([row]);
  });
  let r=await accountAPI(request('/api/me/history','POST',{topic:'Leukemia',kind:'chat',section:5}),env);
  assert.equal((await r.json()).saved,false);
  r=await accountAPI(request('/api/me/history','POST',{topic:'Leukemia',kind:'chat',section:5,question:'arbitrary raw text'}),env);assert.equal(r.status,400);
  r=await accountAPI(request('/api/me/history'),env);const item=(await r.json()).items[0];
  assert.match(item.questionLabel,/Prediction and genetics/);assert.equal(item.href,'/?topic=Leukemia&section=5');
});
test('feedback tags and sentiment route a correction to human review',async t=>{
  assert.deepEqual(triageFeedback('The citation is wrong, thanks.'),{type:'source-correction',sentiment:'mixed',reviewStatus:'pending'});
  mock(t,(url,opts)=>{assert.ok(url.endsWith('/rpc/hb_submit_feedback'));assert.equal(JSON.parse(opts.body).p_type,'bug');return Response.json(reqId)});
  const r=await accountAPI(request('/api/feedback','POST',{message:'The lookup button is broken.'}),env);
  assert.equal((await r.json()).feedback.reviewStatus,'pending');
});
test('contact sends only to configured company address and retries without duplicate sending',async t=>{
  let finalized=false,sends=0,hash;
  mock(t,(url,opts)=>{
    const b=JSON.parse(opts.body);
    if(url.endsWith('rpc/hb_reserve_contact')){assert.equal(opts.headers.Authorization,'Bearer jwt');assert.match(b.p_digest,/^[a-f0-9]{64}$/);hash=b.p_digest;return Response.json(finalized?'sent':'pending')}
    if(url.endsWith('rpc/hb_complete_contact')){assert.equal(opts.headers.Authorization,'Bearer secret-key');assert.equal(b.p_digest,hash);assert.equal(b.p_user,user);finalized=true;return Response.json(true)}
    assert.equal(url,'https://api.resend.com/emails');assert.deepEqual(b.to,['info@example.org']);assert.equal(b.reply_to,'visitor@example.com');assert.equal(opts.headers['Idempotency-Key'],'hb-contact/'+user+'/'+reqId);sends++;return Response.json({id:'receipt'});
  });
  const b={name:'Visitor',email:'visitor@example.com',message:'Please share pilot information.',requestId:reqId};
  for(let i=0;i<2;i++){const r=await accountAPI(request('/api/contact','POST',b),env);assert.deepEqual(await r.json(),{status:'sent',requestId:reqId})}
  assert.equal(sends,1);
});
test('does not claim mail delivery when unavailable or when sender tries to set recipient',async t=>{
  const fetch=mock(t,()=>{throw new Error('Unexpected call')});
  const body={name:'Test',email:'visitor@example.com',message:'A research question.',requestId:reqId};
  assert.equal((await accountAPI(request('/api/contact','POST',body),{...env,CONTACT_TO:''})).status,503);
  assert.equal((await accountAPI(request('/api/contact','POST',{...body,to:'other@example.com'}),env)).status,400);
  assert.equal(fetch.mock.callCount(),2);
});
