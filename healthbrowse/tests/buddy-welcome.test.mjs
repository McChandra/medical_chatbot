import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuddyWelcome,createWelcomeTone} from '../dist/buddy-welcome.js';
function fixture(claim=async()=>({showWelcome:true})){
 let ready=false,calls=0,shown=0,hidden=0,played=0;
 const intro=createBuddyWelcome({claim:async()=>{calls++;return claim()},canShow:()=>ready,onShow:()=>shown++,onHide:()=>hidden++,sound:{arm(){},play(){played++},dispose(){}}});
 return {intro,ready(){ready=true},counts:()=>({calls,shown,hidden,played})};
}
test('welcome waits for the ready desk, shows once and stays dismissed across rerenders',async()=>{
 const f=fixture();await f.intro.sync();assert.equal(f.counts().calls,0);f.ready();await f.intro.sync();await f.intro.sync();
 assert.deepEqual(f.counts(),{calls:1,shown:1,hidden:0,played:1});f.intro.dismiss();await f.intro.sync();assert.deepEqual(f.counts(),{calls:1,shown:1,hidden:1,played:1});
});
test('returning accounts and account errors never show a welcome or play a sound',async()=>{
 for(const claim of [async()=>({showWelcome:false}),async()=>{throw Error('Sign in')}]){
  const f=fixture(claim);f.ready();await f.intro.sync();await f.intro.sync();assert.deepEqual(f.counts(),{calls:1,shown:0,hidden:0,played:0});
 }
});
test('overlapping renders claim only once; opening Buddy while pending suppresses the nudge',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));f.ready();const pending=f.intro.sync();await f.intro.sync();f.intro.used();resolve({showWelcome:true});await pending;
 assert.deepEqual(f.counts(),{calls:1,shown:0,hidden:0,played:0});
});
test('manual Buddy use before onboarding records the visit without interrupting the user',async()=>{
 const f=fixture();f.intro.used();f.ready();await f.intro.sync();assert.deepEqual(f.counts(),{calls:1,shown:0,hidden:0,played:0});
});
test('tone stays quiet when autoplay is blocked, closes safely, and never plays twice',()=>{
 let notes=0,closed=0;const timers=[];
 class Context{
  state='running';currentTime=0;destination={};resume(){return Promise.resolve()}close(){closed++;this.state='closed';return Promise.resolve()}
  createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(value){assert.equal(value,.035)},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
  createOscillator(){return{frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){notes++},stop(){}}}
 }
 const tone=createWelcomeTone({AudioContext:Context,isVisible:()=>true,schedule:fn=>timers.push(fn)});
 assert.equal(tone.play(),true);assert.equal(tone.play(),false);assert.equal(notes,2);timers[0]();assert.equal(closed,1);
 class Blocked extends Context{state='suspended'}
 const blocked=createWelcomeTone({AudioContext:Blocked,isVisible:()=>true});assert.equal(blocked.play(),false);assert.equal(notes,2);blocked.dispose();
 const background=createWelcomeTone({AudioContext:Context,isVisible:()=>false});assert.equal(background.play(),false);assert.equal(notes,2);
});
