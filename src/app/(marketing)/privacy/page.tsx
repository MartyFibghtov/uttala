import type { Metadata } from "next";
import { Privacy } from "@/components/legal";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description: "What SayClear keeps (scores and drill words), what it never stores (your recordings), and how to export or delete your data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <Privacy />;
}
