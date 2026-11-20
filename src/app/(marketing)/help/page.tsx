import type { Metadata } from "next";
import { JsonLd, faqLd } from "@/components/json-ld";
import { HELP, HelpPage } from "@/components/marketing-pages";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Help: scores, drills and billing",
  description: "Getting started, how scores work, the course and drills, plans and billing, privacy and troubleshooting.",
  path: "/help",
});

export default function Page() {
  return (
    <>
      <JsonLd data={faqLd(HELP.flatMap((g) => g.items))} />
      <HelpPage />
    </>
  );
}
