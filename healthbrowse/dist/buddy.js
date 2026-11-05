// Every reading mode uses the same user-opened, keyboard-accessible buddy.
export function setupBuddy(getContext){
 const $=id=>document.getElementById(id),dialog=$('buddyDialog'),launcher=$('buddyLauncher'),panel=$('copilot');
 let available=false,returnFocus=launcher;
 dialog.append(panel);document.body.classList.add('buddy-enabled');
 function close(){if(dialog.open)dialog.close()}
 function show(from=launcher){
  if(!available)return;returnFocus=from;dialog.showModal();launcher.setAttribute('aria-expanded','true');document.body.classList.add('buddy-open');$('copilot-heading').focus();
 }
 launcher.onclick=()=>show();$('buddyClose').onclick=close;
 dialog.addEventListener('close',()=>{launcher.setAttribute('aria-expanded','false');document.body.classList.remove('buddy-open');(returnFocus?.isConnected?returnFocus:launcher).focus({preventScroll:true})});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()}});
 return {show,close,sync(_mode,ready){
  available=ready;launcher.disabled=!ready;launcher.hidden=false;$('buddyClose').hidden=false;panel.hidden=!ready;
  const context=getContext();$('buddyTopic').textContent=ready?'6 ways to explore '+context.topic:'Search a topic to begin';
  launcher.setAttribute('aria-label',ready?'Open HealthBrowse buddy for '+context.topic:'HealthBrowse buddy. Search a topic to begin.');
  if(!ready)close();
 }};
}
