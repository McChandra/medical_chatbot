// This controller never opens the conversation or steals keyboard focus.
export function createBuddyWelcome({claim,canShow,onShow,onHide,sound}){
 let checked=false,granted=false,visible=false,dismissed=false;
 function display(){if(!dismissed&&granted&&!visible&&canShow()){visible=true;onShow();void sound.play()}}
 function dismiss(){dismissed=true;granted=false;if(visible){visible=false;onHide()}sound.dispose()}
 async function sync(){
  if(dismissed)return;
  if(visible&&!canShow()){dismiss();return}
  if(!canShow())return;
  if(checked){display();return}
  checked=true;
  try{granted=(await claim()).showWelcome===true;if(!granted)sound.dispose();display()}
  catch{sound.dispose()} // An unavailable account service must not spam visitors.
 }
 return {sync,dismiss,arm(){if(!dismissed&&!checked)sound.arm()},used(){if(!checked){checked=true;void claim().catch(()=>{})}dismiss()}};
}

export function createWelcomeTone({AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,isVisible=()=>document.visibilityState==='visible',schedule=setTimeout}={}){
 let context=null,played=false,disposed=false;
 function arm(){
  if(disposed||played||!AudioContext||!isVisible())return;
  try{context??=new AudioContext();if(context.state==='suspended')void context.resume().catch(()=>{})}catch{}
 }
 function dispose(){disposed=true;if(context&&context.state!=='closed')void context.close().catch(()=>{})}
 function play(){
  if(disposed||played||!isVisible())return false;
  arm();if(context?.state!=='running')return false; // Autoplay blocked: visual welcome still works.
  played=true;
  try{
   const start=context.currentTime;
   [659.25,880].forEach((frequency,i)=>{
    const oscillator=context.createOscillator(),gain=context.createGain(),at=start+i*.14;
    oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.035,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+.22);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start(at);oscillator.stop(at+.24);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
   });
   schedule(dispose,650);return true;
  }catch{dispose();return false}
 }
 return {arm,play,dispose};
}
