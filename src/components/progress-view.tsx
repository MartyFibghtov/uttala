"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, Lock, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Heatmap } from "@/components/charts";
import { Orb } from "@/components/orb";
import { LanguagePicker } from "@/components/pickers";
import { scoreColor } from "@/components/practice-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useAccount } from "@/hooks/use-account";
import { ACHIEVEMENTS, isUnlocked } from "@/lib/gamification";
import { getLanguage } from "@/lib/languages";
import { useOverview } from "@/lib/stats";
import { clearProgress, isDue, useStore } from "@/lib/store";
import type { Attempt } from "@/lib/types";
import { cn } from "@/lib/utils";

function Trend({ attempts }: { attempts: Attempt[] }) {
  const W = 640;
  const H = 160;
  const x = (i: number) => (attempts.length === 1 ? W / 2 : (i / (attempts.length - 1)) * W);
  const y = (score: number) => H - (score / 100) * H;
  // A five-recording moving average shows the direction through the noise of single takes.
  const smooth = attempts.map((_, i) => {
    const window = attempts.slice(Math.max(0, i - 4), i + 1);
    return window.reduce((s, a) => s + a.overall, 0) / window.length;
  });
  return (
    <svg
      viewBox={`-6 -6 ${W + 12} ${H + 12}`}
      className="h-44 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Overall score over your recent recordings"
    >
      {[0, 0.2, 0.5, 1].map((f) => (
        <line key={f} x1={0} x2={W} y1={f * H} y2={f * H} className="stroke-border" vectorEffect="non-scaling-stroke" />
      ))}
      <polyline
        points={attempts.map((a, i) => `${x(i)},${y(a.overall)}`).join(" ")}
        fill="none"
        strokeWidth={1.25}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-muted-foreground/40"
      />
      <polyline
        points={smooth.map((s, i) => `${x(i)},${y(s)}`).join(" ")}
        fill="none"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-foreground"
      />
    </svg>
  );
}

const mean = (values: (number | null)[]) => {
  const real = values.filter((v): v is number => v !== null);
  return real.length ? Math.round(real.reduce((s, v) => s + v, 0) / real.length) : null;
};

function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null || now === before) return null;
  const up = now > before;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center text-xs font-medium tabular-nums", up ? "text-emerald-600" : "text-red-600")}>
      <Icon className="size-3" />
      {Math.abs(now - before)}
    </span>
  );
}

const SKILLS: { key: "accuracy" | "intelligibility" | "fluency" | "rhythm" | "intonation"; label: string; hint: string }[] = [
  { key: "accuracy", label: "Sounds", hint: "How clearly each word comes through" },
  { key: "intelligibility", label: "Understood", hint: "Words a listener without the script recognises" },
  { key: "fluency", label: "Fluency", hint: "Pace and hesitations" },
  { key: "rhythm", label: "Rhythm", hint: "Which words you stretch and shorten" },
  { key: "intonation", label: "Melody", hint: "The rise and fall of your pitch" },
];

const RANGES = [
  { id: 30, label: "Last 30" },
  { id: 100, label: "Last 100" },
  { id: 300, label: "All" },
];

