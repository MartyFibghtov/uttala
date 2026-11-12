"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CalendarClock, Check, Loader2, Sparkles, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { LanguagePicker, VoicePicker, useVoiceId } from "@/components/pickers";
import { hear, PracticeSession, scoreColor } from "@/components/practice-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneratedTextBanner, requestGeneratedText } from "@/components/weak-spot-generator";
import { useAccount } from "@/hooks/use-account";
import { getLanguage } from "@/lib/languages";
import { contrastsFor, MINIMAL_PAIRS, type MinimalPair } from "@/lib/minimal-pairs";
import { soundForIpa } from "@/lib/sounds";
import { isDue, listeningKey, recordListening, removeWeak, REVIEW_GAPS, useStore } from "@/lib/store";
import type { GeneratedText, WeakWord } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = ["words", "sounds", "listening", "mastered"] as const;
type Tab = (typeof TABS)[number];

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function dueLabel(w: WeakWord): string {
  if (w.reviews === undefined) return w.streak > 0 ? `${w.streak} of 3 clear` : w.heard ? `heard “${w.heard}”` : `${w.attempts}× unclear`;
  const check = `check ${w.reviews + 1} of ${REVIEW_GAPS.length}`;
  const days = Math.ceil(((w.due ?? 0) - Date.now()) / 86_400_000);
  return days <= 0 ? `${check} due now` : `${check} in ${days} day${days === 1 ? "" : "s"}`;
}

