// These are source organizations with different mandates. Presence in this
// directory records publisher identity; it does not certify a claim or study.
export const authorities=[
  {name:'National Library of Medicine',scope:'Patient education, biomedical literature and terminology services.',url:'https://www.nlm.nih.gov/',domains:['nlm.nih.gov','medlineplus.gov']},
  {name:'National Cancer Institute',scope:'Cancer education, clinical studies and research resources.',url:'https://www.cancer.gov/',domains:['cancer.gov']},
  {name:'National Institute of Diabetes and Digestive and Kidney Diseases',scope:'Education and research on diabetes, digestive and kidney diseases.',url:'https://www.niddk.nih.gov/',domains:['niddk.nih.gov']},
  {name:'National Institute of Neurological Disorders and Stroke',scope:'Neurological disorders and stroke research and education.',url:'https://www.ninds.nih.gov/',domains:['ninds.nih.gov']},
  {name:'National Heart, Lung, and Blood Institute',scope:'Heart, lung, blood and sleep disorder research and education.',url:'https://www.nhlbi.nih.gov/',domains:['nhlbi.nih.gov']},
  {name:'Centers for Disease Control and Prevention',scope:'US public health surveillance, prevention and education.',url:'https://www.cdc.gov/',domains:['cdc.gov']},
  {name:'US Food and Drug Administration',scope:'US regulatory decisions, approved labeling and drug safety information.',url:'https://www.fda.gov/',domains:['fda.gov']},
  {name:'World Health Organization',scope:'International public health guidance and disease classification.',url:'https://www.who.int/',domains:['who.int']},
  {name:'National Institute for Health and Care Excellence',scope:'Evidence-based health and care guidance for England.',url:'https://www.nice.org.uk/',domains:['nice.org.uk']},
  {name:'National Health Service',scope:'Patient education and health service directories for England.',url:'https://www.nhs.uk/',domains:['nhs.uk']}
];
export function authorityFor(value){
  try{
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
    return authorities.find(a=>a.domains.some(domain=>url.hostname===domain || url.hostname.endsWith('.'+domain))) || null;
  }catch{return null}
}
