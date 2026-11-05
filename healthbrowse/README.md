# HealthBrowse public research platform

HealthBrowse is an educational medical research browser. General users see a question-specific answer followed by six clinical decks and a click-to-open HealthBrowse buddy. Other reading modes retain the seven-domain research workspace. The hosted desk opens after Supabase sign-in. Personal workspaces store profiles, preferences, saved research chats, bookmarks and activity in the hosted database. This release uses source excerpts, publication corroboration, ClinicalTrials.gov registrations and NIH funding records. Clinical validation and institutional endorsement remain separate from software tests.

## Disease framework and reading modes
The browser and copilot share six clinical domains: **Etiology & Pathogenesis**, **Natural History & Progression**, **Clinical Presentation & Diagnosis**, **Therapeutics & Management**, **Prognosis & Complications**, and **Epidemiology & Public Health**. A seventh domain, **Research, Evidence & Resources**, retains papers, trials, funded institutions, education, datasets and care directories.

General users receive plain-language headings and priority for patient education sources. Medical and advanced professionals see the specialty selector, technical headings, more detailed source passages and appraisal prompts. Selecting a reading mode changes presentation, not identity verification or access permissions. Missing evidence stays visible as a coverage gap.

In general mode, the floating buddy opens with six questions covering causes, disease course, symptoms/tests, treatment, outlook and prevention. A deck's “Ask buddy about this” button opens its detailed, cited source excerpts. Research papers, datasets and care resources remain available below the six decks, with publication discovery loaded on demand inside the buddy. The main search accepts new topics directly; only a new topic proposed in chat asks for confirmation. Topic loading and source requests have time limits and visible retry messages. This is deterministic retrieval from the available source corpus, not an unrestricted generative chatbot; unsupported questions remain explicit evidence gaps.

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
