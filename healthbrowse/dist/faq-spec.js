export const faqQuestions=[
 'Who is most affected, and what are the risk factors? (Epidemiology)',
 'What exactly causes this condition? (Etiology & Pathogenesis)',
 'What are the common signs and symptoms? (Clinical Manifestations)',
 'How is this diagnosed and tested? (Diagnostic Modalities)',
 'What are the treatment and management options? (Treatment)',
 'What is the long-term outlook? (Prognosis & Follow-up)'
];
export const generalTreatmentNotice='Please consult your doctor before starting any treatment.';

// Map the existing disease-spectrum source annotations into FAQ semantics.
// A paragraph may support two questions, but its text is never rewritten.
export function faqPassages(p){
 if(p.frameworkVersion==='medical-faq-v3')return [p];
 const old=Number(p.deck),text=p.text||'',heading=p.heading||'',decks=new Set();
 if(old===1){
  decks.add(2);
  if(!p.overview&&/risk|susceptib|more likely|family history|smoking|exposure|over age|most common/i.test(heading+' '+text))decks.add(1);
 }else if(old===2||old===5)decks.add(6);
 else if(old===3){
  const diagnostic=p.intent==='identify'||/diagnos|test|screen|biops|imaging|immunophenotyp|cytogenetic|examination/i.test(heading+' '+text);
  const symptoms=p.intent==='symptoms'||/symptoms? (?:include|can include|may include|are)|signs? (?:include|of)|common symptoms|early symptoms|no symptoms|does not (?:have|cause) symptoms/i.test(heading+' '+text);
  if(diagnostic)decks.add(4);
  if(symptoms||!diagnostic)decks.add(3);
 }else if(old===4)decks.add(5);
 else if(old===6)decks.add(1);
 else if(old===7)decks.add(7);
 return [...decks].map(deck=>({...p,deck,sourceDeck:old,frameworkVersion:'medical-faq-v3'}));
}
