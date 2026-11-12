import Link from "next/link";
import { Orb } from "@/components/orb";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Orb palette="sky" size={64} float="fast" />
      <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="max-w-sm text-sm text-muted-foreground">The link may be old, or the address may have a typo.</p>
      <Button asChild className="rounded-full">
        <Link href="/">Go to the home page</Link>
      </Button>
    </div>
  );
}
