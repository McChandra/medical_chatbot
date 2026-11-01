// Only coarse US location filters go to the public CMS NPI Registry.
// Never forward the query topic, cookies, or account headers.
const careRegistry = 'https://npiregistry.cms.hhs.gov';
export async function careLookup(request, headers = {}, fetchRegistry = fetch) {
  const reply = (data, status = 200) => Response.json(data, {
    status, headers: {...headers, 'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}
  });
  if (request.method !== 'POST') return reply({error:'Use POST to run a directory search.'},405);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return reply({error:'A JSON directory request is required.'},415);
  }
  let data;
  try {
    const body = await request.text();
    if (body.length > 900) return reply({error:'Directory request is too large.'},413);
    data=JSON.parse(body);
  } catch {return reply({error:'Invalid directory request.'},400);}
  if (!data || typeof data !== 'object') return reply({error:'Invalid directory request.'},400);
  const {kind} = data;
  if (!['hospital','pharmacy'].includes(kind)) return reply({error:'Choose a hospital or pharmacy.'},400);
  if (['city','state','postal'].some(k=>data[k] != null && typeof data[k]!=='string')) {
    return reply({error:'Location fields must contain text.'},400);
  }
  const city=(data.city||'').trim(), state=(data.state||'').trim().toUpperCase(), postal=(data.postal||'').trim();
  if ((city && !/^[\p{L}][\p{L} .'-]{0,59}$/u.test(city)) || (state && !/^[A-Z]{2}$/.test(state)) ||
      (postal && !/^\d{5}(-\d{4})?$/.test(postal)) || !(postal || (city && state))) {
    return reply({error:'Enter a US ZIP code or a city and two-letter state.'},400);
  }
  const url=new URL('/api/',careRegistry);
  url.search=new URLSearchParams({version:'2.1',enumeration_type:'NPI-2',address_purpose:'LOCATION',
    taxonomy_description:kind==='pharmacy'?'Pharmacy':'General Acute Care Hospital',limit:'50'});
  if(city)url.searchParams.set('city',city);
  if(state)url.searchParams.set('state',state);
  if(postal)url.searchParams.set('postal_code',postal);
  try {
    const response=await fetchRegistry(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
    if(!response.ok)throw Error();
    const payload=await response.json();
    if(!Number.isInteger(payload.result_count) || payload.Errors || (payload.result_count && !Array.isArray(payload.results)))throw Error();
    const rows=[];
    for(const row of payload.results||[]){
      const name=row.basic?.organization_name, id=String(row.number||'');
      const tax=row.taxonomies?.find(t=>kind==='pharmacy'?/^3336/.test(t.code):/^282N/.test(t.code));
      if(row.enumeration_type!=='NPI-2' || row.basic.status!=='A' || !name || !/^\d{10}$/.test(id) || !tax)continue;
      const addresses=[...(row.addresses||[]).filter(a=>a.address_purpose==='LOCATION'),...(row.practiceLocations||[])];
      const site=addresses.find(a=>a.country_code==='US' && (!state||a.state===state) &&
        (!city || a.city?.toLowerCase()===city.toLowerCase()) && (!postal || String(a.postal_code||'').replaceAll('-','').startsWith(postal.replaceAll('-',''))));
      if(!site)continue;
      rows.push({name,category:tax.desc||kind,address:[site.address_1,site.address_2,site.city,site.state,site.postal_code].filter(Boolean).join(', '),
        phone:site.telephone_number||null,npi:id,source:careRegistry+'/provider-view/'+id,updated:row.basic.last_updated||null});
      if(rows.length===10)break;
    }
    return reply({rows,checkedAt:new Date().toISOString()});
  }catch{return reply({error:'The CMS registry is unavailable. Try again or open the NPI Registry directly.'},502);}
}
