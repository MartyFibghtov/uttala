import { ImageResponse } from "next/og";
import { languageBySlug, languageSlug } from "@/components/marketing-pages";
import { OG_SIZE, OgCard, ogSafe } from "@/components/marketing-og";
import { LANGUAGES } from "@/lib/languages";
import { SITE } from "@/lib/site";
import { KIND_LABEL, SOUNDS, soundBySlug, soundSlug } from "@/lib/sounds";

export const alt = `${SITE.name} sound guide`;
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return SOUNDS.flatMap((s) => {
    const language = LANGUAGES.find((l) => l.code === s.lang);
    return language ? [{ lang: languageSlug(language), sound: soundSlug(s) }] : [];
  });
}

export default async function Image({ params }: { params: Promise<{ lang: string; sound: string }> }) {
  const { lang, sound: slug } = await params;
  const language = languageBySlug(lang);
  const sound = language ? soundBySlug(language.code, slug) : undefined;
  // Non-Latin names and IPA symbols are not in the default font, so fall back to the kind of sound.
  const name = (sound && ogSafe(sound.name)) || (sound ? KIND_LABEL[sound.kind] : "Sound guide");
  return new ImageResponse(
    <OgCard
      eyebrow={`How to pronounce the ${language?.name ?? ""} sound`.replace("  ", " ")}
      title={name}
      subtitle="How to make it, what goes wrong, and words to practise."
      badge={language?.name}
    />,
    { ...size },
  );
}
