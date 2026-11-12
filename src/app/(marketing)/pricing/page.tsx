import type { Metadata } from "next";
import { Pricing } from "@/components/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free with five analysed recordings a day. Upgrade for more practice, rhythm and melody feedback, and sound-by-sound scoring.",
};

export default function PricingPage() {
  return (
    <div className="aurora-wash">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
        <h1 className="text-center text-4xl font-semibold tracking-tight">Start free. Upgrade when it clicks.</h1>
        <p className="mx-auto mt-3 mb-10 max-w-xl text-center text-muted-foreground">
          The free plan is enough to find out what to fix. Paid plans let you fix it faster.
        </p>
        <Pricing />
      </div>
    </div>
  );
}
