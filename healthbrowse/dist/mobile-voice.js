// Voice starts only after an explicit browser-service disclosure and user action.
export function createDictation({Recognition,onText,onStatus,onState=()=>{},schedule=setTimeout,unschedule=clearTimeout}){
 let active=null,timer;
 function stop(){const current=active;active=null;unschedule(timer);try{current?.abort()}catch{}if(current){onState(false);onStatus('Voice input stopped. Review your question before sending.');}}
 return {stop,start(){
  if(!Recognition){onStatus('Voice typing is unavailable. Use the keyboard microphone or type your question.');return false}
  stop();let failed=false,recognition;
  try{recognition=new Recognition();active=recognition;recognition.lang='en-US';recognition.continuous=false;recognition.interimResults=false;
   recognition.onresult=event=>{if(active!==recognition)return;let text='';for(let i=event.resultIndex;i<event.results.length;i++)if(event.results[i].isFinal)text+=event.results[i][0].transcript+' ';if(text.trim())onText(text.trim());};
   recognition.onerror=()=>{if(active!==recognition)return;failed=true;onStatus('Voice input could not finish. Check microphone permission or type your question.');};
   recognition.onend=()=>{if(active!==recognition)return;active=null;onState(false);unschedule(timer);if(!failed)onStatus('Review your question, then tap Send.');};
   recognition.start();onState(true);onStatus('Listening… Tap Stop voice when finished.');timer=schedule(stop,30000);return true;
  }catch{active=null;onState(false);onStatus('Voice typing could not start. You can still type your question.');return false}
 }};
}
export function createLocalReader({synthesis,Utterance,onStatus}){
 return {stop(){synthesis?.cancel()},read(text){
  synthesis?.cancel();const voice=synthesis?.getVoices().find(v=>v.localService&&/^en\b/i.test(v.lang));
  if(!voice||!Utterance){onStatus('An on-device English reading voice is unavailable. The text remains available.');return false}
  const utterance=new Utterance(text);utterance.voice=voice;utterance.rate=.95;utterance.onend=()=>onStatus('Reading finished.');utterance.onerror=()=>onStatus('Reading stopped.');synthesis.speak(utterance);onStatus('Reading aloud. Tap anywhere to stop.');return true;
 }};
}
export function bindLongPress(element,action,{schedule=setTimeout,unschedule=clearTimeout}={}){
 let timer,start,held=false;
 const cancel=()=>{unschedule(timer);timer=null};
 element.addEventListener('pointerdown',event=>{if(event.button!==0)return;held=false;start={x:event.clientX,y:event.clientY};timer=schedule(()=>{held=true;action()},550)});
 element.addEventListener('pointermove',event=>{if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>12)cancel()});
 element.addEventListener('pointerup',()=>{cancel();start=null});
 for(const event of ['pointercancel','pointerleave'])element.addEventListener(event,()=>{cancel();start=null;held=false});
 element.addEventListener('click',event=>{if(held){event.preventDefault();event.stopImmediatePropagation();held=false}},true);
}
