import { defineRailway, image, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const sayclearVolume = volume("sayclear-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "iad", sizeMB: 5000 });
  // Web app: Dockerfile build (uploaded with `railway up`), SQLite on the volume. One replica: SQLite cannot be shared.
  const sayclear = service("sayclear", {
    replicas: { "iad": 1 },
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5 },
    volumeMounts: { "/data": sayclearVolume },
    env: { AZURE_SPEECH_KEY: preserve(), AZURE_SPEECH_REGION: preserve(), BETTER_AUTH_SECRET: preserve(), BETTER_AUTH_URL: preserve(), CRON_SECRET: preserve(), ELEVENLABS_API_KEY: preserve(), GOOGLE_CLIENT_ID: preserve(), GOOGLE_CLIENT_SECRET: preserve(), NEXT_PUBLIC_SITE_URL: preserve(), OPENAI_API_KEY: preserve(), PORT: preserve(), STRIPE_PORTAL_CONFIGURATION: preserve(), STRIPE_SECRET_KEY: preserve(), STRIPE_WEBHOOK_SECRET: preserve() },
  });
  const remindersCron = service("reminders-cron", {
    // Daily reminder emails at 16:00 UTC over the private network; exits after the request.
    source: image("curlimages/curl:8.11.1"),
    replicas: { "iad": 1 },
    deploy: { cronSchedule: "0 16 * * *", restartPolicyType: "NEVER" },
    start: 'sh -c \'curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/reminders"\'',
    env: { APP_URL: preserve(), CRON_SECRET: preserve() },
  });

  return project("sayclear", {
    resources: [sayclear, remindersCron, sayclearVolume],
  });
});
