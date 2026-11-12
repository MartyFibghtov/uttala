"use client";

import { useEffect } from "react";
import { Orb } from "@/components/orb";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Orb palette="ember" size={64} float="fast" />
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your progress is safe. Try again, and if it keeps happening, reload the page.
      </p>
      <Button className="rounded-full" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
