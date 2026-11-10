import {verifyClaim} from './claim-check.js';
import {orderedPassages,professionalRole,domains} from './disease-framework.js';
// All answer generation is local. Pass arrays already scoped to the selected topic,
// or pass the complete catalog keyed by canonical topic name.
const plain = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = value => plain(value).split(' ').filter(Boolean);
const list = value => Array.isArray(value) ? value : [];
const emergencySigns = /\b(stroke|heart attack|chest pain|chest pressure|face droop\w*|sudden(?:ly)? (?:weakness|numbness|confused|unable to speak)|slurred speech|cant breathe|cannot breathe|unable to breathe|struggling to breathe|difficulty breathing|trouble breathing|cant swallow|cannot swallow|unable to swallow|not breathing|overdos\w*|unconscious|kill myself|suicid\w*)\b/;
const personal = /\b(i (?:have|had|am|feel|felt|think|suspect|took|take|cant|cannot|was|noticed|developed|might|may)|im (?:having|feeling|taking|experiencing|unable|dizzy)|my (?!research\b|question\b|course\b|assignment\b|presentation\b|project\b|search\b)|our patient|a patient (?:presents|reports|has|with)|he is|she is|this patient|patient (?:name|id)|am i|ive been|should i (?:take|stop|start|change|increase|reduce|go to)|someone (?:is|has|just)|\d{1,3} year old (?:man|woman|male|female|patient) (?:with|has|presents|reports))\b/;
const dateIdentifier = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{4})\b/i;
const selfHarmStatement = /\b(?:i (?:want|intend|plan) to (?:die|(?:kill|hurt|harm) myself)|i(?:m| am) (?:feeling )?suicidal|i (?:have|am having|keep having) (?:active )?suicidal thoughts|i (?:might|will) (?:kill|hurt|harm) myself|(?:im having |having |experiencing |^)(?:active suicidal thoughts|thoughts of suicide right now))\b/;
const identifiers = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:mrn|dob|ssn|patient id|patient name|date of birth|medical record number|my name is|home address)\b|\b\d{3}-\d{2}-\d{4}\b|(?:^|\s)(?:\+?\d[ ().-]*){10,15}(?!\d)|\b(?:phone|mobile|telephone)\s*[:=]?\s*\d)/i;
export function inspectInput(text) {
  const value = plain(text);
  if (selfHarmStatement.test(value)) return 'emergency';
  if (emergencySigns.test(value) && (personal.test(value) || /\b(help me|right now|what do i do|happening now|please help|collapsed|not breathing|cant breathe|cannot breathe|kill myself)\b/.test(value))) return 'emergency';
  if (dateIdentifier.test(String(text ?? '')) || identifiers.test(String(text ?? '')) || personal.test(value)) return 'private';
  return 'ok';
}

