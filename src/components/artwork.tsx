import Image from "next/image";
import { cn } from "@/lib/utils";

export const ARTWORKS = {
  heroAcoustic: { src: "/images/hero-acoustic.jpg", width: 1376, height: 768 },
  stepListen: { src: "/images/step-listen.jpg", width: 1200, height: 896 },
  stepRecord: { src: "/images/step-record.jpg", width: 1200, height: 896 },
  stepFix: { src: "/images/step-fix.jpg", width: 1200, height: 896 },
  learnBanner: { src: "/images/learn-course-banner.jpg", width: 1376, height: 768 },
  shadowingStudio: { src: "/images/shadowing-studio.jpg", width: 1376, height: 768 },
  emptyClarity: { src: "/images/empty-clarity.jpg", width: 1200, height: 896 },
} as const;

export type ArtworkName = keyof typeof ARTWORKS;

/** Framed decorative artwork adapted for light/dark themes and Next.js image optimization. */
export function ArtworkFrame({
  name,
  sizes,
  eager = false,
  alt = "",
  className,
  imgClassName,
}: {
  name: ArtworkName;
  sizes: string;
  eager?: boolean;
  alt?: string;
  className?: string;
  imgClassName?: string;
}) {
  const asset = ARTWORKS[name];
  return (
    <div
      aria-hidden={alt === "" || undefined}
      className={cn(
        "relative overflow-hidden bg-secondary/40 ring-1 ring-border/60",
        className,
      )}
    >
      <Image
        src={asset.src}
        alt={alt}
        width={asset.width}
        height={asset.height}
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        className={cn(
          "h-full w-full object-cover transition-transform duration-500 dark:brightness-[0.84] dark:contrast-[1.06]",
          imgClassName,
        )}
      />
    </div>
  );
}

