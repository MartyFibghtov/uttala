import { spawn } from "node:child_process";
import { WEBHOOK_EVENTS } from "../../src/lib/server/stripe";
import { readDotenv } from "../live/env";

/** Forward real Stripe test-mode webhooks to the app with the Stripe CLI for the length of the run. */
export default async function globalSetup() {
  const key = readDotenv().STRIPE_SECRET_KEY ?? "";
  const cli = spawn("stripe", ["listen", "--api-key", key, "--events", WEBHOOK_EVENTS.join(","), "--forward-to", "localhost:3300/api/stripe/webhook"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stripe listen did not become ready in 30 s")), 30_000);
    const onData = (b: Buffer) => {
      if (/Ready!/.test(b.toString())) {
        clearTimeout(timer);
        resolve();
      }
    };
    cli.stdout.on("data", onData);
    cli.stderr.on("data", onData);
    cli.on("exit", (code) => reject(new Error(`stripe listen exited (${code}). Is the Stripe CLI installed?`)));
  });
  return async () => {
    cli.kill("SIGTERM");
  };
}
