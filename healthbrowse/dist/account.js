import {startEmailChallenge,confirmEmailChallenge,passwordLogin,updateRecoveredPassword,completeAuthCallback,authErrorMessage} from './account-flows.js';
import {accountRequest,getAuthClient,clearResearchSession} from './account-client.js';
import {readingModes,researchUrl,suggestedPassword} from './account-utils.js';

const $=id=>document.getElementById(id);
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const status=(id,value)=>{$(id).textContent=value};
const show=(id,visible)=>{$(id).hidden=!visible};
const failure=(error,fallback)=>error instanceof Error?error.message:fallback;
const accountURL=new URL('/account.html',location.origin).href;
let client,session,mode='login',challenge=null,recovering=false,authBusy=false,userGeneration=0;
let contactAttempt=null,hasSettings=false;

const modes={
  login:['Sign in','Explore medical evidence and save sources in your research desk.','Log in'],
  signup:['Create an account','Use Google or create a login with your email and password.','Create account'],
  otp:['Email code login','Enter the email associated with your HealthBrowse account.','Send sign-in code'],
  forgot:['Reset your password','Enter your account email and we’ll send password reset instructions.','Send reset email'],
};
function updateForm(){
  const verifying=Boolean(challenge);
  const passwordNeeded=!verifying && (recovering||['signup','login'].includes(mode));
  const title=verifying?'Check your email':recovering?'Choose a new password':modes[mode][0];
  if(document.body.classList.contains('auth-entry')){
    $('pageTitle').textContent=title;
    document.title=title+' · HealthBrowse AI';
    $('intro').textContent=verifying?'Follow the confirmation instructions in your newest email.':recovering?'Choose a password with at least 12 characters.':modes[mode][1];
  }
  $('authHelp').textContent=verifying?'Email requested for '+challenge.email:'';
  $('authSubmit').textContent=authBusy?'Please wait…':verifying?'Verify code':recovering?'Update password':modes[mode][2];
  $('authForm').setAttribute('aria-busy',String(authBusy));
  $('email').disabled=authBusy||verifying||recovering;
  $('password').required=passwordNeeded;$('password').disabled=authBusy||!passwordNeeded;
  $('password').autocomplete=mode==='login'&&!recovering?'current-password':'new-password';
  $('code').disabled=authBusy||!verifying;$('code').required=verifying;
  $('cancelFlow').disabled=authBusy;$('generate').disabled=authBusy;$('showPassword').disabled=authBusy;
  $('authSubmit').disabled=authBusy||!client;
  show('codeGroup',verifying);show('passwordGroup',passwordNeeded);
  show('suggestionGroup',passwordNeeded&&(mode==='signup'||recovering));
  const chooseMethod=!verifying&&!recovering;
  show('cancelFlow',!chooseMethod);
  show('socialOptions',chooseMethod&&['login','signup'].includes(mode));
  $('google').disabled=authBusy||!client;
  show('forgotLink',chooseMethod&&mode==='login');
  show('authLinks',chooseMethod&&!authBusy);
  show('signupLink',mode==='login');show('otpLink',mode==='login');show('loginLink',mode!=='login');

}
function switchMode(value){
  mode=value;challenge=null;$('code').value='';$('password').value='';$('showPassword').checked=false;
  history.replaceState(null,'',value==='login'?'/account.html':'/account.html?view='+value);
  $('password').type='password';status('authStatus','');updateForm();
}
function checked(result){if(result?.error)throw result.error;return result?.data}
async function loadAccount(){
  const generation=++userGeneration;
  const active=Boolean(session)&&!recovering;
  if(recovering&&session?.user.email)$('email').value=session.user.email;
  if(active && !['#workspace','#help','#contact','#saved','#settings','#history'].includes(location.hash)){
    location.replace('/');
    return;
  }
  document.body.classList.toggle('auth-entry',!active);
  if(active){
    $('pageTitle').textContent='Your account';
    $('intro').textContent='Manage your settings and saved research.';
  }else updateForm();
  hasSettings=false;
  for(const id of ['signedIn','settings','saved','history'])show(id,active);
  show('authPanel',!active);show('authForm',Boolean(client));
  $('feedbackForm').querySelector('button').disabled=!active;$('contactForm').querySelector('button').disabled=!active;
  for(const id of ['feedbackStatus','contactStatus'])status(id,active?'':'Sign in to submit.');
  for(const id of ['settingsStatus','historyStatus','savedStatus'])status(id,'');
  $('settingsForm').querySelector('button').disabled=true;
  $('savedItems').replaceChildren();$('historyItems').replaceChildren();
  if(!active){$('who').textContent='';return}
  $('who').textContent=session.user.email||'Authenticated account';
  $('contactEmail').value=session.user.email||'';
  const loaders=[
    ['settingsStatus','/api/me/settings',data=>{
      const s=data.settings;$('readingMode').value=s.readingMode;$('savedTheme').value=s.theme;$('saveHistory').checked=s.saveHistory;
      hasSettings=true;$('settingsForm').querySelector('button').disabled=false;
    }],
    ['savedStatus','/api/me/saved',data=>renderSaved(data.items)],
    ['historyStatus','/api/me/history',data=>renderHistory(data.items)],
  ];
  await Promise.all(loaders.map(async([id,path,draw])=>{
    try{const data=await accountRequest(path);if(generation===userGeneration)draw(data)}
    catch(error){if(generation===userGeneration)status(id,failure(error,'Account data unavailable.'))}
  }));
}
function renderSaved(items){
  const root=$('savedItems');root.replaceChildren();
  for(const row of items){
    const line=text('div','');line.className='row';
    const open=text('a',row.title||row.topic);open.href=researchUrl(row.topic);
    line.append(open,text('small',' · '+row.kind));
    if(row.url){try{const url=new URL(row.url);if(url.protocol==='https:'){const source=text('a',' Open source ↗');source.href=url.href;source.rel='noopener noreferrer';source.target='_blank';line.append(source)}}catch{/* Skip malformed legacy URL. */}}
    const remove=text('button','Remove');remove.type='button';line.append(remove);
    remove.onclick=async()=>{remove.disabled=true;try{
      await accountRequest('/api/me/saved/'+encodeURIComponent(row.id),{method:'DELETE'});line.remove();
      if(!root.children.length)root.append(text('p','No saved items yet.'));
    }catch(error){remove.disabled=false;status('savedStatus',failure(error,'Removal failed.'))}};
    root.append(line);
  }
  if(!items.length)root.append(text('p','No saved items yet.'));
}
function renderHistory(items){
  const root=$('historyItems');root.replaceChildren();
  for(const row of items){
    const line=text('div','');line.className='row';
    const open=text('a',row.questionLabel||row.topic);open.href=researchUrl(row.topic,row.section);
    line.append(open,text('small',' · '+row.kind+' · '+new Date(row.created_at).toLocaleString()));root.append(line);
  }
  if(!items.length)root.append(text('p','No saved public research activity.'));
  $('clearHistory').disabled=!items.length;
}
function clearTabData(){
  clearResearchSession();
  for(const id of ['feedbackForm','contactForm','authForm'])$(id).reset();
  contactAttempt=null;recovering=false;challenge=null;
}
async function finishRecovery(){
  checked(await client.auth.signOut({scope:'local'}));session=null;
  sessionStorage.removeItem('hb-account-recovery');recovering=false;clearTabData();
  switchMode('login');status('authStatus','Password updated. Sign in with your new password.');
}
$('authForm').onsubmit=async e=>{
  e.preventDefault();if(!client||authBusy)return;
  authBusy=true;updateForm();
  const email=$('email').value.trim(),password=$('password').value;
  try{
    if(challenge){
      const kind=challenge.kind;
      session=await confirmEmailChallenge(client.auth,challenge,$('code').value);challenge=null;$('code').value='';
      if(kind==='recovery'){recovering=true;sessionStorage.setItem('hb-account-recovery','1');status('authStatus','Code verified. Choose a new password.')}
    }else if(recovering){
      await updateRecoveredPassword(client.auth,password);await finishRecovery();
    }else if(mode==='login'){
      session=await passwordLogin(client.auth,email,password);
      $('password').value='';
    }else{
      challenge=await startEmailChallenge(client.auth,mode,email,password,accountURL);
      $('password').value='';
      const messages={signup:'If signup can proceed, you will receive a confirmation email.',login:'If this account can sign in, check your email for a code or link.',recovery:'If this email belongs to an account, check it for password reset instructions.'};
      status('authStatus',messages[challenge.kind]);
    }
    if(session&&!recovering)history.replaceState(null,'',location.pathname);
    await loadAccount();
  }catch(error){
    status('authStatus',authErrorMessage(error));
  }finally{authBusy=false;updateForm()}
};
$('cancelFlow').onclick=async()=>{
  if(recovering&&client){try{checked(await client.auth.signOut({scope:'local'}))}catch(error){status('authStatus',failure(error,'Sign-out failed.'));return}}
  recovering=false;sessionStorage.removeItem('hb-account-recovery');switchMode('login');session=null;await loadAccount();
};
$('showPassword').onchange=()=>{$('password').type=$('showPassword').checked?'text':'password'};
$('generate').onclick=()=>{ $('password').value=suggestedPassword();$('showPassword').checked=true;$('password').type='text';status('authStatus','Suggested password generated. Save it in your password manager.'); };
$('google').onclick=async()=>{
  $('google').disabled=true;
  try{checked(await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:accountURL}}))}
  catch(error){status('authStatus',failure(error,'Google sign-in failed.'));updateForm()}
};
const signOut=async()=>{
  try{checked(await client.auth.signOut({scope:'local'}));session=null;clearTabData();switchMode('login');await loadAccount()}
  catch(error){status('settingsStatus',failure(error,'Sign-out failed. Try again.'))}
};
$('logout').onclick=signOut;$('accountSignOut').onclick=signOut;
$('settingsForm').onsubmit=async e=>{
  e.preventDefault();if(!hasSettings)return;
  const generation=userGeneration,submit=$('settingsForm').querySelector('button');submit.disabled=true;
  try{
    const settings={saveHistory:$('saveHistory').checked,readingMode:$('readingMode').value,theme:$('savedTheme').value};
    await accountRequest('/api/me/settings',{method:'PATCH',body:settings});
    if(generation===userGeneration){sessionStorage.setItem('hb-reader',JSON.stringify(settings.readingMode));
      if(settings.theme==='system')localStorage.removeItem('healthbrowse-theme');else localStorage.setItem('healthbrowse-theme',settings.theme);
      document.documentElement.dataset.theme=settings.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):settings.theme;
      status('settingsStatus','Settings saved.');}
  }catch(error){status('settingsStatus',failure(error,'Settings could not be saved.'))}
  finally{if(generation===userGeneration)submit.disabled=false}
};
$('clearHistory').onclick=async()=>{
  if(!confirm('Clear all saved research history for this account?'))return;
  $('clearHistory').disabled=true;
  try{await accountRequest('/api/me/history',{method:'DELETE'});renderHistory([]);status('historyStatus','History cleared.')}
  catch(error){$('clearHistory').disabled=false;status('historyStatus',failure(error,'Could not clear history.'))}
};
$('feedbackForm').onsubmit=async e=>{
  e.preventDefault();const submit=e.target.querySelector('button');submit.disabled=true;
  try{const {feedback}=await accountRequest('/api/feedback',{method:'POST',body:{message:$('feedbackMessage').value.trim()}});
    $('feedbackMessage').value='';status('feedbackStatus','Received. Category: '+feedback.type+'. Sentiment: '+feedback.sentiment+'. Review: '+feedback.reviewStatus+'.')}
  catch(error){status('feedbackStatus',failure(error,'Feedback could not be submitted.'))}
  finally{submit.disabled=!session}
};
$('contactForm').onsubmit=async e=>{
  e.preventDefault();const submit=e.target.querySelector('button');submit.disabled=true;
  const data={name:$('contactName').value.trim(),email:$('contactEmail').value.trim(),message:$('contactMessage').value.trim()};
  const signature=JSON.stringify(data);
  if(contactAttempt?.signature!==signature)contactAttempt={signature,id:crypto.randomUUID()};
  try{
    const result=await accountRequest('/api/contact',{method:'POST',body:{...data,requestId:contactAttempt.id}});
    if(result.status==='sent'){status('contactStatus','Your message was sent to the product team.');contactAttempt=null;$('contactMessage').value=''}
    else status('contactStatus','Delivery pending. You may retry this same message without creating a second request.');
  }catch(error){status('contactStatus',failure(error,'Delivery has not been confirmed. You may retry.'))}
  finally{submit.disabled=!session}
};

