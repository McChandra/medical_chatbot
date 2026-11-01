import assert from 'node:assert/strict';
import test from 'node:test';
import {searchResearchPapers} from '../dist/research-papers.js';

function paper(id,changes={}){
  return {id:String(id),source:'MED',title:'Leukemia genetic risk study '+id+'.',doi:'10.sample/'+id,
    pubTypeList:{pubType:['Systematic Review']},firstPublicationDate:'2025-01-01',
    abstractText:'<p>Researchers compared genetic risk in the two study groups.</p> A registry code was reported as NCT01234567.',...changes};
}
function summary(p,changes={}){
 return {uid:p.id,title:p.title,pubdate:'2025 Jan 1',articleids:[{idtype:'doi',value:p.doi}],pubtype:['Systematic Review'],...changes};
}
function mock(t,rows,summaries){
 return t.mock.method(globalThis,'fetch',async url=>{
   if(url.hostname==='www.ebi.ac.uk')return Response.json({resultList:{result:rows}});
   assert.equal(url.hostname,'eutils.ncbi.nlm.nih.gov');
   return summaries instanceof Response?summaries:Response.json({result:{uids:Object.keys(summaries),...summaries}});
 });
}
test('requires independent PubMed identity and excludes mismatches, notices and nonmatching lens titles',async t=>{
 const rows=Array.from({length:8},(_,i)=>paper(i+1));
 rows[6]=paper(7,{title:'Leukemia care'});rows[7]=paper(8,{title:'Correction to: Leukemia genetic risk'});
 const summaries=Object.fromEntries(rows.map(row=>[row.id,summary(row)]));
 summaries['2']=summary(rows[1],{title:'Different condition'});summaries['3']=summary(rows[2],{uid:'30'});
 summaries['4']=summary(rows[3],{pubtype:['Retracted Publication']});summaries['5']=summary(rows[4],{articleids:[{idtype:'doi',value:'10.sample/other'}]});delete summaries['6'];
 const fetch=mock(t,rows,summaries);
 const {records}=await searchResearchPapers('Leukemia','genetics');
 assert.deepEqual(records.map(r=>r.pmid), ['1']);
 assert.match(fetch.mock.calls[0].arguments[0].searchParams.get('query'), /TITLE:"germline"/);
 assert.equal(records[0].passage.text,'Researchers compared genetic risk in the two study groups.');
 assert.deepEqual(records[0].registryLinks,[{id:'NCT01234567',url:'https://clinicaltrials.gov/study/NCT01234567'}]);
 assert.match(records[0].studyStatus,/not established/);
});
test('limits results to five and leaves unavailable author passages empty',async t=>{
 const rows=Array.from({length:8},(_,i)=>paper(i+10,{abstractText:null}));
 mock(t,rows,Object.fromEntries(rows.map(row=>[row.id,summary(row)])));
 const {records}=await searchResearchPapers('Leukemia','general');
 assert.deepEqual(records.map(r=>r.rank),[1,2,3,4,5]);assert.ok(records.every(r=>r.passage===null));
});
test('does not downgrade unverified metadata when PubMed is unavailable',async t=>{
 mock(t,[paper(1)],new Response('busy',{status:429}));
 await assert.rejects(searchResearchPapers('Leukemia','general'),/verification unavailable/);
 await assert.rejects(searchResearchPapers('Leukemia','invalid'),/Unknown research focus/);
});
test('an unavailable Europe PMC falls back to PubMed and Crossref; a DOI mismatch cannot appear',async t=>{
  const sums={};
  for(const id of ['110','120']){
    sums[id]={uid:id,title:'Treatments for leukemia '+id+'.',articleids:[{idtype:'doi',value:'10.1234/'+id}],
      pubtype:['Systematic Review'],pubdate:'2024',sortpubdate:'2024/07/01 00:00',fulljournalname:'Fixture journal',authors:[{name:'Author'}]};
  }
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);
    if(u.hostname==='www.ebi.ac.uk')return new Response(null,{status:503});
    if(u.pathname.endsWith('esearch.fcgi')){assert.match(u.searchParams.get('term'),/"treatment"\[Title\]/);return Response.json({esearchresult:{idlist:['110','120']}})}
    if(u.pathname.endsWith('esummary.fcgi'))return Response.json({result:{uids:['110','120'],...sums}});
    if(u.hostname==='api.crossref.org'){
      const id=u.href.endsWith('110')?'110':'120';
      return Response.json({message:{title:[id==='110'?sums[id].title:'Unrelated paper'],DOI:'10.1234/'+id}});
    }
    if(u.pathname.endsWith('efetch.fcgi'))return new Response('<PubmedArticle><PMID Version="1">110</PMID><Abstract><AbstractText>This study examined treatments in adults with leukemia.</AbstractText></Abstract></PubmedArticle>');
    throw Error('unexpected request');
  });
  const result=await searchResearchPapers('Leukemia','treatments');
  assert.deepEqual(result.records.map(r=>r.pmid),['110']);
  assert.equal(result.records[0].provenance.source,'PubMed and Crossref');
  assert.equal(result.records[0].passage.text,'This study examined treatments in adults with leukemia.');
});
