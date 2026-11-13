import {assessSafety,safetyAnswer} from './safety-policy.js';
import {inspectInput,inspectQuery} from './clinical-engine.js';
import {securityVariants,assessBuddySafety,buddySafetyAnswer} from './buddy-policy.js';

// Convert only complete, simple symptom statements into public topic questions.
// This is local intent recognition, not diagnosis or a general PHI scrubber.
// Richer symptom questions stay intact and ephemeral; identifiers remain blocked.
const symptoms=new Map([
 ['sore throat','Sore Throat'],['throat pain','Sore Throat'],
 ['cough','Cough'],['coughing','Cough'],['headache','Headache'],
 ['fever','Fever'],['fatigue','Fatigue'],['tired','Fatigue'],
 ['back pain','Back Pain'],['abdominal pain','Abdominal Pain'],['stomach pain','Abdominal Pain'],
 ['diarrhea','Diarrhea'],['diarrhoea','Diarrhea'],['constipation','Constipation'],
 ['rash','Rashes'],['itching','Itching'],['nausea','Nausea and Vomiting'],['vomiting','Nausea and Vomiting'],
 ['dizzy','Dizziness and Vertigo'],['dizziness','Dizziness and Vertigo']
]);
export function prepareQuery(input,context=""){
 const original=String(input??'').trim(),status=inspectQuery(original);
 if(status==='unsafe'){
  const clinical=securityVariants(original).map(text=>assessSafety(text,context)).find(result=>result.action!=='allow');
  return {status,query:'',safety:clinical?safetyAnswer(clinical.category):buddySafetyAnswer(assessBuddySafety(original).category)};
 }
 if(status!=='ok')return {status,query:'',...(status==='private'?{safety:buddySafetyAnswer('private_input')}:{})};
 const safety=assessSafety(original,context);if(safety.action!=='allow')return {status:'unsafe',query:'',safety:safetyAnswer(safety.category)};
 const simple=original.toLowerCase().replace(/[’]/g,"'").replace(/[.!?]+$/,'').trim();
 const match=simple.match(/^(?:i have|i am having|i'm having|i am experiencing|i'm experiencing|i have got|i've got|i feel|i am|i'm)\s+(?:a\s+|an\s+)?([a-z ]+)$/);
 const symptom=match&&symptoms.get(match[1].trim());
 if(symptom){
  // A full-string allowlist ensures no clinical detail or identity was silently
  // stripped before the general question is sent to retrieval/model services.
  const name=symptom.toLowerCase();
  return {status:'ok',symptom,query:'What causes '+name+'? How is '+name+' treated?',
   notice:'Showing general information about '+name+'. This does not determine the cause of your symptoms.'};
 }
 if(inspectInput(original)==='private')return {status:'ok',query:original,ephemeral:true,
  notice:'General information, not a diagnosis. This personal question is not saved to chat history.'};
 return {status:'ok',query:original};
}

export function canSaveResearchQuestion(question,browserQuestion=''){
 return inspectInput(question)==='ok'&&(!browserQuestion||inspectInput(browserQuestion)==='ok');
}
