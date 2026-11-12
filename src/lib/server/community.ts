import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { SITE } from "../site";
import type { ClassDetail, ClassSummary, CommunityPrefs, League } from "../types";
import { db, first, query } from "./db";
import { sendEmail } from "./email";

const DAY_MS = 86_400_000;
const utcDay = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);

/** Monday of the current week, UTC. Leagues and class boards reset then. */
export function weekStart(now = Date.now()): string {
  const d = new Date(now);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return utcDay(now - sinceMonday * DAY_MS);
}

// --- Points -----------------------------------------------------------------

/** Count one analysed recording. Called by the scoring route, never from the browser. */
export async function awardPoints(userId: string, score: number): Promise<void> {
  const clean = Math.max(0, Math.min(100, Math.round(score)));
  const points = 10 + Math.round(clean / 10);
  await db().execute({
    sql: `INSERT INTO points (user_id, day, points, analyses, score_sum) VALUES (?, ?, ?, 1, ?)
          ON CONFLICT(user_id, day) DO UPDATE SET points = points + excluded.points,
          analyses = analyses + 1, score_sum = score_sum + excluded.score_sum`,
    args: [userId, utcDay(), points, clean],
  });
}

// --- Preferences ------------------------------------------------------------

const HANDLE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,19}$/u;

export async function getPrefs(userId: string): Promise<CommunityPrefs> {
  const row = await first<{ handle: string | null; league: number; reminders: number }>(
    "SELECT handle, league, reminders FROM community WHERE user_id = ?",
    [userId],
  );
  return { handle: row?.handle ?? "", league: !!row?.league, reminders: !!row?.reminders };
}

export async function savePrefs(userId: string, patch: Partial<CommunityPrefs>): Promise<CommunityPrefs | { error: string }> {
  const next = { ...(await getPrefs(userId)), ...patch };
  next.handle = next.handle.trim();
  if (next.handle && !HANDLE.test(next.handle)) {
    return { error: "A display name is 2 to 20 letters, numbers or spaces." };
  }
  if (next.league && !next.handle) return { error: "Choose a display name to join the league." };
  if (next.handle) {
    const taken = await first("SELECT 1 FROM community WHERE lower(handle) = lower(?) AND user_id <> ?", [next.handle, userId]);
    if (taken) return { error: "That display name is taken." };
  }
  await db().execute({
    sql: `INSERT INTO community (user_id, handle, league, reminders, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET handle = excluded.handle, league = excluded.league,
          reminders = excluded.reminders, updated_at = excluded.updated_at`,
    args: [userId, next.handle || null, next.league ? 1 : 0, next.reminders ? 1 : 0, Date.now()],
  });
  return next;
}

// --- Weekly league ----------------------------------------------------------

const LEAGUE_SIZE = 50;

/** This week's ranking of everyone who opted in, plus where the caller stands. */
export async function getLeague(userId: string): Promise<League> {
  const since = weekStart();
  const rows = await query<{ user_id: string; handle: string; points: number }>(
    `SELECT c.user_id, c.handle, SUM(p.points) AS points
     FROM community c JOIN points p ON p.user_id = c.user_id
     WHERE c.league = 1 AND c.handle IS NOT NULL AND p.day >= ?
     GROUP BY c.user_id ORDER BY points DESC, c.handle ASC LIMIT ?`,
    [since, LEAGUE_SIZE],
  );
  const mine = await first<{ points: number | null }>("SELECT SUM(points) AS points FROM points WHERE user_id = ? AND day >= ?", [
    userId,
    since,
  ]);
  return {
    weekStart: since,
    rows: rows.map((r, i) => ({ rank: i + 1, name: r.handle, points: Number(r.points), you: r.user_id === userId })),
    yourPoints: Number(mine?.points ?? 0),
  };
}

// --- Classes ----------------------------------------------------------------

export const MAX_CLASSES = 10;
export const MAX_MEMBERS = 60;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

