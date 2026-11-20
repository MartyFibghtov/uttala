import { ImageResponse } from "next/og";
import { languageBySlug, languageSlug } from "@/components/marketing-pages";
import { OG_SIZE, OgCard } from "@/components/marketing-og";
import { LANGUAGES } from "@/lib/languages";
import { SITE } from "@/lib/site";
import { soundsFor } from "@/lib/sounds";

export const alt = `${SITE.name} pronunciation practice`;
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return LANGUAGES.map((l) => ({ lang: languageSlug(l) }));
}

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const language = languageBySlug((await params).lang);
  const name = language?.name ?? "Pronunciation";
  return new ImageResponse(
    <OgCard
      eyebrow="Pronunciation practice"
      title={name}
      subtitle={language ? `Sounds, drills and feedback. ${soundsFor(language.code).length} sound guides.` : "Sounds, drills and feedback."}
      badge={`${LANGUAGES.length} languages`}
    />,
    { ...size },
  );
}
