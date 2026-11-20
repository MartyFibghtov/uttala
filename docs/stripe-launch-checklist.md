# Stripe launch checklist (SayClear)

Plans: Plus and Pro, monthly and yearly, USD default with SEK and EUR options. 7-day trial once per person, card collected up front. Plan state lives in our `subscription` table and is always re-read from Stripe (webhook, `/api/billing/sync`, and before each checkout).

## 1. Sandbox (do this first)

1. Create a Stripe **sandbox** (Dashboard account menu > Sandboxes) for development. Use a separate sandbox for CI. Do not use the shared test mode for new work.
2. Create a restricted key (`rk_test_...`) in Developers > API keys. Write: Checkout Sessions, Customers, Subscriptions, Customer portal, Webhook Endpoints, Products, Prices. Read: Charges, Disputes. Radar/EFW read if offered. A secret key (`sk_`) also works for the setup script only.
3. `STRIPE_SECRET_KEY=rk_test_... pnpm stripe:setup --webhook https://<your-staging-host>`
   - Re-runnable: products, prices (USD + SEK + EUR), portal config and webhook events are reconciled, never duplicated.
   - It prints `STRIPE_PORTAL_CONFIGURATION` and, on first creation only, `STRIPE_WEBHOOK_SECRET`. Store both as host secrets.
