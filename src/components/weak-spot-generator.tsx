"use client";

import { useId, useMemo, useState } from "react";
import { Loader2, RefreshCw, SlidersHorizontal, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { scoreColor } from "@/components/practice-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getLanguage } from "@/lib/languages";
import type { LevelId } from "@/lib/levels";
import { contrastsFor } from "@/lib/minimal-pairs";
import { soundForIpa, soundsFor, type Sound } from "@/lib/sounds";
import { addGeneratedText, isDue, listeningKey, useStore } from "@/lib/store";
import type { GeneratedText, WeakPhoneme, WeakWord } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ProsodyFocus = "rhythm" | "intonation" | "fluency";

const PROSODY_OPTIONS: { id: ProsodyFocus; label: string; detail: string }[] = [
  { id: "rhythm", label: "Rhythm & stress", detail: "Stressed vs. unstressed syllable timing" },
  { id: "intonation", label: "Melody & pitch", detail: "Rising and falling pitch across clauses" },
  { id: "fluency", label: "Smooth linking", detail: "Connected phrasing without choppy stops" },
];

function mean(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  return real.length ? Math.round(real.reduce((s, v) => s + v, 0) / real.length) : null;
}

export interface WeakProfile {
  weakWords: WeakWord[];
  dueWords: WeakWord[];
  weakPhonemes: (WeakPhoneme & { guide?: Sound })[];
  sounds: Sound[];
  contrasts: { contrast: string; accuracy: number | null; total: number }[];
  weakContrasts: { contrast: string; accuracy: number }[];
  weakProsody: ProsodyFocus[];
  recentTexts: string[];
  hasTrackedWeakSpots: boolean;
  summaryLabel: string;
}

/** Compute the learner's current weak words, sounds, contrasts and prosody for `lang`. */
export function useWeakProfile(lang: string): WeakProfile {
  const allWeak = useStore("weak");
  const allPhonemes = useStore("phonemes");
  const listening = useStore("listening");
  const attempts = useStore("attempts");
  const generated = useStore("generated");

  return useMemo(() => {
    const weakWords = allWeak
      .filter((w) => w.lang === lang)
      .sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || a.avg - b.avg);
    const dueWords = weakWords.filter((w) => isDue(w));

    const weakPhonemes = allPhonemes
      .filter((p) => p.lang === lang && p.avg < 85)
      .sort((a, b) => a.avg - b.avg)
      .map((p) => ({ ...p, guide: soundForIpa(lang, p.ipa) }));

    const sounds = soundsFor(lang);
    const allContrasts = contrastsFor(lang);
    const contrasts = allContrasts.map((contrast) => {
      const t = listening[listeningKey(lang, contrast)];
      const accuracy = t && t.total > 0 ? Math.round((t.right / t.total) * 100) : null;
      return { contrast, accuracy, total: t?.total ?? 0 };
    });

    const weakContrasts = contrasts
      .filter((c): c is { contrast: string; accuracy: number; total: number } => c.accuracy !== null && c.accuracy < 85)
      .sort((a, b) => a.accuracy - b.accuracy);

    const langAttempts = attempts.filter((a) => a.lang === lang).slice(0, 10);
    const weakProsody: ProsodyFocus[] = [];
    const r = mean(langAttempts.map((a) => a.rhythm));
    const m = mean(langAttempts.map((a) => a.intonation));
    const f = mean(langAttempts.map((a) => a.fluency));
    if (r !== null && r < 75) weakProsody.push("rhythm");
    if (m !== null && m < 75) weakProsody.push("intonation");
    if (f !== null && f < 75) weakProsody.push("fluency");

    const recentTexts = [
      ...generated.filter((g) => g.lang === lang).slice(0, 8).map((g) => g.text),
      ...langAttempts.slice(0, 6).map((a) => a.text),
    ];

    const hasTrackedWeakSpots =
      weakWords.length > 0 || weakPhonemes.length > 0 || weakContrasts.length > 0 || weakProsody.length > 0;

    const parts: string[] = [];
    if (dueWords.length > 0) {
      parts.push(
        dueWords
          .slice(0, 3)
          .map((w) => w.text)
          .join(", "),
      );
    } else if (weakWords.length > 0) {
      parts.push(
        weakWords
          .slice(0, 2)
          .map((w) => w.text)
          .join(", "),
      );
    }
    if (weakPhonemes.length > 0) {
      parts.push(
        weakPhonemes
          .slice(0, 2)
          .map((p) => `/${p.ipa}/`)
          .join(", "),
      );
    }
    if (weakContrasts.length > 0 && parts.length < 2) {
      parts.push(weakContrasts[0].contrast);
    }

    const summaryLabel = parts.length > 0 ? parts.join(" · ") : `core ${getLanguage(lang).name} sounds`;

    return {
      weakWords,
      dueWords,
      weakPhonemes,
      sounds,
      contrasts,
      weakContrasts,
      weakProsody,
      recentTexts,
      hasTrackedWeakSpots,
      summaryLabel,
    };
  }, [allWeak, allPhonemes, listening, attempts, generated, lang]);
}

