const header=document.querySelector('.site-header');
const toggle=header?.querySelector('.nav-toggle');
const nav=header?.querySelector('nav');
if(toggle&&nav){
  const narrow=matchMedia('(max-width:70rem)');
  const close=(restoreFocus=false)=>{
    header.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded','false');
    if(restoreFocus)toggle.focus();
  };
  header.classList.add('nav-ready');
  toggle.addEventListener('click',()=>{
    const open=header.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded',String(open));
  });
  nav.addEventListener('click',event=>{
    const link=event.target.closest('a');
    if(!link||!narrow.matches)return;
    close();
    if(link.hash&&link.pathname===location.pathname){
      const target=document.getElementById(link.hash.slice(1));
      if(target){
        if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
        target.focus({preventScroll:true});
      }
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&header.classList.contains('nav-open'))close(true);
  });
  document.addEventListener('click',event=>{
    if(!header.contains(event.target))close();
  });
  narrow.addEventListener('change',()=>close());
}
