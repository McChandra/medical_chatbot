import {validPassword} from './account-utils.js';

// Numeric email codes require {{ .Token }} in the matching Supabase mail template.
export async function startEmailChallenge(auth, mode, email, password, redirectTo){
  let result;
  if(mode==='signup'){
    if(!validPassword(password))throw new Error('Use at least 12 characters and no more than 72 UTF-8 bytes.');
    result=await auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
    if(result.data?.session){
      await auth.signOut({scope:'local'});
      throw new Error('Enable Confirm email in Supabase before using email signup.');
    }
  }else if(mode==='otp'){
    result=await auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:redirectTo}});
  }else if(mode==='forgot'){
    result=await auth.resetPasswordForEmail(email,{redirectTo:redirectTo+'?flow=recovery'});
  }else throw new Error('Unknown email challenge.');
  if(result.error)throw result.error;
  return {kind:mode==='forgot'?'recovery':mode==='otp'?'login':'signup',email};
}

export async function confirmEmailChallenge(auth,challenge,token){
  if(!challenge||!['login','signup','recovery'].includes(challenge.kind))throw new Error('Request a new email code.');
  const {data,error}=await auth.verifyOtp({type:challenge.kind==='recovery'?'recovery':'email',email:challenge.email,token:token.trim()});
  if(error)throw error;
  if(!data.session)throw new Error('Could not confirm this code. Request another code.');
  return data.session;
}

export async function passwordLogin(auth,email,password){
  const {data,error}=await auth.signInWithPassword({email,password});
  if(error)throw error;
  if(!data?.session)throw new Error('Sign-in did not complete. Please try again.');
  return data.session;
}

export async function updateRecoveredPassword(auth,password){
  if(!validPassword(password))throw new Error('Use at least 12 characters and no more than 72 UTF-8 bytes.');
  const {error}=await auth.updateUser({password});
  if(error)throw error;
}

// Supabase can use Site URL (the home page) when redirectTo is not allowlisted.
// Keep the callback on this origin and preserve only authentication parameters.
export function authCallbackDestination(url){
  if(url.pathname==='/account.html')return null;
  const fragment=new URLSearchParams(url.hash.slice(1));
  if(!url.searchParams.has('code')&&!url.searchParams.has('error')&&!fragment.has('error'))return null;
  const destination=new URL('/account.html',url.origin);
  for(const key of ['code','sb_flow_id','flow','error','error_code']){
    const value=url.searchParams.get(key)??fragment.get(key);
    if(value!==null)destination.searchParams.set(key,value);
  }
  return destination.href;
}

// Capture callback parameters before removing them from browser history.
export async function completeAuthCallback(auth,url){
  const fragment=new URLSearchParams(url.hash.slice(1));
  if(url.searchParams.has('error')||fragment.has('error')){
    const code=url.searchParams.get('error_code')||fragment.get('error_code')||url.searchParams.get('error')||fragment.get('error');
    throw Object.assign(new Error('This sign-in link could not be used. Request a new email or try signing in again.'),{code});
  }
  const code=url.searchParams.get('code');
  if(!code)return null;
  const flowId=url.searchParams.get('sb_flow_id');
  const {data,error}=await auth.exchangeCodeForSession(code,flowId?{flowId}:undefined);
  if(error)throw error;
  if(!data?.session)throw new Error('This sign-in link has expired. Request a new one.');
  return {session:data.session,recovering:data.redirectType==='recovery'||url.searchParams.get('flow')==='recovery'};
}

export function authErrorMessage(error){
  const messages={
    invalid_credentials:'The email or password is incorrect. Try again or choose Forgot password.',
    email_not_confirmed:'Confirm your email before signing in. Check your inbox and spam folder for the confirmation email.',
    otp_expired:'This code or link has expired or was already used. Request a new one.',
    over_email_send_rate_limit:'Too many emails have been requested. Please wait before trying again.',
    over_request_rate_limit:'Too many attempts. Please wait before trying again.',
    email_address_not_authorized:'Email delivery is not available for this address yet. The site operator needs to configure an email sender. You can use Google sign-in.',
    email_provider_disabled:'Email sign-in is currently unavailable. Please use Google sign-in.',
    signup_disabled:'New account registration is currently unavailable.',
    weak_password:'Choose a stronger password with at least 12 characters. A long, unique passphrase works well.',
    same_password:'Choose a new password that differs from your current password.',
    flow_state_expired:'This sign-in request has expired. Please start again.',
    flow_state_not_found:'This sign-in request is no longer available. Please start again.',
    access_denied:'Sign-in was cancelled or Google denied access. Try again and complete the Google sign-in steps.',
    bad_oauth_callback:'Google could not finish signing you in. Try again. If this repeats, the site operator needs to check the Google OAuth configuration.',
    provider_disabled:'Google sign-in is currently unavailable. Please use email sign-in.',
    pkce_verifier_not_found:'Return to the original tab and site address where you started sign-in, then try again. For email sign-in, you can enter the code in that tab.',
  };
  if(error?.code&&messages[error.code])return messages[error.code];
  if(/code verifier|PKCE/i.test(error?.message||''))return messages.pkce_verifier_not_found;
  if(/fetch|network/i.test(error?.message||''))return 'Could not reach the sign-in service. Check your connection and try again.';
  return error?.message||'Request unsuccessful. Please try again.';
}
