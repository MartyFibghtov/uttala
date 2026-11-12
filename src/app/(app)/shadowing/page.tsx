import type { Metadata } from "next";
import { ShadowingView } from "@/components/shadowing-view";

export const metadata: Metadata = { title: "Shadowing" };
export const instant = false;

export default function ShadowingPage() {
  return <ShadowingView />;
}

