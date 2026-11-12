import type { Metadata } from "next";
import { MethodPage } from "@/components/marketing-pages";

export const metadata: Metadata = {
  title: "Method",
  description:
    "The research behind Uttala and how a recording is scored: alignment, open transcription, rhythm and melody comparison, and spaced review.",
  alternates: { canonical: "/method" },
};

export default function Page() {
  return <MethodPage />;
}
