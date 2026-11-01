// Each returned paper must match a Europe PMC search record and NCBI's PubMed
// summary. This verifies bibliographic identity, not clinical validity or efficacy.
import {retrieveEvidence,rankEvidence,evidenceTypes} from './evidence.js';

const paperFocusTerms = {
  general: [],
  genetics: ['genetic','genetics','genomic','genomics','hereditary','inherited','familial','germline','somatic','mutation','mutations','cytogenetic','variants'],
  treatments: ['treatment','treatments','therapy','therapies','therapeutic','pharmacotherapy','medication','medications','drug','drugs','chemotherapy','immunotherapy','inhibitor','inhibitors']
};
const decodePaperText = text => String(text ?? '').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|apos|quot|nbsp);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&apos;':"'",'&quot;':'"','&nbsp;':' '})[entity]).replace(/&#(\d+);/g,(_,n)=>Number(n)<0x110000?String.fromCodePoint(Number(n)):' ').replace(/\s+/g,' ').trim();
const paperTitleKey = text => decodePaperText(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const normalDoi = value=>String(value??'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').trim().toLowerCase();

function corroborates(candidate,summary) {
  if(!summary || String(summary.uid)!==candidate.pmid || paperTitleKey(summary.title)!==paperTitleKey(candidate.title))return false;
  if((summary.pubtype||[]).some(type=>/retract|erratum|corrigendum|corrected and republished|expression of concern/i.test(type)))return false;
  const doi=summary.articleids?.find(item=>item.idtype==='doi')?.value;
  return !(doi && candidate.doi && normalDoi(doi)!==normalDoi(candidate.doi));
}

function paperPassage(row,url,focus) {
  const abstract=decodePaperText(row.abstractText);
  if(!abstract)return null;
  const sentences=abstract.match(/(?:^|(?<=[.!?])\s+)([^.!?]+[.!?])(?=\s|$)/g)||[];
  const complete=sentences.map(s=>s.trim()).filter(s=>{
    const length=s.split(/\s+/).length;
    return length>=6 && length<=24 && !/\b(?:Dr|Prof|vs|Fig|i\.e|e\.g|et al)\.$/i.test(s) && !/^\d/.test(s);
  });
  const terms=paperFocusTerms[focus];
  const text=complete.find(s=>terms.some(term=>s.toLowerCase().includes(term)))||complete[0];
  return text?{text,location:'Author abstract · short excerpt',url}:null;
}

async function pubmedSummaries(ids,signal) {
  const url=new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  url.search=new URLSearchParams({db:'pubmed',id:ids.join(','),retmode:'json',tool:'healthbrowse_research'});
  const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('PubMed metadata verification unavailable (HTTP '+response.status+').');
  const data=await response.json();
  if(!Array.isArray(data.result?.uids))throw Error('PubMed metadata verification returned no usable response.');
  return data.result;
}

async function europeResearchPapers(topic,focus,signal) {
  if(!Object.hasOwn(paperFocusTerms,focus))throw Error('Unknown research focus.');
  const {records:candidates,rows,queriedAt}=await retrieveEvidence(topic,signal,true,paperFocusTerms[focus]);
  if(!candidates.length)return {records:[],queriedAt,focus};
  const summaries=await pubmedSummaries(candidates.map(r=>r.pmid),signal);
  const records=[];
  for(const candidate of candidates){
    const summary=summaries[candidate.pmid];
    const titleWords=decodePaperText(candidate.title).toLowerCase().match(/[a-z]+/g)||[];
    if(focus!=='general'&&!paperFocusTerms[focus].some(term=>titleWords.includes(term)))continue;
    if(!corroborates(candidate,summary))continue;
    const row=rows.find(item=>String(item.pmid||item.id)===candidate.pmid && item.source==='MED' && paperTitleKey(item.title)===paperTitleKey(candidate.title));
    if(!row)continue;
    const ids=[...new Set(decodePaperText(row.abstractText).match(/\bNCT\d{8}\b/gi)||[])];
    const registryLinks=ids.map(id=>({id:id.toUpperCase(),url:'https://clinicaltrials.gov/study/'+id.toUpperCase()}));
    records.push({...candidate,rank:records.length+1,focus,
      publicationStatus:'Published, indexed paper',
      studyStatus:'Study completion and recruitment are not established by publication.',
      passage:paperPassage(row,candidate.url,focus),registryLinks,
      verificationStatus:'PMID and title corroborated against the NCBI PubMed summary. DOI checked when present in both records.',
      provenance:{...candidate.provenance,ncbiPubDate:summary.pubdate||null,verifiedWith:'NCBI ESummary (PubMed)'},
      reason:candidate.reason+(focus==='general'?'':' The title also matches the '+focus+' search.')
    });
    if(records.length===5)break;
  }
  return {records,queriedAt,focus};
}

const ncbiPaperBase='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
async function ncbiPaperRequest(endpoint,params,signal){
  const url=new URL(ncbiPaperBase+endpoint);
  url.search=new URLSearchParams({db:'pubmed',tool:'healthbrowse_research',...params});
  const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('PubMed returned HTTP '+response.status+'.');
  return response;
}
const paperTopicSynonyms={'leukemia':['leukaemia'],'high blood pressure':['hypertension'],'high blood cholesterol':['hypercholesterolemia'],'heart attack':['myocardial infarction'],'shingles':['herpes zoster']};

async function crossrefIdentity(candidate,signal) {
  if(!candidate.doi || !/^10\.\d{4,9}\/\S+$/i.test(candidate.doi))return false;
  const url='https://api.crossref.org/works/'+encodeURIComponent(candidate.doi);
  const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(response.status===404)return false;
  if(!response.ok)throw Error('Crossref returned HTTP '+response.status+'.');
  const row=(await response.json()).message;
  return normalDoi(row?.DOI)===normalDoi(candidate.doi) &&
    row?.title?.some(title=>paperTitleKey(title)===paperTitleKey(candidate.title)) &&
    !(row['update-to']||[]).some(update=>/retract|correction|concern/i.test(update.type??''));
}

async function ncbiAbstracts(records,signal){
  if(!records.length)return new Map();
  const response=await ncbiPaperRequest('efetch.fcgi',{id:records.map(r=>r.pmid).join(','),retmode:'xml'},signal);
  const xml=await response.text(), abstracts=new Map();
  for(const [,article] of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)){
    const pmid=article.match(/<PMID(?: [^>]+)?>(\d+)<\/PMID>/)?.[1];
    const abstract=article.match(/<Abstract>([\s\S]*?)<\/Abstract>/)?.[1];
    if(pmid && abstract)abstracts.set(pmid,Array.from(abstract.matchAll(/<AbstractText(?: [^>]*)?>([\s\S]*?)<\/AbstractText>/g),match=>match[1]).join(' '));
  }
  return abstracts;
}

