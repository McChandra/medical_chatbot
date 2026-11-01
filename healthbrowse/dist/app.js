import {saveControls,recordTopic} from './personal.js';
import {inspectInput,questionDeck} from './clinical-engine.js';
import {setupCopilot,readSession,guardMessage} from './workspace.js';
import {resolveSearch,findFigures,topicIndex} from './discovery.js';
import {newSubjects,inScopeChoices} from './topic-scope.js';
import {createResearchDesk,checkedPassage,renderCheck} from './research-session.js';
import {authorities} from './authorities.js';
import {sectionNames,remapPassages,sectionSources,correctSpelling,codeQuery} from './medcard.js';
import {medlineIndex} from './medline.js';
import {renderCare} from './care.js';
import {searchEvidence} from './evidence.js';
const $=id=>document.getElementById(id);
function el(tag,txt,cls){let e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e}
function button(text,fn,cls='act'){let b=el('button',text,cls);b.onclick=fn;return b}
const roles=['General reader','Patient','Medical student','Medical professional','Advanced professional'];
const prompts=['Start with the condition overview and the meaning of unfamiliar terms.','Prepare for your visit. Which symptoms or changes should you discuss, and what questions would you like answered?','Trace the mechanism, compare investigations, and discuss a hypothetical case with a supervisor.','Review the guideline population, exclusions, publication date, and local applicability.','Compare study design, reference standards, uncertainty, subgroup effects, and external validity.'];
let taxonomy, depts, assignments;
let catalog,topic='Leukemia',role=0,live=null,controller=null;
const provenance='Document B · inventory dated 31 Oct 2026 · independent clinical review pending';
function linkRecord(r){const box=el('div',undefined,'item'),a=el('a',r.title+' ↗');let u=new URL(r.url);if(!['http:','https:'].includes(u.protocol))return box;a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';box.append(el('div',(r.publisher||'Europe PMC')+' · '+(r.kind||'Publication'),'meta'),a);if(r.detail)box.append(el('p',r.detail));return box}
const filtered=(...k)=>(Object.hasOwn(catalog,topic)?catalog[topic]:[]).filter(r=>k.includes(r.kind));
function panel(parent,text){parent.append(el('div',text,'panel'))}
const lens=[
 ['Learn the basics','How doctors identify it','Read the evidence','Explore the data','Risk and inheritance','What happens in the body','Find local care'],
 ['Understand the condition','Questions about tests','Evidence for a visit','Research resources','What risk means','Symptoms and treatment options','Find a pharmacy or hospital'],
 ['Terminology and courses','Criteria and investigations','Appraise the study design','Models and benchmarks','Prediction and genetics','Mechanisms and therapies','Care directories'],
 ['Definitions and training','Diagnostic evidence','Guidelines and populations','Data access and validity','Risk models and inheritance','Clinical manifestations and management','Verify a care provider'],
 ['Nosology and education','Phenotype and assay limits','Methods and uncertainty','Research datasets and software','Genetic association and calibration','Mechanisms and outcomes','Registry provenance']
];
let passages={},allowedTopics=new Map(),activeQuery='',lookupIndex;
let medlineLookup=medlineIndex({topics:[]}),codes=null,carePanel=null,careTopic=null,unresolved=false;
let feed={topics:[]};
const specialistLenses=new Map();
function medicalRecord(name){return medlineLookup.find(name)}
function textRecords(){
  if(unresolved)return [];
  const record=medicalRecord(topic);
  const extracted=Object.entries(record?.sections||{}).flatMap(([number,value])=>(Array.isArray(value)?value:[value]).filter(t=>typeof t==='string'&&t.trim()).map(text=>({
    deck:Number(number),title:record.title+' · MedlinePlus',text,url:record.url,focus:topic,record:record.url+'#'+number,
    vintage:'MedlinePlus topic feed · '+(feed.feedDate||feed.retrievedAt||'snapshot date unavailable')
  })));
  return [...extracted,...(Object.hasOwn(passages,topic)?passages[topic]:[])];
}
let firstSearch=false,activeResearchReady=false;
function currentContext(){
  if(!topic||!catalog||unresolved)return null;
  const resources=catalog[topic]||[];
  return {topic,role:roles[role],query:activeQuery,department:$('dept').value,
    passages:textRecords(),records:[...resources,...(live?.records||[]),...(codes?.rows||[]).map(r=>({...r,kind:'terminology',title:r.label}))],
    sections:sectionNames.map((_,i)=>sectionSources(i+1,resources,activeQuery,role).map(x=>x.r)),
    visibleTexts:[...$('card').querySelectorAll('.excerpt')].map(e=>e.textContent)};
}
function scopeChoice(input){
  if(!lookupIndex)return [];
  return newSubjects(input,lookupIndex,topic);
}
function switchPrompt(container,input,target,continueSearch){
  container.replaceChildren();const prompt=el('div',undefined,'scope-prompt');prompt.setAttribute('role','status');
  prompt.append(el('p','You’re researching '+topic+'. Switch the workspace to '+target+'?'));
  prompt.append(button('Switch topic',()=>{container.replaceChildren();continueSearch()}),button('Stay on '+topic,()=>{container.replaceChildren();$('notice').textContent='Continuing with '+topic+'.'}));container.append(prompt);prompt.scrollIntoView({block:'nearest'});
}
const copilot=setupCopilot(currentContext,{
  onChat:(c,section)=>recordTopic(c.topic,'chat',section),scopeChoice,confirm:(q,name)=>switchPrompt($('scopeQuestion'),q,name,()=>search(q,name,true)),
  research:q=>research.answer(q),expand:n=>research.select(n),
  show:()=>{$('researchBrief').scrollIntoView({block:'start'})}
});
const research=createResearchDesk(currentContext,(n,focus)=>copilot.activate(n,focus));
document.addEventListener('research-ready',()=>{activeResearchReady=true;if(currentContext())research.sync()});
function reference(parent,title,url){
  if(!url||!/^https?:\/\//.test(url))return;
  const a=el('a',title+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);
}
function renderCodes(body){
  const items=codes?.rows||[];
  const box=el('details',undefined,'resource-list');
  const topicData=medicalRecord(topic);
  if(topicData?.mesh?.length){const mesh=el('p','MedlinePlus indexing terms: ');for(const m of topicData.mesh){reference(mesh,m.label+' ('+m.id+') ','https://id.nlm.nih.gov/mesh/'+m.id)}box.append(mesh)}
  box.append(el('summary','Clinical terminology'+(items.length?' · '+items.length+' candidates':'')));
  box.append(el('p',codes?.message||'Codes are listed with the source classification and exact label. Subtype candidates require confirmation.','meta'));
  for(const item of items){const row=el('p');reference(row,item.system+' '+item.code+' · '+item.label,item.url);box.append(row)}
  if(Object.values(codes?.sourceStatus||{}).includes('unavailable'))box.append(el('p','An ICD source was unavailable for this lookup.','meta'));
  box.append(el('p',codes?.snomedStatus||'SNOMED CT lookup requires licensed terminology access.','meta'));body.append(box);
}
function render(){
  const deck=$('card'),opened=new Set([...deck.querySelectorAll('details[open][data-section]')].map(d=>d.dataset.section));
  deck.replaceChildren();
  const header=el('div',undefined,'cardhead');header.append(el('span','HEALTHBROWSE / MEDCARD','eyebrow'),el('h2',unresolved?'Topic not resolved':topic),el('p','7 standard sections · '+roles[role],'deck-subtitle'));
  if(!unresolved && assignments[topic])header.append(el('span',assignments[topic].map(i=>depts[i]).join(' · '),'badge'));
  if(!unresolved){
    const sources=textRecords(),intro=sources.find(p=>p.deck===1);
    const overview=el('div',undefined,'overview-note');overview.append(el('h3','Your question at a glance'));
    const section=questionDeck(activeQuery);
    const selected=section && section!==1?sources.find(p=>p.deck===section):null;
    for(const passage of [intro,selected].filter(Boolean)){
      const claim=checkedPassage(topic,sources,passage);
      if(claim){overview.append(el('p',claim.text));reference(overview,claim.citation.title,claim.citation.url);renderCheck(overview,claim)}
    }
    if(!intro&&!selected)overview.append(el('p','A sourced overview is unavailable. Check the publication and terminology records below.'));
    header.append(overview,saveControls(topic));
    const guide=el('details',undefined,'source-directory');guide.append(el('summary','Source guide · 10 medical and public-health organizations'),el('p','These organizations have different responsibilities. A publisher citation does not mean it reviewed or certified this HealthBrowse response.'));
    for(const a of authorities){const item=el('p');reference(item,a.name,a.url);item.append(document.createTextNode(' · '+a.scope));guide.append(item)}header.append(guide)
  }
  header.append(el('p','Publisher sources are linked. Independent clinical review is pending.','meta'));deck.append(header);
  const grid=el('div',undefined,'deck-grid');deck.append(grid);$('roleHint').textContent=prompts[role];
  $('clinicalNotice').textContent='HealthBrowse provides educational information. Consult a licensed healthcare provider for individual care.';
  const texts=textRecords(),resources=unresolved?[]:catalog[topic]||[];
  sectionNames.forEach((label,i)=>{
    const number=i+1,box=el('section',undefined,'med-section');box.dataset.number=String(number);
    const title=el('div',undefined,'sectionTitle');title.append(el('span',String(number).padStart(2,'0'),'num'),el('h3',label));box.append(title,el('p',lens[role][i],'meta'));
    const rows=texts.filter(r=>r.deck===number);
    const ranked=sectionSources(number,resources,activeQuery,role);
    const officialLink=medicalRecord(topic)?.links?.[number];
    if(unresolved){box.append(el('p','Choose a recognized disease or verified classification code to populate this section.'));if(number===1 && codes)renderCodes(box);grid.append(box);return}
    const preferred=rows.find(r=>medicalRecord(topic)?.url===r.url)||rows[0];
    const claim=checkedPassage(topic,texts,preferred);
    if(claim){
      box.append(el('p',claim.text,'excerpt'));
      reference(box,preferred.title,preferred.sourceRecord||preferred.url);box.append(el('p',preferred.vintage||'Publication date unverified.','meta'));
      if(preferred.attribution){const credit=el('p',preferred.attribution+' ','meta');reference(credit,'License',preferred.license);box.append(credit)}
    }
    const fallback=['No verified definition or degree program has been indexed for this topic.','No reviewed diagnostic passage is available.','Publications are ranked by title relevance, indexed evidence type, and date.','Dataset licenses and access restrictions are set by each repository.','A screening result or genetic association alone does not establish a diagnosis.','No verified symptom or treatment passage is available in this index.','Choose a location to look up care. Directory entries do not establish pharmacy stock.'];
    if(!claim)box.append(el('p',fallback[i]));
    if(claim)renderCheck(box,claim);
    const drawer=el('details',undefined,'research-drawer');drawer.dataset.section=String(number);drawer.open=opened.has(String(number));drawer.append(el('summary','Sources and further reading'));
    const cardBox=box;
    if(officialLink){const row=el('p');reference(row,officialLink.title+' · '+officialLink.publisher,officialLink.url);drawer.append(row)}
    if(number===1)renderCodes(drawer);
    if(number===3){drawer.append(el('p',live?.message||'Search or refresh to retrieve current publications.','meta'),button('Refresh publication index',runLive));if(live?.records?.length){const rankedList=el('details');rankedList.append(el('summary','Additional indexed publications ('+live.records.length+')'));live.records.forEach(r=>rankedList.append(linkRecord(r)));drawer.append(rankedList,button('Export search record',download))}}
    if(number===7){
      if(careTopic!==topic||!carePanel){careTopic=topic;carePanel=el('div');renderCare(carePanel,topic,resources.filter(r=>r.kind==='facility'))}
      drawer.append(carePanel);
    }else{
      if(number===1 && ranked.some(item=>item.r.kind==='education'))drawer.append(el('p','Education listings are from the supplied catalog. Check current dates and entry requirements with the institution.','meta'));
      const display=ranked.slice(0,3);
      for(const item of display){const link=linkRecord(item.r);link.append(el('small',item.why,'meta'));drawer.append(link)}
      if(ranked.length>3){const more=el('details',undefined,'resource-list');more.dataset.section=String(number);more.open=opened.has(String(number));more.append(el('summary','More source records ('+(ranked.length-3)+')'));ranked.slice(3).forEach(item=>more.append(linkRecord(item.r)));drawer.append(more)}
      if(!ranked.length && number===4){for(const [title,url] of [['NCBI GEO datasets','https://www.ncbi.nlm.nih.gov/gds/?term='],['Hugging Face datasets','https://huggingface.co/datasets?search='],['GitHub research repositories','https://github.com/search?type=repositories&q=']]){const row=el('p');reference(row,'Search '+title,url+encodeURIComponent(topic));drawer.append(row)}}
    }
    cardBox.append(drawer,button('Explore Section '+number+' in research mode',()=>research.select(number)));grid.append(cardBox);
  });
  $('copilot').hidden=unresolved;if(!unresolved){copilot.sync();if(activeResearchReady || !$('welcome').open)research.sync()}else research.reset();
}
let searchRequest;
function choose(t){search(t)}
function resultGroup(label){
  const group=el('details'),summary=el('summary',label),body=el('div');
  group.open=false;group.append(summary,body);$('resultsBody').append(group);
  return body;
}
function extractCondition(input){
  const value=input.trim().replace(/^what (?:is|are) (?:the )?/i,'').replace(/[?!.]+$/,'').trim();
  return /^[A-Za-z][A-Za-z -]{2,65}$/.test(value)&&value.split(/\s+/).length<=6?value:null;
}
async function terminology(term,signal){
  try{const res=await fetch('/api/terminology?term='+encodeURIComponent(term),{signal});if(!res.ok)throw Error();return await res.json()}
  catch{return {rows:[],message:'Terminology lookup unavailable. No code mapping has been confirmed.'}}
}
async function search(input,chosenTopic,confirmed=false){
  if(!confirmed && firstSearch && !unresolved && inspectInput(input)==='ok'){
    const matches=scopeChoice(input);
    const unknown=!resolveSearch(correctSpelling(input),lookupIndex).choices.length&&!/\b(it|its|this condition|this disease)\b/i.test(input);
    if(matches.length || unknown || (codeQuery(input) && input!==activeQuery)){
      switchPrompt($('searchSwitch'),input,matches.join(' / ')||input,()=>search(input,chosenTopic,true));return;
    }
  }
  $('searchSwitch').replaceChildren();$('scopeQuestion').replaceChildren();

  searchRequest?.abort(); controller?.abort();controller=null;
  const request=new AbortController();searchRequest=request;
  const explicitCode=/^(?:what is |look up |search for )?(?:icd|snomed)/i.test(input.trim()) && codeQuery(input);
  const status=explicitCode?'ok':inspectInput(input);
  if(status!=='ok'){
    $('query').value='';$('notice').textContent=guardMessage(status);$('results').hidden=true;
    if(status==='emergency'){$('card').hidden=true;$('copilot').hidden=true;}
    return;
  }
  $('card').hidden=false;$('copilot').hidden=false;
  const corrected=correctSpelling(input),code=codeQuery(input);
  let {choices,keywords}=resolveSearch(corrected,lookupIndex);choices=inScopeChoices(choices);
  if(chosenTopic && choices.includes(chosenTopic))choices=[chosenTopic];
  if(!choices.length && activeQuery && !unresolved && /\b(it|its|this condition|this disease)\b/i.test(input) && questionDeck(input))choices=[topic];
  let exact=allowedTopics.get(keywords.toLowerCase()),codeResult=null;
  if(code || (!choices.length && !exact)){
    const phrase=code || extractCondition(corrected);
    if(phrase){
      $('notice').textContent='Checking official terminology…';
      codeResult=await terminology(phrase,request.signal);
      if(searchRequest!==request)return;
      if(codeResult.canonical){
        choices=[];exact=codeResult.canonical;
        const linked=(codeResult.education||[]).filter(r=>medicalRecord(r.title)?.url===r.url);
        if(linked.length===1){
          const source=Object.keys(catalog).find(name=>medicalRecord(name)?.url===linked[0].url);
          exact=source||linked[0].title;
          codeResult.message='MedlinePlus Connect links this code to the educational topic '+exact+'. Its exact classification label is listed below.';
        }
      }
    }
    if(!exact&&!choices.length){
      unresolved=true;topic='';codes=codeResult;live=null;activeQuery='';
      $('notice').textContent=codeResult?.message||(code?.toUpperCase().startsWith('SNOMED')?codeResult?.snomedStatus:null)||'No exact disease or code was verified. Choose a focus area or enter a specific disease name.';
      $('results').hidden=true;render();return;
    }
  }
  unresolved=false;
  const results=$('results');results.hidden=false;$('resultsBody').replaceChildren();
  $('query').value=choices.join(' / ')||exact;$('resultTitle').textContent='Research sources for '+$('query').value;
  $('resultTitle').focus({preventScroll:true});
  $('notice').textContent=corrected!==input?'Showing results for “'+corrected+'”.':'';
  if(choices.length>1){
    unresolved=true;codes=null;live=null;topic='';activeQuery='';render();
    $('notice').textContent='Several conditions matched. Select one to populate the seven sections.';results.scrollIntoView();panel($('resultsBody'),'Choose a condition to narrow the search.');
    choices.forEach(name=>$('resultsBody').append(button(name,()=>search(input,name,true))));return;
  }
  const subject=choices[0]||exact,match=Object.hasOwn(catalog,subject)?subject:null;
  codes=codeResult;activeQuery=input;topic=subject;void recordTopic(subject,'search',questionDeck(input)||1);firstSearch=true;activeResearchReady=true;live={message:'Searching Europe PMC…'};
  $('card').querySelectorAll('details[open]').forEach(d=>d.open=false);
  render();
  const target=questionDeck(input);
  if(target)copilot.activate(target);
  $('query').value=input;
  $('card').focus({preventScroll:true});$('card').scrollIntoView({block:'start'});
  if(match){
    const local=resultGroup('Medical sources · '+match);
    const sources=filtered('core','guideline').slice(0,3);
    sources.forEach(r=>local.append(linkRecord(r)));local.append(button('Open full MedCard',()=>$('card').scrollIntoView()));
  }else panel($('resultsBody'),'Searching published research beyond the 20-topic MedCard catalog.');
  const papers=resultGroup('Additional indexed publications'),figures=resultGroup('Published figures');
  const timeout=setTimeout(()=>request.abort(),20000);
  async function fill(container,load,empty){
    container.replaceChildren(el('p','Searching Europe PMC…','meta'));
    try{
      const rows=await load();
      if(searchRequest!==request)return;
      container.replaceChildren();
      if(rows.length)rows.forEach(r=>container.append(linkRecord(r)));else panel(container,empty);
    }catch{
      if(searchRequest!==request)return;
      if(container===papers && !controller){live={message:'Publication search unavailable. Retry retrieval or inspect the source inventory.'};render()}
      container.replaceChildren();panel(container,'This source did not respond successfully.');
      container.append(button('Retry search',()=>search(input)));
    }
  }
  await Promise.all([
    codeResult?Promise.resolve():terminology(subject,request.signal).then(result=>{if(searchRequest===request){codes=result;render()}}),
    fill(papers,async()=>{
      const response=await searchEvidence(subject,request.signal,!match);
      if(searchRequest===request && !controller){live={...response,message:response.records.length+' publications retrieved '+response.queriedAt};render()}
      return response.records;
    },'No publications met the topic and evidence-type filters. Try a broader medical term.'),
    fill(figures,()=>findFigures(match?(taxonomy.entities.find(e=>e.name===match).aliases[0]||match):subject,request.signal),'No figures were found in the sampled open-access articles.')
  ]);
  clearTimeout(timeout);
}
function departments(){const wrap=$('deptTopics');wrap.replaceChildren();if(!$('dept').value)return;const matches=Object.keys(assignments).filter(t=>assignments[t].includes(depts.indexOf($('dept').value)));if(!matches.length)wrap.append(el('p','This department has no indexed condition records yet.'));matches.forEach(t=>wrap.append(button(t,()=>{choose(t)})))}
async function runLive(){controller?.abort();const c=new AbortController();controller=c;live={message:'Searching Europe PMC…'};render();const timer=setTimeout(()=>c.abort(),15000);try{const result=await searchEvidence(topic,c.signal,!Object.hasOwn(catalog,topic));if(controller!==c)return;live={...result,message:result.records.length+' qualifying records · metadata retrieved '+result.queriedAt+' · clinical appraisal pending.'}}catch{if(controller!==c)return;live={message:'The live search could not be completed. The cataloged reading list remains available. Retry the search or open the publisher directly.'}}finally{clearTimeout(timer)}render()}
function download(){const url=URL.createObjectURL(new Blob([JSON.stringify({topic,source:'Europe PMC',...live},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='healthbrowse-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
for(let i=0;i<20;i++){let p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M 0 '+(95-i*2)+' C 42 '+(125-i*4)+' 62 '+(8+i)+' 100 '+(18+i*3)+' S 159 '+(145-i*3)+' 210 '+(80-i*2));$('waves').append(p)}
try{const res=await fetch('catalog.json');if(!res.ok)throw Error();catalog=await res.json();const taxResponse=await fetch('taxonomy.json');if(!taxResponse.ok)throw Error();taxonomy=await taxResponse.json();
  const [sourceData,topicData]=await Promise.all([fetch('clinical-passages.json'),fetch('topic-list.json')]);
  passages=remapPassages(await sourceData.json());allowedTopics=new Map((await topicData.json()).map(t=>[t.toLowerCase(),t]));
  allowedTopics.set('asthma','Asthma');try{const response=await fetch('medline-topics.json');if(response.ok)feed=await response.json()}catch{}
  medlineLookup=medlineIndex(feed);
  for(const item of feed.topics)if(!allowedTopics.has(item.title.toLowerCase()))allowedTopics.set(item.title.toLowerCase(),item.title);
  lookupIndex=topicIndex([...feed.topics.map(t=>({name:t.title,aliases:(t.aliases||[]).filter(a=>medlineLookup.find(a)===t)})),...taxonomy.entities],allowedTopics.values());
  Object.keys(catalog).forEach(name=>$('focusTopics').append(button(name,()=>search(name))));

  Promise.all([3,4,5].map(async tier=>{
    try{const result=await fetch('/api/clinical-lens?tier='+tier);
      if(result.ok)specialistLenses.set(tier,(await result.json()).lenses);
    }catch{} // Built-in reading prompts also work when offline.
  })).then(()=>{if(catalog&&assignments)render()});
  const last=readSession('hb-context',{});if(Object.hasOwn(passages,last.topic)||Object.hasOwn(catalog,last.topic)||allowedTopics.has(String(last.topic).toLowerCase()))topic=last.topic;
  activeQuery=topic;
depts=taxonomy.departments.map(d=>d.name);assignments=Object.fromEntries(taxonomy.entities.map(e=>[e.name,e.departmentIds.map(id=>taxonomy.departments.findIndex(d=>d.id===id))]));Object.keys(catalog).forEach(t=>$('topics').append(new Option(t)));roles.forEach(r=>$('role').append(new Option(r)));role=Math.max(0,roles.indexOf(readSession('hb-reader','')));$('role').selectedIndex=role;$('dept').append(new Option('Select a specialty',''));taxonomy.departments.forEach(d=>$('dept').append(new Option(d.name,d.name)));$('find').onsubmit=e=>{e.preventDefault();search($('query').value.trim())};document.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>choose(b.dataset.topic));$('role').onchange=()=>{role=$('role').selectedIndex;try{sessionStorage.setItem('hb-reader',JSON.stringify(roles[role]))}catch{}render()};$('dept').onchange=departments;departments();render();
const params=new URLSearchParams(location.search);
const requested=params.get('topic'),section=Number(params.get('section'));
if(requested && (Object.hasOwn(catalog,requested)||allowedTopics.has(requested.toLowerCase()))){
  await search(requested,null,true);if(Number.isInteger(section)&&section>=1&&section<=7)research.select(section);
}
}catch{$('notice').textContent='The research catalog could not be loaded. Refresh to retry.'}
