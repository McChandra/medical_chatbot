import test from 'node:test';
import assert from 'node:assert/strict';
import {setupBuddyLayout,shouldSendBuddyKey,resizeBuddyInput} from '../dist/buddy-layout.js';
import {createDictation} from '../dist/mobile-voice.js';

test('mobile Enter keeps a newline; desktop Enter sends without breaking composition or Shift+Enter',()=>{
 for(const mobile of [true,false]){assert.equal(shouldSendBuddyKey({key:'Enter',isComposing:true},mobile),false);assert.equal(shouldSendBuddyKey({key:'Enter',shiftKey:true},mobile),false);assert.equal(shouldSendBuddyKey({key:'Tab'},mobile),false)}
 assert.equal(shouldSendBuddyKey({key:'Enter'},true),false);assert.equal(shouldSendBuddyKey({key:'Enter'},false),true);
 assert.equal(shouldSendBuddyKey({key:'Enter',ctrlKey:true},true),true);
});
test('the message input grows, stays bounded for long questions and shrinks after sending',()=>{
 const input={style:{},scrollHeight:96};resizeBuddyInput(input);assert.equal(input.style.height,'96px');
 input.scrollHeight=220;resizeBuddyInput(input);assert.equal(input.style.height,'144px');assert.equal(input.style.overflowY,'auto');
 input.scrollHeight=24;resizeBuddyInput(input);assert.equal(input.style.height,'48px');assert.equal(input.style.overflowY,'hidden');
});
test('voice state restores the compact controls on completion, explicit stop and startup failure',()=>{
 const states=[],records=[];class Recognition{constructor(){records.push(this)}start(){}abort(){}}
 const api=createDictation({Recognition,onText(){},onStatus(){},onState:s=>states.push(s),schedule:()=>1,unschedule(){}});
 api.start();records[0].onend();api.start();api.stop();records[1].onend();
 assert.deepEqual(states,[true,false,true,false]);
 createDictation({Recognition:class{start(){throw new Error('Denied')}},onText(){},onStatus(){},onState:s=>states.push(s)}).start();assert.equal(states.at(-1),false);
});

// Small DOM fixture exercises node moves and navigation without making provider requests.
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.style={};this.attrs={};this.hidden=false;this.scrollHeight=48;this.className='';}
 setAttribute(k,v){this.attrs[k]=v} getAttribute(k){return this.attrs[k]}
 matches(s){return s.startsWith('#')?this.id===s.slice(1):s.startsWith('.')?this.className.split(' ').includes(s.slice(1)):this.tagName===s}
 all(){return this.children.flatMap(c=>[c,...c.all()])} querySelector(s){return this.all().find(c=>c.matches(s))||null}
 append(...nodes){for(const n of nodes){assert.ok(n,'Missing existing control');n.remove();n.parent=this;this.children.push(n)}}
 prepend(...nodes){for(const n of nodes.reverse()){n.remove();n.parent=this;this.children.unshift(n)}}
 after(n){n.remove();n.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this)+1,0,n)}
 insertBefore(n,b){n.remove();n.parent=this;this.children.splice(this.children.indexOf(b),0,n)}
 remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null}}
 focus(){this.focused=true} addEventListener(k,f){(this.listeners[k]??=[]).push(f)}
 dispatchEvent(e){for(const fn of this.listeners[e.type]||[])fn(e);return !e.defaultPrevented}
}
function fixture(t){
 const document=new Element('document');document.createElement=tag=>new Element(tag);document.createElementNS=(_,tag)=>new Element(tag);document.getElementById=id=>document.querySelector('#'+id);
 const prior={document:globalThis.document,window:globalThis.window};globalThis.document=document;globalThis.window=new Element('window');t.after(()=>{for(const [k,v] of Object.entries(prior))if(v===undefined)delete globalThis[k];else globalThis[k]=v});
 const add=(parent,tag,id='',className='')=>{const n=Object.assign(new Element(tag),{id,className});parent.append(n);return n};
 const dialog=add(document,'dialog','buddyDialog');dialog.open=true;const panel=add(dialog,'section','copilot'),head=add(panel,'header','','copilot-head');
 add(head,'div','','eyebrow');add(head,'h2','copilot-heading');add(head,'button','buddyClose');add(head,'p','copilotScope');
 const inner=add(panel,'div','','copilot-inner');for(const id of ['buddyWelcome','buddyQuestions'])add(inner,'div',id);
 const toolbar=add(inner,'div','','chat-toolbar');add(toolbar,'strong','chatTitle');const newChat=add(toolbar,'button','newChat');
 add(inner,'details','chatHistoryPanel');add(inner,'p','chatSaveStatus');add(inner,'p','copilotHint');add(inner,'div','thread');
 const form=add(inner,'form','ask');add(form,'label');add(form,'textarea','question');add(form,'button');add(inner,'button','buddyStop');add(inner,'details','buddyResearch');add(inner,'div','','copilot-actions');
 return {document,dialog,panel,inner,form,newChat};
}
test('Buddy preserves existing form and new-chat controls when moving tools out of the conversation',t=>{
 const f=fixture(t);const layout=setupBuddyLayout();assert.equal(f.document.getElementById('ask'),f.form);assert.equal(f.document.getElementById('newChat'),f.newChat);
 assert.equal(f.newChat.parent.className,'buddy-toolbar');assert.equal(f.form.parent,layout.composer);assert.equal(f.inner.querySelector('#chatHistoryPanel'),null);
 const toolbar=f.panel.querySelector('.buddy-toolbar'),explore=toolbar.children[0],history=toolbar.children[1];
 history.onclick();assert.equal(f.inner.hidden,true);assert.equal(layout.composer.hidden,true);assert.equal(history.getAttribute('aria-expanded'),'true');
 const cancel={type:'cancel',preventDefault(){this.defaultPrevented=true}};f.dialog.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);assert.equal(f.inner.hidden,false);assert.equal(layout.composer.hidden,false);assert.equal(history.focused,true);
 explore.onclick();f.dialog.dispatchEvent({type:'close'});assert.equal(f.inner.hidden,false);assert.equal(explore.getAttribute('aria-expanded'),'false');
 f.document.dispatchEvent({type:'healthbrowse-chat-updated',detail:{count:1}});assert.equal(f.inner.querySelector('.buddy-empty').hidden,true);
 f.document.dispatchEvent({type:'healthbrowse-chat-updated',detail:{count:0}});assert.equal(f.inner.querySelector('.buddy-empty').hidden,false);
});
