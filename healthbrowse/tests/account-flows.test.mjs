import test from 'node:test';
import assert from 'node:assert/strict';
import {startEmailChallenge,confirmEmailChallenge,passwordLogin,updateRecoveredPassword,completeAuthCallback,authErrorMessage,authCallbackDestination} from '../dist/account-flows.js';
const email='test@example.org',origin='https://health.example/account.html';
test('password signup waits for a code; sign-in OTP cannot register a new account',async()=>{
 let opts;
 const mock={signUp:async args=>(opts=args,{data:{session:null}}),signInWithOtp:async args=>(opts=args,{})};
 const challenge=await startEmailChallenge(mock,'signup',email,'this is a unique passphrase',origin);
 assert.equal(challenge.kind,'signup');assert.equal(opts.options.emailRedirectTo,origin);
 await assert.rejects(startEmailChallenge(mock,'signup',email,'short',origin));
 await startEmailChallenge(mock,'otp',email,'',origin);
 assert.equal(opts.options.shouldCreateUser,false);
});
test('signup fails closed if the operator disabled email confirmation',async()=>{
 let revoked=false;const auth={signUp:async()=>({data:{session:{}}}),signOut:async()=>{revoked=true}};
 await assert.rejects(startEmailChallenge(auth,'signup',email,'this is a unique passphrase',origin),/Confirm email/);
 assert.equal(revoked,true);
});
test('password reset issues a recovery challenge and verifies the recovery token type',async()=>{
 let received;const auth={resetPasswordForEmail:async (...args)=>(received=args,{}),verifyOtp:async args=>(received=args,{data:{session:{access_token:'fixture'}}})};
 const ch=await startEmailChallenge(auth,'forgot',email,'',origin);
 assert.deepEqual(received,[email,{redirectTo:origin+'?flow=recovery'}]);
 assert.equal((await confirmEmailChallenge(auth,ch,' 123456 ')).access_token,'fixture');
 assert.deepEqual(received,{type:'recovery',email,token:'123456'});
});
test('expired and unverified codes cannot create a client session',async()=>{
 let received;const auth={verifyOtp:async args=>(received=args,{error:new Error('Code expired')})};
 await assert.rejects(confirmEmailChallenge(auth,{kind:'login',email},'000000'),/expired/);
 assert.equal(received.type,'email');
 await assert.rejects(confirmEmailChallenge({verifyOtp:async()=>({data:{}})},{kind:'signup',email},'000000'));
});
test('password login requires a session and propagates rejected credentials',async()=>{
 const auth={signInWithPassword:async args=>args.password==='valid fixture password'?{data:{session:{user:{email:args.email}}}}:{error:{code:'invalid_credentials',message:'Invalid login credentials'}}};
 assert.equal((await passwordLogin(auth,email,'valid fixture password')).user.email,email);
 await assert.rejects(passwordLogin(auth,email,'wrong'),{code:'invalid_credentials'});
 await assert.rejects(passwordLogin({signInWithPassword:async()=>({data:{}})},email,'x'),/did not complete/);
});
test('password recovery rejects weak passwords before updating and retains provider failures',async()=>{
 let calls=0;
 const auth={updateUser:async()=>{calls++;return {error:{code:'same_password',message:'Use a different password'}}}};
 await assert.rejects(updateRecoveredPassword(auth,'short'),/12 characters/);assert.equal(calls,0);
 await assert.rejects(updateRecoveredPassword(auth,'valid fixture password'),{code:'same_password'});assert.equal(calls,1);
 let sent;
 await updateRecoveredPassword({updateUser:async args=>(sent=args,{data:{}})},'a new fixture passphrase');
 assert.deepEqual(sent,{password:'a new fixture passphrase'});
});
test('PKCE callback retains flow ID and detects recovery without relying on query flag',async()=>{
 let called;
 const auth={exchangeCodeForSession:async(...args)=>(called=args,{data:{session:{user:{email}},redirectType:'recovery'}})};
 const result=await completeAuthCallback(auth,new URL(origin+'?code=fixture&sb_flow_id=fixture-flow'));
 assert.deepEqual(called,['fixture',{flowId:'fixture-flow'}]);assert.equal(result.recovering,true);
 const login=await completeAuthCallback({exchangeCodeForSession:async()=>({data:{session:{user:{email}},redirectType:null}})},new URL(origin+'?code=fixture'));
 assert.equal(login.recovering,false);
});
test('callback errors and missing sessions cannot silently open the research desk',async()=>{
 let called=false;const auth={exchangeCodeForSession:async()=>{called=true;return {data:{}}}};
 for(const suffix of ['?error=access_denied&error_code=otp_expired','#error=access_denied&error_code=otp_expired']){
  await assert.rejects(completeAuthCallback(auth,new URL(origin+suffix)),{code:'otp_expired'});
 }
 assert.equal(called,false);
 assert.equal(await completeAuthCallback(auth,new URL(origin)),null);
 await assert.rejects(completeAuthCallback(auth,new URL(origin+'?code=expired')),/expired/);
});
test('auth failures give actionable feedback without echoing callback URL secrets',()=>{
 assert.match(authErrorMessage({code:'otp_expired'}),/Request a new/);
 assert.match(authErrorMessage({code:'invalid_credentials'}),/Forgot password/);
 assert.match(authErrorMessage({code:'pkce_verifier_not_found'}),/original tab/);
 assert.match(authErrorMessage({code:'email_address_not_authorized'}),/email sender/);
 assert.match(authErrorMessage(new Error('Failed to fetch')),/connection/);
});
test('home-page OAuth callback reaches the exchange page without losing its verifier identity',async()=>{
 const incoming=new URL('https://health.example/?code=fixture&sb_flow_id=flow-fixture&redirect_to=https://untrusted.example&topic=Asthma');
 const next=authCallbackDestination(incoming);
 assert.equal(next,'https://health.example/account.html?code=fixture&sb_flow_id=flow-fixture');
 let received;
 const result=await completeAuthCallback({exchangeCodeForSession:async(...args)=>(received=args,{data:{session:{user:{email}}}})},new URL(next));
 assert.deepEqual(received,['fixture',{flowId:'flow-fixture'}]);assert.equal(result.session.user.email,email);
 assert.equal(authCallbackDestination(new URL(next)),null);
 assert.equal(authCallbackDestination(new URL('https://health.example/?topic=Asthma')),null);
});
test('home callback keeps recovery and provider errors but drops unrelated URL data',async()=>{
 const reset=new URL(authCallbackDestination(new URL('https://health.example/?code=fixture&flow=recovery')));
 const result=await completeAuthCallback({exchangeCodeForSession:async()=>({data:{session:{user:{email}}}})},reset);
 assert.equal(result.recovering,true);
 const rejected=authCallbackDestination(new URL('https://health.example/#error=access_denied&error_description=private-detail'));
 assert.equal(rejected,'https://health.example/account.html?error=access_denied');
 await assert.rejects(completeAuthCallback({},new URL(rejected)),{code:'access_denied'});
 assert.match(authErrorMessage({code:'access_denied'}),/Google denied access/);
});
