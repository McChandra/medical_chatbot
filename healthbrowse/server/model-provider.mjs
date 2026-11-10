// Credentials are resolved only on the server, never in the browser bundle.
export const HF_CHAT_URL='https://router.huggingface.co/v1/chat/completions';
export const GENERAL_MODEL='meta-llama/Meta-Llama-3-8B-Instruct:featherless-ai';
export function modelEndpoint(env,route){
 const general=route==='general',prefix=general?'MODEL_GENERAL_':'MODEL_PROFESSIONAL_';
 const url=env[prefix+'URL']||(general?HF_CHAT_URL:''),model=env[prefix+'ID']||(general?GENERAL_MODEL:'');
 // An HF token must never fall through to a different provider or the clinician route.
 const key=env[prefix+'KEY']||(general&&url===HF_CHAT_URL?env.HF_TOKEN:'');
 if(!url||!key||!model)return null;
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!u.hostname.includes('.')||/^(?:[\d.]+|\[)/.test(u.hostname)||/\.(?:local|internal|localhost)$/.test(u.hostname))return null}catch{return null}
 const llama3=model.split(':')[0]==='meta-llama/Meta-Llama-3-8B-Instruct';
 // Dedicated adapters can opt into the same context profile using this setting.
 const compact=llama3||(general&&env.MODEL_GENERAL_CONTEXT_TOKENS==='8192');
 return {url,key,model,compact};
}
