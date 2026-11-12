import type { Metadata } from "next";
import { ProgressView } from "@/components/progress-view";

export const metadata: Metadata = { title: "Progress" };
export const instant = false;

export default function ProgressPage() {
  return <ProgressView />;
}
