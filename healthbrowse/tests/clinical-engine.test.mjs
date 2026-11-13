import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectInput,inspectQuery,answerQuestion} from '../dist/clinical-engine.js';
// Isolated fixtures verify contract behavior independently of catalog revisions.
const makePassage=(deck,text,focus='Asthma')=>({deck,text,focus,title:'Test passage '+deck,url:'https://medlineplus.gov/asthma.html',record:'fixture.xml#'+deck,overview:text.startsWith('Asthma is')});
const passages={Asthma:[
  makePassage(1,'Asthma is a chronic disease that affects the airways.'),
  makePassage(1,'A family history is one risk factor for asthma.'),
  makePassage(1,'The mechanism involves airway inflammation.'),
  makePassage(3,'Symptoms of asthma include coughing and wheezing.'),
  makePassage(3,'Diagnostic tests include measurements of lung function.'),
  makePassage(5,'This risk model estimates the likelihood of future asthma attacks.'),
  makePassage(4,'Treatment classes include inhaled corticosteroids.')
],Diabetes:[makePassage(3,'Symptoms can include thirst.','Diabetes')]};
const base={topic:'Asthma',passages};
const ask=(question,extras={})=>answerQuestion({...base,question,...extras});

test('educational topic searches remain public; personal cases and identifiers cannot be persisted',()=>{
  for(const input of ['What are stroke symptoms?', 'What is a heart attack?','How is asthma diagnosed?','What are suicidal thoughts?'])assert.equal(inspectInput(input),'ok');
  for(const input of ['I have diabetes','My son is coughing','DOB 18/12/1994','2020-07-12','12 July 2020','June 2, 1980','Patient ID: 582','alex@example.org','Reach me at +1 (555) 431-0000'])assert.equal(inspectInput(input),'private');
  for(const input of ['I think I am having a stroke','My father has chest pain','I want to kill myself','I am having active suicidal thoughts','active suicidal thoughts','I might hurt myself','I cannot breathe','My speech is slurred and my face droops right now']) assert.equal(inspectInput(input),'emergency',input);
});
test('search admission accepts non-identifying symptoms without weakening persistence or emergencies',()=>{
 for(const q of ['I have a sore throat for three days','My child has a sore throat','I have diabetes','My patient has a cough']){
  assert.equal(inspectQuery(q),'ok',q);assert.equal(inspectInput(q),'private',q);
 }
 for(const q of ['My patient Jane has a sore throat','I am John Smith, I have a cough','DOB: 12/02/1994','MRN 99887','me@example.org'])assert.equal(inspectQuery(q),'private',q);
 for(const q of ['I have a sore throat and cannot breathe','My father has chest pain','I might hurt myself'])assert.equal(inspectQuery(q),'emergency',q);
});
test('educational roles cite an actual archived record and do not change permissions',()=>{
  for(const role of [0,1,2,3,4]){
    const answer=ask('What is asthma?',{role,deck:1});
    assert.equal(answer.text,passages.Asthma.find(p=>p.deck===1).text);
    assert.equal(answer.citations[0].url,passages.Asthma.find(p=>p.deck===1).url);
    const dose=ask('What dose should I take?',{role});assert.equal(dose.supported,false);assert.ok(dose.citations.every(c=>new URL(c.url).hostname==='www.fda.gov'));
  }
});
test('uses the requested card, clinical intent and topic',()=>{
  assert.equal(ask('What are the symptoms of asthma?').deck,3);
  assert.equal(ask('What are the symptoms of asthma?').citations.length,1);
  for(const [question,options] of [
    ['How is asthma diagnosed?',{deck:6}],
    ['What are the symptoms of psoriasis?',{}],
    ['What are the symptoms of asthma in children?',{}],
    ['What is the cost of asthma screening?',{}],
    ['Which study proves steroids cure asthma?',{}],
    ['What are the genetic mutations in asthma caused by TP53?',{}],
    ['What are the symptoms of asthma?',{passages:passages.Diabetes.map(p=>({...p,topic:'Diabetes'}))}]
  ])assert.equal(ask(question,options).citations.length,0,question);
});
test('skip material already visible and use only same-topic follow-up history',()=>{
  const first=ask('What are the symptoms of asthma?');
  assert.equal(ask('What are the symptoms of asthma?',{visibleTexts:[first.text]}).citations.length,0);
  assert.equal(ask('Tell me more',{history:[{question:'What are the symptoms of asthma?',topic:'Asthma',deck:6,text:first.text}]}).citations.length,0);
  assert.equal(ask('Tell me more',{history:[{question:'What are the symptoms of asthma?',topic:'Diabetes',deck:6}]}).citations.length,0);
});
test('study metadata must be supported by a specific record',()=>{
  const records=[{title:'Asthma review',authors:'Jane Author',population:null,url:'https://example.org/paper'}];
  assert.match(ask('Who authored the asthma study?',{deck:7,records}).text,/Jane Author/);
  assert.equal(ask('What was the study population?',{deck:7,records}).citations.length,0);
  assert.equal(ask('Who authored the asthma study?',{deck:7,records:[{...records[0],url:'javascript:alert(1)'}]}).citations.length,0);
});
test('inspect a cataloged dataset access field without granting access',()=>{
  const records=[{kind:'dataset',title:'Asthma dataset',url:'https://example.org/data',detail:'Access as catalogued: controlled.'}];
  assert.match(ask('What are the access requirements for the asthma datasets?',{records}).text,/controlled/);
  assert.equal(ask('What is the license for the asthma dataset?',{records}).citations.length,0);
});

