import test from 'node:test';
import assert from 'node:assert/strict';
import {careLookup} from '../worker/care.mjs';
const req=(data)=>new Request('https://example.test/api/care',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const loc={address_purpose:'LOCATION',country_code:'US',address_1:'Example Ave',city:'NEW YORK',state:'NY',postal_code:'100011234'};
const row={number:'1234567890',enumeration_type:'NPI-2',basic:{organization_name:'Fixture organization',status:'A'},taxonomies:[{code:'333600000X',desc:'Pharmacy'}],addresses:[{...loc,address_purpose:'MAILING'},loc]};
test('requires valid coarse location before sending any lookup',async()=>{
  for(const data of [{kind:'hospital'},{kind:'hospital',state:'NY'},{kind:'hospital',postal:'abc'},{kind:'general',postal:'10001'}]){
    const res=await careLookup(req(data),{},()=>{throw Error('Unexpected upstream request')});
    assert.equal(res.status,400);
  }
});
test('forwards only location and taxonomy, verifies matching practice addresses and organization taxonomy',async()=>{
  const res=await careLookup(req({kind:'pharmacy',postal:'10001',topic:'Ignored private words'}),{},async(url,options)=>{
    assert.equal(url.hostname,'npiregistry.cms.hhs.gov');assert.equal(url.searchParams.get('address_purpose'),'LOCATION');assert.equal(url.searchParams.get('taxonomy_description'),'Pharmacy');
    assert.equal(url.searchParams.has('topic'),false);assert.equal(options.headers.Cookie,undefined);
    return Response.json({result_count:5,results:[row,{...row,basic:{status:'D'}},{...row,addresses:[{...loc,address_purpose:'MAILING'}]},
      {...row,addresses:[{...loc,postal_code:'90210'}]},{...row,taxonomies:[{code:'208000000X'}]}]});
  });
  assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'private, no-store');
  const {rows}=await res.json();assert.equal(rows.length,1);assert.equal(rows[0].npi,row.number);assert.match(rows[0].source,/provider-view\/1234567890$/);
});
test('distinguishes no directory matches from upstream errors',async()=>{
  const query=req({kind:'hospital',state:'NY',city:'New York'});
  const res=await careLookup(query.clone(),{},async()=>Response.json({result_count:0}));
  assert.deepEqual((await res.json()).rows,[]);
  assert.equal((await careLookup(query,{},async()=>Response.json({Errors:[{}]}))).status,502);
});