export interface GenerateRequestOptions {
  lang: string;
  level: LevelId;
  words?: { text: string; heard?: string; avg?: number }[];
  sounds?: { ipa: string; name?: string; how?: string; watch?: string; examples?: string[]; avg?: number }[];
  contrasts?: { contrast: string; accuracy?: number }[];
  prosody?: ProsodyFocus[];
  customFocus?: string;
  avoid?: string[];
  selectedOnly?: boolean;
}

export async function requestGeneratedText(opts: GenerateRequestOptions): Promise<GeneratedText> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = (await res.json()) as GeneratedText & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not generate a practice text.");
  addGeneratedText(data);
  return data;
}

/** Build the default weak-spot payload from the learner's profile for one-click generation. */
export function defaultGeneratePayload(lang: string, level: LevelId, profile: WeakProfile): GenerateRequestOptions {
  const targetWords = (profile.dueWords.length ? profile.dueWords : profile.weakWords).slice(0, 5).map((w) => ({
    text: w.text,
    heard: w.heard,
    avg: w.avg,
  }));

  const targetSounds =
    profile.weakPhonemes.length > 0
      ? profile.weakPhonemes.slice(0, 3).map((p) => ({
          ipa: p.ipa,
          name: p.guide?.name,
          how: p.guide?.how,
          watch: p.guide?.watch,
          examples: p.examples.length ? p.examples : p.guide?.words.slice(0, 4),
          avg: p.avg,
        }))
      : !targetWords.length
        ? profile.sounds.slice(0, 2).map((s) => ({
            ipa: s.symbol,
            name: s.name,
            how: s.how,
            watch: s.watch,
            examples: s.words.slice(0, 4),
          }))
        : [];

  const targetContrasts = profile.weakContrasts.slice(0, 2).map((c) => ({
    contrast: c.contrast,
    accuracy: c.accuracy,
  }));

  return {
    lang,
    level,
    words: targetWords,
    sounds: targetSounds,
    contrasts: targetContrasts,
    prosody: profile.weakProsody,
    avoid: profile.recentTexts,
  };
}

