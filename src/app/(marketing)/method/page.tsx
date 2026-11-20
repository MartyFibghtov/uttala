import type { Metadata } from "next";
import { MethodPage } from "@/components/marketing-pages";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "How pronunciation scoring works: the method behind SayClear",
  description:
    "The research behind SayClear and how a recording is scored: alignment, open transcription, rhythm and melody comparison, and spaced review.",
  path: "/method",
});

export default function Page() {
  return <MethodPage />;
}
