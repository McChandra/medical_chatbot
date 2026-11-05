import {domains,domainTitle,professionalRole} from './disease-framework.js';
import {verifyClaim} from './claim-check.js';
import {sectionNames} from './medcard.js';

const elt=(tag,text,cls)=>Object.assign(document.createElement(tag),{textContent:text??'',className:cls||''});
const link=(title,url)=>{
  const a=elt('a',title+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
};
const action=(title,fn)=>{const b=elt('button',title,'act');b.type='button';b.onclick=fn;return b};
export function checkedPassage(topic,passages,p){
  if(!p)return null;
  const evidence={topic,passages};
  const sourceUrl=p.sourceRecord||p.url;
  const result=verifyClaim({kind:'passage',topic,sourceUrl,field:'text',value:p.text,record:p.record},evidence);
  return result.status==='withheld'?null:result;
}
export function renderCheck(parent,check){
  if(!check||check.status==='withheld')return;
  const details=elt('details',null,'claim-check');
  details.append(elt('summary',check.status==='corrected'?'Source correction applied':'Show claim check'));
  details.append(elt('p',check.reason||'Matched against the cited source record.'),link(check.citation.title,check.citation.url));if(check.provenance)details.append(elt('p',(check.provenance.historical?'Historical archive · ':'Publisher record · ')+check.provenance.publisher+' · '+check.provenance.date,'meta'));if(check.checkedAt)details.append(elt('small','Record comparison: '+check.checkedAt+' · clinical review pending','meta'));parent.append(details);
}
const tracks={general:'Disease overview',genetics:'Genetics & inheritance',treatments:'Treatments & medicines'};
export function createResearchDesk(getContext,activate){
  let current='',focus='general',controller,activity=null,papers=null,section=null,lastScope='';
  let activityError=false,paperError=false,paperRun=0,activityTask,paperTask;
  const root=document.getElementById('researchBrief');
  let seedRequest;
  async function request(path,signal){
    try{
      const response=await fetch(path,{signal,cache:'no-store'});
      if(!response.ok)throw Error('Source unavailable');
      return await response.json();
    }catch(error){
      if(signal.aborted||current.toLowerCase()!=='leukemia')throw error;
      seedRequest??=fetch('research-example.json').then(response=>{if(!response.ok)throw error;return response.json()}).catch(e=>{seedRequest=null;throw e});
      const saved=await seedRequest;
      const url=new URL(path,location.origin);
      const record=url.pathname.endsWith('/activity')?saved.activity:saved.papers[url.searchParams.get('focus')];
      if(!record)throw error;
      return {...record,snapshot:true};
    }
  }
  async function loadPapers(){
    const run=++paperRun;const signal=controller.signal;
    papers=null;paperError=false;draw();
    try{
      const data=await request('/api/research/papers?'+new URLSearchParams({topic:current,focus}),signal);
      if(!signal.aborted && run===paperRun)papers=data;
    }catch{if(!signal.aborted && run===paperRun)paperError=true}
    if(!signal.aborted && run===paperRun)draw();
  }
  function begin(topic){
    controller?.abort();controller=new AbortController();current=topic;focus='general';section=null;activity=null;activityError=false;
    const signal=controller.signal;
    activityTask=request('/api/research/activity?'+new URLSearchParams({topic}),signal).then(data=>{if(!signal.aborted){activity=data;draw()}}).catch(()=>{if(!signal.aborted){activityError=true;draw()}});
    paperTask=loadPapers();
  }
  function track(key){if(key!==focus){focus=key;paperTask=loadPapers()}return paperTask}
  function select(i,move=true){
    section=i;activate(i,false);if(i===1)track('genetics');else if(i===4)track('treatments');else if(i===7)track('general');draw();
    if(move)root.querySelector('.deep-dive')?.scrollIntoView({block:'nearest'});
  }
  function draw(){
    const c=getContext();if(!c||c.topic!==current)return;
    root.replaceChildren();root.append(elt('div','RESEARCH BRIEF','eyebrow'),elt('h3',c.topic));
    const intro=checkedPassage(c.topic,c.passages,c.passages.find(p=>p.overview));
    if(intro){root.append(elt('p',intro.text),link(intro.citation.title,intro.citation.url));renderCheck(root,intro)}
    root.append(elt('p','Would you like to dig deeper into one of these seven sections? Choose a section to see its research sources.'));
    const nav=elt('div',null,'brief-nav');
    sectionNames.forEach((title,i)=>{const btn=action((i+1)+' · '+domainTitle(i+1,c.role),()=>select(i+1));btn.setAttribute('aria-pressed',String(section===i+1));const p=c.passages.find(p=>p.deck===i+1&&!p.overview);
      const preview=checkedPassage(c.topic,c.passages,p);
      const card=elt('div',null,'brief-section-choice');card.append(btn);
      if(preview){const first=preview.text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()||preview.text;card.append(elt('small',first,'meta'),link('Source',preview.citation.url))}
      else{const source=c.sections?.[i]?.[0];if(source)card.append(link(source.title,source.url));else card.append(elt('small','Open this section to inspect coverage.','meta'))}
      nav.append(card)});root.append(nav);
    if(section){
      const box=elt('section',null,'deep-dive');box.append(elt('h4',section+' · '+domainTitle(section,c.role)));
      const seen=new Set();let count=0;
      for(const p of c.passages.filter(p=>p.deck===section&&!p.overview)){
        const claim=checkedPassage(c.topic,c.passages,p);
        if(!claim||seen.has(claim.text)||count>=4)continue;seen.add(claim.text);count++;
        box.append(elt('p',claim.text),link(claim.citation.title,claim.citation.url));renderCheck(box,claim);
      }
      const resources=c.sections?.[section-1]||[];
      for(const record of resources.slice(0,3)){const row=elt('p');row.append(link(record.title,record.url));if(record.detail)row.append(elt('small',record.detail,'meta'));box.append(row)}
      if(!count)box.append(elt('p',domains[section-1].empty));if(section===2)box.append(elt('p','A progression excerpt does not establish an untreated timeline. Check intervention exposure and population in the original source.','meta'));if(professionalRole(c.role))box.append(elt('p','Appraisal: '+domains[section-1].professional,'clinical-lens'));
      root.append(box);
    }
    const papersBox=elt('section',null,'research-block');papersBox.append(elt('h4','Five ranked research papers'));
    const bar=elt('div',null,'research-filters');for(const [key,title] of Object.entries(tracks)){
      const btn=action(title,()=>track(key));btn.setAttribute('aria-pressed',String(key===focus));bar.append(btn)
    }
    papersBox.append(bar);
    if(!papers)papersBox.append(elt('p',paperError?'Cross-checked publications are unavailable.':'Checking publication records…','meta'));
    if(paperError)papersBox.append(action('Retry publications',()=>{paperTask=loadPapers()}));
    if(papers){
      if(papers.snapshot)papersBox.append(elt('p','Live verification unavailable. Showing a previously checked snapshot dated '+papers.queriedAt.slice(0,10)+'.','meta'));
      papersBox.append(elt('p',papers.records.length+' qualifying published records · '+(papers.queriedAt||'')+'. Ranked within retrieved candidates.','meta'));
      for(const [i,p] of papers.records.slice(0,5).entries()){
        const row=elt('article',null,'brief-record');row.append(link((i+1)+'. '+p.title,p.url));
        row.append(elt('small',[p.journal,p.date,p.category,'PMID '+p.pmid].filter(Boolean).join(' · '),'meta'));
        if(p.passage?.text){
          const claim=verifyClaim({kind:'paper',topic:c.topic,sourceUrl:p.url,field:'abstractExcerpt',value:p.passage.text},{topic:c.topic,papers:papers.records});
          if(claim.status!=='withheld'){row.append(elt('p',claim.text),elt('small',p.passage.location||'Source abstract','meta'));renderCheck(row,claim)}
        }
        row.append(elt('p',p.studyStatus||'Study status requires a linked registry record.','meta'));
        const check=verifyClaim({kind:'paper',topic:c.topic,field:'title',sourceUrl:p.url,value:p.title},{topic:c.topic,papers:papers.records});
        renderCheck(row,check);for(const study of p.registryLinks||[])row.append(link(study.id+' · '+(study.status?study.status.replaceAll('_',' ').toLowerCase()+' · '+study.checkedAt.slice(0,10):'registry status unverified'),study.url));
        if(p.reason)row.append(elt('small',p.reason,'meta'));papersBox.append(row);
      }
    }
    root.append(papersBox);
    const registry=elt('section',null,'research-block');registry.append(elt('h4','Institutions, grants & clinical trials'));
    if(activity){
      if(activity.snapshot)registry.append(elt('p','Live refresh unavailable. The following registrations and awards were checked on '+activity.checkedAt.slice(0,10)+'. Current status may have changed.','meta'));
      const awards=activity.grants.rows,ongoing=activity.trials.ongoing.rows,completed=activity.trials.completed.rows;
      const about=elt('p',[activity.grants.status!=='unavailable'?awards.length+' qualifying award records':null,activity.trials.ongoing.status!=='unavailable'?ongoing.length+' ongoing registrations':null,activity.trials.completed.status!=='unavailable'?completed.length+' completed registrations':null].filter(Boolean).join(' · '),'meta');
      registry.append(about);
      const groups=new Map();
      for(const award of awards){
        const verified=verifyClaim({kind:'grant',topic:c.topic,sourceUrl:award.url,field:'institution',value:award.institution},{topic:c.topic,grants:awards});
        if(verified.status==='withheld')continue;
        if(!groups.has(verified.text))groups.set(verified.text,[]);
        groups.get(verified.text).push(award);
      }
      if(groups.size){
        const heading=elt('h5','Funded institutions in this result set');registry.append(heading);
        const ranked=Array.from(groups).sort(([a,x],[b,y])=>y.length-x.length||a.localeCompare(b));
        for(const [name,awards] of ranked){const line=elt('p');line.append(link(name,awards[0].url),document.createTextNode(' · '+awards.length+' matching award'+(awards.length===1?'':'s')));registry.append(line)}
      }
    }
    if(!activity)registry.append(elt('p',activityError?'Registry records are unavailable.':'Checking NIH RePORTER and ClinicalTrials.gov…','meta'));
    if(activityError)registry.append(action('Retry registries',()=>begin(current)));
    if(activity){
      const groups=[['Institutions with NIH-funded projects',activity.grants,'grant'],['Ongoing registered trials',activity.trials.ongoing,'trial'],['Completed registered trials',activity.trials.completed,'trial']];
      for(const [label,group,kind] of groups){
        const box=elt('details',null,'research-group');box.open=kind==='grant';box.append(elt('summary',label+' · '+(group?.rows?.length||0)));
        if(!group?.rows?.length)box.append(elt('p',group?.status==='unavailable'?'The registry could not be checked.':'No qualifying records returned.'));
        if(group?.scope)box.append(elt('p',group.scope,'meta'));
        for(const row of (group?.rows||[]).slice(0,5)){
          const card=elt('div',null,'brief-record');
          const field=kind==='grant'?'institution':'status';
          const evidence={topic:c.topic,[kind==='grant'?'grants':'trials']:group.rows};
          const check=verifyClaim({kind,topic:c.topic,sourceUrl:row.url,field,value:row[field]},evidence);
          card.append(link(row.title,row.url));if(check.status!=='withheld')card.append(elt('p',check.text));
          card.append(elt('small',kind==='grant'?[row.projectId,row.startDate,row.endDate].filter(Boolean).join(' · '):[row.nctId,row.sponsor,...(row.phases||[])].filter(Boolean).join(' · '),'meta'));renderCheck(card,check);box.append(card);
        }
        registry.append(box);
      }
      registry.append(elt('p','Checked '+activity.checkedAt+'. Institutions shown have matching award records. This sample cannot establish a global leadership ranking. Trial completion does not establish clinical benefit.','meta'));
    }
    root.append(registry);
  }
  async function answer(q){
    const c=getContext();if(!c)return null;
    const start=current;
    const award=/\b(grants?|fund(?:ed|ing)|institutions?|award(?:ed|s)?)\b/i.test(q);
    const trial=/\b(ongoing|recruiting|completed|active trials?|clinical trials?)\b/i.test(q);
    const publication=/\b(papers?|publications?|research articles?|studies|literature|systematic reviews?)\b/i.test(q);
    if(!award&&!trial&&!publication)return null;
    const records=[],checks=[],citations=[];
    if(award||trial){
      await activityTask;if(current!==start)return null;
      if(!activity)return {text:'The registry could not be checked. Use Retry registries in the research brief.',citations,checks,deck:7};
      if(activity.snapshot)records.push('Registry snapshot checked '+activity.checkedAt.slice(0,10)+'. Current status may have changed.');
      const items=[];
      if(award)items.push(['NIH-funded award','grant',activity.grants,'institution']);
      if(trial && !/only completed|completed trials?/i.test(q))items.push(['Ongoing registration','trial',activity.trials.ongoing,'status']);
      if(trial && !/only ongoing|recruiting trials?/i.test(q))items.push(['Completed registration','trial',activity.trials.completed,'status']);
      for(const [label,kind,group,field] of items){
        if(!group?.rows?.length){records.push(label+': '+(group?.status==='unavailable'?'lookup unavailable.':'no matching records returned.'));continue}
        for(const row of group.rows.slice(0,3)){
          const evidence={topic:c.topic,[kind==='trial'?'trials':'grants']:group.rows};
          const check=verifyClaim({kind,topic:c.topic,sourceUrl:row.url,field,value:row[field]},evidence);
          if(check.status==='withheld')continue;
          checks.push(check);citations.push(check.citation);records.push(label+' · '+check.text+' · '+row.title);
        }
      }
    }
    if(publication){
      const key=/genet|genealog|heredit|genom|inherit/i.test(q)?'genetics':/treat|medicin|drug|therap/i.test(q)?'treatments':'general';
      await track(key);if(current!==start||focus!==key)return null;
      if(papers?.snapshot)records.push('Publication snapshot checked '+papers.queriedAt.slice(0,10)+'.');
      for(const [i,p] of (papers?.records||[]).entries()){
        const evidence={topic:c.topic,papers:papers.records};
        const check=verifyClaim({kind:'paper',topic:c.topic,sourceUrl:p.url,field:'title',value:p.title},evidence);
        if(check.status==='withheld')continue;
        citations.push(check.citation);checks.push(check);
        let line=(i+1)+'. '+check.text+' · '+p.category+' · '+(p.date||'date unavailable');
        if(p.passage?.text){
          const detail=verifyClaim({kind:'paper',topic:c.topic,field:'abstractExcerpt',sourceUrl:p.url,value:p.passage.text},evidence);
          if(detail.status!=='withheld'){line+='\nAuthor abstract: '+detail.text;checks.push(detail)}
        }
        records.push(line);
      }
      if(!papers?.records?.length)records.push(paperError?'Publication verification was unavailable.':'No papers passed the topic and verification checks.');
    }
    return {deck:7,text:records.join('\n\n'),citations,checks};
  }
  return {sync(){const c=getContext();if(!c)return;if(!current || current!==c.topic){begin(c.topic);return}const key=c.topic+'|'+c.role;if(key!==lastScope){lastScope=key;draw()}},select,track,answer,reset(){controller?.abort();current='';root.replaceChildren()}};
}
