let pendingClient;
const configError='Account access has not been configured. The public research desk is available.';

export function publicAuthConfig(config) {
  if(!config?.supabaseUrl||!config?.supabaseAnonKey)throw new Error(configError);
  const url=new URL(config.supabaseUrl);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
      (url.protocol!=='https:'&&!(local&&url.protocol==='http:')))throw new Error(configError);
  return {url:url.origin,key:config.supabaseAnonKey};
}

export async function getAuthClient(){
  if(!pendingClient)pendingClient=(async()=>{
    const response=await fetch('/api/config',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error(configError);
    const {url,key}=publicAuthConfig(await response.json());
    const {createClient}=await import('./supabase-client.js');
    return createClient(url,key,{auth:{
      flowType:'pkce',storage:sessionStorage,storageKey:'hb-supabase-session',
      persistSession:true,autoRefreshToken:true,detectSessionInUrl:false
    }});
  })().catch(error=>{pendingClient=null;throw error});
  return pendingClient;
}

export async function getAccessToken(){
  const client=await getAuthClient();
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  return data.session?.access_token||null;
}

export async function accountRequest(path,{method='GET',body,signal}={}){
  if(!/^\/api\/(?:me\/|feedback(?:$|\?)|contact(?:$|\?))/.test(path)||new URL(path,location.origin).origin!==location.origin)
    throw new Error('Invalid account endpoint.');
  const token=await getAccessToken();
  if(!token)throw new Error('Sign in first to use your account.');
  const response=await fetch(path,{method,signal,cache:'no-store',redirect:'error',
    headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(response.status===204)return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Account request failed. Try again.');
  return data;
}

export function clearResearchSession(){
  for(const key of ['hb-context','hb-transcript','hb-reader','hb-terms','hb-welcome','hb-account-recovery']){
    sessionStorage.removeItem(key);
  }
}
