// Emit SQL to stdout. Review and apply with the database owner's psql session.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const load=name=>JSON.parse(readFileSync(new URL('../dist/'+name+'.json',import.meta.url)));
const taxonomy=load('taxonomy'),medline=load('medline-topics'),catalog=load('catalog'),historical=load('clinical-passages'),example=load('research-example');
const topics=new Set([...load('topic-list'),...medline.topics.map(t=>t.title),...Object.keys(catalog),...Object.keys(historical)]);
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const json=v=>quote(JSON.stringify(v))+'::jsonb';
const key=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
console.log('begin;');
const topicRows=[...topics].filter(t=>typeof t==='string'&&t.length>0&&t.length<=160);
for(let i=0;i<topicRows.length;i+=500)console.log('insert into public.hb_topics(topic,curated) values '+topicRows.slice(i,i+500).map(t=>'('+quote(t)+','+Object.hasOwn(catalog,t)+')').join(',')+' on conflict(topic) do update set curated=excluded.curated;');
for(const e of taxonomy.entities)console.log('insert into public.hb_diseases(id,topic,aliases,specialties) values ('+[quote(e.id),quote(e.name),json(e.aliases),json(e.departmentIds)].join(',')+') on conflict(id) do update set topic=excluded.topic,aliases=excluded.aliases,specialties=excluded.specialties;');
const evidence=new Map();
function put(topic,kind,title,content,url,publisher,date,prov,identity){
  if(!/^https?:\/\//.test(url||''))return;
  const k=key(topic,kind,url,identity);
  evidence.set(k,[quote(k),quote(topic),quote(kind),quote(title),content?quote(content):'null',publisher?quote(publisher):'null',quote(url),date?quote(date.slice(0,10)):'null',json(prov)]);
}
const catalogKinds={core:'definition',education:'education',dataset:'dataset',tool:'dataset',guideline:'research',article:'research',statistics:'research',trial:'research',risk:'genetics',facility:'facility'};
for(const [topic,rows] of Object.entries(catalog))for(const r of rows)put(topic,catalogKinds[r.kind]||'resource',r.title,r.detail,r.url,r.publisher,null,{source:'catalog',kind:r.kind},r.title);
const archiveKinds={1:'definition',2:'genetics',3:'resource',4:'symptom',5:'identification',6:'genetics',7:'treatment',8:'research'};
for(const [topic,rows] of Object.entries(historical))for(const r of rows)put(topic,archiveKinds[r.deck],r.title,r.text,r.sourceRecord||r.url,'MedQuAD',null,{attribution:r.attribution,license:r.license,record:r.record,vintage:r.vintage},r.record+' '+r.text);
for(const t of medline.topics){
  for(const [n,text] of Object.entries(t.sections||{}))put(t.title,({'1':'definition','2':'identification','5':'genetics','6':'resource'})[n]||'resource',t.title,text,t.url,medline.provider,null,{feedDate:medline.feedDate,section:n,licenseUrl:medline.licenseUrl},'section '+n);
  for(const link of Object.values(t.links||{})){
    const kind=(/drug|medicin/i.test(link.category)?'medicine':/treatment|therap/i.test(link.category)?'treatment':/test|diagnosis/i.test(link.category)?'identification':/research|trial/i.test(link.category)?'research':'resource');
    put(t.title,kind,link.title,null,link.url,link.publisher,null,{feedDate:medline.feedDate,category:link.category},link.title);
  }
}
for(const set of Object.values(example.papers||{}))for(const paper of set.records||[])put(example.topic,'research',paper.title,paper.passage?.text,paper.url,paper.journal,/^\d{4}-\d{2}-\d{2}$/.test(paper.date)?paper.date:null,{pmid:paper.pmid,doi:paper.doi,checkedAt:set.queriedAt,rankingVersion:paper.provenance?.rankingVersion},paper.pmid);
const rows=[...evidence.values()];
for(let i=0;i<rows.length;i+=100)console.log('insert into public.hb_evidence(record_key,topic,kind,title,content,publisher,source_url,source_date,provenance) values '+rows.slice(i,i+100).map(r=>'('+r.join(',')+')').join(',')+' on conflict(record_key) do update set title=excluded.title,content=excluded.content,publisher=excluded.publisher,source_date=excluded.source_date,provenance=excluded.provenance,review_status=case when hb_evidence.review_status=\'withdrawn\' then \'withdrawn\' when hb_evidence.content is distinct from excluded.content then \'unreviewed\' else hb_evidence.review_status end;');
const medicines=JSON.parse(readFileSync(new URL('../supabase/medicine-links.json',import.meta.url)));
const revision='577bd37b96c02d1833b2c9eed2de9f96964e96cb';
for(let i=0;i<medicines.length;i+=100)console.log('insert into public.hb_medicines(record,name,publisher_url,archive_url,corpus_version) values '+medicines.slice(i,i+100).map(m=>'('+[m.record,m.name,m.url,'https://github.com/abachaa/MedQuAD/blob/'+revision+'/'+m.record,revision].map(quote).join(',')+')').join(',')+' on conflict(record) do update set name=excluded.name,publisher_url=excluded.publisher_url,archive_url=excluded.archive_url,corpus_version=excluded.corpus_version;');
console.log('commit;');
