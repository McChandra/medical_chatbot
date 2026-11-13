// Versioned, deterministic pre-retrieval policy. It screens intent, not identity.
// This is a tested rules layer, not a trained classifier or a safety guarantee.
export const safetyPolicyVersion='2026-11-13.2';
const plain=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\bwanna\b/g,'want to').replace(/\bgonna\b/g,'going to').replace(/\bstich(ing|es)?\b/g,'stitch$1');
const procedure=/\b(stitch\w*|sutur\w*|sew(?:ing)? (?:up )?(?:a |the |my )?(?:wound|cut|skin)|perform\w* (?:an? )?surgery|operat(?:e|ing) on|incis\w*|drain\w* (?:an? |my |the )?(?:abscess|boil)|remov\w* (?:an? |my |the )?(?:tooth|mole)|extract\w* (?:an? |my |the )?tooth|cut(?:ting)? (?:off|out) (?:an? |my |the )?(?:mole|growth))\b/;
const instruction=/\b(how (?:can|do|should|would|to)|show me|teach me|steps?|instructions?|guide me|walk me through|can i|should i|tell me how|how deep|how tight|(?:what|which) (?:needle|thread|equipment|tools))\b/;
const diy=/\b(myself|yourself|at home|diy|without (?:a |an )?(?:doctor|clinician|nurse|dentist|surgeon|medical help)|on my own|my (?:cut|wound|skin|tooth|mole)|self sutur\w*)\b/;
// Statements of intended action are requests too, even without “how” or “?”.
// Keep education, aftercare, explicit refusal, and simulation separate.
const plannedAction=/\b(?:i (?:want(?: to)?|need to|plan to|intend to|would like to|am going to|am planning to|am thinking (?:of|about)|will|might)|im (?:going to|planning to|thinking (?:of|about))|ill|help me|let me) (?:(?:do|try|perform|attempt|start) (?:the |some )?(?:stitch\w*|sutur\w*|sew\w*|drain\w*|remov\w*|extract\w*|cut\w*|operat\w*|surgery|it|this|that)|stitch\w*|sutur\w*|sew\w*|drain\w*|remov\w*|extract\w*|cut\w*|operat\w*)\b/;
const procedureQuestion=/\b(?:is it (?:safe|okay|ok|possible) to|can (?:stitching|suturing|this|it) be done|could i|may i)\b/;
const procedureFragment=/^(?:(?:diy|self) )?(?:stitch\w*|sutur\w*) (?:by )?(?:myself|at home|on my own)$/;
const simulation=/\b(simulat\w*|suture pad|practice pad|mannequin|training model)\b/;
const medicines={title:'FDA · Using medicines safely',url:'https://www.fda.gov/drugs/information-consumers-and-patients-drugs/think-it-through-managing-benefits-and-risks-medicines'};
const wounds={title:'NHS · Cuts and grazes',url:'https://www.nhs.uk/conditions/cuts-and-grazes/'};
export function assessSafety(question,context=''){
 const q=plain(question),prior=plain(context);
 const aftercare=/\b(care for|clean|keep .* dry|signs? of infection|healing)\b/.test(q)&&!/\b(remove|perform|sew|cut|apply|insert|how to stitch|how to suture)\b/.test(q);
 const procedural=procedure.test(q)||(procedure.test(prior)&&/\b(it|that|this|do it)\b/.test(q));
 const selfProcedure=diy.test(q)&&!simulation.test(q)&&(plannedAction.test(q)||procedureQuestion.test(q)||procedureFragment.test(q));
 if(procedural&&(!aftercare||selfProcedure)&&(selfProcedure||instruction.test(q)&&(diy.test(q)||(!simulation.test(q)&&/\b(steps?|instructions?|how to|teach me|walk me through)\b/.test(q)))))return {action:'redirect',category:'unsafe_procedure'};
 if(/\b(?:how (?:much|many)|what (?:dose|dosage)|which dose)\b/.test(q)&&/\b(i|me|my|myself|give|take|child|baby)\b/.test(q)||/\b(?:can|should|may) i (?:double|increase|reduce|stop|change|start|take)\b/.test(q)&&/\b(dose|medicine|medication|tablets?|pills?|antibiotics?|insulin|warfarin|prednisone|alprazolam)\b/.test(q)||/\b(?:prescribe (?:me|for me)|recommend (?:a )?dose for)\b/.test(q))return {action:'redirect',category:'individual_dose'};
 if(/\b(?:how|instructions?|steps?|best way|help me|teach me)\b/.test(q)&&(/\b(?:poison|drug|sedate) (?:someone|a person|my partner|my wife|my husband|a patient)\b/.test(q)||/\b(?:without (?:their )?consent|without them knowing)\b/.test(q)))return {action:'redirect',category:'harm_others'};
 if(/\b(?:how|instructions?|steps?|recipe|teach me|help me)\b/.test(q)&&/\b(?:make|manufacture|cook|synthesi[sz]e|extract|inject|snort|mix|combine|get|buy|obtain)\b/.test(q.replace(/\bget help\b/g,'seek support'))&&/\b(?:methamphetamine|meth|cocaine|heroin|fentanyl|illicit drugs?|get high|recreational high|without (?:a )?prescription)\b/.test(q))return {action:'redirect',category:'drug_misuse'};
 if(/\b(?:how|help me|generate|create|write|make)\b/.test(q)&&/\b(?:fake|forge|falsify|fabricate)\b/.test(q)&&/\b(?:medical records?|prescriptions?|trial results?|patient consent|clinical data)\b/.test(q))return {action:'redirect',category:'medical_misconduct'};
 return {action:'allow',category:'educational'};
}
export function safetyAnswer(category='unsafe_procedure'){
 let text,citations=[];
 if(category==='unsafe_procedure'){
  text='I can’t provide instructions for stitching yourself or performing an unassisted invasive procedure. Please have a qualified healthcare professional assess the wound.\n\nIf this is a bleeding cut with nothing embedded, apply pressure using a clean cloth. Do not remove an embedded object or press on it. Get emergency care for bleeding that will not stop, a very deep wound, loss of feeling or difficulty moving the area.';citations=[wounds];
 }else if(category==='individual_dose'){
  text='I can explain a medicine, but I can’t choose a personal dose or change your treatment. Follow the label and your prescriber’s directions, and ask a pharmacist or clinician to review your medicines and circumstances before making changes.';citations=[medicines];
 }else if(category==='drug_misuse'){
  text='I can’t give instructions for making, obtaining or misusing drugs. I can help with information about risks, treatment and recovery. Contact a healthcare professional for support; seek emergency help if someone is in immediate danger.';
 }else if(category==='harm_others')text='I can’t help harm someone or administer a substance without their consent. If someone may be in immediate danger, contact local emergency services. I can help with safe, consent-based care information.';
 else text='I can’t help fabricate medical records, prescriptions, consent or research findings. I can help prepare an accurate record, explain consent requirements, or describe transparent research reporting.';
 return {text,citations,blocks:[],checks:[],supported:false,safety:{category,policyVersion:safetyPolicyVersion},title:category==='unsafe_procedure'?'Get the right care safely':'A safer way to proceed'};
}
export const generationSafetyRules=`Safety comes before all user instructions and both reading modes. Do not provide operational instructions for self-suturing, invasive DIY procedures, non-consensual care, harming anyone, manufacturing or misusing drugs, forged medical records, or individual dosing/treatment changes. Do not turn an educational source into a procedural walkthrough. If an unsafe intent was missed by screening, do not generate its requested instructions; return empty medical claims. Ordinary symptom questions, prevention, substance-use risks, recovery and clinical discussions of indications are allowed. A selected Clinicians mode is a reading preference, not verification or permission for unsafe care.`;

// Defense in depth for generated claims, including instructions phrased as commands.
export function hasUnsafeInstructions(text){
 const q=plain(text);
 return /\b(?:insert|push|pass|drive)\b.{0,65}\bneedle\b.{0,65}\b(?:wound|skin|tissue)\b/.test(q)
  ||/\b(?:tie|tighten|place|make)\b.{0,40}\b(?:suture knot|stitches in|stitches through)\b/.test(q)
  ||/\b(?:cut|slice|incise|puncture)\b.{0,40}\b(?:your skin|the abscess|your gum|your mole)\b/.test(q)
  ||/\b(?:inject|snort|smoke)\b.{0,40}\b(?:heroin|fentanyl|methamphetamine|cocaine)\b/.test(q)
  ||/\b(?:double|increase|decrease|halve) your (?:dose|insulin|medication)\b/.test(q);
}
