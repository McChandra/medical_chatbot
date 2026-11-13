import test from 'node:test';
import assert from 'node:assert/strict';
import {retryState,renderRetry} from '../dist/retry-control.js';
test('retry controls wait for the provider deadline, and do not promise a reset if none was given',()=>{
 assert.equal(retryState({code:'sign_in'}),null);
 assert.deepEqual(retryState({code:'provider_busy',retryAt:11000},1000),{disabled:true,label:'Retry AI answer in 10s'});
 assert.deepEqual(retryState({code:'provider_busy',retryAt:11000},11000),{disabled:false,label:'Retry AI answer'});
 assert.equal(retryState({code:'rate_limited',retryAt:121000},0).label,'Retry AI answer in 3 min');
 assert.equal(retryState({code:'provider_busy',retryAt:null}).disabled,false);
});
test('timer enables manual retry without invoking the model, and stops after removal',t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
 const button={isConnected:true};t.mock.method(globalThis,'setTimeout',globalThis.setTimeout);
 const prior=globalThis.document;globalThis.document={createElement:()=>button};t.after(()=>{if(prior)globalThis.document=prior;else delete globalThis.document});
 let calls=0;renderRetry({append(){}},{code:'provider_busy',retryAt:3000},()=>calls++);
 assert.equal(button.disabled,true);button.onclick();assert.equal(calls,0);
 t.mock.timers.tick(2000);assert.equal(button.disabled,false);assert.equal(calls,0);
 button.onclick();assert.equal(calls,1);assert.equal(button.disabled,true);
 button.isConnected=false;t.mock.timers.tick(10000);assert.equal(calls,1);
});
