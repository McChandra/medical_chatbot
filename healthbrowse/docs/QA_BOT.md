# HealthBrowse dual-persona QA bot

The bot behaves as both **General** and **Clinicians** against the same application response contract. It tests direct answers, the six decks, Buddy follow-ups, citation integrity, complete sentences, emergency/privacy interception, response timing and differences between the two audiences. It produces a JSON record of every test and a Markdown report with specific proposed changes.

It does not create a real account, impersonate a licensed clinician, train models, or make automatic production changes. “Clinicians” is a reading mode. Clinical accuracy still needs expert review; keyword coverage and source-link checks cannot establish that every medical interpretation is correct.

## Run

```sh
npm run qa:bot -- --limit=4
```

The bot prompts for the Groq key without echo, or reads `GROQ_API_KEY` from the server environment. No key is written to reports. The first four tests exercise leukemia search and Buddy in both modes. Omit `--limit` for all 18 cases. Default spacing is 45 seconds to respect provider allowances. This run uses real Groq inference, a real in-memory SQL quota database and a local authentication fixture. It does not prove deployed login works.

Reports are written to ignored `qa-results/report.md` and `report.json`. Change the output directory with `--out=/absolute/path`. Cases are maintained in [qa/cases.json](../qa/cases.json); adding public questions there extends coverage without changing the runner. Use synthetic/public educational questions only.

## Test the published API

Provide `HEALTHBROWSE_QA_ACCESS_TOKEN` from a dedicated Supabase test-account session through a secret manager, then run:

```sh
npm run qa:bot -- --target=https://YOUR-PUBLISHED-SITE --limit=4
```

The same test user exercises both presentation modes. The server still enforces real authentication, request limits and privacy rules. Only the test token is sent to the selected HTTPS origin; the Groq key remains on the server. This is an API test, not a simulation of clicking Google sign-in or email verification. Tokens expire; do not commit them or use a real patient's account.

## Interpret the report

- **Error:** unavailable response, broken deck structure, missing citations, corrupted passages or failed safety interception. The command exits nonzero.
- **Review:** possible missed question facet, unexplained terminology, insufficient clinical detail, source gaps, repetition or slow response. Each finding includes an actionable suggestion. Review flags can be false positives and need judgment.
- **Pass:** software checks passed for that case. It is not a medical endorsement.

All generated website responses also go through the normal automatic citation/support checks. The QA bot adds repeatable tests and a comparison report; it cannot exhaustively test every possible human disease query.

## GitHub workflow

The repository's **HealthBrowse response QA** workflow is manually triggered. Store `GROQ_API_KEY` in GitHub Actions secrets to enable real-provider runs; the workflow fails clearly if it is missing. It uploads reports as artifacts and does not publish them into the website or modify application code. It uses the local authentication fixture. No recurring paid workload is enabled.

## Completed run

[12 November 2026 findings](../qa/reports/2026-11-12-groq-qa.md): 8/8 real-provider response cases passed software checks; 4/4 privacy/emergency checks passed; four quality-review suggestions remain. The report preserves limitations and the Buddy defect found and fixed.

## Hosting-runtime regression

`npm test` now runs the API inside Cloudflare workerd through Miniflare, including General and Clinicians search, Buddy, account settings, invalid sessions, and refused upstream redirects. Authentication and model replies are fixtures in this regression; D1 is real local storage. The separate provider smoke test uses actual Groq. Neither replaces a signed-in production check.

The runtime regression was added after production returned HTTP 503 before any upstream request: Workers rejected `redirect: error`. Server requests now use `manual` and reject non-success statuses without forwarding credentials. Older compatibility dates also need the HTTP no-store header instead of the unsupported fetch cache option, and may omit incoming Request.signal.
