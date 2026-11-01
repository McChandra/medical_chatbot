// An article can cite a trial without being the final report for that trial.
export async function attachRegistrationStatus(records,signal,fetchImpl=fetch){
  const ids=[...new Set(records.flatMap(p=>(p.registryLinks||[]).map(r=>r.id)))].filter(id=>/^NCT\d{8}$/.test(id)).slice(0,5);
  const entries=await Promise.all(ids.map(async id=>{
    try{
      const response=await fetchImpl('https://clinicaltrials.gov/api/v2/studies/'+id,{signal});
      if(!response.ok)return null;
      const item=(await response.json()).protocolSection;
      if(item?.identificationModule?.nctId!==id||!item.statusModule?.overallStatus)return null;
      return [id,{status:item.statusModule.overallStatus,checkedAt:new Date().toISOString()}];
    }catch{return null}
  }));
  const statuses=new Map(entries.filter(Boolean));
  return records.map(p=>({...p,registryLinks:(p.registryLinks||[]).map(link=>({...link,...statuses.get(link.id)}))}));
}
