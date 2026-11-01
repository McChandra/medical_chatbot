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
