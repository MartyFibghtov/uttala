"use client";

import Link from "next/link";
import { ArrowRight, AudioWaveform, BookOpen, Check, Ear, Flame, Gauge, Mic, Target } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Ring, Stars, WeekStrip } from "@/components/charts";
import { rankForScore } from "@/components/diagnostic-lesson";
import { Orb } from "@/components/orb";
import { LanguagePicker } from "@/components/pickers";
import { scoreColor } from "@/components/practice-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAccount } from "@/hooks/use-account";
import { getLanguage } from "@/lib/languages";
import { MINIMAL_PAIRS } from "@/lib/minimal-pairs";
import { soundsFor } from "@/lib/sounds";
import { courseProgress, useOverview } from "@/lib/stats";
import { isDue, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const LISTENING_ROUNDS = 10;

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const dayNumber = () => Math.floor(Date.now() / 86_400_000);

interface Task {
  icon: typeof Mic;
  title: string;
  detail: string;
  href: string;
  done: boolean;
}

function TaskRow({ task }: { task: Task }) {
  const Icon = task.icon;
  return (
    <Link
      href={task.href}
      className={cn(
        "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-secondary",
        task.done && "border-dashed",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          task.done ? "bg-emerald-100 text-emerald-800" : "bg-secondary",
        )}
      >
        {task.done ? <Check className="size-4" /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", task.done && "text-muted-foreground line-through")}>
          {task.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{task.detail}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function HomeView() {
  const { me } = useAccount();
  const o = useOverview();
  const lang = me.profile.lang;
  const language = getLanguage(lang);
  const best = useStore("best");
  const attempts = useStore("attempts").filter((a) => a.lang === lang);
  const weak = useStore("weak").filter((w) => w.lang === lang);
  const checkpoint = useStore("checkpoints").find((c) => c.lang === lang);

  const course = courseProgress(lang, best);
  const nextUnit = course.find((u) => u.cleared < u.total);
  const cleared = course.reduce((s, u) => s + u.cleared, 0);
  const phrases = course.reduce((s, u) => s + u.total, 0);
  const due = weak.filter((w) => isDue(w));
  const resting = weak.length - due.length;

  const sounds = soundsFor(lang);
  // A different sound each day, the same one all day.
  const featured = sounds.length ? sounds[dayNumber() % sounds.length] : null;

  const tasks: Task[] = [
    due.length
      ? {
          icon: Target,
          title: `Drill ${due.length} word${due.length === 1 ? "" : "s"}`,
          detail: due
            .slice(0, 4)
            .map((w) => w.text)
            .join(", "),
          href: "/drills",
          done: false,
        }
      : {
          icon: Target,
          title: "Drill list is clear",
          detail: resting ? `${resting} word${resting === 1 ? "" : "s"} resting until the next check` : "Unclear words from your recordings land here",
          href: "/drills",
          done: true,
        },
    nextUnit
      ? {
          icon: BookOpen,
          title: `Continue “${nextUnit.unit.title}”`,
          detail: `${nextUnit.cleared} of ${nextUnit.total} phrases cleared`,
          href: `/learn/${nextUnit.unit.id}`,
          done: false,
        }
      : {
          icon: BookOpen,
          title: "Course complete",
          detail: "Go back for three stars on every phrase",
          href: "/learn",
          done: true,
        },
    ...(MINIMAL_PAIRS[lang]
      ? [
          {
            icon: Ear,
            title: `Train your ear: ${LISTENING_ROUNDS} rounds`,
            detail: `${Math.min(o.today.rounds, LISTENING_ROUNDS)} of ${LISTENING_ROUNDS} done today`,
            href: "/drills?tab=listening",
            done: o.today.rounds >= LISTENING_ROUNDS,
          },
        ]
      : []),
    {
      icon: Mic,
      title: "Read a text aloud",
      detail: o.today.attempts ? `${o.today.attempts} recording${o.today.attempts === 1 ? "" : "s"} today` : "A full passage shows your rhythm and melody",
      href: "/practice",
      done: o.today.attempts > 0,
    },
  ];
  const first = tasks.find((t) => !t.done);

  return (
    <>
      <PageHeader
        title={`${greeting()}${me.user.name ? `, ${me.user.name.split(" ")[0]}` : ""}`}
        description={`Here is today's plan for your ${language.name}.`}
      >
        <LanguagePicker />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex items-center gap-5 sm:flex-col sm:gap-3">
                <Ring value={o.today.xp} max={o.goal} size={124}>
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">{o.today.xp}</span>
                  <span className="text-xs text-muted-foreground">of {o.goal} points</span>
                </Ring>
                <p className="text-sm font-medium sm:text-center">
                  {o.today.xp >= o.goal ? "Goal reached. Nice work." : o.today.xp ? "Keep going" : "Today's goal"}
                </p>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {tasks.map((t) => (
                  <TaskRow key={t.title} task={t} />
                ))}
                {first && (
                  <Button asChild className="mt-2 w-full rounded-full sm:w-auto">
                    <Link href={first.href}>
                      {o.today.xp ? "Continue" : "Start today's practice"}
                      <ArrowRight />
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">{language.name} phrasebook course</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {cleared} of {phrases} phrases cleared
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href="/learn">All units</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {course.map((u) => (
                <Link
                  key={u.unit.id}
                  href={`/learn/${u.unit.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
                >
                  <span className="w-32 shrink-0 truncate text-sm font-medium sm:w-40">{u.unit.title}</span>
                  <Progress value={(u.cleared / u.total) * 100} className="h-1.5 flex-1" aria-label={`${u.unit.title} progress`} />
                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                    {u.cleared}/{u.total}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <CardTitle className="text-base">Recent recordings</CardTitle>
              {attempts.length > 0 && (
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href="/progress">Progress</Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="divide-y">
              {attempts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing recorded in {language.name} yet. Your first recording takes about two minutes.
                </p>
              )}
              {attempts.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center gap-4 py-2.5 first:pt-0 last:pb-0">
                  <span className={cn("w-8 text-lg font-semibold tabular-nums", scoreColor(a.overall))}>{a.overall}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{a.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <Stars count={a.overall >= 90 ? 3 : a.overall >= 80 ? 2 : a.overall >= 70 ? 1 : 0} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Day streak</p>
                  <p className="flex items-center gap-2 text-4xl font-semibold tracking-tight tabular-nums">
                    {o.streak}
                    <Flame className={cn("size-7", o.streak > 0 ? "text-orange-500" : "text-muted-foreground/40")} />
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Longest: {o.longestStreak} days</p>
                  <p>
                    Rank {o.rank.level} · {o.rank.name}
                  </p>
                </div>
              </div>
              <WeekStrip days={o.days} goal={o.goal} />
              <div>
                <Progress value={(o.rank.into / o.rank.span) * 100} className="h-1.5" aria-label="Progress to the next rank" />
                <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                  {o.rank.span - o.rank.into} points to rank {o.rank.level + 1}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="size-4" />
                Speech Level &amp; Scan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {checkpoint ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className={cn("text-4xl font-semibold tracking-tight tabular-nums", scoreColor(checkpoint.score))}>
                      {checkpoint.score}%
                    </p>
                    <p className="text-xs font-medium">
                      {rankForScore(checkpoint.score).label} ·{" "}
                      <span className="font-normal text-muted-foreground">
                        {new Date(checkpoint.at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </span>
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {rankForScore(checkpoint.score).description}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Three short readings test your sounds, rhythm and melody, giving you a speech rank and a focused word
                  lesson.
                </p>
              )}
              <Button asChild variant="outline" size="sm" className="w-full rounded-full">
                <Link href="/assessment">{checkpoint ? "Take scan again" : "Take the 3-minute scan"}</Link>
              </Button>
            </CardContent>
          </Card>

          {featured && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AudioWaveform className="size-4" />
                  Sound of the day
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Orb palette="orchid" size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-lg">/{featured.symbol}/</p>
                    <p className="truncate text-sm text-muted-foreground">{featured.name}</p>
                  </div>
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">{featured.how}</p>
                <Button asChild variant="outline" size="sm" className="w-full rounded-full">
                  <Link href={`/sounds/${featured.id}`}>Practise this sound</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
