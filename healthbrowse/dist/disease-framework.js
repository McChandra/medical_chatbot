import {normalizeSourceLabel} from './source-labels.js';
import {roleIndex,readingLabel} from './reading-profiles.js';
// Stable identifiers keep saved conversations distinct from the previous taxonomy.
export const frameworkVersion='disease-spectrum-v2';
export const domains=[
 {title:'Etiology & Pathogenesis',plain:'Causes & how it develops',subtitle:'The origin',scope:'Causes, risk factors, genetics, and biological mechanisms.',professional:'Etiologic factors, cellular injury, immune pathways, and molecular mechanisms.',empty:'A source passage about causes or mechanisms is not available for this topic.'},
 {title:'Natural History & Progression',plain:'How it changes over time',subtitle:'The timeline',scope:'Early changes, symptom onset, and the course of disease.',professional:'Susceptibility, subclinical and clinical phases; intervention status and longitudinal evidence.',empty:'No source passage establishes the untreated course here. A standard timeline cannot be inferred.'},
 {title:'Clinical Presentation & Diagnosis',plain:'Symptoms & how doctors identify it',subtitle:'The identification',scope:'Symptoms, signs, examinations, and diagnostic tests.',professional:'Phenotype, diagnostic criteria, differential diagnosis, laboratory and imaging limitations.',empty:'No source passage supports diagnostic criteria or a differential for this topic.'},
 {title:'Therapeutics & Management',plain:'Treatment & ongoing care',subtitle:'The intervention',scope:'Treatment approaches, ongoing care, and support.',professional:'Acute interventions, chronic management, therapeutic classes, and guideline applicability.',empty:'No source passage supports treatment details here. Current guidelines must be checked.'},
 {title:'Prognosis & Complications',plain:'Outlook & possible complications',subtitle:'The outlook',scope:'Possible outcomes and health problems associated with the disease.',professional:'Prognostic factors, outcome measures, complications, population and follow-up limitations.',empty:'No source passage supports an outcome estimate here. Individual prognosis cannot be inferred.'},
 {title:'Epidemiology & Public Health',plain:'Who is affected & prevention',subtitle:'The population',scope:'Population patterns, prevention, and access to care.',professional:'Incidence, prevalence, prevention levels, social determinants, geography and observation period.',empty:'No source passage supports population estimates or prevention guidance here.'},
 {title:'Research, Evidence & Resources',plain:'Research & useful resources',subtitle:'Explore the evidence',scope:'Papers, trials, research institutions, learning resources, datasets, and care directories.',professional:'Study design, evidence limitations, trial registries, funded research, data access and reproducibility.',empty:'Inspect the linked research records. A publication or registry entry does not establish clinical benefit.'}
];
export const frameworkReferences=[
 {title:'Funkhouser · Pathology: the clinical description of human disease (2020)',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC7380242/'},
 {title:'Jewell · Natural History of Diseases: Statistical Designs and Issues (2016)',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC5017909/'}
];
export const professionalRole=role=>roleIndex(role)===1;
export const roleLabel=readingLabel;
export const domainTitle=(number,role)=>roleIndex(role)===1?domains[number-1].title:domains[number-1].plain;

// Route intact excerpts, never synthesize disease facts from a domain label.
// A progression passage does not establish that its subjects were untreated.
const signals=[
 /\b(caus\w*|etiolog\w*|pathogen\w*|risk factors?|genes?|genetic\w*|mutation\w*|inflamm\w*|immune|mechanism\w*|abnormal .*cells?|crowd out|blood.forming)\b/i,
 /\b(untreated|without (?:treatment|intervention)|natural history|asymptomatic|no symptoms|over time|progress\w*|grows? (?:quickly|slowly)|early stages?|onset|subclinical)\b/i,
 /\b(symptoms?|signs?|diagnos\w*|tests?|immunophenotyp\w*|cytogenetic\w*|biops\w*|imaging|examination|screening)\b/i,
 /\b(treat\w*|therap\w*|management|medicines?|medications?|surgery|rehabilitation)\b/i,
 /\b(prognos\w*|complication\w*|survival|outlook|mortality|staging|outcomes?|disability)\b/i,
 /\b(incidence|prevalence|population|epidemiolog\w*|prevent\w*|vaccin\w*|social determinants|healthcare access|most common|more common|all ages|over age|starts during childhood)\b/i
];
export function routePassage(p,origin='medquad'){
 const text=p.text||'',original=Number(p.deck);
 const overview=original===1;
 const base=origin==='medline'?({2:3,5:1,6:3}[original]):({2:1,3:1,4:3,5:3,6:5,7:4,8:7}[original]);
 const decks=new Set(base?[base]:[]);
 // Existing source annotations constrain lexical expansion. For example, prior
 // chemotherapy as a risk factor is not a treatment recommendation, and immune
 // markers used for diagnosis are not evidence of disease causation.
 const expansions=origin==='medline'?({1:[0,1,2],2:[1],5:[5],6:[3,4,5]}[original]||[]):({1:[0,1],2:[5],3:[1],4:[1,4]}[original]||[]);
 for(const i of expansions)if(signals[i].test(text))decks.add(i+1);
 // Keep definition records for the overview without mislabelling them as mechanisms.
 if(overview&&!decks.size)decks.add(1);
 return [...decks].map(deck=>({...p,deck,overview,frameworkVersion,
  ...(deck===2?{courseContext:/\b(untreated|without (?:treatment|intervention))\b/i.test(text)?'untreated':'unspecified'}:{})}));
}
// Reuse intact, explicitly relevant source paragraphs in more than one domain.
// No new facts or treatment-exposure assumptions are introduced by routing.
export function expandKnowledge(p){
 const rows=[p],add=(deck,intent)=>{if(!rows.some(r=>r.deck===deck&&!r.overview))rows.push({...p,deck,intent,overview:false})};
 const text=p.text||'';
 if(p.overview&&/\b(caused by|cause of|causes? include|results? from)\b/i.test(text))add(1,'risk');
 if((p.overview||p.deck===6)&&/\b(?:antiviral medicines?|medicines? can help|treatment (?:includes|depends|can)|treated with)\b/i.test(text))add(4,'therapy');
 if([2,3,4,5,6].includes(p.deck)&&/\b(?:go away on their own|heal on their own|clear up on their own|usually (?:last|lasts|clear|clears)|come back|recur|recurrence)\b/i.test(text))add(2,'course');
 if([2,4,6].includes(p.deck)&&/\b(?:go away on their own|heal on their own|clear up on their own|there is no cure|complications? include)\b/i.test(text))add(5,'prognosis');
 if(p.overview&&/\b(?:population|prevalence|incidence|most common in)\b/i.test(text))add(6,'public-health');
 return rows;
}
export function medlinePassages(record,topic,feed={}){
 if(!record)return [];
 if(record.knowledge?.length)return record.knowledge.map(normalizeSourceLabel).flatMap(expandKnowledge).map(p=>({...p,focus:topic,frameworkVersion,
  title:record.title+' · MedlinePlus'+(p.heading?' · '+p.heading:''),url:record.url,record:record.url+'#summary-'+p.id,
  vintage:'MedlinePlus feed snapshot · '+(feed.feedDate||feed.retrievedAt||'date unavailable'),sourceType:'patient-education',
  ...(p.deck===2?{courseContext:/untreated|without (?:treatment|intervention)|not treated/i.test(p.text)?'untreated':'unspecified'}:{})}));
 return Object.entries(record.sections||{}).flatMap(([number,value])=>(Array.isArray(value)?value:[value])
  .filter(t=>typeof t==='string'&&t.trim()).flatMap((text,i)=>routePassage({deck:Number(number),text,
   title:record.title+' · MedlinePlus',url:record.url,focus:topic,record:record.url+'#'+number+'-'+i,
   vintage:'MedlinePlus feed snapshot · '+(feed.feedDate||feed.retrievedAt||'date unavailable'),sourceType:'patient-education'},'medline')));
}
export function orderedPassages(rows,role,topic){
 const level=roleIndex(role),professional=level===1;
 return rows.map((p,i)=>({p,i,score:
  (professional?(p.focus!==topic?2:0)+(/cytogenetic|immunophenotyp|biomarker|prognos|mechanism/i.test(p.text)?3:0):0)
  +(/medlineplus\.gov/.test(p.url)?(professional?1:6):0)
  +(professional?Math.min((p.text||'').length/1000,1):0)}))
  .sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.p);
}
export function sectionLinks(record,deck){
 const old={1:[5,1],2:[1],3:[2],4:[6],5:[],6:[3],7:[3,4,7,1]}[deck]||[];
 return old.map(n=>record?.links?.[n]).filter(Boolean);
}
