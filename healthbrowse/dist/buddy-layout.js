// Presentation only: existing chat, source verification and account handlers retain ownership.
const el=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
const $=id=>document.getElementById(id);
const paths={explore:'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4L18.4 5.6',history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2',more:'M5 12h.01M12 12h.01M19 12h.01',voice:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8'};
export function buddyIcon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.more);svg.append(path);return svg}
export function shouldSendBuddyKey(event,mobile){return !!(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&(!mobile||event.ctrlKey||event.metaKey))}
export function resizeBuddyInput(input){input.style.height='auto';input.style.height=Math.max(48,Math.min(144,input.scrollHeight||48))+'px';input.style.overflowY=input.scrollHeight>144?'auto':'hidden'}
export function setupBuddyLayout(){
 const dialog=$('buddyDialog'),panel=$('copilot'),inner=panel.querySelector('.copilot-inner'),head=panel.querySelector('.copilot-head');
 const avatar=Object.assign(el('img','','buddy-header-avatar'),{src:'/buddy-avatar.svg',alt:'',width:42,height:42});
 const identity=el('div','','buddy-identity');identity.append(head.querySelector('.eyebrow'),$('copilot-heading'),$('copilotScope'));head.prepend(avatar,identity);$('copilot-heading').textContent='Buddy';
 const safety=el('p','','buddy-safety-copy'),notice=el('details','','buddy-pinned-notice');notice.append(el('summary','Educational reference · Read safety note'),safety);head.after(notice);
 const toolbar=el('nav','','buddy-toolbar');toolbar.setAttribute('aria-label','Buddy tools');notice.after(toolbar);
 const aux=el('section','','buddy-tool-view');aux.hidden=true;aux.id='buddyTools';aux.setAttribute('aria-labelledby','buddyToolTitle');inner.after(aux);
 const back=el('button','← Back to chat','buddy-back');back.type='button';const title=el('h3');title.id='buddyToolTitle';title.tabIndex=-1;aux.append(back,title);
 const newChat=$('newChat');
 const panes={explore:el('div'),history:el('div'),more:el('div')};Object.values(panes).forEach(p=>{p.hidden=true;aux.append(p)});
 panes.explore.append($('buddyWelcome'),$('buddyQuestions'));
 panes.history.append($('chatTitle'),$('chatHistoryPanel'),$('chatSaveStatus'));$('chatHistoryPanel').open=true;
 panes.more.append($('buddyResearch'),panel.querySelector('.copilot-actions'));
 inner.querySelector('.chat-toolbar')?.remove();
 const composer=el('div','','buddy-composer'),voiceTools=el('div','','buddy-voice-tools'),consent=el('div','','voice-consent');consent.hidden=true;
 const form=$('ask'),input=$('question'),send=form.querySelector('button');send.type='submit';send.setAttribute('aria-label','Send question');send.title='Send question';send.textContent='↑';
 input.rows=1;input.placeholder='Ask Buddy a follow-up…';input.setAttribute('aria-label','Message Buddy');input.setAttribute('enterkeyhint','enter');
 const footer=el('div','','buddy-composer-footer'),hint=el('span','Enter to send · Shift + Enter for a new line','buddy-key-hint');footer.append(voiceTools,hint);
 const progress=el('div','','buddy-progress');progress.append($('copilotHint'),$('buddyStop'));
 composer.append(consent,progress,form,footer);panel.append(composer);
 const greeting=el('section','','buddy-empty');const greetingTitle=el('h3','A little clarity, one question at a time.');greeting.append(Object.assign(el('img'),{src:'/buddy-avatar.svg',alt:'',width:64,height:64}),greetingTitle);
 const greetingText=el('p');greeting.append(greetingText);inner.prepend(greeting);
 let active='',opener;
 const buttons={};
 function showChat({focus=true}={}){const previous=opener;active='';aux.hidden=true;inner.hidden=false;composer.hidden=false;for(const button of Object.values(buttons))button.setAttribute('aria-expanded','false');resizeBuddyInput(input);if(focus&&dialog.open)previous?.focus({preventScroll:true})}
 function showTool(name,button){if(active===name){showChat();return}active=name;opener=button;inner.hidden=true;composer.hidden=true;aux.hidden=false;for(const [key,pane] of Object.entries(panes))pane.hidden=key!==name;for(const [key,item] of Object.entries(buttons))item.setAttribute('aria-expanded',String(key===name));title.textContent={explore:'Explore this topic',history:'Your conversations',more:'Research & chat tools'}[name];if(name==='history'){$('chatHistoryPanel').open=false;$('chatHistoryPanel').open=true}title.focus({preventScroll:true});aux.scrollTop=0;}
 for(const [name,label] of [['explore','Explore'],['history','History'],['more','More']]){const button=el('button');button.type='button';button.append(buddyIcon(name),el('span',label));button.setAttribute('aria-controls',aux.id);button.setAttribute('aria-expanded','false');button.onclick=()=>showTool(name,button);buttons[name]=button;toolbar.append(button)}
 newChat.textContent='+ New chat';toolbar.insertBefore(newChat,buttons.more);newChat.addEventListener('click',()=>{showChat({focus:false});input.focus()});
 const explore=el('button','Explore this topic','buddy-empty-action');explore.type='button';explore.onclick=()=>showTool('explore',buttons.explore);greeting.append(explore);
 back.onclick=()=>showChat();panes.explore.addEventListener('click',event=>{if(event.target.closest('#buddyQuestions button')){showChat({focus:false});$('copilot-heading').focus({preventScroll:true})}},true);
 document.addEventListener('healthbrowse-chat-restored',()=>showChat());
 dialog.addEventListener('cancel',event=>{if(active){event.preventDefault();showChat()}});
 dialog.addEventListener('close',()=>{showChat({focus:false});notice.open=false});
 dialog.addEventListener('buddy-opened',()=>resizeBuddyInput(input));
 input.addEventListener('input',()=>resizeBuddyInput(input));window.addEventListener('resize',()=>resizeBuddyInput(input));
 document.addEventListener('healthbrowse-chat-updated',event=>{greeting.hidden=event.detail.count>0;resizeBuddyInput(input)});
 return {composer,voiceTools,consent,safety,greeting:greetingText,more:panes.more,showChat};
}
