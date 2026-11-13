# Medical FAQs, evidence routing and Buddy sessions

The current framework is `medical-faq-v3`. General and Clinicians are the two reading modes. Selecting Clinicians changes presentation; it grants no restricted permissions or clinical credential status.

| FAQ | Evidence sought | Missing evidence behavior |
| --- | --- | --- |
| Who is most affected, and what are the risk factors? | Population distribution, risk exposures and prevention | No unsupported incidence, prevalence or population estimates |
| What exactly causes this condition? | Etiology, cellular mechanisms and genetics | No causation inferred from diagnostic markers or association alone |
| What are the common signs and symptoms? | Symptomatic phenotype, signs and warning signs | No invented early/late-stage symptom distinctions |
| How is this diagnosed and tested? | Criteria, laboratory tests, imaging and limitations | No tests or differential diagnoses without supporting evidence |
| What are the treatment and management options? | Drug and non-drug approaches | No personal prescribing or dosing; General includes “Please consult your doctor before starting any treatment.” |
| What is the long-term outlook? | Course, outcomes, complications and follow-up | No invented survival rates, untreated timelines or monitoring schedules |

## Presentation and generation

The browser renders a direct Browser Summary, six keyboard-accessible native details/summary accordions, and a muted Authorized Citations block. Symptoms are listed as discrete source-backed items. Opening one FAQ does not close another, and the current open state survives synthesis updates. A new topic starts with the first FAQ open. The separate research shelf retains papers, trials, grants, education, datasets and care resources.

The language model returns schema-checked claims, not executable markup or UI commands. The frontend generates the requested FAQ presentation and a **Copy FAQ summary** Markdown export from the same displayed responses. Exported citations are deduplicated by source URL. Each clinical claim retains its supporting inline references and passage details; directory links are not falsely included as used citations. Displayed source fallbacks remain identified as excerpts in exported text. The system does not manufacture a summary when the evidence does not answer the question.

Buddy stays closed until clicked. Selecting a FAQ opens a contextual conversation about that area; follow-ups do not repeat all six FAQs. Role-specific instructions distinguish everyday education from precise clinical interpretation, but cannot create missing specialist evidence from patient-education sources.

## Source routing and compatibility

Original source paragraphs, source identifiers, headings, dates and URLs remain intact. `faq-spec.js` maps prior disease-spectrum annotations into the new registry. Old symptom/diagnostic content is split by explicit headings, intent and text; a passage can support both only when both appear. Treatment exposures mentioned as risk factors are not treatment recommendations. Natural-history and prognosis records now belong to FAQ 6, retaining treatment-exposure metadata. New source routing is not a clinically validated classifier.

The current Cold Sores snapshot contains no diagnostic passage. FAQ 4 therefore shows an explicit evidence gap with no invented tests or citations. This is intentional and covered by regression tests. Snapshot dates are not publication or prevalence observation dates.

New saved turns carry `medical-faq-v3`. Existing `disease-spectrum-v2` and older turns are preserved with their original version labels; old section numbers do not silently become new FAQ meanings. Session scopes include the framework version. No research data is deleted by this update.

## Welcome and authentication

Every new verified Supabase login session can show one Buddy welcome. The server verifies the access token with Supabase before reading a subject-matched `session_id`. A composite-key SQL insert prevents replay on token refresh, reload, role change or concurrent tabs. A new login/device session can welcome again. A migration adds `hb_buddy_sessions`; prior account fields remain intact.

The welcome is driven by authenticated application state, never an LLM-generated audio tag or a user's copied login-event text. It uses no name or email. The visual welcome remains available if autoplay is blocked; audio is attempted once when the browser allows it. The conversation opens only on user action.

## Safety and validation limits

Shared input checks, server screening, source checks, schema validation and automated claim-support review remain in place. Unsafe procedure instructions are withheld while ordinary medical education remains available. Immediate-danger queries receive supportive escalation rather than a generic refusal. Automated review can miss errors and does not certify clinical accuracy or eliminate hallucinations.

Regression tests cover both roles, source preservation, FAQ-specific evidence gaps, safe citation export, treatment notices, session isolation, refresh suppression, and blocked autoplay. Provider requests are mocked. The Worker integration test exercises the built server locally. These checks do not constitute a live-model benchmark, clinical review, completed Google OAuth flow, or real-device visual/audio testing.

## References

- [Funkhouser: Pathology, the clinical description of human disease (2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7380242/)
- [Jewell: Natural History of Diseases, Statistical Designs and Issues (2016)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5017909/)
- [Supabase: Sessions](https://supabase.com/docs/guides/auth/sessions)
- [MDN: Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)

The clinical references inform conceptual organization; they do not validate or endorse HealthBrowse.
