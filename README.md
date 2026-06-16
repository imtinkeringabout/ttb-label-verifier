# TTB Label Verifier

AI-powered compliance screening for alcohol beverage labels. An agent uploads a
label photo; a vision model extracts the TTB-required fields; the app compares them
against the application data and returns a **per-field PASS / REVIEW / FAIL** with an
overall determination — in a few seconds, single or in batches.

> Prototype / proof-of-concept. Not for official use. Every result is meant to be
> confirmed by a human agent.

---

## Table of contents
- [What it does](#what-it-does)
- [How it maps to the stakeholders](#how-it-maps-to-the-stakeholders)
- [Architecture](#architecture)
- [Security & abuse controls](#security--abuse-controls)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Run it locally](#run-it-locally)
- [Configuration](#configuration)
- [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)
- [Switching the AI provider](#switching-the-ai-provider)
- [Test labels](#test-labels)
- [Assumptions, trade-offs & limitations](#assumptions-trade-offs--limitations)

---

## What it does

1. **Upload** a label image (drag-drop or browse).
2. *(Optional)* type the application/COLA field values to compare against.
3. **Run verification** — a vision model extracts brand name, class/type, ABV, net
   contents, producer name/address, country of origin, and the government warning.
4. **Read the verdict** — each field is PASS / REVIEW / FAIL / MISSING with a short
   reason, plus an overall **APPROVED / NEEDS REVIEW / REJECTED**.
5. **Batch mode** — drop many labels and screen them all against TTB standard
   requirements; expand any row for field-level detail.

## How it maps to the stakeholders

The interview notes drove specific decisions:

| Stakeholder | Concern | How this app responds |
|---|---|---|
| **Sarah** (Deputy Director) | The last vendor took 30–40s; "if we can't get results in ~5s, nobody uses it." | One vision call per label, fast model (Gemini Flash / Claude Haiku), no heavy pipeline. |
| **Sarah / Janet** | Big importers dump 200–300 applications at once. | **Batch mode** queues many labels and screens each. |
| **Sarah's "73-year-old benchmark"** | Half the team is 50+, varied tech comfort. | Clean two-panel layout, big labelled buttons, no hunting. Plain PASS/FAIL language. |
| **Dave** (28 yrs) | "STONE'S THROW" vs "Stone's Throw" is the same thing — needs judgment, not blind pattern-matching. | Fuzzy comparison: case/punctuation/whitespace differences **pass**; only genuine mismatches **fail**; partial overlaps become **REVIEW**. |
| **Jenny** (junior) | The government warning must be exact, "GOVERNMENT WARNING:" bold all-caps; people get creative. | The warning gets **stricter** handling than other fields: checked against the exact TTB text, with a model-reported formatting note (bold/caps header, completeness). |
| **Jenny** | Labels are sometimes shot at an angle / with glare. | The model reports image-quality issues in `raw_notes`; vision models tolerate moderate skew/glare far better than the old OCR vendor. |
| **Marcus** (IT) | No COLA integration; PII/retention concerns; firewall blocks many ML endpoints. | Standalone, **stores nothing**, no COLA coupling. Single outbound dependency (the model API) documented for allow-listing. |

## Architecture

```
┌──────────────┐   POST /api/analyze    ┌─────────────────────────┐   ┌──────────────┐
│  Browser     │  { image, mediaType,   │  Cloudflare Pages        │   │  Model API   │
│  (React UI)  │ ─ accessCode } ──────▶ │  Function (same origin)  │ ─▶│  Gemini /    │
│              │ ◀──── { extracted } ── │  • access gate           │   │  Claude /    │
└──────────────┘                        │  • rate limit (KV)       │   │  Ollama      │
                                        │  • input validation      │   └──────────────┘
                                        │  • holds the API key     │
                                        └─────────────────────────┘
```

The key design rule: **the browser never calls the model provider directly and never
holds an API key.** It only ever talks to our own same-origin `/api/*` endpoints. The
serverless Function holds the secret, enforces access + limits, then proxies the call.

> Why the proxy: calling a model API directly from the browser would expose the API
> key to anyone who opened DevTools — once the URL leaked, the key could be drained
> within hours. Keeping every model call server-side is what makes a public,
> key-backed demo safe to share.

## Security & abuse controls

Because this is a public URL with a paid/quota'd model behind it, the design assumes
it *will* be found. Layers, cheapest check first:

1. **Access gate** — a shared access code (server-side `ACCESS_CODE`) gates the whole
   tool. Wrong code is rejected at `/api/health` before any model call. Constant-time
   comparison. Share the code with reviewers; rotate it any time.
2. **Per-IP rate limit** — default 20 scans/hour/IP (Workers KV).
3. **Global daily cap** — default 200 scans/day total. This is the **hard ceiling**:
   even if the code leaks, total spend/quota burn physically can't exceed it. Returns
   HTTP 429 with a friendly message.
4. **Locked server-side prompt + `max_tokens` cap** — the system prompt and output
   shape live on the server, so the endpoint can't be repurposed as a free general LLM.
5. **Input validation** — media-type allow-list (jpeg/png/webp) and a size cap
   (default 5 MB) reject junk before it costs a call.
6. **No storage** — images are processed in-memory and discarded. Nothing is persisted
   (addresses Marcus's PII/retention point).
7. **Optional Cloudflare Turnstile** — set `TURNSTILE_SECRET` + `VITE_TURNSTILE_SITEKEY`
   to require a bot check. Inert if unset.
8. **`noindex`** + security headers (`X-Frame-Options`, `nosniff`, restrictive
   `Permissions-Policy`) on every response.

All limits are env-configurable (`RL_GLOBAL_PER_DAY`, `RL_IP_PER_HOUR`, `MAX_IMAGE_MB`).
Rate limiting activates once a `RATE_LIMIT` KV namespace is bound; without it the app
still runs (just unthrottled), so local dev needs zero setup.

## Tech stack

- **Frontend:** React 18 + Vite. Inline style tokens (federal navy + amber), Inter +
  JetBrains Mono. No UI framework — small, fast, legible.
- **Backend:** Cloudflare Pages Functions (Workers runtime) — same-origin serverless,
  no separate server to run.
- **Rate limiting:** Cloudflare Workers KV.
- **AI:** pluggable vision provider — **Gemini Flash** (default, free tier), **Claude
  Haiku** (optional), or **local Ollama** (optional). One env var switches it.
- **Tests:** Node's built-in test runner over the pure comparison logic.

## Project structure

```
ttb-label-verifier/
├── index.html
├── vite.config.js              # dev proxy: /api -> local wrangler
├── wrangler.toml               # Pages config, vars, KV binding (commented template)
├── src/
│   ├── main.jsx
│   ├── App.jsx                 # UI: single + batch modes, results, gate wiring
│   ├── api.js                  # browser client for /api/* (+ access code handling)
│   ├── components/Gate.jsx     # access-code screen
│   └── lib/compare.js          # pure PASS/REVIEW/FAIL comparison logic (tested)
├── functions/                  # Cloudflare Pages Functions (server-side)
│   ├── _middleware.js          # security headers
│   └── api/
│       ├── analyze.js          # main endpoint: gate -> ratelimit -> validate -> model
│       ├── health.js           # authed ping for the gate + quota
│       ├── _lib/               # auth, ratelimit, turnstile, shared extraction schema
│       └── _providers/         # gemini | claude | ollama (same normalized output)
├── test/compare.test.js
└── test-labels/                # how to generate/source sample labels
```

## Run it locally

Prereqs: Node 18+ (works on 24).

```bash
npm install

# Frontend only (UI work; model calls will 502 without a backend):
npm run dev                       # http://localhost:5173

# Full stack (UI + functions + a real model call):
cp .dev.vars.example .dev.vars    # then add GEMINI_API_KEY, set ACCESS_CODE
npm run build
npm run pages:dev                 # wrangler serves dist/ + functions on :8788
#   in a second terminal:
npm run dev                       # Vite proxies /api -> :8788
```

Get a free Gemini key at <https://aistudio.google.com/apikey>. Leave `ACCESS_CODE`
blank in `.dev.vars` to skip the gate while developing.

Run the unit tests:

```bash
npm test
```

## Configuration

Server-side (set in the Cloudflare dashboard for production, `.dev.vars` for local):

| Var | Default | Purpose |
|---|---|---|
| `PROVIDER` | `gemini` | `gemini` \| `claude` \| `ollama` |
| `ACCESS_CODE` | *(unset = open)* | Shared code reviewers must enter |
| `GEMINI_API_KEY` | — | Gemini key (when `PROVIDER=gemini`) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Override the Gemini model id |
| `ANTHROPIC_API_KEY` | — | Claude key (when `PROVIDER=claude`) |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Override the Claude model id |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `localhost:11434` / `llama3.2-vision` | Local Ollama |
| `RL_GLOBAL_PER_DAY` | `200` | Global daily scan cap |
| `RL_IP_PER_HOUR` | `20` | Per-IP hourly cap |
| `MAX_IMAGE_MB` | `5` | Max upload size |
| `TURNSTILE_SECRET` | *(unset = off)* | Enable Turnstile bot check |

Frontend (public, `.env`): `VITE_TURNSTILE_SITEKEY` (only if using Turnstile).

## Deploy to Cloudflare Pages

Cloudflare builds in the cloud, so you don't need wrangler installed locally.

1. **Push to GitHub** (this repo).
2. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.**
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Settings → Environment variables** — add `GEMINI_API_KEY` and `ACCESS_CODE`
   (mark them **Encrypted**). Optionally override `PROVIDER`, the caps, etc.
4. **Enable rate limiting:** create a KV namespace
   (`npx wrangler kv namespace create RATE_LIMIT`, or in the dashboard) and bind it as
   `RATE_LIMIT` under **Settings → Functions → KV namespace bindings**. Redeploy.
5. Visit the `*.pages.dev` URL, enter the access code, and test.

Hand reviewers the URL **and** the access code in your submission.

## Switching the AI provider

Set `PROVIDER` and the matching key — no code change:

- **`gemini`** *(default)* — free tier, vision, fast. Best $0 public-demo option.
- **`claude`** — most accurate on the strict warning/formatting checks; pennies per
  scan, bounded by the rate limits.
- **`ollama`** — fully local/$0, but Cloudflare's edge can't reach `localhost`, so this
  is for local `wrangler pages dev` or a self-hosted deploy. Pull a vision model first
  (`ollama pull llama3.2-vision`).

All three return the same normalized field shape, so the UI and comparison logic are
provider-agnostic.

## Test labels

See [`test-labels/README.md`](test-labels/README.md) for prompts to generate synthetic
labels and a suggested test matrix (case mismatches, missing/ reworded warnings, angled
photos).

## Assumptions, trade-offs & limitations

- **No COLA integration** (per Marcus) — standalone; the "application data" is typed in
  or, in batch mode, omitted so labels are screened against TTB standard requirements.
- **Comparison is intentionally fuzzy.** Pure string equality would wrongly fail
  `45% Alc./Vol.` vs `45% alc/vol`. The trade-off: a deliberately reworded value that
  happens to overlap can surface as REVIEW rather than FAIL — by design a human makes
  the final call (Dave's point).
- **The government warning check is heuristic.** Truly verifying bold + all-caps + exact
  font size from a photo is hard; the model reports what it can, and anything non-exact
  is escalated to REVIEW rather than silently passed (Jenny's point).
- **Rate limiting is best-effort.** Workers KV is eventually consistent, so the caps can
  be slightly exceeded under bursty concurrency — fine for protecting a demo/free tier,
  not a billing-critical hard limit. Durable Objects would make it transactional.
- **Free-tier model limits.** Gemini's free tier has its own rate limits; the global
  daily cap is set conservatively below them so reviewers always have quota.
- **Latency.** Typically a few seconds per label (meets Sarah's ~5s bar); very large
  images or cold starts can be slower — hence the size cap.
- **Not a legal determination.** This screens and flags; it does not approve labels.
