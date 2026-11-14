import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createQuerySuggestions,completionKey} from '../dist/query-completion.js';
const suggest=createQuerySuggestions([{title:'Leukemia',aliases:['Leukaemia']},{title:'Sore Throat'},{title:'High Blood Pressure',aliases:['Hypertension']}]);
test('typing a condition gives full questions, including intent-specific prefixes and aliases',()=>{
 assert.equal(suggest('leu')[0],'What is Leukemia?');
 assert.ok(suggest('leu').every(s=>s.endsWith('?')&&s.includes(' ')));
 assert.deepEqual(suggest('What are the symptoms of leu'),['What are the symptoms of Leukemia?']);
 assert.deepEqual(suggest('How is leukaemia tr'),['How is Leukemia treated?']);
 assert.equal(suggest('hyper')[0],'What is High Blood Pressure?');
 assert.deepEqual(suggest(''),[]);assert.deepEqual(suggest('l'),[]);assert.deepEqual(suggest('What is Leukemia?'),[]);
});
test('symptom completions preserve the typed prefix and never remove additional symptoms',()=>{
 assert.equal(suggest('I have a sore')[0],'I have a Sore Throat. What could cause it?');
 assert.deepEqual(suggest('I have a sore throat and fever'),[]);
 assert.deepEqual(suggest('My name is Patient Example and I have leukemia'),[]);
});
test('Tab accepts the first or arrow-selected suggestion while Enter still submits unselected text',()=>{
 assert.deepEqual(completionKey({key:'Tab'},5,-1),{accept:0});
 assert.deepEqual(completionKey({key:'ArrowDown'},5,-1),{active:0});
 assert.deepEqual(completionKey({key:'ArrowUp'},5,-1),{active:4});
 assert.deepEqual(completionKey({key:'Tab'},5,2),{accept:2});
 assert.deepEqual(completionKey({key:'Enter'},5,2),{accept:2});
 assert.equal(completionKey({key:'Enter'},5,-1),null);
 assert.equal(completionKey({key:'Tab',shiftKey:true},5,2),null);
 assert.equal(completionKey({key:'Tab'},0,-1),null);
 assert.equal(completionKey({key:'Enter',isComposing:true},5,2),null);
 assert.deepEqual(completionKey({key:'Escape'},5,2),{close:true});
});
test('full topic index yields bounded, unique question suggestions without native disease options',()=>{
 const feed=JSON.parse(readFileSync(new URL('../dist/medline-topics.json',import.meta.url)));
 const complete=createQuerySuggestions(feed.topics);
 for(const value of ['leu','diab','What is','How is asthma','sore th']){
  const rows=complete(value);assert.ok(rows.length>0&&rows.length<=5);assert.equal(new Set(rows).size,rows.length);assert.ok(rows.every(s=>s.endsWith('?')));
 }
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/<datalist|list="topics"|class="examples"/);
 assert.match(html,/aria-controls="querySuggestions"/);
});
