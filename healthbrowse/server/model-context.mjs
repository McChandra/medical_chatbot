import {generationMessages,reviewMessages} from './model-evidence.mjs';
import {buddySecurityRules,compactBuddySecurityRules} from './buddy-prompt.mjs';

export class ContextLimit extends Error {}
// Llama 3 uses byte-level BPE. UTF-8 byte length is a conservative upper bound,
// not a chars/4 estimate. Reserve 256 tokens for the provider's chat template.
export const contextCost=(messages,maxTokens)=>new TextEncoder().encode(JSON.stringify(messages)).length+maxTokens+256;
const fits=(messages,maxTokens)=>contextCost(messages,maxTokens)<=8192;
const compactSource=({id,deck,text,focus,date,historical})=>({id,deck,text,focus,date,historical});

export function compactGeneration(input,evidence,repair=''){
 const maxTokens=2048;
 const messagesFor=sources=>{
  const messages=generationMessages(input,{...evidence,domains:evidence.domains.map(({id,title})=>({id,title})),sources:sources.map(compactSource)},repair.slice(0,350));
  messages[0].content=messages[0].content.replace(buddySecurityRules,compactBuddySecurityRules);
  messages[0].content+=' For this short-context request: at most 2 direct-answer claims and 1 claim per deck, at most 200 characters per claim and 200 per quote. Use a complete concise sentence; the buddy can expand a deck later.';
  return messages;
 };
 const selected=[],seen=new Set();
 if(!fits(messagesFor([]),maxTokens))throw new ContextLimit();
 // Round-robin domain candidates before extra matches. Never cut sentences or
 // strip clinical qualifiers merely to fit. Unrepresented decks remain gaps.
 const groups=Array.from({length:6},(_,i)=>evidence.sources.filter(s=>s.deck===i+1));
 const ordered=[];
 for(let i=0;i<Math.max(...groups.map(g=>g.length));i++)for(const group of groups)if(group[i])ordered.push(group[i]);
 for(const source of ordered){
  if(seen.has(source.id))continue;
  seen.add(source.id);
  if(fits(messagesFor([...selected,source]),maxTokens))selected.push(source);
 }
 if(!selected.length)throw new ContextLimit();
 return {messages:messagesFor(selected),evidence:{...evidence,sources:selected},maxTokens};
}

export function compactReviews(draft,evidence,input){
 const maxTokens=1200,batches=[];
 const make=decks=>{
  const part={answer:draft.answer,decks};
  const ids=new Set([part.answer,...decks].flatMap(s=>s.claims.flatMap(c=>c.support.map(s=>s.id))));
  const sources=evidence.sources.filter(s=>ids.has(s.id)).map(compactSource);
  return {draft:part,messages:reviewMessages(part,{...evidence,sources},input),maxTokens};
 };
 let decks=[];
 if(!fits(make([]).messages,maxTokens))throw new ContextLimit();
 for(const deck of draft.decks){
  for(const claim of deck.claims){
   const candidate=[...decks,{id:deck.id,claims:[claim]}];
   if(!fits(make(candidate).messages,maxTokens)){
    if(!decks.length)throw new ContextLimit();
    batches.push(make(decks));decks=[];
   }
   decks.push({id:deck.id,claims:[claim]});
   if(!fits(make(decks).messages,maxTokens))throw new ContextLimit();
  }
 }
 // Every batch includes the full direct answer; no question/claim is silently
 // dropped and all batches must pass before any generated text is displayed.
 batches.push(make(decks));
 return batches;
}
