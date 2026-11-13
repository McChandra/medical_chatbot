import {faqQuestions} from './faq-spec.js';
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
 'Distinguish incidence from prevalence and assess population and risk-factor applicability.',
 'Distinguish etiology from pathogenesis and preserve genetic and subtype qualifiers.',
 'Distinguish reported symptoms from observed signs and recognize source-supported red flags.',
 'Review diagnostic criteria and test limitations; do not equate screening with diagnosis.',
 'Assess treatment evidence, contraindications, and applicability without issuing a prescription.',
 'Separate untreated natural history from treated outcomes and check follow-up evidence.'
];
export function readingGuidance(role,deck){
 if(roleIndex(role)===0)return null;
 return {title:'Clinical interpretation',text:clinicalTasks[Math.max(0,Math.min(deck-1,5))]+' Confirm source currency, patient context and local protocols before application.'};
}
export function roleQuestions(role){
 const labels=roleIndex(role)===0?faqQuestions:[
  'Review epidemiology and risk factors','Review etiology and pathogenesis',
  'Review clinical manifestations','Review diagnostic modalities',
  'Review treatment and management','Review prognosis and follow-up'
 ];
 return labels.map((label,i)=>({deck:i+1,label,prompt:faqQuestions[i]}));
}
