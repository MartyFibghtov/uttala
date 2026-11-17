"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Headphones, Library, Mic, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { ArtworkFrame } from "@/components/artwork";
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
import { WordLadder } from "@/components/word-ladder";
import { useAccount } from "@/hooks/use-account";
import { findPhrase, getLanguage, isLibraryText, textsFor, unitsFor } from "@/lib/languages";
import { isShort, ladderWords, splitShort } from "@/lib/short";
import { bestKey, removeGeneratedText, removeSavedText, saveText, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const INTRO = {
  beginner: "Short everyday phrases. Say the hard words on their own, then the whole phrase.",
  intermediate: "One short sentence at a time. Drill the hard words, then say the sentence and see what to fix.",
  advanced: "Short, dense sentences and tongue twisters. Chase the last details that still sound foreign.",
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

/** Everything there is to say: short sentences, course phrases, generated weak-spot sentences and the learner's own saved texts. */
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
          <DialogDescription>Pick something to say. Your best score is shown next to the ones you have tried.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="passages">
          <TabsList className="mb-3">
            <TabsTrigger value="passages">Sentences</TabsTrigger>
            <TabsTrigger value="phrases">Phrases</TabsTrigger>
            <TabsTrigger value="generated">Weak-spot{generated.length ? ` · ${generated.length}` : ""}</TabsTrigger>
            <TabsTrigger value="saved">Saved{saved.length ? ` · ${saved.length}` : ""}</TabsTrigger>
          </TabsList>
          <TabsContent value="passages" className="space-y-4">
            {(["intermediate", "advanced"] as const).map((level) => (
              <section key={level} className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {level === "intermediate" ? "Everyday sentences" : "Tongue twisters and dense sentences"}
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
              <div className="rounded-xl border border-dashed px-6 py-8 text-center">
                <ArtworkFrame name="emptyClarity" sizes="144px" className="mx-auto mb-3 aspect-[4/3] w-36 rounded-xl" />
                <p className="font-medium">No generated sentences yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Use “Weak-spot sentence” to generate a short sentence and drill words built around your weakest
                  words, sounds and contrasts.
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
              <div className="rounded-xl border border-dashed px-6 py-8 text-center">
                <ArtworkFrame name="emptyClarity" sizes="144px" className="mx-auto mb-3 aspect-[4/3] w-36 rounded-xl" />
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
  const weakList = useStore("weak");
  const weakProfile = useWeakProfile(lang);
  // What the learner is working on, remembered per language and level for this visit: the sentence,
  // the word from it being drilled on its own (if any), and the rest of a long own text split into
  // short sentences.
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<Record<string, string | undefined>>({});
  const [queues, setQueues] = useState<Record<string, { raw: string; pieces: string[] }>>({});
  const [practiceMode, setPracticeMode] = useState<"read" | "shadow">("read");
  const [regenerating, setRegenerating] = useState(false);
  const key = `${lang}:${level}`;
  const text = texts[key] ?? library[0].text;
  const step = steps[key];
  const queue = queues[key];
  const queueAt = queue ? queue.pieces.indexOf(text) : -1;
  const current = step ?? text;
  const setText = (value: string) => {
    setTexts((t) => ({ ...t, [key]: value }));
    setSteps((s) => ({ ...s, [key]: undefined }));
  };
  const setStep = (value: string) => setSteps((s) => ({ ...s, [key]: value === text ? undefined : value }));
  /** Pick something to practise. A longer text is split into short sentences, practised one at a time. */
  const choose = (value: string) => {
    const v = value.trim();
    if (v && !isShort(v, lang)) {
      const pieces = splitShort(v, lang).map((p) => p.text);
      setQueues((q) => ({ ...q, [key]: { raw: v, pieces } }));
      setText(pieces[0]);
      if (pieces.length > 1) toast.success(`Split into ${pieces.length} short sentences. Take them one at a time.`);
    } else setText(value);
  };
  const generatedItem = generated.find((g) => g.lang === lang && g.text === text.trim());
  const phrase =
    findPhrase(lang, text) ??
    (generatedItem
      ? { text: generatedItem.text, meaning: generatedItem.meaning, roman: generatedItem.roman }
      : undefined);
  const weakNorms = new Set(weakList.filter((w) => w.lang === lang).map((w) => w.key.slice(lang.length + 1)));
  const words = isShort(text, lang) ? ladderWords(text, lang, { proposed: generatedItem?.words, weak: weakNorms }) : [];
  const own = text.trim().length > 0 && !isLibraryText(lang, text);
  const ownText = queueAt >= 0 ? queue.raw : text.trim();
  const isSaved = saved.some((s) => s.lang === lang && s.text === ownText);

  const nextText = () => {
    if (queue && queueAt >= 0 && queue.pieces.length > 1) {
      setText(queue.pieces[(queueAt + 1) % queue.pieces.length]);
      return;
    }
    const at = library.findIndex((p) => p.text === text);
    setText(library[(at + 1) % library.length].text);
  };

  const regenerateWeakSpot = async () => {
    setRegenerating(true);
    try {
      const item = await requestGeneratedText(defaultGeneratePayload(lang, level, weakProfile));
      setText(item.text);
      toast.success("Generated a new sentence for your weak spots.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a practice sentence.");
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
        <WeakSpotGenerator lang={lang} level={level} onGenerated={(item) => choose(item.text)} />
        <TextLibrary lang={lang} onPick={choose} />
        <Button variant="outline" className="rounded-full" onClick={nextText}>
          <Shuffle />
          Next sentence
        </Button>
      </PageHeader>
      {generatedItem && (
        <GeneratedTextBanner
          item={generatedItem}
          onRegenerate={() => void regenerateWeakSpot()}
          busy={regenerating}
        />
      )}
      {queue && queueAt >= 0 && queue.pieces.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Your text, sentence {queueAt + 1} of {queue.pieces.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-full"
            disabled={queueAt === 0}
            onClick={() => setText(queue.pieces[queueAt - 1])}
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-full"
            disabled={queueAt === queue.pieces.length - 1}
            onClick={() => setText(queue.pieces[queueAt + 1])}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
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
          Say &amp; score
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
            ? "Say the hard words on their own, then the whole sentence, for sound-by-sound feedback."
            : "Speak in chorus or right after the native voice to train rhythm, melody and speed."}
        </span>
      </div>
      {practiceMode === "read" ? (
        <>
          <WordLadder lang={lang} words={words} sentence={text} current={current} onPick={setStep} />
          <PracticeSession
            lang={lang}
            level={level}
            text={current}
            phrase={step ? undefined : phrase}
            voiceId={voiceId}
            onTextChange={setText}
            onEditDone={choose}
          />
        </>
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
            onClick={() => saveText(lang, ownText) && toast.success("Saved to your library.")}
          >
            {isSaved ? <BookmarkCheck /> : <Bookmark />}
            {isSaved ? "Saved" : "Save this text"}
          </Button>
          <span>Keep your own texts in the library to practise them again, one sentence at a time.</span>
        </div>
      )}
    </>
  );
}
