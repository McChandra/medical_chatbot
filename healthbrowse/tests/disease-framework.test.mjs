import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {domains,routePassage,medlinePassages,professionalRole,orderedPassages,frameworkVersion} from '../dist/disease-framework.js';
import {questionDeck,answerQuestion} from '../dist/clinical-engine.js';
import {verifyClaim} from '../dist/claim-check.js';
const topic='Asthma';
const passage=(text,props={})=>({text,topic,focus:topic,deck:3,title:'Fixture education passage',url:'https://medlineplus.gov/asthma.html',record:'fixture:1',...props});
test('all six clinical domains and research resources use stable, distinct routing',()=>{
 assert.equal(domains.length,7);
 for(const [q,n] of [['What causes asthma?',1],['How does asthma progress?',2],['What is the untreated disease course?',2],['What is the disease progression?',2],['Which diagnostic tests are described?',3],['What treatment classes are described?',4],['Which complications are described?',5],['What is the prevalence of asthma?',6],['Which research papers are available?',7]])assert.equal(questionDeck(q),n,q);
});
test('natural history does not infer treatment exposure or manufacture a timeline',()=>{
 const [p]=routePassage(passage('The disease progresses over time.',{deck:1})).filter(p=>p.deck===2);
 assert.equal(p.courseContext,'unspecified');
 assert.equal(answerQuestion({topic,question:'Describe the untreated course',passages:[p]}).citations.length,0);
 assert.equal(routePassage(passage('The treatment improves survival.',{deck:7})).some(p=>p.deck===2),false);
 const untreated=routePassage(passage('Without treatment the disease progresses.',{deck:4})).find(p=>p.deck===2);
 assert.equal(untreated.courseContext,'untreated');
});
test('general and professional modes prioritize appropriate source passages without changing clinical claims',()=>{
 const basic=passage('Diagnostic tests include a breathing test.'),technical=passage('Cytogenetic analysis is a diagnostic test.',{url:'https://www.cancer.gov/example',record:'fixture:2'});
 assert.equal(orderedPassages([technical,basic],'General reader',topic)[0],basic);
 assert.equal(orderedPassages([basic,technical],'Medical professional',topic)[0],technical);
 assert.equal(answerQuestion({topic,question:'Which diagnostic tests are described?',role:'General reader',passages:[technical,basic]}).text,basic.text);
 assert.equal(answerQuestion({topic,question:'Which diagnostic tests are described?',role:'Medical professional',passages:[basic,technical]}).text,technical.text);
 for(const r of ['General reader','Patient','Medical student','General',0,2])assert.equal(professionalRole(r),false);
 for(const r of ['Medical professional','Advanced professional','Clinicians',1,3,4])assert.equal(professionalRole(r),true);
});
test('source checks deny impersonated publishers and unpinned archives',()=>{
 for(const url of ['https://medlineplus.gov.evil.test/article','https://medlineplus.gov@evil.test/article','https://example.com/article']){
  const p=passage('Symptoms include cough.',{url});
  assert.equal(verifyClaim({kind:'passage',topic,sourceUrl:url,field:'text',value:p.text,record:p.record},{topic,passages:[p]}).status,'withheld');
 }
 const p=passage('Symptoms include cough.',{sourceRecord:'https://github.com/abachaa/MedQuAD/blob/main/record.xml'});
 assert.equal(verifyClaim({kind:'passage',topic,sourceUrl:p.url,field:'text',value:p.text,record:p.record},{topic,passages:[p]}).status,'withheld');
});
test('all existing MedlinePlus topics retain intact excerpts, source IDs and overview provenance',()=>{
 const feed=JSON.parse(readFileSync(new URL('../dist/medline-topics.json',import.meta.url)));
 for(const record of feed.topics){
  const rows=medlinePassages(record,record.title,feed),originals=record.knowledge?.length?record.knowledge.map(p=>p.text):Object.values(record.sections).flat();
  for(const row of rows){assert.ok(originals.includes(row.text));assert.equal(row.frameworkVersion,frameworkVersion);assert.ok(row.deck>=1&&row.deck<=7);assert.ok(row.record.startsWith(record.url+'#'))}
  if(record.knowledge?.some(p=>p.overview)||!record.knowledge&&record.sections['1'])assert.ok(rows.some(p=>p.overview),record.title);
 }
});
test('claim correction cannot silently cross topics or source records',()=>{
 const p=passage('Symptoms include cough.');
 const claim={kind:'passage',topic,sourceUrl:p.url,field:'text',value:'Invented assertion.',record:p.record,allowCorrection:true};
 const result=verifyClaim(claim,{topic,passages:[p]});assert.equal(result.status,'corrected');assert.equal(result.text,p.text);assert.match(result.reason,/not independent clinical validation/);
 assert.equal(verifyClaim({...claim,record:'different'},{topic,passages:[p]}).status,'withheld');
 assert.equal(verifyClaim(claim,{topic:'Diabetes',passages:[p]}).status,'withheld');
});
test('risk exposures and diagnostic biomarkers cannot drift into treatment or causation cards',()=>{
 const risk=routePassage(passage('Previous chemotherapy treatment may affect the risk of AML.',{deck:2}));
 assert.deepEqual(risk.map(p=>p.deck),[1]);
 const diagnosis=routePassage(passage('Immunophenotyping compares cells to normal cells of the immune system.',{deck:5}));
 assert.deepEqual(diagnosis.map(p=>p.deck),[3]);
});