4. Set env on the host: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION`, `BETTER_AUTH_URL` (used for success/return URLs).
5. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a `whsec_...` to use as `STRIPE_WEBHOOK_SECRET` (run `stripe login` yourself first).
6. Run the manual tests in section 4.

## 2. Dashboard settings (not settable by API)

Do these in the sandbox, then repeat in live mode. Settings are per mode.

- **Billing > Subscriptions and emails > Customer emails**: enable "Send emails about upcoming renewals" and **"Send reminders about expiring trials"** (trial-ending email; Stripe sends it about 3 days before the trial ends, which is what makes the card-up-front trial honest). Enable "Send finalised invoices and credit notes" and successful-payment receipts (Settings > Emails > Customer emails > Successful payments).
- **Failed payments**: Billing > Revenue recovery > Retries: turn on **Smart Retries** (suggest 8 retries within 2 weeks). Enable "Send emails when card payments fail" and "Send a link to update payment method".
- **Subscription end state** (Billing > Revenue recovery > Retries): after retries are exhausted choose **Cancel the subscription** (our app treats `unpaid` as free too, but cancel is cleaner).
- **Customer portal** (Settings > Billing > Customer portal): the setup script configures plan switching, cancel at period end, cancellation reasons, card update and invoices. In the Dashboard add branding (logo, colour, name), terms of service and privacy links, and a support email.
- **Branding** (Settings > Branding): logo, icon, colour; they appear on Checkout, emails and invoices.
- **Radar** (Radar > Rules): keep default rules; consider blocking when CVC or postal check fails and requesting 3DS when risk is elevated. Enable Early Fraud Warning (Radar > Settings) so `radar.early_fraud_warning.created` arrives; our webhook then cancels the subscription.
- **Disputes**: add a notification email for disputes (Settings > Notifications). Keep evidence ready (access logs, terms).
- **Payment methods** (Settings > Payment methods): cards, Apple Pay, Google Pay; Link optional. Do not hard-code methods in code.
- **Business details**: public business name and statement descriptor (e.g. `SAYCLEAR`), support email and phone.
- **Currencies**: nothing to do; each price has USD, SEK and EUR options, Checkout picks by buyer location. Adaptive Pricing is off unless you set `STRIPE_ADAPTIVE_PRICING=true`; do not combine without a reason.

## 3. Tax (confirm with an accountant before enabling)

I am not a tax adviser; the founder must confirm the following with an accountant.

- Digital services sold to consumers in the EU are subject to VAT in the customer's country. From Sweden, the simplest route is the **EU One Stop Shop (OSS) Union scheme**, registered via Skatteverket, so VAT for all EU consumer sales is reported in one Swedish return. Swedish sales carry 25 % Swedish VAT. Non-EU customers (UK, US, etc.) have their own rules and thresholds.
- Register for VAT in Sweden (Skatteverket) first, and check the Swedish small-business exemption (momsfritt under 80 000 SEK/year) does not apply to you or you opt out; the exemption does not cover cross-border EU B2C sales.
- In Stripe: Tax > Registrations: add Sweden and the OSS (Union) registration. Set the head-office address and a default product tax code (Settings > Tax; SaaS/electronically supplied services). Prices were created with `tax_behavior: unspecified`; decide tax-inclusive vs exclusive in Settings > Tax before launch (EU consumers expect VAT-inclusive prices).
- Only then set `STRIPE_AUTOMATIC_TAX=true` (the app also turns on tax-ID collection). Without an active registration Stripe collects no tax while looking like it does.
- Enable a Stripe Tax test in the sandbox with a Swedish and a German address and verify the VAT line on the Checkout page.

## 4. Manual test script (sandbox)

Prepare: fresh account in the app, webhook forwarding running, DB or `/account` visible.

1. **Happy path**: Account > choose Plus monthly. Checkout shows "7-day free trial" and the submit text. Pay with `4242 4242 4242 4242`, any future date, any CVC. Expect redirect to `/account?checkout=success`, plan shows Plus (trialing), within a second or two (sync route) even if the webhook is delayed.
2. **Local currency**: open Checkout with a Swedish IP or address; it should offer SEK (99 kr/month for Plus). Check EUR too.
3. **Double click**: click the plan button twice quickly. Only one Checkout Session in Dashboard > Developers > Events within the same minute.
4. **Already subscribed**: click Upgrade again; you go to the portal, not Checkout.
5. **Portal**: switch Plus to Pro and monthly to yearly; cancel (reason prompt appears, cancel at period end). Account shows "cancels on ...".
6. **Trial once**: cancel immediately in the portal, then subscribe again. Checkout must show no trial. Also register a second account with the same email casing variant: no trial.
7. **Decline after attach**: use `4000 0000 0000 0341`. Checkout attach succeeds; the first charge at trial end fails. Advance the clock (Billing > Test clocks) past the trial: status `past_due`, Plus features stay on (grace), `invoice.payment_failed` email sent; after retries status `canceled`/`unpaid` and the account becomes Free.
8. **3DS**: `4000 0025 0000 3155`. Complete the authentication modal; subscription becomes trialing. Fail the authentication once to check that the user stays Free and can retry.
9. **Trial end success**: test clock past 7 days with `4242...`: trial ends, status `active`, invoice paid. Confirm trial-ending reminder email appears (needs the Dashboard setting from section 2).
10. **Dispute**: card `4000 0000 0000 0259`. The charge becomes disputed; expect the subscription cancelled and the user Free; log line `Stripe dispute ... subscription cancelled`.
11. **Refund**: refund an invoice in the Dashboard: `charge.refunded` triggers a sync; state unchanged unless you cancel.
12. **Account deletion**: delete the account; the Stripe customer is deleted and subscriptions end.
13. **Webhook**: send a test event from the Dashboard; expect 200. Tamper with the secret to confirm a 400. Replay the same event: `duplicate: true`.
14. **Tax** (only if enabled): VAT line is present for a Swedish card and address.

More cards: https://docs.stripe.com/testing

## 5. Go live

1. Complete account activation (business details, bank account for payouts in SEK, identity).
2. Repeat section 2 and 3 in live mode.
3. Create a live restricted key; run `STRIPE_SECRET_KEY=rk_live_... pnpm stripe:setup --webhook https://<production-host>`.
4. Set live env vars on production (new `STRIPE_WEBHOOK_SECRET` and `STRIPE_PORTAL_CONFIGURATION`; live ids differ from sandbox).
5. Redeploy, then buy Plus yourself with a real card, check email receipts, then refund and cancel it.
6. Watch Dashboard > Developers > Webhooks for failed deliveries during the first week; the endpoint returns non-2xx on handler failure so Stripe retries for up to 3 days.
7. Rotate keys if ever exposed; keep the secret key only in host secrets.

## 6. Known limits

- Trial-abuse checks use the customer id, other Stripe customers with the same email, and a `trial_ledger` table (created lazily by `stripe.ts`). The ledger holds only an HMAC-SHA256 of the lowercased email, keyed with `BETTER_AUTH_SECRET`, written when a trial starts and before the Stripe customer is deleted with the account. Rotating `BETTER_AUTH_SECRET` invalidates old entries.
- **Privacy:** that one-way hash is kept after account deletion solely to prevent trial abuse (legitimate interest, GDPR Art. 6(1)(f)). The privacy policy must mention it and its retention; confirm the wording with a lawyer.
- Duplicate subscriptions (double checkout completed in two tabs) are auto-cancelled after the fact; refund manually if charged.