export async function listClasses(userId: string): Promise<ClassSummary[]> {
  const rows = await query<{ id: string; name: string; code: string; owner_id: string; members: number }>(
    `SELECT k.id, k.name, k.code, k.owner_id,
            (SELECT COUNT(*) FROM classroom_member m WHERE m.classroom_id = k.id) AS members
     FROM classroom k
     WHERE k.owner_id = ? OR k.id IN (SELECT classroom_id FROM classroom_member WHERE user_id = ?)
     ORDER BY k.created_at DESC`,
    [userId, userId],
  );
  return rows.map((r) => {
    const owner = r.owner_id === userId;
    // Only the teacher sees the join code.
    return { id: r.id, name: r.name, role: owner ? "owner" : "member", members: Number(r.members), code: owner ? r.code : undefined };
  });
}

export async function createClass(userId: string, name: string): Promise<ClassSummary | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 60) return { error: "A class name is 2 to 60 characters." };
  const owned = await first<{ n: number }>("SELECT COUNT(*) AS n FROM classroom WHERE owner_id = ?", [userId]);
  if (Number(owned?.n ?? 0) >= MAX_CLASSES) return { error: `You can run up to ${MAX_CLASSES} classes.` };
  const id = randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    try {
      await db().execute({
        sql: "INSERT INTO classroom (id, owner_id, name, code, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [id, userId, clean, code, Date.now()],
      });
      return { id, name: clean, role: "owner", members: 0, code };
    } catch {
      // Code collision: try another.
    }
  }
  return { error: "Could not create the class. Please try again." };
}

export async function joinClass(userId: string, code: string): Promise<ClassSummary | { error: string }> {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const klass = await first<{ id: string; name: string; owner_id: string }>("SELECT id, name, owner_id FROM classroom WHERE code = ?", [clean]);
  if (!klass) return { error: "No class has that code. Check it with your teacher." };
  if (klass.owner_id === userId) return { error: "This is your own class." };
  const joined = await first<{ n: number }>("SELECT COUNT(*) AS n FROM classroom_member WHERE user_id = ?", [userId]);
  if (Number(joined?.n ?? 0) >= MAX_CLASSES) return { error: `You can be in up to ${MAX_CLASSES} classes.` };
  const size = await first<{ n: number }>("SELECT COUNT(*) AS n FROM classroom_member WHERE classroom_id = ?", [klass.id]);
  if (Number(size?.n ?? 0) >= MAX_MEMBERS) return { error: "This class is full." };
  await db().execute({
    sql: "INSERT OR IGNORE INTO classroom_member (classroom_id, user_id, joined_at) VALUES (?, ?, ?)",
    args: [klass.id, userId, Date.now()],
  });
  return { id: klass.id, name: klass.name, role: "member", members: Number(size?.n ?? 0) + 1 };
}

