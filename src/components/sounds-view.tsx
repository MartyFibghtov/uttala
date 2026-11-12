"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Ear, Gauge, Loader2, Sparkles, TriangleAlert, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { LanguagePicker, VoicePicker, useVoiceId } from "@/components/pickers";
import { hear, PracticeSession, scoreColor } from "@/components/practice-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneratedTextBanner, requestGeneratedText } from "@/components/weak-spot-generator";
import { useAccount } from "@/hooks/use-account";
import { getLanguage } from "@/lib/languages";
import { MINIMAL_PAIRS } from "@/lib/minimal-pairs";
import { getSound, KIND_LABEL, soundForIpa, soundsFor, type Sound, type SoundKind } from "@/lib/sounds";
import { bestKey, useStore } from "@/lib/store";
import type { GeneratedText } from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS: SoundKind[] = ["consonant", "vowel", "melody"];

/** Average score per guide entry, from sound-level scoring where the learner has it. */
function useSoundScores(lang: string): Map<string, number> {
  const phonemes = useStore("phonemes");
  const totals = new Map<string, { sum: number; count: number }>();
  for (const p of phonemes) {
    if (p.lang !== lang || p.count < 2) continue;
    const guide = soundForIpa(lang, p.ipa);
    if (!guide) continue;
    const t = totals.get(guide.id) ?? { sum: 0, count: 0 };
    totals.set(guide.id, { sum: t.sum + p.avg * p.count, count: t.count + p.count });
  }
  return new Map([...totals].map(([id, t]) => [id, Math.round(t.sum / t.count)]));
}

