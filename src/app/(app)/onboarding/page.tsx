import type { Metadata } from "next";
import { Onboarding } from "@/components/onboarding";

export const metadata: Metadata = { title: "Welcome" };
export const instant = false;

export default function OnboardingPage() {
  return <Onboarding />;
}