/** Roster with this week's activity. Classmates see names and points; the teacher also sees detail. */
export async function getClass(userId: string, classId: string): Promise<ClassDetail | null> {
  const klass = await first<{ id: string; name: string; code: string; owner_id: string }>(
    "SELECT id, name, code, owner_id FROM classroom WHERE id = ?",
    [classId],
  );
  if (!klass) return null;
  const owner = klass.owner_id === userId;
  if (!owner && !(await first("SELECT 1 FROM classroom_member WHERE classroom_id = ? AND user_id = ?", [classId, userId]))) {
    return null;
  }
  const since = weekStart();
  const rows = await query<{
    user_id: string;
    name: string | null;
    points: number | null;
    analyses: number | null;
    score_sum: number | null;
    last_day: string | null;
  }>(
    `SELECT m.user_id, u.name,
            (SELECT SUM(points) FROM points p WHERE p.user_id = m.user_id AND p.day >= ?) AS points,
            (SELECT SUM(analyses) FROM points p WHERE p.user_id = m.user_id AND p.day >= ?) AS analyses,
            (SELECT SUM(score_sum) FROM points p WHERE p.user_id = m.user_id AND p.day >= ?) AS score_sum,
            (SELECT MAX(day) FROM points p WHERE p.user_id = m.user_id) AS last_day
     FROM classroom_member m LEFT JOIN user u ON u.id = m.user_id
     WHERE m.classroom_id = ?`,
    [since, since, since, classId],
  );
  const members = rows
    .map((r) => {
      const analyses = Number(r.analyses ?? 0);
      return {
        // Classmates never receive each other's account ids.
        id: owner ? r.user_id : "",
        name: r.name?.trim() || "Learner",
        points: Number(r.points ?? 0),
        you: r.user_id === userId,
        // Detail is for the teacher only.
        recordings: owner ? analyses : undefined,
        average: owner && analyses > 0 ? Math.round(Number(r.score_sum ?? 0) / analyses) : undefined,
        lastActive: owner ? (r.last_day ?? undefined) : undefined,
      };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return {
    id: klass.id,
    name: klass.name,
    role: owner ? "owner" : "member",
    members: members.length,
    code: owner ? klass.code : undefined,
    weekStart: since,
    roster: members,
  };
}

/** The teacher deletes the class; a member leaves it; the teacher can remove a member. */
export async function leaveOrDeleteClass(userId: string, classId: string, memberId?: string): Promise<boolean> {
  const klass = await first<{ owner_id: string }>("SELECT owner_id FROM classroom WHERE id = ?", [classId]);
  if (!klass) return false;
  const client = db();
  if (klass.owner_id === userId) {
    if (memberId) {
      await client.execute({ sql: "DELETE FROM classroom_member WHERE classroom_id = ? AND user_id = ?", args: [classId, memberId] });
    } else {
      await client.execute({ sql: "DELETE FROM classroom_member WHERE classroom_id = ?", args: [classId] });
      await client.execute({ sql: "DELETE FROM classroom WHERE id = ?", args: [classId] });
    }
    return true;
  }
  const res = await client.execute({
    sql: "DELETE FROM classroom_member WHERE classroom_id = ? AND user_id = ?",
    args: [classId, userId],
  });
  return res.rowsAffected > 0;
}

/** Remove everything a departing user owns or belongs to. */
export async function deleteCommunityData(userId: string): Promise<void> {
  const client = db();
  await client.execute({
    sql: "DELETE FROM classroom_member WHERE user_id = ? OR classroom_id IN (SELECT id FROM classroom WHERE owner_id = ?)",
    args: [userId, userId],
  });
  for (const sql of [
    "DELETE FROM classroom WHERE owner_id = ?",
    "DELETE FROM community WHERE user_id = ?",
    "DELETE FROM points WHERE user_id = ?",
  ]) {
    await client.execute({ sql, args: [userId] });
  }
}

// --- Reminder emails --------------------------------------------------------

const REMINDER_GAP = 3 * DAY_MS;
const REMINDER_BATCH = 200;

function unsubscribeToken(userId: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`unsubscribe:${userId}`).digest("hex");
}

export const unsubscribeUrl = (userId: string) =>
  `${SITE.url}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;

export async function unsubscribe(userId: string, token: string): Promise<boolean> {
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  if (!process.env.BETTER_AUTH_SECRET || expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  await db().execute({ sql: "UPDATE community SET reminders = 0, updated_at = ? WHERE user_id = ?", args: [Date.now(), userId] });
  return true;
}

/**
 * Nudge learners who asked for reminders, practised in the last two weeks,
 * but have not practised today or yesterday. At most one email every three days.
 */
export async function sendReminders(now = Date.now()): Promise<{ sent: number }> {
  const rows = await query<{ user_id: string; email: string; name: string | null; last_day: string }>(
    `SELECT c.user_id, u.email, u.name, MAX(p.day) AS last_day
     FROM community c JOIN user u ON u.id = c.user_id JOIN points p ON p.user_id = c.user_id
     WHERE c.reminders = 1 AND c.reminded_at < ?
     GROUP BY c.user_id HAVING last_day < ? AND last_day >= ? LIMIT ?`,
    [now - REMINDER_GAP, utcDay(now - DAY_MS), utcDay(now - 14 * DAY_MS), REMINDER_BATCH],
  );
  let sent = 0;
  for (const r of rows) {
    const days = Math.round((new Date(utcDay(now)).getTime() - new Date(r.last_day).getTime()) / DAY_MS);
    await sendEmail({
      to: r.email,
      subject: "Two minutes for your pronunciation?",
      lines: [
        `${r.name?.trim() ? `Hi ${r.name.trim().split(" ")[0]}, it` : "It"} has been ${days} days since your last recording.`,
        "Your drill words are waiting, and one short phrase is enough to keep the habit alive.",
        `You asked for these reminders. To stop them, open ${unsubscribeUrl(r.user_id)}`,
      ],
      action: { label: "Practise now", url: `${SITE.url}/home` },
    });
    await db().execute({ sql: "UPDATE community SET reminded_at = ? WHERE user_id = ?", args: [now, r.user_id] });
    sent++;
  }
  return { sent };
}
