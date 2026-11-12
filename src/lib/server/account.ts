import { isLanguage } from "../languages";
import { isLevel, type LevelId } from "../levels";
import { PLANS, type Entitlements, type PlanId } from "../plans";
import type { Me, Profile } from "../types";
import { getAuth, ready } from "./auth";
import { hasAzure } from "./azure";
import { db, first } from "./db";
import { hasElevenLabs, listVoices } from "./elevenlabs";
import { hasOpenAi } from "./openai";
import { getSubscriptionRow, planOf, stripeEnabled } from "./stripe";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getUser(request: Request): Promise<SessionUser | null> {
  await ready();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export const unauthorized = () => Response.json({ error: "Sign in to continue." }, { status: 401 });

export async function getProfile(userId: string): Promise<Profile> {
  const row = await first<{ lang: string; level: string; onboarded: number }>(
    "SELECT lang, level, onboarded FROM profile WHERE user_id = ?",
    [userId],
  );
  return {
    lang: row && isLanguage(row.lang) ? row.lang : "en",
    level: row && isLevel(row.level) ? row.level : "intermediate",
    onboarded: !!row?.onboarded,
  };
}

export async function saveProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
  const next = { ...(await getProfile(userId)), ...patch };
  await db().execute({
    sql: `INSERT INTO profile (user_id, lang, level, onboarded, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET lang = excluded.lang, level = excluded.level,
          onboarded = excluded.onboarded, updated_at = excluded.updated_at`,
    args: [userId, next.lang, next.level, next.onboarded ? 1 : 0, Date.now()],
  });
  return next;
}

/** What this user may do right now. Sound-level scoring also needs the phoneme engine to be configured. */
export async function getAccess(userId: string): Promise<{ plan: PlanId; entitlements: Entitlements; level: LevelId }> {
  const [row, profile] = await Promise.all([getSubscriptionRow(userId), getProfile(userId)]);
  // Without payments configured there is nothing to sell, so nothing is locked.
  const plan: PlanId = stripeEnabled() ? planOf(row) : "pro";
  const base = PLANS[plan].entitlements;
  const hasSoundEngine = hasAzure() || hasOpenAi();
  return { plan, entitlements: { ...base, phonemes: base.phonemes && hasSoundEngine }, level: profile.level };
}

const today = () => new Date().toISOString().slice(0, 10);

export async function analysesToday(userId: string): Promise<number> {
  const row = await first<{ analyses: number }>("SELECT analyses FROM usage WHERE user_id = ? AND day = ?", [
    userId,
    today(),
  ]);
  return row?.analyses ?? 0;
}

/** Count one analysis against today's allowance. Returns false when the allowance is used up. */
export async function consumeAnalysis(userId: string, limit: number): Promise<boolean> {
  const res = await db().execute({
    sql: `INSERT INTO usage (user_id, day, analyses) VALUES (?, ?, 1)
          ON CONFLICT(user_id, day) DO UPDATE SET analyses = analyses + 1 WHERE analyses < ?`,
    args: [userId, today(), limit],
  });
  return res.rowsAffected > 0;
}

/** Give an analysis back when it failed on our side. */
export async function refundAnalysis(userId: string): Promise<void> {
  await db().execute({
    sql: "UPDATE usage SET analyses = MAX(0, analyses - 1) WHERE user_id = ? AND day = ?",
    args: [userId, today()],
  });
}

export async function consumeVoiceChars(userId: string, chars: number, limit: number): Promise<boolean> {
  const res = await db().execute({
    sql: `INSERT INTO usage (user_id, day, voice_chars) VALUES (?, ?, ?)
          ON CONFLICT(user_id, day) DO UPDATE SET voice_chars = voice_chars + excluded.voice_chars
          WHERE voice_chars + excluded.voice_chars <= ?`,
    args: [userId, today(), chars, limit],
  });
  return res.rowsAffected > 0;
}

export async function buildMe(user: SessionUser): Promise<Me> {
  const [access, profile, row, used] = await Promise.all([
    getAccess(user.id),
    getProfile(user.id),
    getSubscriptionRow(user.id),
    analysesToday(user.id),
  ]);
  const voices = hasElevenLabs() ? await listVoices().catch(() => []) : [];
  return {
    user,
    profile,
    plan: access.plan,
    entitlements: access.entitlements,
    usage: { used, limit: access.entitlements.dailyAnalyses },
    subscription:
      row?.status && row.subscription_id
        ? {
            status: row.status,
            interval: row.billing_interval,
            periodEnd: row.period_end,
            cancelAtPeriodEnd: !!row.cancel_at_period_end,
          }
        : null,
    trialAvailable: !row?.trial_used,
    billing: stripeEnabled(),
    engines: { elevenlabs: hasElevenLabs(), azure: hasAzure() || hasOpenAi(), openai: hasOpenAi() },
    voices,
  };
}
