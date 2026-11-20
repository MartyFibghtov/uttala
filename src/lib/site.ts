import type { Metadata } from "next";

const DEFAULT_URL = "http://localhost:3000";
const DEFAULT_CONTACT = "support@example.com";

const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;

/**
 * Production misconfiguration would put localhost URLs into canonicals, the sitemap and structured data, and a
 * placeholder address into the footer. Failing the build would break CI builds that have no environment, so this
 * logs loudly once when the server starts serving instead, and falls back to safe values.
 */
if (
  typeof window === "undefined" &&
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  const missing = [
    !configuredUrl && "NEXT_PUBLIC_SITE_URL",
    !process.env.NEXT_PUBLIC_CONTACT_EMAIL && "NEXT_PUBLIC_CONTACT_EMAIL",
  ].filter(Boolean);
  if (missing.length) {
    console.error(
      `[site] Missing ${missing.join(" and ")} in production. Canonical URLs, the sitemap, structured data and the contact address use fallbacks until this is set.`,
    );
  }
}

/** Public facts about this deployment. Set the NEXT_PUBLIC_* variables before going live. */
export const SITE = {
  name: "SayClear",
  url: (configuredUrl ?? fromVercel ?? DEFAULT_URL).replace(/\/+$/, ""),
  /** Legal name of the business that operates the service. */
  company: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "SayClear",
  contact: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? DEFAULT_CONTACT,
  hasRealContact: Boolean(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
  description:
    "Read aloud and see which words listeners would miss, how your rhythm and melody compare with a native voice, and what to practise next. In 17 languages.",
  /** Date the public content last changed in a meaningful way, used for sitemap lastModified. Bump when copy changes. */
  updated: "2026-11-19",
};

export const absoluteUrl = (path: string) => `${SITE.url}${path === "/" ? "" : path}`;

/** Trim to a search-snippet length at a word boundary. */
export function clip(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : cut.length).replace(/[\s,;:.\-–]+$/, "")}…`;
}

/**
 * Title, description, canonical and matching social tags for a public page. Social titles are set explicitly because
 * they would otherwise be inherited from the root layout. Images come from the opengraph-image file convention.
 */
export function pageMetadata({
  title,
  absoluteTitle,
  description,
  path,
}: {
  title: string;
  /** Use the title as written, without the " · SayClear" suffix. */
  absoluteTitle?: boolean;
  description: string;
  path: string;
}): Metadata {
  const social = absoluteTitle ? title : `${title} · ${SITE.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title: social, description, url: path, siteName: SITE.name, type: "website" },
    twitter: { card: "summary_large_image", title: social, description },
  };
}

/**
 * Origin for redirect URLs (checkout, billing portal). Never taken from the Host header in production;
 * outside production the request origin is used so local and e2e runs keep working.
 */
export function configuredOrigin(request: Request): string {
  const fixed = process.env.BETTER_AUTH_URL?.trim() || SITE.url;
  if (process.env.NODE_ENV === "production") return fixed.replace(/\/+$/, "");
  return process.env.BETTER_AUTH_URL?.trim() || new URL(request.url).origin;
}
