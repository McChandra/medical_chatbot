// Software/coverage checks and review suggestions, not a medical-certification bot.
const textOf=s=>s?.blocks?.map(b=>b.text).join(' ')||s?.text||'';
export function auditResponse(testCase,role,status,result,elapsedMs){
 const findings=[];
 const add=(severity,check,detail,suggestion)=>findings.push({severity,check,detail,suggestion});
 if(testCase.expectedCode){
  if(status!==422||result.code!==testCase.expectedCode)add('error','safety-interceptor','Expected '+testCase.expectedCode+' before inference.','Repair the privacy/emergency admission path before release.');
  return {passed:!findings.length,findings};
 }
 if(status!==200||result.status!=='generated'){
  const provider=/provider_busy|rate_limited/.test(result.code||'');
  add('error',provider?'provider-capacity':'response-availability',result.code||'HTTP '+status,provider?'Review provider allowance and request spacing; this is an infrastructure failure, not evidence of model hallucination.':'Inspect the gateway/provider error and restore a complete response.');
  return {passed:false,findings};
 }
 if(!textOf(result.answer).trim())add('error','direct-answer','The answer is empty.','Always render a direct answer or a clear evidence-gap message.');
 if(!result.answer?.generation)add('review','generated-answer','Only a source excerpt or gap was returned.','Inspect retrieval coverage and withheld claims; do not label excerpts as AI synthesis.');
 const ids=(result.decks||[]).map(d=>d.id).sort((a,b)=>a-b);
 if(testCase.mode==='search'&&ids.join()!=='1,2,3,4,5,6')add('error','six-decks','Deck IDs: '+ids.join(),'Return all six clinical domains exactly once.');
 if(testCase.mode==='chat'&&ids.length)add('error','buddy-focus','Buddy repeated the deck array.','Return the requested follow-up without repeating the browser workspace.');
 for(const section of [result.answer,...(result.decks||[])].filter(Boolean)){
  const name=section.id?'Deck '+section.id:'Direct answer';
  if(!textOf(section).trim())add('error','empty-section',name+' is empty.','Show an explanation or explicit source gap.');
  if(section.id&&!section.generation)add('review','deck-coverage',name+' used an excerpt or gap.','Inspect available sources for this domain before adding more generated detail.');
  for(const block of section.blocks||[]){
   if(section.generation&&!block.references?.length)add('error','missing-citation',name+' has an uncited generated block.','Withhold the claim until it has a supporting source.');
   for(const ref of block.references||[]){
    let valid=false;try{const u=new URL(ref.url);valid=u.protocol==='https:'&&!u.username&&!u.password;}catch{}
    if(!valid||!ref.id||!ref.quote||!ref.text?.includes(ref.quote))add('error','source-integrity',name+' contains an invalid citation or quotation.','Resolve URLs and quotations from server-owned evidence.');
    if(!ref.date)add('review','source-date',name+' has no source date.','Display a verified publication date or explicitly labeled snapshot date.');
   }
   if(section.generation&&!/[.!?]["”’)]?$/.test(block.text.trim()))add('error','unfinished-answer',name+' contains an unfinished sentence.','Avoid hard text truncation and reject incomplete model output.');
  }
 }
 const answer=textOf(result.answer).toLowerCase();
 for(const facet of testCase.facets||[])if(!facet.terms.some(t=>answer.includes(t)))add('review','question-coverage','Direct answer may miss: '+facet.name+'.','Review this facet semantically and add supported information or explicitly state the evidence gap.');
 if(role==='General'&&/\b(hematopoiesis|cytopenia|clonal|immunophenotyp|etiopathogenesis|myeloblast)\b/i.test(answer)&&!/(?:means|called|which|a type of|immature)/i.test(answer))add('review','plain-language','Possible unexplained clinical terminology.','Define unfamiliar terms in ordinary language for General users.');
 if(role==='Clinicians'&&answer.split(/\s+/).length<25)add('review','clinical-depth','The clinician answer is very short.','Add source-supported diagnostic or mechanistic context appropriate to the question.');
 const deckTexts=(result.decks||[]).map(textOf).map(s=>s.trim().toLowerCase());
 if(deckTexts.some(s=>s&&s===answer.trim()))add('review','repetition','A deck exactly repeats the overview.','Use the deck to expand its clinical domain rather than duplicate the direct answer.');
 if(elapsedMs>30000)add('review','latency','Response took '+Math.round(elapsedMs/1000)+' seconds.','Investigate provider timing, source budget and capacity. Keep progress and cancellation visible.');
 return {passed:!findings.some(f=>f.severity==='error'),findings};
}
export function compareModes(records){
 const findings=[];
 for(const general of records.filter(r=>r.role==='General'&&!r.testCase.expectedCode)){
  const clinician=records.find(r=>r.role==='Clinicians'&&r.testCase.id===general.testCase.id);
  const a=textOf(general.result?.answer),b=textOf(clinician?.result?.answer);
  if(a&&a===b)findings.push({severity:'review',case:general.testCase.id,check:'audience-difference',detail:'The two modes returned identical direct answers.',suggestion:'Inspect role prompting and evidence depth; similar answers may be appropriate for a simple fact, but clinical questions need appropriate detail.'});
 }
 return findings;
}
export function reportMarkdown(report){
 const lines=['# HealthBrowse QA bot report','',`Run: ${report.createdAt}`,`Execution: ${report.execution}`,'',`Software checks passed: ${report.summary.passed}/${report.records.length}. Review suggestions: ${report.summary.reviewFindings}.`,'','These are automated software, citation-integrity and coverage checks. A pass is not clinical certification. Coverage keywords are prompts for human review, not proof of medical correctness.','','| Case | Mode | Status | Time | Findings |','| --- | --- | --- | --- | --- |'];
 for(const r of report.records)lines.push(`| ${r.testCase.id} | ${r.role} | ${r.audit.passed?'Pass':'Fail'} | ${(r.elapsedMs/1000).toFixed(1)}s | ${r.audit.findings.length} |`);
 for(const r of report.records)for(const f of r.audit.findings)lines.push('',`## ${r.testCase.id} · ${r.role} · ${f.check}`,`${f.severity.toUpperCase()}: ${f.detail}`,`Suggested change: ${f.suggestion}`);
 for(const f of report.comparisons)lines.push('',`## ${f.case} · ${f.check}`,f.detail,`Suggested change: ${f.suggestion}`);
 return lines.join('\n')+'\n';
}
