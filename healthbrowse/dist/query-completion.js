// Local completion of search text only: no model call, search, or saved history.
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ').trim();
const questions=name=>[
 `What is ${name}?`, `What are the symptoms of ${name}?`, `What causes ${name}?`,
 `How is ${name} diagnosed?`, `How is ${name} treated?`, `What should I know about ${name}?`
];
export function createQuerySuggestions(records){
 const seen=new Set(),topics=[];
 for(const record of records){
  const name=record.name||record.title;if(typeof name!=='string'||!name.trim()||seen.has(normalize(name)))continue;
  seen.add(normalize(name));topics.push({name,aliases:[name,...(record.aliases||[])].filter(s=>typeof s==='string').map(normalize)});
 }
 const candidates=topics.flatMap(topic=>questions(topic.name).map((text,i)=>({text,keys:topic.aliases.map(alias=>normalize(questions(alias)[i]))})));
 return value=>{
  const query=normalize(value);if(query.length<2||query.length>300||/[?.!]$/.test(query))return [];
  const direct=candidates.filter(c=>c.keys.some(key=>key.startsWith(query))).slice(0,5).map(c=>c.text);
  if(direct.length)return [...new Set(direct)];
  // Preserve the first-person prefix, and never drop extra symptoms or details.
  const prefix=String(value).match(/^(?:i have (?:a |an )?|i am experiencing |tell me about )/i);
  const fragment=normalize(prefix?String(value).slice(prefix[0].length):value);
  if(fragment.length<2)return [];
  const matches=topics.filter(t=>t.aliases.some(alias=>alias.startsWith(fragment)||alias.split(' ').some((_,i,words)=>words.slice(i).join(' ').startsWith(fragment)))).slice(0,5);
  if(prefix)return matches.map(t=>prefix[0]+t.name+(prefix[0].toLowerCase().startsWith('tell')?'?':'. What could cause it?'));
  return matches.flatMap(t=>questions(t.name)).slice(0,5);
 };
}
// Tab completes once; Shift+Tab and Tab with no suggestions keep native navigation.
export function completionKey(event,count,active){
 if(event.isComposing||event.ctrlKey||event.altKey||event.metaKey||!count)return null;
 if(event.key==='Tab'&&!event.shiftKey)return {accept:Math.max(0,active)};
 if(event.key==='ArrowDown')return {active:(active+1)%count};
 if(event.key==='ArrowUp')return {active:active<0?count-1:(active-1+count)%count};
 if(event.key==='Enter'&&active>=0)return {accept:active};
 if(event.key==='Escape')return {close:true};
 return null;
}
export function attachQueryCompletion({input,popup,list,status,form,suggest}){
 const doc=input.ownerDocument;let items=[],active=-1,composing=false;
 function close(){items=[];active=-1;popup.hidden=true;list.replaceChildren();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');status.textContent='';}
 function highlight(){
  Array.from(list.children).forEach((option,i)=>option.setAttribute('aria-selected',String(i===active)));
  if(active>=0){input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}
  else input.removeAttribute('aria-activedescendant');
 }
 function accept(index){
  const text=items[index];if(!text)return;
  input.value=text;close();input.focus({preventScroll:true});input.setSelectionRange(text.length,text.length);
  input.dispatchEvent(new Event('input',{bubbles:true}));close();status.textContent='Suggestion completed. Press Enter to search.';
 }
 function refresh(){
  if(composing||input.selectionStart!==input.value.length||input.selectionEnd!==input.value.length){close();return;}
  items=suggest(input.value);active=-1;list.replaceChildren();
  if(!items.length){close();return;}
  items.forEach((text,i)=>{
   const option=doc.createElement('button');option.type='button';option.tabIndex=-1;option.id='query-option-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.textContent=text;
   // Keep input focus until click, including touch/pen selection.
   option.addEventListener('pointerdown',event=>event.preventDefault());
   option.addEventListener('click',()=>accept(i));list.append(option);
  });
  popup.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');status.textContent=items.length+' suggestions. Press Tab to complete, or use arrow keys to choose.';
 }
 input.addEventListener('input',refresh);
 input.addEventListener('focus',refresh);
 input.addEventListener('click',refresh);
 input.addEventListener('compositionstart',()=>{composing=true;close()});
 input.addEventListener('compositionend',()=>{composing=false;refresh()});
 input.addEventListener('keydown',event=>{
  if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||input.selectionStart!==input.value.length||input.selectionEnd!==input.value.length){close();return;}
  const action=completionKey(event,items.length,active);if(!action)return;
  event.preventDefault();if(action.close)close();else if(action.accept!==undefined)accept(action.accept);else{active=action.active;highlight();}
 });
 input.addEventListener('blur',event=>{if(!popup.contains(event.relatedTarget))close()});
 doc.addEventListener('pointerdown',event=>{if(event.target!==input&&!popup.contains(event.target))close()});
 form.addEventListener('submit',close);
 return {close,refresh};
}
