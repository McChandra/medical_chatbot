import test from 'node:test';
import assert from 'node:assert/strict';
import {searchEvidence} from '../dist/evidence.js';

function study(id, overrides={}) {
  return {id:String(id), source:'MED', title:'Stroke prevention', pubYear:'2024',
    pubTypeList:{pubType:['Systematic Review']}, ...overrides};
}
function mock(t, rows) {
  return t.mock.method(globalThis, 'fetch', async () => Response.json({resultList:{result:rows}}));
}

test('limits retrieval to catalog topics and sends only structured public topic terms', async t => {
  const fetch = mock(t, []);
  await assert.rejects(searchEvidence('my patient Jane has stroke'));
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual((await searchEvidence('Heart Attack')).records, []);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url.hostname, 'www.ebi.ac.uk');
  assert.match(url.searchParams.get('query'), /TITLE:"myocardial infarction"/);
  assert.equal(options.credentials, 'omit');
});

test('requires title match, MED id and supported type; excludes integrity notices and duplicates', async t => {
  mock(t,[study(1,{doi:'10.1/ab'}),study(2,{doi:'10.1/AB'}),study(3,{title:'Heatstroke management'}),
    study(4,{source:'PPR'}),study('invalid'),study(5,{pubTypeList:{pubType:['Comment']}}),
    study(6,{commentCorrectionList:{commentCorrection:[{type:'RetractionIn'}]}}),
    study(7,{pubTypeList:{pubType:['Practice Guideline']}}),
    study(8,{doi:'10.2/X',title:'Correction to: Stroke prevention'}),study(9,{doi:'10.2/x'})]);
  const {records,queriedAt} = await searchEvidence('Stroke');
  assert.deepEqual(records.map(r => r.pmid), ['7','1']);
  assert.equal(records[0].lastVerifiedAt, queriedAt);
  assert.match(records[0].detail, /status unknown/);
  assert.equal(records[0].url, 'https://pubmed.ncbi.nlm.nih.gov/7/');
});

test('caps output, breaks ties deterministically and preserves source failures', async t => {
  const fetch = mock(t,Array.from({length:16},(_,i)=>study(101+i)));
  const {records} = await searchEvidence('Stroke');
  assert.equal(records.length,10);
  assert.equal(records[0].pmid,'101');
  fetch.mock.mockImplementation(async () => new Response(null,{status:429}));
  await assert.rejects(searchEvidence('Stroke'), /429/);
});

test('separates systemic hypertension from a distinct condition sharing its name', async t => {
  mock(t,[study(1,{title:'Guideline for pulmonary arterial hypertension'}),
    study(2,{title:'Screening for systemic hypertension in adults'})]);
  const {records} = await searchEvidence('High Blood Pressure');
  assert.deepEqual(records.map(r => r.pmid), ['2']);
});
