import type { Metadata } from "next";
import { SoundsView } from "@/components/sounds-view";

export const metadata: Metadata = { title: "Sounds" };
export const instant = false;

export default function SoundsPage() {
  return <SoundsView />;
}
