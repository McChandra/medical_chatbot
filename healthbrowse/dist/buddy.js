// The general-user buddy is an accessible, user-opened dialog. Professional
// mode retains its inline research pane; both views share the same conversation.
export function setupBuddy(getContext){
 const $=id=>document.getElementById(id),dialog=$('buddyDialog'),launcher=$('buddyLauncher'),panel=$('copilot');
 const home=panel.parentElement;
 let general=false,available=false,returnFocus=launcher;
 function close(){if(dialog.open)dialog.close()}
 function show(from=launcher){
  if(!available)return;
  if(general){returnFocus=from;dialog.showModal();launcher.setAttribute('aria-expanded','true');document.body.classList.add('buddy-open');$('copilot-heading').focus()}
  else{panel.scrollIntoView({block:'start'});$('question').focus({preventScroll:true})}
 }
 launcher.onclick=()=>show();$('buddyClose').onclick=close;
 dialog.addEventListener('close',()=>{launcher.setAttribute('aria-expanded','false');document.body.classList.remove('buddy-open');(returnFocus?.isConnected?returnFocus:launcher).focus({preventScroll:true})});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()}});
 return {show,close,sync(isGeneral,ready){
  available=ready;launcher.disabled=!ready;
  if(general!==isGeneral){close();general=isGeneral;(general?dialog:home).append(panel);$('buddyResearch').open=!general}
  else if(!general)$('buddyResearch').open=true;
  document.body.classList.toggle('general-reader',general);launcher.hidden=!general;
  $('buddyClose').hidden=!general;panel.hidden=!ready;
  const context=getContext();$('buddyTopic').textContent=ready?'6 questions about '+context.topic:'Search a topic to begin';
  launcher.setAttribute('aria-label',ready?'Open HealthBrowse buddy for '+context.topic:'HealthBrowse buddy. Search a topic to begin.');
  if(!ready)close();
 }};
}
