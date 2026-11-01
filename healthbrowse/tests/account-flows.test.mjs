import test from 'node:test';
import assert from 'node:assert/strict';
import {startEmailChallenge,confirmEmailChallenge} from '../dist/account-flows.js';
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
