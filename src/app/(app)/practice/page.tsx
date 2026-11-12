import type { Metadata } from "next";
import { PracticeView } from "@/components/practice-view";

export const metadata: Metadata = { title: "Practice" };
export const instant = false;

export default function PracticePage() {
  return <PracticeView />;
}
