// A source check operates on records already retrieved for one disease.
// Clinical claims must be complete extracts. Metadata claims must name one field.
// Example: verifyClaim({kind:'trial',topic,sourceUrl:row.url,field:'status',
//   value:row.status}, {topic,trials:[row]}). No network call or clinical grading.
import {authorityFor} from './authorities.js';
export function clinicalProvenance(row){
  const original=address(row.url),archive=address(row.sourceRecord);
  const pinnedArchive=/^https:\/\/github\.com\/abachaa\/MedQuAD\/blob\/[a-f0-9]{40}\/.+\.xml$/.test(archive);
  const retired=/^https?:\/\/(?:www\.)?(?:nihseniorhealth\.gov|ghr\.nlm\.nih\.gov)\//.test(original);
  const publisher=authorityFor(original);
  if(archive&&archive!==original&&!pinnedArchive)return null;
  if(!publisher&&!(pinnedArchive&&retired))return null;
  return {publisher:publisher?.name||'Archived NIH education source',historical:pinnedArchive,
    date:row.vintage||'Source date unverified.',clinicalReview:'Not independently clinically reviewed'};
}
const fields = {
  passage: ['text'],
  paper: ['title','pmid','doi','journal','authors','date','studyDesign','category','population','abstractExcerpt'],
  trial: ['title','nctId','status','sponsor','phases','startDate','completionDate'],
  grant: ['title','institution','projectId','startDate','endDate']
};
const collections = {passage:'passages',paper:'papers',trial:'trials',grant:'grants'};
const clean = value => typeof value==='string' ? value.normalize('NFC').replace(/\s+/g,' ').trim() : '';
const topicKey = value => clean(value).toLowerCase();
function address(value) {
  try {
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {return '';}
}
function fieldText(row,field) {
  if(field==='abstractExcerpt'){
    return address(row.passage?.url) && address(row.passage.url)===address(row.url) ? clean(row.passage.text) : '';
  }
  const value=row[field];
  if(Array.isArray(value))return value.every(v=>typeof v==='string') ? clean(value.join(', ')) : '';
  return typeof value==='number' && Number.isFinite(value) ? String(value) : clean(value);
}
function rowScope(row,kind,topic) {
  if(row.topic && topicKey(row.topic)!==topic)return false;
  if(kind!=='passage')return true;
  const focus=topicKey(row.focus);
  return focus===topic || focus.endsWith(' '+topic);
}
function identifiable(row,kind) {
  if(kind==='passage')return Boolean(clean(row.text) && clean(row.record) && clinicalProvenance(row));
  if(kind==='paper')return /^[1-9]\d*$/.test(String(row.pmid)) &&
    address(row.url)==='https://pubmed.ncbi.nlm.nih.gov/'+row.pmid+'/' &&
    (row.doi==null || /^10\.\d{4,9}\/\S+$/i.test(row.doi));
  if(kind==='trial')return /^NCT\d{8}$/.test(row.nctId) &&
    /^https:\/\/(?:www\.)?clinicaltrials\.gov\/(?:study|ct2\/show)\//.test(address(row.url)) &&
    new URL(row.url).pathname.split('/').filter(Boolean).at(-1)===row.nctId;
  return Boolean(fieldText(row,'projectId')) &&
    /^https:\/\/reporter\.nih\.gov\/project-details\//.test(address(row.url));
}
// Returned text is safe to display exactly as supplied. Subtype excerpts keep
// their population label when the workspace covers a broader condition.
export function verifyClaim(claim={},evidence={}) {
  const {kind,field}=claim;
  const fail=reason=>({status:'withheld',text:'',citation:null,field,reason});
  if(!Object.hasOwn(fields,kind) || !fields[kind].includes(field))return fail('Unsupported claim type or field.');
  const topic=topicKey(claim.topic);
  if(!topic || topicKey(evidence.topic)!==topic)return fail('The evidence belongs to a different topic.');
  const url=address(claim.sourceUrl),rows=evidence[collections[kind]];
  const value=fieldText(claim,'value');
  if(!url || !value || !Array.isArray(rows))return fail('The requested value or its source is missing.');
  const candidates=rows.filter(row=>row && rowScope(row,kind,topic) && identifiable(row,kind)
    && (!claim.record || claim.record===row.record)
    && (address(row.url)===url || (kind==='passage' && address(row.sourceRecord)===url)));
  const known=candidates.filter(row=>{
    const actual=fieldText(row,field);
    return actual && !/^(?:unknown|not reported|unavailable|not available|n\/a)$/i.test(actual);
  });
  const exact=known.find(row=>fieldText(row,field)===value);
  const unique=new Set(known.map(row=>fieldText(row,field))).size===1;
  // Do not silently substitute a different sentence, source or population.
  const corrected=!exact && claim.allowCorrection===true && unique &&
    (kind!=='passage' || Boolean(claim.record));
  const selected=exact || (corrected && known[0]);
  if(!selected)return fail('No matching source field supports this claim.');
  const citation={title:clean(selected.title)||'Source record',url:address(selected.sourceRecord)||address(selected.url)};
  const subtype=kind==='passage' && topicKey(selected.focus)!==topic;
  return {status:exact?'supported':'corrected',field,citation,checkedAt:new Date().toISOString(),
    ...(kind==='passage'?{provenance:clinicalProvenance(selected)}:{}),
    text:(subtype?selected.focus+' — ':'')+fieldText(selected,field),
    reason:(exact?'Matched the '+(kind==='passage'?'stored source excerpt.':'retrieved source field.'):'Replaced the proposed value with the value from the identified source record.')+' This is a source consistency check, not independent clinical validation.'};
}
