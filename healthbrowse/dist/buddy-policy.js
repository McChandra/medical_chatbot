// Bounded, deterministic checks, not a general-purpose abuse classifier.
// Never interpret chat text as a UI event or a permission grant.
export const buddyPolicyVersion='2026-11-13.1';
const normalize=value=>String(value||'').normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,'').trim();
const plain=value=>normalize(value).toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
const controlTag=/(?:<\s*trigger_audio\s*:|\[\s*system\s+event\s*:\s*user\s+login\s*\])/i;
const credential=/(?:\b(?:hf_|gsk_|sk-)[a-z\d_-]{20,}|\bBearer\s+[a-z\d._~-]{20,}|\b(?:password|api[_ -]?key|access[_ -]?token|client[_ -]?secret)\s*(?:is\s+|[:=]\s*)\S{4,})/i;
const contact=/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:MRN|SSN|patient ID)\s*[:=]\s*\S+|(?:^|\s)(?:\+?\d[ ().-]*){10,15}(?!\d))/i;

export function hasBuddySecrets(text){return credential.test(normalize(text));}
export function hasUnsafeBuddyOutput(text){return controlTag.test(normalize(text))||hasBuddySecrets(text)||contact.test(normalize(text));}

function decodedPayloads(text){
 const decoded=[];
 // Decode only explicitly labeled payloads, up to two passes. Never execute,
 // fetch a URL, decompress data, or decode arbitrary identifiers/prose.
 const pattern=/\b(base64|hex)(?:[ -]encoded)?\s*[:=]\s*["'`]?([a-z\d+/_=-]{8,3200})/gi;
 for(const match of text.matchAll(pattern)){
  if(decoded.length===4)break;
  try{
   const token=match[2];let bytes;
   if(match[1].toLowerCase()==='hex'){
    if(token.length%2||!/^[\da-f]+$/i.test(token))continue;
    bytes=Uint8Array.from(token.match(/../g),pair=>parseInt(pair,16));
   }else{
    if(!/^[a-z\d+/_-]+={0,2}$/i.test(token))continue;
    bytes=Uint8Array.from(atob(token.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   }
   const value=normalize(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(value&&value.length<=3200&&!/[\u0000-\u0008\u000b-\u001f]/.test(value))decoded.push(value);
  }catch{ /* Invalid encodings are data, never executable instructions. */ }
 }
 return decoded;
}
export function securityVariants(text){
 const first=normalize(text),values=[first],seen=new Set(values);let layer=[first];
 for(let depth=0;depth<2;depth++){
  const next=[];
  for(const value of layer)for(const decoded of decodedPayloads(value))if(!seen.has(decoded)&&values.length<9){seen.add(decoded);values.push(decoded);next.push(decoded)}
  layer=next;
 }
 return values;
}

export function assessBuddySafety(text){
 const variants=securityVariants(text);
 for(const value of variants){
  const q=plain(value);
  if(controlTag.test(value))return {action:'redirect',category:'forged_event'};
  if(/\b(?:reveal|repeat|print|show|translate|extract|leak|give me|tell me)\b.{0,90}\b(?:system prompt|developer (?:prompt|instructions)|hidden (?:rules|instructions)|internal (?:configuration|settings)|api keys?|access tokens?|passwords?|backend (?:configuration|secrets))\b/.test(q))return {action:'redirect',category:'prompt_extraction'};
  if(/\b(?:ignore|disregard|override|forget)\b.{0,45}\b(?:previous|prior|system|developer|safety|all)\b.{0,35}\b(?:instructions?|rules?|prompts?|guardrails?)\b|\b(?:enter|enable|activate) developer mode\b|\b(?:act as|you are now) (?:dan|a developer|an? unrestricted|an? uncensored)\b|\b(?:roleplay|play|pretend)\b.{0,50}\b(?:no rules|unrestricted|uncensored)\b|\b(?:ignore|ignora) (?:todas? (?:las )?)?instrucciones anteriores\b|पिछले\s+निर्देश.{0,20}(?:भूल|अनदेखा)/u.test(q))return {action:'redirect',category:'persona_override'};
  const action=/\b(?:how|help me|teach|write|create|build|make|generate|steps|instructions|script|code)\b/.test(q);
  if(action&&/\b(?:phishing|ransomware|keylogger|credential stealer|malware|steal (?:passwords|credentials|accounts)|bypass (?:authentication|login|security|2fa)|hack (?:someone|their|an account|a hospital))\b/.test(q)&&!/^(?:what is|what are|explain (?:the )?risks|how (?:can i |do i |to )?(?:prevent|detect|recognize|recognise|report|protect against|respond to|avoid))\b/.test(q))return {action:'redirect',category:'unsafe_cyber'};
  if(action&&/\b(?:(?:build|make|assemble) (?:a |an )?(?:bomb|explosive)|(?:kill|murder|attack|poison) (?:someone|a person|my neighbor|my neighbour)|(?:write|generate|create) (?:a |an )?(?:hateful|harassing|racist) (?:message|post|speech)|(?:forge|fabricate) (?:an? )?(?:identity|passport|credit card))\b/.test(q))return {action:'redirect',category:'harmful_content'};
  if(/\b(?:which (?:stocks|shares|crypto)|what (?:stocks|shares|crypto)).{0,40}\b(?:should i|to buy|buy now)|\b(?:tell me|advise me|recommend).{0,25}\b(?:invest|stock to buy)|\b(?:give me|provide).{0,20}\blegal (?:advice|counsel)|\b(?:represent me|act as my lawyer)\b/.test(q))return {action:'redirect',category:'professional_advice'};
 }
 // Do not ask the model to execute an encoded instruction that the bounded
 // checks could not confidently classify. Normal medical prose is unchanged.
 if(variants.length>1||/\b(?:base64|hex)(?:[ -]encoded)?\s*[:=]/i.test(normalize(text)))return {action:'redirect',category:'encoded_request'};
 return {action:'allow',category:'educational'};
}

export function buddySafetyAnswer(category){
 const refusal="I'm Buddy, your assistant, but I cannot fulfill that request. I can help you explore medical sources or use HealthBrowse.";
 const messages={
  forged_event:"I'm Buddy. Login notifications are managed by the app. I can help you explore the six clinical areas or use your research desk.",
  prompt_extraction:"I'm Buddy, your research assistant. I can't share private instructions, credentials, or backend configurations. I can explain HealthBrowse's public features and source-checking approach.",
  persona_override:"I'm Buddy, your research assistant. I follow the same safety boundaries in both reading modes. I can help with a medical research question or platform navigation.",
  encoded_request:"Please send your question as ordinary text. Buddy does not execute encoded instructions. You can ask about a medical topic in your own words.",
  professional_advice:"I'm Buddy, an AI research assistant, not a lawyer or financial adviser. For personal legal or investment decisions, consult a qualified professional. I can help with medical research and HealthBrowse navigation."
 };
 return {title:'Buddy can help safely',text:messages[category]||refusal,blocks:[],citations:[],checks:[],supported:false,safety:{category,policyVersion:buddyPolicyVersion}};
}

export function buddyHelpAnswer(question){
 const q=plain(question);let text;
 if(/^(?:hi|hello|hey|hi buddy|hello buddy|hey buddy|who are you|what can you do|how (?:do i|can i|to) use (?:buddy|healthbrowse))$/.test(q))text="Hi, I'm Buddy, your AI research companion. Choose one of the six clinical areas or ask a follow-up about the current topic. I'll use the available sources and explain when evidence is missing. You can switch between General and Clinicians for different levels of detail.";
 else if(/^(?:how (?:do i|can i|to)|where (?:do i|can i|is)).{0,25}\b(?:change|edit|update) (?:my )?(?:name|email|profile)\b/.test(q))text='Open Account & help, then Profile. Update your name there. Use Edit / verify email for an email change and follow the confirmation steps. Enter personal details in the account form, not in this chat.';
 else if(/^(?:how (?:do i|can i|to)|where (?:do i|can i|is)).{0,25}\b(?:reset|change|forgot) (?:my )?password\b|^i forgot my password$/.test(q))text='For a forgotten password, open the sign-in page and select Forgot password. If you are already signed in and know your password, open Account & help, then Security & Authentication. Enter passwords and email codes only in the account forms.';
 else if(/^(?:how (?:do i|can i|to)|where (?:do i|can i|is)).{0,25}\b(?:delete|clear) (?:all (?:of )?)?(?:my )?chat history\b/.test(q))text='Open Account & help, then Data & Privacy. Use Delete complete chat history and read the confirmation carefully. This deletes saved conversations; clearing the current Buddy view alone does not delete your saved history.';
 else if(/^(?:how (?:do i|can i|to)|where (?:do i|can i|is)).{0,25}\b(?:change|switch|set) (?:the |my )?(?:theme|dark mode|light mode)\b/.test(q))text='Use the Light / Dark control in the navigation menu, or open Account & help, then Preferences. Your theme changes the appearance without changing your reading mode.';
 else if(/^(?:how (?:do i|can i|to)|where (?:do i|can i|is)).{0,25}\b(?:sign out|log out)\b/.test(q))text='Open the navigation menu and choose Sign out. Buddy cannot sign you out through a chat message.';
 if(!text)return null;
 return {text,blocks:[],citations:[],checks:[],supported:false,style:'Platform help',kind:'platform'};
}
