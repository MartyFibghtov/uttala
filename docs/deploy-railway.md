# Deploying SayClear on Railway

One web service (built from the `Dockerfile`), one volume holding the SQLite database, and one small cron service for reminder emails. Run a single replica: SQLite on a volume cannot be shared by several instances.

What the image contains: the Next.js standalone server, plus the 240 MB phone-recognition model. The model runs on the server (onnxruntime-node), so learners download nothing: the browser sends each recording to `POST /api/sound-check` and gets scores back. The weights are downloaded from Hugging Face during the image build (`scripts/fetch-model.mjs`) and read from `/app/models` at runtime; the first build takes a few minutes longer, later builds reuse the cached layer. The server loads the model at start-up.

### Size the service: memory and CPU

Measured locally (Apple M-series, 10 cores, Node 26, q4 weights, `onnxruntime-node` 1.21):

| | Result |
| --- | --- |
| Model load | about 0.8 s from local disk, RSS rises from 90 MB to about 650 MB |
| 5 s clip | about 0.65 to 0.75 s per inference, RSS about 730 MB |
| 13 s clip (the maximum) | about 1.7 s, RSS about 810 MB |
| Standalone server after warm-up | about 900 MB RSS |

Each rated recording makes two inferences (the learner and the reference), so about 1.5 s of one-core-equivalent compute on a fast machine for a 5 s sentence. Railway containers have fewer and slower vCPUs than a laptop: plan for 2 to 4 times longer, so 3 to 6 s per recording under load, and concurrent learners queue (one inference at a time per instance, a waiting line of 12, then HTTP 503 "busy"; tune with `SOUND_MODEL_CONCURRENCY`). Practical sizing:

- **Memory: provision at least 2 GB** (about 1 GB used, headroom for traffic spikes and Next.js). Do not set a memory limit below 1.5 GB or the container will be killed when the model loads.
- **CPU: 2 vCPU minimum; 4 is comfortable** for tens of simultaneous learners.
- The Hobby plan allows up to 8 GB RAM and 8 vCPU per service (Pro: more; confirm on railway.com/pricing), which is plenty. You pay for what is used, so a warm 1 GB process costs roughly $10 per month of memory at Railway's per-GB-month rate; CPU is billed by use.
- This is the main cost driver of the app. If it grows, move to the Pro plan or raise the per-service limits before adding replicas (SQLite on a volume needs a single instance).

## 1. Create the project

1. Push the repository to GitHub.
2. In Railway: **New Project > Deploy from GitHub repo**, pick the repository. Railway detects the `Dockerfile` and uses it. Do not add a `railway.json`.
3. Open the service **Settings** tab:
   - **Networking > Generate Domain** (gives `<name>.up.railway.app`; add your own domain in step 4).
   - **Deploy > Healthcheck Path**: `/api/health`
   - **Deploy > Restart Policy**: On Failure.
   - **Scale / Replicas**: keep at 1 (the default). Leave region as is. Make sure the service can use at least 2 GB of memory and 2 vCPU (see "Size the service" above).
4. Do not click deploy yet if you want everything in place first: the first build starts automatically, and it is fine if it runs before the variables are set. Redeploy after step 3.

## 2. Add the volume

1. On the project canvas press `Ctrl/Cmd+K` > **Create Volume** (or right-click the canvas > **Volume**), attach it to the SayClear service.
2. **Mount path: `/data`.**
3. Railway sets `RAILWAY_VOLUME_MOUNT_PATH=/data` automatically. The app then stores its database at `/data/sayclear.db` and creates the tables on first start. The container entrypoint fixes the ownership of `/data` (Railway mounts volumes as root) and then runs the server as an unprivileged user, so you do not need `RAILWAY_RUN_UID`.

Do not set `DATABASE_URL` unless you want Turso instead of the volume.

## 3. Variables

Service > **Variables** > **Raw Editor** lets you paste them in one go. `NEXT_PUBLIC_*` values are baked in at build time, so changing one needs a redeploy (Railway rebuilds on variable change).

