import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {citedEvidence,prepareCited,presentCited,prepareCitedReview} from '../server/model-cited.mjs';
import {medlinePassages} from '../dist/disease-framework.js';
import {renderAnswer} from '../dist/answer-view.js';
import {authorityFor} from '../dist/authorities.js';
const assets=Object.fromEntries(['medline-topics','clinical-passages','grounded-sources'].map(n=>['/'+n+'.json',{text:readFileSync(new URL('../dist/'+n+'.json',import.meta.url),'utf8')}]));
const input={topic:'Cold Sores',question:'I have cold sores. What could cause it?',role:'General reader',mode:'search',deck:0};
test('the reported cold-sores query has authorized source coverage for its answer and five FAQ domains, with an explicit diagnostic evidence gap',()=>{
 const feed=JSON.parse(assets['/medline-topics.json'].text),record=feed.topics.find(t=>t.title===input.topic),passages=medlinePassages(record,input.topic,feed);
 const originals=new Set(record.knowledge.map(p=>p.text));assert.ok(passages.every(p=>originals.has(p.text)),'Routing must not rewrite evidence');
 for(const role of ['General reader','Medical professional']){
  const p=prepareCited({...input,role},citedEvidence(assets,{...input,role}));
  for(const n of [1,2,3,5,6])assert.ok(p.evidence.sources.some(s=>s.deck===n&&!s.overview),'Missing deck '+n);
  assert.equal(p.evidence.sources.some(s=>s.deck===4&&!s.overview),false,'No diagnostic passage exists in this snapshot');
  const diagnostic=presentCited({answer:[],decks:{}},p,{...input,role},'fixture').decks[3];assert.match(diagnostic.modelNotice,/Evidence gap/);assert.equal(diagnostic.citations.length,0);
  assert.ok(p.evidence.sources.every(s=>authorityFor(s.url)));
  assert.match(p.messages[0].content,role==='General reader'?/eighth-grade/:/diagnostic and differential/);
  assert.match(p.messages[0].content,/Safety comes before/);assert.match(p.messages[0].content,/Use ONLY supplied evidence/);
 }
});
test('instructional harm is withheld even with a recognized citation',()=>{
 const p=prepareCited(input,citedEvidence(assets,input));const s=p.evidence.sources[0];
 const raw={answer:[{text:'Insert the needle through your skin at the wound edge.',sources:[s.id]}],decks:{}};
 assert.equal(prepareCitedReview(raw,p,input).claims.length,0);
 const answer=presentCited(raw,p,input,'fixture').answer;assert.equal(answer.generation,undefined);assert.doesNotMatch(answer.text,/Insert the needle/);
});
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.textContent='';}
 append(...children){this.children.push(...children)}
 setAttribute(k,v){this.attributes[k]=v}
}
const all=root=>[root,...root.children.flatMap(all)];
test('rendering puts real text before mode/operational labels, with inline sources and no empty answer',t=>{
 const old=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};t.after(()=>{if(old===undefined)delete globalThis.document;else globalThis.document=old});
 const root=new Node('div');renderAnswer(root,{blocks:[{text:'A source-backed answer.',references:[{id:'S1',title:'MedlinePlus',url:'https://medlineplus.gov/coldsores.html',quote:'Test evidence',date:'Fixture'}]}],style:'Plain-language answer',modelNotice:'Preparing more detail'});
 const nodes=all(root);assert.equal(root.children[0].tag,'section');assert.equal(root.children[0].children[0].textContent,'A source-backed answer.');
 assert.ok(nodes.some(n=>n.tag==='a'&&n.textContent==='[S1] ↗'));assert.ok(nodes.some(n=>n.tag==='details'));
 for(const bad of [{},{blocks:[{text:null}]},{text:'',style:'Plain-language answer'}]){const box=new Node('div');renderAnswer(box,bad);assert.match(box.children[0].textContent,/Insufficient clinical context available to verify this claim/)}
});
