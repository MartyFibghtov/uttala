"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Headphones, Library, Mic, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { LanguagePicker, LevelPicker, VoicePicker, useVoiceId } from "@/components/pickers";
import { PracticeSession, scoreColor } from "@/components/practice-session";
import { ShadowingSession } from "@/components/shadowing-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  defaultGeneratePayload,
  GeneratedTextBanner,
  requestGeneratedText,
  useWeakProfile,
  WeakSpotGenerator,
} from "@/components/weak-spot-generator";
import { useAccount } from "@/hooks/use-account";
import { findPhrase, getLanguage, isLibraryText, textsFor, unitsFor } from "@/lib/languages";
import { bestKey, removeGeneratedText, removeSavedText, saveText, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const INTRO = {
  beginner: "Short everyday phrases. Tap the words, listen, then say them.",
  intermediate: "Read a text aloud and see exactly which words and stretches of melody to work on.",
  advanced: "Demanding texts, strict scoring. Chase the last details that still sound foreign.",
};

function TextRow({
  lang,
  text,
  note,
  onPick,
  onRemove,
}: {
  lang: string;
  text: string;
  note?: string;
  onPick: () => void;
  onRemove?: () => void;
}) {
  const best = useStore("best")[bestKey(lang, text)];
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-secondary"
      >
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm" lang={lang}>
            {text}
          </span>
          {note && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{note}</span>}
        </span>
        {best !== undefined && <span className={cn("text-sm font-semibold tabular-nums", scoreColor(best))}>{best}</span>}
      </button>
      {onRemove && (
        <Button variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground" aria-label="Remove saved text" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

/** Everything there is to read: passages, course phrases, generated weak-spot texts and the learner's own saved texts. */
function TextLibrary({ lang, onPick }: { lang: string; onPick: (text: string) => void }) {
  const { me, promptUpgrade } = useAccount();
  const [open, setOpen] = useState(false);
  const saved = useStore("saved").filter((s) => s.lang === lang);
  const generated = useStore("generated").filter((g) => g.lang === lang);
  const language = getLanguage(lang);
  const pick = (text: string) => {
    onPick(text);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full">
          <Library />
          Library
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{language.name} texts</DialogTitle>
          <DialogDescription>Pick something to read aloud. Your best score is shown next to texts you have tried.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="passages">
          <TabsList className="mb-3">
            <TabsTrigger value="passages">Passages</TabsTrigger>
            <TabsTrigger value="phrases">Phrases</TabsTrigger>
            <TabsTrigger value="generated">Weak-spot{generated.length ? ` · ${generated.length}` : ""}</TabsTrigger>
            <TabsTrigger value="saved">Saved{saved.length ? ` · ${saved.length}` : ""}</TabsTrigger>
          </TabsList>
          <TabsContent value="passages" className="space-y-4">
            {(["intermediate", "advanced"] as const).map((level) => (
              <section key={level} className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {level === "intermediate" ? "Everyday sentences" : "Demanding passages and tongue twisters"}
                </h3>
                {textsFor(lang, level).map((p) => (
                  <TextRow key={p.text} lang={lang} text={p.text} onPick={() => pick(p.text)} />
                ))}
              </section>
            ))}
          </TabsContent>
          <TabsContent value="phrases" className="space-y-4">
            {unitsFor(lang).map((unit) => (
              <section key={unit.id} className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">{unit.title}</h3>
                {unit.phrases.map((p) => (
                  <TextRow key={p.text} lang={lang} text={p.text} note={p.meaning} onPick={() => pick(p.text)} />
                ))}
              </section>
            ))}
          </TabsContent>
          <TabsContent value="generated" className="space-y-2">
            {generated.length === 0 && (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center">
                <p className="font-medium">No generated texts yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Use “Weak-spot text” to generate readings specifically engineered around your weakest words, sounds
                  and contrasts.
                </p>
              </div>
            )}
            {generated.map((g) => (
              <TextRow
                key={g.id}
                lang={lang}
                text={g.text}
                note={g.targets.length ? `Targets ${g.targets.join(", ")} — ${g.focus}` : g.focus}
                onPick={() => pick(g.text)}
                onRemove={() => removeGeneratedText(g.id)}
              />
            ))}
          </TabsContent>
          <TabsContent value="saved" className="space-y-2">
            {saved.length === 0 && (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center">
                <p className="font-medium">No saved texts yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Paste your presentation, interview answers or favourite lines with “Use your own text”, then save
                  them here to come back to.
                </p>
                {!me.entitlements.customText && (
                  <Button
                    size="sm"
                    className="mt-4 rounded-full"
                    onClick={() => {
                      setOpen(false);
                      promptUpgrade("customText");
                    }}
                  >
                    Unlock your own texts
                  </Button>
                )}
              </div>
            )}
            {saved.map((s) => (
              <TextRow
                key={s.id}
                lang={lang}
                text={s.text}
                note={`Saved ${new Date(s.at).toLocaleDateString(undefined, { dateStyle: "medium" })}`}
                onPick={() => pick(s.text)}
                onRemove={() => removeSavedText(s.id)}
              />
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export function PracticeView() {
  const { me } = useAccount();
  const { lang, level } = me.profile;
  const voiceId = useVoiceId();
  const library = textsFor(lang, level);
  const saved = useStore("saved");
  const generated = useStore("generated");
  const weakProfile = useWeakProfile(lang);
  // What the learner is working on, remembered per language and level for this visit.
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [practiceMode, setPracticeMode] = useState<"read" | "shadow">("read");
  const [regenerating, setRegenerating] = useState(false);
  const key = `${lang}:${level}`;
  const text = texts[key] ?? library[0].text;
  const setText = (value: string) => setTexts((t) => ({ ...t, [key]: value }));
  const generatedItem = generated.find((g) => g.lang === lang && g.text === text.trim());
  const phrase =
    findPhrase(lang, text) ??
    (generatedItem
      ? { text: generatedItem.text, meaning: generatedItem.meaning, roman: generatedItem.roman }
      : undefined);
  const own = text.trim().length > 0 && !isLibraryText(lang, text);
  const isSaved = saved.some((s) => s.lang === lang && s.text === text.trim());

  const nextText = () => {
    const at = library.findIndex((p) => p.text === text);
    setText(library[(at + 1) % library.length].text);
  };

  const regenerateWeakSpot = async () => {
    setRegenerating(true);
    try {
      const item = await requestGeneratedText(defaultGeneratePayload(lang, level, weakProfile));
      setText(item.text);
      toast.success("Generated a new practice text for your weak spots.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice text.");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <>
      <PageHeader title="Practice" description={INTRO[level]}>
        <LanguagePicker />
        <LevelPicker />
        <VoicePicker />
        <WeakSpotGenerator lang={lang} level={level} onGenerated={(item) => setText(item.text)} />
        <TextLibrary lang={lang} onPick={setText} />
        <Button variant="outline" className="rounded-full" onClick={nextText}>
          <Shuffle />
          Next text
        </Button>
      </PageHeader>
      {generatedItem && (
        <GeneratedTextBanner
          item={generatedItem}
          onRegenerate={() => void regenerateWeakSpot()}
          busy={regenerating}
        />
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Practice mode">
        <Button
          size="sm"
          variant={practiceMode === "read" ? "default" : "outline"}
          className="rounded-full"
          aria-pressed={practiceMode === "read"}
          onClick={() => setPracticeMode("read")}
        >
          <Mic />
          Read &amp; score
        </Button>
        <Button
          size="sm"
          variant={practiceMode === "shadow" ? "default" : "outline"}
          className="rounded-full"
          aria-pressed={practiceMode === "shadow"}
          onClick={() => setPracticeMode("shadow")}
        >
          <Headphones />
          Shadowing
        </Button>
        <span className="text-xs text-muted-foreground">
          {practiceMode === "read"
            ? "Read aloud at your own pace for detailed sound & word diagnostics."
            : "Speak in chorus or immediately after the native model to train rhythm, melody and speed."}
        </span>
      </div>
      {practiceMode === "read" ? (
        <PracticeSession lang={lang} level={level} text={text} phrase={phrase} voiceId={voiceId} onTextChange={setText} />
      ) : (
        <ShadowingSession lang={lang} level={level} text={text} phrase={phrase} voiceId={voiceId} />
      )}
      {own && me.entitlements.customText && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={isSaved}
            onClick={() => saveText(lang, text) && toast.success("Saved to your library.")}
          >
            {isSaved ? <BookmarkCheck /> : <Bookmark />}
            {isSaved ? "Saved" : "Save this text"}
          </Button>
          <span>Keep your own texts in the library to practise them again.</span>
        </div>
      )}
    </>
  );
}
