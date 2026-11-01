import {attachRegistrationStatus} from './linked-studies.mjs';
import {getResearchActivity} from './research.mjs';
import {searchResearchPapers} from '../dist/research-papers.js';

let researchTerms;
const researchCache=new Map();
export async function researchRoute(url,assets,headers){
  const kind=url.pathname.split('/').at(-1),topic=url.searchParams.get('topic')||'',focus=url.searchParams.get('focus')||'general';
  if(!researchTerms){
    const read=path=>JSON.parse(assets[path].text);
    researchTerms=new Set([...Object.keys(read('/catalog.json')),...read('/topic-list.json'),...read('/medline-topics.json').topics.map(t=>t.title)].map(t=>t.toLowerCase()));
  }
  if(!researchTerms.has(topic.toLowerCase())||!['general','genetics','treatments'].includes(focus)||!['papers','activity'].includes(kind))
    return Response.json({error:'Select a recognized research topic.'},{status:400,headers});
  const key=JSON.stringify([kind,topic.toLowerCase(),focus]);
  const cached=researchCache.get(key);
  if(cached&&cached.until>Date.now())return Response.json(cached.data,{headers});
  try{
    const data=kind==='papers'?await searchResearchPapers(topic,focus,AbortSignal.timeout(55000)):await getResearchActivity(topic);
    if(kind==='papers' && data.records.length)data.records=await attachRegistrationStatus(data.records,AbortSignal.timeout(7000));
    if(researchCache.size>=100)researchCache.delete(researchCache.keys().next().value);
    researchCache.set(key,{until:Date.now()+300000,data});return Response.json(data,{headers});
  }catch{return Response.json({error:'Research source unavailable. Try the request again.'},{status:502,headers})}
}
