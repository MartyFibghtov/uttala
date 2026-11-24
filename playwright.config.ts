import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const APP = "http://localhost:3100";
const MOCK = "http://127.0.0.1:12111";
export const FAKE_MIC = path.resolve(__dirname, "e2e/.tmp/fake-mic.wav");

const env = {
  PORT: "3100",
  DATABASE_URL: `file:${path.resolve(__dirname, ".data/e2e.db")}`,
  SOUND_MODEL_DIR: path.resolve(__dirname, ".data/models"),
  HOSTNAME: "127.0.0.1",
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
  BETTER_AUTH_URL: APP,
  NEXT_PUBLIC_SITE_URL: APP,
  ELEVENLABS_API_KEY: "xi_fake",
  ELEVENLABS_API_BASE: MOCK,
  OPENAI_API_KEY: "sk-fake",
  OPENAI_API_BASE: MOCK,
  RESEND_API_KEY: "re_fake",
  RESEND_API_BASE: MOCK,
  EMAIL_FROM: "SayClear <hello@example.test>",
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_API_BASE: MOCK,
  STRIPE_WEBHOOK_SECRET: "whsec_test_e2e_secret",
  CRON_SECRET: "e2e-cron",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  AZURE_SPEECH_KEY: "",
  AZURE_SPEECH_REGION: "",
  AZURE_SPEECH_ENDPOINT: MOCK,
  NEXT_TELEMETRY_DISABLED: "1",
};

/** The real production path: the standalone server (`pnpm start:standalone`). E2E_REUSE=1 reuses an already running app/mock (fast loop); E2E_SKIP_BUILD=1 skips `next build`. */
const build = process.env.E2E_SKIP_BUILD ? "" : "pnpm exec next build && ";

export default defineConfig({
  testDir: "./e2e/tests",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  outputDir: "e2e/.results",
  use: {
    baseURL: APP,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // System Chrome by default; CI: `playwright install chromium` and E2E_CHANNEL=chromium.
    channel: process.env.E2E_CHANNEL ?? "chrome",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${FAKE_MIC}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile/ },
  ],
  webServer: [
    {
      command: "node e2e/mock-server.ts",
      url: `${MOCK}/__mock/health`,
      reuseExistingServer: !!process.env.E2E_REUSE,
      env: { MOCK_APP_URL: APP, STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET },
    },
    {
      command: `rm -f .data/e2e.db* && ${build}node scripts/start-standalone.mjs`,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      url: `${APP}/pricing`,
      timeout: 600_000,
      reuseExistingServer: !!process.env.E2E_REUSE,
      env,
    },
  ],
});
