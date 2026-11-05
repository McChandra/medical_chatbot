import {accountRequest,getAccessToken} from './account-client.js';

// This activity endpoint stores topic references; saved conversations use chat-history.js.
export async function recordTopic(topic,kind,section=1){
  try{
    if(!sessionStorage.getItem('hb-supabase-session') || !await getAccessToken())return;
    const {settings}=await accountRequest('/api/me/settings');
    if(settings?.saveHistory)await accountRequest('/api/me/history',{method:'POST',body:{topic,kind,section}});
  }catch{} // A personal-service outage cannot block a public search.
}
export function saveControls(topic){
  const group=document.createElement('div');group.className='guide-actions';
  const notice=document.createElement('span');notice.setAttribute('role','status');notice.className='meta';
  for(const kind of ['bookmark','favourite']){
    const button=document.createElement('button');button.type='button';button.className='act';
    button.textContent=kind==='bookmark'?'Bookmark topic':'Add to favourites';
    button.onclick=async()=>{
      button.disabled=true;notice.replaceChildren();
      try{
        if(!await getAccessToken())throw new Error('Sign in first to save this topic.');
        await accountRequest('/api/me/saved',{method:'POST',body:{topic,kind,title:topic,url:''}});
        notice.textContent='Saved to your '+(kind==='bookmark'?'bookmarks.':'favourites.');
      }catch(error){
        notice.textContent=error.message+' ';
        const link=document.createElement('a');link.href='/account.html';link.textContent='Account & help';notice.append(link);
      }finally{button.disabled=false}
    };
    group.append(button);
  }
  group.append(notice);return group;
}