export function ProgressView() {
  const { me } = useAccount();
  const lang = me.profile.lang;
  const language = getLanguage(lang);
  const o = useOverview();
  const attempts = useStore("attempts").filter((a) => a.lang === lang);
  const weak = useStore("weak").filter((w) => w.lang === lang);
  const mastered = useStore("mastered").filter((w) => w.lang === lang);
  const checkpoints = useStore("checkpoints").filter((c) => c.lang === lang);
  const [range, setRange] = useState(30);
  const [shown, setShown] = useState(15);

  const recent = attempts.slice(0, range).reverse();
  const last10 = attempts.slice(0, 10);
  const prev10 = attempts.slice(10, 20);
  const avg = mean(last10.map((a) => a.overall));
  const avgBefore = mean(prev10.map((a) => a.overall));
  const best = attempts.reduce((m, a) => Math.max(m, a.overall), 0);
  const unlocked = ACHIEVEMENTS.filter((a) => isUnlocked(a, o));

  const tiles = [
    { label: "Day streak", value: String(o.streak), note: `Longest ${o.longestStreak}` },
    { label: "Points", value: o.xp.toLocaleString(), note: `Rank ${o.rank.level} · ${o.rank.name}` },
    {
      label: "Average, last 10",
      value: avg === null ? "–" : String(avg),
      color: avg === null ? "" : scoreColor(avg),
      delta: <Delta now={avg} before={avgBefore} />,
      note: best ? `Best ${best}` : "No recordings yet",
    },
    { label: "Words mastered", value: String(mastered.length), note: `${weak.filter((w) => isDue(w)).length} to drill now` },
    { label: "Time speaking", value: o.minutes < 60 ? `${o.minutes} min` : `${(o.minutes / 60).toFixed(1)} h`, note: `${o.attempts} recordings` },
  ];

  return (
    <>
      <PageHeader title="Progress" description={`Your ${language.name} over time: scores, habits and what still needs work.`}>
        <LanguagePicker />
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="rounded-full" disabled={!o.attempts && !weak.length}>
              <Trash2 />
              Clear data
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear all progress?</DialogTitle>
              <DialogDescription>
                This deletes your history, streak, points, course progress and drill list for every language, on all
                your devices. It cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Keep my data</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive" onClick={clearProgress}>
                  Clear everything
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <p className={cn("mt-1 flex items-baseline gap-2 text-3xl font-semibold tracking-tight tabular-nums", t.color)}>
                {t.value}
                {t.delta}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{t.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Practice calendar</CardTitle>
              <p className="text-sm text-muted-foreground">
                Every day you practised, in any language. Darker means more points; the daily goal is {o.goal}.
              </p>
            </CardHeader>
            <CardContent>
              <Heatmap days={o.days} goal={o.goal} />
            </CardContent>
          </Card>

          {attempts.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-12 text-center">
              <p className="font-medium">Nothing recorded in {language.name} yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link href="/practice" className="underline underline-offset-4">
                  Record your first text
                </Link>{" "}
                and your scores will appear here.
              </p>
            </div>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">Overall score</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Thin line: each recording. Bold line: average of the last five.
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 rounded-full border p-0.5" role="group" aria-label="Range">
                    {RANGES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={range === r.id}
                        onClick={() => setRange(r.id)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground",
                          range === r.id && "bg-secondary text-foreground",
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  {recent.length > 1 ? (
                    <>
                      <Trend attempts={recent} />
                      <p className="mt-2 text-xs text-muted-foreground">{recent.length} recordings, oldest first.</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Record once more to see your trend.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Skills</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Average of your last 10 recordings, with the change from the 10 before.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {SKILLS.map((s) => {
                    const now = mean(last10.map((a) => a[s.key]));
                    const before = mean(prev10.map((a) => a[s.key]));
                    return (
                      <div key={s.key}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium">{s.label}</span>
                          <span className="flex items-baseline gap-2">
                            <Delta now={now} before={before} />
                            <span className={cn("tabular-nums", now === null ? "text-muted-foreground" : scoreColor(now))}>
                              {now ?? "–"}
                            </span>
                          </span>
                        </div>
                        <Progress value={now ?? 0} className="mt-1.5 h-1.5" aria-label={s.label} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {now === null && s.key !== "accuracy" && s.key !== "intelligibility"
                            ? "Measured on Plus, against a native reading"
                            : s.hint}
                        </p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {attempts.slice(0, shown).map((a) => (
                      <div key={a.id} className="flex items-center gap-4 py-3 first:pt-0">
                        <span className={cn("w-9 text-lg font-semibold tabular-nums", scoreColor(a.overall))}>
                          {a.overall}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm" lang={lang}>
                            {a.text}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(a.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            {a.xp !== undefined && ` · +${a.xp} points`}
                            {a.demo && " · demo"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {attempts.length > shown && (
                    <Button variant="outline" size="sm" className="mt-3 w-full rounded-full" onClick={() => setShown(shown + 30)}>
                      Show more
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checkpoints</CardTitle>
              <p className="text-sm text-muted-foreground">The same short test each time, so the numbers compare.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {checkpoints.length === 0 && <p className="text-sm text-muted-foreground">No checkpoint taken yet.</p>}
              {checkpoints.slice(0, 5).map((c, i) => (
                <div key={c.at} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {new Date(c.at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <Delta now={c.score} before={checkpoints[i + 1]?.score ?? null} />
                    <span className={cn("font-semibold tabular-nums", scoreColor(c.score))}>{c.score}</span>
                  </span>
                </div>
              ))}
              <Button asChild variant="outline" size="sm" className="mt-2 w-full rounded-full">
                <Link href="/assessment">{checkpoints.length ? "Take it again" : "Take the test"}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Achievements · {unlocked.length} of {ACHIEVEMENTS.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ACHIEVEMENTS.map((a) => {
                const [have, need] = a.progress(o);
                const done = have >= need;
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    {done ? (
                      <Orb palette={a.palette} size={32} />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                        <Lock className="size-3.5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-medium", !done && "text-muted-foreground")}>{a.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.detail}
                        {!done && need > 1 && ` · ${have}/${need}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weakest words</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {weak.length === 0 && <p className="text-sm text-muted-foreground">No weak words right now.</p>}
              {[...weak]
                .sort((a, b) => a.avg - b.avg)
                .slice(0, 10)
                .map((w) => (
                  <div key={w.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate" lang={lang}>
                      {w.text}
                    </span>
                    <span className={cn("tabular-nums", scoreColor(w.avg))}>{w.avg}</span>
                  </div>
                ))}
              {weak.length > 0 && (
                <Button asChild className="mt-3 w-full rounded-full">
                  <Link href="/drills">Open drills</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
