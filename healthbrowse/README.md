# HealthBrowse public research platform

HealthBrowse is a seven-section educational medical research browser. Visitors can read public evidence without creating an account. Supabase adds optional personal workspaces. This release uses source excerpts, publication corroboration, ClinicalTrials.gov registrations and NIH funding records. Clinical validation and institutional endorsement remain separate from software tests.

## Run locally
Use Node 24. From this directory:
```sh
npm ci
npm run build
npm test
npm start
```
Open http://localhost:8080. The public desk works without secrets. Research APIs need internet access. The leukemia example can display a dated verified snapshot when live retrieval fails. Health checks are at /healthz and /readyz. Open /account.html for authentication, settings, bookmarks, favourites, history, feedback, contact and help. The offline mobile screen asks visitors to reconnect before retrieving current evidence.

## Enable accounts, storage and contact
1. Create a Supabase project, apply the SQL migrations in supabase/migrations, then seed its catalog with scripts/seed-database.mjs following the [database guide](supabase/README.md). Supply secrets only through deployment settings.
2. Configure email confirmation, numeric OTP templates, SMTP, Google OAuth, exact callback URLs and a minimum 12-character password policy. See [account setup](docs/ACCOUNTS.md). Password login and passwordless OTP login are alternate sign-in paths.
3. Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CONTACT_FROM, and CONTACT_TO. Set CONTACT_TO to a real mailbox owned by your organization. CONTACT_FROM must be authorized by the outbound provider. Google OAuth credentials belong in Supabase, not in the browser.
4. Run acceptance tests with two separate test accounts and a test mailbox before enrolling real users. A provider accepting a message does not prove inbox delivery.

Saved history is off by default and stores canonical educational topic/section events. Disabling it removes stored events. Avoid entering patient details in search, chat, feedback or contact. A negative sentiment label does not establish that a report is false. Human reviewers investigate corrections against the original medical source.

## Release and operate
- [Docker, Kubernetes and Cloud Run deployment](deploy/README.md)
- [Authorized source refresh and operational monitoring](docs/maintenance.md)
- [Research protocol, business pilot and mobile distribution](docs/research-business.md)

Repository-level workflows run from the parent repository's .github/workflows directory. CI tests, scans and packages the service. A protected production environment and workload identity federation are prerequisites for a Cloud Run deployment. Scheduled refresh creates a reviewable content change; publication requires review. Do not claim that source matching or a passed test provides clinical certification.

## Public access, domain and mobile
Use the supplied hosting URL for a pilot. A custom domain requires registration, DNS control and a verified mapping. A corporate mailbox requires an email provider and MX records. For mobile, install the HTTPS web app through the browser's Add to Home Screen or Install command. Its service worker caches only a generic offline page. An App Store or Play Store release is a later, independently reviewed distribution channel.
