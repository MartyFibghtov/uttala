"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, AudioWaveform, Check, Ear, Gauge, Mic, PartyPopper } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Stars } from "@/components/charts";
import { Orb, type OrbPalette } from "@/components/orb";
import { LanguagePicker, VoicePicker, useVoiceId } from "@/components/pickers";
import { PracticeSession, scoreColor } from "@/components/practice-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAccount } from "@/hooks/use-account";
import { getLanguage } from "@/lib/languages";
import { courseProgress } from "@/lib/stats";
import { PHRASE_CLEAR, starsFor, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const PALETTES: OrbPalette[] = ["gold", "sky", "orchid", "moss", "ember"];

const MORE = [
  {
    href: "/practice",
    icon: Mic,
    title: "Passages and tongue twisters",
    body: "Longer texts for rhythm and melody, or paste the words you actually need to say.",
  },
  {
    href: "/sounds",
    icon: AudioWaveform,
    title: "Sound library",
    body: "How each difficult sound is made, what usually goes wrong, and words to practise it.",
  },
  {
    href: "/drills?tab=listening",
    icon: Ear,
    title: "Ear training",
    body: "Minimal pairs in changing voices, so you can hear the difference before you say it.",
  },
  {
    href: "/assessment",
    icon: Gauge,
    title: "Checkpoint test",
    body: "Three readings, one comparable score, and a recommended level.",
  },
];

export function LearnView() {
  const { me } = useAccount();
  const lang = me.profile.lang;
  const language = getLanguage(lang);
  const course = courseProgress(lang, useStore("best"));
  const cleared = course.reduce((s, u) => s + u.cleared, 0);
  const total = course.reduce((s, u) => s + u.total, 0);
  const stars = course.reduce((s, u) => s + u.stars, 0);
  const next = course.find((u) => u.cleared < u.total);

  return (
    <>
      <PageHeader
        title="Learn"
        description={`The ${language.name} phrasebook course: seven everyday situations, four phrases each. Clear a phrase by scoring ${PHRASE_CLEAR} or more.`}
      >
        <LanguagePicker />
      </PageHeader>

      <Card className="aurora-wash">
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Course progress</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {cleared}
              <span className="text-lg font-normal text-muted-foreground"> / {total} phrases</span>
            </p>
            <Progress value={(cleared / total) * 100} className="mt-3 h-2" aria-label="Course progress" />
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {stars} of {total * 3} stars collected
            </p>
          </div>
          <Button asChild size="lg" className="rounded-full">
            <Link href={`/learn/${(next ?? course[0]).unit.id}`}>
              {cleared === 0 ? "Start the course" : next ? `Continue: ${next.unit.title}` : "Review from the start"}
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {course.map((u, i) => {
          const done = u.cleared === u.total;
          return (
            <Link
              key={u.unit.id}
              href={`/learn/${u.unit.id}`}
              className="group flex flex-col rounded-2xl border bg-card p-5 transition-all hover:border-foreground/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <Orb palette={PALETTES[i % PALETTES.length]} size={36} />
                {done ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                    <Check className="size-3" />
                    Cleared
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Unit {i + 1}</span>
                )}
              </div>
              <h2 className="mt-4 font-semibold">{u.unit.title}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{u.unit.blurb}</p>
              <div className="mt-4 flex items-center gap-3">
                <Progress value={(u.cleared / u.total) * 100} className="h-1.5 flex-1" aria-label={`${u.unit.title} progress`} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {u.cleared}/{u.total}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">{u.stars} / {u.total * 3} stars</span>
                <span className="flex items-center gap-1 font-medium text-foreground">
                  {done ? "Review" : u.cleared ? "Continue" : "Start"}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Beyond the phrasebook</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {MORE.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="flex gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/40">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block font-medium">{title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function UnitView({ unitId }: { unitId: string }) {
  const { me } = useAccount();
  const { lang, level } = me.profile;
  const voiceId = useVoiceId();
  const best = useStore("best");
  const course = courseProgress(lang, best);
  const at = course.findIndex((u) => u.unit.id === unitId);
  const current = course[at];
  const firstOpen = current ? current.scores.findIndex((s) => s === undefined || s < PHRASE_CLEAR) : 0;
  const [choice, setChoice] = useState<{ lang: string; index: number } | null>(null);

  if (!current) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="font-medium">This unit does not exist</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link href="/learn">Back to the course</Link>
        </Button>
      </div>
    );
  }

  // A choice made in another language no longer applies after switching.
  const index = choice && choice.lang === lang ? choice.index : Math.max(0, firstOpen);
  const select = (i: number) => setChoice({ lang, index: i });
  const phrase = current.unit.phrases[index];
  const done = current.cleared === current.total;
  const nextUnit = course[at + 1];
  const isLast = index === current.total - 1;

  return (
    <>
      <Link href="/learn" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Course
      </Link>
      <PageHeader title={current.unit.title} description={current.unit.blurb}>
        <LanguagePicker />
        <VoicePicker />
      </PageHeader>

      {done && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-emerald-50 px-4 py-3 text-emerald-950">
          <PartyPopper className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">Unit cleared.</span> {current.stars} of {current.total * 3} stars. Go again for
            three stars on every phrase, or move on.
          </p>
          {nextUnit && (
            <Button asChild size="sm" className="rounded-full">
              <Link href={`/learn/${nextUnit.unit.id}`}>
                Next unit: {nextUnit.unit.title}
                <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Phrases in this unit">
        {current.unit.phrases.map((p, i) => {
          const score = current.scores[i];
          return (
            <button
              key={p.text}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => select(i)}
              className={cn(
                "flex w-44 shrink-0 flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary sm:w-auto sm:flex-1",
                i === index && "border-foreground bg-secondary",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Phrase {i + 1}</span>
                {score !== undefined && <span className={cn("text-xs font-semibold tabular-nums", scoreColor(score))}>{score}</span>}
              </span>
              <span className="line-clamp-1 text-sm font-medium" lang={lang}>
                {p.text}
              </span>
              <Stars count={starsFor(score)} />
            </button>
          );
        })}
      </div>

      <PracticeSession
        lang={lang}
        level={level}
        text={phrase.text}
        phrase={phrase}
        voiceId={voiceId}
        after={
          !isLast ? (
            <Button variant="outline" className="rounded-full" onClick={() => select(index + 1)}>
              Next phrase
              <ArrowRight />
            </Button>
          ) : nextUnit ? (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/learn/${nextUnit.unit.id}`}>
                Next unit
                <ArrowRight />
              </Link>
            </Button>
          ) : null
        }
      />
    </>
  );
}
