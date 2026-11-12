import { Flame } from "lucide-react";
import { dayKey, lastDays, type Days } from "@/lib/gamification";
import { cn } from "@/lib/utils";

/** Progress towards a target, drawn as a ring with content in the middle. */
export function Ring({
  value,
  max,
  size = 120,
  stroke = 10,
  className,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-secondary" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className={cn("transition-[stroke-dashoffset] duration-700", share >= 1 ? "stroke-emerald-500" : "stroke-foreground")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });

/** The last seven days: which ones had practice and which met the goal. */
export function WeekStrip({ days, goal }: { days: Days; goal: number }) {
  const today = dayKey();
  return (
    <div className="flex justify-between gap-1.5">
      {lastDays(7).map((key) => {
        const xp = days[key]?.xp ?? 0;
        return (
          <div key={key} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              title={`${key}: ${xp} points`}
              className={cn(
                "flex size-8 items-center justify-center rounded-full border text-xs",
                xp > 0 && "border-transparent bg-amber-100 text-amber-900",
                xp >= goal && "bg-foreground text-background",
                key === today && "ring-2 ring-foreground/20 ring-offset-2 ring-offset-background",
              )}
            >
              {xp > 0 ? <Flame className="size-3.5" /> : null}
            </span>
            <span className={cn("text-[11px] text-muted-foreground", key === today && "font-medium text-foreground")}>
              {WEEKDAY.format(new Date(`${key}T12:00:00`))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SHADES = ["bg-secondary", "bg-emerald-200", "bg-emerald-400", "bg-emerald-600", "bg-emerald-800"];

/** A calendar of practice: one square per day, darker for more points. */
export function Heatmap({ days, goal, weeks = 26 }: { days: Days; goal: number; weeks?: number }) {
  // End the grid on Saturday of the current week so columns are whole weeks.
  const now = new Date();
  const count = weeks * 7 - (6 - now.getDay());
  const keys = lastDays(count);
  const today = dayKey();
  const shade = (xp: number) => (xp <= 0 ? 0 : xp < goal / 2 ? 1 : xp < goal ? 2 : xp < goal * 2 ? 3 : 4);
  return (
    <div>
      {/* Right-aligned and clipped on the left, so narrow screens show the most recent weeks. */}
      <div className="flex justify-end overflow-hidden">
      <div className="grid shrink-0 grid-flow-col grid-rows-7 gap-1" role="img" aria-label="Practice calendar">
        {keys.map((key) => {
          const xp = days[key]?.xp ?? 0;
          return (
            <span
              key={key}
              title={`${new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" })}: ${xp} points`}
              className={cn("size-4 rounded-[3px] lg:size-5", SHADES[shade(xp)], key === today && "ring-1 ring-foreground")}
            />
          );
        })}
      </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        Less
        {SHADES.map((s) => (
          <span key={s} className={cn("size-2.5 rounded-[3px]", s)} />
        ))}
        More
      </div>
    </div>
  );
}

/** A small line of recent scores, 0–100. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const W = 100;
  const H = 28;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - (v / 100) * H}`).join(" ");
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} preserveAspectRatio="none" className={cn("h-7 w-24", className)} aria-hidden>
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-foreground"
      />
    </svg>
  );
}

/** One to three stars for a phrase. */
export function Stars({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((n) => (
        <svg key={n} viewBox="0 0 20 20" className={cn("size-3.5", n <= count ? "fill-amber-400" : "fill-border")} aria-hidden>
          <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.8z" />
        </svg>
      ))}
    </span>
  );
}