| Name | Required | Example | Where to get it |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | 64 hex characters | `openssl rand -hex 32`. Keep it stable: changing it signs everyone out. |
| `BETTER_AUTH_URL` | yes | `https://sayclear.app` | Your public https address, no trailing slash. |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://sayclear.app` | Same value as above. |
| `ELEVENLABS_API_KEY` | yes | `sk_...` | elevenlabs.io > Developers > API keys. |
| `OPENAI_API_KEY` | yes | `sk-...` | platform.openai.com > API keys. |
| `NEXT_PUBLIC_COMPANY_NAME` | recommended | `SayClear Ltd` | Shown in footer and legal pages. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | recommended | `support@sayclear.app` | Shown in legal pages. |
| `RESEND_API_KEY` | recommended | `re_...` | resend.com > API Keys. Without it, password-reset links only go to the server log, and reminders are off. |
| `EMAIL_FROM` | with Resend | `SayClear <hello@sayclear.app>` | A sender on a domain verified in Resend (step 7). |
| `CRON_SECRET` | for reminders | 48+ random characters | `openssl rand -hex 24`. Same value on the cron service. |
| `STRIPE_SECRET_KEY` | for payments | `rk_live_...` | Stripe > Developers > API keys (restricted key; scopes are listed in `.env.example`). |
| `STRIPE_WEBHOOK_SECRET` | for payments | `whsec_...` | From step 6 or `pnpm stripe:setup`. |
| `STRIPE_PORTAL_CONFIGURATION` | for payments | `bpc_...` | Printed by `pnpm stripe:setup`. |
| `STRIPE_AUTOMATIC_TAX` | no | `true` | Only after registering in Stripe Tax. |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | no | `...`, `westeurope` | Azure portal > Speech resource > Keys. Enables sound-by-sound scoring and the Pro plan. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | `...apps.googleusercontent.com` | Step 5. Enables "Continue with Google". |
| `OPENAI_MODEL`, `ELEVENLABS_TTS_MODEL`, `ELEVENLABS_STT_MODEL` | no | `gpt-4o` | Model overrides. |
| `SOUND_MODEL_CONCURRENCY` | no | `1` | Parallel model inferences per instance (default 1; raise on a many-core service). |
| `DATA_DIR` | no | `/data` | Only if you mount the volume somewhere else, or want to force a directory. |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | no | `libsql://x.turso.io` | Only for hosted Turso instead of the volume. |

If you have no custom domain yet, use the generated `https://<name>.up.railway.app` for `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL`, then switch both when the domain is ready.

## 4. Custom domain and DNS

1. Service > **Settings > Networking > Custom Domain** > enter `sayclear.app` (or `www.`/`app.` subdomain).
2. Railway shows a `CNAME` target (e.g. `xxxx.up.railway.app`) and a `TXT` verification record. Add both at your DNS provider.
   - Subdomain: `CNAME app -> xxxx.up.railway.app`.
   - Apex/root domain: use a provider that supports CNAME flattening/ALIAS (Cloudflare, etc.), or use `www` and redirect the apex to it. If you use Cloudflare, set the record to **DNS only** (grey cloud) until Railway shows the domain as verified.
3. Wait for the green check; the TLS certificate is issued automatically.
4. Update `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` to the final https address.

## 5. Google sign-in (optional)

Google Cloud console > APIs & Services > Credentials > **Create credentials > OAuth client ID** > Web application.

- Authorized JavaScript origin: `https://<domain>`
- Authorized redirect URI: `https://<domain>/api/auth/callback/google`

Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Publish the OAuth consent screen when ready for real users.

## 6. Stripe webhook

If you did not run `pnpm stripe:setup --webhook https://<domain>`:

1. Stripe Dashboard > Developers > Webhooks > **Add endpoint**.
2. URL: `https://<domain>/api/stripe/webhook`
3. Select the subscription, invoice, checkout, charge dispute and early fraud warning events listed in `scripts/stripe-setup.mjs`.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Repeat in test mode and live mode with the matching keys.

## 7. Resend (email)

1. resend.com > **Domains > Add Domain**, enter your domain.
2. Add the DKIM (`TXT`), SPF (`TXT`/`MX` on the `send` subdomain) and, optionally, DMARC records Resend lists at your DNS provider; click **Verify**.
3. Set `EMAIL_FROM` to an address on that domain.

## 8. Reminder cron service

The app does not schedule anything itself. Add a second Railway service that calls it once a day.

