import {faqQuestions} from './faq-spec.js';
// Stable stored IDs preserve existing accounts. Reading styles do not grant clinical access.
export const readingRoles=['General reader','Medical professional','Medical student'];
const legacyRoles=['Patient','Medical student','Advanced professional'];
export const isReadingRole=role=>typeof role==='string'&&[...readingRoles,...legacyRoles,'General','Clinicians','Student'].includes(role);
export function normalizeReadingRole(role){return ['Medical student','Student'].includes(role)?readingRoles[2]:['Medical professional','Advanced professional','Clinicians'].includes(role)?readingRoles[1]:readingRoles[0]}
export function roleIndex(role){return typeof role==='number'?role===2?2:[1,3,4].includes(role)?1:0:readingRoles.indexOf(normalizeReadingRole(role))}
export const readingLabel=role=>['General','Clinicians','Student'][roleIndex(role)];
const profiles=[
 {label:'General',style:'Plain-language answer',summary:1,detail:2,card:1,guide:'A clear explanation, key facts and original sources.',extraTitle:'Key point'},
 {label:'Clinicians',style:'Clinical explanation',summary:3,detail:5,card:2,guide:'Clinical detail, diagnostic considerations and evidence limitations.',extraTitle:'Clinical interpretation'},
 {label:'Student',style:'Educational explanation',summary:2,detail:4,card:2,guide:'Learn the mechanisms, compare evidence and save study notes.',extraTitle:'Study focus'}
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
 if(roleIndex(role)===2)return {title:'Study focus',text:clinicalTasks[Math.max(0,Math.min(deck-1,5))]+' Explain the mechanism in your own words and discuss uncertainties with your supervisor.'};
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