test('seven-section clinical taxonomy follows the selected section',()=>{
  const cases=[
    ['What is asthma?',1],['Which risk factors are described?',1],['What mechanism explains asthma?',1],['Which symptoms are common?',3],
    ['Which diagnostic tests are used?',3],['Which risk model is described?',5],['What treatment classes are discussed?',4]
  ];
  for(const [question,deck] of cases){
    const result=ask(question,{deck});
    assert.equal(result.citations.length,1,question+' — '+result.text);
    assert.equal(result.deck,deck,question);
  }
  assert.equal(ask('What study design was used?',{deck:7,records:[{title:'Asthma trial',studyDesign:'Clinical Trial',url:'https://example.org/trial'}]}).citations.length,1);
});
test('no leakage from unscoped array of another topic',()=>{
  assert.equal(ask('What are the symptoms of asthma?',{passages:passages.Diabetes}).citations.length,0);
});

test('questions select symptom and diagnostic decks independently of the open card',async()=>{
  const {questionDeck}=await import('../dist/clinical-engine.js');
  assert.equal(questionDeck('What are its symptoms?'),3);
  assert.equal(questionDeck('What is cytogenetic analysis?'),3);
  assert.equal(questionDeck('How does asthma affect breathing?'),1);
  assert.equal(questionDeck('Tell me more'),null);
});

test('cataloged education, journal, software and care links belong to the appropriate sections',async()=>{
  const {questionDeck}=await import('../dist/clinical-engine.js');
  const {deckNames}=await import('../dist/workspace.js');
  assert.equal(deckNames.length,7);
  for (const [question,deck,kind,title,url] of [
    ['Which education programs are cataloged?',7,'education','Research course','https://example.org/course'],
    ['Which journals are cataloged?',7,'article','Clinical study','https://example.org/paper'],
    ['Which datasets are cataloged?',7,'dataset','Open research dataset','https://example.org/data'],
    ['Which facility directories are cataloged?',7,'facility','Official care directory','https://example.org/care']
  ]){
    const records=[{kind,title,url,publisher:'Fixture institute'}];
    assert.equal(questionDeck(question),deck);
    assert.equal(ask(question,{records}).citations[0]?.url,url);
    assert.equal(ask(question,{records:[]}).citations.length,0);
  }
  assert.equal(ask('Is the hospital pharmacy in stock?',{records:[{kind:'facility',title:'Directory',url:'https://example.org'}]}).citations.length,0);
});
test('coding references require verified matching terminology fields',()=>{
  const record={kind:'terminology',system:'ICD-10-CM',code:'TEST',title:'Fixture label',url:'https://example.org/code'};
  assert.equal(ask('What is the ICD-10 code for asthma?',{records:[record]}).citations.length,1);
  assert.equal(ask('What is the ICD-9 code for asthma?',{records:[record]}).citations.length,0);
  assert.equal(ask('What is the SNOMED CT code for asthma?',{records:[record]}).citations.length,0);
});
