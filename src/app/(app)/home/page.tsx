import type { Metadata } from "next";
import { HomeView } from "@/components/home-view";

export const metadata: Metadata = { title: "Home" };
// Renders in the browser once the account has loaded; there is no static shell to validate.
export const instant = false;

export default function HomePage() {
  return <HomeView />;
}
