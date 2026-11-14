import {domains,routePassage} from './disease-framework.js';
export const sectionNames=domains.map(d=>d.title);
export const sectionKinds=[['statistics','risk','guideline','core'],['risk','core'],['core','guideline'],['guideline','core'],['guideline','core'],['guideline','statistics','core'],['article','trial','education','dataset','tool','facility','guideline']];
export function remapPassages(index){return Object.fromEntries(Object.entries(index).map(([name,rows])=>[name,rows.flatMap(r=>routePassage(r))]));}
export function correctSpelling(input){
  const corrections={lukemia:'leukemia',leukameia:'leukemia',leukaemia:'leukemia',alzhimers:"Alzheimer's Disease",diabetis:'diabetes',psorasis:'psoriasis'};
  return input.replace(/\b[a-z]+\b/gi,word=>corrections[word.toLowerCase()]||word);
}
export function codeQuery(input){
  const text=input.trim();
  const m=text.match(/^(?:(?:what is|look up|search for)\s+)?(?:(SNOMED(?:\s*CT)?|ICD[- ]?(?:9|10)(?:[- ]?CM)?)\s*(?:code)?\s*[:#]?\s*)?([A-Za-z]\d[\dA-Za-z](?:\.[\dA-Za-z]{1,4})?|\d{3}(?:\.\d{1,2})?|\d{6,18})\s*\??$/i);
  return m?(m[1]?m[1]+' ':'')+m[2].toUpperCase():null;
}
// Rank within each section. A publisher link is provenance, not clinical approval.
export function sectionSources(section,records,query,role){
  const kinds=sectionKinds[section-1];
  const requested=new Set((query||'').toLowerCase().match(/[a-z]{3,}/g)||[]);
  const seen=new Set();
  return records.filter(r=>kinds.includes(r.kind) && r.url && !seen.has(r.url) && seen.add(r.url)).map((r,index)=>{
    let host;try{const url=new URL(r.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;host=url.hostname}catch{return null}
    const issuer=/(^|\.)(nih\.gov|cdc\.gov|fda\.gov|cancer\.gov|clinicaltrials\.gov|nhs\.uk|who\.int)$/.test(host);
    const hits=(r.title.toLowerCase().match(/[a-z]{3,}/g)||[]).filter(w=>requested.has(w)).length;
    const weight=(kinds.length-kinds.indexOf(r.kind))*2 + (issuer?2:0) + Math.min(hits,3)
      + (role===0 && /medlineplus/i.test(r.publisher)?3:0);
    return {r,weight,index,why:[r.kind+' resource',issuer?'public health or government publisher':null,hits?'title matches search terms':null].filter(Boolean).join(' · ')};
  }).filter(Boolean).sort((a,b)=>b.weight-a.weight || a.index-b.index);
}
