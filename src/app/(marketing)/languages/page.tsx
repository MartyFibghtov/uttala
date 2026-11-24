import type { Metadata } from "next";
import { CONTENT, LanguagesPage } from "@/components/marketing-pages";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: `Pronunciation practice in ${CONTENT.languages} languages`,
  description: `Pronunciation coaching in ${CONTENT.languages} languages, each with a phrasebook course, sound guides, ear training and personal drills.`,
  path: "/languages",
});

export default function Page() {
  return <LanguagesPage />;
}
