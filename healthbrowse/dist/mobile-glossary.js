// Short editorial paraphrases linked to the original NCI dictionary entries.
// Verified against publisher pages on 2026-11-13; no patient-specific inference.
export const glossary={
 etiology:{definition:'What causes a disease or where it begins.',pronunciation:'EE-tee-AH-loh-jee'},
 prognosis:{definition:'The expected course of an illness, including the likelihood of recovery or the illness returning.',pronunciation:'prog-NO-sis'},
 biopsy:{definition:'A sample of cells or tissue is removed so a specialist can examine it, often with a microscope or laboratory tests.',pronunciation:'BY-op-see'},
 biomarker:{definition:'A molecule in blood, body fluids or tissue that can signal a biological process or disease, or help measure a response to treatment.',pronunciation:'BY-oh-MAR-ker'}
};
for(const [term,value] of Object.entries(glossary))value.url='https://www.cancer.gov/publications/dictionaries/cancer-terms/def/'+term;
export function annotateMedicalTerms(root){
 for(const node of root.querySelectorAll('.answer-text:not([data-glossary])')){
  node.dataset.glossary='true';
  for(const text of [...node.childNodes].filter(n=>n.nodeType===3)){
   const parts=text.textContent.split(/\b(etiology|prognosis|biopsy|biomarker)\b/gi);if(parts.length===1)continue;
   const fragment=document.createDocumentFragment();for(const part of parts){const term=part.toLowerCase();if(glossary[term]){const b=document.createElement('button');b.type='button';b.className='medical-term';b.dataset.term=term;b.textContent=part;b.setAttribute('aria-label','Explain '+part);fragment.append(b)}else fragment.append(document.createTextNode(part))}text.replaceWith(fragment);
  }
 }
}
