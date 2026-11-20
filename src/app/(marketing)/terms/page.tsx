import type { Metadata } from "next";
import { Terms } from "@/components/legal";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description: "The terms for using SayClear: accounts, plans and payment, acceptable use and how the automated feedback should be read.",
  path: "/terms",
});

export default function TermsPage() {
  return <Terms />;
}
