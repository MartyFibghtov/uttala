import type { Metadata } from "next";
import { HELP, HelpPage } from "@/components/marketing-pages";

export const metadata: Metadata = {
  title: "Help",
  description: "Getting started, how scores work, the course and drills, plans and billing, privacy and troubleshooting.",
  alternates: { canonical: "/help" },
};

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: HELP.flatMap((g) => g.items).map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static content from this repository; "<" is escaped so it can never close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, "\\u003c") }}
      />
      <HelpPage />
    </>
  );
}
