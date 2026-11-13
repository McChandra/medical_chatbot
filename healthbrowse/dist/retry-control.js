export function retryState(answer,now=Date.now()){
 if(!['provider_busy','rate_limited'].includes(answer?.code))return null;
 const remaining=Number.isFinite(answer.retryAt)?Math.max(0,Math.ceil((answer.retryAt-now)/1000)):0;
 return {disabled:remaining>0,label:remaining>0?'Retry AI answer in '+(remaining<60?remaining+'s':Math.ceil(remaining/60)+' min'):'Retry AI answer'};
}
export function renderRetry(parent,answer,onRetry){
 if(!onRetry||!retryState(answer))return;
 const button=document.createElement('button');button.type='button';button.className='act';
 const update=()=>{const state=retryState(answer);button.disabled=state.disabled;button.textContent=state.label;return state};
 update();button.onclick=()=>{if(!update().disabled){button.disabled=true;onRetry()}};parent.append(button);
 // Start after the parent is mounted; stop ticking when this answer is replaced.
 const tick=()=>{if(!button.isConnected)return;if(update().disabled)setTimeout(tick,1000)};
 if(button.disabled)setTimeout(tick,1000);
}
