// Reject accidentally supplied secret/service-role keys before returning any browser config.
export function browserConfig(env){
  const key=env.SUPABASE_ANON_KEY||'';
  let publishable=key.startsWith('sb_publishable_');
  if(!publishable && key.split('.').length===3)try{
    const payload=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    publishable=JSON.parse(atob(payload)).role==='anon';
  }catch{}
  try{
    const origin=new URL(env.SUPABASE_URL||'');
    if(!publishable || origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/' ||
      !(origin.protocol==='https:' || (origin.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))))throw Error();
    return {supabaseUrl:origin.origin,supabaseAnonKey:key};
  }catch{return {supabaseUrl:'',supabaseAnonKey:''}}
}
