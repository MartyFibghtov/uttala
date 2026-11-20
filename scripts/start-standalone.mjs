// Run the standalone server: copy static assets and public files next to it (as the Dockerfile does), then start.
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

if (!existsSync(".next/standalone/server.js")) {
  console.error("No standalone build found. Run `pnpm build` first.");
  process.exit(1);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
process.env.HOSTNAME ??= "0.0.0.0";
// Run the server in this process (no child), so a stop signal reaches it and nothing is left behind.
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));
await import(resolve(".next/standalone/server.js"));
