import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyClaim} from '../dist/claim-check.js';
import {authorities,authorityFor} from '../dist/authorities.js';
const topic='Leukemia',url='https://medlineplus.gov/leukemia.html';
const p={title:'Definition',text:'Exact passage from the test source.',record:'r:1',focus:topic,url};
const evidence={topic,passages:[p]};
const check=(props={},ev=evidence)=>verifyClaim({topic,kind:'passage',sourceUrl:url,field:'text',value:p.text,...props},ev);
test('whole passage and topic are required; URL alone is insufficient',()=>{
  assert.equal(check().status,'supported');
  for(const props of [{value:'A completely unsupported inference.'},{value:'Exact passage'},{topic:'Asthma'},{field:'summary'},{sourceUrl:'javascript:alert(1)'}])assert.equal(check(props).status,'withheld');
  assert.equal(check({}, {...evidence,passages:[{...p,focus:'Asthma'}]}).status,'withheld');
  const narrower=check({}, {...evidence,passages:[{...p,focus:'Adult Acute Myeloid Leukemia'}]});
  assert.match(narrower.text,/^Adult Acute Myeloid Leukemia — /);
});
test('correction requires an unambiguous source field and explicit opt-in',()=>{
  const stale={value:'Wrong reporting field.',allowCorrection:true};
  assert.equal(check(stale).status,'withheld');
  assert.equal(check({...stale,record:'r:1'}).status,'corrected');
  const alternative={...p,text:'Another passage.'};
  assert.equal(check({...stale,record:'r:1'},{...evidence,passages:[p,alternative]}).status,'withheld');
});
test('publication bibliographic fields do not verify a study completion claim',()=>{
  const paper={title:'Fixture',url:'https://pubmed.ncbi.nlm.nih.gov/123/',pmid:'123',doi:'10.1234/fixture'};
  const props={kind:'paper',field:'doi',sourceUrl:paper.url,value:paper.doi};
  const scope={topic,papers:[paper]};
  assert.equal(check(props,scope).status,'supported');
  const quote={...paper,passage:{url:paper.url,text:'Short exact abstract sentence.'}};
  assert.equal(check({...props,field:'abstractExcerpt',value:quote.passage.text},{topic,papers:[quote]}).status,'supported');
  assert.equal(check({...props,field:'abstractExcerpt',value:'An invented conclusion.'},{topic,papers:[quote]}).status,'withheld');
  assert.equal(check({...props,field:'status',value:'completed'},scope).status,'withheld');
  assert.equal(check({...props,field:'pmid',value:'456',allowCorrection:true},scope).text,'123');
  assert.equal(check(props,{topic,papers:[{...paper,pmid:'456'}]}).status,'withheld');
});
test('trial and grant claims must match the corresponding source field',()=>{
  const trial={title:'Fixture trial',nctId:'NCT12345678',url:'https://clinicaltrials.gov/study/NCT12345678',status:'RECRUITING'};
  const grant={title:'Fixture award',projectId:'1R01XX000000',url:'https://reporter.nih.gov/project-details/123',institution:'Fixture university'};
  assert.equal(check({kind:'trial',sourceUrl:trial.url,field:'status',value:'COMPLETED'},{topic,trials:[trial]}).status,'withheld');
  assert.equal(check({kind:'trial',sourceUrl:trial.url,field:'status',value:'RECRUITING'},{topic,trials:[trial]}).status,'supported');
  assert.equal(check({kind:'grant',sourceUrl:grant.url,field:'institution',value:'Fixture university'},{topic,grants:[grant]}).status,'supported');
  assert.equal(check({kind:'grant',sourceUrl:grant.url,field:'status',value:'active'},{topic,grants:[grant]}).status,'withheld');
});
test('reference directory uses domain boundaries and never infers endorsement',()=>{
  assert.equal(authorities.length,10);
  assert.equal(authorityFor('https://pubmed.ncbi.nlm.nih.gov/123/').name,'National Library of Medicine');
  assert.equal(authorityFor('https://fakecdc.gov/path'),null);
  assert.equal(authorityFor('https://who.int@evil.test/path'),null);
});
