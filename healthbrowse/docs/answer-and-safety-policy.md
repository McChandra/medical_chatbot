# Response and safety policy — 13 November 2026

HealthBrowse answers the question first and then displays six clinical domains. General mode requests plain English; Clinicians mode requests clinical terminology, reasoning and limitations, restricted to the same retrieved evidence. Selecting Clinicians changes reading style, not permissions or professional verification.

Medical claims must link to server-selected source passages. The source registry checks publisher domains, including NLM/MedlinePlus, CDC, NCI, WHO, FDA and NHS. PubMed indexing does not mean NIH certifies an article. Citations, source identity, automated support review and clinical validation are distinct. Unsupported areas remain visible with an evidence-gap message; no system can promise zero hallucinations.

## Safety before retrieval

`dist/safety-policy.js` is a shared, versioned rule-based intent screen. Search and buddy call it before retrieval. The model API independently repeats screening before authentication, evidence assembly or provider calls; terminology/research routes also screen input. Cases include DIY invasive procedures, individual dose changes, harmful drug-use instructions, non-consensual harm and falsified medical/research records. Emergency and identifying-information interception remain in `clinical-engine.js`.

For self-stitching requests, return a clear boundary and source-linked first-aid/escalation guidance instead of decks or procedural steps. Questions about wound aftercare, indications, prevention, recovery and clinical education remain allowed. Clinicians mode cannot bypass the restrictions. Provider prompts and output checks add another layer; this is not a trained ethical classifier, exhaustive abuse detection, or a regulatory certification.

The model API logs only policy version, action and category; no question text, identity or tokens are added to safety logs. Client-blocked questions remain local and are not sent for model generation or saved to account history. Ordinary non-identifying symptom questions remain answerable.

## Sources for fixed safety guidance

- NHS, [Cuts and grazes](https://www.nhs.uk/conditions/cuts-and-grazes/), checked 13 November 2026: pressure for a bleeding cut without an embedded object, avoid removing an embedded object, and seek emergency care for persistent bleeding, deep wounds, sensory loss or movement problems.
- FDA, [Think It Through: Managing the Benefits and Risks of Medicines](https://www.fda.gov/drugs/information-consumers-and-patients-drugs/think-it-through-managing-benefits-and-risks-medicines), checked 13 November 2026: follow labeling and prescriber directions and consult a healthcare professional before changing medication use.

The cold-sores regression retains the original MedlinePlus paragraphs and their source identifiers. Relevant paragraphs can support several domains, including causation, recovery, management and prevention. Routing does not invent facts or establish an untreated timeline.

## Verification and limits

Tests cover both modes, search and buddy, contextual unsafe follow-ups, common false positives, no external calls for blocked requests, source coverage for the reported cold-sores query, inline citation rendering, empty-response handling, and the actual Worker runtime with mock auth/provider services. Provider-model availability remains operationally separate from source and safety checks. Live signed-in generation and visual mobile QA are not established by these tests. No independent clinician approval has been granted.