const groups = [
  {id:'codes',deck:3,ask:/\b(icd(?: 9| 10| 11)?|snomed(?: ct)?|classification codes?|taxonomy codes?)\b/},
  {id:'course',deck:2,ask:/\b(natural history|disease course|progress\w*|subclinical|asymptomatic|untreated|without (?:treatment|intervention)|timeline|onset)\b/,evidence:/\b(natural history|progress\w*|asymptomatic|no symptoms|over time|grows? (?:quickly|slowly)|untreated|early stages?|onset)\b/},
  {id:'education',deck:7,ask:/\b(courses?|education(?:al)? programs?|universit(?:y|ies)|institutions?|fellowships?|residenc(?:ies|y)|curricula|training programs?)\b/},
  {id:'data',deck:7,ask:/\b(datasets?|data sets?|repositories|github|open source (?:software|models?)|software|frameworks?|machine learning|ai tools?|pretrained models?|llms?|data modalities|modality|access requirements?|licen[cs]e|sample size)\b/},
  {id:'facility',deck:7,ask:/\b(hospitals?|clinic(?:s)?|pharmac(?:y|ies)|specialty centers?|care facilities|facility director(?:y|ies)|provider director(?:y|ies))\b/},
  {id:'population',deck:7,ask:/\b(study population|participants|eligibility|population studied)\b/,field:'population'},
  {id:'authors',deck:7,ask:/\b(authors?|wrote|authored)\b/,field:'authors'},
  {id:'design',deck:7,ask:/\b(study design|trial design|evidence category|study type)\b/,field:'studyDesign'},
  {id:'date',deck:7,ask:/\b(publication date|published|publication year)\b/,field:'date'},
  {id:'identifiers',deck:7,ask:/\b(doi|pmid)\b/,field:'identifier'},
  {id:'research',deck:7,ask:/\b(publications?|studies|clinical trials?|journals?|articles?|research papers?|evidence reports?|guidelines?)\b/},
  {id:'public-health',deck:6,ask:/\b(epidemiolog\w*|prevalence|incidence|prevention|prevent\w*|vaccin\w*|social determinants|population distribution|healthcare access|who (?:gets|is affected)|how common)\b/,evidence:/\b(epidemiolog\w*|prevalence|incidence|prevent\w*|vaccin\w*|social determinants|population|healthcare access|most common)\b/},
  {id:'complications',deck:5,ask:/\b(complications?|outcomes?|disability|mortality)\b/,evidence:/\b(complications?|outcomes?|disability|mortality|damage|failure)\b/},
  {id:'identify',deck:3,ask:/\b(cytogenetic analysis|immunophenotyping|diagnos\w*|testing|tests?|screen\w*|detect\w*|investigations?|biomarkers?|characteristics?|traits?|identif\w*|prediction methods?)\b/,evidence:/\b(diagnos\w*|immunophenotyping|cytogenetic|test\w*|exam\w*|detect\w*|screen\w*|imaging|measur\w*|biomarkers?|characteristics?|traits?|identif\w*)\b/},
  {id:'genes',deck:1,ask:/\b(genes?|genetic\w*|genealog\w*|mutations?)\b/,evidence:/\b(gene\w*|mutation\w*|inherit\w*|hereditar\w*)\b/},
  {id:'prognosis',deck:5,ask:/\b(prognos\w*|staging|stages?|stratif\w*|risk (?:estimate|score|calculator|model)|survival|outlook|predict\w*|early (?:warning signs?|indicators?))\b/,evidence:/\b(prognos\w*|stag\w*|stratif\w*|risk|survival|outlook|early|predict\w*)\b/},
  {id:'risk',deck:1,ask:/\b(risk factors?|risk|susceptibility|inherit\w*|hereditar\w*|cause\w*|etiolog\w*)\b/,evidence:/\b(risk|susceptib\w*|more likely|inherit\w*|hereditar\w*|caus\w*|prevalence|incidence)\b/},
  {id:'symptoms',deck:3,ask:/\b(symptoms?|signs?|manifestations?|clinical presentation)\b/,evidence:/\b(symptoms?|signs?|asymptomatic|manifestations?|wheezing|coughing|fatigue|shortness of breath|rash|pain)\b/},
  {id:'therapy',deck:4,ask:/\b(treatment classes|treat\w*|therap\w*|drug classes|medicines?|medications?|management|manag\w*)\b/,evidence:/\b(treat\w*|therap\w*|manag\w*|drug classes|medicines?|medications?)\b/},
  {id:'classification',deck:1,ask:/\b(types?|subtypes?|classif\w*|taxonomy|nosology)\b/,evidence:/\b(types?|classif\w*|subtypes?|lymphoid|myeloid)\b/},
  {id:'mechanism',deck:1,ask:/\b(pathogenesis|mechanism|molecular biology|pathophysiology|physiology|affect(?:s|ing)?|how does|why does)\b/,evidence:/\b(caus\w*|due to|results? from|mechanism|pathway|cells?|inflamm\w*|protein|molecular|affect\w*)\b/},
  {id:'definition',deck:1,ask:/\b(what (?:is|are)|defin\w*|overview|explain|classif\w*|subtypes?|taxonomy|meaning|mean|tell me about|help me understand)\b/,evidence:/\b(is|are|means|refers to|classified|characterized|occurs when|types)\b/}
];
export function questionDeck(question) {
  return groups.find(group=>group.ask.test(plain(question)))?.deck || null;
}
export function normalizeQuestion(question,topic='',extraAliases=[]){
 let q=plain(question).replace(/^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?/,'');
 for(const alias of [...extraAliases,...(aliases[plain(topic)]||[])].map(plain).filter(Boolean).sort((a,b)=>b.length-a.length))q=(' '+q+' ').replaceAll(' '+alias+' ',' '+plain(topic)+' ').trim();
 q=q.replace(/^tell me (?:about )?(what .+ (?:is|are))$/,'$1');
 const inverted=q.match(/^what (.+) (is|are)$/);if(inverted)q='what '+inverted[2]+' '+inverted[1];
 return q;
}
const unsupported = /\b(dos(?:e|es|ing|age|ages)|prescrib\w*|prescriptions?|titrate|how much should|milligrams?|mg|modify treatment|contraindications?|drug interactions?|recommend medication|cure|stock|inventory|nearest|near me|patient records?|medical records?|identifiers of patients)\b/;
const modifiers = [
  /\b(child\w*|pediatric\w*|paediatric\w*|kids?|infants?|neonat\w*)\b/,
  /\b(pregnan\w*|antenatal|prenatal|gestational)\b/,
  /\b(elderly|geriatric\w*|older adults?)\b/,
  /\b(women|female\w*)\b/, /\b(men|male\w*)\b/, /\b(adults?)\b/, /\b(type (?:1|i|one))\b/, /\b(type (?:2|ii|two))\b/
];
const ignored = new Set(words('a an and as at are be by can could did do does for from how i in is it its of on or that the their them these this those to was were what which who why with you your me about according available any catalogue catalog clinical describe detail details educational explained explain explains described used discussed distinguishes which used source describe general information know learn medical more other please provide related relevant say says selected show sources source tell terms typical usually associated manifest present occur condition disease disorder using us verified where would give common main happen happens develop develops development begin begins work works'));
const aliases = {'high blood pressure':['hypertension'],'high blood cholesterol':['hypercholesterolemia','hyperlipidemia'],'heart attack':['myocardial infarction'],'shingles':['herpes zoster'],'diabetes':['diabetes mellitus'],'parkinsons disease':['parkinson disease'],'alzheimers disease':['alzheimer disease'],'age related macular degeneration':['amd']};
const topicLabels = topic => [plain(topic), ...(aliases[plain(topic)] || [])];
const safeURL = value => {try {const u=new URL(value);return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;} catch {return null;}};
const scoped = (value, topic) => Array.isArray(value) ? value.filter(x=>!x.topic || plain(x.topic)===plain(topic)) : list(value && Object.hasOwn(value,topic) ? value[topic] : null);
const novel = (text, seen) => !seen.some(previous => previous && (previous.includes(plain(text)) || (plain(text).includes(previous) && previous.length>35)));
function residualTerms(question, topic, intent) {
  let q=plain(question);
  for(const t of topicLabels(topic)) q=(' '+q+' ').replaceAll(' '+t+' ',' ').trim();
  q=q.replace(intent.ask,' ');
  return words(q).filter(w=>!ignored.has(w));
}
function fitsTerms(terms, text) {
  const corpus=' '+plain(text)+' ';
  return terms.every(term=>corpus.includes(' '+term+' ') || term.length>3 && [term.replace(/s$/,''),term.replace(/s$/,'')+'s'].some(form=>corpus.includes(' '+form+' ')));
}
function selectedDeck(value){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=7?n:0;}
function metadataAnswer(intent, question, topic, records, seen) {
  const items=scoped(records,topic), qText=plain(question);
  const remaining=residualTerms(question,topic,intent).filter(w=>!['code','codes','cm','courses','programs','education','cataloged','directories','directory','listed','facilities','research','data','tools','dataset','datasets','study','studies','paper','papers','publication','publications','listed','cataloged','catalogued','data','research','article','articles','requirements','size','sample','year','published','access','many','records','modality','name','names','design','trial','used'].includes(w));
  for(const r of items){
    if(!r.title || !safeURL(r.url) || !fitsTerms(remaining,r.title+' '+(r.detail||'')))continue;
    let line='';
    if(intent.field && ['authors','date','studyDesign','population','identifier'].includes(intent.field)){
      const key=intent.field==='identifier'?(question.toLowerCase().includes('pmid')?'pmid':'doi'):intent.field;
      if(!r[key] || /unknown|unavailable|unreviewed/i.test(String(r[key])))continue;
      line=r.title+' — '+String(r[key]);
    }else if(intent.id==='codes' && r.kind==='terminology' && r.code && r.system){
      if(/icd/.test(plain(question))&&!plain(r.system).includes('icd'))continue;
      if(/snomed/.test(plain(question))&&!plain(r.system).includes('snomed'))continue;
      const requested=plain(question).match(/icd (9|10|11)/)?.[1];
      if(requested&&!words(r.system).includes(requested))continue;
      line='Terminology lookup candidate: '+r.system+' '+r.code+' — '+r.title+'. Confirm the full descriptor and subtype.';
    }else if(intent.id==='education' && r.kind==='education'){
      if(/free|cost|tuition|accredit|certif|enrol|registration|deadline/.test(plain(question)))continue;
      line='Cataloged education resource: '+r.title+(r.publisher?' · '+r.publisher:'')+'. Check the institution for current availability and eligibility.';
    }else if(intent.id==='facility' && r.kind==='facility'){
      line='Directory for this topic: '+r.title+'. Use the location search in Section 7 to check individual listings.';
    }else if(intent.id==='research' && ['article','guideline','trial'].includes(r.kind||((r.pmid && r.journal)?'article':''))){
      if(/trial/.test(plain(question)) && r.kind!=='trial')continue;
      if(/guideline/.test(qText) && r.kind!=='guideline')continue;
      if(/journals?|articles?|publications?|papers?|studies/.test(qText) && r.kind!=='article' && !(r.pmid&&r.journal))continue;
      line=(r.kind==='trial'?'Registry search: ':'Cataloged reading: ')+r.title+(r.publisher?' · '+r.publisher:'')+'.';
    }else if(intent.id==='data' && ['dataset','tool'].includes(r.kind)){
      if(/\b(datasets?|data sets?)\b/.test(qText) && r.kind!=='dataset')continue;
      if(/\b(github|software|repositories|frameworks?|llms?|pretrained)\b/.test(qText) && r.kind!=='tool')continue;
      if(/\bgithub\b/.test(qText) && new URL(r.url).hostname!=='github.com')continue;
      if(/licen[cs]e/.test(plain(question)) && !r.license)continue;
      if(/size|how many/.test(plain(question)) && !/size.{0,10}\d/i.test(r.detail||''))continue;
      if(/access/.test(plain(question)) && !/access|controlled|register/i.test(r.detail||''))continue;
      if(/modality/.test(plain(question)) && !/modality/i.test(r.detail||''))continue;
      line=[r.title,r.detail,r.license].filter(Boolean).join(' — ');
    }
    if(line && novel(line,seen))return {text:line,citations:[{title:r.title,url:r.url}],deck:intent.deck};
  }
}

