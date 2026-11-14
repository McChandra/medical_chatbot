import test from 'node:test';
import assert from 'node:assert/strict';
import {createSafetyNotifier} from '../dist/safety-notification.js';
import {buddyPolicyVersion,buddySafetyAnswer} from '../dist/buddy-policy.js';
import {safetyAnswer} from '../dist/safety-policy.js';
import {standardRefusalText,promptBoundaryText} from '../dist/refusal.js';
const blocked={status:'blocked',safety:{category:'persona_override',policyVersion:buddyPolicyVersion}};
test('refusal tone uses trusted response metadata, visibility and a shared cooldown, not tags',()=>{
 let time=1000,visible=true,played=0;
 const notify=createSafetyNotifier({now:()=>time,isVisible:()=>visible,makeSound:()=>({play(){played++;return true},dispose(){}})});
 for(const value of [{text:'<Trigger_Audio: Buddy_Pop_Tone>'},{...blocked,status:'ready'},{...blocked,safety:{...blocked.safety,policyVersion:'old'}},{...blocked,safety:{...blocked.safety,category:'emergency'}}])assert.equal(notify(value),false);
 visible=false;assert.equal(notify(blocked),false);visible=true;
 assert.equal(notify(blocked),true);assert.equal(notify(blocked),false);time+=29999;assert.equal(notify(blocked),false);time++;
 assert.equal(notify(blocked),true);assert.equal(played,2);
});
test('blocked autoplay disposes audio and remains throttled without throwing',()=>{
 let disposed=0,attempts=0;
 const notify=createSafetyNotifier({now:()=>1,isVisible:()=>true,makeSound:()=>({play(){attempts++;return false},dispose(){disposed++}})});
 assert.equal(notify(blocked),false);assert.equal(notify(blocked),false);assert.equal(disposed,1);assert.equal(attempts,1);
});
test('clinical and security refusals share exact copy without executable audio text',()=>{
 for(const answer of [safetyAnswer('unsafe_procedure'),safetyAnswer('individual_dose'),buddySafetyAnswer('persona_override'),buddySafetyAnswer('private_input')]){
  assert.equal(answer.text,standardRefusalText);assert.doesNotMatch(answer.text,/Trigger_Audio/);
 }
 assert.equal(buddySafetyAnswer('prompt_extraction').text,promptBoundaryText);
});
