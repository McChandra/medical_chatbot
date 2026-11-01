// Registry-specific statuses are independent of publication dates and of each other.
const activitySources = {
  grants:'https://reporter.nih.gov/',
  trials:'https://clinicaltrials.gov/'
};
const activityAliases = new Map([
  ['high blood pressure','hypertension'], ['high blood cholesterol','hypercholesterolemia'],
  ['heart attack','myocardial infarction'], ['shingles','herpes zoster'],
  ["alzheimer's disease",'alzheimer'], ["parkinson's disease",'parkinson']
]);
const ongoingActivity = ['RECRUITING','ACTIVE_NOT_RECRUITING','ENROLLING_BY_INVITATION'];
const grantScope='Active grant-type awards in NIH RePORTER with an in-period budget and a title that mentions this topic. A bounded sample of US federal funding records, not a ranking of institutions.';
const trialScope='Recent sponsor-reported ClinicalTrials.gov registrations with the requested status. A completed trial may have no posted results.';
const activityNorm=value=>String(value??'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function activityMatches(value,term){
  let text=activityNorm(value);
  if(term==='hypertension') text=text.replace(/\b(?:pulmonary(?: arterial)?|portal|intracranial|ocular|intraocular) hypertension\b/g,'');
  return (' '+text+' ').includes(' '+activityNorm(term)+' ');
}
function activityDate(value){
  const day=typeof value==='string'?value.slice(0,10):'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
  const parsed=new Date(day+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().startsWith(day)?day:null;
}
async function activityJSON(fetchImpl,url,options={}){
  const response=await fetchImpl(url,{...options,headers:{Accept:'application/json',...options.headers},credentials:'omit',
    redirect:'error',signal:AbortSignal.timeout(8500)});
  if(!response.ok)throw Error('Registry unavailable');
  return response.json();
}
async function currentGrants(term,today,fetchImpl){
  const query={criteria:{include_active_projects:true,advanced_text_search:{operator:'and',search_field:'projecttitle',search_text:term}},
    limit:30,sort_field:'fiscal_year',sort_order:'desc'};
  const payload=await activityJSON(fetchImpl,'https://api.reporter.nih.gov/v2/projects/search',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query)});
  if(!Array.isArray(payload.results))throw Error('Invalid grant response');
  const seen=new Set(),rows=[];
  for(const record of payload.results){
    const id=String(record.appl_id??''),projectId=record.project_num, institution=record.organization?.org_name;
    const startDate=activityDate(record.budget_start),endDate=activityDate(record.budget_end);
    // Only common extramural grant/cooperative-agreement series. Exclude contracts and intramural projects.
    if(!/^(?:R|U|P|K|T|F|DP)\d{1,2}$/.test(record.activity_code??'') ||
      record.is_active!==true || !/^\d+$/.test(id) || !projectId || !institution ||
      !activityMatches(record.project_title,term) || !startDate || !endDate || startDate>today || endDate<today)continue;
    const key=record.core_project_num||projectId;
    if(seen.has(key))continue;
    seen.add(key);
    rows.push({title:record.project_title,institution,projectId,startDate,endDate,
      funder:record.agency_ic_admin?.name||null, projectStart:activityDate(record.project_start_date),
      projectEnd:activityDate(record.project_end_date),url:'https://reporter.nih.gov/project-details/'+id});
    if(rows.length===5)break;
  }
  return rows;
}
async function registeredTrials(term,statuses,fetchImpl){
  const endpoint=new URL('https://clinicaltrials.gov/api/v2/studies');
  endpoint.search=new URLSearchParams({'query.cond':term,'filter.overallStatus':statuses.join('|'),
    sort:'LastUpdatePostDate:desc',pageSize:'20',format:'json'});
  const payload=await activityJSON(fetchImpl,endpoint);
  if(!Array.isArray(payload.studies))throw Error('Invalid trial response');
  const rows=[],seen=new Set();
  for(const study of payload.studies){
    const protocol=study.protocolSection||{}, id=protocol.identificationModule||{}, status=protocol.statusModule||{};
    const nctId=id.nctId,title=id.briefTitle||id.officialTitle;
    if(!/^NCT\d{8}$/.test(nctId||'') || !title || seen.has(nctId) || !statuses.includes(status.overallStatus))continue;
    const conditions=protocol.conditionsModule?.conditions||[];
    if(![title,...conditions].some(text=>activityMatches(text,term)))continue;
    seen.add(nctId);
    rows.push({title,nctId,status:status.overallStatus,sponsor:protocol.sponsorCollaboratorsModule?.leadSponsor?.name||null,
      phases:protocol.designModule?.phases||[],startDate:status.startDateStruct?.date||null,
      completionDate:status.completionDateStruct?.date||null,completionDateType:status.completionDateStruct?.type||null,
      lastUpdated:status.lastUpdatePostDateStruct?.date||null,resultsPosted:typeof study.hasResults==='boolean'?study.hasResults:null,
      url:'https://clinicaltrials.gov/study/'+nctId});
    if(rows.length===5)break;
  }
  return rows;
}
async function activityGroup(source,scope,load){
  try{const rows=await load();return {status:rows.length?'ok':'empty',rows,source,scope};}
  catch{return {status:'unavailable',rows:[],source,scope};}
}
export async function getResearchActivity(topic,fetchImpl=fetch){
  if(typeof topic!=='string' || topic!==topic.trim() || !/^[A-Za-z0-9][A-Za-z0-9 '\-]{0,83}$/.test(topic))
    throw new TypeError('Use a resolved public medical topic.');
  const term=activityAliases.get(topic.toLowerCase())||topic;
  const checkedAt=new Date().toISOString();
  const [grants,ongoing,completed]=await Promise.all([
    activityGroup(activitySources.grants,grantScope,()=>currentGrants(term,checkedAt.slice(0,10),fetchImpl)),
    activityGroup(activitySources.trials,trialScope,()=>registeredTrials(term,ongoingActivity,fetchImpl)),
    activityGroup(activitySources.trials,trialScope,()=>registeredTrials(term,['COMPLETED'],fetchImpl))
  ]);
  return {topic,checkedAt,grants,trials:{ongoing,completed}};
}
