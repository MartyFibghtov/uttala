import type { Metadata } from "next";
import { Suspense } from "react";
import { DrillsView } from "@/components/drills-view";

export const metadata: Metadata = { title: "Drills" };
export const instant = false;

export default function DrillsPage() {
  // The view reads the selected tab from the URL.
  return (
    <Suspense>
      <DrillsView />
    </Suspense>
  );
}
