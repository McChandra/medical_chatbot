import {answerQuestion,questionDeck,inspectInput} from './clinical-engine.js';
import {verifyClaim} from './claim-check.js';
import {correctSpelling} from './medcard.js';
import {domains,orderedPassages} from './disease-framework.js';

export const generalMode=role=>role===0||role==='General reader';
export const deckCount=role=>generalMode(role)?6:7;
export function isOverviewQuestion(context,query){
 const normalize=value=>String(value).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const question=normalize(correctSpelling(query));
 const subject=question.replace(/^(?:what (?:is|are)|tell me about|give me an overview of|summari[sz]e|explain)\s+/,'');
 if(subject===question)return false;
 return [context.topic,...(context.aliases||[]),'it','this disease','this condition'].some(name=>normalize(name)===subject);
}
export const buddyQuestions=[
 {label:'What causes it?',prompt:'Explore the causes and risk factors',deck:1},
 {label:'How does it change over time?',prompt:'Explore the disease course',deck:2},
 {label:'What are the symptoms and tests?',prompt:'Explore the symptoms and diagnostic tests',deck:3},
 {label:'How is it treated?',prompt:'Explore treatment approaches',deck:4},
 {label:'What is the outlook?',prompt:'Explore the outlook and complications',deck:5},
 {label:'Who is affected, and can it be prevented?',prompt:'Explore population patterns and prevention',deck:6}
];
export function passageCheck(context,p){
 if(!p)return null;
 const check=verifyClaim({kind:'passage',topic:context.topic,sourceUrl:p.sourceRecord||p.url,field:'text',value:p.text,record:p.record},{topic:context.topic,passages:context.passages});
 return check.status==='withheld'?null:check;
}
export function searchAnswer(context,query){
 const question=correctSpelling(query).trim();
 if(inspectInput(question)!=='ok')return {text:'Ask about a public medical topic without personal details.',citations:[],checks:[],supported:false};
 const bare=[context.topic,...(context.aliases||[])].some(name=>question.toLowerCase().replace(/[?!.]+$/,'')===name.toLowerCase());
 const overview=bare;
 const answer=answerQuestion({...context,question:bare?'What is '+context.topic+'?':question,visibleTexts:[],history:[],deck:undefined});
 if(answer.citations.length)return {...answer,supported:true};
 if(overview){const check=passageCheck(context,context.passages.find(p=>p.overview));if(check)return {text:check.text,citations:[check.citation],checks:[check],deck:1,supported:true}}
 return {text:'I found information about '+context.topic+', but the available sources do not directly answer this question. The '+deckCount(context.role)+' areas below show what is available; '+(generalMode(context.role)?'the buddy':'the copilot')+' can help you explore them.',citations:[],checks:[],deck:questionDeck(question)||1,supported:false};
}
export function domainAnswer(context,number){
 const domain=domains[number-1];
 if(!domain||number>6)return null;
 const candidates=orderedPassages(context.passages.filter(p=>p.deck===number&&!p.overview),context.role,context.topic);
 const checks=[],seen=new Set();
 for(const p of candidates){const check=passageCheck(context,p);if(!check||seen.has(check.text))continue;seen.add(check.text);checks.push(check);if(checks.length===3)break}
 const text=checks.length?checks.map((c,i)=>c.text+' ['+(i+1)+']').join('\n\n'):'I don’t have enough source information to explain this area for '+context.topic+' yet. '+domain.empty;
 return {deck:number,text:text+(number===2?'\n\nThese excerpts do not establish a complete untreated timeline. Treatment exposure and timing need to be checked in the original source.':''),checks,citations:checks.map((c,i)=>({...c.citation,title:'['+(i+1)+'] '+c.citation.title}))};
}
// Bound requests even when a source never returns headers. Caller cancellation
// still wins, so an old search cannot replace the next search's result.
export async function fetchJSON(url,{signal,timeout=8000}={}){
 const local=new AbortController(),abort=()=>local.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,timeout);
 try{const response=await fetch(url,{signal:local.signal});if(!response.ok)throw Error('Source unavailable');return await response.json()}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
