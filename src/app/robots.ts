import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in app routes. The public sound guides live under /languages, which stays open.
      disallow: ["/api/", "/home", "/learn", "/practice", "/drills", "/sounds", "/progress", "/community", "/assessment", "/account", "/onboarding", "/shadowing", "/lab"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
