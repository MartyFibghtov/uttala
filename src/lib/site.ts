/** Public facts about this deployment. Set the NEXT_PUBLIC_* variables before going live. */
export const SITE = {
  name: "Uttala",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Legal name of the business that operates the service. */
  company: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Uttala",
  contact: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "support@example.com",
  description:
    "Read aloud and see which words listeners would miss, how your rhythm and melody compare with a native voice, and what to practise next. In 17 languages.",
};
