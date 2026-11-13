import {insufficientClinicalContext} from './medical-contract.js';
import {renderRetry} from './retry-control.js';
const element=(tag,text,cls)=>Object.assign(document.createElement(tag),{textContent:text||'',className:cls||''});
function sourceLink(cite,label){
 try{const url=new URL(cite.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;const a=element('a',label+' ↗');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';return a}catch{return null}
}
export function renderAnswer(parent,answer={},renderCheck,onRetry){
 const blocks=(answer.blocks||[]).filter(b=>typeof b?.text==='string'&&b.text.trim());
 if(blocks.length){
  const list=answer.list?element('ul','','symptom-list'):null;if(list)parent.append(list);
  blocks.forEach((block,i)=>{
   const box=element('section','', 'answer-block');
   if(block.title&&block.title!=='Direct answer')box.append(element('h4',block.title));
   const text=element('p',block.text.replace(/ • /g,'\n• '),'answer-text');
   const refs=block.references?.length?block.references:block.citation?[block.citation]:[];
   const valid=refs.map((ref,j)=>({ref,link:sourceLink(ref,'['+(ref.id||String(i+1)+(refs.length>1?'.'+(j+1):''))+']')})).filter(r=>r.link);
   if(valid.length){const links=element('span','','inline-citations');for(const {ref,link} of valid){link.title=ref.title||'Supporting source';link.setAttribute('aria-label','Source: '+(ref.title||'Supporting passage'));links.append(link)}text.append(links)}
   box.append(text);
   if(valid.length){
    const detail=element('details','', 'source-evidence');detail.append(element('summary','Sources & verification'));
    for(const {ref} of valid){const a=sourceLink(ref,ref.title||'Supporting source');if(a)detail.append(a);if(ref.date)detail.append(element('small',ref.date,'meta'));if(ref.quote)detail.append(element('blockquote',ref.quote));}
    if(block.verification)detail.append(element('small',block.verification,'meta'));
    renderCheck?.(detail,block.check);box.append(detail);
   }
   if(list){const item=element('li');item.append(box);list.append(item)}else parent.append(box);
  });
  for(const gap of answer.gaps||[])if(gap.trim())parent.append(element('p',gap,'coverage-gap'));
 }else{
  const text=typeof answer.text==='string'&&answer.text.trim()?answer.text:insufficientClinicalContext;
  parent.append(element('p',text,'answer-text'));
  for(const cite of answer.citations||[]){const a=sourceLink(cite,cite.title);if(a)parent.append(a)}
  for(const check of answer.checks||[])renderCheck?.(parent,check);
 }
 if(answer.treatmentNotice&&(blocks.length||!answer.text?.includes(answer.treatmentNotice)))parent.append(element('p',answer.treatmentNotice,'treatment-notice'));
 if(answer.diagnosisNotice&&(blocks.length||!answer.text?.includes(answer.diagnosisNotice)))parent.append(element('p',answer.diagnosisNotice,'query-interpretation'));
 if(answer.audienceDisclaimer&&(blocks.length||!answer.text?.includes(answer.audienceDisclaimer)))parent.append(element('p',answer.audienceDisclaimer,'query-interpretation'));
 // Operational and audience labels never replace or precede the actual answer.
 if(answer.modelNotice){const notice=element('p',answer.modelNotice,'model-notice');notice.setAttribute('role','status');parent.append(notice)}
 renderRetry(parent,answer,onRetry);
 if(answer.style)parent.append(element('small',answer.style,'answer-mode'));
 if(answer.generation)parent.append(element('small',(answer.generation.label||'AI synthesis')+' · '+answer.generation.model+(answer.generation.corrected?' · revised after source review':''),'meta'));
}
