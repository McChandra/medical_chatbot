import test from 'node:test';
import assert from 'node:assert/strict';
import {respond} from '../worker/routes.mjs';
test('public research assets are accessible to guests', async()=>{
 const assets={'/index.html':{text:'Research desk',type:'text/html'}};
 const req=new Request('https://test.invalid/',{headers:{'oai-authenticated-user-id':'example'}});
 assert.equal(await (await respond(req,{},assets)).text(),'Research desk');
 assert.equal((await respond(new Request(req.url),{},assets)).status,200);
 assert.equal((await respond(new Request('https://test.invalid/missing',{headers:req.headers}),{},assets)).status,404);
});
