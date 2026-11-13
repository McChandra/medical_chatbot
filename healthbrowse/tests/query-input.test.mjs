import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareQuery,canSaveResearchQuestion} from '../dist/query-input.js';
import {topicIndex,resolveSearch} from '../dist/discovery.js';
import {medlinePassages} from '../dist/disease-framework.js';
import {searchAnswer,domainAnswer} from '../dist/search-experience.js';
import {attachSearch} from '../dist/search-startup.js';

const feed=JSON.parse(readFileSync(new URL('../dist/medline-topics.json',import.meta.url)));
const index=topicIndex(feed.topics.map(t=>({name:t.title,aliases:t.aliases||[]})));
const record=feed.topics.find(t=>t.title==='Sore Throat');
const context={topic:record.title,passages:medlinePassages(record,record.title,feed),records:[]};

test('the reported symptom statement becomes a public query with a cited answer in both modes',()=>{
 for(const wording of ['I have a sore throat','I have sore throat.','I am having a sore throat','I’m experiencing a sore throat']){
  const prepared=prepareQuery(wording);
  assert.equal(prepared.status,'ok');assert.equal(prepared.symptom,'Sore Throat');
  assert.doesNotMatch(prepared.query,/\bi (?:have|am)\b/i);
  assert.deepEqual(resolveSearch(prepared.query,index).choices,['Sore Throat']);
  for(const role of ['General reader','Medical professional']){
   const response=searchAnswer({...context,role},prepared.query);
   assert.equal(response.supported,true);assert.equal(response.blocks.length,2);assert.deepEqual(response.gaps,[]);
   assert.ok(response.citations.every(c=>c.url==='https://medlineplus.gov/sorethroat.html'));
   assert.ok(response.checks.every(c=>c.status==='supported'));
   assert.match(response.text,/Other causes can include/);assert.match(response.text,/Treatment depends on the cause/);
   for(let n=1;n<=6;n++)assert.ok(domainAnswer({...context,role},n).text);
  }
 }
});
test('common symptom wording is recognized without treating it as a confirmed diagnosis',()=>{
 for(const [input,topic] of [['I have a headache','Headache'],['I have a cough','Cough'],['I feel dizzy','Dizziness and Vertigo'],['I have a rash','Rashes']]){
  const prepared=prepareQuery(input);assert.equal(prepared.status,'ok');assert.equal(prepared.symptom,topic);assert.match(prepared.notice,/does not determine/);
 }
});
test('identifiers remain blocked while ordinary symptom questions retain their wording',()=>{
 for(const input of ['I have a sore throat and my name is Jane','I have a sore throat alex@example.org','My patient Jane has a sore throat','I am John Smith, I have a sore throat','I have a sore throat, DOB 18/12/1994']){
  const prepared=prepareQuery(input);assert.equal(prepared.status,'private',input);assert.equal(prepared.query,'');
 }
 for(const input of ['I have a sore throat for 3 weeks','I have a sore throat and take warfarin','I have a sore throat and a fever','My child has a sore throat','I have diabetes']){
  const prepared=prepareQuery(input);assert.equal(prepared.status,'ok',input);assert.equal(prepared.query,input);assert.equal(prepared.ephemeral,true);
  assert.equal(canSaveResearchQuestion(input),false);
 }
 for(const input of ['I have a sore throat and cannot breathe','I have a sore throat and cannot swallow','I have a sore throat and difficulty breathing','I have chest pain'])assert.equal(prepareQuery(input).status,'emergency',input);
 assert.equal(prepareQuery('What causes difficulty swallowing?').status,'ok');
});
test('natural symptom questions receive cited educational answers instead of a rephrase wall',()=>{
 for(const question of ['I have a sore throat, what should I do?','I have been having a sore throat for three days. Can you help?','Why is my throat sore?','My throat hurts','My child has a sore throat','I have a sore throat and take warfarin']){
  const p=prepareQuery(question);assert.equal(p.status,'ok',question);
  assert.deepEqual(resolveSearch(p.query,index).choices,['Sore Throat'],question);
  for(const role of ['General reader','Medical professional']){
   const answer=searchAnswer({...context,role},p.query);
   assert.equal(answer.supported,true,question);assert.ok(answer.citations.length);
   assert.match(answer.text,/Other causes can include/);assert.match(answer.text,/Treatment depends on the cause/);
   if(role==='General reader')assert.match(answer.text,/do not determine the cause/);
   else{assert.match(answer.text,/Clinical reference.*history, examination, investigations and local protocols/);assert.doesNotMatch(answer.text,/your symptoms|your duration/);}
   assert.doesNotMatch(answer.text,/rephrase|Remove personal details/);
   for(let n=1;n<=6;n++)assert.ok(domainAnswer({...context,role},n).text);
  }
 }
 assert.equal(canSaveResearchQuestion('Explain the causes','I have a sore throat for 3 days'),false);
 assert.equal(canSaveResearchQuestion('What causes sore throat?','Sore Throat'),true);
});
test('an explicit public follow-up keeps its requested intent',()=>{
 const answer=searchAnswer({...context,role:'General reader'},'I have a sore throat. How is it treated?');
 assert.equal(answer.supported,true);assert.match(answer.text,/Treatment depends/);
 assert.doesNotMatch(answer.blocks.map(b=>b.text).join(' '),/Other causes can include/);
});
test('ordinary disease questions stay intact, including separate question clauses',()=>{
 assert.deepEqual(prepareQuery('What is leukemia?'),{status:'ok',query:'What is leukemia?'});
 const response=searchAnswer({...context,role:'General reader'},'What causes sore throat? How is sore throat treated?');
 assert.equal(response.blocks.length,2);assert.deepEqual(response.gaps,[]);
});
test('the form submission path used by Enter and Search produces the symptom answer',async()=>{
 const input={value:'I have a sore throat'},form={setAttribute(){}},submit={},notice={};
 let answer;
 const ui=attachSearch({form,input,submit,notice,reload(){}});
 ui.ready(raw=>{const p=prepareQuery(raw);answer=searchAnswer({...context,role:'General reader'},p.query)});
 form.onsubmit({preventDefault(){}});await Promise.resolve();await Promise.resolve();
 assert.equal(answer.supported,true);assert.equal(answer.blocks.length,2);
});
