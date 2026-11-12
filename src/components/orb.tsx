import { cn } from "@/lib/utils";

export type OrbPalette = "gold" | "ember" | "orchid" | "sky" | "moss";

/** Decorative colour sphere. Purely visual, so it is hidden from assistive technology. */
export function Orb({
  palette = "gold",
  size = 48,
  float,
  className,
  style,
}: {
  palette?: OrbPalette;
  size?: number;
  float?: "fast" | "slow";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "orb block shrink-0",
        `orb-${palette}`,
        float === "fast" && "orb-float",
        float === "slow" && "orb-float-slow",
        className,
      )}
      style={{ width: size, height: size, ...style }}
    />
  );
}

/** Palette that reflects how a score went, for use next to results. */
export const paletteForScore = (score: number): OrbPalette => (score >= 80 ? "moss" : score >= 60 ? "gold" : "ember");

/** A loose cluster of orbs for hero and empty areas. The parent must be `relative overflow-hidden`. */
export function OrbCluster({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <Orb palette="gold" size={120} float="slow" className="absolute right-[26%] -top-10" />
      <Orb palette="ember" size={64} float="fast" className="absolute right-[4%] top-2" />
      <Orb palette="orchid" size={168} float="fast" className="absolute right-[12%] top-[26%]" />
      <Orb palette="sky" size={104} float="slow" className="absolute right-[20%] -bottom-10" />
      <Orb palette="moss" size={76} float="fast" className="absolute -right-4 bottom-4" />
    </div>
  );
}
