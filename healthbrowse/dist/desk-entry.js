import {getAuthClient,clearResearchSession} from './account-client.js';
import {authCallbackDestination} from './account-flows.js';

async function enterDesk(){
  const callback=authCallbackDestination(new URL(location.href));
  if(callback){location.replace(callback);return}
  let client, session;
  try{
    client=await getAuthClient();
    const result=await client.auth.getSession();
    if(result.error)throw result.error;
    session=result.data.session;
  }catch{
    location.replace('/account.html');
    return;
  }
  if(!session || sessionStorage.getItem('hb-account-recovery')==='1'){
    location.replace('/account.html');
    return;
  }
  client.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT'){clearResearchSession();location.replace('/account.html')}
  });
  const signOut=document.getElementById('deskSignOut');
  signOut.onclick=async()=>{
    signOut.disabled=true;
    try{
      const {error}=await client.auth.signOut({scope:'local'});
      if(error)throw error;
      clearResearchSession();
      location.replace('/account.html');
    }catch{
      document.getElementById('deskAuthStatus').textContent='Sign-out failed. Please try again.';
      signOut.disabled=false;
    }
  };
  document.documentElement.classList.remove('checking-session');
  await import('./entry.js');
  await import('./app.js');
}
enterDesk();
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
