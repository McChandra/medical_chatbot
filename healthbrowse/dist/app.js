import {readingProfile,readingRoles,normalizeReadingRole} from './reading-profiles.js';
import {searchUI} from './search-startup.js';
import {requestSynthesis,synthesisKey} from './model-client.js';
import {renderAnswer} from './answer-view.js';
import {generalMode,deckCount,searchAnswer,domainAnswer,fetchJSON} from './search-experience.js';
import {setupBuddy} from './buddy.js';
import {domains,frameworkVersion,frameworkReferences,professionalRole,roleLabel,domainTitle,medlinePassages,orderedPassages,sectionLinks} from './disease-framework.js';
import {createChatHistory} from './chat-history.js';
import {saveControls,recordTopic} from './personal.js';
import {questionDeck} from './clinical-engine.js';
import {prepareQuery} from './query-input.js';
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
const roles=readingRoles;
let taxonomy, depts, assignments;
let catalog,topic='Leukemia',role=0,live=null,controller=null;
const provenance='Document B · inventory dated 31 Oct 2026 · independent clinical review pending';
function linkRecord(r){const box=el('div',undefined,'item'),a=el('a',r.title+' ↗');let u=new URL(r.url);if(!['http:','https:'].includes(u.protocol))return box;a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';box.append(el('div',(r.publisher||'Europe PMC')+' · '+(r.kind||'Publication'),'meta'),a);if(r.detail)box.append(el('p',r.detail));return box}
const filtered=(...k)=>(Object.hasOwn(catalog,topic)?catalog[topic]:[]).filter(r=>k.includes(r.kind));
function panel(parent,text){parent.append(el('div',text,'panel'))}
let passages={},allowedTopics=new Map(),activeQuery='',lookupIndex,queryNotice='';
let medlineLookup=medlineIndex({topics:[]}),codes=null,carePanel=null,careTopic=null,unresolved=false;
let feed={topics:[]};
function medicalRecord(name){return medlineLookup.find(name)}
function textRecords(){
  if(unresolved)return [];
  const record=medicalRecord(topic);
  return orderedPassages([...medlinePassages(record,topic,feed),...(Object.hasOwn(passages,topic)?passages[topic]:[])],role,topic);
}
let activeResearchReady=false;
let synthesis=null,synthesisController=null,aiRequested=false;
function refreshSynthesis(context){
 const key=synthesisKey(context);if(!context||!aiRequested||synthesis?.key===key)return;
 synthesisController?.abort();const controller=new AbortController();synthesisController=controller;synthesis={key,status:'loading'};
 void requestSynthesis(context,context.query||context.topic,{signal:controller.signal}).then(result=>{
  if(controller!==synthesisController||key!==synthesisKey(currentContext()))return;
  synthesis={key,...result};render();
 }).catch(()=>{});
}
function currentContext(){
  if(!topic||!catalog||unresolved)return null;
  const resources=catalog[topic]||[];
  const currentAnswer=synthesis?.status==='generated'&&synthesis.key===synthesisKey({topic,role:roles[role],query:activeQuery});
  return {topic,frameworkVersion,role:roles[role],query:activeQuery,aliases:[...(medicalRecord(topic)?.aliases||[]),...(taxonomy?.entities.find(e=>e.name===topic)?.aliases||[])],
    answerSummary:currentAnswer?synthesis.answer.text:'',deckSummaries:currentAnswer?synthesis.decks.map(d=>d.text):[],
    passages:textRecords(),records:[...resources,...(live?.records||[]),...(codes?.rows||[]).map(r=>({...r,kind:'terminology',title:r.label}))],
    sections:sectionNames.map((_,i)=>sectionSources(i+1,resources,activeQuery,role).map(x=>x.r)),
    visibleTexts:[...$('card').querySelectorAll('.excerpt')].filter(e=>e.getClientRects().length).map(e=>e.textContent)};
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
const buddy=setupBuddy(currentContext);
const chats=createChatHistory(currentContext);
const copilot=setupCopilot(currentContext,{
  onChat:(c,section)=>recordTopic(c.topic,'chat',section),onTurn:turn=>chats.saveTurn(turn),scopeChoice,confirm:(q,name)=>switchPrompt($('scopeQuestion'),q,name,()=>search(q,name,true)),
  research:q=>{if(!/\b(papers?|publications?|studies|trials?|grants?|funding|institutions?|literature|systematic reviews?)\b/i.test(q))return null;research.sync();return research.answer(q)},expand:n=>openDomain(n),
  show:()=>{$('researchBrief').scrollIntoView({block:'start'})}
});
const research=createResearchDesk(currentContext,(n,focus)=>copilot.activate(n,focus));
chats.setHandlers({newChat:()=>copilot.clear(),restore:async data=>{
  queryNotice='';
  role=Math.max(0,roles.indexOf(normalizeReadingRole(data.chat.readingMode)));$('role').selectedIndex=role;
  if(Object.hasOwn(catalog,data.chat.topic)||allowedTopics.has(data.chat.topic.toLowerCase())){
    topic=data.chat.topic;activeQuery=topic;unresolved=false;live=null;codes=null;$('query').value=topic;render();
  }else await search(data.chat.topic,null,true);
  copilot.restore(data.turns);
}});
document.addEventListener('research-ready',()=>{activeResearchReady=true});
$('buddyResearch').addEventListener('toggle',()=>{if($('buddyResearch').open&&currentContext())research.sync()});
function openDomain(n){buddy.show(document.activeElement);copilot.activate(n);copilot.askDomain(n)}
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
  const general=generalMode(role),count=deckCount(role);
  const profile=readingProfile(role);document.body.classList.add('buddy-enabled');$('deskTitle').textContent=role===0?'Understand your health':'Clinical research desk';$('deskIntro').textContent='Ask a question, explore six clinical areas, and go deeper with your buddy.';$('copilot-heading').textContent='HealthBrowse buddy';$('card').setAttribute('aria-label','Six-deck medical response');
  const deck=$('card'),opened=new Set([...deck.querySelectorAll('details[open][data-section]')].map(d=>d.dataset.section));
  deck.replaceChildren();
  const header=el('div',undefined,'cardhead');header.append(el('span','HEALTHBROWSE / MEDCARD','eyebrow'),el('h2',unresolved?'Topic not resolved':topic),el('p',count+' areas to explore · '+roleLabel(roles[role]),'deck-subtitle'));
  if(!unresolved && assignments[topic])header.append(el('span',assignments[topic].map(i=>depts[i]).join(' · '),'badge'));
  if(unresolved){
    const feedback=el('div',undefined,'overview-note search-answer');
    feedback.append(el('h3','Let’s clarify your question'),el('p',activeQuery||$('query').value,'answer-question'),el('p','I could not confidently match this to one medical topic. Enter a disease name, choose a focus area above, or select a matching topic when options are shown.'));
    header.append(feedback);
  }
  if(!unresolved){
    const sources=textRecords(),context={...currentContext(),topic,role:roles[role],aliases:[...(medicalRecord(topic)?.aliases||[]),...(taxonomy.entities.find(e=>e.name===topic)?.aliases||[])],passages:sources,records:currentContext()?.records||[]};
    const overview=el('div',undefined,'overview-note search-answer');overview.append(el('h3','Your answer'),el('p',activeQuery||topic,'answer-question'));
    if(queryNotice)overview.append(el('p',queryNotice,'query-interpretation'));
    refreshSynthesis(context);
    const direct=synthesis?.key===synthesisKey(context)&&synthesis.status==='generated'?synthesis.answer:searchAnswer(context,activeQuery||topic);
    direct.modelNotice=synthesis?.key===synthesisKey(context)?(synthesis.status==='loading'?'Preparing an answer and six decks from cited sources… Source excerpts are available while you wait.':synthesis.message||''):'';
    renderAnswer(overview,direct,renderCheck);
    if(!direct.supported){const intro=checkedPassage(topic,sources,sources.find(p=>p.overview));if(intro){const basic=el('details');basic.append(el('summary','About '+topic),el('p',intro.text));renderCheck(basic,intro);overview.append(basic)}}
    header.append(overview,saveControls(topic));
    const framework=el('details',undefined,'source-directory');framework.append(el('summary','About these six areas'),el('p','Six clinical domains plus research resources. These references inform the organization; they do not validate this application or certify its answers.'));for(const ref of frameworkReferences){const row=el('p');reference(row,ref.title,ref.url);framework.append(row)}header.append(framework);
    const guide=el('details',undefined,'source-directory');guide.append(el('summary','Source guide · 10 medical and public-health organizations'),el('p','These organizations have different responsibilities. A publisher citation does not mean it reviewed or certified this HealthBrowse response.'));
    for(const a of authorities){const item=el('p');reference(item,a.name,a.url);item.append(document.createTextNode(' · '+a.scope));guide.append(item)}header.append(guide)
  }
  header.append(el('p','Publisher sources are linked. Independent clinical review is pending.','meta'));deck.append(header);
  const grid=el('div',undefined,'deck-grid');deck.append(grid);$('roleHint').textContent=profile.guide;
  $('clinicalNotice').textContent=professionalRole(role)?'Professional research reference. Check current guidelines, patient context and local protocols before clinical use. This tool is not clinically validated.':'HealthBrowse provides general education, not a diagnosis or an individual treatment plan. Discuss care with a licensed healthcare professional.';
  const texts=textRecords(),resources=unresolved?[]:catalog[topic]||[];
  sectionNames.forEach((label,i)=>{
    const number=i+1,extra=number===7,box=el('section',undefined,extra?'research-resource':'med-section');box.dataset.number=String(number);
    const title=el('div',undefined,'sectionTitle');title.append(el('span',String(number).padStart(2,'0'),'num'),el('h3',domainTitle(number,role)));box.append(title,el('p',professionalRole(role)?domains[i].professional:domains[i].scope,'meta'));if(role===0)box.append(el('small',label,'domain-label'));
    const rows=texts.filter(r=>r.deck===number&&!r.overview);
    const ranked=sectionSources(number,resources,activeQuery,role);
    const officialLinks=sectionLinks(medicalRecord(topic),number);
    if(unresolved){if(!extra){box.append(el('p','Search for a medical topic to explore this area.'));if(number===1&&codes)renderCodes(box);grid.append(box)}return}
    const preferred=rows.find(r=>checkedPassage(topic,texts,r));
    const claim=checkedPassage(topic,texts,preferred);
    if(number<7){const generated=synthesis?.key===synthesisKey(currentContext())&&synthesis.status==='generated'?synthesis.decks.find(d=>d.id===number):null;const response=generated||domainAnswer(currentContext(),number,{detail:true});renderAnswer(box,response,renderCheck)}else if(claim){box.append(el('p',claim.text,'excerpt'));renderCheck(box,claim)}
    const drawer=el('details',undefined,'research-drawer');drawer.dataset.section=String(number);drawer.open=opened.has(String(number));drawer.append(el('summary','Sources and further reading'));
    const cardBox=box;
    for(const officialLink of officialLinks){const row=el('p');reference(row,officialLink.title+' · '+officialLink.publisher,officialLink.url);drawer.append(row)}
    const morePassages=rows.filter(p=>p!==preferred).slice(0,professionalRole(role)?3:1);for(const p of morePassages){const check=checkedPassage(topic,texts,p);if(check){drawer.append(el('p',check.text,'excerpt'),el('small',p.vintage||'Source date unverified.','meta'));renderCheck(drawer,check)}}
    if(number===3)renderCodes(drawer);
    if(number===7){drawer.append(el('p',live?.message||'Search or refresh to retrieve current publications.','meta'),button('Refresh publication index',runLive));if(live?.records?.length){const rankedList=el('details');rankedList.append(el('summary','Additional indexed publications ('+live.records.length+')'));live.records.forEach(r=>rankedList.append(linkRecord(r)));drawer.append(rankedList,button('Export search record',download))}}
    if(number===7){
      if(careTopic!==topic||!carePanel){careTopic=topic;carePanel=el('div');renderCare(carePanel,topic,resources.filter(r=>r.kind==='facility'))}
      drawer.append(carePanel);
    }
    {
      if(number===7 && ranked.some(item=>item.r.kind==='education'))drawer.append(el('p','Education listings are from the supplied catalog. Check current dates and entry requirements with the institution.','meta'));
      const display=ranked.slice(0,3);
      for(const item of display){const link=linkRecord(item.r);link.append(el('small',item.why,'meta'));drawer.append(link)}
      if(ranked.length>3){const more=el('details',undefined,'resource-list');more.dataset.section=String(number);more.open=opened.has(String(number));more.append(el('summary','More source records ('+(ranked.length-3)+')'));ranked.slice(3).forEach(item=>more.append(linkRecord(item.r)));drawer.append(more)}
      if(!ranked.length && number===7){for(const [title,url] of [['NCBI GEO datasets','https://www.ncbi.nlm.nih.gov/gds/?term='],['Hugging Face datasets','https://huggingface.co/datasets?search='],['GitHub research repositories','https://github.com/search?type=repositories&q=']]){const row=el('p');reference(row,'Search '+title,url+encodeURIComponent(topic));drawer.append(row)}}
    }
    cardBox.append(drawer);if(extra){const shelf=el('details',undefined,'resource-shelf');shelf.append(el('summary','Research papers, datasets & care resources'),cardBox);deck.append(shelf)}else{cardBox.append(button('Ask buddy about this',()=>openDomain(number)));grid.append(cardBox)}
  });
  buddy.sync(true,!unresolved);if(!unresolved){copilot.sync();if($('buddyResearch').open)research.sync()}else research.reset();
}
let searchRequest;
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
  try{return await fetchJSON('/api/terminology?term='+encodeURIComponent(term),{signal,timeout:7000})}
  catch{return {rows:[],message:'Terminology lookup unavailable. Try a disease name or choose one of the listed topics.'}}
}
let searchSequence=0;
async function search(input,chosenTopic,confirmed=false){
  const query=String(input||'').trim();if(!query)return;
  const sequence=++searchSequence;
  $('searchSubmit').textContent='Searching…';$('find').setAttribute('aria-busy','true');$('notice').textContent='Looking for a sourced answer…';
  try{await performSearch(query,chosenTopic,confirmed)}catch{if(sequence===searchSequence){$('notice').textContent='This search could not finish. Your question is still in the search box. Please try again.';}}
  finally{if(sequence===searchSequence){$('searchSubmit').textContent='Search ↗';$('find').setAttribute('aria-busy','false')}}
}
async function performSearch(input,chosenTopic,confirmed=false){
  synthesisController?.abort();synthesisController=null;synthesis=null;aiRequested=false;
  queryNotice='';
  $('searchSwitch').replaceChildren();$('scopeQuestion').replaceChildren();

  searchRequest?.abort(); controller?.abort();controller=null;
  const request=new AbortController();searchRequest=request;
  const explicitCode=/^(?:what is |look up |search for )?(?:icd|snomed)/i.test(input.trim()) && codeQuery(input);
  const prepared=explicitCode?{status:'ok',query:input}:prepareQuery(input),status=prepared.status;
  if(status!=='ok'){
    $('notice').textContent=guardMessage(status);$('results').hidden=true;$('resultsBody').replaceChildren();
    topic='';unresolved=true;activeQuery='';live=null;codes=null;buddy.sync(true,false);
    const message=el('div',undefined,'overview-note search-answer');
    message.setAttribute('role','alert');message.append(el('h2',status==='emergency'?'Get urgent help now':'Remove identifying details to continue'),el('p',guardMessage(status)));
    if(status!=='emergency')message.append(button('Edit question',()=>{$('query').focus();$('query').scrollIntoView({block:'center'})}));
    $('card').hidden=false;$('card').replaceChildren(message);$('card').focus({preventScroll:true});$('card').scrollIntoView({block:'start'});
    return;
  }
  input=prepared.query;queryNotice=prepared.notice||'';
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
      unresolved=true;topic='';codes=codeResult;live=null;activeQuery=input;
      $('notice').textContent=codeResult?.message||(code?.toUpperCase().startsWith('SNOMED')?codeResult?.snomedStatus:null)||'No exact disease or code was verified. Choose a focus area or enter a specific disease name.';
      $('results').hidden=true;render();$('card').focus({preventScroll:true});$('card').scrollIntoView({block:'start',behavior:'smooth'});return;
    }
  }
  unresolved=false;
  const results=$('results');results.hidden=false;$('resultsBody').replaceChildren();
  $('query').value=choices.join(' / ')||exact;$('resultTitle').textContent='Research sources for '+$('query').value;
  $('resultTitle').focus({preventScroll:true});
  $('notice').textContent=corrected!==input?'Showing results for “'+corrected+'”.':'';
  if(choices.length>1){
    unresolved=true;codes=null;live=null;topic='';activeQuery='';render();
    $('notice').textContent='Several topics matched. Choose one so I can give a focused answer.';results.scrollIntoView();panel($('resultsBody'),'Choose a condition to narrow the search.');
    choices.forEach(name=>$('resultsBody').append(button(name,()=>search(input,name,true))));return;
  }
  const subject=choices[0]||exact,match=Object.hasOwn(catalog,subject)?subject:null;
  aiRequested=true;
  codes=codeResult;activeQuery=input;topic=subject;void recordTopic(subject,'search',questionDeck(input)||1);activeResearchReady=true;live={message:'Searching Europe PMC…'};
  $('card').querySelectorAll('details[open]').forEach(d=>d.open=false);
  render();
  $('notice').textContent=(corrected!==input?'Understood as “'+corrected+'”. ':'')+'Your answer and '+deckCount(role)+' areas are ready below.';
  const target=questionDeck(corrected);
  if(target)copilot.activate(target);
  $('query').value=input;
  $('card').focus({preventScroll:true});$('card').scrollIntoView({block:'start'});
  if(match){
    const local=resultGroup('Medical sources · '+match);
    const sources=filtered('core','guideline').slice(0,3);
    sources.forEach(r=>local.append(linkRecord(r)));local.append(button('Open full MedCard',()=>$('card').scrollIntoView()));
  }else panel($('resultsBody'),'Searching published research beyond the 20-topic MedCard catalog.');
  const papers=resultGroup('Additional indexed publications'),figures=resultGroup('Published figures');
  $('searchSubmit').textContent='Search ↗';$('find').setAttribute('aria-busy','false');
  const timeout=setTimeout(()=>request.abort(),12000);
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
    fill(figures,()=>findFigures(match?(taxonomy.entities.find(e=>e.name===match)?.aliases?.[0]||match):subject,request.signal),'No figures were found in the sampled open-access articles.')
  ]);
  clearTimeout(timeout);
}
async function runLive(){controller?.abort();const c=new AbortController();controller=c;live={message:'Searching Europe PMC…'};render();const timer=setTimeout(()=>c.abort(),15000);try{const result=await searchEvidence(topic,c.signal,!Object.hasOwn(catalog,topic));if(controller!==c)return;live={...result,message:result.records.length+' qualifying records · metadata retrieved '+result.queriedAt+' · clinical appraisal pending.'}}catch{if(controller!==c)return;live={message:'The live search could not be completed. The cataloged reading list remains available. Retry the search or open the publisher directly.'}}finally{clearTimeout(timer)}render()}
function download(){const url=URL.createObjectURL(new Blob([JSON.stringify({topic,source:'Europe PMC',...live},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='healthbrowse-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
for(let i=0;i<20;i++){let p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M 0 '+(95-i*2)+' C 42 '+(125-i*4)+' 62 '+(8+i)+' 100 '+(18+i*3)+' S 159 '+(145-i*3)+' 210 '+(80-i*2));$('waves').append(p)}
try{
  const files=['catalog.json','taxonomy.json','clinical-passages.json','topic-list.json','medline-topics.json'];
  const loaded=await Promise.allSettled(files.map(file=>fetchJSON(file)));
  const content=(i,fallback)=>loaded[i].status==='fulfilled'?loaded[i].value:fallback;
  catalog=content(0,{});taxonomy=content(1,{departments:[],entities:[]});passages=remapPassages(content(2,{}));allowedTopics=new Map(content(3,[]).map(t=>[t.toLowerCase(),t]));feed=content(4,{topics:[]});
  if(!feed.topics.length&&!Object.keys(passages).length)throw Error('Medical topic content is unavailable.');
  allowedTopics.set('asthma','Asthma');
  medlineLookup=medlineIndex(feed);
  for(const item of feed.topics)if(!allowedTopics.has(item.title.toLowerCase()))allowedTopics.set(item.title.toLowerCase(),item.title);
  lookupIndex=topicIndex([...feed.topics.map(t=>({name:t.title,aliases:(t.aliases||[]).filter(a=>medlineLookup.find(a)===t)})),...taxonomy.entities],allowedTopics.values());
  Object.keys(catalog).forEach(name=>$('focusTopics').append(button(name,()=>search(name))));

  const last=readSession('hb-context',{});if(Object.hasOwn(passages,last.topic)||Object.hasOwn(catalog,last.topic)||allowedTopics.has(String(last.topic).toLowerCase()))topic=last.topic;
  activeQuery=topic;
depts=taxonomy.departments.map(d=>d.name);assignments=Object.fromEntries(taxonomy.entities.map(e=>[e.name,e.departmentIds.map(id=>taxonomy.departments.findIndex(d=>d.id===id))]));Object.keys(catalog).forEach(t=>$('topics').append(new Option(t)));roles.forEach(r=>$('role').append(new Option(roleLabel(r),r)));role=Math.max(0,roles.indexOf(normalizeReadingRole(readSession('hb-reader',''))));$('role').selectedIndex=role;$('role').onchange=()=>{role=$('role').selectedIndex;try{sessionStorage.setItem('hb-reader',JSON.stringify(roles[role]))}catch{}render()};render();
$('notice').textContent='Ready. Ask a question about a medical topic.';
const queued=searchUI.ready(search);
void chats.init();
const params=new URLSearchParams(location.search);
const requested=params.get('q')||params.get('topic'),section=Number(params.get('section'));
if(params.get('chat'))await chats.load(params.get('chat'));
else if(params.get('newchat')==='1')chats.reset();
if(!queued && !params.get('chat') && requested){
  await search(requested,null,true);if(Number.isInteger(section)&&section>=1&&section<=7)research.select(section);
}
}catch{searchUI.fail()}
