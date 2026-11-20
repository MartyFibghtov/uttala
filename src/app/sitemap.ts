import type { MetadataRoute } from "next";
import { languageSlug } from "@/components/marketing-pages";
import { LANGUAGES } from "@/lib/languages";
import { SITE } from "@/lib/site";
import { soundSlug, soundsFor } from "@/lib/sounds";

// Only meaningful, indexable pages. lastModified is the date the content last changed, not the build time.
const LEGAL_UPDATED = "2026-11-10";

export default function sitemap(): MetadataRoute.Sitemap {
  const entry = (path: string, lastModified = SITE.updated) => ({ url: `${SITE.url}${path}`, lastModified });
  return [
    entry(""),
    entry("/features"),
    entry("/languages"),
    entry("/method"),
    entry("/pricing"),
    entry("/help"),
    entry("/sign-up"),
    entry("/terms", LEGAL_UPDATED),
    entry("/privacy", LEGAL_UPDATED),
    ...LANGUAGES.flatMap((l) => {
      const base = `/languages/${languageSlug(l)}`;
      return [entry(base), entry(`${base}/sounds`), ...soundsFor(l.code).map((s) => entry(`${base}/sounds/${soundSlug(s)}`))];
    }),
  ];
}
