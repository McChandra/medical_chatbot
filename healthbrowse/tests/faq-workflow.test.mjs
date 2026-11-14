import test from 'node:test';
import assert from 'node:assert/strict';
import {faqQuestions,faqPassages,generalTreatmentNotice} from '../dist/faq-spec.js';
import {faqReferences,faqMarkdown} from '../dist/faq-export.js';
import {domainAnswer} from '../dist/search-experience.js';
import {presentDraft} from '../server/model-evidence.mjs';
import {sessionIdFromVerifiedAccessToken} from '../server/auth-session.mjs';
const ref={id:'S1',title:'MedlinePlus',url:'https://medlineplus.gov/asthma.html'};
test('FAQ routing separates diagnostics from symptoms and preserves source provenance',()=>{
 const p={deck:3,text:'Diagnostic tests include a breathing test.',intent:'identify',record:'fixture',url:ref.url};
 assert.deepEqual(faqPassages(p).map(p=>p.deck),[4]);
 const both=faqPassages({...p,text:'The condition has no symptoms. Diagnosis requires tests.'});assert.deepEqual(both.map(p=>p.deck),[4,3]);
 for(const row of both){assert.equal(row.record,p.record);assert.equal(row.sourceDeck,3);assert.equal(row.frameworkVersion,'medical-faq-v3')}
 assert.deepEqual(faqPassages({deck:4,text:'A treatment passage.'}).map(p=>p.deck),[5]);
 assert.deepEqual(faqPassages({deck:5,text:'An outcome passage.'}).map(p=>p.deck),[6]);
 assert.equal(faqQuestions.length,6);
});
test('General treatment notices survive both local fallback and generated answers',()=>{
 const context={topic:'Asthma',role:'General reader',passages:[],records:[]};
 assert.equal(domainAnswer(context,5).treatmentNotice,generalTreatmentNotice);
 assert.equal(domainAnswer({...context,role:'Medical professional'},5).treatmentNotice,undefined);
 const draft={answer:{id:0,claims:[]},decks:[{id:5,claims:[]}]};
 assert.equal(presentDraft(draft,{sources:[]},{role:context.role},'fixture',false).decks[0].treatmentNotice,generalTreatmentNotice);
});
test('FAQ export contains all questions, only used safe citations, and explicit gaps',()=>{
 const answer={blocks:[{text:'A sourced answer.',references:[ref,{url:'javascript:alert(1)',title:'bad'}]}]};
 const decks=[{id:1,blocks:[{text:'Population evidence.',references:[ref]}]},{id:4,text:'I do not have sufficient authorized data to answer this specific query.'},{id:5,text:'A cited excerpt.',blocks:[{text:'A cited excerpt.',citation:ref}],modelNotice:'Source excerpt · no AI explanation.'}];
 assert.equal(faqReferences([answer,...decks]).length,1);
 const markdown=faqMarkdown({topic:'Asthma',clinical:false,answer,decks});
 for(const q of faqQuestions)assert.ok(markdown.includes('**Q: '+q+'**'));
 assert.match(markdown,/View: General Public/);assert.match(markdown,/> \*\*Browser Summary:/);assert.match(markdown,/> \*\*Buddy says:/);
 assert.ok(markdown.includes(generalTreatmentNotice));assert.match(markdown,/Source excerpt/);assert.match(markdown,/Authorized Citations/);assert.doesNotMatch(markdown,/javascript:|Frontend Note/);
 assert.equal((markdown.match(/https:\/\/medlineplus.gov/g)||[]).length,1);
 const clinical=faqMarkdown({topic:'<script>',clinical:true,answer,decks});assert.match(clinical,/Clinical Professional/);assert.ok(!clinical.includes(generalTreatmentNotice));assert.ok(!clinical.includes('# 🩺 <script>'));
});
test('session metadata parser rejects missing, malformed and owner-mismatched claims',()=>{
 const id='11111111-1111-4111-8111-111111111111',sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const token=claims=>'e30.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.fixture';
 assert.equal(sessionIdFromVerifiedAccessToken(token({sub:id,session_id:sid}),id),sid);
 for(const value of ['opaque','x.!.y',token({sub:'other',session_id:sid}),token({sub:id}),token({sub:id,session_id:'bad'})])assert.equal(sessionIdFromVerifiedAccessToken(value,id),null);
});
