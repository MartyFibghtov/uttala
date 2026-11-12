import type { Metadata } from "next";
import { SoundDetail } from "@/components/sounds-view";
import { SOUNDS } from "@/lib/sounds";

export const metadata: Metadata = { title: "Sound" };
export const instant = false;

export function generateStaticParams() {
  return SOUNDS.map((s) => ({ id: s.id }));
}

export default async function SoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SoundDetail id={id} />;
}
