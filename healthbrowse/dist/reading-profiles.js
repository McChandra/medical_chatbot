// Stable stored IDs preserve existing accounts. Only these two modes are selectable.
export const readingRoles=['General reader','Medical professional'];
const legacyRoles=['Patient','Medical student','Advanced professional'];
export const isReadingRole=role=>typeof role==='string'&&[...readingRoles,...legacyRoles,'General','Clinicians'].includes(role);
export function normalizeReadingRole(role){return ['Medical professional','Advanced professional','Clinicians'].includes(role)?readingRoles[1]:readingRoles[0]}
export function roleIndex(role){return typeof role==='number'?[1,3,4].includes(role)?1:0:readingRoles.indexOf(normalizeReadingRole(role))}
export const readingLabel=role=>roleIndex(role)===1?'Clinicians':'General';
const profiles=[
 {label:'General',style:'Plain-language answer',summary:1,detail:2,card:1,guide:'A clear explanation, key facts and original sources.',extraTitle:'Key point'},
 {label:'Clinicians',style:'Clinical explanation',summary:3,detail:5,card:2,guide:'Clinical detail, diagnostic considerations and evidence limitations.',extraTitle:'Clinical interpretation'}
];
export const readingProfile=role=>({...profiles[roleIndex(role)],index:roleIndex(role)});
const clinicalTasks=[
 'Distinguish etiology from pathogenesis and link mechanisms to clinical findings.',
 'Separate untreated natural history from outcomes after intervention. Identify missing timeline evidence.',
 'Compare symptoms, signs and confirmatory tests. Do not equate screening with diagnosis.',
 'Relate therapeutic approaches to the underlying mechanism. Check indications and contraindications in current guidelines.',
 'Separate prognostic factors from complications and identify the population behind outcome estimates.',
 'Distinguish incidence from prevalence and assess prevention evidence and population applicability.'
];
export function readingGuidance(role,deck){
 if(roleIndex(role)===0)return null;
 return {title:'Clinical interpretation',text:clinicalTasks[Math.max(0,Math.min(deck-1,5))]+' Confirm source currency, patient context and local protocols before application.'};
}
export function roleQuestions(role){
 const labels=roleIndex(role)===0?
  ['What causes it?','How does it change over time?','What are the symptoms and tests?','How is it treated?','What is the outlook?','Who is affected, and can it be prevented?']:
  ['Review causes and disease mechanisms','Review progression and intervention context','Review clinical presentation and diagnostic workup','Review management principles','Review prognosis and complications','Review population evidence and prevention'];
 return labels.map((label,i)=>({deck:i+1,label,prompt:label}));
}
