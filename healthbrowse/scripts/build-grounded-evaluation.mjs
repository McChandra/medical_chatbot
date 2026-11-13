import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {groundedEvidence,prepareGrounded,groundedReview} from '../server/model-grounded.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'inference/evaluation-v2');
const assets=Object.fromEntries(['medline-topics','clinical-passages','grounded-sources'].map(n=>['/'+n+'.json',{text:readFileSync(resolve(root,'dist',n+'.json'),'utf8')}]));
const definitions=[
 ['leukemia-overview','Leukemia','What is leukemia?',0],
 ['sore-throat-personal','Sore Throat','I have a sore throat and fever. What can cause this, and when should someone seek care?',0],
 ['leukemia-outlook','Leukemia','What complications and outcomes are described for leukemia?',5],
 ['buddy-treatment','Sore Throat','When are antibiotics relevant, and when are they not helpful?',4],
 ['leukemia-population','Leukemia','Who is affected by leukemia, and can it be prevented?',6],
 ['diabetes-management','Diabetes','How is diabetes managed?',0],
 ['ldl-causes','LDL: The "Bad" Cholesterol','What causes high LDL cholesterol?',0],
 ['hypertension','High Blood Pressure','How is high blood pressure identified and managed?',0],
];
const cases=definitions.map(([id,topic,question,deck])=>{
 const input={topic,question,role:'General reader',mode:deck?'chat':'search',deck,history:[],searchQuery:`What is ${topic}?`};
 const prepared=prepareGrounded(input,groundedEvidence(assets,input));
 return {id,input,prepared};
});
const controls=[];
function control(id,caseId,text,source,expectedSupported,{gaps=[],expectedCoverage}={}){
 const c=cases.find(c=>c.id===caseId),prepared={...c.prepared,evidence:{...c.prepared.evidence,sources:[source]}};
 const draft={answer:{claims:[{id:'C1',text,support:[{id:source.id,quote:source.text}]}]},decks:[],gaps};
 const request=groundedReview(draft,prepared,c.input);
 controls.push({id,input:c.input,prepared,draft,request,expectedSupported,expectedCoverage,
  provenance:'Regression control derived from evaluation v1 failure; not training data or a clinical claim.'});
}
const source=(id,text,focus)=>({id,text,focus,date:'Regression control; original source scope retained'});
control('wrong-staging-citation','leukemia-outlook','Complications of leukemia include anemia, bleeding, infection, and organ damage.',source('X1','There is no standard staging system for adult AML.','Adult Acute Myeloid Leukemia'),false);
control('wrong-causes-for-antibiotics','buddy-treatment','Antibiotics clear strep throat and prevent complications but do not help viral infections.',source('X1','You can have a sore throat for many reasons. Often, colds and flu cause sore throats. Other causes can include allergies, mononucleosis, smoking, strep throat, and tonsillitis.','Sore Throat'),false);
control('wrong-mechanism-for-management','diabetes-management','Diabetes is managed with medicines, diet and exercise.',source('X1',"If you have diabetes, your body can't make insulin, can't use insulin as well as it should, or both. Too much glucose stays in your blood and doesn't reach your cells.",'Diabetes'),false);
const sore=cases.find(c=>c.id==='sore-throat-personal').prepared.evidence.sources.find(s=>s.intent==='risk');
control('missing-when-to-seek-care','sore-throat-personal','Colds and flu often cause sore throats.',sore,false,{expectedCoverage:{F2:'missed'}});
const age=cases.find(c=>c.id==='leukemia-population').prepared.evidence.sources.find(s=>s.intent==='population');
control('missing-prevention','leukemia-population','The risk of leukemia goes up with age; it is most common over age 60.',age,false,{expectedCoverage:{F2:'missed'}});
const viral=cases.find(c=>c.id==='buddy-treatment').prepared.evidence.sources.find(s=>s.text.startsWith('If a virus'));
// A standalone positive question avoids falsely treating half a compound answer as complete.
const goodCase=structuredClone(cases.find(c=>c.id==='buddy-treatment'));
goodCase.id='viral-positive';goodCase.input.question='Do antibiotics help a viral sore throat?';cases.push(goodCase);
control('supported-viral-antibiotic','viral-positive','If a virus causes a sore throat, antibiotics will not help.',viral,true);
cases.pop();
const directory={version:2,cases,controls};mkdirSync(out,{recursive:true});
const raw=JSON.stringify(directory,null,2)+'\n';writeFileSync(resolve(out,'cases.json'),raw);
const files=['dist/faq-spec.js','server/buddy-prompt.mjs','dist/buddy-policy.js','server/model-cited.mjs','server/model-grounded.mjs','server/model-api.mjs','server/model-provider.mjs','server/model-evidence.mjs','server/model-context.mjs','dist/grounded-sources.json','dist/medline-topics.json','dist/clinical-passages.json','dist/medline.js','dist/medcard.js','dist/reading-profiles.js','dist/source-labels.js','dist/claim-check.js','dist/clinical-engine.js','dist/safety-policy.js','dist/search-experience.js','dist/authorities.js','dist/disease-framework.js'];
writeFileSync(resolve(out,'manifest.json'),JSON.stringify({version:2,sha256:createHash('sha256').update(raw).digest('hex'),sourceHashes:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')])),clinical_release_approved:false,scope:'Development regression cases using actual gateway v2. Not a final test set or clinical validation.'},null,2)+'\n');
console.log(JSON.stringify({pipelineCases:cases.length,reviewControls:controls.length}));
