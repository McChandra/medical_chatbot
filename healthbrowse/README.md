# HealthBrowse public research platform

General-user model development: the first Llama 3 QLoRA research adapter has completed training and its 78-result evaluation. It passed format/source checks on 9/12 production-prompt questions and 25/25 separate extraction holdouts, but unsupported citations, incomplete answers and slow browser generation prevent public activation. [Read the evaluation findings](inference/releases/llama3-general-research-002-evaluation.md). These are format results, not clinical accuracy. The completed run is preserved; do not repeat it unchanged. [Private evaluation and hosting guide](inference/private-endpoint.md).
The opt-in [grounded-v2 update](inference/grounded-v2.md) adds shorter structured outputs, server-resolved citations, targeted evidence additions and full generation/review/repair evaluation. Its focused GPU evaluation is pending; no public model activation is claimed.


The existing [model gateway and deployment guide](docs/model-integration.md) describes citations, six-deck outputs, automated support review, optional hosted provider routes, and self-hosted adapter serving. Earlier provider configuration is not evidence of successful inference or clinical validation. Clinicians remains a separately configured DR7 route.


HealthBrowse is an educational medical research browser. Every reading mode shows a question-specific answer followed by six clinical decks and a click-to-open HealthBrowse buddy. Research and discovery resources remain separately expandable. The hosted desk opens after Supabase sign-in. Personal workspaces store profiles, preferences, saved research chats, bookmarks and activity in the hosted database. This release uses source excerpts, publication corroboration, ClinicalTrials.gov registrations and NIH funding records. Clinical validation and institutional endorsement remain separate from software tests.

## Disease framework and reading modes
The browser and copilot share six clinical domains: **Etiology & Pathogenesis**, **Natural History & Progression**, **Clinical Presentation & Diagnosis**, **Therapeutics & Management**, **Prognosis & Complications**, and **Epidemiology & Public Health**. A seventh domain, **Research, Evidence & Resources**, retains papers, trials, funded institutions, education, datasets and care directories.

The browser and buddy use the same question-answering and audience profiles:

| Reading mode | Answer behavior |
| --- | --- |
| General user | One concise source explanation with plain-language headings |
| Patient | Care-oriented explanation, relevant source context and questions to discuss safely with a clinician |
| Medical student | Definition plus mechanism, presentation and study prompts |
| Medical professional | Clinical passages, diagnostic/management context and brief educational interpretation |
| Advanced professional | More source detail, classification/subtype distinctions and evidence appraisal |

All five modes use the floating buddy, which stays closed until clicked. Its six guided questions adapt to the reading mode, and each deck has an “Ask buddy about this” action. Research papers, datasets and care resources remain separately available. A mode selection changes source selection, depth and learning guidance, not identity verification or data permissions. Only medical and advanced professional modes show the specialty selector.

Conversational phrasing, known synonyms and spelling corrections are normalized before intent matching. Explicit multipart questions are answered clause by clause, with unsupported parts identified. Answers do not exclude material merely because it is visible in a deck. Each clinical passage retains its citation and exact stored-source check; role-specific study prompts and safety reminders are separately labeled. Source coverage limits still apply: the application has no unrestricted generative LLM service or clinically validated diagnostic capability.

The MedlinePlus importer now retains complete headed summary blocks, including diagnosis and treatment sections that the previous first-paragraph preview omitted. The 5 November 2026 feed contains 1,017 topics and 5,752 indexed blocks. Original publisher terms, attribution and provenance hashes are retained. Local topic loading and external requests have time limits; an account-history outage cannot block a research answer.

Clinical excerpts require a recognized publisher or a pinned historical MedQuAD record, topic agreement, record identity and an exact text match. Corrections require an explicit, unambiguous source record; otherwise the claim is withheld. These checks detect some unsupported or altered claims, but do not establish clinical accuracy, certification, completeness or currency. Historical excerpts retain their dates and subtype labels. Untreated natural history is not inferred from general progression or treated outcomes. See [framework design and validation](docs/DISEASE_FRAMEWORK.md).

## Run locally
Use Node 24. From this directory:
```sh
npm ci
npm run build
npm test
npm start
```
Open http://localhost:8080. Set the Supabase public configuration to use the signed-in desk. Research APIs need internet access. The leukemia example can display a dated verified snapshot when live retrieval fails. Health checks are at /healthz and /readyz. Open /account.html for authentication, settings, bookmarks, favourites, history, feedback, contact and help. The offline mobile screen asks visitors to reconnect before retrieving current evidence.

## Enable accounts, storage and contact
1. Use Supabase Auth for identities and confirmed email addresses. Sites provisions the `DB` binding and applies the schema in `drizzle/` for profiles, chats and preferences. See [Workspace storage](docs/WORKSPACE.md). The existing Supabase migrations remain for the research catalog, institutions, feedback and contact service.
2. Configure email confirmation, numeric OTP templates, SMTP, Google OAuth, exact callback URLs and a minimum 12-character password policy. See [account setup](docs/ACCOUNTS.md). Password login and passwordless OTP login are alternate sign-in paths.
3. Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CONTACT_FROM, and CONTACT_TO. Set CONTACT_TO to a real mailbox owned by your organization. CONTACT_FROM must be authorized by the outbound provider. Google OAuth credentials belong in Supabase, not in the browser.
4. Run acceptance tests with two separate test accounts and a test mailbox before enrolling real users. A provider accepting a message does not prove inbox delivery.

Chat saving is on by default and is disclosed beside the copilot. Users can turn off new saves, reopen or rename chats, delete individual chats, or delete all chats and topic activity. The separate topic activity history is off by default. Avoid entering patient details in search, chat, feedback or contact. A negative sentiment label does not establish that a report is false. Human reviewers investigate corrections against the original medical source.

## Release and operate
- [Docker, Kubernetes and Cloud Run deployment](deploy/README.md)
- [Authorized source refresh and operational monitoring](docs/maintenance.md)
- [Research protocol, business pilot and mobile distribution](docs/research-business.md)

Repository-level workflows run from the parent repository's .github/workflows directory. CI tests, scans and packages the service. A protected production environment and workload identity federation are prerequisites for a Cloud Run deployment. Scheduled refresh creates a reviewable content change; publication requires review. Do not claim that source matching or a passed test provides clinical certification.

## Public access, domain and mobile
Use the supplied hosting URL for a pilot. A custom domain requires registration, DNS control and a verified mapping. A corporate mailbox requires an email provider and MX records. For mobile, install the HTTPS web app through the browser's Add to Home Screen or Install command. Its service worker caches only a generic offline page. An App Store or Play Store release is a later, independently reviewed distribution channel.
