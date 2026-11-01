import assert from 'node:assert/strict';
import test from 'node:test';
import {lookupTerminology} from '../worker/terminology.mjs';

function table(rows){return Response.json([rows.length,rows.map(r=>r[0]),null,rows]);}
test('ICD-10-CM lookup accepts undotted code but requires the exact returned identifier',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url.searchParams.get('terms'),'C95.90');
    assert.equal(url.searchParams.get('cf'),'code');
    return table([['C95.90','Leukemia, unspecified not having achieved remission'],['C95.91','Other subtype']]);
  });
  const result=await lookupTerminology('ICD-10-CM C9590');
  assert.equal(fetch.mock.callCount(),1);
  assert.equal(result.canonical,'Leukemia, unspecified not having achieved remission');
  assert.equal(result.rows.length,1);
  assert.equal(new URL(result.rows[0].url).hostname,'clinicaltables.nlm.nih.gov');
  assert.match(result.snomedStatus,/Not configured/);
});
test('a category query cannot resolve to a more specific child',async t=>{
  t.mock.method(globalThis,'fetch',async()=>table([['C95.90','Specific billable subtype']]));
  assert.equal((await lookupTerminology('C95')).canonical,null);
});
test('parallel term searches keep systems independent and preserve source outages',async t=>{
  t.mock.method(globalThis,'fetch',async url=>{
    if(url.pathname.includes('icd9cm_dx'))throw Error('source failure');
    assert.equal(url.searchParams.get('sf'),'name');
    return table([['D57.1','Sickle-cell disease without crisis']]);
  });
  const result=await lookupTerminology('sickle cell');
  assert.equal(result.rows[0].system,'ICD-10-CM');
  assert.equal(result.canonical,null);
  assert.equal(result.sourceStatus['ICD-9-CM'],'unavailable');
});
test('ICD-9-CM diagnosis matches dotted codes and trims upstream labels',async t=>{
  t.mock.method(globalThis,'fetch',async url=>{
    assert.match(url.pathname,/icd9cm_dx/);
    assert.equal(url.searchParams.get('terms'),'250.00');
    return table([['250.00','  Diabetes mellitus description ']]);
  });
  assert.equal((await lookupTerminology('25000')).canonical,'Diabetes mellitus description');
});
test('SNOMED is disabled without explicit licensing and never exposes credentials',async t=>{
  const fn=t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url.hostname,'uts-ws.nlm.nih.gov');
    return Response.json({result:{ui:'123456',rootSource:'SNOMEDCT_US',name:'Fixture',obsolete:false}});
  });
  assert.deepEqual((await lookupTerminology('123456',{UMLS_API_KEY:'test-key'})).rows,[]);
  assert.equal(fn.mock.callCount(),0);
  const result=await lookupTerminology('SNOMED CT 123456',{UMLS_API_KEY:'test-key',SNOMED_CT_LICENSE_CONFIRMED:'true'});
  assert.equal(result.canonical,'Fixture');
  assert(!JSON.stringify(result).includes('test-key'));
});
