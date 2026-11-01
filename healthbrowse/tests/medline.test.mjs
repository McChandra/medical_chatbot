import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {medlineIndex} from '../dist/medline.js';
const json=file=>JSON.parse(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'));
const data=json('medline-topics.json'), index=medlineIndex(data);

test('all 20 focus areas map to the original publisher page in the source registry',()=>{
  const catalog=json('catalog.json');
  assert.equal(Object.keys(catalog).length,20);
  for(const [name,rows] of Object.entries(catalog)){
    const expected=rows.find(r=>r.kind==='core' && /^https:\/\/medlineplus\.gov\/[\w-]+\.html$/.test(r.url)).url;
    assert.equal(index.find(name).url,expected,name);
  }
});
test('published feed supports out-of-catalog topics and uniquely matched synonyms',()=>{
  assert.ok(data.topics.length>=1000);
  assert.equal(index.find('SLE').title,'Lupus');
  assert.equal(index.find('a fabricated disease'),null);
  const ambiguous=medlineIndex({topics:[{title:'one',aliases:['xx']},{title:'two',aliases:['xx']}]});
  assert.equal(ambiguous.find('xx'),null);
});
test('link metadata is segregated from text extracted from public-domain summary fields',()=>{
  const leukemia=index.find('Leukemia');
  assert.match(leukemia.sections['1'],/blood/i);
  assert.match(leukemia.sections['6'],/symptom/i);
  assert.equal(new URL(leukemia.url).hostname,'medlineplus.gov');
  assert.equal(typeof leukemia.links['3'].publisher,'string');
  assert.match(data.feedDate,/^\d{4}-\d{2}-\d{2}$/);
  for(const r of data.topics){
    assert.ok(Object.values(r.sections).every(s=>s.length && !s.includes('<a ')));
    assert.ok(Object.values(r.links).every(l=>!new URL(l.url).pathname.startsWith('/ency/')));
  }
});
