// App-owned capability and audience copy; these are not clinical claims.
export const insufficientClinicalContext='Insufficient clinical context available to verify this claim.';
export const patientDisclaimer='I am an AI, not a doctor. Please consult a healthcare provider before making medical decisions.';
export const domainRestriction='As a medical AI browser, my operations are restricted to health and medical data.';
export function medicalPersona(role){return ['Medical professional','Advanced professional','Clinicians'].includes(role)?'clinician':'patient';}
export function withAudienceDisclaimer(answer,role){
 if(!answer||medicalPersona(role)!=='patient'||answer.safety||answer.kind==='platform')return answer;
 return {...answer,audienceDisclaimer:patientDisclaimer,text:(answer.text||insufficientClinicalContext)+(answer.text?.includes(patientDisclaimer)?'':'\n\n'+patientDisclaimer)};
}
// Recognize explicit unrelated tasks without making an allowlist of disease names.
// Unknown biomedical terminology and short follow-ups still reach evidence retrieval.
export function outsideMedicalScope(text){
 const q=String(text||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const medical=/\b(?:health|medical|medicine|clinical|biolog\w*|disease|symptom|patient|hospital|diagnos\w*|treatment|drug|vaccine|genetic\w*|genomic\w*|anatomy|physiology|pathology|cancer|leukemia|diabetes|blood|brain|heart|lung|kidney|mental|public health|epidemiology|surgical|biomedical|medquad|healthbrowse|buddy|sports medicine)\b/.test(q);
 const unrelatedTask=/\b(?:write|create|build|generate|debug)\b.{0,35}\b(?:trading bot|video game|romantic poem|love poem|love letter|dating bio|movie script|shopping list)\b/.test(q);
 const unrelatedTopic=/\b(?:capital of|weather (?:in|tomorrow|today)|stock prices?|bitcoin price|football scores?|cricket scores?|soccer scores?|sports results?|election results?|travel itinerary|vacation itinerary|car insurance|mortgage rates?|solve (?:this )?(?:algebra|equation)|write (?:a )?poem|debug (?:my |this )?(?:python|javascript)|best (?:laptop|phone|gaming pc))\b/.test(q);
 return unrelatedTask||(!medical&&unrelatedTopic);
}
export function scopeAnswer(){return {title:'Medical research only',text:domainRestriction,blocks:[],citations:[],checks:[],supported:false,safety:{category:'out_of_scope',policyVersion:'2026-11-13.4'}};}
