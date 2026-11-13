// Call only AFTER Supabase has verified this access token and returned its owner.
// Parsing claims is not a substitute for authentication; token refresh keeps session_id.
export function sessionIdFromVerifiedAccessToken(token,userId){
 try{
  if(typeof token!=='string'||token.length>16000)return null;
  const parts=token.split('.');if(parts.length!==3)return null;
  const payload=parts[1].replace(/-/g,'+').replace(/_/g,'/');
  const claims=JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'=')));
  return claims.sub===userId&&typeof claims.session_id==='string'&&/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(claims.session_id)?claims.session_id:null;
 }catch{return null}
}
