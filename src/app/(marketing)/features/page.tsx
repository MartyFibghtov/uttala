import type { Metadata } from "next";
import { FeaturesPage } from "@/components/marketing-pages";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Pronunciation practice features",
  description:
    "Word-by-word feedback, rhythm and melody comparison, a phrasebook course, a sound library, ear training and spaced drills built from your own mistakes.",
  path: "/features",
});

export default function Page() {
  return <FeaturesPage />;
}
