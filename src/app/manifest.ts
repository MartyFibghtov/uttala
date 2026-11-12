import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** Lets learners add the app to their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} · Pronunciation coach`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/home",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
