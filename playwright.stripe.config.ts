import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { readDotenv } from "./e2e/live/env";

/**
 * Real Stripe test mode: hosted Checkout with card 4242, real webhooks forwarded by `stripe listen`,
 * plan switch and cancel through the Stripe API, account deletion. Needs in .env.local:
 * STRIPE_SECRET_KEY=sk_test_… and STRIPE_PORTAL_CONFIGURATION (from `pnpm stripe:setup`), plus the Stripe CLI.
 * Engines and email stay on the local mock. Run with `pnpm e2e:stripe` (uses the existing build).
 */
/** E2E_TARGET=https://… runs the same test against a deployed site; Stripe then sends webhooks to it directly. */
const TARGET = process.env.E2E_TARGET?.replace(/\/$/, "");
const APP = TARGET ?? "http://localhost:3300";
const MOCK = "http://127.0.0.1:12111";
const dotenv = readDotenv();

const STRIPE_KEY = dotenv.STRIPE_SECRET_KEY ?? "";
if (!/^(sk|rk)_test_/.test(STRIPE_KEY)) throw new Error("Set a test-mode STRIPE_SECRET_KEY (sk_test_… or rk_test_…) in .env.local.");

const env: Record<string, string> = {
  PORT: "3300",
  HOSTNAME: "127.0.0.1",
  DATABASE_URL: `file:${path.resolve(__dirname, ".data/e2e-stripe.db")}`,
  SOUND_MODEL_DIR: path.resolve(__dirname, ".data/models"),
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
  BETTER_AUTH_URL: APP,
  NEXT_PUBLIC_SITE_URL: APP,
  STRIPE_SECRET_KEY: STRIPE_KEY,
  STRIPE_PORTAL_CONFIGURATION: dotenv.STRIPE_PORTAL_CONFIGURATION ?? "",
  STRIPE_WEBHOOK_SECRET: dotenv.STRIPE_WEBHOOK_SECRET ?? "",
  ELEVENLABS_API_KEY: "el_fake",
  ELEVENLABS_API_BASE: MOCK,
  OPENAI_API_KEY: "sk-fake",
  OPENAI_API_BASE: MOCK,
  RESEND_API_KEY: "re_fake",
  RESEND_API_BASE: MOCK,
  EMAIL_FROM: "SayClear <hello@example.test>",
  AZURE_SPEECH_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  NEXT_TELEMETRY_DISABLED: "1",
};
delete process.env.STRIPE_API_BASE;

export default defineConfig({
  testDir: "./e2e/stripe",
  testMatch: /.*\.spec\.ts/,
  globalSetup: TARGET ? undefined : "./e2e/stripe/global-setup.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "e2e/.results-stripe",
  use: { baseURL: APP, trace: "retain-on-failure", screenshot: "only-on-failure", channel: process.env.E2E_CHANNEL ?? "chrome" },
  projects: [{ name: "stripe", use: { ...devices["Desktop Chrome"] } }],
  webServer: TARGET ? [] : [
    {
      command: "node e2e/mock-server.ts",
      url: `${MOCK}/__mock/health`,
      reuseExistingServer: true,
      env: { MOCK_APP_URL: APP, STRIPE_WEBHOOK_SECRET: "unused" },
    },
    {
      command: "rm -f .data/e2e-stripe.db* && node scripts/start-standalone.mjs",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      url: `${APP}/pricing`,
      timeout: 120_000,
      reuseExistingServer: false,
      env,
    },
  ],
});
