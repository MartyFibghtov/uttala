import type { Metadata } from "next";
import { JsonLd, faqLd } from "@/components/json-ld";
import { FAQ, Landing } from "@/components/marketing";
import { LANGUAGES } from "@/lib/languages";
import { PLANS } from "@/lib/plans";
import { SITE, absoluteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: `${SITE.name}: Pronunciation practice in ${LANGUAGES.length} languages`,
  absoluteTitle: true,
  description:
    "Read a sentence aloud and see which words a listener would miss. Word-by-word feedback, drills from your mistakes and sound guides in 17 languages.",
  path: "/",
});

const SCHEMA = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: SITE.name,
    legalName: SITE.company,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/apple-icon"),
    ...(SITE.hasRealContact ? { email: SITE.contact } : {}),
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    name: SITE.name,
    url: absoluteUrl("/"),
    inLanguage: "en",
    publisher: { "@id": absoluteUrl("/#organization") },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE.name,
    url: absoluteUrl("/"),
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any (web browser)",
    description: SITE.description,
    offers: Object.values(PLANS).map((p) => ({
      "@type": "Offer",
      name: p.name,
      description: p.tagline,
      price: (p.price.month / 100).toFixed(2),
      priceCurrency: "USD",
      url: absoluteUrl("/pricing"),
    })),
  },
  faqLd(FAQ.map(({ q, a }) => ({ q, a }))),
];

export default function HomePage() {
  return (
    <>
      <JsonLd data={SCHEMA} />
      <Landing />
    </>
  );
}
