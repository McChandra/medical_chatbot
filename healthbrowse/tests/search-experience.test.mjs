import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchAnswer,domainAnswer,deckCount,buddyQuestions,fetchJSON,isOverviewQuestion} from '../dist/search-experience.js';
import {medlineIndex} from '../dist/medline.js';
import {medlinePassages} from '../dist/disease-framework.js';
import {remapPassages,correctSpelling} from '../dist/medcard.js';
import {resolveSearch,topicIndex} from '../dist/discovery.js';
import {questionDeck} from '../dist/clinical-engine.js';
const read=name=>JSON.parse(readFileSync(new URL('../dist/'+name+'.json',import.meta.url)));
const feed=read('medline-topics'),lookup=medlineIndex(feed),archive=remapPassages(read('clinical-passages')),taxonomy=read('taxonomy');
const context=topic=>({topic,role:'General reader',aliases:taxonomy.entities.find(e=>e.name===topic)?.aliases||[],passages:[...medlinePassages(lookup.find(topic),topic,feed),...(archive[topic]||[])],records:[]});
test('general browsing has six clinical decks and six explicit buddy prompts',()=>{
 assert.equal(deckCount('General reader'),6);assert.equal(deckCount('Medical professional'),7);
 assert.deepEqual(buddyQuestions.map(q=>q.deck),[1,2,3,4,5,6]);
});
test('ordinary question wording, spelling corrections and aliases produce supported direct answers',()=>{
 for(const [topic,query,pattern] of [['Leukemia','What is lukemia?',/blood/i],['Leukemia','How is leukemia treated?',/treat/i],['Leukemia','What are the symptoms of leukemia?',/symptom/i],['Diabetes','Tell me about diabetes',/diabet/i],['High Blood Pressure','hypertension',/pressure/i]]){
  const answer=searchAnswer(context(topic),query);assert.equal(answer.supported,true,query+' '+answer.text);assert.ok(answer.citations.length,query);assert.match(answer.text,pattern);assert.ok(answer.checks.every(c=>c.status==='supported'));
 }
 assert.equal(questionDeck('How does treatment work?'),4);
});
test('the direct answer addresses the question rather than substituting a definition',()=>{
 const c=context('Leukemia'),symptoms=searchAnswer(c,'What are the symptoms of leukemia?');
 assert.notEqual(symptoms.text,c.passages.find(p=>p.overview).text);
 const missing=searchAnswer(c,'Does leukemia always come from a specific mutation XYZ123?');assert.equal(missing.supported,false);assert.equal(missing.citations.length,0);
});
test('chat overview recognition cannot replace a specific clinical question',()=>{
 const c=context('Leukemia');
 for(const q of ['What is leukemia?','Tell me about leukemia','Explain it','What is lukemia?'])assert.equal(isOverviewQuestion(c,q),true,q);
 for(const q of ['What is the treatment for leukemia?','What is the untreated disease course in leukemia?','Tell me about the prognosis of leukemia','What is the cause of leukemia?'])assert.equal(isOverviewQuestion(c,q),false,q);
});
test('guided exploration returns intact checked passages or a visible evidence gap for every deck',()=>{
 for(const topic of ['Leukemia','Diabetes','Asthma'])for(const n of [1,2,3,4,5,6]){
  const answer=domainAnswer(context(topic),n);assert.equal(answer.deck,n);assert.ok(answer.text.length);assert.equal(answer.citations.length,answer.checks.length);assert.ok(answer.checks.every(c=>c.status==='supported'));
 }
 assert.match(domainAnswer({...context('Leukemia'),passages:[]},4).text,/don’t have enough/);
 assert.equal(domainAnswer(context('Leukemia'),7),null);
});
test('full browser questions resolve independently of the previously selected topic',()=>{
 const index=topicIndex([...feed.topics.map(t=>({name:t.title,aliases:t.aliases||[]})),...taxonomy.entities]);
 for(const [q,expected] of [['What is lukemia?','Leukemia'],['How is asthma treated?','Asthma'],['What are the symptoms of diabetes?','Diabetes']])assert.ok(resolveSearch(correctSpelling(q),index).choices.includes(expected),q);
});
test('an unresponsive source request expires and caller cancellation propagates',async t=>{
 t.mock.method(globalThis,'fetch',async(_url,{signal})=>new Promise((_,reject)=>{if(signal.aborted)reject(new Error('aborted'));else signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})}));
 await assert.rejects(fetchJSON('/fixture',{timeout:15}),/aborted/);
 const controller=new AbortController();controller.abort();await assert.rejects(fetchJSON('/fixture',{signal:controller.signal,timeout:10000}),/aborted/);
});
