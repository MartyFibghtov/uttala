import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { languageBySlug, LanguagePage, languageSlug } from "@/components/marketing-pages";
import { LANGUAGES } from "@/lib/languages";
import { soundsFor } from "@/lib/sounds";

type Props = { params: Promise<{ lang: string }> };

// Every language page is generated at build time; any other slug is a 404, so nothing needs to stream.
export const instant = false;

export function generateStaticParams() {
  return LANGUAGES.map((l) => ({ lang: languageSlug(l) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const language = languageBySlug((await params).lang);
  if (!language) return {};
  const sounds = soundsFor(language.code)
    .slice(0, 3)
    .map((s) => s.name.toLowerCase())
    .join(", ");
  return {
    title: `${language.name} pronunciation practice`,
    description: `Practise ${language.name} pronunciation with word-by-word feedback on your own voice. Guides for ${sounds} and more, ear training and a phrasebook course.`,
    alternates: { canonical: `/languages/${languageSlug(language)}` },
  };
}

export default async function Page({ params }: Props) {
  const language = languageBySlug((await params).lang);
  if (!language) notFound();
  return <LanguagePage language={language} />;
}
