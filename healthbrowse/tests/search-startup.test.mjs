import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSearch} from '../dist/search-startup.js';
import {respond} from '../worker/routes.mjs';

function fixture(){
 const form={setAttribute(key,value){this[key]=value}},input={value:'',focus(){}},submit={},notice={},example={dataset:{topic:'Leukemia'}};
 let reloads=0;
 const ui=attachSearch({form,input,submit,notice,examples:[example],reload:()=>reloads++});
 const enter=()=>{let prevented=false;form.onsubmit({preventDefault(){prevented=true}});assert.equal(prevented,true)};
 return {ui,form,input,submit,notice,example,enter,reloads:()=>reloads};
}
test('Enter during loading queues the latest question and runs it exactly once when ready',async()=>{
 const f=fixture(),queries=[];
 f.input.value='What is leukemia?';f.enter();
 f.input.value='What are the symptoms of diabetes?';f.enter();
 assert.match(f.notice.textContent,/queued/);assert.equal(f.submit.disabled,false);
 assert.equal(f.ui.ready(q=>queries.push(q)),true);
 await Promise.resolve();assert.deepEqual(queries,['What are the symptoms of diabetes?']);
 f.input.value='How is diabetes treated?';f.enter();await Promise.resolve();assert.equal(queries.length,2);
});
test('example taps during loading are not lost; failed startup can reload with an empty field',async()=>{
 const f=fixture(),queries=[];f.example.onclick();f.ui.ready(q=>queries.push(q));
 await Promise.resolve();assert.deepEqual(queries,['Leukemia']);
 f.input.value='';f.ui.fail();assert.equal(f.submit.type,'button');f.submit.onclick();assert.equal(f.reloads(),1);
});
test('a rejected search leaves the question intact and displays a retry message',async()=>{
 const f=fixture();f.ui.ready(()=>Promise.reject(new Error('offline')));f.input.value='What is asthma?';await f.ui.send();
 assert.match(f.notice.textContent,/could not finish/);assert.equal(f.input.value,'What is asthma?');assert.equal(f.form['aria-busy'],'false');
});
test('legacy search links preserve questions on the canonical desk',async()=>{
 for(const path of ['/search','/search/']){
  const r=await respond(new Request('https://example.test'+path+'?q=What+is+leukemia%3F'),{},{});
  assert.equal(r.status,307);assert.equal(r.headers.get('Location'),'/?q=What+is+leukemia%3F');
 }
});
