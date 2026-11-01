import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {correctSpelling,sectionNames,sectionSources,remapPassages,codeQuery} from '../dist/medcard.js';
import {resolveSearch,topicIndex} from '../dist/discovery.js';
import {medlineIndex} from '../dist/medline.js';
import {deckNames,} from '../dist/workspace.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../dist/'+name+'.json',import.meta.url)));
test('all 20 curated focus areas have seven ordered sections and a MedlinePlus publisher page',()=>{
 const catalog=read('catalog'),index=medlineIndex(read('medline-topics'));
 assert.equal(Object.keys(catalog).length,20);assert.equal(sectionNames.length,7);assert.equal(deckNames.length,7);
 for(const [topic,records] of Object.entries(catalog)){assert.ok(index.find(topic)?.url,topic);for(let n=1;n<=7;n++)assert.ok(Array.isArray(sectionSources(n,records,topic,0)))}
});
test('leukemia typo, outside-catalog questions and exact coding queries',()=>{
 const idx=topicIndex(read('taxonomy').entities,['Cystic Fibrosis']);
 assert.deepEqual(resolveSearch(correctSpelling('What is lukemia?'),idx).choices,['Leukemia']);
 assert.deepEqual(resolveSearch('How is cystic fibrosis diagnosed?',idx).choices,['Cystic Fibrosis']);
 assert.equal(codeQuery('What is ICD-9 250.00?'),'ICD-9 250.00');
 assert.equal(codeQuery('SNOMED CT 73211009'),'SNOMED CT 73211009');
 assert.deepEqual(remapPassages({a:[{deck:5},{deck:7},{deck:8}]}).a.map(r=>r.deck),[2,6,3]);
});
