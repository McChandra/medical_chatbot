// Keyset pagination keeps the Worker memory bounded and never crosses owners.
export function workspaceExport(db,owner,profile,settings){
 const encoder=new TextEncoder();
 async function* content(){
  yield '{"format":"healthbrowse-research-export-v1","exportedAt":'+JSON.stringify(new Date().toISOString())+',"profile":'+JSON.stringify(profile)+',"settings":'+JSON.stringify(settings);
  const tables=[
   ['chats','SELECT id,title,topic,reading_mode,created_at,updated_at FROM hb_chats WHERE user_id=? AND id>? ORDER BY id LIMIT 50'],
   ['messages','SELECT t.id,t.chat_id,t.turn_json,t.created_at FROM hb_chat_turns t JOIN hb_chats c ON c.id=t.chat_id WHERE c.user_id=? AND t.id>? ORDER BY t.id LIMIT 50'],
   ['bookmarks','SELECT id,topic,kind,title,url,created_at FROM hb_bookmarks WHERE user_id=? AND id>? ORDER BY id LIMIT 50'],
   ['researchActivity','SELECT id,topic,kind,section,created_at FROM hb_research_history WHERE user_id=? AND id>? ORDER BY id LIMIT 50']
  ];
  for(const [name,query] of tables){
   yield ','+JSON.stringify(name)+':[';let cursor='',first=true;
   while(true){
    const rows=(await db.prepare(query).bind(owner,cursor).all()).results;
    for(const row of rows){const item=name==='messages'?{id:row.id,chatId:row.chat_id,savedAt:row.created_at,...JSON.parse(row.turn_json)}:row;yield (first?'':',')+JSON.stringify(item);first=false;cursor=row.id;}
    if(rows.length<50)break;
   }
   yield ']';
  }
  yield ',"complete":true}';
 }
 const iterator=content();
 const stream=new ReadableStream({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value))}catch(error){controller.error(error)}},async cancel(){await iterator.return()}});
 return new Response(stream,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="healthbrowse-research-data.json"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