export function answerQuestion({question='',topic='',deck,passages=[],visibleTexts=[],records=[],history=[],role='General reader',aliases:extraAliases=[],limit=1}={}) {
  const prior=list(history).filter(h=>h && (!h.topic || plain(h.topic)===plain(topic)));
  let selected=selectedDeck(deck);
  const result=text=>({text,citations:[],deck:selected||1});
  const status=inspectInput(question);
  if(status==='emergency')return result('If this may be an emergency, contact local emergency services now. This research browser cannot assess someone’s condition.');
  if(status==='private')return result('Please remove personal health details and identifiers. Ask about a public medical topic or a research source.');
  let q=normalizeQuestion(question,topic,extraAliases);
  const noEvidence=()=>result('I could not find a new source passage or catalog field that supports this question for '+(topic||'the selected topic')+'. Try a narrower question or inspect the original sources.');
  if(!q || !topic || unsupported.test(q) || /\b(?:should i|diagnose me|what do i have)\b/.test(q))return noEvidence();
  if(/^(?:what (?:else|more)|tell me more|more details|anything else|go on|continue|and then)$/.test(q)){
    const previous=prior.at(-1);
    if(!previous?.question || (selected && previous.deck && selected!==selectedDeck(previous.deck)))return noEvidence();
    q=plain(previous.question);
  }
  if(unsupported.test(q))return noEvidence();
  const intent=groups.find(item=>item.ask.test(q));
  if(!intent || (selected && selected!==intent.deck))return noEvidence();
  selected=intent.deck;
  const seen=[...list(visibleTexts),...prior.map(h=>h.text||h.answer||'')].filter(s=>typeof s==='string').map(plain);
  if(!intent.evidence)return metadataAnswer(intent,q,topic,records,seen) || noEvidence();
  const terms=residualTerms(q,topic,intent);
  const matches=[];
  const ranked=orderedPassages(scoped(passages,topic),role,topic).map((p,i)=>({p,i,match:(p.intent===intent.id?5:0)+(intent.id==='definition'&&plain(p.focus)===plain(topic)?15:0)+(intent.id==='definition'&&plain(p.heading).includes(plain(topic))?5:0)})).sort((a,b)=>b.match-a.match||a.i-b.i).map(x=>x.p);
  for(const p of ranked) {
    const subtype=plain(p.focus).endsWith(' '+plain(topic)) && !topicLabels(topic).includes(plain(p.focus));
    if(!(topicLabels(topic).includes(plain(p.focus)) || subtype) || (intent.id==='definition'?!p.overview:selectedDeck(p.deck)!==selected) || typeof p.text!=='string' || !p.text.trim() || !p.title || !p.record || !safeURL(p.url)) continue;
    const evidence=plain(p.text);
    if(intent.id==='course'&&/\b(untreated|without (?:treatment|intervention))\b/.test(q)&&!/(untreated|without (?:treatment|intervention)|not treated)/.test(evidence))continue;
    // Match the specific property requested, not just a deck label.
    const specific = [
      [/\bcytogenetic\b/, /\bcytogenetic\b/],
      [/\bimmunophenotyping\b/, /\bimmunophenotyping\b/],
      [/\b(screen\w*)\b/, /\bscreen\w*\b/],
      [/\b(mutations?)\b/, /\bmutation\w*\b/],
      [/\b(biomarkers?)\b/, /\bbiomarkers?\b/],
      [/\b(inherit\w*|hereditar\w*)\b/, /\b(inherit\w*|hereditar\w*)\b/],
      [/\b(stages?|staging)\b/, /\bstag\w*\b/],
      [/\b(classif\w*)\b/, /\b(classif\w*|subtypes?|types)\b/]
    ];
    if(specific.some(([ask,required])=>ask.test(q)&&!required.test(evidence)))continue;
    if(intent.id==='risk' && /\bcaus\w*/.test(q) && !/\bcause/.test(plain(p.heading)) && !/\b(caused by|due to|results? from|cause of|causes? of|causes? (?:can |may )?include|cause is|cause .*unknown|cause .*known|no one knows why)\b/.test(evidence))continue;
    if(!(p.intent===intent.id||intent.evidence.test(evidence)) || !fitsTerms(terms,evidence+' '+p.title+' '+p.focus+' '+(p.heading||'')) || modifiers.some(rx=>rx.test(q)&&!rx.test(evidence+' '+plain(p.focus))) || !novel(p.text,seen))continue;
    if(/\b(should take|you must|mg|dosage|prescribe|you should|call 911)\b/.test(evidence))continue;
    const check=verifyClaim({kind:'passage',topic,sourceUrl:p.sourceRecord||p.url,field:'text',value:p.text,record:p.record},{topic,passages:[p]});
    if(check.status==='withheld')continue;
    if(matches.some(m=>m.check.text===check.text))continue;
    matches.push({check,passage:p});if(matches.length>=Math.max(1,Math.min(limit,8)))break;
  }
  if(matches.length){const {check,passage:p}=matches[0];return {text:check.text,citations:[check.citation],checks:[check],deck:selected,courseContext:p.courseContext,professional:professionalRole(role),matches,intent:intent.id}}
  return noEvidence();
}
