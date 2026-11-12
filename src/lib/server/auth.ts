import { LibsqlDialect } from "@libsql/kysely-libsql";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { deleteCommunityData } from "./community";
import { APP_SCHEMA, db, dbConfig } from "./db";
import { sendEmail } from "./email";
import { deleteCustomerFor } from "./stripe";

export const googleEnabled = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

function resolveBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes("localhost")) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

function create() {
  return betterAuth({
    appName: "Uttala",
    baseURL: resolveBaseUrl(),
    secret: process.env.BETTER_AUTH_SECRET || "uttala-default-production-secret-key-32chars",
    trustedOrigins: [
      "https://*.vercel.app",
      ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
      ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
    ],
    database: { dialect: new LibsqlDialect(dbConfig()), type: "sqlite" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your Uttala password",
          lines: [
            "Someone asked to reset the password for your Uttala account.",
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
          },
        }
      : {},
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          // Stop billing first; if that fails the account must not be deleted.
          await deleteCustomerFor(user.id);
          const client = db();
          for (const table of ["profile", "subscription", "usage", "user_state", "generated_text"]) {
            await client.execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [user.id] });
          }
          await deleteCommunityData(user.id);
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
