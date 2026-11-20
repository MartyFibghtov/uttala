import type { Metadata } from "next";
import { SoundCheckLab } from "@/components/sound-check-lab";

export const metadata: Metadata = { title: "Sound check lab" };
export const instant = false;

/** Demo: the same recording scored by the engine alone and with the precise sound check. */
export default function LabPage() {
  return <SoundCheckLab />;
}
