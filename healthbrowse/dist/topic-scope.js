import {resolveSearch} from './discovery.js';
import {correctSpelling} from './medcard.js';
const researchTerms=new Set(['genetics','clinical trials','medical research','research','medicines','drugs','drug therapy','health information','blood','blood tests','treatments','symptoms','genes','chromosomes','drug reactions','laboratory tests','diagnostic tests','fever','pain','side effects']);
export function newSubjects(question,index,currentTopic){
  const matches=resolveSearch(correctSpelling(question),index).choices;
  return matches.filter(name=>name.toLowerCase()!==currentTopic.toLowerCase()&&!researchTerms.has(name.toLowerCase()));
}
export function inScopeChoices(choices){
  const specific=choices.filter(t=>!researchTerms.has(t.toLowerCase()));
  return specific.length?specific:choices;
}
