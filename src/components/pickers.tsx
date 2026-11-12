"use client";

import { useState } from "react";
import { Check, ChevronDown, Lock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccount } from "@/hooks/use-account";
import { play } from "@/lib/audio";
import { LANGUAGES } from "@/lib/languages";
import { LEVEL_IDS, LEVELS, type LevelId } from "@/lib/levels";
import { setPrefs, useStore } from "@/lib/store";
import type { Voice, VoiceRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LanguagePicker() {
  const { me, updateProfile } = useAccount();
  return (
    <Select value={me.profile.lang} onValueChange={(lang) => void updateProfile({ lang })}>
      <SelectTrigger className="w-40 rounded-full" aria-label="Language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LevelPicker() {
  const { me, updateProfile } = useAccount();
  return (
    <Select value={me.profile.level} onValueChange={(level) => void updateProfile({ level: level as LevelId })}>
      <SelectTrigger className="w-40 rounded-full" aria-label="Level">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEVEL_IDS.map((id) => (
          <SelectItem key={id} value={id}>
            {LEVELS[id].name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ROLE_LABEL: Record<VoiceRole, string> = {
  teacher: "Teacher",
  everyday: "Everyday",
  storyteller: "Storyteller",
  presenter: "Presenter",
  creator: "Creator",
  character: "Character",
};
const ROLE_ORDER = Object.keys(ROLE_LABEL) as VoiceRole[];

const describe = (v: Voice) => [ROLE_LABEL[v.role], v.gender, v.accent].filter(Boolean).join(" · ");

/**
 * Reference voice. One decision up front ("Auto" picks a native voice suited
 * to the learner's level); roles narrow the list for people who want to choose.
 */
export function VoicePicker() {
  const { me, promptUpgrade } = useAccount();
  const prefs = useStore("prefs");
  const [role, setRole] = useState<VoiceRole | "all">("all");
  const [open, setOpen] = useState(false);
  const lang = me.profile.lang;
  if (!me.voices.length) return null;

  const native = me.voices.filter((v) => v.langs.includes(lang));
  const canChoose = me.entitlements.voiceChoice;
  const rawSelectedId = canChoose ? prefs.voices[lang] : undefined;
  const selected = native.find((v) => v.id === rawSelectedId);
  const selectedId = selected?.id;

  const roles = ROLE_ORDER.filter((r) => native.some((v) => v.role === r));
  const matches = (v: Voice) => role === "all" || v.role === role;

  const choose = (id: string | null) => {
    if (id && !canChoose) {
      setOpen(false);
      promptUpgrade("voice");
      return;
    }
    const voices = { ...prefs.voices };
    if (id) voices[lang] = id;
    else delete voices[lang];
    setPrefs({ voices });
    setOpen(false);
  };

  const row = (v: Voice) => (
    <div key={v.id} className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        disabled={!v.previewUrl}
        aria-label={`Hear ${v.name}`}
        onClick={() => v.previewUrl && void play(v.previewUrl)}
      >
        <Play className="size-3.5" />
      </Button>
      <button
        type="button"
        onClick={() => choose(v.id)}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary",
          v.id === selectedId && "bg-secondary",
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{v.name}</span>
          <span className="block truncate text-xs text-muted-foreground capitalize">{describe(v)}</span>
        </span>
        {v.id === selectedId ? (
          <Check className="size-4 shrink-0" />
        ) : (
          !canChoose && <Lock className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-40 justify-between rounded-full font-normal" aria-label="Reference voice">
          <span className="truncate">{selected ? selected.name : "Auto voice"}</span>
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <button
          type="button"
          onClick={() => choose(null)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary",
            !selectedId && "bg-secondary",
          )}
        >
          <span>
            <span className="block text-sm font-medium">Auto (Native)</span>
            <span className="block text-xs text-muted-foreground">
              Native speaker model matched to your level
            </span>
          </span>
          {!selectedId && <Check className="size-4" />}
        </button>

        {roles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Voice role">
            {(["all", ...roles] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors",
                  role === r && "border-foreground bg-foreground text-background",
                )}
              >
                {r === "all" ? "All" : ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        )}

        {native.length > 0 && (
          <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto">
            {native.filter(matches).map(row)}
          </div>
        )}

        {!canChoose && (
          <Button size="sm" className="mt-3 w-full rounded-full" onClick={() => choose("locked")}>
            Choose your voice with Plus
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The native voice the learner picked for the current language, if their plan allows choosing one. */
export function useVoiceId(): string | undefined {
  const { me } = useAccount();
  const prefs = useStore("prefs");
  if (!me.entitlements.voiceChoice) return undefined;
  const lang = me.profile.lang;
  const picked = prefs.voices[lang];
  if (!picked) return undefined;
  return me.voices.some((v) => v.id === picked && v.langs.includes(lang)) ? picked : undefined;
}
