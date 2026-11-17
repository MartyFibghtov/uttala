import Link from "next/link";

/**
 * Shown on every Vercel deployment during the test phase (and locally when NEXT_PUBLIC_TEST_ENV=1): the
 * rating by deduction runs a downloaded model in the learner's browser. Remove when it moves to a server.
 */
export function TestEnvBanner() {
  const on = !!process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_TEST_ENV === "1";
  if (!on) return null;
  return (
    <div
      role="note"
      className="sticky top-0 z-50 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <strong>Test version.</strong> Scores are experimental: every recording starts at 100 and loses points
      for each mistake caught. The sound check downloads a speech model (about 240 MB, once, cached by your
      browser) and runs it on your device; that audio stays on your device. Compare methods in the{" "}
      <Link href="/lab" className="underline underline-offset-2">
        sound check lab
      </Link>
      .
    </div>
  );
}
