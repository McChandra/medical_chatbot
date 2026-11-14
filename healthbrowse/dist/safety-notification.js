import {createWelcomeTone} from './buddy-welcome.js';
import {buddyPolicyVersion} from './buddy-policy.js';
import {safetyPolicyVersion} from './safety-policy.js';
// Called only by authenticated app response handlers, never by markup or text parsing.
const categories=new Set(['lethal_dose','off_label_protocol','unsafe_procedure','individual_dose','drug_misuse','harm_others','medical_misconduct','forged_event','prompt_extraction','persona_override','unsafe_cyber','harmful_content','professional_advice','encoded_request','private_input']);
export function createSafetyNotifier({makeSound=createWelcomeTone,now=()=>Date.now(),isVisible=()=>document.visibilityState==='visible',onAlert=()=>{if(typeof document!=='undefined')document.dispatchEvent(new Event('healthbrowse-safety-alert'))}}={}){
 let last=-Infinity;
 return ({status,safety}={})=>{
  if(!['unsafe','private','blocked'].includes(status)||!categories.has(safety?.category)||![buddyPolicyVersion,safetyPolicyVersion].includes(safety?.policyVersion)||!isVisible()||now()-last<30000)return false;
  last=now();try{onAlert()}catch{}
  try{const sound=makeSound();const played=sound.play();if(!played)sound.dispose();return played}catch{return false}
 };
}
export const notifySafety=createSafetyNotifier();
