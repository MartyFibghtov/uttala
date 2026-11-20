# SayClear end-to-end tests

Playwright suite that drives a production build of the app (`next build` + `next start` on port 3100) against a
local mock of every third-party service. No real keys, network or money are involved.

## Run

By default the tests use the system Google Chrome (`channel: "chrome"`). In CI run `pnpm exec playwright install chromium` and set `E2E_CHANNEL=chromium`.

```bash
pnpm exec playwright install chromium   # once
pnpm e2e                                # builds, starts mock + app, runs desktop and mobile projects
E2E_SKIP_BUILD=1 pnpm e2e               # reuse the existing .next build
E2E_REUSE=1 pnpm e2e                    # reuse already running app (3100) and mock (12111)
pnpm e2e:ui                             # interactive UI mode
pnpm exec playwright show-report e2e/.report
```

The web servers are started by `playwright.config.ts`. The database is `.data/e2e.db`, deleted at every start.
If a run says a port is "already used", kill leftovers on 3100 / 12111.

## What is mocked (`e2e/mock-server.ts`, 127.0.0.1:12111)

| Service | Env override | Mocked behaviour |
| --- | --- | --- |
| ElevenLabs | `ELEVENLABS_API_BASE` | voices (en, sv, es), TTS with timestamps (a voiced WAV, 0.35 s/word), forced alignment, speech-to-text echoing the last target text |
| OpenAI | `OPENAI_API_BASE` | chat completions with minimal JSON |
| Resend | `RESEND_API_BASE` | captures emails; read them at `GET /__mock/emails` |
| Stripe | `STRIPE_API_BASE` | customers, prices, checkout sessions, portal sessions, subscriptions, charges; hosted checkout (`/__mock/checkout/:id`, "Pay") and portal (`/__mock/portal/:id`) pages that update state and send correctly signed webhooks |
| Azure Speech | `AZURE_SPEECH_ENDPOINT` | not configured (Pro is not offered) |

Test hooks: `POST /__mock/stt-override {word, heard}` (make a word misheard), `{fail:true}`, `{reset:true}`,
`POST /__mock/reset`, `POST /__mock/stripe/event {type, object, signed}`.

The browser uses Chromium's fake microphone fed by a generated voiced-tone WAV (`e2e/.tmp/fake-mic.wav`).
`/api/sound-check` uses the real phone model (downloaded and cached under `.data/models` on first use).

## Live smoke against real services

Do not use the mock: start the app with real keys (`.env.local`, Stripe in test mode) and run only read-light specs:

```bash
E2E_REUSE=1 pnpm exec playwright test e2e/tests/marketing.spec.ts e2e/tests/auth.spec.ts
```

with `baseURL` overridden by editing `use.baseURL` or running the app on 3100. Billing, practice and unsubscribe specs
depend on the mock hooks and must not be run against live services.

## CI

`.github/workflows/ci.yml` runs on every push and pull request (superseded runs are cancelled):

- `check`: `pnpm typecheck` and `pnpm lint`.
- `e2e`: installs Chromium (`playwright install --with-deps chromium`), runs `pnpm e2e` with `E2E_CHANNEL=chromium` (the config builds the app and starts the mock and standalone servers itself). The phone model in `.data/models` is cached with `actions/cache`, keyed on the model id and `scripts/fetch-model.mjs`, and downloaded on a miss. The Playwright report (`e2e/.report`, `e2e/.results`) is uploaded as an artifact on failure.
- `docker`: builds the Dockerfile for linux/amd64, runs the container with a temp `/data` volume and fake keys, and fails unless `/api/health` returns 200 within 120 s, the log shows `[sound-model] ready in ...ms`, `onnxruntime-node` and `libsql` load inside `/app`, and `GET /` returns 200. It also prints the image size.

## Live smoke (real ElevenLabs, OpenAI, Azure)

`pnpm e2e:live` runs `e2e/live/*.spec.ts` with `playwright.live.config.ts`: the standalone app on port 3200 (fresh `.data/e2e-live.db`),
API keys read from `.env.local` at run time (never copied), real engine endpoints, and Stripe/Resend still on the local mock.
Global setup makes one ElevenLabs TTS call and writes `e2e/.tmp/live-speech.wav` for Chrome's fake microphone. A run spends about 5 analyses.
Uses the existing `.next` build; `E2E_LIVE_BUILD=1` rebuilds first.

## Real Stripe (test mode)

`pnpm e2e:stripe` runs `e2e/stripe/stripe.spec.ts` with `playwright.stripe.config.ts` against your Stripe sandbox. It needs
`STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_PORTAL_CONFIGURATION` and `STRIPE_WEBHOOK_SECRET` in `.env.local` (from `pnpm stripe:setup`
and `stripe listen --print-secret`) and the Stripe CLI. The global setup starts `stripe listen` to forward real webhooks to the app on
port 3300. The test pays on hosted Checkout with card 4242, checks the trial subscription in Stripe, opens the billing portal,
switches to Pro and cancels through the Stripe API (as the portal would), waits for the app to follow each webhook, then deletes
the account and checks the Stripe customer is gone. Engines and email stay on the mock. It does not use the shared fixture:
Stripe blocks the fake `X-Forwarded-For` header that fixture adds.
