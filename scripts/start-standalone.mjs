// Run the standalone server: copy static assets and public files next to it (as the Dockerfile does), then start.
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (!existsSync(".next/standalone/server.js")) {
  console.error("No standalone build found. Run `pnpm build` first.");
  process.exit(1);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
const child = spawn(process.execPath, [".next/standalone/server.js"], { stdio: "inherit", env: { HOSTNAME: "0.0.0.0", ...process.env } });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
