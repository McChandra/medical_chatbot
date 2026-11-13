import {faqQuestions,generalTreatmentNotice} from './faq-spec.js';
const safeText=text=>String(text||'').replace(/[\r\n]+/g,' ').replace(/([\\`*_{}\[\]<>])/g,'\\$1');
export function answerSources(answer={}){
 return (answer.blocks?.length?answer.blocks.flatMap(b=>b.references?.length?b.references:b.citation?[b.citation]:[]):answer.citations||[]).filter(r=>{
  try{const u=new URL(r.url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password}catch{return false}
 });
}
export function faqReferences(responses){return [...new Map(responses.flatMap(answerSources).map(r=>[r.url,r])).values()]}
export function faqMarkdown({topic,clinical,answer,decks}){
 const refs=faqReferences([answer,...decks]),number=r=>refs.findIndex(x=>x.url===r.url)+1;
 function body(response){
  if(response.blocks?.length)return response.blocks.map(b=>safeText(b.text)+' '+answerSources({blocks:[b]}).map(r=>'['+number(r)+']').join(' ')).join('\n> ');
  return safeText(response.text||'I do not have sufficient authorized data to answer this specific query.');
 }
 const out=['# 🩺 '+safeText(topic),'*View: '+(clinical?'Clinical Professional':'General Public')+'*','','> **Browser Summary:**','> '+body(answer),'','---','','## ❓ Frequently Asked Questions',''];
 for(let i=0;i<6;i++){
  const response=decks.find(d=>d.id===i+1)||{};
  out.push('**Q: '+faqQuestions[i]+'**','> **Buddy says:** '+body(response));
  if(i===4&&!clinical&&!response.text?.includes(generalTreatmentNotice))out.push('> '+generalTreatmentNotice);
  if(response.modelNotice)out.push('> *'+safeText(response.modelNotice)+'*');
  out.push('');
 }
 out.push('---','','## 📚 Authorized Citations');
 for(let i=0;i<refs.length;i++){const r=refs[i];out.push('* ['+(i+1)+'] ['+safeText(r.title||'Source')+'](<'+new URL(r.url).href.replace(/>/g,'%3E')+'>)'+(r.date?' · '+safeText(r.date):''));}
 if(!refs.length)out.push('* No supporting citations are available for this response.');
 out.push('','Educational research reference. Publisher citations do not constitute clinical certification.');
 return out.join('\n');
}
