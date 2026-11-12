import { mkdirSync } from "node:fs";
import { createClient, type Client, type InValue } from "@libsql/client";

let client: Client | undefined;

/**
 * libSQL client. Uses a local SQLite file in development and a hosted
 * database (e.g. Turso) when DATABASE_URL is set.
 */
export function dbConfig() {
  const defaultFile = process.env.VERCEL ? "file:/tmp/uttala.db" : "file:.data/uttala.db";
  const url = process.env.DATABASE_URL?.trim() || defaultFile;
  if (url.startsWith("file:.data/")) mkdirSync(".data", { recursive: true });
  return { url, authToken: process.env.DATABASE_AUTH_TOKEN };
}

export function db(): Client {
  return (client ??= createClient(dbConfig()));
}

export async function query<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const res = await db().execute({ sql, args });
  return res.rows as unknown as T[];
}

export async function first<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  return (await query<T>(sql, args))[0];
}

/** Application tables. Authentication tables are created by the auth library. */
export const APP_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS profile (
     user_id TEXT PRIMARY KEY,
     lang TEXT NOT NULL DEFAULT 'en',
     level TEXT NOT NULL DEFAULT 'intermediate',
     onboarded INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS subscription (
     user_id TEXT PRIMARY KEY,
     customer_id TEXT UNIQUE,
     subscription_id TEXT,
     plan TEXT NOT NULL DEFAULT 'free',
     billing_interval TEXT,
     status TEXT,
     period_end INTEGER,
     cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
     trial_used INTEGER NOT NULL DEFAULT 0,
     flagged INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS usage (
     user_id TEXT NOT NULL,
     day TEXT NOT NULL,
     analyses INTEGER NOT NULL DEFAULT 0,
     voice_chars INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, day)
   )`,
  `CREATE TABLE IF NOT EXISTS user_state (
     user_id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  // Points per UTC day, awarded on the server so leagues and class boards cannot be inflated from the browser.
  `CREATE TABLE IF NOT EXISTS points (
     user_id TEXT NOT NULL,
     day TEXT NOT NULL,
     points INTEGER NOT NULL DEFAULT 0,
     analyses INTEGER NOT NULL DEFAULT 0,
     score_sum INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, day)
   )`,
  `CREATE INDEX IF NOT EXISTS points_day ON points (day)`,
  // What the learner chose to share and receive. Everything is off until they turn it on.
  `CREATE TABLE IF NOT EXISTS community (
     user_id TEXT PRIMARY KEY,
     handle TEXT,
     league INTEGER NOT NULL DEFAULT 0,
     reminders INTEGER NOT NULL DEFAULT 0,
     reminded_at INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS classroom (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL,
     name TEXT NOT NULL,
     code TEXT NOT NULL UNIQUE,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS classroom_member (
     classroom_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     joined_at INTEGER NOT NULL,
     PRIMARY KEY (classroom_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS stripe_event (
     id TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tts_cache (
     key TEXT PRIMARY KEY,
     voice_id TEXT NOT NULL,
     audio TEXT NOT NULL,
     chars TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS generated_text (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     lang TEXT NOT NULL,
     level TEXT NOT NULL,
     text TEXT NOT NULL,
     meaning TEXT,
     roman TEXT,
     focus TEXT NOT NULL,
     targets TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS generated_text_user ON generated_text (user_id, lang, created_at DESC)`,
];
