const element=(tag,text,cls)=>Object.assign(document.createElement(tag),{textContent:text||'',className:cls||''});
function sourceLink(cite,label){
 try{const url=new URL(cite.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;const a=element('a',label+' ↗');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';return a}catch{return null}
}
export function renderAnswer(parent,answer,renderCheck){
 if(answer.modelNotice){const notice=element('p',answer.modelNotice,'model-notice');notice.setAttribute('role','status');parent.append(notice)}
 if(answer.generation)parent.append(element('p','AI synthesis · '+answer.generation.model+(answer.generation.corrected?' · revised after source review':''),'meta'));
 if(answer.style)parent.append(element('p',answer.style,'answer-mode'));
 if(answer.blocks?.length){
  answer.blocks.forEach((block,i)=>{
   const box=element('section','', 'answer-block');box.append(element('h4',block.title),element('p',block.text.replace(/ • /g,'\n• '),'answer-text'));
   if(block.references?.length){
    for(const ref of block.references){const a=sourceLink(ref,'['+ref.id+'] '+ref.title);if(a)box.append(a);const detail=element('details','', 'source-evidence');detail.append(element('summary','Supporting passage · '+ref.date),element('blockquote',ref.quote));box.append(detail)}
    box.append(element('small',block.verification,'meta'));
   }else if(block.citation){const a=sourceLink(block.citation,'['+(i+1)+'] '+block.citation.title);if(a)box.append(a)}
   renderCheck?.(box,block.check);parent.append(box);
  });
  for(const gap of answer.gaps||[])parent.append(element('p',gap,'coverage-gap'));
  if(answer.guidance){const box=element('div','', 'reading-guidance');box.append(element('strong',answer.guidance.title),element('p',answer.guidance.text));parent.append(box)}
 }else{
  parent.append(element('p',answer.text,'answer-text'));
  for(const cite of answer.citations||[]){const a=sourceLink(cite,cite.title);if(a)parent.append(a)}
  for(const check of answer.checks||[])renderCheck?.(parent,check);
 }
}
