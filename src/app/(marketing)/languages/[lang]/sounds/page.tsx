import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { languageBySlug, languageSlug } from "@/components/marketing-pages";
import { hubDescription, hubPath, hubTitle, SoundHubPage } from "@/components/marketing-sounds";
import { LANGUAGES } from "@/lib/languages";
import { pageMetadata } from "@/lib/site";

type Props = { params: Promise<{ lang: string }> };

export const instant = false;

export function generateStaticParams() {
  return LANGUAGES.map((l) => ({ lang: languageSlug(l) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const language = languageBySlug((await params).lang);
  if (!language) return {};
  return pageMetadata({ title: hubTitle(language), description: hubDescription(language), path: hubPath(language) });
}

export default async function Page({ params }: Props) {
  const language = languageBySlug((await params).lang);
  if (!language) notFound();
  return <SoundHubPage language={language} />;
}
