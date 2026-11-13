import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileDestinations,studyCards,citationURL,saveStudyNote,readStudyNote} from '../dist/mobile-model.js';
import {createDictation,createLocalReader,bindLongPress} from '../dist/mobile-voice.js';
import {faqMarkdown} from '../dist/faq-export.js';
import {roleIndex} from '../dist/reading-profiles.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
const ref={url:'https://medlineplus.gov/leukemia.html',title:'MedlinePlus',quote:'Full original evidence.'};
test('two role workspaces keep clinical identity stable and four reachable destinations',()=>{
 assert.equal(roleIndex('Medical professional'),1);assert.equal(roleIndex('Medical student'),0);
 assert.deepEqual(mobileDestinations('Patient').map(d=>d[0]),['search','saved','history','account']);
 assert.deepEqual(mobileDestinations('Clinicians').map(d=>d[0]),['search','evidence','sources','history']);
 assert.deepEqual(mobileDestinations('Student').map(d=>d[0]),['search','saved','history','account']);
});
test('study cards retain complete cited content and exclude unsupported or unsafe-link blocks',()=>{
 const text='An educational passage with a qualifying statement. This does not apply to every subtype.';
 const cards=studyCards([{id:0,blocks:[{text,references:[ref]}]},{id:1,blocks:[{text,references:[ref]},{text:'Unsupported',references:[]},{text:'Bad link',citation:{url:'javascript:alert(1)'}}],generation:{}},{id:2,blocks:[{text:'x'.repeat(8001),citation:ref}]}]);
 assert.equal(cards.length,1);assert.equal(cards[0].text,text);assert.deepEqual(cards[0].references,[ref]);assert.equal(cards[0].kind,'From your cited answer');
 for(const value of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.com','/relative'])assert.equal(citationURL(value),null);
 assert.equal(citationURL(ref.url),ref.url);
});
test('study notes are bounded, topic-scoped and refuse identifying data without overwriting a valid note',()=>{
 const storage=memory();assert.equal(saveStudyNote(storage,'Leukemia','Compare the mechanisms in the cited passages.'),true);
 assert.equal(saveStudyNote(storage,'Leukemia','Patient email: person@example.com'),false);
 assert.equal(readStudyNote(storage,'Leukemia'),'Compare the mechanisms in the cited passages.');
 assert.equal(readStudyNote(storage,'Asthma'),'');assert.equal(saveStudyNote(storage,'Asthma','x'.repeat(8001)),false);
 for(let i=0;i<25;i++)saveStudyNote(storage,'Public topic '+String.fromCharCode(65+i),'Study the cited mechanism.');
 assert.equal(Object.keys(JSON.parse(storage.getItem('hb-study-notes'))).length,20);
 assert.equal(saveStudyNote(storage,'Public topic Y',''),true);assert.equal(readStudyNote(storage,'Public topic Y'),'');
 const unavailable={getItem(){throw new Error('Storage blocked')}};assert.equal(readStudyNote(unavailable,'Leukemia'),'');assert.equal(saveStudyNote(unavailable,'Leukemia','Notes'),false);
});
test('legacy student deck export uses the General audience',()=>{
 const text=faqMarkdown({topic:'Leukemia',role:'Medical student',clinical:false,answer:{},decks:[]});assert.match(text,/View: General Public/);assert.doesNotMatch(text,/View: Medical Student/);
});
function speechFixture(){
 const records=[],texts=[],statuses=[],timers=new Map();let count=0;
 class Recognition {constructor(){records.push(this)}start(){this.started=true}abort(){this.aborted=true}}
 const api=createDictation({Recognition,onText:t=>texts.push(t),onStatus:s=>statuses.push(s),schedule:(fn,delay)=>{timers.set(++count,{fn,delay});return count},unschedule:id=>timers.delete(id)});
 const result=(rec,text,final=true)=>rec.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:final})]});
 return {api,records,texts,statuses,timers,result};
}
test('dictation stays idle until requested, accepts only final text, and ignores results after cancellation',()=>{
 const f=speechFixture();assert.equal(f.records.length,0);assert.equal(f.api.start(),true);assert.equal(f.records[0].continuous,false);
 f.result(f.records[0],'interim',false);assert.deepEqual(f.texts,[]);f.result(f.records[0],'What is leukemia?');assert.deepEqual(f.texts,['What is leukemia?']);
 assert.equal([...f.timers.values()][0].delay,30000);f.api.stop();assert.equal(f.records[0].aborted,true);f.result(f.records[0],'stale');assert.equal(f.texts.length,1);assert.equal(f.timers.size,0);
});
test('dictation time limit, denied permission and unsupported devices retain text workflow',()=>{
 const f=speechFixture();f.api.start();[...f.timers.values()][0].fn();assert.equal(f.records[0].aborted,true);
 f.api.start();f.records[1].onerror();f.records[1].onend();assert.match(f.statuses.at(-1),/permission/);
 const statuses=[];assert.equal(createDictation({onText:()=>assert.fail('No transcription'),onStatus:s=>statuses.push(s)}).start(),false);assert.match(statuses[0],/unavailable/);
});
test('read-aloud uses an on-device English voice and can be stopped',()=>{
 const spoken=[],status=[];let cancelled=0,voices=[{lang:'en-US',localService:false}];const local={lang:'en-GB',localService:true};
 const reader=createLocalReader({synthesis:{getVoices:()=>voices,cancel(){cancelled++},speak:u=>spoken.push(u)},Utterance:class{constructor(text){this.text=text}},onStatus:s=>status.push(s)});
 assert.equal(reader.read('A cited answer.'),false);assert.equal(spoken.length,0);voices.push(local);assert.equal(reader.read('A cited answer.'),true);assert.equal(spoken[0].voice,local);reader.stop();assert.equal(cancelled,3);
});
test('long-press cancels on dragging, fires once after the hold, and suppresses only that click',()=>{
 const listeners={},timers=new Map();let sequence=0,actions=0,prevented=0;
 const element={addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn)};
 const emit=(name,props={})=>{for(const fn of listeners[name]||[])fn({button:0,clientX:10,clientY:10,preventDefault:()=>prevented++,stopImmediatePropagation(){},...props})};
 bindLongPress(element,()=>actions++,{schedule:fn=>{timers.set(++sequence,fn);return sequence},unschedule:id=>timers.delete(id)});
 emit('pointerdown');emit('pointermove',{clientX:30});assert.equal(timers.size,0);emit('click');assert.equal(prevented,0);
 emit('pointerdown');[...timers.values()][0]();emit('pointerup');emit('click');assert.equal(actions,1);assert.equal(prevented,1);emit('click');assert.equal(prevented,1);
 emit('pointerdown');emit('pointercancel');assert.equal(timers.size,0);
});

test('sign-out clears tab notes and research state without removing unrelated storage',async t=>{
 const {clearResearchSession}=await import('../dist/account-client.js');const old=globalThis.sessionStorage;const storage=memory();globalThis.sessionStorage=storage;t.after(()=>{if(old===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=old});
 storage.setItem('hb-study-notes','{"Leukemia":"Notes"}');storage.setItem('hb-transcript','[]');storage.setItem('unrelated','retained');clearResearchSession();assert.equal(storage.getItem('hb-study-notes'),null);assert.equal(storage.getItem('hb-transcript'),null);assert.equal(storage.getItem('unrelated'),'retained');
});