export function WeakSpotGenerator({
  lang,
  level,
  onGenerated,
}: {
  lang: string;
  level: LevelId;
  onGenerated: (item: GeneratedText) => void;
}) {
  const profile = useWeakProfile(lang);
  const language = getLanguage(lang);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [selectedWords, setSelectedWords] = useState<string[] | null>(null);
  const [selectedSounds, setSelectedSounds] = useState<string[] | null>(null);
  const [selectedContrasts, setSelectedContrasts] = useState<string[] | null>(null);
  const [selectedProsody, setSelectedProsody] = useState<ProsodyFocus[] | null>(null);
  const [customFocus, setCustomFocus] = useState("");

  const customInputId = useId();
  const customHintId = useId();

  // Default selections reflect the learner's tracked weak spots when they haven't customised yet.
  const defaultWordKeys = useMemo(
    () => (profile.dueWords.length ? profile.dueWords : profile.weakWords).slice(0, 5).map((w) => w.text),
    [profile.dueWords, profile.weakWords],
  );
  const defaultSoundIpas = useMemo(() => {
    if (profile.weakPhonemes.length > 0) return profile.weakPhonemes.slice(0, 3).map((p) => p.ipa);
    if (defaultWordKeys.length === 0) return profile.sounds.slice(0, 2).map((s) => s.symbol);
    return [];
  }, [profile.weakPhonemes, profile.sounds, defaultWordKeys.length]);
  const defaultContrastKeys = useMemo(
    () => profile.weakContrasts.slice(0, 2).map((c) => c.contrast),
    [profile.weakContrasts],
  );

  const activeWords = selectedWords ?? defaultWordKeys;
  const activeSounds = selectedSounds ?? defaultSoundIpas;
  const activeContrasts = selectedContrasts ?? defaultContrastKeys;
  const activeProsody = selectedProsody ?? profile.weakProsody;

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setSelectedWords(defaultWordKeys);
      setSelectedSounds(defaultSoundIpas);
      setSelectedContrasts(defaultContrastKeys);
      setSelectedProsody(profile.weakProsody);
    }
    setOpen(nextOpen);
  };

  const quickGenerate = async () => {
    setBusy(true);
    try {
      const item = await requestGeneratedText(defaultGeneratePayload(lang, level, profile));
      onGenerated(item);
      toast.success("Generated a practice text for your weak spots.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice text.");
    } finally {
      setBusy(false);
    }
  };

  const customGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const words = profile.weakWords
        .filter((w) => activeWords.includes(w.text))
        .map((w) => ({ text: w.text, heard: w.heard, avg: w.avg }));

      const soundPool = new Map<
        string,
        { ipa: string; name?: string; how?: string; watch?: string; examples?: string[]; avg?: number }
      >();
      for (const s of profile.sounds) {
        soundPool.set(s.symbol, {
          ipa: s.symbol,
          name: s.name,
          how: s.how,
          watch: s.watch,
          examples: s.words.slice(0, 5),
        });
      }
      for (const p of profile.weakPhonemes) {
        soundPool.set(p.ipa, {
          ipa: p.ipa,
          name: p.guide?.name,
          how: p.guide?.how,
          watch: p.guide?.watch,
          examples: p.examples.length ? p.examples : p.guide?.words.slice(0, 5),
          avg: p.avg,
        });
      }
      const sounds = activeSounds.map((ipa) => soundPool.get(ipa) ?? { ipa });

      const contrasts = profile.contrasts
        .filter((c) => activeContrasts.includes(c.contrast))
        .map((c) => ({ contrast: c.contrast, accuracy: c.accuracy ?? undefined }));

      const item = await requestGeneratedText({
        lang,
        level,
        words,
        sounds,
        contrasts,
        prosody: activeProsody,
        customFocus: customFocus.trim() || undefined,
        avoid: profile.recentTexts,
        selectedOnly: true,
      });
      onGenerated(item);
      setOpen(false);
      toast.success("Generated a tailored practice text.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice text.");
    } finally {
      setBusy(false);
    }
  };

  // Merge tracked weak phonemes and language sound library into a single selectable list without duplicates.
  const selectableSounds = useMemo(() => {
    const seen = new Set<string>();
    const list: { ipa: string; label: string; avg?: number; isWeak: boolean }[] = [];
    for (const p of profile.weakPhonemes) {
      seen.add(p.ipa);
      list.push({
        ipa: p.ipa,
        label: p.guide ? `/${p.ipa}/ ${p.guide.name}` : `/${p.ipa}/`,
        avg: p.avg,
        isWeak: true,
      });
    }
    for (const s of profile.sounds) {
      if (seen.has(s.symbol)) continue;
      seen.add(s.symbol);
      list.push({
        ipa: s.symbol,
        label: `/${s.symbol}/ ${s.name}`,
        isWeak: false,
      });
    }
    return list;
  }, [profile.weakPhonemes, profile.sounds]);

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="default"
        className="rounded-full"
        onClick={() => void quickGenerate()}
        disabled={busy}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? "Generating…" : "Weak-spot text"}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label="Choose specific weak spots for text generation"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Generate for your {language.name} weak spots</DialogTitle>
            <DialogDescription>
              {profile.hasTrackedWeakSpots
                ? "Your weakest words, sounds and ear contrasts are pre-selected below. Adjust them or add a topic to generate a custom reading."
                : `Pick the ${language.name} sounds, contrasts or words you want to work on, and we will write a practice text that packs them in.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void customGenerate(e)} className="space-y-5">
            {profile.weakWords.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">
                  Weak words from your recordings ({activeWords.length} selected)
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {profile.weakWords.slice(0, 12).map((w) => {
                    const active = activeWords.includes(w.text);
                    return (
                      <button
                        key={w.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedWords(toggle(activeWords, w.text))}
                        lang={lang}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        <span>{w.text}</span>
                        {w.heard && (
                          <span className={cn("opacity-75", active ? "text-background/80" : "text-muted-foreground")}>
                            (“{w.heard}”)
                          </span>
                        )}
                        <span className={cn("tabular-nums", active ? "text-background/90" : scoreColor(w.avg))}>
                          {w.avg}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {selectableSounds.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">
                  Sounds & phonemes to pack into the text ({activeSounds.length} selected)
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {selectableSounds.map((s) => {
                    const active = activeSounds.includes(s.ipa);
                    return (
                      <button
                        key={s.ipa}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedSounds(toggle(activeSounds, s.ipa))}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        <span>{s.label}</span>
                        {s.avg !== undefined && (
                          <span className={cn("tabular-nums", active ? "text-background/90" : scoreColor(s.avg))}>
                            {s.avg}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {profile.contrasts.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">
                  Minimal-pair contrasts — places both sounds side by side ({activeContrasts.length} selected)
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {profile.contrasts.map((c) => {
                    const active = activeContrasts.includes(c.contrast);
                    return (
                      <button
                        key={c.contrast}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedContrasts(toggle(activeContrasts, c.contrast))}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        <span>{c.contrast}</span>
                        {c.accuracy !== null && (
                          <span className={cn("tabular-nums", active ? "text-background/90" : scoreColor(c.accuracy))}>
                            {c.accuracy}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">Prosody focus</legend>
              <div className="flex flex-wrap gap-1.5">
                {PROSODY_OPTIONS.map((opt) => {
                  const active = activeProsody.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedProsody(toggle(activeProsody, opt.id))}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor={customInputId} className="block text-xs font-medium text-muted-foreground">
                Specific weak spots, words or situation (optional)
              </label>
              <p id={customHintId} className="text-xs text-muted-foreground">
                Name any words, sounds, or context you want the text to focus on—for example, “th and r in a job
                interview” or “ordering dinner”.
              </p>
              <Input
                id={customInputId}
                name="customFocus"
                value={customFocus}
                onChange={(e) => setCustomFocus(e.target.value)}
                aria-describedby={customHintId}
                placeholder="e.g. words with th and r, or introducing my team at work"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {busy ? "Generating…" : "Generate text"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Shown above a generated text so the learner sees which weak spots it was built to train. */
export function GeneratedTextBanner({
  item,
  onRegenerate,
  busy,
}: {
  item: GeneratedText;
  onRegenerate?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Target className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-snug">{item.focus}</p>
          {item.targets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Targeting:</span>
              {item.targets.map((t) => (
                <Badge key={t} variant="secondary" className="font-mono text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      {onRegenerate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={onRegenerate}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          New weak-spot text
        </Button>
      )}
    </div>
  );
}
