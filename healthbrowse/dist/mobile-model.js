import {faqQuestions} from './faq-spec.js';
import {normalizeReadingRole} from './reading-profiles.js';
import {inspectInput} from './clinical-engine.js';
export function mobileDestinations(role){
 const r=normalizeReadingRole(role);
 if(r==='Medical professional')return [['search','Search'],['evidence','Evidence'],['sources','Sources'],['history','History']];
 return [['search','Search'],['saved','Saved'],['history','History'],['account','Account']];
}
export function citationURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
export function studyCards(responses=[]){
 return responses.filter(r=>Number.isInteger(r.id)&&r.id>=1&&r.id<=6).flatMap(r=>{
  const blocks=(r.blocks||[]).filter(b=>b.text?.trim()&&(b.references||[b.citation]).some(ref=>ref&&citationURL(ref.url)));
  if(!blocks.length)return [];
  const text=blocks.map(b=>b.text).join('\n\n');if(text.length>8000)return [];
  const references=[...new Map(blocks.flatMap(b=>b.references||[b.citation]).filter(ref=>ref&&citationURL(ref.url)).map(ref=>[ref.url,ref])).values()];
  return [{id:r.id,question:faqQuestions[r.id-1],text,references,kind:r.generation?'From your cited answer':'Source excerpt'}];
 });
}
export function noteCanSave(value){return typeof value==='string'&&value.length<=8000&&(!value.trim()||inspectInput(value)==='ok')}
export function saveStudyNote(storage,topic,value){
 if(!topic||!noteCanSave(topic)||!noteCanSave(value))return false;
 try{const raw=JSON.parse(storage.getItem('hb-study-notes')||'{}'),notes=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const entries=Object.entries(notes).filter(([key,text])=>key!==topic&&noteCanSave(key)&&noteCanSave(text)).slice(-19);
  if(value.trim())entries.push([topic,value]);storage.setItem('hb-study-notes',JSON.stringify(Object.fromEntries(entries)));return true;
 }catch{return false}
}
export function readStudyNote(storage,topic){try{const value=JSON.parse(storage.getItem('hb-study-notes')||'{}')[topic];return typeof value==='string'&&noteCanSave(value)?value:''}catch{return ''}}