export function SoundsView() {
  const { me } = useAccount();
  const lang = me.profile.lang;
  const language = getLanguage(lang);
  const sounds = soundsFor(lang);
  const scores = useSoundScores(lang);
  const weakest = [...scores].sort((a, b) => a[1] - b[1]).slice(0, 3);

  return (
    <>
      <PageHeader
        title="Sounds"
        description={`The ${sounds.length} sounds and patterns of ${language.name} that learners most often get wrong: how to make each one, what to watch for, and words to practise.`}
      >
        <LanguagePicker />
      </PageHeader>

      {weakest.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Your weakest sounds</CardTitle>
            <p className="text-sm text-muted-foreground">From sound-by-sound scoring of your recordings.</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {weakest.map(([id, avg]) => {
              const s = getSound(id);
              return s ? (
                <Link key={id} href={`/sounds/${id}`} className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors hover:bg-secondary">
                  <span>
                    <span className="block font-mono text-lg">/{s.symbol}/</span>
                    <span className="block text-sm text-muted-foreground">{s.name}</span>
                  </span>
                  <span className={cn("text-xl font-semibold tabular-nums", scoreColor(avg))}>{avg}</span>
                </Link>
              ) : null;
            })}
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">
        {KINDS.map((kind) => {
          const group = sounds.filter((s) => s.kind === kind);
          if (!group.length) return null;
          return (
            <section key={kind}>
              <h2 className="text-lg font-semibold tracking-tight">{KIND_LABEL[kind]}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.map((s) => {
                  const avg = scores.get(s.id);
                  return (
                    <Link
                      key={s.id}
                      href={`/sounds/${s.id}`}
                      className="group flex flex-col rounded-2xl border bg-card p-4 transition-all hover:border-foreground/40 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-mono text-2xl leading-none">{s.symbol}</span>
                        {avg !== undefined && <span className={cn("text-sm font-semibold tabular-nums", scoreColor(avg))}>{avg}</span>}
                      </div>
                      <p className="mt-3 font-medium">{s.name}</p>
                      <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{s.how}</p>
                      <p className="mt-3 truncate text-xs text-muted-foreground" lang={lang}>
                        {s.words.slice(0, 4).join(" · ")}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function pairsFor(sound: Sound) {
  const parts = sound.symbol.split(" ").map((p) => p.replace("ː", ""));
  return (MINIMAL_PAIRS[sound.lang] ?? []).filter((p) => parts.some((part) => part.length > 0 && p.contrast.includes(part)));
}

export function SoundDetail({ id }: { id: string }) {
  const { me, updateProfile } = useAccount();
  const voiceId = useVoiceId();
  const best = useStore("best");
  const sound = getSound(id);
  const [choice, setChoice] = useState<string | null>(null);
  const [tailored, setTailored] = useState<GeneratedText | null>(null);
  const [generating, setGenerating] = useState(false);

  if (!sound) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="font-medium">This sound is not in the library</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link href="/sounds">Back to all sounds</Link>
        </Button>
      </div>
    );
  }

  const lang = sound.lang;
  const language = getLanguage(lang);
  const level = me.profile.level;
  const isCustom = choice === "__generated__" && tailored?.lang === lang;
  const word = isCustom ? tailored.text : choice && sound.words.includes(choice) ? choice : sound.words[0];
  const all = soundsFor(lang);
  const at = all.findIndex((s) => s.id === sound.id);
  const pairs = pairsFor(sound);
  const otherLanguage = lang !== me.profile.lang;

  const generateSoundSentence = async () => {
    setGenerating(true);
    try {
      const item = await requestGeneratedText({
        lang,
        level,
        sounds: [
          {
            ipa: sound.symbol,
            name: sound.name,
            how: sound.how,
            watch: sound.watch,
            examples: sound.words,
          },
        ],
        contrasts: pairs.length ? [{ contrast: pairs[0].contrast }] : undefined,
        avoid: tailored ? [tailored.text] : undefined,
        selectedOnly: true,
      });
      setTailored(item);
      setChoice("__generated__");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice sentence.");
    } finally {
      setGenerating(false);
    }
  };

  const say = (text: string) =>
    hear(text, { lang, level, live: me.engines.elevenlabs, voiceId }).catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not play that."),
    );

  return (
    <>
      <Link href="/sounds" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        All sounds
      </Link>
      <PageHeader title={sound.name} description={`${language.name} · ${KIND_LABEL[sound.kind]}`}>
        <VoicePicker />
        {at > 0 && (
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/sounds/${all[at - 1].id}`}>
              <ArrowLeft />
              Previous
            </Link>
          </Button>
        )}
        {at < all.length - 1 && (
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/sounds/${all[at + 1].id}`}>
              Next
              <ArrowRight />
            </Link>
          </Button>
        )}
      </PageHeader>

      {otherLanguage && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 text-muted-foreground">
            This is a {language.name} sound, and you are currently learning {getLanguage(me.profile.lang).name}.
          </p>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => void updateProfile({ lang })}>
            Switch to {language.name}
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="aurora-wash">
          <CardContent className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="font-mono text-5xl leading-tight">{sound.symbol}</span>
            <span className="text-sm text-muted-foreground">{sound.name}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4" />
              How to make it
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{sound.how}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-amber-500" />
              Watch out for
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{sound.watch}</p>
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Practise it in words and sentences</h2>
      <p className="mt-1 text-sm text-muted-foreground">Pick a word, or generate a fresh sentence packed with /{sound.symbol}/.</p>
      <div className="mt-3 mb-4 flex flex-wrap gap-2">
        {sound.words.map((w) => {
          const score = best[bestKey(lang, w)];
          return (
            <button
              key={w}
              type="button"
              aria-pressed={!isCustom && w === word}
              onClick={() => setChoice(w)}
              lang={lang}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary",
                !isCustom && w === word && "border-foreground bg-secondary",
              )}
            >
              {w}
              {score !== undefined && <span className={cn("text-xs tabular-nums", scoreColor(score))}>{score}</span>}
            </button>
          );
        })}
        <Button
          type="button"
          variant={isCustom ? "default" : "outline"}
          className="rounded-full"
          onClick={() => void generateSoundSentence()}
          disabled={generating}
        >
          {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {generating ? "Generating…" : `Sentence with /${sound.symbol}/`}
        </Button>
      </div>
      {isCustom && tailored && (
        <GeneratedTextBanner
          item={tailored}
          onRegenerate={() => void generateSoundSentence()}
          busy={generating}
        />
      )}
      <PracticeSession
        lang={lang}
        level={level}
        text={word}
        phrase={
          isCustom && tailored
            ? { text: tailored.text, meaning: tailored.meaning, roman: tailored.roman }
            : undefined
        }
        voiceId={voiceId}
      />

      {pairs.length > 0 && (
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Ear className="size-4" />
                Hear the contrast
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                These words differ only in this sound. If they sound the same to you, train your ear first.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href="/drills?tab=listening">Listening drill</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {pairs.map((p) => (
              <div key={`${p.a}-${p.b}`} className="flex items-center gap-2 rounded-xl border p-2">
                {[p.a, p.b].map((w) => (
                  <Button key={w} variant="ghost" size="sm" className="flex-1 rounded-full" onClick={() => void say(w)} lang={lang}>
                    <Volume2 />
                    {w}
                  </Button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
