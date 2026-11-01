import test from 'node:test';
import assert from 'node:assert/strict';
import {getResearchActivity} from '../worker/research.mjs';
const grant={is_active:true,appl_id:111,activity_code:'R01',project_num:'1R01CA123456-01',core_project_num:'R01CA123456',
  budget_start:'2000-01-01T00:00:00',budget_end:'2099-01-01T00:00:00',project_title:'Leukemia and treatment response',
  organization:{org_name:'Example Research University'},agency_ic_admin:{name:'Example Grant Agency'}};
function trial(status,id='NCT12345678'){
  return {hasResults:false,protocolSection:{identificationModule:{nctId:id,briefTitle:'Research program'},
    statusModule:{overallStatus:status,completionDateStruct:{date:'2099-01',type:'ESTIMATED'}},
    conditionsModule:{conditions:['Acute myeloid leukemia']},designModule:{phases:['PHASE2']},
    sponsorCollaboratorsModule:{leadSponsor:{name:'Example Research University'}}}};
}
test('requires a current topic-matching grant-type award and independently verifies both trial cohorts',async()=>{
  const calls=[];
  const mock=async(url,init)=>{
    const u=new URL(url);calls.push(u.hostname);
    if(u.hostname==='api.reporter.nih.gov'){
      assert.equal(init.method,'POST');assert.equal(JSON.parse(init.body).criteria.advanced_text_search.search_text,'Leukemia');
      return Response.json({results:[{...grant,is_active:false},{...grant,budget_end:'2001-12-01'},
        {...grant,budget_start:'2098-01-01'},{...grant,activity_code:'N01'},{...grant,project_title:'An unrelated study'},
        {...grant,organization:{}},grant,{...grant,appl_id:222}]});
    }
    const completed=u.searchParams.get('filter.overallStatus')==='COMPLETED';
    return Response.json({studies:[trial('WITHDRAWN'),trial(completed?'COMPLETED':'RECRUITING'),trial('RECRUITING')]});
  };
  const out=await getResearchActivity('Leukemia',mock);
  assert.equal(calls.length,3);
  assert.equal(out.grants.status,'ok');assert.equal(out.grants.rows.length,1);
  assert.equal(out.grants.rows[0].url,'https://reporter.nih.gov/project-details/111');
  assert.equal(out.grants.rows[0].institution,'Example Research University');
  assert.equal(out.trials.ongoing.rows.length,1);assert.equal(out.trials.ongoing.rows[0].status,'RECRUITING');
  assert.equal(out.trials.completed.rows.length,1);assert.equal(out.trials.completed.rows[0].resultsPosted,false);
});
test('distinguishes missing results and registry outages without suppressing independent cohorts',async()=>{
  const mock=async url=>{const u=new URL(url);
    if(u.hostname==='api.reporter.nih.gov')throw Error('source unavailable');
    return u.searchParams.get('filter.overallStatus')==='COMPLETED'?Response.json({studies:[]}):Response.json({unexpected:true});
  };
  const result=await getResearchActivity('Leukemia',mock);
  assert.equal(result.grants.status,'unavailable');assert.equal(result.trials.completed.status,'empty');
  assert.equal(result.trials.ongoing.status,'unavailable');
  await assert.rejects(getResearchActivity('Jane@example.com',mock),/public medical topic/);
});
