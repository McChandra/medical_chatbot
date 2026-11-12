import test from 'node:test';
import assert from 'node:assert/strict';
import {auditResponse,compareModes,reportMarkdown} from '../qa/audit-response.mjs';
const c={id:'test',mode:'search',question:'What is leukemia?',facets:[{name:'definition',terms:['cancer']}]};
const section=id=>({id,generation:{model:'fixture'},text:'Leukemia is a blood cancer.',blocks:[{text:'Leukemia is a blood cancer.',references:[{id:'S1',url:'https://medlineplus.gov/leukemia.html',text:'Leukemia is a blood cancer.',quote:'Leukemia is a blood cancer.',date:'Fixture date'}]}]});
const good=()=>({status:'generated',answer:section(0),decks:Array.from({length:6},(_,i)=>section(i+1))});
test('QA bot detects broken decks, uncited claims and fabricated quotation paths',()=>{
 const r=good();r.decks.pop();r.answer.blocks[0].references[0].quote='Made up';
 const audit=auditResponse(c,'General',200,r,100);assert.equal(audit.passed,false);
 assert.ok(audit.findings.some(f=>f.check==='six-decks'));assert.ok(audit.findings.some(f=>f.check==='source-integrity'));
});
test('QA bot differentiates provider failures, safety intercepts and quality suggestions',()=>{
 assert.equal(auditResponse({...c,expectedCode:'emergency'},'General',422,{code:'emergency'},5).passed,true);
 assert.equal(auditResponse(c,'General',503,{code:'provider_busy'},5).findings[0].check,'provider-capacity');
 const result=good();assert.equal(auditResponse(c,'General',200,result,100).passed,true);
 const a=auditResponse({...c,facets:[{name:'treatment',terms:['medication']}]},'Clinicians',200,result,40000);
 assert.ok(a.findings.some(f=>f.check==='question-coverage'));assert.ok(a.findings.some(f=>f.check==='latency'));
 assert.ok(a.findings.every(f=>f.suggestion));
});
test('QA bot compares the two audiences and produces a reviewable report',()=>{
 const records=['General','Clinicians'].map(role=>({testCase:c,role,result:good(),elapsedMs:100,audit:{passed:true,findings:[]}}));
 const comparisons=compareModes(records);assert.equal(comparisons.length,1);
 const md=reportMarkdown({records,comparisons,createdAt:'test',execution:'Fixture only',summary:{passed:2,reviewFindings:1}});
 assert.match(md,/not clinical certification/);assert.match(md,/Suggested change/);
});
