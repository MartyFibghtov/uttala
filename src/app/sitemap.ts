import type { MetadataRoute } from "next";
import { languageSlug } from "@/components/marketing-pages";
import { LANGUAGES } from "@/lib/languages";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/features", "/languages", "/method", "/pricing", "/help", "/sign-up", "/sign-in", "/terms", "/privacy"];
  const languages = LANGUAGES.map((l) => `/languages/${languageSlug(l)}`);
  return [...pages, ...languages].map((path) => ({
    url: `${SITE.url}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
