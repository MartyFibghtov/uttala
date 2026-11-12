import type { Metadata } from "next";
import { UnitView } from "@/components/learn-view";
import { UNIT_IDS } from "@/lib/languages";

export const metadata: Metadata = { title: "Course unit" };
export const instant = false;

export function generateStaticParams() {
  return UNIT_IDS.map((unit) => ({ unit }));
}

export default async function UnitPage({ params }: { params: Promise<{ unit: string }> }) {
  const { unit } = await params;
  return <UnitView unitId={unit} />;
}
