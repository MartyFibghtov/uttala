import { LibsqlDialect } from "@libsql/kysely-libsql";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { deleteCommunityData } from "./community";
import { APP_SCHEMA, db, dbConfig } from "./db";
import { sendEmail } from "./email";
import { deleteCustomerFor } from "./stripe";

export const googleEnabled = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

const isProduction = process.env.NODE_ENV === "production";

/** Reduce a URL to its origin; anything that is not an http(s) URL is dropped. */
function originOf(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

const isLocal = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

function resolveBaseUrl(): string {
  const candidates = [
    originOf(process.env.BETTER_AUTH_URL),
    originOf(process.env.NEXT_PUBLIC_SITE_URL),
    // Vercel variables are harmless elsewhere: they are simply unset.
    originOf(process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`),
    originOf(process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`),
  ].filter((o): o is string => !!o);
  const real = candidates.find((o) => !isLocal(o));
  if (real) return real;
  if (isProduction && process.env.NEXT_PHASE !== "phase-production-build") {
    console.error("BETTER_AUTH_URL (or NEXT_PUBLIC_SITE_URL) is not set to a public URL; sign-in links and cookies will not work.");
  }
  return candidates[0] ?? "http://localhost:3000";
}

/** Exact origins allowed to call the auth endpoints. No wildcards. */
function resolveTrustedOrigins(baseUrl: string): string[] {
  const extra = (process.env.TRUSTED_ORIGINS ?? "").split(",").map(originOf);
  const origins = [
    baseUrl,
    originOf(process.env.BETTER_AUTH_URL),
    originOf(process.env.NEXT_PUBLIC_SITE_URL),
    originOf(process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`),
    originOf(process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`),
    ...extra,
    ...(isProduction ? [] : ["http://localhost:3000"]),
  ].filter((o): o is string => !!o);
  return [...new Set(isProduction ? origins.filter((o) => !isLocal(o) || o === baseUrl) : origins)];
}

function resolveSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  // A shared fallback would let anyone forge sessions, so production refuses to start without one.
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -hex 32`.");
  }
  return "sayclear-development-only-secret-not-for-production";
}

function create() {
  const baseURL = resolveBaseUrl();
  return betterAuth({
    appName: "SayClear",
    baseURL,
    secret: resolveSecret(),
    trustedOrigins: resolveTrustedOrigins(baseURL),
    // Always on (the library default is production only). In-memory counters are per server instance.
    // Keyed per IP, so sign-in/sign-up allow a classroom behind one school NAT to get in within a minute or two.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 600,
      storage: "memory",
      customRules: {
        "/sign-in/email": { window: 60, max: 30 },
        "/sign-up/email": { window: 60, max: 30 },
        "/request-password-reset": { window: 60, max: 3 },
        "/forget-password": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/delete-user": { window: 60, max: 3 },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    database: { dialect: new LibsqlDialect(dbConfig()), type: "sqlite" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your SayClear password",
          lines: [
            "Someone asked to reset the password for your SayClear account.",
            "If that was you, choose a new password with the button below. The link works for one hour. If it was not you, you can ignore this email.",
          ],
          action: { label: "Choose a new password", url },
        });
      },
    },
    socialProviders: googleEnabled()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            prompt: "select_account",
          },
        }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          // Stop billing first; if that fails the account must not be deleted.
          try {
            await deleteCustomerFor(user.id);
          } catch (err) {
            // A customer that is already gone in Stripe must not block deletion.
            if ((err as { code?: string })?.code !== "resource_missing") throw err;
          }
          const client = db();
          for (const table of ["profile", "subscription", "usage", "user_state", "generated_text"]) {
            await client.execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [user.id] });
          }
          await deleteCommunityData(user.id);
          // Pending password-reset tokens store the user id as their value.
          await client.execute({ sql: "DELETE FROM verification WHERE value = ?", args: [user.id] });
        },
      },
    },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof create> | undefined;

/** Created on first use so that importing this module never needs secrets (e.g. during the build). */
export const getAuth = () => (instance ??= create());

let migrated: Promise<void> | undefined;

/** Create any missing tables. Runs once per server instance. */
export function ready(): Promise<void> {
  migrated ??= (async () => {
    const client = db();
    for (const ddl of APP_SCHEMA) await client.execute(ddl);
    const { runMigrations } = await getMigrations(getAuth().options);
    await runMigrations();
  })().catch((err) => {
    migrated = undefined;
    throw err;
  });
  return migrated;
}
