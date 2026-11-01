import test from 'node:test';
import assert from 'node:assert/strict';
import {attachRegistrationStatus} from '../worker/linked-studies.mjs';
test('attach trial status only if the linked registry identity matches',async()=>{
 const id='NCT12345678',url='https://clinicaltrials.gov/study/'+id;
 const rows=[{title:'Published study',registryLinks:[{id,url}]}];
 const fetch=returned=>async()=>Response.json({protocolSection:{identificationModule:{nctId:returned},statusModule:{overallStatus:'COMPLETED'}}});
 const same=await attachRegistrationStatus(rows,null,fetch(id));
 assert.equal(same[0].registryLinks[0].status,'COMPLETED');
 const other=await attachRegistrationStatus(rows,null,fetch('NCT00000000'));
 assert.equal(other[0].registryLinks[0].status,undefined);
 assert.equal(rows[0].registryLinks[0].status,undefined);
});
