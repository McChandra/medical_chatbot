import test from 'node:test';
import assert from 'node:assert/strict';
import {browserConfig} from '../server/public-config.mjs';
test('the public configuration never exposes service secrets',()=>{
 const y=key=>browserConfig({SUPABASE_URL:'https://demo.supabase.co',SUPABASE_ANON_KEY:key}).supabaseAnonKey;
 assert.equal(y('sb_secret_example'),'');assert.equal(y('a.'+btoa('{"role":"service_role"}')+'.b'),'');
 assert.equal(y('sb_publishable_example'),'sb_publishable_example');
});
