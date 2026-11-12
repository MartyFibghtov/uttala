# Uttala

Pronunciation coaching as a web service. Learners read a text aloud, see which words a listener would miss, compare their rhythm and melody with a native voice, and drill the weak spots. 17 languages, three levels, free and paid plans.

## Run locally

```bash
cp .env.example .env.local      # fill in ELEVENLABS_API_KEY and BETTER_AUTH_SECRET
pnpm install
pnpm dev
```

The database is a local SQLite file (`.data/uttala.db`) and its tables are created on first request. Without Stripe keys every feature is unlocked and nothing is sold, which is convenient for development.

## What is in the box

| Area | How it works |
| --- | --- |
| Accounts | Email and password (optional Google), password reset, account deletion. [Better Auth](https://better-auth.com) on libSQL. |
| Scoring | ElevenLabs Scribe (what was heard), Forced Alignment (where each word is and how well it fits), text-to-speech with timings (reference). Pitch tracking and rhythm/melody comparison run in the browser. Azure Pronunciation Assessment adds sound-by-sound scores when configured. |
| Levels | `src/lib/levels.ts`. Beginner: short phrases with meaning and romanisation, slow playback, lenient scoring. Intermediate: sentences. Advanced: hard passages, strict scoring, more weight on rhythm and melody. |
| Voices | Voices from your ElevenLabs account, grouped into roles (teacher, everyday, storyteller, presenter, creator, character). "Auto" picks a native voice suited to the level. |
| Plans | `src/lib/plans.ts` is the single place for prices, limits and feature lists. Limits are enforced on the server in `/api/assess` and `/api/tts`. |
| Payments | Stripe Checkout for sign-up, the Customer Portal for changes and cancellation, a signed webhook that keeps plans in sync. |
| Home | Daily plan (drills due, next course unit, ear training, a free reading), points goal, streak and rank. `src/components/home-view.tsx`. |
| Course | Seven phrasebook units of four phrases in every language (`src/lib/course.ts`), with meanings, romanisation and up to three stars per phrase. |
| Sound library | Guides to the sounds learners get wrong in each language: how to make them, what to watch for, practice words (`src/lib/sounds.ts`). Sound-level scores link to the matching guide. |
| Drills | Unclear words are collected automatically. Three clear takes in a row, then spaced checks after 2 and 7 days, then mastered (`recordAttempt` in `src/lib/store.ts`). Listening drills use minimal pairs (`src/lib/minimal-pairs.ts`) and track accuracy per contrast. |
| Checkpoint | Three fixed readings scored at one strictness, giving a comparable number and a recommended level. |
| Motivation | Points, daily goal, streaks, ranks and 18 achievements (`src/lib/gamification.ts`). Points measure practice, not skill. |
| Progress | Practice calendar, score trend, five skills with change over time, checkpoints, achievements. History, course progress and drill list are kept in the browser and synced to the account (`/api/state`). Audio is never stored. |
| Community | Opt-in weekly league and private classes with a join code; teachers see each learner's weekly points, recordings, average and last active day. Points are awarded on the server in `/api/assess` (`src/lib/server/community.ts`). |
| Reminders | Opt-in email when a learner has gone quiet, sent by `GET /api/cron/reminders` (needs `CRON_SECRET` and Resend; `vercel.json` schedules it daily). Each email carries a signed unsubscribe link. |
| Public site | Landing, features, method, help (with FAQ structured data), pricing, and one page per language generated from the content files. Light and dark themes. |

Background on the method: [docs/research.md](docs/research.md).

## Pricing

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Price | $0 | $9.99 / month or $79.99 / year | $19.99 / month or $149.99 / year |
| Recordings analysed per day | 5 | 60 | 250 |
| Own texts, choice of voice, rhythm and melody | – | Yes | Yes |
| Sound-by-sound scoring | – | – | Yes |
| Drill list | 5 weakest words | Unlimited | Unlimited |

New subscribers get a 7-day trial. Pro is only offered when Azure Speech is configured, because sound-by-sound scoring is what it sells.

Why this shape: the free plan is enough to reach the first useful result (activation) but its daily cap and locked melody chart create natural upgrade moments; Plus is the default choice and carries everything most learners need; Pro anchors the price and serves the "sound native" audience. Yearly billing is preselected and shown as a monthly figure.

Rough cost per analysed recording is 1–2 US cents (transcription, alignment, optional Azure). Reference audio for built-in texts is generated once and cached in the database; custom texts are capped per day per plan.

## Going live

1. **Host and database.** Deploy to any Node host that runs Next.js (Vercel works as is). Create a hosted libSQL database (for example Turso) and set `DATABASE_URL` and `DATABASE_AUTH_TOKEN`. A local file database does not survive serverless deployments.
2. **Secrets.** Set `ELEVENLABS_API_KEY`, `BETTER_AUTH_SECRET` (`openssl rand -hex 32`), `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` (your https address). Store keys in your host's secret manager, not in the repository.
3. **Stripe.**
   - Create a restricted key (`rk_…`) and set it as `STRIPE_SECRET_KEY`.
   - Run `pnpm stripe:setup --webhook https://your.site`. It creates the two products, four prices, the portal configuration and the webhook endpoint, and prints `STRIPE_PORTAL_CONFIGURATION` and `STRIPE_WEBHOOK_SECRET` to add to your environment.
   - Do this once in a sandbox and once in live mode. To test webhooks locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
   - Tax: Stripe collects no tax until you register in Stripe Tax. After registering, set `STRIPE_AUTOMATIC_TAX=true`. See [Collect taxes for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes).
4. **Email.** Set `RESEND_API_KEY` and `EMAIL_FROM` so password-reset emails are delivered. Until then, reset links only appear in the server log.
5. **Voices.** Add at least one native voice per language you want to promote to your ElevenLabs account ("My Voices"). Voices are matched by their language label; without a native voice the app falls back to a multilingual one and says so in the picker.
6. **Legal.** Set `NEXT_PUBLIC_COMPANY_NAME` and `NEXT_PUBLIC_CONTACT_EMAIL`, then have `/terms` and `/privacy` (`src/components/legal.tsx`) reviewed for your jurisdiction. They are a sound starting point, not legal advice.
7. **Optional.** `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` switch on sound-by-sound scoring and the Pro plan. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` add "Continue with Google".

### Before taking real payments

- Run a full test purchase in a Stripe sandbox: subscribe, switch plan in the portal, cancel, and let a test card fail. Confirm the plan on `/account` follows each change.
- Calibrate scoring. `ALIGNMENT_LOSS_SCALE` and the thresholds in `src/lib/levels.ts` are sensible defaults (a native reference voice scores about 90), but they have not been tuned against rated learner recordings.
- Disputes and early fraud warnings stop the subscription from renewing and flag the customer (`subscription.flagged`). Review flagged customers by hand.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm stripe:setup` | Create or update Stripe products, prices, portal and webhook |

## Layout

- `src/app/(marketing)` landing, features, languages, method, help, pricing, terms, privacy
- `src/app/(auth)` sign-in, sign-up, password reset
- `src/app/(app)` onboarding, home, learn, practice, drills, sounds, progress, assessment, account (behind sign-in)
- `src/app/api` auth, account, scoring, reference voice, billing, Stripe webhook
- `src/lib/server` database, auth, ElevenLabs, Azure, Stripe, plan enforcement
- `src/lib` plans, levels, language content (texts, course, sounds, minimal pairs), points and achievements, text alignment, audio and prosody maths

The language translations, romanisations and sound guides in `src/lib/course.ts` and `src/lib/sounds.ts` were written without native-speaker review. Have each language checked before promoting it.
- `src/proxy.ts` redirects signed-out visitors away from the app
