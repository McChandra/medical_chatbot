# Profiles, conversations and account history

Supabase Auth remains the identity and credential store. Every private API call verifies the bearer token against Supabase `/auth/v1/user`. Display names, preferences and research conversations use the stable verified UUID, never a caller-supplied owner ID or an email address. Reading modes are presentation preferences, not professional verification or authorization.

## Hosted database

The Sites manifest declares `d1: "DB"`. Publication provisions the binding and applies the generated, versioned SQL in `drizzle/`. There are no schema changes in request handlers and no database keys in browser bundles.

| Table | Data |
| --- | --- |
| `hb_accounts` | Supabase UUID, display name, preferences, creation time, history deletion epoch |
| `hb_chats` | Owner, title, public topic, reading mode, timestamps |
| `hb_chat_turns` | Parent conversation, public question, response, source links, section and saved timestamp |
| `hb_research_history` | Optional topic/section activity, separate from conversation content |
| `hb_bookmarks` | Owner-scoped bookmarks and favourites |

Profiles are created lazily on the first authenticated workspace request. Email and password data remain in Supabase Auth. No automatic copy or deletion of legacy Supabase data occurs; existing installations with populated legacy workspace tables need an operator-controlled migration before switching storage. The hosted project reported that `hb_settings` was absent from the Supabase schema during implementation; other legacy table contents were not read.

New chat starts an empty conversation; its database record is created on the first eligible research reply. New questions are saved sequentially, with stable message IDs for idempotent retries. Opening a chat reads its stored answers and citations without generating a replacement answer. A saved answer is historical; its source or study status may have changed. Reopened turns do not regain a fresh claim-verification badge.

Account history lists up to 100 conversations, each capped at 200 saved replies. Topic activity retains the latest 100 rows per account and exposes only the last 30 days. Chats remain until users delete them. Turning off chat saving prevents new writes; it does not silently delete existing chats.

## Safety and ownership

Search admission and persistence use separate screening rules. Ordinary first-person symptom questions can receive general educational answers without being forced to rephrase. Identifying details still block retrieval/model submission, and detected emergencies bypass normal search. Non-identifying personal questions stay in memory and are not saved to account history; the stricter persistence guard runs in the browser and again at the private API. Simple symptom statements may be converted locally into public topic questions. External evidence services receive canonical topics, not personal wording. The local excerpt fallback does not assess duration, medicines, age or individual circumstances. When configured, the model receives the non-identifying question with instructions against individual diagnosis or prescribing. This rule-based screening is incomplete and is not guaranteed de-identification or a HIPAA compliance claim. Do not enroll patient records in this prototype. HTTP responses are private/no-store; application logs exclude bodies, identity headers and query content.

The D1 binding is server-only. Every query filters by verified ownership; message operations first verify the parent chat owner. Individual deletion removes its messages. Confirmed **Delete complete chat history** atomically removes all conversations, messages and topic activity for that account while preserving its profile, preferences and saved bookmarks. A monotonically increasing deletion epoch rejects stale queued chat creations/writes after a purge. Other tabs clear the displayed conversation when they receive the local deletion notice. Provider backups and retention are separate from active-record deletion and must be governed operationally.

## Standalone Node / Docker

For a single-instance deployment with a persistent disk, the same repository supports SQLite through a small D1-compatible adapter. Initialize the schema before starting:

```sh
export WORKSPACE_DB_PATH=/absolute/persistent-volume/workspace.sqlite
node scripts/migrate-workspace.mjs
npm run build
npm start
```

The path is deployment configuration, not a credential. Use a volume writable by the runtime UID and back it up with appropriate access restrictions. Run the migration script from the source checkout or include `scripts/`, `drizzle/` and the adapter in a dedicated migration image. Do not use local ephemeral SQLite disks for replicated Cloud Run or Kubernetes deployments. Those deployments need a shared managed database adapter; the hosted Sites deployment uses its managed D1 binding.

Without a DB binding/path, legacy Supabase personal APIs remain available, but new chat/profile endpoints require workspace storage. Feedback/contact still use the separately configured legacy Supabase service and mail delivery; this release does not claim to activate those services.

## Validation

`tests/workspace-api.test.mjs` executes the real SQL schema in an isolated SQLite database. It exercises rejected authentication, profile updates, denied owner/email/role injection, two-account isolation, conversation create/read/update/delete, duplicate message retries, citation persistence, history preferences, atomic delete-all, stale-write rejection, and privacy/source URL validation.

Browser acceptance uses an isolated fake Auth provider with the real workspace API and SQL database. It does not change a real email address, deliver confirmation mail, or establish an actual Google session. Before launch, test those provider flows using designated accounts and mailboxes.
