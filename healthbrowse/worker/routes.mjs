import {inspectQuery} from '../dist/clinical-engine.js';
import {assessSafety,safetyAnswer} from '../dist/safety-policy.js';
import {browserConfig} from '../server/public-config.mjs';
import {accountAPI} from '../server/account-api.mjs';
import {lookupTerminology,patientEducationForCode} from './terminology.mjs';
import {researchRoute} from './research-routes.mjs';
import {careLookup} from './care.mjs';
import {modelAPI} from '../server/model-api.mjs';
export async function respond(request,env,assets) {
  if(request.cf?.tlsVersion && request.cf.tlsVersion!=='TLSv1.3')
    return new Response('TLS 1.3 is required.',{status:426});
  const url=new URL(request.url);
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=31536000'};
  if(url.pathname==='/healthz'||url.pathname==='/readyz'){
    const ready=Boolean(assets['/index.html']&&assets['/medline-topics.json']&&assets['/app.js']);
    const ok=url.pathname==='/healthz'||ready;
    return Response.json({service:'healthbrowse',status:ok?'ok':'unavailable'},{status:ok?200:503,headers});
  }
  if(url.pathname==='/api/config'){
    return Response.json(browserConfig(env),{headers});
  }
  if(url.pathname.startsWith('/api/ai/'))return modelAPI(request,env,assets);
  if(url.pathname.startsWith('/api/me/')||['/api/feedback','/api/contact'].includes(url.pathname)){
    return accountAPI(request,env);
  }
  if(url.pathname==='/api/care')return careLookup(request,headers);
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
  // Older shared search links used /search?q=... . Preserve the question and
  // load the canonical desk so relative asset paths remain correct.
  if(url.pathname==='/search'||url.pathname==='/search/')return new Response(null,{status:307,headers:{...headers,Location:'/'+url.search}});
  if(url.pathname==='/api/terminology'||url.pathname.startsWith('/api/research/')){
    for(const key of ['term','topic','q','query']){
      const value=url.searchParams.get(key)||'',status=inspectQuery(value);
      if(status==='unsafe')return Response.json({status:'blocked',answer:safetyAnswer(assessSafety(value).category)},{status:422,headers});
      if(status!=='ok')return Response.json({status:'blocked',code:status,error:status==='emergency'?'Seek immediate local emergency help.':'Remove identifying details before searching.'},{status:422,headers});
    }
  }
  if(url.pathname==='/api/terminology'){
    const term=url.searchParams.get('term')||'';
    const result=await lookupTerminology(term,env);
    if(result.canonical && result.rows.length===1 && term.toUpperCase().includes(result.rows[0].code.toUpperCase()))
      result.education=await patientEducationForCode(result.rows[0]);
    return Response.json(result,{headers});
  }
  if(url.pathname.startsWith('/api/research/'))return researchRoute(url,assets,headers);
  if(url.pathname==='/api/profile')return Response.json({readingModes:2,labels:['General','Clinicians']},{headers});
  if(url.pathname==='/api/clinical-lens'){
    const tier=Number(url.searchParams.get('tier'));
    if(!Number.isInteger(tier)||tier<3||tier>5)return new Response('Unknown reading mode.',{status:400,headers});
    const lenses={
      3:['Classify the condition.','Distinguish screening from diagnosis.','Appraise the study design.','Check dataset access and modality.','Consider inheritance and risk.','Connect mechanism to symptoms and treatment.','Inspect registry provenance.'],
      4:['Review terminology and training.','Check test limitations.','Inspect the guideline population.','Assess dataset validity.','Check risk-model applicability.','Compare treatment classes and monitoring.','Verify provider and specialty.'],
      5:['Inspect ontology definitions.','Compare identification methods.','Assess study bias and uncertainty.','Review benchmark leakage and licensing.','Review genetic associations and calibration.','Separate mechanistic hypotheses from clinical effects.','Distinguish registry data from inventory.']
    };
    return Response.json({tier,lenses:lenses[tier]},{headers});
  }
  const path=url.pathname==='/'?'/index.html':url.pathname;
  const file=assets[path];
  if(!Object.hasOwn(assets,path))return new Response('Page unavailable.',{status:404,headers});
  if(file.type?.startsWith('text/html')){
    const origin=browserConfig(env).supabaseUrl;
    headers['Content-Security-Policy']=[
      "default-src 'self'","script-src 'self'","style-src 'self'","img-src 'self' data:",
      "connect-src 'self' https://www.ebi.ac.uk"+(origin?' '+origin:''),
      "object-src 'none'","base-uri 'none'","form-action 'self'","frame-ancestors 'self'"
    ].join('; ');
  }
  return new Response(request.method==='HEAD'?null:file.base64?Uint8Array.from(atob(file.text),c=>c.charCodeAt(0)):file.text,{headers:{...headers,'Content-Type':file.type}});
}
