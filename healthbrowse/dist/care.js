// Keep user-entered location in this form only; never store or include it in a URL.
const careNode=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
const careLink=(title,url)=>{
  const a=careNode('a',title+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
};
let existingCare=null;
export function renderCare(container,topic,resources=[]){
  if(existingCare?.topic===topic){container.append(existingCare.root);return;}
  const root=careNode('section');root.className='item';existingCare={topic,root};
  root.append(careNode('h3','Find a hospital or pharmacy'));
  const form=careNode('form'),status=careNode('p'),results=careNode('div'),note=careNode('p');
  status.setAttribute('role','status');
  function control(title,element){
    const label=careNode('label',title+' ');label.append(element);const row=careNode('div');row.append(label);return row;
  }
  const country=careNode('select'),kind=careNode('select');
  for(const [value,label] of [['US','United States'],['IN','India'],['GB-ENG','England'],['OTHER','Other country']])country.append(new Option(label,value));
  kind.append(new Option('General acute care hospitals','hospital'),new Option('Pharmacies','pharmacy'));
  form.append(control('Country',country),control('Service',kind));
  const fields=careNode('div');
  function input(label,placeholder,maxLength){
    const field=careNode('input');field.placeholder=placeholder;field.maxLength=maxLength;
    field.autocomplete='off';fields.append(control(label,field));return field;
  }
  const state=input('State','Two-letter code, e.g. NY',2),city=input('City','e.g. New York',60),postal=input('ZIP code','e.g. 10001',10);
  const submit=careNode('button','Find facilities');submit.className='act';submit.type='submit';
  form.append(fields,note,submit);root.append(form,status,results);
  let pending;
  function update(){
    pending?.abort();submit.disabled=false;status.textContent='';results.replaceChildren();
    const usa=country.value==='US';fields.hidden=!usa;submit.hidden=!usa;
    if(usa){
      note.textContent='Enter a ZIP code or a city and state. Searching sends these location filters to the CMS NPI Registry. Call the provider to confirm services and availability.';
      results.append(careLink('Open NPI Registry','https://npiregistry.cms.hhs.gov/'));
    }else{
      note.textContent='Local facility listings are not integrated for this country. No location is sent by HealthBrowse.';
      if(country.value==='IN')results.append(careLink('Open India’s official Health Facility Registry','https://facility.abdm.gov.in/'));
      else if(country.value==='GB-ENG')results.append(careLink('Open the NHS '+(kind.value==='pharmacy'?'pharmacy':'hospital')+' finder',kind.value==='pharmacy'?'https://www.nhs.uk/service-search/pharmacy/find-a-pharmacy':'https://www.nhs.uk/service-search/hospital/'));
      else results.append(careNode('p','Use your national health authority’s provider directory.'));
    }
  }
  country.addEventListener('change',update);kind.addEventListener('change',update);update();
  form.onsubmit=async e=>{
    e.preventDefault();if(country.value!=='US')return;
    pending?.abort();const attempt=new AbortController();pending=attempt;
    const data={kind:kind.value,state:state.value,city:city.value,postal:postal.value};
    if(!data.postal.trim() && !(data.city.trim() && data.state.trim())){status.textContent='Enter a ZIP code or both city and state.';return;}
    submit.disabled=true;status.textContent='Searching the CMS registry…';results.replaceChildren();
    try{
      const response=await fetch('/api/care',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(data),signal:attempt.signal,cache:'no-store'});
      const info=await response.json();
      if(!response.ok)throw Error(info.error||'Directory search unavailable.');
      if(!Array.isArray(info.rows))throw Error('The registry did not return a valid response.');
      if(attempt.signal.aborted)return;
      status.textContent=info.rows.length?info.rows.length+' matching organization(s) · lookup '+info.checkedAt:'No matching practice locations were returned. Try a different city or ZIP code.';
      for(const r of info.rows){
        const box=careNode('div');box.className='item';box.append(careNode('strong',r.name),careNode('p',r.category+' · '+r.address));
        if(r.phone)box.append(careNode('p','Phone '+r.phone));
        box.append(careLink('NPI '+r.npi,r.source));if(r.updated)box.append(careNode('p','Registry record updated '+r.updated));results.append(box);
      }
      results.append(careNode('p','NPI registration does not verify licensure, accreditation, specialty services, or current pharmacy stock.'));
    }catch(error){if(!attempt.signal.aborted){status.textContent=error.message||'Directory search unavailable.';results.append(careLink('Open NPI Registry','https://npiregistry.cms.hhs.gov/'));}}
    finally{if(pending===attempt)submit.disabled=false}
  };
  root.append(careLink('Search DailyMed medicine labels','https://dailymed.nlm.nih.gov/dailymed/'));
  for(const r of (resources||[]).filter(r=>r.kind==='facility').slice(0,3)){
    try{if(new URL(r.url).protocol==='https:'){const p=careNode('p');p.append(careLink(r.title,r.url));root.append(p)}}catch{}
  }
  container.append(root);
}
