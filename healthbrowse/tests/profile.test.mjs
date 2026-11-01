import test from 'node:test';
import assert from 'node:assert/strict';
import {respond} from '../worker/routes.mjs';
const call=(path,headers,env={})=>respond(new Request('https://example.test'+path,{headers}),env,{});
const headers={'oai-authenticated-user-id':'u1'};
test('public education includes all research reading modes',async()=>{
  assert.equal((await call('/api/profile',{})).status,200);
  for(const tier of [3,4,5]){
    const path='/api/clinical-lens?tier='+tier;
    assert.equal((await call(path,{})).status,200);
    const response=await call(path,headers);
    assert.equal(response.status,200);
    assert.equal((await response.json()).lenses.length,7);
  }
  assert.equal((await call('/api/clinical-lens?tier=6',headers)).status,400);
});
