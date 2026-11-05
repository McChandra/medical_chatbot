// Reading modes change explanation depth, not identity or clinical permissions.
export const readingRoles=['General reader','Patient','Medical student','Medical professional','Advanced professional'];
const profiles=[
 {label:'General user',style:'Plain-language answer',summary:1,detail:2,card:1,guide:'A short explanation, key facts and original sources.',extraTitle:'Key point'},
 {label:'Patient',style:'Patient education & safety',summary:2,detail:3,card:1,guide:'Understand the condition, prepare questions and discuss care safely.',extraTitle:'To discuss with your care team'},
 {label:'Medical student',style:'Educational explanation',summary:3,detail:4,card:2,guide:'Connect mechanisms, clinical presentation and investigations.',extraTitle:'Learning focus'},
 {label:'Medical professional',style:'Clinical explanation',summary:3,detail:5,card:2,guide:'Clinical detail with a concise explanation and source limitations.',extraTitle:'Clinical interpretation'},
 {label:'Advanced professional',style:'Medical evidence review',summary:5,detail:7,card:3,guide:'Technical source detail, subtype distinctions and evidence appraisal.',extraTitle:'Evidence appraisal'}
];
export function roleIndex(role){return typeof role==='number'&&role>=0&&role<5?role:Math.max(0,readingRoles.indexOf(role))}
export const readingProfile=role=>({...profiles[roleIndex(role)],index:roleIndex(role)});
const patientQuestions=[
 'Which risk factors are relevant, and would testing change the care plan?',
 'Which changes should be reported, and what follow-up schedule is appropriate?',
 'What do the tests show, what are their limits, and which symptoms need urgent attention?',
 'What are the expected benefits, side effects, interactions and monitoring needs of the treatment options?',
 'What does the available evidence say about this specific type, and which complications should be watched for?',
 'Which prevention or screening advice applies to this age group and medical history?'
];
const studentTasks=[
 'Use the cited material to distinguish etiology from pathogenesis and link the mechanism to the phenotype.',
 'Separate untreated natural history from outcomes after intervention. Identify the missing timeline evidence.',
 'Compare subjective symptoms, objective signs and confirmatory tests. Do not equate screening with diagnosis.',
 'Relate the described therapeutic modalities to the underlying mechanism. Check indications in a current guideline.',
 'Separate prognostic factors from complications and identify the population behind any outcome estimate.',
 'Distinguish incidence from prevalence and identify primary, secondary and tertiary prevention when supported.'
];
export function readingGuidance(role,deck){
 const p=readingProfile(role),i=Math.max(0,Math.min(deck-1,5));
 if(p.index===1)return {title:p.extraTitle,text:patientQuestions[i]+' This is general education; do not start, stop or change treatment based on this summary.'};
 if(p.index===2)return {title:p.extraTitle,text:studentTasks[i]+' Use this as a supervised learning exercise.'};
 if(p.index===3)return {title:p.extraTitle,text:studentTasks[i]+' Confirm source currency, contraindications, patient context and local protocols before application.'};
 if(p.index===4)return {title:p.extraTitle,text:'Assess source type, population, intervention exposure, comparator, endpoints and follow-up. A patient-education summary or historical excerpt cannot establish a current guideline recommendation, effect estimate or individual prognosis.'};
 return null;
}
export function roleQuestions(role){
 const p=readingProfile(role);
 const labels=[
  ['What causes it?','How does it change over time?','What are the symptoms and tests?','How is it treated?','What is the outlook?','Who is affected, and can it be prevented?'],
  ['What should be understood about the causes?','What changes should be discussed with a clinician?','What symptoms and tests should be understood?','What should be discussed before treatment?','What should be asked about outlook and follow-up?','What prevention advice is available?'],
  ['Explain etiology and pathogenesis','Explain the disease course','Connect presentation with diagnostic tests','Explain treatment principles','Review prognosis and complications','Explain epidemiology and prevention'],
  ['Review causes and disease mechanisms','Review progression and intervention context','Review clinical presentation and diagnostic workup','Review management principles','Review prognosis and complications','Review population evidence and prevention'],
  ['Examine etiologic and mechanistic evidence','Assess natural-history evidence','Examine phenotype and diagnostic evidence','Appraise therapeutic evidence','Evaluate prognostic evidence and limitations','Assess epidemiology and prevention evidence']
 ][p.index];
 return labels.map((label,i)=>({deck:i+1,label,prompt:label}));
}