function WordDrills({ lang }: { lang: string }) {
  const { me, promptUpgrade } = useAccount();
  const level = me.profile.level;
  const cap = me.entitlements.maxDrillWords;
  const voiceId = useVoiceId();
  const weak = useStore("weak").filter((w) => w.lang === lang);
  const due = weak.filter((w) => isDue(w));
  const resting = weak.filter((w) => !isDue(w)).sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
  const [key, setKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"word" | "sentence" | "generated">("word");
  const [tailored, setTailored] = useState<GeneratedText | null>(null);
  const [generating, setGenerating] = useState(false);
  const current = weak.find((w) => w.key === key) ?? due[0] ?? resting[0];

  if (!current) {
    return (
      <Empty title="No weak words yet">
        Record a text in{" "}
        <Link href="/practice" className="underline underline-offset-4">
          Practice
        </Link>{" "}
        or a phrase in{" "}
        <Link href="/learn" className="underline underline-offset-4">
          Learn
        </Link>
        . Words that come out unclear are collected here. Say one clearly three times in a row and it rests, then comes
        back for a check after 2 days and again after 7. Pass both and it is mastered.
      </Empty>
    );
  }
  const hasSentence = current.context !== current.text;
  const at = due.findIndex((w) => w.key === current.key);
  const nextDue = due.length > 1 ? due[(at + 1) % due.length] : null;
  const pick = (w: WeakWord) => {
    setKey(w.key);
    setMode("word");
  };

  const generateForDrill = async (focusWord: WeakWord = current) => {
    setGenerating(true);
    try {
      const companions = due.filter((w) => w.key !== focusWord.key).slice(0, 3);
      const item = await requestGeneratedText({
        lang,
        level,
        words: [focusWord, ...companions].map((w) => ({
          text: w.text,
          heard: w.heard,
          avg: w.avg,
        })),
        avoid: tailored ? [tailored.text, focusWord.context] : [focusWord.context],
        selectedOnly: true,
      });
      setTailored(item);
      setMode("generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice sentence.");
    } finally {
      setGenerating(false);
    }
  };

  const item = (w: WeakWord) => (
    <button
      key={w.key}
      type="button"
      onClick={() => pick(w)}
      className={cn(
        "flex shrink-0 items-center justify-between gap-4 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
        w.key === current.key && "border-foreground bg-secondary",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium" lang={lang}>
          {w.text}
        </span>
        <span className="block text-xs whitespace-nowrap text-muted-foreground">{dueLabel(w)}</span>
      </span>
      <span className={cn("tabular-nums", scoreColor(w.avg))}>{w.avg}</span>
    </button>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="xl:max-h-[72vh] xl:overflow-y-auto">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {due.length ? `Practise now · ${due.length}` : "Nothing due right now"}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">{due.map(item)}</div>
        {resting.length > 0 && (
          <>
            <p className="mt-4 mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Resting until the next check · {resting.length}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">{resting.map(item)}</div>
          </>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={mode === "word" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setMode("word")}
          >
            Word alone
          </Button>
          <Button
            size="sm"
            variant={mode === "sentence" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setMode("sentence")}
            disabled={!hasSentence}
          >
            In its sentence
          </Button>
          <Button
            size="sm"
            variant={mode === "generated" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => void generateForDrill(current)}
            disabled={generating}
          >
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating ? "Generating…" : "Tailored text"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto rounded-full text-muted-foreground"
            onClick={() => removeWeak(current.key)}
          >
            <X />
            Remove
          </Button>
        </div>
        {!isDue(current) && (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            You said this clearly three times in a row, so it is resting. The gap is the point: recalling it after a
            break is what makes it stick. You can still practise it, but it only counts once the check is due.
          </p>
        )}
        {mode === "generated" && tailored && (
          <GeneratedTextBanner
            item={tailored}
            onRegenerate={() => void generateForDrill(current)}
            busy={generating}
          />
        )}
        <PracticeSession
          lang={lang}
          level={level}
          text={
            mode === "generated" && tailored
              ? tailored.text
              : mode === "sentence" && hasSentence
                ? current.context
                : current.text
          }
          phrase={
            mode === "generated" && tailored
              ? { text: tailored.text, meaning: tailored.meaning, roman: tailored.roman }
              : undefined
          }
          voiceId={voiceId}
          after={
            nextDue && (
              <Button variant="outline" className="rounded-full" onClick={() => pick(nextDue)}>
                Next word
                <ArrowRight />
              </Button>
            )
          }
        />
        {cap !== null && me.billing && (
          <p className="text-xs text-muted-foreground">
            The free plan keeps your {cap} weakest words.{" "}
            <button type="button" className="underline underline-offset-4" onClick={() => promptUpgrade("limit")}>
              Keep them all with Plus
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function Sounds({ lang }: { lang: string }) {
  const { me, promptUpgrade } = useAccount();
  const level = me.profile.level;
  const voiceId = useVoiceId();
  const [selectedSoundWord, setSelectedSoundWord] = useState<string | null>(null);
  const [tailoredSoundText, setTailoredSoundText] = useState<GeneratedText | null>(null);
  const [generatingIpa, setGeneratingIpa] = useState<string | null>(null);
  const phonemes = useStore("phonemes")
    .filter((p) => p.lang === lang && p.count >= 2)
    .sort((a, b) => a.avg - b.avg);
  const supported = (me.engines.azure && !!getLanguage(lang).azure) || Boolean(me.engines.openai);
  const library = (
    <span className="mt-4 block">
      <Button asChild variant="outline" className="rounded-full">
        <Link href="/sounds">Open the sound library</Link>
      </Button>
    </span>
  );

  if (!supported) {
    return (
      <Empty title="Sound-by-sound scoring is not available for this language yet">
        The sound library still explains how to make each difficult sound, with words to practise.
        {library}
      </Empty>
    );
  }
  if (!me.entitlements.phonemes) {
    return (
      <Empty title="Find the exact sounds that hold you back">
        Pro scores every sound inside every word and keeps a running list of your weakest ones.
        <span className="mt-4 flex flex-wrap justify-center gap-2">
          <Button className="rounded-full" onClick={() => promptUpgrade("phonemes")}>
            See Pro
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/sounds">Sound library</Link>
          </Button>
        </span>
      </Empty>
    );
  }
  if (!phonemes.length) {
    return (
      <Empty title="No sound-level data yet">
        Record a few texts in Practice and your weakest sounds will show up here.
        {library}
      </Empty>
    );
  }

  const generateForSound = async (ipa: string, examples: string[]) => {
    const guide = soundForIpa(lang, ipa);
    setGeneratingIpa(ipa);
    try {
      const item = await requestGeneratedText({
        lang,
        level,
        sounds: [
          {
            ipa,
            name: guide?.name ?? `/${ipa}/`,
            how: guide?.how,
            watch: guide?.watch,
            examples: examples.length ? examples : guide?.words ?? [],
          },
        ],
        selectedOnly: true,
      });
      setTailoredSoundText(item);
      setSelectedSoundWord(item.text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice sentence.");
    } finally {
      setGeneratingIpa(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {phonemes.map((p) => {
          const guide = soundForIpa(lang, p.ipa);
          return (
            <Card key={p.key}>
              <CardContent className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-2xl">/{p.ipa}/</span>
                    {guide && <span className="ml-2 text-xs text-muted-foreground">{guide.name}</span>}
                  </div>
                  <span className={cn("text-lg font-semibold tabular-nums", scoreColor(p.avg))}>{p.avg}</span>
                </div>
                <p className="text-xs text-muted-foreground">Heard {p.count} times</p>
                {guide && <p className="line-clamp-2 text-xs text-muted-foreground">{guide.how}</p>}
                {p.examples.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="block text-xs text-muted-foreground">Tap to hear alone or drill:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {p.examples.map((w) => (
                        <button
                          key={w}
                          type="button"
                          lang={lang}
                          onClick={() => {
                            setSelectedSoundWord(w);
                            setTailoredSoundText(null);
                            void hear(w, { lang, level, live: me.engines.elevenlabs, voiceId });
                          }}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary",
                            selectedSoundWord === w && "border-foreground bg-secondary",
                          )}
                        >
                          <Volume2 className="size-3 text-muted-foreground" />
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full text-xs"
                    disabled={generatingIpa === p.ipa}
                    onClick={() => void generateForSound(p.ipa, p.examples)}
                  >
                    {generatingIpa === p.ipa ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    Sentence for /{p.ipa}/
                  </Button>
                  {guide && (
                    <Link href={`/sounds/${guide.id}`} className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline">
                      How to make it
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedSoundWord && (
        <div className="space-y-3">
          {tailoredSoundText && tailoredSoundText.text === selectedSoundWord && (
            <GeneratedTextBanner
              item={tailoredSoundText}
              onRegenerate={() => {
                const target = tailoredSoundText.targets[0]?.replaceAll("/", "") ?? phonemes[0]?.ipa ?? "";
                if (target) void generateForSound(target, []);
              }}
              busy={generatingIpa !== null}
            />
          )}
          <PracticeSession
            lang={lang}
            level={level}
            text={selectedSoundWord}
            phrase={
              tailoredSoundText && tailoredSoundText.text === selectedSoundWord
                ? { text: tailoredSoundText.text, meaning: tailoredSoundText.meaning, roman: tailoredSoundText.roman }
                : undefined
            }
            voiceId={voiceId}
          />
        </div>
      )}
    </div>
  );
}

const coin = () => Math.random() < 0.5;
const anyOf = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

interface Round {
  pair: MinimalPair;
  answer: "a" | "b";
  voiceId?: string;
}

function Listening({ lang }: { lang: string }) {
  const { me } = useAccount();
  const pairs = MINIMAL_PAIRS[lang];
  const contrasts = contrastsFor(lang);
  const tallies = useStore("listening");
  const [focus, setFocus] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<"a" | "b" | null>(null);
  const [session, setSession] = useState({ right: 0, total: 0 });
  const [loading, setLoading] = useState(false);

  if (!pairs) {
    return (
      <Empty title="No listening sets for this language yet">
        Listening drills train you to hear the difference between two close sounds.
      </Empty>
    );
  }

  const accuracy = (contrast: string) => {
    const t = tallies[listeningKey(lang, contrast)];
    return t && t.total > 0 ? Math.round((t.right / t.total) * 100) : null;
  };

  const speak = async (r: Round) => {
    setLoading(true);
    try {
      await hear(r.pair[r.answer], { lang, level: me.profile.level, live: me.engines.elevenlabs, voiceId: r.voiceId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not play the word.");
    } finally {
      setLoading(false);
    }
  };

  const next = (only: string | null = focus) => {
    // A different native voice each round: hearing native speakers is what makes the contrast stick.
    const native = me.voices.filter((v) => v.langs.includes(lang));
    const voices = !me.entitlements.voiceChoice ? [] : native;
    let pool = only ? pairs.filter((p) => p.contrast === only) : pairs;
    if (!only && coin()) {
      // Half the time, go for the contrast the learner hears least reliably.
      const weakest = [...contrasts].sort((a, b) => (accuracy(a) ?? 50) - (accuracy(b) ?? 50))[0];
      pool = pairs.filter((p) => p.contrast === weakest);
    }
    const r: Round = {
      pair: anyOf(pool),
      answer: coin() ? "a" : "b",
      voiceId: voices.length ? anyOf(voices).id : undefined,
    };
    setRound(r);
    setPicked(null);
    void speak(r);
  };

  const choose = (choice: "a" | "b") => {
    if (!round || picked) return;
    const right = choice === round.answer;
    setPicked(choice);
    setSession((t) => ({ right: t.right + (right ? 1 : 0), total: t.total + 1 }));
    recordListening(lang, round.pair.contrast, right);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Which word do you hear?</CardTitle>
          <p className="text-sm text-muted-foreground">
            You cannot reliably say a difference you cannot hear. Each round plays one word of a pair
            {me.entitlements.voiceChoice ? ", in a different voice each time." : "."}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Contrast to train">
            {[null, ...contrasts].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                aria-pressed={focus === c}
                onClick={() => {
                  setFocus(c);
                  if (round) next(c);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors",
                  focus === c && "border-foreground bg-foreground text-background",
                )}
              >
                {c ?? "Smart mix"}
              </button>
            ))}
          </div>
          {!round ? (
            <Button className="w-full rounded-full" onClick={() => next()}>
              Start
            </Button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Contrast {round.pair.contrast}</span>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => speak(round)} disabled={loading}>
                  <Volume2 />
                  Play again
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["a", "b"] as const).map((side) => {
                  const correct = picked && side === round.answer;
                  const wrong = picked === side && side !== round.answer;
                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={() => choose(side)}
                      disabled={!!picked}
                      lang={lang}
                      className={cn(
                        "flex h-24 items-center justify-center gap-2 rounded-xl border text-xl font-medium transition-colors",
                        !picked && "hover:bg-secondary",
                        correct && "border-emerald-500 bg-emerald-50 text-emerald-900",
                        wrong && "border-red-500 bg-red-50 text-red-900",
                      )}
                    >
                      {round.pair[side]}
                      {correct && <Check className="size-5" />}
                      {wrong && <X className="size-5" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm tabular-nums text-muted-foreground">
                  This session: {session.right} of {session.total} correct
                </span>
                <Button className="rounded-full" onClick={() => next()} disabled={!picked}>
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Your ear, by contrast</CardTitle>
          <p className="text-sm text-muted-foreground">Share of rounds you got right, all time.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {contrasts.map((c) => {
            const acc = accuracy(c);
            const t = tallies[listeningKey(lang, c)];
            return (
              <div key={c}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{c}</span>
                  <span className={cn("tabular-nums", acc === null ? "text-muted-foreground" : scoreColor(acc))}>
                    {acc === null ? "–" : `${acc}%`}
                  </span>
                </div>
                <Progress value={acc ?? 0} className="mt-1.5 h-1.5" aria-label={`${c} accuracy`} />
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">{t ? `${t.total} rounds` : "Not tried yet"}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Mastered({ lang }: { lang: string }) {
  const mastered = useStore("mastered").filter((w) => w.lang === lang);
  if (!mastered.length) {
    return (
      <Empty title="No mastered words yet">
        A word is mastered when you say it clearly three times in a row and then pass two spaced checks, 2 and 7 days
        later.
      </Empty>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {mastered.length} word{mastered.length === 1 ? "" : "s"} mastered
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {mastered.map((w) => (
          <span key={`${w.key}-${w.at}`} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm" lang={lang}>
            <Check className="size-3.5 text-emerald-600" />
            {w.text}
          </span>
        ))}
      </CardContent>
    </Card>
  );
}

export function DrillsView() {
  const { me } = useAccount();
  const router = useRouter();
  const params = useSearchParams();
  const lang = me.profile.lang;
  const requested = params.get("tab");
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "words";
  const due = useStore("weak").filter((w) => w.lang === lang && isDue(w)).length;

  return (
    <>
      <PageHeader
        title="Drills"
        description="Short, focused practice on the words and sounds that came out weakest in your recordings, scheduled so that what you fix stays fixed."
      >
        <LanguagePicker />
        <VoicePicker />
      </PageHeader>
      <Tabs value={tab} onValueChange={(v) => router.replace(v === "words" ? "/drills" : `/drills?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-4">
          <TabsTrigger value="words">Words{due > 0 ? ` · ${due}` : ""}</TabsTrigger>
          <TabsTrigger value="sounds">Sounds</TabsTrigger>
          <TabsTrigger value="listening">Listening</TabsTrigger>
          <TabsTrigger value="mastered">Mastered</TabsTrigger>
        </TabsList>
        <TabsContent value="words">
          <WordDrills lang={lang} />
        </TabsContent>
        <TabsContent value="sounds">
          <Sounds lang={lang} />
        </TabsContent>
        <TabsContent value="listening">
          <Listening key={lang} lang={lang} />
        </TabsContent>
        <TabsContent value="mastered">
          <Mastered lang={lang} />
        </TabsContent>
      </Tabs>
    </>
  );
}
