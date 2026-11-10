import {inspectInput} from './clinical-engine.js';

// Convert only complete, simple symptom statements into public topic questions.
// This is local intent recognition, not diagnosis or a general PHI scrubber.
// Extra identifiers, histories, medicines and qualifiers must not be discarded.
const symptoms=new Map([
 ['sore throat','Sore Throat'],['throat pain','Sore Throat'],
 ['cough','Cough'],['coughing','Cough'],['headache','Headache'],
 ['fever','Fever'],['fatigue','Fatigue'],['tired','Fatigue'],
 ['back pain','Back Pain'],['abdominal pain','Abdominal Pain'],['stomach pain','Abdominal Pain'],
 ['diarrhea','Diarrhea'],['diarrhoea','Diarrhea'],['constipation','Constipation'],
 ['rash','Rashes'],['itching','Itching'],['nausea','Nausea and Vomiting'],['vomiting','Nausea and Vomiting'],
 ['dizzy','Dizziness and Vertigo'],['dizziness','Dizziness and Vertigo']
]);
export function prepareQuery(input){
 const original=String(input??'').trim(),status=inspectInput(original);
 if(status==='emergency')return {status,query:''};
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
 return {status,query:status==='ok'?original:''};
}
