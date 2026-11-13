const element=(tag,text,cls)=>Object.assign(document.createElement(tag),{textContent:text||'',className:cls||''});
function sourceLink(cite,label){
 try{const url=new URL(cite.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;const a=element('a',label+' ↗');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';return a}catch{return null}
}
export function renderAnswer(parent,answer={},renderCheck){
 const blocks=(answer.blocks||[]).filter(b=>typeof b?.text==='string'&&b.text.trim());
 if(blocks.length){
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
   parent.append(box);
  });
  for(const gap of answer.gaps||[])if(gap.trim())parent.append(element('p',gap,'coverage-gap'));
 }else{
  const text=typeof answer.text==='string'&&answer.text.trim()?answer.text:'I do not have sufficient authorized data to answer this specific query.';
  parent.append(element('p',text,'answer-text'));
  for(const cite of answer.citations||[]){const a=sourceLink(cite,cite.title);if(a)parent.append(a)}
  for(const check of answer.checks||[])renderCheck?.(parent,check);
 }
 // Operational and audience labels never replace or precede the actual answer.
 if(answer.modelNotice){const notice=element('p',answer.modelNotice,'model-notice');notice.setAttribute('role','status');parent.append(notice)}
 if(answer.style)parent.append(element('small',answer.style,'answer-mode'));
 if(answer.generation)parent.append(element('small',(answer.generation.label||'AI synthesis')+' · '+answer.generation.model+(answer.generation.corrected?' · revised after source review':''),'meta'));
}
