import test from 'node:test';import assert from 'node:assert/strict';
import {topicIndex} from '../dist/discovery.js';import {newSubjects,inScopeChoices} from '../dist/topic-scope.js';
const idx=topicIndex([] ,['Leukemia','Asthma','Clinical Trials','Genetics','Blood']);
test('research facets do not change disease; explicit different diseases need confirmation',()=>{
 assert.deepEqual(newSubjects('Research papers about leukemia genetics',idx,'Leukemia'),[]);
 assert.deepEqual(newSubjects('What are the symptoms of asthma?',idx,'Leukemia'),['Asthma']);
 assert.deepEqual(inScopeChoices(['Leukemia','Clinical Trials']),['Leukemia']);
});
