# HealthBrowse hosted model integration

## Current path: Groq

Both reading modes use `openai/gpt-oss-120b` through Groq. General requests plain English; Clinicians requests clinical terminology and evidence limitations. A second request to the same `openai/gpt-oss-120b` model checks each claim and can correct incomplete citation assignments. This is automated support review, not independent clinical validation. The QLoRA experiment is preserved separately and is not needed to run the website.

Set these values in the **server runtime**, then redeploy:

```dotenv
MODEL_PROVIDER=groq
GROQ_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=<supply through the server secret manager>
SUPABASE_URL=<your Supabase project URL>
SUPABASE_ANON_KEY=<your Supabase publishable key>
```

Do not put the Groq key in browser JavaScript, public build variables, Docker layers, Git, or logs. The endpoint is fixed to `https://api.groq.com/openai/v1/chat/completions`. Hugging Face and DR7 keys are never forwarded to Groq. Legacy provider settings are ignored while `MODEL_PROVIDER=groq`.

The hosted Site uses its existing D1 `DB` binding and `hb_model_limits` migration. Standalone deployments must apply the repository's migrations through the normal workspace setup. Docker, Kubernetes and Cloud Run can supply the same runtime environment through their secret managers; no GPU is needed.

## Request behavior

1. The signed-in visitor submits a question. Ordinary symptom descriptions such as “I have a sore throat” are allowed; identifying details and urgent first-person danger trigger existing privacy/emergency handling.
2. The server verifies the Supabase bearer session, same-origin request, bounded payload and per-account limit. A reading-mode dropdown does not grant access to patient records.
3. Server retrieval uses attributed MedlinePlus passages and targeted CDC/NCI excerpts. Groq's path excludes historical MedQuAD passages. It ranks question overlap, reserves coverage across six domains and sends whole passages within a bounded request. This is lexical retrieval, not neural search. Source publication dates and feed snapshot dates remain visible; it is not a live literature search.
4. Groq generates a direct answer and six structured decks. Buddy answers only the follow-up using the active query, selected deck, browser answer/deck summary and prior conversation. Browser summaries are untrusted context and cannot supply factual evidence.
5. The server rejects unknown or misfiled citations, incomplete sentences, omitted subtype restrictions and detected prescriptions/doses. A separate support check can fix citation IDs or withhold unsupported claims. URLs and quotations resolve from server-owned source records.
6. Supported sections remain when another section is missing. A section without usable generated claims displays a labeled excerpt or evidence gap. Authentication, rate-limit and connectivity failures show notices alongside existing source content. No repeated full generation/repair loop is used on this path.

The six domains are Etiology & Pathogenesis; Natural History & Progression; Clinical Presentation & Diagnosis; Therapeutics & Management; Prognosis & Complications; Epidemiology & Public Health. Research discovery remains separately expandable. Both roles retain the click-to-open Buddy.

## Verify and operate

```sh
npm test
npm run build
node scripts/smoke-groq.mjs Leukemia General search 'What is leukemia?'
node scripts/smoke-groq.mjs Leukemia Clinicians search 'What is leukemia and how is it diagnosed?'
node scripts/smoke-groq.mjs 'Sore Throat' General chat 'Do antibiotics help a sore throat?'
```

The smoke command accepts `GROQ_API_KEY` from the environment or prompts without echo. It calls the real provider through the application gateway with public example questions and a local authentication fixture. It does **not** verify real Supabase sign-in or a deployed browser session. An optional final argument writes a JSON report containing the public test question, output, status and timing. Do not use patient records for smoke tests.

`GET /api/ai/status` reports configuration, not live provider health. User acceptance testing should cover Google/email login, search, role switching and Buddy in the published browser. Provider allowances apply across visitors; per-user limits do not guarantee provider capacity. Groq's free tier has model-specific token/request limits and is not unlimited production hosting. Set provider-wide usage limits and monitor failures before broader rollout.

Real-provider smoke tests establish inference connectivity and application response handling, not clinical accuracy. Automated reviewers can miss errors. This remains an educational/research reference; professional use requires appropriate human review and governance. No fine-tuning, adapter, medical-board certification or hallucination-free guarantee is implied.

## Research and legacy routes

When `MODEL_PROVIDER` is not `groq`, existing `MODEL_GENERAL_*` and `MODEL_PROFESSIONAL_*` settings remain available. The dedicated inference service and LoRA/QLoRA files in `inference/` remain separate research work. Previously failed adapter evaluations are not superseded by hosted-model smoke tests. Do not activate a research adapter solely because training completed.

## Primary references

- [Groq models](https://console.groq.com/docs/models)
- [Structured outputs](https://console.groq.com/docs/structured-outputs)
- [Reasoning controls](https://console.groq.com/docs/reasoning)
- [Rate limits](https://console.groq.com/docs/rate-limits)
- [Supabase authentication](https://supabase.com/docs/guides/auth)
