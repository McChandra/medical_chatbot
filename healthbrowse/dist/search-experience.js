import {assessSafety,safetyAnswer} from './safety-policy.js';
import {answerQuestion,questionDeck,inspectInput,inspectQuery,normalizeQuestion} from './clinical-engine.js';
import {verifyClaim} from './claim-check.js';
import {correctSpelling} from './medcard.js';
import {domains,orderedPassages} from './disease-framework.js';
import {readingProfile,readingGuidance,roleIndex} from './reading-profiles.js';

export const generalMode=role=>roleIndex(role)===0;
export const deckCount=()=>6;
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
const intentLabels={definition:'What it means',risk:'Causes and risk factors',classification:'Classification',mechanism:'How it develops',identify:'Diagnosis and tests',symptoms:'Symptoms',therapy:'Treatment approaches',course:'Disease course',prognosis:'Outlook',complications:'Complications','public-health':'Prevention and population evidence',genes:'Genetics'};
function compose(context,matches,deck,{detail=false,gaps=[]}={}){
 const profile=readingProfile(context.role),seen=new Set();
 const blocks=matches.filter(m=>m?.check&&m.check.status!=='withheld'&&!seen.has(m.check.text)&&seen.add(m.check.text)).map(m=>({title:m.title||intentLabels[m.passage?.intent]||'Source explanation',text:m.check.text,citation:m.check.citation,check:m.check,sourceType:m.passage?.sourceType||'historical source'}));
 while(blocks.length&&blocks.reduce((n,b)=>n+b.text.length,0)>12000)blocks.pop();
 const guidance=blocks.length?readingGuidance(context.role,deck):null;
 const text=blocks.map((b,i)=>b.title+'\n'+b.text+' ['+(i+1)+']').join('\n\n')+(gaps.length?'\n\n'+gaps.join('\n'):'')+(guidance?'\n\n'+guidance.title+'\n'+guidance.text:'');
 return {text:text||'No source passage supports this question yet. Try a more specific medical topic or inspect the linked sources.',deck,blocks,style:profile.style,guidance,gaps,supported:blocks.length>0,citations:blocks.map((b,i)=>({...b.citation,title:'['+(i+1)+'] '+b.citation.title})),checks:blocks.map(b=>b.check)};
}
function requestedParts(query){
 // Split explicit question clauses, not disease names or a linked phrase such
 // as “signs and symptoms”. Each clause must be supported independently.
 return query.split(/\s+(?:and|also)\s+(?=(?:what|how|why|who|can|is|are|does|treatment|treatments|diagnosis|prevention|prognosis)\b)|[?;]+(?=\s*\w)/i).map(s=>s.trim()).filter(Boolean).slice(0,3);
}
function supplemental(context,deck,limit,exclude=new Set(),intent){
 const candidates=orderedPassages(context.passages.filter(p=>p.deck===deck&&!p.overview&&(!intent||p.intent===intent)),context.role,context.topic);
 const matches=[];
 for(const p of candidates){const check=passageCheck(context,p);if(!check||exclude.has(check.text))continue;exclude.add(check.text);matches.push({check,passage:p});if(matches.length>=limit)break}
 return matches;
}
export function searchAnswer(context,query,{detail=false,activeDeck=1}={}){
 const question=correctSpelling(query).trim(),profile=readingProfile(context.role);
 const status=inspectQuery(question);
 if(status==='unsafe')return {...safetyAnswer(assessSafety(question,context.topic).category),deck:activeDeck};
 if(status!=='ok')return {text:status==='emergency'?'If these symptoms or immediate danger are happening now, contact local emergency services now. Do not wait for a search response.':'Remove identifying details such as names, contact information, birth dates or record numbers. You can still describe symptoms in your own words.',citations:[],checks:[],blocks:[],supported:false,deck:activeDeck};
 if(inspectInput(question)==='private'){
  if(/\b(?:dos(?:e|es|age|ing)|prescrib\w*|(?:should|can|may) i (?:take|start|stop|change|increase|reduce)|how much should|which (?:medicine|medication|drug))\b/i.test(question))return {text:'I cannot choose a medicine, dose or treatment change for you. A clinician or pharmacist needs to check your circumstances. You can explore the cited general treatment information in Deck 4.',citations:[],checks:[],blocks:[],supported:false,deck:4};
  // Keep the original question intact for the model; the local fallback can
  // only explain public evidence, never evaluate the person's clinical details.
  const clause=question.match(/(?:^|[.!?,]\s*|\band\s+)((?:what|how|why|when|which|can|does|is|are)\b[^]*?)$/i)?.[1]?.trim();
  const publicClause=clause?.replace(/\b(?:it|this condition|this disease)\b/gi,context.topic);
  const referenceQuestion=publicClause&&inspectInput(publicClause)==='ok'&&questionDeck(publicClause)?publicClause:'What causes '+context.topic+'? How is '+context.topic+' treated?';
  const response=searchAnswer(context,referenceQuestion,{detail,activeDeck});
  const scope=generalMode(context.role)?'These sources explain '+context.topic+' in general. They do not determine the cause of your symptoms or assess your duration, medicines, age or other individual circumstances.':'Clinical reference for '+context.topic+'. Interpret the evidence alongside the history, examination, investigations and local protocols. These excerpts do not establish a patient-specific diagnosis.';
  return {...response,text:scope+'\n\n'+response.text,gaps:[...(response.gaps||[]),scope],educationalOnly:true};
 }
 if(/^(?:more|tell me more|more details|go on|continue|explain more)[?!. ]*$/i.test(question))return domainAnswer(context,Math.min(6,activeDeck),{detail:true});
 if(/^(?:hi|hello|hey|help|what can you do)[?!. ]*$/i.test(question))return {text:'Choose one of the six questions, or ask about '+context.topic+'. I’ll use the '+profile.label.toLowerCase()+' reading mode and link the sources.',deck:activeDeck,citations:[],checks:[],blocks:[],supported:false};
 const normalized=normalizeQuestion(question,context.topic,context.aliases||[]);
 const bare=[context.topic,...(context.aliases||[])].some(name=>normalized===normalizeQuestion(name));
 // Split before normalization removes question marks and sentence boundaries.
 const parts=requestedParts(bare?'What is '+context.topic+'?':question).map(part=>normalizeQuestion(part,context.topic,context.aliases||[])),matches=[],gaps=[];
 let primaryDeck=questionDeck(normalized)||activeDeck,primaryIntent=null;
 for(const part of parts){
  const answer=answerQuestion({...context,question:part,visibleTexts:[],history:[],deck:undefined,limit:detail?profile.detail:profile.summary});
  if(answer.matches?.length){if(!primaryIntent){primaryDeck=answer.deck;primaryIntent=answer.intent}matches.push(...(answer.intent==='definition'?answer.matches.slice(0,1):answer.matches).map((m,i)=>({...m,title:parts.length>1?part:(i===0?'Direct answer':intentLabels[answer.intent]||'Further detail')})))}
  else if(answer.citations.length){return {...answer,blocks:[],style:profile.style,supported:true}}
  else gaps.push('No matching source passage was found for “'+part+'”. I won’t infer an answer from a different section.');
 }
 // Add audience-relevant context only after answering the requested question.
 // It is separately labeled and never used to fill an unsupported direct answer.
 if(matches.length&&primaryIntent==='definition'&&profile.index>0){
  const seen=new Set(matches.map(m=>m.check.text));
  const extra=[[3,1],[4,1]];
  for(const [n,count,intent] of extra)matches.push(...supplemental(context,n,count,seen,intent).map(m=>({...m,title:domains[n-1].title})));
 }
 const response=compose(context,matches,primaryDeck,{detail,gaps});
 if(!response.supported)response.text='I found '+context.topic+', but cannot support a direct answer to this question from the indexed sources. '+gaps.join(' ')+' The six decks show the information that is available.';
 return response;
}
export function domainAnswer(context,number,{detail=true}={}){
 const domain=domains[number-1];if(!domain||number>6)return null;
 const profile=readingProfile(context.role),matches=supplemental(context,number,detail?profile.detail:profile.card);
 const gaps=matches.length?[]:['No source passage is available for this area. '+domain.empty];
 if(number===2)gaps.push('These excerpts do not establish a complete untreated timeline. Check treatment exposure and follow-up in the source.');
 return compose(context,matches,number,{detail,gaps});
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
