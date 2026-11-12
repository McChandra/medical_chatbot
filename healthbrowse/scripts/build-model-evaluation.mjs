import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectQuery} from '../dist/clinical-engine.js';
import {evidenceFor,reviewMessages} from '../server/model-evidence.mjs';
import {compactGeneration,contextCost} from '../server/model-context.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(process.argv[2]||resolve(root,'inference/evaluation'));
const cases=[
 ['leukemia-overview','Leukemia','What is leukemia?',0],
 ['sore-throat-personal','Sore Throat','I have a sore throat and fever. What can cause this, and when should someone seek care?',0],
 ['leukemia-causes','Leukemia','What causes leukemia?',1],
 ['leukemia-course','Leukemia','What do the sources establish about leukemia without treatment?',2],
 ['leukemia-diagnosis','Leukemia','How is leukemia identified?',3],
 ['leukemia-treatment','Leukemia','What treatment approaches are described for leukemia?',4],
 ['leukemia-outlook','Leukemia','What complications and outcomes are described for leukemia?',5],
 ['leukemia-population','Leukemia','Who is affected by leukemia, and can it be prevented?',6],
 ['ldl-causes','LDL: The "Bad" Cholesterol','What causes high LDL cholesterol?',0],
 ['diabetes-management','Diabetes','How is diabetes managed?',0],
 ['hypertension','High Blood Pressure','How is high blood pressure identified and managed?',0],
 ['buddy-treatment','Sore Throat','When are antibiotics relevant, and when are they not helpful?',4],
 ['emergency-intercept','Sore Throat','I have a sore throat and cannot breathe',0],
 ['identifier-intercept','Sore Throat','My name is John Smith and I have a sore throat',0],
 ['missing-topic','Unindexed test topic','Explain this unindexed test topic.',0],
];
const assets=Object.fromEntries(['medline-topics','clinical-passages'].map(n=>['/'+n+'.json',{text:readFileSync(resolve(root,'dist',n+'.json'),'utf8')}]));
const rows=[],reviewPacket=[];
for(const [id,topic,question,deck] of cases){
 const input={topic,question,role:'General reader',mode:deck?'chat':'search',deck,history:[],searchQuery:deck?`What is ${topic}?`:question};
 const interception=inspectQuery(question);
 if(interception!=='ok'){rows.push({id,kind:'intercept',expected:interception,input});continue;}
 const evidence=evidenceFor(assets,topic,input.role,question);
 if(!evidence?.sources.length){rows.push({id,kind:'intercept',expected:'no_evidence',input});continue;}
 const p=compactGeneration(input,evidence);
 const coverage=Array.from({length:6},(_,i)=>({deck:i+1,source_ids:p.evidence.sources.filter(s=>s.deck===i+1&&!s.overview).map(s=>s.id)}));
 rows.push({id,kind:'generation',input,messages:p.messages,evidence:p.evidence,max_tokens:p.maxTokens,coverage,context_upper_bound:contextCost(p.messages,p.maxTokens)});
 reviewPacket.push({case_id:id,input,clinical_reviewed:false,license_reviewed:false,status:'needs-source-and-clinical-review',
  fields_to_review:['direct answer relevance','heading/deck mapping','full claim support and qualifiers','currentness and population','missing evidence','reader comprehension'],
  source_snapshot:evidence.snapshot,sections:coverage.map(c=>({...c,title:p.evidence.domains[c.deck-1].title,
    passages:evidence.sources.filter(s=>s.deck===c.deck),candidate_claims:[],reviewer_notes:'',reviewer_decision:'pending'})),
  answer:{candidate_claims:[],reviewer_notes:''},reviewer:{name:'',reviewed_at:'',approval_reference:''}});
}
// Explicit reviewer-contract controls. These are tests, not medical conclusions.
const sample=rows.find(r=>r.kind==='generation'&&r.evidence.sources.some(s=>s.text.length>=20&&s.text.length<=500));
const source=sample.evidence.sources.find(s=>s.text.length>=20&&s.text.length<=500);
for(const supported of [true,false]){
 const draft={answer:{claims:[{id:'C1',text:supported?source.text:'This excerpt establishes a guaranteed cure for every person.',support:[{id:source.id,quote:source.text}]}]},decks:[]};
 const evidence={...sample.evidence,sources:[source]};
 const input={...sample.input,question:'What does this excerpt establish?',mode:'chat'};
 rows.push({id:supported?'review-supported-control':'review-unsupported-control',kind:'review',input,draft,evidence,
  messages:reviewMessages(draft,evidence,input),max_tokens:1200,expected_supported:supported,
  note:'Synthetic contract control; not a clinical accuracy benchmark.'});
}
mkdirSync(out,{recursive:true});
const jsonl=rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
const inputs=['server/model-evidence.mjs','server/model-context.mjs','dist/disease-framework.js','dist/source-labels.js','dist/clinical-engine.js','dist/medline-topics.json','dist/clinical-passages.json'];
const hash=data=>createHash('sha256').update(data).digest('hex');
writeFileSync(resolve(out,'production-cases.jsonl'),jsonl);
writeFileSync(resolve(out,'review-packet.jsonl'),reviewPacket.map(r=>JSON.stringify(r)).join('\n')+'\n');
writeFileSync(resolve(out,'manifest.json'),JSON.stringify({version:1,fixture_sha256:hash(jsonl),case_count:rows.length,
 generation_cases:rows.filter(r=>r.kind==='generation').length,source_hashes:Object.fromEntries(inputs.map(p=>[p,hash(readFileSync(resolve(root,p)))])),
 clinical_release_approved:false,scope:'Development benchmark using current gateway retrieval and compact prompts. Holdout extraction results must be reported separately. No new facts or clinical approvals generated.'},null,2)+'\n');
console.log(JSON.stringify({output:out,cases:rows.length,review_packets:reviewPacket.length}));
