import type { Metadata } from "next";
import { FeaturesPage } from "@/components/marketing-pages";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Word-by-word feedback, rhythm and melody comparison, a phrasebook course, a sound library, ear training and spaced drills built from your own mistakes.",
  alternates: { canonical: "/features" },
};

export default function Page() {
  return <FeaturesPage />;
}
