import {deckCount,domainAnswer,searchAnswer,isOverviewQuestion} from './search-experience.js';
import {inspectInput} from './clinical-engine.js';
import {readingProfile,roleQuestions} from './reading-profiles.js';
import {requestSynthesis} from './model-client.js';
import {renderAnswer} from './answer-view.js';
import {frameworkVersion,domains,domainTitle,roleLabel} from './disease-framework.js';
import {renderCheck} from './research-session.js';
export const deckNames=domains.map(d=>d.title);
const $=id=>document.getElementById(id);
const node=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
export function guardMessage(status){return status==='emergency'?'If these symptoms or immediate danger are happening now, contact local emergency services now or ask someone nearby to call. Do not wait for a search response.':'Remove personal details and ask a general educational question. This input was not used for retrieval.'}
function save(key,value){try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
export function readSession(key,fallback){try{return JSON.parse(sessionStorage.getItem(key))??fallback}catch{return fallback}}
export function setupCopilot(getContext,actions={}){
 let sequence=0,active=1,history=[],identity='',publicTurns=[],busy=false,modelRequest=null;
 const controls=[$('deckSelect'),$('question'),$('ask').querySelector('button')];
 controls.forEach(control=>control.disabled=true);
 function sync(){
  const c=getContext();if(!c)return;
  const profile=readingProfile(c.role),scope=frameworkVersion+'|audience-v2|'+c.topic+'|'+c.role;
  if(identity!==scope){modelRequest?.abort();history=[];publicTurns=[];busy=false;++sequence;$('scopeQuestion').replaceChildren();const last=readSession('hb-context',{});active=last.scope===scope&&Number.isInteger(last.deck)?Math.max(1,Math.min(last.deck,6)):1;if(last.scope===scope)history=publicTurns=readSession('hb-transcript',[]);identity=scope}
  controls.forEach(control=>control.disabled=busy);
  $('buddyStop').hidden=!busy;
  save('hb-context',{topic:c.topic,role:c.role,scope,deck:active});save('hb-transcript',publicTurns);
  [...$('deckSelect').options].forEach((option,i)=>{option.textContent=(i+1)+' · '+domainTitle(i+1,c.role);option.hidden=i>=deckCount(c.role)});
  $('deckSelect').value=String(active);$('copilotScope').textContent=c.topic+' · '+roleLabel(c.role);
  $('copilotHint').textContent=busy?'Finding a source-backed answer…':'Choose an area or ask a follow-up. '+profile.guide;
  $('buddyWelcome').hidden=false;$('buddyQuestions').hidden=false;
  $('buddyWelcome').replaceChildren(node('p','Let’s explore '+c.topic+'.'),node('small',profile.style+'. Which of these six areas would you like to explore?'));
  $('buddyQuestions').replaceChildren();
  for(const choice of roleQuestions(c.role)){const b=node('button',choice.label);b.type='button';b.disabled=busy;b.setAttribute('aria-pressed',String(active===choice.deck&&history.length>0));const n=node('span',String(choice.deck).padStart(2,'0'));b.prepend(n);b.onclick=()=>ask(choice.prompt,true,choice.deck);$('buddyQuestions').append(b)}
  $('ask').querySelector('label').textContent='Ask a follow-up question';$('ask').querySelector('button').textContent='Send question ↗';$('copilot').querySelector('.eyebrow').textContent='YOUR HEALTH RESEARCH BUDDY';
  $('thread').replaceChildren();
  for(const t of history){const turn=node('div','');turn.className='turn';turn.append(node('strong',t.question));
   renderAnswer(turn,{...t,blocks:t.blocks||[],style:t.style||''},renderCheck);
   if(t.frameworkVersion!==frameworkVersion)turn.append(node('small','Saved using the previous framework. Section numbers refer to that version.'));
   $('thread').append(turn);
  }
  $('followups').replaceChildren();
 }
 async function respond(q,fromSuggestion=false,guidedDeck=0){
  const c=getContext();if(!c||!q.trim())return;
  const status=inspectInput(q);$('question').value='';$('scopeQuestion').replaceChildren();
  const run=++sequence,scope=identity;
  const choices=status==='ok'&&!guidedDeck?actions.scopeChoice?.(q)||[]:[];
  if(choices.length){actions.confirm(q,choices.join(' / '));return}
  let answer=status!=='ok'?{text:guardMessage(status),citations:[],checks:[],deck:active}:guidedDeck?domainAnswer(c,guidedDeck):searchAnswer(c,q,{detail:true,activeDeck:active});
  if(!answer)return;
  // Give the visitor the source-backed response now; optional remote services
  // can enrich this same turn without holding the conversation blank.
  const turn={...answer,frameworkVersion,topic:c.topic,question:status==='ok'?q:'Input withheld',overview:isOverviewQuestion(c,q)};
  if(status==='ok'){active=answer.deck||active;turn.modelNotice='Checking for additional evidence. You can read the cited response below.'}
  history=[...history.slice(-9),turn];if(fromSuggestion)publicTurns=[...publicTurns.slice(-9),turn];
  sync();$('thread').lastElementChild?.scrollIntoView({block:'nearest'});
  let researchAnswer=null;
  if(status==='ok'&&!guidedDeck){try{researchAnswer=await actions.research?.(q)}catch{}if(run!==sequence||identity!==scope)return}
  if(researchAnswer)answer=researchAnswer;
  else if(status==='ok'){
   modelRequest?.abort();modelRequest=new AbortController();
   const result=await requestSynthesis(c,q,{mode:'chat',deck:guidedDeck||active,history,signal:modelRequest.signal});
   if(run!==sequence||identity!==scope)return;
   if(result.status==='generated')answer=result.answer;else answer={...answer,modelNotice:result.message};
  }
  if(run!==sequence||identity!==scope)return;
  if(status==='ok')active=answer.deck||active;
  // Preserve the shared turn object, but replace all provisional response fields
  // so an enriched answer cannot inherit an obsolete coverage-gap message.
  for(const key of Object.keys(turn))delete turn[key];
  Object.assign(turn,answer,{frameworkVersion,topic:c.topic,question:status==='ok'?q:'Input withheld',overview:isOverviewQuestion(c,q)});
  if(status==='ok'){void actions.onChat?.(c,active);try{void actions.onTurn?.(turn)}catch{}}
 }
 async function ask(q,fromSuggestion=false,guidedDeck=0){
  if(busy||!q.trim())return;busy=true;sync();let failed=false;const scope=identity;
  let run;
  try{const response=respond(q,fromSuggestion,guidedDeck);run=sequence;await response}catch{failed=true}
  finally{if(scope===identity&&run===sequence){busy=false;sync();if(failed&&!modelRequest?.signal.aborted){const error=node('p','Additional evidence could not be loaded. The cited response remains available.');error.setAttribute('role','status');$('thread').append(error)}$('thread').lastElementChild?.scrollIntoView({block:'nearest'})}}
 }
 deckNames.forEach((name,i)=>$('deckSelect').append(new Option((i+1)+' · '+name,String(i+1))));
 $('deckSelect').onchange=()=>{active=Number($('deckSelect').value);sync()};
 $('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('ask').requestSubmit()}};
 $('ask').onsubmit=e=>{e.preventDefault();ask($('question').value)};
  $('buddyStop').onclick=()=>{sequence++;modelRequest?.abort();busy=false;if(history.at(-1))history.at(-1).modelNotice='Additional lookup stopped. The available cited response is shown below.';sync()};
  $('clearChat').onclick=()=>{sequence++;modelRequest?.abort();busy=false;$('scopeQuestion').replaceChildren();history=[];publicTurns=[];sync()};
 return {sync,askDomain(n){const choice=roleQuestions(getContext()?.role)[n-1];if(choice)void ask(choice.prompt,true,n)},clear(){sequence++;modelRequest?.abort();busy=false;history=[];publicTurns=[];$('scopeQuestion').replaceChildren();save('hb-transcript',[]);sync()},restore(turns){sequence++;modelRequest?.abort();busy=false;history=turns;publicTurns=[];active=turns.at(-1)?.frameworkVersion===frameworkVersion?turns.at(-1).deck:1;sync()},activate(deck,focus=false){active=deck;sync();if(focus)$('question').focus({preventScroll:true})}};
}
