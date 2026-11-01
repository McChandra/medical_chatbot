// Public research topics only. Never forward a free-text clinical query upstream.
const topicTerms = new Map(Object.entries({
  'breast cancer': [], 'prostate cancer': [], 'stroke': [], 'skin cancer': [],
  "alzheimer's disease": ['Alzheimer disease'], 'colorectal cancer': [],
  'lung cancer': [], 'high blood cholesterol': ['hypercholesterolemia'],
  'heart attack': ['myocardial infarction'], 'heart failure': [],
  'high blood pressure': ['hypertension'], "parkinson's disease": ['Parkinson disease'],
  'leukemia': ['leukaemia'], 'osteoporosis': [], 'shingles': ['herpes zoster'],
  'diabetes': ['diabetic'], 'age-related macular degeneration': [],
  'hemochromatosis': ['haemochromatosis'], 'diabetic retinopathy': [], 'psoriasis': []
}));
export const evidenceTypes = [
  'Practice Guideline', 'Guideline', 'Consensus Development Conference', 'Systematic Review',
  'Meta-Analysis', 'Randomized Controlled Trial', 'Clinical Trial', 'Observational Study'
];
const matchText = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hasTerm = (value, term) => (' ' + matchText(value) + ' ').includes(' ' + matchText(term) + ' ');
const notices = /retract|erratum|corrigend|correct(?:ion|ed and republished)|expression\s*of\s*concern|withdrawn|withdrawal/i;
const rankingVersion = 'epmc-title-design-v2';
const homonyms = new Map([
  ['high blood pressure', /(?:pulmonary(?: arterial)?|portal|intracranial|ocular|intraocular|intraperitoneal) hypertension/gi],
  ['stroke', /(?:heat|swimming|swim|golf) stroke/gi],
  ['diabetes', /diabetes insipidus/gi]
]);

function flagged(row) {
  const types = row.pubTypeList?.pubType ?? [];
  return notices.test(types.join(' ')) ||
    /^(?:\[?retract|erratum|corrigendum|correction\s*[:(]|correction to|expression of concern|withdrawn)/i.test(row.title ?? '') ||
    (row.commentCorrectionList?.commentCorrection ?? []).some(link => notices.test(link.type));
}

export function rankEvidence(rows, terms, queriedAt, query) {
  // If two entries share an identifier, an integrity notice on either suppresses both.
  const keys = row => [row.pmid || row.id, row.doi?.trim().toLowerCase()].filter(Boolean);
  const excluded = new Set(rows.filter(flagged).flatMap(keys));
  const candidates = [];
  for (const row of rows) {
    const pmid = String(row.pmid || row.id || '');
    if (row.source !== 'MED' || !/^[1-9]\d*$/.test(pmid) || keys(row).some(id => excluded.has(id))) continue;
    const title = String(row.title ?? '').replace(/<[^>]*>/g, '').trim();
    const competingCondition = homonyms.get(terms[0]);
    const eligibleTitle = competingCondition ? title.replace(competingCondition, '') : title;
    if (!terms.some(term => hasTerm(eligibleTitle, term))) continue;
    const types = row.pubTypeList?.pubType ?? [];
    const designIndex = evidenceTypes.findIndex(t => types.some(x => matchText(t) === matchText(x)));
    if (designIndex < 0) continue;
    candidates.push({row, pmid, title, designIndex, date: row.firstPublicationDate || row.pubYear || ''});
  }
  candidates.sort((a,b) => a.designIndex - b.designIndex || b.date.localeCompare(a.date) || a.pmid.localeCompare(b.pmid));
  const used = new Set();
  const records = [];
  for (const {row, pmid, title, designIndex, date} of candidates) {
    if (keys(row).some(id => used.has(id))) continue;
    keys(row).forEach(id => used.add(id));
    const category = evidenceTypes[designIndex];
    const journal = row.journalInfo?.journal?.title || row.journalTitle || 'Journal unavailable';
    const authors = row.authorString || 'Authors unavailable';
    const reason = 'Topic in title; indexed as ' + category + '. Design priority, then publication date.';
    const verificationStatus = 'Bibliographic metadata retrieved from Europe PMC. Clinical applicability unreviewed.';
    const integrityStatus = 'No notice detected in retrieved metadata. Independent correction/retraction status unknown.';
    const limitations = 'Population, study limitations and local applicability require full-text review.';
    const url = 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/';
    records.push({
      title, url, authors, journal, date: date || null, category, studyDesign: category, pmid, doi: row.doi || null,
      population: null, limitations, reason, verificationStatus, integrityStatus, lastVerifiedAt: queriedAt,
      provenance: {source:'Europe PMC', query, rankingVersion, fetchedAt: queriedAt},
      detail: [authors + ' · ' + journal + ' · ' + (date || 'Date unavailable'), 'PMID ' + pmid + (row.doi ? ' · DOI ' + row.doi : ''), reason, limitations, verificationStatus, integrityStatus, 'Checked ' + queriedAt].join('\n')
    });
    if (records.length === 10) break;
  }
  return records;
}

export async function retrieveEvidence(topic, signal, discovery = false, focusTerms = []) {
  const name = String(topic).trim().toLowerCase().replace(/[’‘]/g, "'");
  if (!topicTerms.has(name) && !(discovery && /^[a-z0-9][a-z0-9 '-]{0,83}$/.test(name))) throw new Error('Choose a supported catalog topic for literature retrieval.');
  const terms = [name, ...(topicTerms.get(name) || [])];
  const titles = terms.map(term => 'TITLE:"' + term + '"').join(' OR ');
  const types = evidenceTypes.map(type => 'PUB_TYPE:"' + type + '"').join(' OR ');
  const focus = focusTerms.length ? ' AND (' + focusTerms.map(term => 'TITLE:"' + term + '"').join(' OR ') + ')' : '';
  const query = 'SRC:MED AND (' + titles + ') AND (' + types + ')' + focus;
  const endpoint = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  endpoint.search = new URLSearchParams({query, format:'json', resultType:'core', pageSize:'60'});
  const response = await fetch(endpoint, {signal, credentials:'omit', referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error('Europe PMC returned HTTP ' + response.status + '.');
  const payload = await response.json();
  if (!Array.isArray(payload.resultList?.result)) throw new Error('Europe PMC returned an unexpected result format.');
  const queriedAt = new Date().toISOString();
  return {records: rankEvidence(payload.resultList.result, terms, queriedAt, query), rows:payload.resultList.result, queriedAt};
}

export async function searchEvidence(topic,signal,discovery=false){
  const {records,queriedAt}=await retrieveEvidence(topic,signal,discovery);
  return {records,queriedAt};
}
