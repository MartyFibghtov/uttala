# Product review: SayClear at launch

Product owner sign-off, 2026-11-20. This records what the product is, who it is for, how it earns money, and why that is fair to the learner. It is the reference for copy, pricing and upsell decisions after launch. Go-to-market detail lives in `docs/marketing-plan.md`.

## Position

**One line:** SayClear shows you, word by word, which parts of a short sentence a listener would miss, then turns those words into drills.

**Promise:** being understood (intelligibility), not a native accent. The Method page says plainly that no tool can promise a native accent, and the marketing copy follows that. The home H1 is "Find the words a listener would miss. Then fix them."

**Who it is for, in launch order:**
1. Swedish learners in Sweden (expats, professionals; SFI students reached through teachers). The founder's home market; the big English-only competitors don't serve it.
2. Non-native English speakers who need to be understood at work. Largest paying market and our best-validated language.
3. Self-directed learners of the other 15 languages, reached through public sound guides (long-tail SEO).

**Why us, honestly:**
- 17 languages, one short sentence at a time, so the free plan actually teaches.
- "Heard as": an independent recogniser shows what a listener without the script heard.
- Recordings are analysed and never stored. This includes the precise sound check, which runs on our server in memory.
- Classes are free for teachers.
- Every result says which check produced it.

**What we do not claim:**
- Native-accent scoring.
- Sound-by-sound server scores outside English. Pro's Azure scores are English only, and the copy says so. Every language gets the precise sound check on every plan.
- Ratings or reviews we don't have. The structured data has none.
- Competitor prices.

## Plans

| | Free | Plus | Pro |
|---|---|---|---|
| Price | 0 | $9.99/mo, $79.99/yr (99/799 SEK, €9.99/€79.99) | $19.99/mo, $149.99/yr (199/1490 SEK, €19.99/€149.99) |
| Analysed recordings/day | 5 | 60 | 250 |
| Own texts, voice choice, rhythm & melody vs a native voice | – | ✓ | ✓ |
| Sound-by-sound server scores (English) | – | – | ✓ |
| Drill list | 5 weakest words | unlimited | unlimited |

The 7-day trial is once per person; a hashed email blocks repeat trials after deletion. A card is required, Stripe sends the trial-ending reminder, and cancelling takes two clicks in the Stripe portal.

**Why this is not a money drain:**
- Free is a complete learning loop: course, sound library, ear training, drills, checkpoint and progress. Five analysed recordings a day is enough to improve a little every day.
- Paid plans sell volume, your own material and depth (melody, sound-level detail). They don't sell the right to see your own results.

## Upsell rules (implemented; keep them)

1. Never block a result the learner has already recorded, and never show an upsell before the first result.
2. Upgrade prompts appear only at real value moments:
   - **Daily cap reached:** shows when recordings return, in local time, and what stays free.
   - **After a good take (score ≥ 70):** the real native melody chart, with "Plus draws your line on top".
   - **Drill list full:** names the exact words that were left out.
   - **Locked feature clicked:** only when the learner clicks it.
3. Every prompt states the full deal: "Plus: 7 days free, then $9.99 a month or $79.99 a year. Cancel anytime in two clicks." It always offers "Not now".
4. Cadence: at most one unprompted card per day; "Not now" silences them for 7 days.
5. No dark patterns: no countdowns, no confirmshaming, no pre-ticked options, no guilt copy. Monthly is the default interval in the app, so nobody is nudged into a yearly charge they didn't pick.
6. Failures never cost the learner. If an engine fails, or we hit the global capacity cap, the allowance is not spent and the message says so.

## Cost and risk controls

- `GLOBAL_DAILY_ANALYSES_CAP` caps daily spend on paid engines.
- Per-user limits apply to analyses, TTS characters, generated texts, sound checks (30/min, 2 in flight) and progress saves.
- Request bodies are size-limited, auth endpoints are rate-limited, and all origins are explicitly trusted.
- Disputes and early-fraud warnings cancel the subscription and flag the customer.

## Verification

- 44 end-to-end tests pass on desktop and mobile against the production (standalone) server, with mocked Stripe, ElevenLabs, OpenAI and email and the real sound model. They cover marketing and SEO routes, sign-up and sign-in, password reset, practice, drills, the daily limit with its upgrade prompt, checkout → trial → Plus features → plan switch → cancel → delete, data export, unsubscribe, webhooks and security headers.
- 6 live tests pass against the real ElevenLabs, OpenAI and Azure engines (`pnpm e2e:live`).
- Real Stripe test mode passes end to end (`pnpm e2e:stripe`): hosted Checkout shows "7 days free, then SEK 99.00 per month" and SEK 0.00 due today, card 4242 starts a trialing Plus subscription, the webhook updates the app, the billing portal opens, switching to Pro and cancelling are reflected in the app, and deleting the account deletes the Stripe customer.
- CI (GitHub Actions) is green: type check and lint, the full e2e suite, and a Docker job that builds the image, starts it, waits for `/api/health`, and confirms the 240 MB sound model loads inside the container (about 0.7 s).

## What the founder must do (cannot be done for you)

1. **Keys and deploy:** follow `docs/deploy-railway.md` (environment variables, volume at `/data`, cron service, domain).
2. **Stripe:** the sandbox is set up and tested. For launch, run `pnpm stripe:setup --webhook https://your.site` once with the live key, following `docs/stripe-launch-checklist.md`, and turn on trial-ending reminder emails in the Dashboard, since this can't be done by API.
3. **Human sign-offs:**
   - Read the short list of Swedish items in `docs/content-review.md` (a fact-check against published sources is done).
   - Have the terms and privacy text reviewed.
   - Confirm EU VAT / OSS registration with your accountant before enabling `STRIPE_AUTOMATIC_TAX`.
4. **Ads:** spend only after Stripe is live and Azure Speech is on S0 (`docs/marketing-plan.md`). Organic work can start on day one.
