import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {medlinePassages} from '../dist/disease-framework.js';
import {normalizeSourceLabel} from '../dist/source-labels.js';
test('LDL treatment targets are not causes merely because text mentions high risk',()=>{
 const feed=JSON.parse(readFileSync(new URL('../dist/medline-topics.json',import.meta.url)));
 const record=feed.topics.find(t=>t.title==='LDL: The "Bad" Cholesterol');
 const original=record.knowledge.find(p=>p.text.includes('different goals'));
 const corrected=medlinePassages(record,record.title,feed).find(p=>p.id===original.id);
 assert.equal(corrected.deck,4);assert.equal(corrected.text,original.text);assert.equal(corrected.url,record.url);
 assert.equal(normalizeSourceLabel({heading:'What causes leukemia?',deck:1,text:'A source passage.'}).deck,1);
});
