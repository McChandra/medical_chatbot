// Wire the form before the larger research modules and source data finish loading.
// Only the authenticated app supplies the search handler. Nothing is sent here.
export function attachSearch({form,input,submit,notice,examples=[],reload}) {
  let handler=null,pending='',failed=false;
  const idle=()=>{submit.disabled=false;submit.textContent='Search ↗';form.setAttribute('aria-busy','false')};
  const run=query=>Promise.resolve().then(()=>handler(query)).catch(()=>{
    notice.textContent='This search could not finish. Your question is still here. Please try again.';
    idle();
  });
  function send(query=input.value){
    if(failed){reload();return}
    query=String(query||'').trim();
    if(!query){notice.textContent='Enter a medical question or choose an example.';input.focus();return}
    input.value=query;
    if(handler)return run(query);
    pending=query;submit.textContent='Loading sources…';
    form.setAttribute('aria-busy','true');
    notice.textContent='Your question is queued. It will run as soon as the medical sources are ready.';
  }
  form.onsubmit=event=>{event.preventDefault();void send()};
  for(const button of examples)button.onclick=()=>{void send(button.dataset.topic)};
  idle();
  return {
    send,
    ready(search){handler=search;idle();const query=pending;pending='';if(query){void run(query);return true}return false},
    fail(){failed=true;idle();submit.type='button';submit.onclick=reload;submit.textContent='Reload research desk';notice.textContent='The research desk could not start. Reload to reconnect the medical sources.'}
  };
}

export const searchUI=typeof document==='undefined'?null:attachSearch({
  form:document.getElementById('find'),input:document.getElementById('query'),
  submit:document.getElementById('searchSubmit'),notice:document.getElementById('notice'),
  examples:document.querySelectorAll('[data-topic]'),reload:()=>location.reload()
});
