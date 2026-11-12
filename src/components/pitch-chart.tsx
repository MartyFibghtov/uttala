import { pitchAt, type PitchTrack } from "@/lib/audio";
import type { Span } from "@/lib/text";
import type { ContourPoint } from "@/lib/types";

const RANGE = 9; // semitones above/below the speaker's median
const WORD_W = 64;
const H = 132;
const PAD = 10;

const yFor = (v: number) =>
  PAD + ((RANGE - Math.max(-RANGE, Math.min(RANGE, v))) / (2 * RANGE)) * (H - 2 * PAD);

function path(points: ContourPoint[], pick: (p: ContourPoint) => number | null, x0: number): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    const v = pick(p);
    if (v === null) {
      pen = false;
      continue;
    }
    const x = (p.x - x0) * WORD_W;
    const y = yFor(v);
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Build a reference-only pitch contour from reference word spans and pitch track (used for live shadowing guide). */
export function buildReferenceContour(spans: (Span | null)[], refPitch: PitchTrack | null): ContourPoint[] {
  if (!refPitch) return [];
  const points: ContourPoint[] = [];
  const SAMPLES = 4;
  spans.forEach((s, i) => {
    if (!s || s.end <= s.start) return;
    for (let k = 0; k < SAMPLES; k++) {
      const frac = (k + 0.5) / SAMPLES;
      const r = pitchAt(refPitch, s.start + frac * (s.end - s.start));
      points.push({ x: i + frac, user: null, ref: r });
    }
  });
  return points;
}

/** Learner vs reference melody, aligned word by word, with optional live playhead cursor for shadowing. */
export function PitchChart({
  contour,
  words,
  playhead,
}: {
  contour: ContourPoint[];
  words: string[];
  /** Word index + fraction (0..1) through the active word for real-time shadowing guide. */
  playhead?: number | null;
}) {
  if (!contour.length) return null;
  const first = Math.floor(contour[0].x);
  const last = Math.floor(contour[contour.length - 1].x);
  const width = (last - first + 1) * WORD_W;
  const hasUser = contour.some((p) => p.user !== null);

  const playheadX =
    playhead !== null && playhead !== undefined && playhead >= first && playhead <= last + 1
      ? (playhead - first) * WORD_W
      : null;

  let playheadY: number | null = null;
  if (playheadX !== null && playhead !== null && playhead !== undefined) {
    let closest: ContourPoint | null = null;
    let bestDist = Infinity;
    for (const p of contour) {
      if (p.ref === null) continue;
      const d = Math.abs(p.x - playhead);
      if (d < bestDist) {
        bestDist = d;
        closest = p;
      }
    }
    if (closest && closest.ref !== null) {
      playheadY = yFor(closest.ref);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        {hasUser && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-foreground" /> You
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-muted-foreground/50" /> Reference
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={H + 22} role="img" aria-label="Pitch contour compared with the reference">
          <line x1={0} x2={width} y1={H / 2} y2={H / 2} className="stroke-border" strokeDasharray="3 4" />
          {Array.from({ length: last - first + 1 }, (_, k) => (
            <g key={k}>
              {k > 0 && <line x1={k * WORD_W} x2={k * WORD_W} y1={PAD} y2={H - PAD} className="stroke-border/60" />}
              <text
                x={(k + 0.5) * WORD_W}
                y={H + 14}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {(words[first + k] ?? "").slice(0, 9)}
              </text>
            </g>
          ))}
          <path
            d={path(contour, (p) => p.ref, first)}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-muted-foreground/55"
          />
          {hasUser && (
            <path
              d={path(contour, (p) => p.user, first)}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-foreground"
            />
          )}
          {playheadX !== null && (
            <g>
              <line
                x1={playheadX}
                x2={playheadX}
                y1={PAD}
                y2={H - PAD}
                strokeWidth={1.5}
                className="stroke-emerald-500"
              />
              {playheadY !== null && (
                <circle cx={playheadX} cy={playheadY} r={4.5} className="fill-emerald-500" />
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
