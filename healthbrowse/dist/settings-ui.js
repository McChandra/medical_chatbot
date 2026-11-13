import {accountRequest,getAccessToken} from './account-client.js';
import {changeAccountPassword,authErrorMessage} from './account-flows.js';
import {readingLabel} from './account-utils.js';
export const settingsSections=['profile','security','notifications','settings','privacy','chats','saved','help'];
export const settingsSection=hash=>({workspace:'profile',history:'chats',contact:'help',feedback:'help',deleteHistory:'privacy'}[hash.replace(/^#/,'')]|| (settingsSections.includes(hash.replace(/^#/,''))?hash.replace(/^#/,''):'profile'));
export function passwordCriteria(password,confirmation){return {length:Array.from(password).length>=12,bytes:password.length>0&&new TextEncoder().encode(password).length<=72,match:password.length>0&&password===confirmation}}
export function setupAccountSettings({getClient,getSession}){
 const $=id=>document.getElementById(id);let enabled=false,avatar='',originalEmail='',timezone='UTC',toastTimer;
 const message=(id,value)=>{$(id).textContent=value};
 function toast(value){clearTimeout(toastTimer);$('settingsToast').textContent=value;$('settingsToast').hidden=false;toastTimer=setTimeout(()=>$('settingsToast').hidden=true,4500)}
 function select(hash=location.hash,focus=false){
  const selected=settingsSection(hash);
  document.querySelectorAll('[data-settings-panel]').forEach(panel=>panel.hidden=!enabled||panel.dataset.settingsPanel!==selected);
  document.querySelectorAll('[data-settings-link]').forEach(link=>{if(link.dataset.settingsLink===selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});
  $('settingsSection').value=selected;
  if(focus){const target=document.querySelector('[data-settings-panel="'+selected+'"] h2');if(target){target.tabIndex=-1;target.focus({preventScroll:true})}}
 }
 window.addEventListener('hashchange',()=>select(location.hash,true));
 $('settingsSection').onchange=()=>{location.hash=$('settingsSection').value};
 function paintAvatar(){
  $('avatarPreview').hidden=!avatar;$('avatarInitials').hidden=!!avatar;
  if(avatar)$('avatarPreview').src=avatar;else $('avatarPreview').removeAttribute('src');
  $('avatarInitials').textContent=[$('firstName').value,$('lastName').value].map(s=>s.trim().charAt(0)).join('').toUpperCase()||'HB';
  $('removeAvatar').disabled=!avatar;
 }
 for(const id of ['firstName','lastName'])$(id).addEventListener('input',paintAvatar);
 $('avatarUpload').onchange=async()=>{
  const file=$('avatarUpload').files?.[0];if(!file)return;
  try{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Choose a JPG, PNG or WebP image smaller than 2 MB.');
   const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
   const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,128,128);
   const side=Math.min(bitmap.width,bitmap.height);context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,128,128);bitmap.close();
   let candidate=canvas.toDataURL('image/jpeg',.8);if(candidate.length>18000)candidate=canvas.toDataURL('image/jpeg',.5);
   if(candidate.length>18000)throw Error('This image is too detailed. Choose a simpler profile photo.');
   avatar=candidate;paintAvatar();message('avatarStatus','Photo ready. Save changes to update your account.');
  }catch(error){message('avatarStatus',error.message)}finally{$('avatarUpload').value=''}
 };
 $('removeAvatar').onclick=()=>{avatar='';paintAvatar();message('avatarStatus','Photo removed from preview. Save changes to confirm.')};
 $('nameForm').onsubmit=async event=>{
  event.preventDefault();const owner=getSession()?.user.id,button=event.target.querySelector('button[type=submit]');button.disabled=true;
  const entered=$('profilePhone').value.replace(/[\s().-]/g,'');
  const phone=entered?(entered.startsWith('+')?entered:$('phoneCountry').value+entered):'';
  try{
   if(phone&&!/^\+[1-9]\d{6,14}$/.test(phone)){$('profilePhone').setAttribute('aria-invalid','true');throw Error('Enter a phone number with country code, such as +919876543210.')}
   $('profilePhone').removeAttribute('aria-invalid');
   const {profile:data}=await accountRequest('/api/me/profile',{method:'PATCH',body:{firstName:$('firstName').value.trim(),lastName:$('lastName').value.trim(),phone,avatar}});
   if(owner!==getSession()?.user.id)return;
   profile(data);message('nameStatus','Profile updated successfully.');toast('Profile updated');
  }catch(error){if(owner===getSession()?.user.id)message('nameStatus',error.message)}finally{button.disabled=false}
 };
 function editEmail(edit){$('profileEmail').disabled=!edit;$('emailEditActions').hidden=!edit;$('editEmail').hidden=edit;if(edit)$('profileEmail').focus();else {$('profileEmail').value=originalEmail;$('profileEmail').removeAttribute('aria-invalid')}}
 $('editEmail').onclick=()=>editEmail(true);$('cancelEmailEdit').onclick=()=>editEmail(false);
 $('profileEmail').oninput=()=>{$('profileEmail').setAttribute('aria-invalid',String(!$('profileEmail').validity.valid));message('emailStatus',$('profileEmail').validity.valid?'':'Enter a valid email address.')};
 function profile(data){
  const parts=(data.name||'').trim().split(/\s+/);
  $('firstName').value=data.firstName||parts[0]||'';$('lastName').value=data.lastName||(!data.firstName?parts.slice(1).join(' '):'');
  $('displayName').value=data.name||'';$('phoneCountry').value='';$('profilePhone').value=data.phone||'';avatar=data.avatar||'';paintAvatar();
  originalEmail=data.email||'';editEmail(false);$('currentEmail').textContent='Current email: '+originalEmail;
  if(data.pendingEmail)message('emailStatus','Confirmation pending for '+data.pendingEmail+'.');
 }
 const timezones=[...new Set(['UTC',Intl.DateTimeFormat().resolvedOptions().timeZone,...(Intl.supportedValuesOf?.('timeZone')||[])])];
 timezones.forEach(zone=>$('settingsTimezone').append(new Option(zone.replaceAll('_',' '),zone)));
 function preferences(data){timezone=data.timezone||'UTC';if(!timezones.includes(timezone))$('settingsTimezone').append(new Option(timezone,timezone));$('settingsTimezone').value=timezone;$('profileRole').value=readingLabel(data.readingMode)}
 function formatTime(value){try{return new Date(value).toLocaleString(undefined,{timeZone:timezone})}catch{return 'Time unavailable'}}
 const updateStrength=()=>{
  const password=$('newPassword').value,criteria=passwordCriteria(password,$('confirmPassword').value);
  const variety=[/[a-z]/,/[A-Z]/,/\d/,/[^\w]/].filter(re=>re.test(password)).length;
  const score=password?Math.min(4,Math.floor(Array.from(password).length/8)+(variety>1?1:0)):0;
  $('passwordStrength').value=score;$('strengthLabel').textContent=password?'Length and variety indicator: '+score+'/4. Use a unique password or passphrase.':'Use a long, unique passphrase.';
  for(const [key,id] of [['length','criterionLength'],['bytes','criterionBytes'],['match','criterionMatch']])$(id).classList.toggle('met',criteria[key]);
  if($('confirmPassword').value)$('confirmPassword').setAttribute('aria-invalid',String(!criteria.match));
 };
 $('newPassword').oninput=$('confirmPassword').oninput=updateStrength;
 $('changePasswordForm').onsubmit=async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
  try{await changeAccountPassword(getClient().auth,$('currentPassword').value,$('newPassword').value,$('confirmPassword').value);event.target.reset();updateStrength();message('passwordStatus','Password updated.');toast('Password updated')}
  catch(error){message('passwordStatus',authErrorMessage(error))}finally{button.disabled=false}
 };
 $('signOutOthers').onclick=async()=>{
  const button=$('signOutOthers');button.disabled=true;
  try{const {error}=await getClient().auth.signOut({scope:'others'});if(error)throw error;message('sessionsStatus','Other sessions cannot refresh. Existing access tokens can remain valid until expiry. This session stays signed in.');toast('Other sessions revoked')}
  catch(error){message('sessionsStatus',authErrorMessage(error))}finally{button.disabled=false}
 };
 async function security(){
  const ua=navigator.userAgent;const device=/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'Mac':/Linux/.test(ua)?'Linux':'This device';
  const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Browser';
  $('currentDevice').textContent=device+' · '+browser;$('sessionDetail').textContent=getSession()?.user.last_sign_in_at?'Account last sign-in: '+formatTime(getSession().user.last_sign_in_at):'You are signed in in this browser.';
  const userId=getSession()?.user.id;
  try{const {data,error}=await getClient().auth.mfa.listFactors();if(error)throw error;if(userId!==getSession()?.user.id)return;
   const verified=data.all?.some(f=>f.status==='verified');$('mfaStatus').textContent=verified?'Enabled with provider':'Not enabled';
   $('mfaExplanation').textContent=verified?'Your sign-in provider reports a verified second factor.':'No verified second factor is registered with the app’s sign-in provider. Google account protections are managed separately.';
  }catch{if(userId!==getSession()?.user.id)return;$('mfaStatus').textContent='Status unavailable';$('mfaExplanation').textContent='Could not verify your second-factor status.'}
 }
 $('exportData').onclick=async()=>{
  const button=$('exportData');button.disabled=true;message('exportStatus','Preparing your research data…');
  try{const token=await getAccessToken();if(!token)throw Error('Sign in again to export your data.');
   const response=await fetch('/api/me/export',{headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error'});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Export could not finish. Try again.')}
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='healthbrowse-research-data-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   message('exportStatus','Download prepared. Keep this file private; it contains your saved account and research data.');toast('Research data export ready');
  }catch(error){message('exportStatus',error.message)}finally{button.disabled=false}
 };
 return {profile,preferences,formatTime,toast,select,security,activate(active){enabled=active;$('settingsShell').hidden=!active;for(const id of ['chats','history'])$(id).hidden=!active;select();if(!active){avatar='';$('avatarPreview').removeAttribute('src');for(const id of ['nameForm','emailForm','changePasswordForm'])$(id).reset();$('settingsToast').hidden=true;clearTimeout(toastTimer)}}};
}
