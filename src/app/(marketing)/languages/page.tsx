import type { Metadata } from "next";
import { CONTENT, LanguagesPage } from "@/components/marketing-pages";

export const metadata: Metadata = {
  title: "Languages",
  description: `Pronunciation coaching in ${CONTENT.languages} languages, each with a phrasebook course, sound guides, ear training and personal drills.`,
  alternates: { canonical: "/languages" },
};

export default function Page() {
  return <LanguagesPage />;
}
