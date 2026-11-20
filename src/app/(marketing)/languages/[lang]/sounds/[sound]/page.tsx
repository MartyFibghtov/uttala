import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { languageBySlug, languageSlug } from "@/components/marketing-pages";
import { SoundPage, soundDescription, soundPath, soundTitle } from "@/components/marketing-sounds";
import { LANGUAGES } from "@/lib/languages";
import { pageMetadata } from "@/lib/site";
import { SOUNDS, soundBySlug, soundSlug } from "@/lib/sounds";

type Props = { params: Promise<{ lang: string; sound: string }> };

export const instant = false;

export function generateStaticParams() {
  return SOUNDS.flatMap((s) => {
    const language = LANGUAGES.find((l) => l.code === s.lang);
    return language ? [{ lang: languageSlug(language), sound: soundSlug(s) }] : [];
  });
}

async function resolve(params: Props["params"]) {
  const { lang, sound: slug } = await params;
  const language = languageBySlug(lang);
  const sound = language ? soundBySlug(language.code, slug) : undefined;
  return language && sound ? { language, sound } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params);
  if (!found) return {};
  const { language, sound } = found;
  return pageMetadata({ title: soundTitle(sound, language), description: soundDescription(sound), path: soundPath(language, sound) });
}

export default async function Page({ params }: Props) {
  const found = await resolve(params);
  if (!found) notFound();
  return <SoundPage language={found.language} sound={found.sound} />;
}
