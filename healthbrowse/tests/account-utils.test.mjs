import test from 'node:test';
import assert from 'node:assert/strict';
import {validPassword,suggestedPassword,researchUrl} from '../dist/account-utils.js';
import {publicAuthConfig} from '../dist/account-client.js';
test('password policy accepts long passphrases and rejects unsupported byte lengths',()=>{
  assert.equal(validPassword('x'.repeat(11)),false);
  assert.equal(validPassword('correct horse battery staple'),true);
  assert.equal(validPassword('🌿'.repeat(19)),false);
  for(let i=0;i<10;i++){const p=suggestedPassword();assert.equal(p.length,24);assert.ok(validPassword(p));for(const re of [/[A-Z]/,/[a-z]/,/\d/,/[!@#%+=-]/])assert.match(p,re);}
});
test('account links encode the canonical topic and skip invalid sections',()=>{
  assert.equal(researchUrl('A & B',3),'/?topic=A+%26+B&section=3');
  assert.equal(researchUrl('Asthma',8),'/?topic=Asthma');
});
test('anonymous public config restricts Supabase endpoint transport',()=>{
  assert.throws(()=>publicAuthConfig({supabaseUrl:'http://example.org',supabaseAnonKey:'test'}));
  assert.throws(()=>publicAuthConfig({supabaseUrl:'https://a:b@x.org',supabaseAnonKey:'test'}));
  assert.equal(publicAuthConfig({supabaseUrl:'https://test.supabase.co',supabaseAnonKey:'public'}).url,'https://test.supabase.co');
});
