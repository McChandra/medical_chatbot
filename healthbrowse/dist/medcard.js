export const sectionNames=['Education, definitions & taxonomy','Characteristics & identification','Research, journals & clinical evidence','Databases, datasets & AI resources','Prediction, early indicators & genetics','Physiology, symptoms & treatments','Pharmacies, hospitals & healthcare facilities'];
export const sectionKinds=[['education','core'],['guideline','core'],['guideline','article','statistics','trial'],['dataset','tool'],['risk'],['core','guideline'],['facility']];
const oldToNew=[0,1,5,6,6,2,5,6,3];
export function remapPassages(index){
  return Object.fromEntries(Object.entries(index).map(([name,rows])=>[name,rows.map(r=>({...r,deck:oldToNew[r.deck]})).filter(r=>r.deck)]));
}
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
    const host=new URL(r.url).hostname;
    const issuer=/(^|\.)(nih\.gov|cdc\.gov|fda\.gov|cancer\.gov|clinicaltrials\.gov|nhs\.uk|who\.int)$/.test(host);
    const hits=(r.title.toLowerCase().match(/[a-z]{3,}/g)||[]).filter(w=>requested.has(w)).length;
    const weight=(kinds.length-kinds.indexOf(r.kind))*2 + (issuer?2:0) + Math.min(hits,3)
      + (role<2 && /medlineplus/i.test(r.publisher)?3:0);
    return {r,weight,index,why:[r.kind+' resource',issuer?'public health or government publisher':null,hits?'title matches search terms':null].filter(Boolean).join(' · ')};
  }).sort((a,b)=>b.weight-a.weight || a.index-b.index);
}
