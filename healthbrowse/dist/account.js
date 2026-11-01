import {startEmailChallenge,confirmEmailChallenge} from './account-flows.js';
import {accountRequest,getAuthClient} from './account-client.js';
import {readingModes,researchUrl,suggestedPassword,validPassword} from './account-utils.js';

const $=id=>document.getElementById(id);
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const status=(id,value)=>{$(id).textContent=value};
const show=(id,visible)=>{$(id).hidden=!visible};
const failure=(error,fallback)=>error instanceof Error?error.message:fallback;
const accountURL=new URL('/account.html',location.origin).href;
let client,session,mode='login',challenge=null,recovering=false,authBusy=false,userGeneration=0;
let contactAttempt=null,hasSettings=false;

const modes={
  login:['Log in with the password for your account. To use a one-time code, choose Email code.','Log in'],
  signup:['Create an account with a unique password. Confirm your address with the code sent by email.','Create account'],
  otp:['Log in to an existing account using a one-time code. Choose Sign up if you need an account.','Send sign-in code'],
  forgot:['Request a password recovery code. Use it in this tab to choose a new password.','Send recovery code'],
};
function updateForm(){
  const verifying=Boolean(challenge);
  const passwordNeeded=!verifying && (recovering||['signup','login'].includes(mode));
  $('authHelp').textContent=verifying?'Enter the latest code from your email.':recovering?'Choose a new password for the recovered account.':modes[mode][0];
  $('authSubmit').textContent=verifying?'Verify code':recovering?'Update password':modes[mode][1];
  $('email').disabled=authBusy||verifying||recovering;
  $('password').required=passwordNeeded;$('password').disabled=!passwordNeeded;
  $('password').autocomplete=mode==='login'&&!recovering?'current-password':'new-password';
  $('code').disabled=!verifying;$('code').required=verifying;
  $('authSubmit').disabled=authBusy||!client;
  show('codeGroup',verifying);show('passwordGroup',passwordNeeded);
  show('suggestionGroup',passwordNeeded&&(mode==='signup'||recovering));
  show('authModes',!verifying&&!recovering);show('cancelFlow',verifying||recovering);
  show('google',!verifying&&!recovering);$('google').disabled=authBusy||!client;
  for(const b of $('authModes').querySelectorAll('button')){b.disabled=authBusy||!client;b.setAttribute('aria-pressed',String(b.dataset.mode===mode))}
}
function switchMode(value){
  mode=value;challenge=null;$('code').value='';$('password').value='';$('showPassword').checked=false;
  $('password').type='password';status('authStatus','');updateForm();
}
function checked(result){if(result?.error)throw result.error;return result?.data}
async function loadAccount(){
  const generation=++userGeneration;
  const active=Boolean(session)&&!recovering;
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
  for(const key of ['hb-context','hb-transcript','hb-reader','hb-terms','hb-welcome','hb-account-recovery'])sessionStorage.removeItem(key);
  for(const id of ['feedbackForm','contactForm','authForm'])$(id).reset();
  contactAttempt=null;recovering=false;challenge=null;
}
async function finishRecovery(){
  sessionStorage.removeItem('hb-account-recovery');recovering=false;
  checked(await client.auth.signOut({scope:'local'}));session=null;clearTabData();
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
      if(!validPassword(password))throw new Error('Use at least 12 characters and no more than 72 UTF-8 bytes.');
      checked(await client.auth.updateUser({password}));await finishRecovery();
    }else if(mode==='login'){
      const result=checked(await client.auth.signInWithPassword({email,password}));session=result.session;
      $('password').value='';
    }else{
      challenge=await startEmailChallenge(client.auth,mode,email,password,accountURL);
      $('password').value='';
      const messages={signup:'If signup can proceed, you will receive a confirmation code.',login:'If this account can sign in, check your email for a code.',recovery:'If this email belongs to an account, check it for a recovery code or link.'};
      status('authStatus',messages[challenge.kind]);
    }
    await loadAccount();
  }catch(error){
    status('authStatus',failure(error,'Request unsuccessful.'));
  }finally{authBusy=false;updateForm()}
};
$('authModes').onclick=e=>{const b=e.target.closest('button[data-mode]');if(b)switchMode(b.dataset.mode)};
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
$('logout').onclick=async()=>{
  try{checked(await client.auth.signOut({scope:'local'}));session=null;clearTabData();switchMode('login');await loadAccount()}
  catch(error){status('settingsStatus',failure(error,'Sign-out failed. Try again.'))}
};
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
  updateForm();
  try{
    client=await getAuthClient();
    const url=new URL(location.href),code=url.searchParams.get('code'),err=url.searchParams.get('error');
    if(code||err){const safe=new URL(url);safe.search='';safe.hash='';history.replaceState(null,'',safe.pathname)}
    if(err)throw new Error('Account authorization was cancelled or could not complete. You may retry.');
    if(code){
      const data=checked(await client.auth.exchangeCodeForSession(code));
      if(!data.session)throw new Error('The sign-in link has expired. Request a new one.');
      if(url.searchParams.get('flow')==='recovery'){recovering=true;sessionStorage.setItem('hb-account-recovery','1')}
    }
    session=checked(await client.auth.getSession()).session;
    recovering=Boolean(session)&&sessionStorage.getItem('hb-account-recovery')==='1';
    client.auth.onAuthStateChange((event,newSession)=>{
      if(authBusy)return;
      if(event==='SIGNED_OUT'){clearTabData();session=null;setTimeout(()=>loadAccount(),0)}
      else if(newSession?.user.id===session?.user.id){session=newSession}
    });
    status('authStatus','');await loadAccount();
  }catch(error){status('authStatus',failure(error,'Account sign-in is unavailable.'))}
  finally{show('authForm',Boolean(client));updateForm()}
}
init();
