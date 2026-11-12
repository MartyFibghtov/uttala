import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "@/components/marketing";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="aurora-line" />
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
