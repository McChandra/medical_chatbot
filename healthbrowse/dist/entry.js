(() => {
  const dialog=document.getElementById('welcome'), consent=document.getElementById('consent');
  consent.required=true;
  document.getElementById('enterDesk').onclick=()=>{
    if(!consent.reportValidity())return;
    try{sessionStorage.setItem('hb-terms','yes')}catch{}
    dialog.close();document.dispatchEvent(new Event('research-ready'));
  };
  let accepted=false;try{accepted=sessionStorage.getItem('hb-terms')==='yes'}catch{}
  if(!accepted){dialog.addEventListener('cancel',e=>e.preventDefault());dialog.showModal()}
  if('serviceWorker' in navigator && window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
})();