async function init(){
  readingModes.forEach(r=>$('readingMode').append(new Option(r)));
  const view=new URLSearchParams(location.search).get('view');
  if(Object.hasOwn(modes,view))mode=view;
  else if(location.hash==='#signup')mode='signup';
  updateForm();
  try{
    client=await getAuthClient();
    const url=new URL(location.href),fragment=new URLSearchParams(url.hash.slice(1));
    if(url.searchParams.has('code')||url.searchParams.has('error')||fragment.has('error'))history.replaceState(null,'',url.pathname);
    const callback=await completeAuthCallback(client.auth,url);
    if(callback?.recovering){recovering=true;sessionStorage.setItem('hb-account-recovery','1')}
    session=checked(await client.auth.getSession()).session;
    recovering=Boolean(session)&&sessionStorage.getItem('hb-account-recovery')==='1';
    client.auth.onAuthStateChange((event,newSession)=>{
      if(authBusy)return;
      if(event==='SIGNED_OUT'){clearTabData();session=null;setTimeout(()=>loadAccount(),0)}
      else if(newSession?.user.id===session?.user.id){session=newSession}
    });
    status('authStatus','');await loadAccount();
  }catch(error){status('authStatus',authErrorMessage(error))}
  finally{show('authForm',Boolean(client));updateForm()}
}
init();
