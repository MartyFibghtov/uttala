import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AccountProvider } from "@/hooks/use-account";

export const metadata: Metadata = { robots: { index: false } };

/** Everything behind sign-in. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      <AppShell>{children}</AppShell>
    </AccountProvider>
  );
}
