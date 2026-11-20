import type { Metadata } from "next";
import { languageSlug } from "@/components/marketing-pages";
import { SoundDetail } from "@/components/sounds-view";
import { LANGUAGES } from "@/lib/languages";
import { SOUNDS, getSound, soundSlug } from "@/lib/sounds";

export const instant = false;

export function generateStaticParams() {
  return SOUNDS.map((s) => ({ id: s.id }));
}

/** The signed-in page is not for search: it is noindex and points at the public guide with the same content. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const sound = getSound((await params).id);
  const language = sound && LANGUAGES.find((l) => l.code === sound.lang);
  return {
    title: "Sound",
    robots: { index: false, follow: false },
    ...(sound && language
      ? { alternates: { canonical: `/languages/${languageSlug(language)}/sounds/${soundSlug(sound)}` } }
      : {}),
  };
}

export default async function SoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SoundDetail id={id} />;
}
