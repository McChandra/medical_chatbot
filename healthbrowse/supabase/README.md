# Account and research database

Use a separate Supabase project per environment. Its Auth service owns users,
verified emails, password resets, refresh tokens, and OAuth identities.
HealthBrowse stores application data by the verified Auth UUID. An institution
membership is assigned by an operator; changing a reading mode cannot create one.

## Provision and test

From the standalone HealthBrowse directory, apply the migration with your
migration runner or a database-owner psql session. Supply credentials using
your secret manager or an existing PostgreSQL service configuration. Do not
commit a database URL.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202611010001_healthbrowse.sql
node scripts/seed-database.mjs | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
node --test tests/account-api.test.mjs
# Only on a throwaway migrated/seeded database
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ownership.sql
```

Seed again after a reviewed source release. Seeding is repeatable. The import
does not delete removed records automatically. Review retired sources and mark
them withdrawn before the next release. A changed evidence passage loses
reviewed status; a withdrawn record stays withdrawn. No imported clinical
passage is automatically marked reviewed. The app reads the published source
assets; database editing alone does not publish new content.

| Relation | Purpose and access |
| --- | --- |
| `auth.users` | Supabase-managed identities. |
| `hb_topics`, `hb_diseases` | Known public terms, focus entities, synonyms, and specialty relationships. |
| `hb_evidence` | Public differentiated symptom, treatment, genetics, research and resource records with publisher, URL, provenance and clinical review state. Withdrawn records are hidden. |
| `hb_medicines`, `hb_topic_medicines` | Historical drug-name/source pointers. An indication relationship requires a source and explicit clinical review before publication. |
| `hb_institutions`, `hb_memberships` | Operator-provisioned institutions/memberships. Members read only their memberships and their associated institutions. |
| `hb_settings`, `hb_saved` | Owner-only theme, reading preference, history consent, bookmarks and favourites. |
| `hb_history` | Opt-in topic/section references for search or chat. The endpoint reconstructs the educational question label and reopen link. No free-form prompt, answer or patient case is retained. |
| `hb_feedback` | User-submitted content. Conservative keyword rules suggest type/sentiment for human review; a clinician or designated reviewer must adjudicate correction claims. No automatic content publishing. |
| `hb_private.hb_contact_receipts` | Deduplication key, digest, provider identifier and timestamps only. No sender name, email or message body in this table. |

## Runtime configuration

All personal endpoints require a Supabase access token via `Authorization: Bearer`.
The API verifies the user via `/auth/v1/user` and passes the same user JWT to
PostgREST. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public key).
For contact forwarding configure `CONTACT_TO` (existing corporate mailbox),
`CONTACT_FROM` (provider-verified sender), `RESEND_API_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` or its `sb_secret_` equivalent, server side only.
The app uses this privileged key only to finalize a provider delivery receipt.
Do not use it in a browser. A missing provider configuration yields an explicit
service-unavailable error; hosting a website does not provision a mailbox.

Contact sends plain text to the configured company inbox. User input cannot set
the recipient, sender or subject. The sender email is the reply address. The
API records provider acceptance, not inbox receipt. Each submission uses a
fresh UUID; reuse that UUID on retries without changing the contact fields.
Conflicting reuse is rejected. Resend deduplicates requests for 24 hours; the
database stops retries on ambiguous receipts at 23 hours. Per-user limits:
three new contact requests per hour, five feedback submissions per hour.
Delivery retries require the original client submission; there is no background
queue retaining the message text.

## Retention and operations

Schedule `select public.hb_prune_retention();` daily using an operator-owned
scheduler. It deletes event records older than 30 days and feedback older than
90 days. The API restricts history reads to the last 30 days/100 events;
disabling history deletes saved events immediately. Removing the Auth account
cascades its private rows. A purge operation does not remove already-forwarded
mail from your mail provider; define mailbox retention separately. Provider
logs and backups also need their own approved retention settings.

Monitor mail errors and limits through counters only. Do not log request
bodies, headers, full URLs with query strings, tokens, or contact contents.
Restrict access to moderation tools and the service role. Investigate reported
medical errors against original evidence before changing any source.

## Medication metadata attribution

`medicine-links.json` contains 1,312 historical titles, publisher URLs, and XML
record paths from MedQuAD collection 11, revision
`577bd37b96c02d1833b2c9eed2de9f96964e96cb`. Source:
https://github.com/abachaa/MedQuAD. Attribution: Asma Ben Abacha and Dina
Demner-Fushman, *A Question-Entailment Approach to Question Answering* (2019),
https://doi.org/10.1186/s12859-019-3119-4, CC BY 4.0. Only public metadata
was selected; licensed monograph text is excluded. Availability, modern
regulatory status, indications, and pharmacy stock are not inferred.
