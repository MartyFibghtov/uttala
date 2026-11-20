import Link from "next/link";
import { SITE } from "@/lib/site";

/** Server component, so the marketing pages do not ship the app shell's client bundle just for the wordmark. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-6 items-center gap-[3px]" aria-hidden>
        {[10, 18, 24, 14].map((h, i) => (
          <span key={i} className="w-[3px] rounded-full bg-foreground" style={{ height: h }} />
        ))}
      </span>
      {SITE.name}
    </Link>
  );
}
