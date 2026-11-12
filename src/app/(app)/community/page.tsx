import type { Metadata } from "next";
import { CommunityView } from "@/components/community-view";

export const metadata: Metadata = { title: "Community" };
export const instant = false;

export default function CommunityPage() {
  return <CommunityView />;
}
