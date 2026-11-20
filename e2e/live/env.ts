import { readFileSync } from "node:fs";
import path from "node:path";

/** Minimal .env parser: KEY=VALUE lines, optional quotes. Values are never logged or copied anywhere. */
export function readDotenv(file = path.resolve(__dirname, "../../.env.local")): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export const LIVE_KEYS = ["ELEVENLABS_API_KEY", "OPENAI_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"] as const;
