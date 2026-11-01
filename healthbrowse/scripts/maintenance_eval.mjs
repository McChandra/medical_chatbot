// Fixed, public synthetic cases for an engineering smoke experiment.
// This is not a clinical adjudication dataset or an estimate of diagnostic accuracy.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {correctSpelling} from '../dist/medcard.js';
import {topicIndex, resolveSearch} from '../dist/discovery.js';
import {inScopeChoices} from '../dist/topic-scope.js';

const read = file => fs.readFileSync(new URL('../dist/' + file, import.meta.url));
const data = read('medline-topics.json');
const feed = JSON.parse(data);
const entities = JSON.parse(read('taxonomy.json')).entities;
const index = topicIndex([...feed.topics.map(t => ({name:t.title, aliases:[]})), ...entities], JSON.parse(read('topic-list.json')));
const cases = [
  ['What is lukemia?', ['Leukemia']],
  ['Breast Cancer', ['Breast Cancer']],
  ['Which blood pressure studies discuss hypertension?', ['High Blood Pressure']],
  ['What are the risk factors for shingles?', ['Shingles']],
  ['What are the treatments for Parkinson’s disease?', ["Parkinson's Disease"]],
  ['How is cystic fibrosis diagnosed?', ['Cystic Fibrosis']],
  ['Find research on stroke and diabetes', ['Stroke','Diabetes']],
  ['an entirely unrecognized qzxvtopic', []],
];
const options = [...index.entries()];
const exact = s => options.filter(([term])=>term===s.toLowerCase().trim()).map(([,name])=>name);
const routed = s => inScopeChoices(resolveSearch(correctSpelling(s),index).choices);
const same=(a,b)=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...b].sort());
const results = cases.map(([query,expected])=>{
  const baseline=exact(query), full=routed(query);
  return {query,expected,exact:baseline,routed:full,exactCorrect:same(baseline,expected),routedCorrect:same(full,expected)};
});
console.log(JSON.stringify({
  experiment:'known-term resolution smoke set v1',
  sourceSha256:createHash('sha256').update(data).digest('hex'),
  caseCount:results.length,
  exactMatchCount:results.filter(r=>r.exactCorrect).length,
  phraseMatchCount:results.filter(r=>r.routedCorrect).length,
  cases:results
},null,2));
