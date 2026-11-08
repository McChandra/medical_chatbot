export {readingRoles as readingModes,normalizeReadingRole,readingLabel} from './reading-profiles.js';
export function validPassword(password){
  return Array.from(password).length>=12&&new TextEncoder().encode(password).length<=72;
}
export function suggestedPassword(){
  const sets=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghjkmnpqrstuvwxyz','23456789','!@#%+=-'];
  const pick=max=>{const byte=new Uint8Array(1),limit=256-(256%max);do{crypto.getRandomValues(byte)}while(byte[0]>=limit);return byte[0]%max};
  const all=sets.join(''),chars=sets.map(set=>set[pick(set.length)]);
  while(chars.length<24)chars.push(all[pick(all.length)]);
  for(let i=chars.length-1;i>0;i--){const j=pick(i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}
  return chars.join('');
}
export function researchUrl(topic,section){
  const query=new URLSearchParams({topic});
  if(Number.isInteger(section)&&section>=1&&section<=7)query.set('section',String(section));
  return '/?'+query;
}
