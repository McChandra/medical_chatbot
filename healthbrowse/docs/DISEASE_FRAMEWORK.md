# Disease framework, evidence checks and research interpretation

HealthBrowse uses `disease-spectrum-v2` for new conversations. Six requested clinical domains form decks 1–6; deck 7 preserves research and discovery resources. The same registry drives browser titles, the copilot selector and the research brief. General/patient views use plain-language labels with the medical domain name underneath. Student and professional views use medical headings. Only medical and advanced professionals expose the specialty selector. Specialty is cleared when returning to a nonprofessional reading mode. Reading-mode selection grants no additional data permissions.

| Deck | Evidence sought | Missing evidence behavior |
| --- | --- | --- |
| Etiology & Pathogenesis | Risk factors and biological mechanisms | Do not infer causation from association or diagnostic markers |
| Natural History & Progression | Longitudinal course, early changes and intervention exposure | Explicitly distinguish unspecified exposure from untreated disease; no invented stages or timing |
| Clinical Presentation & Diagnosis | Symptoms, signs, criteria, tests and differential considerations | No diagnostic criteria or differential generated without a supporting passage |
| Therapeutics & Management | Acute and chronic management and therapeutic classes | No individual prescriptions, doses or inferred guideline recommendations |
| Prognosis & Complications | Prognostic factors, outcome measures and complications | No unsupported outcome or survival probability |
| Epidemiology & Public Health | Distribution, prevention and access | No prevalence/incidence estimate without a source; feed date is not the observation period |
| Research, Evidence & Resources | Publications, trials, grants, education, datasets and directories | Show available records and failures; do not invent papers, funding or provider availability |

## Role-aware answers and buddy

All five reading modes display a direct answer before six clinical decks. Research resources remain in a separate expandable area. Browser and buddy share `searchAnswer`; the buddy does not suppress a requested answer because it is already visible. Clinical passages stay source-matched while role profiles select depth and supplemental context: concise general explanation; patient education and care questions; student mechanisms and learning prompts; professional diagnostic/management material with brief explanation; advanced source detail and appraisal. A patient-education corpus cannot provide specialist guideline recommendations that it does not contain.

Question normalization handles polite wording, inverted definitions, known synonyms and spelling variants. Explicit compound questions are split into independently supported parts. Unmatched qualifiers, populations, costs and numerical claims remain evidence gaps. Matching a diagnosis word does not confirm a diagnosis. The selected deck does not override a new question's intent.

The buddy is a closed native dialog in every reading mode, with six audience-specific prompts, cited replies, free-text follow-ups and existing private history controls. It opens on user action and restores focus when closed. Narrow screens use a full-viewport layout. Source discovery is loaded when requested, rather than blocking ordinary questions. Browser visual QA remains unverified because the browser testing service timed out; automated integration and source-contract checks are reported separately.

The importer retains headed source paragraphs and complete associated lists. This fixes missing cause, diagnostic and treatment text caused by taking only the first match for a combined symptoms/treatment preview. The legacy preview fields remain for compatibility. New blocks have deterministic content IDs, publisher headings and explicit intent/domain annotations. No facts are generated to complete a missing domain.

## Source handling

Existing source excerpts remain intact. Original annotations constrain domain placement: a diagnostic immunophenotyping excerpt is not classified as disease causation, and prior chemotherapy described as a risk factor is not presented as treatment advice. Limited term-based expansion identifies related progression/population content but is not a clinical interpretation or validated NLP classifier. A qualified reviewer must assess corpus coverage and placement before clinical deployment.

Clinical text requires source URL validation, a recognized publisher domain, exact topic/subtype scope, a record identifier and a matching stored excerpt. MedQuAD archive links must reference its pinned commit and XML record. Archived NIH material is clearly historical. A publisher's reputation does not certify a HealthBrowse response; PubMed indexing does not establish guideline validity or treatment benefit.

Claim correction replaces a proposed field only when the caller explicitly names an unambiguous source record and opts in. It cannot change the disease, population or source to make an answer appear supported. Otherwise unsupported claims are withheld. Matching a stored excerpt is not a new comparison against the publisher's live page. The UI separates record-comparison time from source vintage and states that independent clinical review is pending. These controls cannot guarantee detection of every hallucination or source error. No LLM-generated clinical fact is added in this release.

The publication/registry pipeline retains corroborated PubMed identities, identifiers, research filters and dated fallback snapshots. Resource links are discovery references, not verified clinical claims. Catalog availability and the range of published evidence vary by condition. General prose and professional appraisal prompts cannot supply missing clinical content.

## Saved history

New turn JSON stores `frameworkVersion: disease-spectrum-v2`; legacy turns remain unchanged and are marked as using the previous framework. Legacy overview buttons are not regenerated with new labels, and old deck numbers do not select a new domain. Session scopes include the framework version. Topic-activity links reopen the topic without interpreting legacy section numbers. No database table migration or deletion is required for this update.

## Literature informing the organization

- Funkhouser WK. *Pathology: the clinical description of human disease*. 2020. [PMC7380242](https://pmc.ncbi.nlm.nih.gov/articles/PMC7380242/). Discusses disease causes, biological development, clinical identification and outcomes. The linked PMC version is the 2020 chapter; the separately supplied ScienceDirect identifier may represent another edition.
- Jewell NP. *Natural History of Diseases: Statistical Designs and Issues*. 2016. [PMC5017909](https://pmc.ncbi.nlm.nih.gov/articles/PMC5017909/), [PMID 27393601](https://pubmed.ncbi.nlm.nih.gov/27393601/), DOI 10.1002/cpt.423. Distinguishes disease course from effects of intervention and discusses study-design limitations.

These publications inform conceptual organization. They do not validate this interface or certify its medical responses. Their full text is not copied into the application.

## Verification

Automated checks cover question routing, untreated-course constraints, exact excerpt preservation across the MedlinePlus index, role-based source ordering, source impersonation, pinned archives, record-scoped correction, and saved-version compatibility, alongside the existing account, research and safety suites. Browser QA uses an isolated Auth fixture and simulated source outages; this does not test real email delivery or Google OAuth.