1. Project canvas > **New > Empty Service**, name it `reminders-cron`.
2. **Settings > Source > Docker Image**: `curlimages/curl:latest` (or any image that has `curl`).
3. **Settings > Deploy > Custom Start Command**:
   ```
   sh -c 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/reminders"'
   ```
4. **Settings > Deploy > Cron Schedule**: `0 16 * * *` (16:00 UTC daily).
5. **Variables**: `CRON_SECRET` = `${{SayClear.CRON_SECRET}}` (a reference to the web service; replace `SayClear` with its name) and `APP_URL` = `https://<domain>`. Or use the private address `http://${{SayClear.RAILWAY_PRIVATE_DOMAIN}}:3000` to skip the public internet (the web service listens on port 3000).
6. The service starts, runs, and exits at each scheduled time. Check **Deployments > Logs** after the first run: it should print JSON such as `{"sent":0,...}`. A 503 means `CRON_SECRET` is unset on the web service; a 401 means the two values differ.

## 9. First deploy

1. Click **Deploy** (or push a commit). Watch **Deployments > Build Logs**. The build downloads the model (about 240 MB) and runs `next build`.
2. The deployment turns active when `/api/health` returns 200. Allow the healthcheck up to 5 minutes on the first start (Railway default is 300 s; set `RAILWAY_HEALTHCHECK_TIMEOUT_SEC=300` if you changed it).

### Smoke test checklist

- [ ] `https://<domain>/api/health` returns `{"ok":true}`.
- [ ] Landing page loads over https, no console errors.
- [ ] Deploy logs show no "Sound model failed to load" error; memory graph settles around 1 GB.
- [ ] Sign up with email and password; sign out and back in.
- [ ] Password reset email arrives (needs Resend).
- [ ] "Continue with Google" works (if enabled).
- [ ] Practice: a reference voice plays; record yourself; you get a score. In the browser network tab there is a `sound-check` request to your domain and no 240 MB download.
- [ ] Redeploy, then sign in again: your account is still there (the volume persists).
- [ ] Stripe test checkout, portal and cancel; `/account` follows (use test keys first).
- [ ] Run the cron service once (**Deployments > Run now** or wait for the schedule): it responds 200.
- [ ] `https://<domain>/terms` and `/privacy` show your company name and contact email.

## Backups

The database is one SQLite file on the volume. Do not copy it while the app writes; use SQLite's online backup.

- **Railway volume backups**: service > Volume > **Backups** tab > enable a schedule (daily or weekly) and take a manual backup before risky changes. Available on paid plans; restore from the same tab.
- **Off-site copy** (recommended as well): from your machine, with the Railway CLI linked to the project:
  ```
  railway ssh -- 'sqlite3 /data/sayclear.db ".backup /data/backup.db"'
  ```
  The image does not ship `sqlite3`; if you want this, add `apt-get install -y sqlite3` to the runner stage, or open the file with a libSQL client. Then download `/data/backup.db`. A simpler alternative is to point `DATABASE_URL` at Turso, which has its own point-in-time restore.
- Test a restore at least once before you have paying customers.

## Costs (check railway.com/pricing, figures change)

- Hobby plan: $5 per month, which includes $5 of usage. The web service plus volume plus a cron that runs a few seconds a day usually fits in that for a small app; usage beyond it is billed.
- Network egress: $0.05 per GB. Learners no longer download the model; each rated recording moves about 1 to 3 MB (audio up, scores down), so egress is small. Only the Hugging Face download at build time counts as ingress.
- Memory and CPU for the on-server model dominate the bill (see "Size the service").
- Volume storage is billed per GB-month; the database is small for a long time.

## Operations notes

- Rollback: **Deployments** > pick an earlier deployment > **Redeploy**. The volume is not rolled back.
- One replica only. Do not enable horizontal scaling or overlapping deployments with a volume (Railway briefly stops the old instance on redeploy, so expect a few seconds of downtime per deploy).
- Logs: **Deployments > View Logs**. Password-reset links appear there only when `RESEND_API_KEY` is unset.
- If `/app/models` is missing from an image the server tries to download the model from Hugging Face into `.data/models` on first use (development behaviour). Production images always contain it.
- `POST /api/sound-check` requires a signed-in user, accepts at most about 13 s of 16 kHz mono audio and is limited to 60 requests per minute per user.
