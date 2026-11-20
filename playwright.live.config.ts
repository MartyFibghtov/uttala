import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { LIVE_KEYS, readDotenv } from "./e2e/live/env";

/**
 * Live smoke test: the real ElevenLabs, OpenAI and Azure Speech engines (keys read from .env.local at run time).
 * Stripe and Resend stay on the local mock. Run with `pnpm e2e:live` (uses the existing .next build; set E2E_LIVE_BUILD=1 to rebuild).
 */
const APP = "http://localhost:3200";
const MOCK = "http://127.0.0.1:12111";
export const LIVE_WAV = path.resolve(__dirname, "e2e/.tmp/live-speech.wav");

const dotenv = readDotenv();
const live: Record<string, string> = {};
for (const k of LIVE_KEYS) if (dotenv[k]) live[k] = dotenv[k];

const env: Record<string, string> = {
  PORT: "3200",
  DATABASE_URL: `file:${path.resolve(__dirname, ".data/e2e-live.db")}`,
  SOUND_MODEL_DIR: path.resolve(__dirname, ".data/models"),
  HOSTNAME: "127.0.0.1",
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
  BETTER_AUTH_URL: APP,
  NEXT_PUBLIC_SITE_URL: APP,
  ...live,
  RESEND_API_KEY: "re_fake",
  RESEND_API_BASE: MOCK,
  EMAIL_FROM: "SayClear <hello@example.test>",
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_API_BASE: MOCK,
  STRIPE_WEBHOOK_SECRET: "whsec_test_e2e_secret",
  CRON_SECRET: "e2e-cron",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  NEXT_TELEMETRY_DISABLED: "1",
  // Deliberately NOT set: ELEVENLABS_API_BASE, OPENAI_API_BASE, AZURE_SPEECH_ENDPOINT (real endpoints).
};
for (const k of ["ELEVENLABS_API_BASE", "OPENAI_API_BASE", "AZURE_SPEECH_ENDPOINT"]) delete process.env[k];

const build = process.env.E2E_LIVE_BUILD ? "pnpm exec next build && " : "";

export default defineConfig({
  testDir: "./e2e/live",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/live/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "e2e/.results-live",
  use: {
    baseURL: APP,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: process.env.E2E_CHANNEL ?? "chrome",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${LIVE_WAV}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [{ name: "live", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/mock-server.ts",
      url: `${MOCK}/__mock/health`,
      reuseExistingServer: true,
      env: { MOCK_APP_URL: APP, STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET },
    },
    {
      command: `rm -f .data/e2e-live.db* && ${build}pnpm start:standalone`,
      url: `${APP}/pricing`,
      timeout: 600_000,
      reuseExistingServer: false,
      env,
    },
  ],
});
