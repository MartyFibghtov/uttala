import type { Metadata } from "next";
import { AssessmentView } from "@/components/assessment-view";

export const metadata: Metadata = { title: "Checkpoint test" };
export const instant = false;

export default function AssessmentPage() {
  return <AssessmentView />;
}
