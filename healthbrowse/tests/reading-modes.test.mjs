import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {medlinePassages} from '../dist/disease-framework.js';
import {medlineIndex} from '../dist/medline.js';
import {remapPassages} from '../dist/medcard.js';
import {searchAnswer,domainAnswer,deckCount} from '../dist/search-experience.js';
import {readingRoles,roleQuestions,readingLabel,normalizeReadingRole} from '../dist/reading-profiles.js';
const read=name=>JSON.parse(readFileSync(new URL('../dist/'+name+'.json',import.meta.url)));
const feed=read('medline-topics'),index=medlineIndex(feed),archive=remapPassages(read('clinical-passages'));
const context=(topic,role='General reader')=>({topic,role,aliases:index.find(topic)?.aliases||[],passages:[...medlinePassages(index.find(topic),topic,feed),...(archive[topic]||[])],records:[]});
test('all audiences get answers to conversational and multipart questions',()=>{
 for(const role of readingRoles)for(const topic of ['Leukemia','Asthma','Diabetes','High Blood Pressure'])for(const query of [
  'Can you tell me what '+topic+' is?', 'What are the causes of '+topic+'?', 'How is '+topic+' diagnosed?', 'How is '+topic+' treated?', 'What is '+topic+' and how is it treated?', topic+' symptoms and treatment'
 ]){const result=searchAnswer(context(topic,role),query);assert.equal(result.supported,true,role+' '+query);assert.equal(result.gaps.length,0,role+' '+query);assert.ok(result.checks.every(c=>c.status==='supported'));assert.ok(result.blocks.every(b=>b.text===b.check.text))}
});
test('reading modes differ in clinical depth and supporting context, not just headings',()=>{
 const answers=readingRoles.map(role=>searchAnswer(context('Leukemia',role),'What is leukemia?'));
 assert.equal(new Set(answers.map(a=>a.text)).size,3);
 assert.equal(new Set(answers.map(a=>a.blocks.map(b=>b.text).join('\n'))).size,3);
 assert.equal(answers[0].blocks.length,1);assert.match(answers[1].guidance.text,/local protocols/);
 assert.ok(answers[1].blocks.length>answers[0].blocks.length);
 for(const role of readingRoles){assert.equal(deckCount(role),6);assert.equal(roleQuestions(role).length,6)}
});
test('a direct answer cannot be replaced by unrelated contextual detail',()=>{
 for(const role of readingRoles){
  const c=context('Leukemia',role),answer=searchAnswer(c,'What causes leukemia?');
  assert.match(answer.blocks[0].text,/genetic material/);assert.doesNotMatch(answer.blocks[0].text,/wheezing/);
  for(const question of ['Does leukemia always come from mutation XYZ123?','What is the price of leukemia treatment?'])assert.equal(searchAnswer(c,question).citations.length,0,question);
  const medication=searchAnswer(c,'Which medicine should I take?');assert.equal(medication.supported,false);assert.ok(medication.citations.every(c=>new URL(c.url).hostname==='www.fda.gov'));
 }
});
test('multipart requests preserve both answers and identify unsupported parts',()=>{
 const c=context('Leukemia');const result=searchAnswer(c,'What is leukemia and how is it treated?');
 assert.equal(result.blocks.length,2);assert.match(result.blocks[0].text,/blood/);assert.match(result.blocks[1].text,/treat/i);
 const partial=searchAnswer(c,'What is leukemia and what is the price of treatment?');assert.equal(partial.supported,true);assert.equal(partial.gaps.length,1);assert.match(partial.gaps[0],/price/);
});
test('guided follow-ups explain the active domain in every mode without excluding visible passages',()=>{
 for(const role of readingRoles)for(const number of [1,2,3,4,5,6]){
  const c=context('Asthma',role),first=domainAnswer(c,number),again=domainAnswer({...c,visibleTexts:first.checks.map(c=>c.text)},number);
  assert.equal(again.text,first.text);assert.ok(again.text.length);assert.ok(again.checks.every(c=>c.status==='supported'));
 }
});
test('heading-aware ingestion retains treatment and diagnosis after symptoms',()=>{
 for(const topic of ['Asthma','Diabetes','Leukemia']){
  const record=index.find(topic);for(const intent of ['definition','risk','identify','symptoms','therapy'])assert.ok(record.knowledge.some(p=>p.intent===intent),topic+' '+intent);
 }
 const diabetes=index.find('Diabetes');assert.ok(diabetes.knowledge.some(p=>p.intent==='public-health'&&p.text.includes("can't be prevented")));
});

test('General, Clinicians and Student are selectable without changing clinical stored IDs',()=>{
 assert.deepEqual(readingRoles.map(readingLabel),['General','Clinicians','Student']);
 for(const saved of ['General reader','Patient','General'])assert.equal(normalizeReadingRole(saved),readingRoles[0]);
 for(const saved of ['Medical student','Student'])assert.equal(normalizeReadingRole(saved),readingRoles[2]);
 for(const saved of ['Medical professional','Advanced professional','Clinicians'])assert.equal(normalizeReadingRole(saved),readingRoles[1]);
});