async function pubmedResearchPapers(topic,focus,signal){
  const name=topic.trim().toLowerCase();
  const terms=[name,...(paperTopicSynonyms[name]||[])];
  const titles=terms.map(term=>'"'+term+'"[Title]').join(' OR ');
  const types=evidenceTypes.map(term=>'"'+term+'"[Publication Type]').join(' OR ');
  const targets=paperFocusTerms[focus].map(term=>'"'+term+'"[Title]').join(' OR ');
  const query='('+titles+') AND ('+types+')'+(targets?' AND ('+targets+')':'');
  const searched=await ncbiPaperRequest('esearch.fcgi',{term:query,retmode:'json',retmax:'40',sort:'relevance'},signal);
  const ids=(await searched.json()).esearchresult?.idlist;
  if(!Array.isArray(ids))throw Error('PubMed search response unavailable.');
  const queriedAt=new Date().toISOString();
  if(!ids.length)return {records:[],queriedAt,focus};
  const summary=await pubmedSummaries(ids,signal);
  const rows=ids.flatMap(id=>{
    const s=summary[id];if(!s||String(s.uid)!==id)return [];
    const pubTypes=s.pubtype||[];
    const correctionLinks=(s.references||[]).map(ref=>({type:ref.reftype||''}));
    const date=(s.sortpubdate||'').slice(0,10).replaceAll('/','-') || s.pubdate;
    return [{id,pmid:id,source:'MED',title:s.title,doi:s.articleids?.find(x=>x.idtype==='doi')?.value,
      journalTitle:s.fulljournalname||s.source,authorString:s.authors?.map(a=>a.name).join(', '),
      firstPublicationDate:date,pubTypeList:{pubType:pubTypes},commentCorrectionList:{commentCorrection:correctionLinks}}];
  });
  const candidates=rankEvidence(rows,terms,queriedAt,query).filter(r=>r.doi);
  const records=[];let failed=0;
  // Bounded requests; never show a paper when its cross-check failed.
  for(let i=0;i<candidates.length && records.length<5;i+=3){
    const batch=candidates.slice(i,i+3);
    const checked=await Promise.allSettled(batch.map(r=>crossrefIdentity(r,signal)));
    for(let j=0;j<batch.length && records.length<5;j++){
      if(checked[j].status==='rejected'){failed++;continue}
      if(!checked[j].value)continue;
      const r=batch[j];
      records.push({...r,rank:records.length+1,focus,publicationStatus:'Published, indexed paper',
        studyStatus:'Study completion and recruitment are not established by publication.',
        passage:null,registryLinks:[],verificationStatus:'PubMed title and DOI corroborated against the Crossref DOI record.',
        provenance:{source:'PubMed and Crossref',query,rankingVersion:'pm-title-design-v1',fetchedAt:queriedAt},
        detail:[r.authors+' · '+r.journal+' · '+r.date,'PMID '+r.pmid+' · DOI '+r.doi,r.reason,r.limitations].join('\n')});
    }
  }
  if(signal?.aborted)throw signal.reason;
  if(!records.length && failed)throw Error('Bibliographic cross-check unavailable.');
  try{
    const abstracts=await ncbiAbstracts(records,signal);
    for(const r of records){
      const abstract=abstracts.get(r.pmid)||'';
      r.passage=paperPassage({abstractText:abstract},r.url,focus);
      r.registryLinks=[...new Set(abstract.match(/\bNCT\d{8}\b/gi)||[])].map(id=>({id:id.toUpperCase(),url:'https://clinicaltrials.gov/study/'+id.toUpperCase()}));
    }
  }catch{if(signal?.aborted)throw signal.reason;} // Unavailable abstracts do not invalidate the bibliographic cross-check.
  return {records,queriedAt,focus};
}

export async function searchResearchPapers(topic,focus='general',signal) {
  if(!Object.hasOwn(paperFocusTerms,focus))throw Error('Unknown research focus.');
  if(typeof topic!=='string'||!/^[a-z0-9][a-z0-9 '-]{0,83}$/i.test(topic.trim()))throw Error('Choose a public medical topic.');
  const attempt=new AbortController();
  const stop=()=>attempt.abort();
  if(signal?.aborted)throw signal.reason;
  signal?.addEventListener('abort',stop,{once:true});
  const timeout=setTimeout(stop,8500);
  try{return await europeResearchPapers(topic,focus,attempt.signal)}
  catch(error){
    if(signal?.aborted)throw signal.reason;
    // ESummary also powers the alternate path. An explicit failure there must remain visible.
    if(String(error?.message).startsWith('PubMed metadata verification'))throw error;
    return pubmedResearchPapers(topic,focus,signal);
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',stop)}
}
