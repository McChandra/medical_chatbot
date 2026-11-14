import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {renderAnswer} from '../dist/answer-view.js';
test('evidence-gap cards render without inventing a citation or crashing',t=>{
 const make=()=>({children:[],append(...nodes){this.children.push(...nodes)},setAttribute(){}});
 const previous=globalThis.document;globalThis.document={createElement:make};t.after(()=>{globalThis.document=previous});
 const parent=make();assert.doesNotThrow(()=>renderAnswer(parent,{blocks:[{title:'Evidence gaps',text:'This question is not supported by the retrieved sources.',references:[]}]}));
 assert.equal(parent.children.length,1);assert.ok(!parent.children[0].children.some(n=>n.href));
});
test('loopback runner completes and resumes atomic case files without leaking its key',async t=>{
 const out=mkdtempSync(join(tmpdir(),'hb-grounded-'));t.after(()=>rmSync(out,{recursive:true,force:true}));
 writeFileSync(join(out,'runtime.json'),JSON.stringify({testOnly:true}));
 const key='synthetic-evaluation-test-key-32-characters',fixtures=JSON.parse(readFileSync(new URL('../inference/evaluation-v2/cases.json',import.meta.url)));
 let calls=0;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/healthz'){res.end(JSON.stringify({ready:true,busy:false}));return;}
  if(req.headers.authorization!=='Bearer '+key){res.writeHead(401);res.end('{}');return;}
  calls++;const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));const data=JSON.parse(body.messages.at(-1).content);let value;
  if(data.claims){
   const control=fixtures.controls.find(c=>c.input.question===data.question&&c.draft.answer.claims[0].text===data.claims[0]?.text);
   value={checks:data.claims.map(c=>({id:c.id,verdict:control?.expectedSupported===false?'insufficient':'supported'})),coverage:data.facets.map(f=>({id:f.id,verdict:(data.declaredGaps||[]).includes(f.id)?'gap':(control?.expectedCoverage?.[f.id]||'answered')}))};
  }else value={answer:[],decks:data.mode==='chat'?{}:Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,[]])),gaps:data.facets.map(f=>f.id)};
  res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const run=()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/run-grounded-evaluation.mjs',out,'http://127.0.0.1:'+server.address().port+'/'],{env:{...process.env,INFERENCE_API_KEY:key}});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>code?reject(Error(output)):resolve(output));
 });
 await run();let summary=JSON.parse(readFileSync(join(out,'summary.json')));
 assert.equal(summary.completed,22);assert.ok(summary.groups.every(g=>g.gateway_accepted===8));assert.ok(summary.groups.every(g=>g.declared_question_gaps>0));assert.equal(summary.controls.false_acceptances,0);assert.equal(summary.controls.false_rejections,0);
 assert.ok(!readFileSync(join(out,'results.jsonl'),'utf8').includes(key));
 const before=calls;await run();assert.equal(calls,before,'resume must not repeat completed model calls');
 assert.equal(JSON.parse(readFileSync(join(out,'summary.json'))).completed,22);
});
