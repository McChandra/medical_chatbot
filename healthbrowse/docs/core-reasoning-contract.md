# HealthBrowse core reasoning contract

This contract implements the supported parts of the requested Patient / Student / Clinical Professional reasoning prompt. A prompt does not create a vector database, validate a dataset, grant professional credentials, or turn a research prototype into a regulated diagnostic system.

## Current implementation and requested capabilities

| Area | Implemented behavior | Boundary |
| --- | --- | --- |
| Visible roles | General and Clinicians remain the two selectable reading modes. | A role selection is not professional credential verification. |
| Patient style | General and the legacy Patient API role use plain-language, empathetic explanations and the exact disclaimer below. | Educational information, not personal diagnosis or prescribing. |
| Student style | The existing `Medical student` API role uses source-supported educational mechanisms and supervised-learning framing; it routes to the general model. | It is a compatibility API path, not a third visible selector or a new access permission. The normal web client continues using the two selected modes. |
| Clinical style | Clinical terminology, concise explanatory reasoning, differential considerations and source scope. Codes and metrics require explicit source support. | Patient education sources cannot be promoted to clinical guidelines. |
| Decks | Browser Summary plus the existing six clinical decks. | Eight new internal decks were not defined or connected by this change. |
| Active evidence | The Groq path uses attributed MedlinePlus passages and targeted CDC/NCI text snapshots. | Historical MedQuAD passages are excluded from this active route. No claim that the deployed system is MedQuAD-only or that all records are verified. |
| Retrieval | Server-owned lexical selection of complete passages with source IDs, dates and deck mapping. | Qdrant is not connected; these are not vector matches. |
| Citations | Server-resolved inline source links and passages, schema checks and automated claim-support review. | An internal deck or intent label alone is not evidence; no invented MedQuAD intent types. Automated review is not independent clinical validation. |
| Modalities | Text evidence only. Prompts distinguish reported text from observed findings and prohibit invented image interpretations. | No echocardiogram/video/image upload or analysis was added. Client-supplied `images`, `patientRecords`, `qdrantContext`, or other evidence fields remain rejected by the API schema. |

## App-owned response wording

General answers append this once, including source-excerpt fallback and copied six-deck responses:

> I am an AI, not a doctor. Please consult a healthcare provider before making medical decisions.

Unsupported sections use:

> Insufficient clinical context available to verify this claim.

An exact source excerpt may still be shown as reference material, labeled as an excerpt rather than a model answer. An empty section never gets invented facts merely to populate a card. Provider outages and rate limits retain their operational error messages; they are not misreported as failed medical verification.

Explicit unrelated requests receive:

> As a medical AI browser, my operations are restricted to health and medical data.

Platform navigation, account help, greetings, medical software research and short follow-ups remain usable. The deterministic scope screen recognizes selected obvious unrelated tasks; it is not comprehensive multilingual topic classification. Unknown biomedical terms are not rejected merely for being absent from a keyword list. The server independently repeats scope screening, and the model is constrained to the supplied medical evidence.

## Clinical safety and security flags

Policy `2026-11-13.4` adds specific lethal-dose and off-label protocol checks. Requests for operational off-label dosing/regimens/protocols are blocked in both modes; ordinary questions about evidence, risks and terminology remain allowed. Existing checks cover unsafe self-procedures, drug synthesis/misuse, harmful actions, prompt extraction and common filter-bypass attempts.

Emergency and identifying-data handling still precede ordinary refusals. A self-harm crisis receives urgent human-help guidance, not only a generic security rejection. No model provider or medical retrieval request is made for a detected blocked query.

High-risk requests received by `/api/ai/answer` emit a structured `security_flag` log containing only `event`, `category`, `policyVersion`, and `action`. It includes no query, source text, identity, IP address or credentials. The flag does not report a person to anyone, disable an account, or claim to be a staffed incident-response workflow. Queries intercepted entirely in the browser are not silently uploaded for telemetry; they are blocked locally with `securityFlagged: true` response metadata for recognized high-risk categories. Central monitoring of those local events would require a separately designed, privacy-preserving reporting mechanism.

## Verification and remaining work

Regression checks cover General/Clinicians and search/chat entry points; exact disclaimer and evidence-gap copy; obvious off-topic examples and safe medical counterparts; high-risk pre-provider blocking; metadata-only security flags; preserved emergency precedence; student API prompt routing; and rejection of forged multimodal evidence. Existing citation and unsupported-claim tests remain applicable.

Provider responses are mocked in automated tests. These are not live-model safety benchmarks, clinical certification, a guarantee of zero hallucinations, or proof against all adversarial prompts. Human clinical review and live-provider evaluation remain outstanding.

A future Qdrant/multimodal integration needs authorized source ingestion, licensing and consent controls, separate provenance for imaging observations and historical text, validated modality-specific models, quality/uncertainty checks, and an evaluated response schema. No such infrastructure is implied by this prompt update.
