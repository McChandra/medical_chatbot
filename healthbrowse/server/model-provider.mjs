// Credentials are resolved only on the server, never in the browser bundle.
export const HF_CHAT_URL='https://router.huggingface.co/v1/chat/completions';
export const GENERAL_MODEL='meta-llama/Meta-Llama-3-8B-Instruct:featherless-ai';
export const GROQ_CHAT_URL='https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODEL='openai/gpt-oss-120b';
export function modelEndpoint(env,route){
 if(env.MODEL_PROVIDER==='groq'){
  // Both reading modes use the hosted model, with different evidence/prompt styles.
  // Never forward a Hugging Face or DR7 key to Groq.
  const model=env.GROQ_MODEL||GROQ_MODEL;
  if(!env.GROQ_API_KEY||!['openai/gpt-oss-120b','openai/gpt-oss-20b'].includes(model))return null;
  return {url:GROQ_CHAT_URL,key:env.GROQ_API_KEY,model,protocol:'groq-cited-v1',compact:false};
 }
 const general=route==='general',prefix=general?'MODEL_GENERAL_':'MODEL_PROFESSIONAL_';
 const url=env[prefix+'URL']||(general?HF_CHAT_URL:''),model=env[prefix+'ID']||(general?GENERAL_MODEL:'');
 // An HF token must never fall through to a different provider or the clinician route.
 const key=env[prefix+'KEY']||(general&&url===HF_CHAT_URL?env.HF_TOKEN:'');
 if(!url||!key||!model)return null;
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!u.hostname.includes('.')||/^(?:[\d.]+|\[)/.test(u.hostname)||/\.(?:local|internal|localhost)$/.test(u.hostname))return null}catch{return null}
 const llama3=model.split(':')[0]==='meta-llama/Meta-Llama-3-8B-Instruct';
 // Dedicated adapters can opt into the same context profile using this setting.
 const compact=llama3||(general&&env.MODEL_GENERAL_CONTEXT_TOKENS==='8192');
 const protocol=env[prefix+'PROTOCOL']||'legacy';
 if(!['legacy','grounded-v2'].includes(protocol))return null;
 return {url,key,model,compact,protocol};
}

// A format-trained generator must not silently replace the support reviewer.
// Reuse its credential only on the exact same endpoint URL.
export function modelReviewEndpoint(env,route){
 const generator=modelEndpoint(env,route);if(!generator)return null;
 if(generator.protocol==='groq-cited-v1')return {...generator,model:'openai/gpt-oss-20b'};
 const prefix=route==='general'?'MODEL_GENERAL_':'MODEL_PROFESSIONAL_';
 if(!env[prefix+'REVIEW_ID']&&!env[prefix+'REVIEW_URL']&&!env[prefix+'REVIEW_KEY'])return generator.protocol==='grounded-v2'?null:generator;
 const url=env[prefix+'REVIEW_URL']||generator.url;
 const key=env[prefix+'REVIEW_KEY']||(url===generator.url?generator.key:'');
 const model=env[prefix+'REVIEW_ID'];if(!model)return null;
 return modelEndpoint({[prefix+'URL']:url,[prefix+'KEY']:key,[prefix+'ID']:model,
                       [prefix+'CONTEXT_TOKENS']:env[prefix+'CONTEXT_TOKENS'],[prefix+'PROTOCOL']:env[prefix+'PROTOCOL']},route);
}
