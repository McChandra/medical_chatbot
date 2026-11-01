// Clinical Tables returns independently searched coding systems, never a crosswalk.
// Caller must provide a public disease label or code, not a full clinical question.
const terminologyTables = [
  {system:'ICD-10-CM', api:'icd10cm', code:'code', label:'name',
   syntax:/^[A-Z][0-9][A-Z0-9](?:\.?[A-Z0-9]{1,4})?$/i},
  {system:'ICD-9-CM', api:'icd9cm_dx', code:'code_dotted', label:'long_name',
   syntax:/^(?:\d{3}(?:\.?\d{1,2})?|V\d{2}(?:\.?\d{1,2})?|E\d{3}(?:\.?\d)?)$/i},
];
const snomedName='SNOMED CT (US Edition)';
const terminologyLimit=5;
const compactCode = code => code.toUpperCase().replace('.', '');
const labelKey = text => text.trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function dottedCode(table, term) {
  const plain=compactCode(term);
  const at=table.api==='icd9cm_dx' && plain.startsWith('E') ? 4 : 3;
  return plain.length<=at?plain:plain.slice(0,at)+'.'+plain.slice(at);
}

function clinicalTablesURL(table, term, codeLookup) {
  const url=new URL('https://clinicaltables.nlm.nih.gov/api/'+table.api+'/v3/search');
  url.search=new URLSearchParams({
    terms:codeLookup?dottedCode(table,term):term, cf:table.code,
    sf:codeLookup?table.code:table.label, df:table.code+','+table.label,
    maxList:String(terminologyLimit),
  });
  return url;
}

async function fetchTerminologyJSON(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'error',
    headers:{Accept:'application/json'},credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('Terminology source unavailable');
  return response.json();
}

async function clinicalTableRows(table,term,codeLookup) {
  const data=await fetchTerminologyJSON(clinicalTablesURL(table,term,codeLookup));
  if(!Array.isArray(data?.[1]) || !Array.isArray(data[3]) || data[1].length!==data[3].length)
    throw Error('Terminology response format unavailable');
  return data[3].flatMap((values,i)=>{
    if(!Array.isArray(values) || typeof values[0]!=='string' || typeof values[1]!=='string')return [];
    const code=values[0].trim(),label=values[1].trim();
    if(!table.syntax.test(code) || !label || compactCode(code)!==compactCode(String(data[1][i])))return [];
    // Prefix search can return billable subcodes for a category. Do not choose one.
    if(codeLookup && compactCode(term)!==compactCode(code))return [];
    return [{system:table.system,code,label,url:clinicalTablesURL(table,code,true).href}];
  }).slice(0,terminologyLimit);
}

async function licensedSnomedRows(term, identifier, key) {
  const base='https://uts-ws.nlm.nih.gov/rest/';
  const url=new URL(identifier?base+'content/current/source/SNOMEDCT_US/'+term:base+'search/current');
  url.searchParams.set('apiKey',key);
  if(!identifier)for(const [k,v] of Object.entries({string:term,sabs:'SNOMEDCT_US',returnIdType:'code',searchType:'exact'}))url.searchParams.set(k,v);
  const data=await fetchTerminologyJSON(url);
  const results=identifier?[data?.result]:data?.result?.results;
  if(!Array.isArray(results))throw Error('Unexpected SNOMED response');
  return results.filter(r=>r && r.rootSource==='SNOMEDCT_US' && /^\d{6,18}$/.test(r.ui) &&
    (!identifier||r.ui===term) && ![true,'true'].includes(r.obsolete) && ![true,'true'].includes(r.suppressible) &&
    typeof r.name==='string' && r.name.trim()).slice(0,terminologyLimit).map(r=>({
    system:snomedName,code:r.ui,label:r.name.trim(),url:'https://uts.nlm.nih.gov/uts/umls/vocabulary/SNOMEDCT_US/'+r.ui,
  }));
}

export async function lookupTerminology(rawTerm,env={}) {
  const text=typeof rawTerm==='string'?rawTerm.trim().replace(/\s+/g,' '):'';
  const prefix=text.match(/^(ICD[- ]?(9|10)(?:[- ]?CM)?|SNOMED(?: CT)?)\s*[:#]?\s+(.*)$/i);
  const term=(prefix?prefix[3]:text).trim();
  const requested=prefix?(prefix[2]?'ICD-'+prefix[2]+'-CM':snomedName):null;
  const result={canonical:null,rows:[],sourceStatus:{},snomedStatus:'Not configured. SNOMED CT requires authorized access and applicable licensing.'};
  if(!term || term.length>100 || !/^[A-Za-z0-9][A-Za-z0-9 .,'()/-]*$/.test(term))return result;
  const snomedID=/^\d{6,18}$/.test(term);
  const codeLookup=terminologyTables.some(t=>t.syntax.test(term));
  const tables=terminologyTables.filter(t=>(!requested||requested===t.system) && !snomedID && (!codeLookup||t.syntax.test(term)));
  const responses=await Promise.allSettled(tables.map(t=>clinicalTableRows(t,term,codeLookup)));
  for(let i=0;i<tables.length;i++){
    const response=responses[i];
    result.sourceStatus[tables[i].system]=response.status==='fulfilled'?'checked':'unavailable';
    if(response.status==='fulfilled')result.rows.push(...response.value);
  }
  const licensed=env.SNOMED_CT_LICENSE_CONFIRMED==='true' && typeof env.UMLS_API_KEY==='string' && env.UMLS_API_KEY.trim();
  if(licensed && (!requested||requested===snomedName) && (!codeLookup||snomedID)){
    try{
      const snomedRows=await licensedSnomedRows(term,snomedID,env.UMLS_API_KEY.trim());
      result.rows.push(...snomedRows);
      result.snomedStatus=snomedRows.length?'Exact results from the authorized UMLS SNOMED CT US Edition service.':'No exact SNOMED CT result returned.';
    }catch{result.snomedStatus='Authorized SNOMED CT service unavailable. No SNOMED result verified.';}
  }else if(licensed){
    result.snomedStatus='No SNOMED mapping asserted for an ICD code. Search by disease name or SNOMED CT identifier.';
  }
  // Code systems can overlap. Only select a label if the result is unambiguous
  // and all potentially matching ICD systems responded successfully.
  const matches=codeLookup||snomedID?result.rows:result.rows.filter(r=>labelKey(r.label)===labelKey(term));
  const labels=new Map(matches.map(row=>[labelKey(row.label),row.label]));
  if(labels.size===1 && !Object.values(result.sourceStatus).includes('unavailable'))result.canonical=labels.values().next().value;
  return result;
}

export async function patientEducationForCode(row) {
  const oids={'ICD-10-CM':'2.16.840.1.113883.6.90','ICD-9-CM':'2.16.840.1.113883.6.103'};
  if(!row||!Object.hasOwn(oids,row.system))return [];
  const params=new URLSearchParams({'mainSearchCriteria.v.cs':oids[row.system],'mainSearchCriteria.v.c':row.code,'informationRecipient.languageCode.c':'en','knowledgeResponseType':'application/json'});
  try{
    const data=await fetchTerminologyJSON('https://connect.medlineplus.gov/service?'+params);
    return (data.feed?.entry||[]).flatMap(entry=>{
      const href=entry.link?.find(l=>l.rel==='alternate')?.href;
      if(!href)return [];
      const url=new URL(href);
      return url.origin==='https://medlineplus.gov'?[{title:entry.title?._value,url:url.origin+url.pathname}]:[];
    });
  }catch{return []}
}
