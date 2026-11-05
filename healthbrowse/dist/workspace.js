import {generalMode,deckCount,buddyQuestions,domainAnswer,isOverviewQuestion} from './search-experience.js';
import {inspectInput,answerQuestion,questionDeck} from './clinical-engine.js';

import {frameworkVersion,domains,domainTitle,roleLabel,professionalRole} from './disease-framework.js';
export const deckNames=domains.map(d=>d.title);
const questions=['Which risk factors are described?','What is known about the untreated disease course?','Which diagnostic tests are described?','What treatment classes are described?','Which complications are described?','What prevention information is available?','Which research papers are available?'];
const $=id=>document.getElementById(id);
const node=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
export function guardMessage(status){
  return status==='emergency'?'If these symptoms or immediate danger are happening now, contact local emergency services now or ask someone nearby to call. Do not wait for a search response.':'Remove personal details and ask a general educational question. This input was not used for retrieval.';
}
function save(key,value){try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
export function readSession(key,fallback){try{return JSON.parse(sessionStorage.getItem(key))??fallback}catch{return fallback}}
import {verifyClaim} from './claim-check.js';
import {renderCheck} from './research-session.js';
export function setupCopilot(getContext,actions={}){
  let sequence=0;
  let active=1,history=[],identity='',publicTurns=[],busy=false;
  const controls=[$('deckSelect'),$('question'),$('ask').querySelector('button')];
  controls.forEach(control=>control.disabled=true);
  function sync(){
    const c=getContext();if(!c)return;controls.forEach(control=>control.disabled=busy);
    const scope=frameworkVersion+'|'+c.topic+'|'+c.role+'|'+deckCount(c.role);
    if(identity!==scope){
      history=[];publicTurns=[];busy=false;++sequence;$('scopeQuestion').replaceChildren();
      const last=readSession('hb-context',{});active=last.scope===scope && Number.isInteger(last.deck)?Math.max(1,Math.min(last.deck,deckCount(c.role))):1;
      if(last.scope===scope)history=publicTurns=readSession('hb-transcript',[]);
      identity=scope;
    }
    save('hb-context',{topic:c.topic,role:c.role,scope,deck:active});save('hb-transcript',publicTurns);
    [...$('deckSelect').options].forEach((option,i)=>{option.textContent=(i+1)+' · '+domainTitle(i+1,c.role);option.hidden=i>=deckCount(c.role)});
    $('deckSelect').value=String(active);$('copilotScope').textContent=c.topic+' · '+roleLabel(c.role);
    $('copilotHint').textContent=busy?'Finding a source-backed answer…':generalMode(c.role)?'Choose an area above, or ask a follow-up below.':'Section '+active+' · '+domainTitle(active,c.role)+'. Answers use the selected sources and flag missing evidence.';
    const general=generalMode(c.role);$('buddyWelcome').hidden=!general;$('buddyQuestions').hidden=!general;$('buddyWelcome').replaceChildren(node('p','Hi! Let’s explore '+c.topic+'.'),node('small','Which of these six areas would you like to understand better? I’ll link the sources and tell you when information is missing.'));$('buddyQuestions').replaceChildren();if(general)for(const choice of buddyQuestions){const b=node('button',choice.label);b.type='button';b.disabled=busy;b.setAttribute('aria-pressed',String(active===choice.deck&&history.length>0));const n=node('span',String(choice.deck).padStart(2,'0'));b.prepend(n);b.onclick=()=>ask(choice.prompt,true,choice.deck);$('buddyQuestions').append(b)}
    $('ask').querySelector('label').textContent=general?'Ask a follow-up question':'Ask about this section';$('ask').querySelector('button').textContent=general?'Send question ↗':'Ask copilot ↗';$('copilot').querySelector('.eyebrow').textContent=general?'YOUR HEALTH RESEARCH BUDDY':'MEDQUAD / RESEARCH COMPANION';
    $('thread').replaceChildren();
    for(const t of history){const turn=node('div','');turn.className='turn';turn.append(node('strong',t.question),node('p',t.text));if(t.frameworkVersion!==frameworkVersion)turn.append(node('small','Saved using the previous deck framework. Section numbers refer to that version.'));
      for(const cite of t.citations){let url;try{url=new URL(cite.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)continue}catch{continue}const a=node('a',cite.title+' ↗');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';turn.append(a)}for(const check of t.checks||[])renderCheck(turn,check);
      if(t.overview&&t.frameworkVersion===frameworkVersion){const list=node('div','');list.className='brief-nav';
        deckNames.slice(0,deckCount(c.role)).forEach((name,i)=>{const b=node('button',(i+1)+'. '+domainTitle(i+1,c.role));b.type='button';b.className='act';b.onclick=()=>actions.expand?.(i+1);list.append(b)});turn.append(list)}
      $('thread').append(turn)}
    $('followups').replaceChildren();const suggestion=node('button',questions[active-1]);suggestion.className='act';suggestion.onclick=()=>ask(questions[active-1],true);$('followups').append(suggestion);
  }
  async function respond(q,fromSuggestion=false,guidedDeck=0){
    const c=getContext();if(!c||!q.trim())return;
    const status=inspectInput(q);$('question').value='';
    $('scopeQuestion').replaceChildren();
    const run=++sequence;
    const choices=status==='ok'&&!guidedDeck?actions.scopeChoice?.(q)||[]:[];
    if(choices.length){
      actions.confirm(q,choices.join(' / '));return;
    }
    const target=questionDeck(q)||active,scope=identity;
    let researchAnswer=null;
    if(status==='ok'&&!guidedDeck){
      $('copilotHint').textContent='Finding a source-backed answer…';
      try{researchAnswer=await actions.research?.(q)}catch{}
      if(run!==sequence||identity!==scope)return;
    }
    const guided=status==='ok'&&guidedDeck?domainAnswer(c,guidedDeck):null;
    const answer=guided || researchAnswer || (status==='ok'?answerQuestion({...c,question:q,deck:target,history,visibleTexts:generalMode(c.role)?[]:c.visibleTexts}):{text:guardMessage(status),citations:[],deck:active});
    let checks=answer.checks||[];
    if(status==='ok' && !guided && !researchAnswer && !answer.citations.length){
      const existing=answerQuestion({...c,question:q,deck:target,history:generalMode(c.role)?[]:history,visibleTexts:[]});
      if(existing.citations.length){
        answer.text=generalMode(c.role)?existing.text:'The matching passage is already in Section '+target+'. Open its source below to inspect the full context.';
        answer.citations=existing.citations;answer.deck=target;checks=existing.checks||[];
      }else if(!questionDeck(q)){
        answer.text='I don’t have a source-backed answer to that wording yet. Choose one of the '+deckCount(c.role)+' areas above, or enter a disease name if you want to change topics.';
      }
    }
    if(!guided && !researchAnswer && answer.citations.length){
      const cite=answer.citations[0];
      const candidates=c.passages.filter(p=>[p.url,p.sourceRecord].includes(cite.url));
      if(candidates.length && !answer.text.startsWith('The matching passage')){
        const match=candidates.find(p=>p.text===answer.text || p.focus+' — '+p.text===answer.text);
        const check=verifyClaim({kind:'passage',topic:c.topic,sourceUrl:cite.url,field:'text',
          value:match?.text||answer.text,record:match?.record||(candidates.length===1?candidates[0].record:null),allowCorrection:true},{topic:c.topic,passages:c.passages});
        if(check.status==='withheld'){answer.text='The proposed answer did not match a cited passage and was withheld.';answer.citations=[]}
        else {answer.text=check.text;answer.citations=[check.citation];checks=[check]}
      }
    }
    const overview=status==='ok' && !guided && !researchAnswer && isOverviewQuestion(c,q);
    if(overview){
      const p=c.passages.find(p=>p.overview);
      if(p){
        const check=verifyClaim({kind:'passage',topic:c.topic,sourceUrl:p.sourceRecord||p.url,field:'text',value:p.text,record:p.record},{topic:c.topic,passages:c.passages});
        if(check.status!=='withheld'){answer.text=check.text;checks=[check];answer.citations=[check.citation]}
      }
      answer.deck=1;answer.text+=' Which of these '+deckCount(c.role)+' areas would you like to explore further?';
    }
    if(status==='ok' && /^(hi|hello|hey|help|what can you do)[?!. ]*$/i.test(q.trim())){
      answer.deck=active;answer.citations=[];
      answer.text='Ask a question about '+c.topic+', such as “'+questions[active-1]+'”. I can look across the sections and cite a matching passage.';
    }
    if(status==='ok')active=answer.deck;
    if(answer.courseContext==='unspecified')answer.text+=' Treatment exposure is not established; this is not a verified untreated timeline.';
    if(professionalRole(c.role)&&answer.citations.length&&answer.deck<7)answer.text+=' Appraisal: '+domains[answer.deck-1].professional+' Check current guidance and local applicability before clinical use.';
    const turn={frameworkVersion,topic:c.topic,question:status==='ok'?q:'Input withheld',deck:answer.deck,text:(generalMode(c.role)?'':('Section '+answer.deck+' · '))+answer.text,citations:answer.citations,checks,overview};
    if(status==='ok'){void actions.onChat?.(c,answer.deck);try{void actions.onTurn?.(turn)}catch{/* Saving must not suppress a research answer. */}}
    history=[...history.slice(-9),turn];if(fromSuggestion)publicTurns=[...publicTurns.slice(-9),turn];
    sync();$('thread').lastElementChild?.scrollIntoView({block:'nearest'});
  }
  async function ask(q,fromSuggestion=false,guidedDeck=0){if(busy||!q.trim())return;busy=true;sync();let failed=false;try{await respond(q,fromSuggestion,guidedDeck)}catch{failed=true}finally{busy=false;sync();if(failed){const error=node('p','This answer could not be loaded. Please try again.');error.setAttribute('role','status');$('thread').append(error)}$('thread').lastElementChild?.scrollIntoView({block:'nearest'})}}
  deckNames.forEach((name,i)=>$('deckSelect').append(new Option((i+1)+' · '+name,String(i+1))));
  $('deckSelect').onchange=()=>{active=Number($('deckSelect').value);sync()};
  $('question').onkeydown=e=>{
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('ask').requestSubmit()}
  };
  $('ask').onsubmit=e=>{e.preventDefault();ask($('question').value)};
  $('clearChat').onclick=()=>{sequence++;$('scopeQuestion').replaceChildren();history=[];publicTurns=[];sync()};
  return {sync,askDomain(n){const choice=buddyQuestions[n-1];if(choice)void ask(choice.prompt,true,n)},clear(){sequence++;history=[];publicTurns=[];$('scopeQuestion').replaceChildren();save('hb-transcript',[]);sync()},restore(turns){sequence++;history=turns;publicTurns=[];active=turns.at(-1)?.frameworkVersion===frameworkVersion?turns.at(-1).deck:1;sync()},activate(deck,focus=false){active=deck;sync();if(focus){$('copilot').scrollIntoView({block:'nearest'});$('question').focus({preventScroll:true})}}};
}
