import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "@/components/marketing-og";
import { LANGUAGES } from "@/lib/languages";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: pronunciation practice with word-by-word feedback`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OgCard
      title="Find the words a listener would miss."
      subtitle="Pronunciation practice with feedback on every word."
      badge={`${LANGUAGES.length} languages`}
    />,
    { ...size },
  );
}
