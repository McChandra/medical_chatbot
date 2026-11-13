import {mobileDestinations,studyCards,citationURL,readStudyNote,saveStudyNote} from './mobile-model.js';
import {normalizeReadingRole} from './reading-profiles.js';
import {patientDisclaimer} from './medical-contract.js';
import {createDictation,createLocalReader,bindLongPress} from './mobile-voice.js';
import {glossary,annotateMedicalTerms} from './mobile-glossary.js';
const $=id=>document.getElementById(id);
const n=(tag,text='',cls='')=>Object.assign(document.createElement(tag),{textContent:text,className:cls});
const b=(text,action,cls='')=>{const x=n('button',text,cls);x.type='button';x.onclick=action;return x};
const paths={search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',notes:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',cards:'M5 5h15v16H5zM2 2h15',sources:'M3 5l8-2 10 2v15l-10-2-8 2zM11 3v15',evidence:'M4 4h16v16H4zM8 12l3 3 5-7',history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2',saved:'M6 3h12v18l-6-4-6 4z',account:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2'};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.search);svg.append(p);return svg}
function safeLink(ref,label){const href=citationURL(ref.url);if(!href)return null;const a=n('a',label||ref.title||'Open source');a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a}
export function setupMobileWorkspace({buddy}){
 let state={topic:'',role:'General reader',responses:[]},cards=[],index=0,activeDeck=1,identity='';
 const narrow=matchMedia('(max-width:760px)'),landscape=matchMedia('(min-width:700px) and (orientation:landscape)');
 document.body.classList.add('mobile-ready');
 const form=$('find'),anchor=document.createComment('Research search form'),slot=n('div','','mobile-search-slot');form.before(anchor);document.querySelector('.site-header').append(slot);
 function placeSearch(){if(narrow.matches)slot.append(form);else anchor.after(form)}placeSearch();narrow.addEventListener('change',placeSearch);
 $('card').addEventListener('click',event=>{const deck=event.target.closest?.('details[data-faq]');if(deck)activeDeck=Number(deck.dataset.faq)});
 const tools=n('section','','mobile-tools');tools.setAttribute('aria-label','Research shortcuts');document.querySelector('.searchbox').after(tools);
 const nav=n('nav','','mobile-bottom-nav');nav.setAttribute('aria-label','Mobile navigation');document.body.append(nav);
 const live=n('p','','mobile-status');live.setAttribute('role','status');tools.append(live);
 function focusSearch(){form.scrollIntoView({block:'nearest'});$('query').focus()}
 function jump(deck){activeDeck=deck;const target=$('card').querySelector('details[data-faq="'+deck+'"]');if(target){target.open=true;target.scrollIntoView({block:'start'});target.querySelector('summary').focus({preventScroll:true})}}
 function sheet(id,title){const dialog=n('dialog','','mobile-sheet');dialog.id=id;dialog.setAttribute('aria-labelledby',id+'Title');const head=n('header','','sheet-head'),heading=n('h2',title);heading.id=id+'Title';const close=b('×',()=>dialog.close(),'sheet-close');close.setAttribute('aria-label','Close '+title);head.append(heading,close);const body=n('div','','sheet-body');dialog.append(head,body);document.body.append(dialog);dialog.addEventListener('close',()=>reader.stop());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});return {dialog,body,heading};}
 const source=sheet('sourceSheet','Source passage'),flash=sheet('studyCardsSheet','Study cards'),noteSheet=sheet('studyNotesSheet','Study notes');
 const voiceStatus=n('p','','voice-status');voiceStatus.setAttribute('role','status');
 const sourceAudioStatus=n('p','','meta');sourceAudioStatus.setAttribute('role','status');
 const reader=createLocalReader({synthesis:window.speechSynthesis,Utterance:window.SpeechSynthesisUtterance,onStatus:text=>{voiceStatus.textContent=text;sourceAudioStatus.textContent=text}});
 document.addEventListener('pointerdown',()=>reader.stop(),true);document.addEventListener('keydown',e=>{if(e.key==='Escape')reader.stop()});
 function showSource(ref){
  source.heading.textContent=ref.title||'Supporting source';source.body.replaceChildren(n('p',ref.date||'Publication date not supplied','meta'));
  if(ref.quote||ref.text){source.body.append(n('p','Supporting passage','label'),n('blockquote',ref.quote||ref.text,'source-passage'));}
  else source.body.append(n('p','Open the publisher page to read the original material.'));
  const link=safeLink(ref,'Open original source ↗');if(link)source.body.append(link);
  source.body.append(n('p','This is the available source excerpt, not the complete textbook or article.','meta'));if(!source.dialog.open)source.dialog.showModal();
 }
 document.addEventListener('healthbrowse-source',event=>{if(!citationURL(event.detail?.url))return;event.preventDefault();showSource(event.detail)});
 function allSources(){source.heading.textContent='Sources for '+state.topic;source.body.replaceChildren();
  const refs=[...new Map(state.responses.flatMap(r=>(r.blocks||[]).flatMap(x=>x.references||[x.citation])).filter(r=>r&&citationURL(r.url)).map(r=>[r.url,r])).values()];
  if(!refs.length)source.body.append(n('p','Search a medical topic to see its supporting sources.'));
  for(const ref of refs){const row=b(ref.title||new URL(ref.url).hostname,()=>showSource(ref),'source-choice');row.append(n('small',ref.date||'Date not supplied'));source.body.append(row)}
  source.dialog.showModal();
 }
 const notebook=n('aside','','study-notebook'),noteTitle=n('h3','Study notes'),noteTopic=n('p','','meta'),noteInput=n('textarea'),noteStatus=n('p','','meta');noteInput.id='studyNote';noteInput.maxLength=8000;noteInput.rows=10;noteInput.placeholder='Explain a mechanism in your own words…';const noteLabel=n('label','Research notes');noteLabel.htmlFor=noteInput.id;noteStatus.setAttribute('role','status');
 function persistNote(){const ok=saveStudyNote(sessionStorage,state.topic,noteInput.value);noteStatus.textContent=ok?'Saved in this tab. Cleared when you sign out.':'Not saved. Leave out personal details and patient information.';}
 noteInput.addEventListener('input',persistNote);
 const noteActions=n('div','','study-actions');noteActions.append(b('Add selected deck',()=>{const c=cards.find(c=>c.id===activeDeck)||cards[0];if(!c){noteStatus.textContent='No cited deck is available to add.';return}const text=[c.question,c.text,...c.references.map(r=>'Source: '+r.url)].join('\n');if((noteInput.value+'\n\n'+text).length>8000){noteStatus.textContent='This note is full. Copy it before adding more.';return}noteInput.value+=(noteInput.value?'\n\n':'')+text;persistNote()}),b('Copy notes',async()=>{try{await navigator.clipboard.writeText(noteInput.value);noteStatus.textContent='Notes copied.'}catch{noteStatus.textContent='Select the text and use your device’s copy command.'}}),b('Clear notes',()=>{if(!noteInput.value)return;if(confirm('Clear the notes for '+state.topic+' in this tab?')){noteInput.value='';persistNote()}}));
 notebook.append(noteTitle,noteTopic,n('p','Public research notes only. Keep names and patient details out.','meta'),noteLabel,noteInput,noteActions,noteStatus);
 function placeNotes(){const split=state.role==='Medical student'&&landscape.matches;document.body.classList.toggle('study-landscape',split);if(split){if(noteSheet.dialog.open)noteSheet.dialog.close();const parent=document.querySelector('.workbench');if(notebook.parentElement!==parent)parent.append(notebook);notebook.hidden=false}else{if(notebook.parentElement!==noteSheet.body)noteSheet.body.append(notebook);notebook.hidden=false}}
 landscape.addEventListener('change',placeNotes);
 function openNotes(){placeNotes();if(document.body.classList.contains('study-landscape')){notebook.scrollIntoView({block:'nearest'});noteInput.focus()}else noteSheet.dialog.showModal()}
 function drawCard(){flash.body.replaceChildren();if(!cards.length){flash.body.append(n('p','No source-linked study cards are available yet. Search a topic with cited evidence first.'));return}
  index=Math.min(index,cards.length-1);const card=cards[index],count=n('p',(index+1)+' of '+cards.length+' · '+card.kind,'meta');count.setAttribute('aria-live','polite');const face=n('article','','study-card'),q=n('h3',card.question),answer=n('div','','study-card-answer');answer.hidden=true;answer.append(n('p',card.text));for(const ref of card.references){const a=safeLink(ref);if(a)answer.append(a)}
  const reveal=b('Show answer',()=>{answer.hidden=!answer.hidden;reveal.textContent=answer.hidden?'Show answer':'Hide answer';reveal.setAttribute('aria-expanded',String(!answer.hidden))},'primary-study-action');reveal.setAttribute('aria-expanded','false');face.append(q,reveal,answer);let touch;
  face.addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY}});face.addEventListener('pointerup',e=>{if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;if(Math.abs(dx)>70&&Math.abs(dy)<40){index=(index+(dx<0?1:-1)+cards.length)%cards.length;drawCard()}});face.addEventListener('pointercancel',()=>touch=null);
  const controls=n('div','','study-actions');controls.append(b('← Previous',()=>{index=(index-1+cards.length)%cards.length;drawCard()}),b('Next →',()=>{index=(index+1)%cards.length;drawCard()}));flash.body.append(count,face,controls,n('p','Study aid from the current cited decks. Review the source and discuss uncertainties with your supervisor.','meta'));
 }
 function showCards(){drawCard();flash.dialog.showModal()}
 function run(name){if(name==='search')focusSearch();else if(name==='notes')openNotes();else if(name==='cards')showCards();else if(name==='sources')allSources();else if(name==='evidence')jump(1);else location.assign('/account.html#'+({saved:'saved',history:'chats',account:'profile'}[name]));}
 // Fixed composer and a concise safety note keep the conversation usable with a keyboard.
 const panel=$('copilot'),composer=n('div','','buddy-composer'),voiceTools=n('div','','buddy-voice-tools'),consent=n('div','','voice-consent');consent.hidden=true;
 const safety=n('p',patientDisclaimer,'buddy-pinned-notice');panel.querySelector('.copilot-head').after(safety);
 const guided=n('details','','buddy-guided');guided.append(n('summary','Explore this topic'));$('buddyWelcome').before(guided);guided.append($('buddyWelcome'),$('buddyQuestions'));
 const greeting=n('p','','buddy-mobile-greeting');$('thread').before(greeting);
 let voiceApproved=false;
 const dictation=createDictation({Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,onText:text=>{const input=$('question');input.value=(input.value?input.value+' ':'')+text;input.value=input.value.slice(0,input.maxLength);input.dispatchEvent(new Event('input',{bubbles:true}));},onStatus:text=>voiceStatus.textContent=text});
 function startVoice(){consent.hidden=true;voiceApproved=true;dictation.start()}
 function requestVoice(){if(!buddy.show())return;if(!(window.SpeechRecognition||window.webkitSpeechRecognition)){voiceStatus.textContent='Voice typing is unavailable. Use your keyboard microphone or type your question.';$('question').focus();return}if(voiceApproved)startVoice();else consent.hidden=false;}
 consent.append(n('p','Your browser may send audio to its speech service. Use public medical questions only, without names or patient details. Review the text before sending.'),b('Start voice input',startVoice),b('Cancel',()=>consent.hidden=true));
 voiceTools.append(b('Voice',requestVoice),b('Stop voice',()=>dictation.stop()),b('Read latest',()=>{const text=$('thread').lastElementChild?.innerText;if(text)reader.read(text);else voiceStatus.textContent='Ask a question first to read an answer aloud.'}));
 composer.append(consent,$('ask'),voiceTools,voiceStatus);panel.append(composer);
 bindLongPress($('buddyLauncher'),requestVoice);$('buddyLauncher').title='Open Buddy. Hold for voice input.';
 $('buddyDialog').addEventListener('close',()=>{dictation.stop();reader.stop();consent.hidden=true});
 window.addEventListener('pagehide',()=>{dictation.stop();reader.stop()});document.addEventListener('visibilitychange',()=>{if(document.hidden){dictation.stop();reader.stop()}});
 const observer=new MutationObserver(()=>{annotateMedicalTerms($('thread'));greeting.hidden=$('thread').children.length>0});observer.observe($('thread'),{childList:true,subtree:true});
 document.addEventListener('click',event=>{const term=event.target.closest?.('button[data-term]')?.dataset.term;if(!glossary[term])return;const g=glossary[term];source.heading.textContent=term[0].toUpperCase()+term.slice(1);source.body.replaceChildren(n('p',g.definition),n('p',g.pronunciation,'meta'),b('Hear term',()=>reader.read(term)),n('p','Plain-language explanation based on the NCI Dictionary of Cancer Terms.','meta'));source.body.append(safeLink(g,'NCI definition & pronunciation ↗'),sourceAudioStatus);source.dialog.showModal()});
 const feedback=n('p','','mobile-safety-feedback');feedback.hidden=true;feedback.setAttribute('role','status');document.body.append(feedback);let warningTimer;
 document.addEventListener('healthbrowse-safety-alert',()=>{feedback.textContent='Safety guidance is available in your response.';feedback.hidden=false;document.body.classList.add('safety-feedback');clearTimeout(warningTimer);warningTimer=setTimeout(()=>{feedback.hidden=true;document.body.classList.remove('safety-feedback')},3500);if(!matchMedia('(prefers-reduced-motion:reduce)').matches){try{navigator.vibrate?.(40)}catch{}}});
 function viewport(){const v=window.visualViewport;if(v&&v.scale!==1)return;document.documentElement.style.setProperty('--mobile-vh',(v?.height||window.innerHeight)+'px');document.documentElement.style.setProperty('--visual-top',(v?.offsetTop||0)+'px');document.body.classList.toggle('keyboard-open',!!v&&window.innerHeight-v.height>130&&/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName||''))}
 window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);document.addEventListener('focusin',viewport);document.addEventListener('focusout',()=>setTimeout(viewport,100));viewport();
 return {update(next){
  state={...next,role:normalizeReadingRole(next.role)};document.body.dataset.reader=state.role==='Medical student'?'student':state.role==='Medical professional'?'clinical':'general';
  const key=state.topic+'|'+state.role;if(key!==identity){identity=key;index=0;activeDeck=1;dictation.stop();reader.stop();if(flash.dialog.open)flash.dialog.close();if(source.dialog.open)source.dialog.close();noteInput.value=readStudyNote(sessionStorage,state.topic);noteStatus.textContent='Saved only in this tab; cleared on sign-out.';}
  cards=studyCards(state.responses);noteTopic.textContent=state.topic||'Search a topic first';noteInput.disabled=!state.topic;placeNotes();
  nav.replaceChildren();for(const [name,label] of mobileDestinations(state.role)){const item=b('',()=>run(name));item.append(icon(name),n('span',label));nav.append(item)}
  tools.replaceChildren();const intro=n('div','','mobile-tools-heading');intro.append(n('small',state.role==='Medical student'?'STUDY WORKSPACE':state.role==='Medical professional'?'QUICK REFERENCE':'YOUR RESEARCH COMPANION'),n('h2',state.role==='Medical student'?'Read. Recall. Understand.':state.role==='Medical professional'?'Go straight to the evidence':'A little clarity, one question at a time'));tools.append(intro);
  const shortcuts=n('div','','mobile-shortcuts');
  if(state.role==='Medical student'){shortcuts.append(b('Study cards',showCards),b('Open notes',openNotes),b('View sources',allSources))}
  else if(state.role==='Medical professional'){for(const [id,label] of [[1,'Risk'],[3,'Symptoms'],[4,'Tests'],[5,'Treatment'],[6,'Outlook']])shortcuts.append(b(label,()=>jump(id)))}
  else {shortcuts.append(b('Ask Buddy',()=>{buddy.show();$('question').focus()}),b('Explain symptoms',()=>{if(!buddy.show())return;$('question').value='Explain the symptoms of '+state.topic+' in simple language.';$('question').focus()}),b('Questions for my doctor',()=>{if(!buddy.show())return;$('question').value='What questions could I discuss with a clinician about '+state.topic+'?';$('question').focus()}))}
  for(const control of shortcuts.children)control.disabled=!state.topic||!state.responses.length;tools.append(shortcuts,live);safety.textContent=state.role==='General reader'?patientDisclaimer:state.role==='Medical student'?'Educational study support. Review source passages and discuss clinical decisions with your supervisor.':'Clinical research reference. Apply professional judgment, current guidelines and local protocols.';
  greeting.textContent='What would you like to understand about '+(state.topic||'a medical topic')+'? Ask below, or expand “Explore this topic”.';
  for(const r of state.responses.filter(r=>r.id>0)){const summary=$('card').querySelector('details[data-faq="'+r.id+'"]>summary');if(summary&&!summary.querySelector('.evidence-status'))summary.append(n('small',r.generation?'Cited AI summary':r.blocks?.length?'Source excerpt':'Evidence gap','evidence-status'+(!r.blocks?.length?' evidence-gap':'')));}
  annotateMedicalTerms($('card'));if(flash.dialog.open)drawCard();
 }};
}
