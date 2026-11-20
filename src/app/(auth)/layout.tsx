import type { Metadata } from "next";
import type { ReactNode } from "react";

// Account pages have no search value: keep them out of the index and let links through.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
