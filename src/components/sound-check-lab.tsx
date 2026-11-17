"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { loadReference } from "@/components/practice-session";
import { useRecorder } from "@/hooks/use-recorder";
import { decodeToMono16k, encodeWav, play, SAMPLE_RATE, trackPitch } from "@/lib/audio";
import { deduct, type Deduction } from "@/lib/deductions";
import { compareProsody } from "@/lib/prosody";
import { LANGUAGES, textsFor } from "@/lib/languages";
import type { SoundCheck } from "@/lib/phone-compare";
import { bandFor } from "@/lib/score-bands";
import { onModelProgress, preloadRatingModel, strictCheck } from "@/lib/rating";
import { applySoundCheck, NATIVE_MATCH, type StrictCheck } from "@/lib/sound-check";
import type { AssessResult } from "@/lib/types";

interface Run {
  engine: AssessResult;
  withCheck: AssessResult | null;
  check: SoundCheck | null;
  strict: StrictCheck | null;
  deduction: { score: number; items: Deduction[] } | null;
  checkError?: string;
  userUrl: string;
  refUrl: string | null;
  seconds: { engine: number; check: number };
}

const tone = (s: number) =>
  s >= 90 ? "text-emerald-600" : s >= 80 ? "text-lime-600" : s >= 60 ? "text-amber-600" : "text-red-600";

/**
 * Demo page: record once, then see the engine score next to the engine plus the precise sound check,
 * word by word, to judge how much the on-device model adds.
 */
export function SoundCheckLab() {
  const [lang, setLang] = useState("sv");
  const phrases = useMemo(
    () => [...textsFor(lang, "beginner"), ...textsFor(lang, "intermediate"), ...textsFor(lang, "advanced")],
    [lang],
  );
  const [text, setText] = useState("");
  const target = text.trim() || phrases[0]?.text || "";
  const [model, setModel] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prepare = async () => {
    setModel("loading");
    try {
      const off = onModelProgress((f) => setProgress(Math.round(f * 100)));
      await preloadRatingModel().finally(off);
      setModel("ready");
    } catch (err) {
      console.error(err);
      setModel("error");
    }
  };

  const analyse = async (blob: Blob) => {
    setError(null);
    setRun(null);
    try {
      setBusy("Scoring with the engine…");
      const samples = await decodeToMono16k(blob);
      if (samples.length < SAMPLE_RATE * 0.4) throw new Error("Too short. Try again.");
      const form = new FormData();
      form.append("audio", encodeWav(samples), "speech.wav");
      form.append("text", target);
      form.append("lang", lang);
      form.append("level", "intermediate");
      const refPromise = loadReference(target, lang, "intermediate").catch(() => null);
      const t0 = performance.now();
      const res = await fetch("/api/assess", { method: "POST", body: form });
      const engine = (await res.json()) as AssessResult & { error?: string };
      if (!res.ok) throw new Error(engine.error ?? "Assessment failed.");
      const t1 = performance.now();

      setBusy("Comparing every sound with the native reading (on this device)…");
      const reference = await refPromise;
      let strict: StrictCheck | null = null;
      let checkError: string | undefined;
      if (!reference?.samples) checkError = "The native reference could not be loaded.";
      else {
        try {
          strict = await strictCheck(samples, reference.samples, reference.spans, lang);
        } catch (err) {
          checkError = err instanceof Error ? err.message : String(err);
        }
      }
      const t2 = performance.now();
      const check = strict?.check ?? null;
      let deduction: Run["deduction"] = null;
      if (strict && reference) {
        const pros = compareProsody(strict.wordSpans, reference.spans, trackPitch(samples), reference.pitch);
        deduction = deduct({
          lang,
          sounds: strict.sounds,
          words: engine.words.map((w) => ({ text: w.text, status: w.status })),
          rhythm: pros.rhythm,
          intonation: pros.intonation,
          hesitations: pros.hesitations,
          pace: pros.pace,
        });
      }
      setRun({
        engine,
        check,
        strict,
        deduction,
        checkError,
        withCheck: check ? applySoundCheck(engine, check, lang) : null,
        userUrl: URL.createObjectURL(blob),
        refUrl: reference?.url ?? null,
        seconds: { engine: (t1 - t0) / 1000, check: (t2 - t1) / 1000 },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const recorder = useRecorder((blob) => void analyse(blob));
  const toggle = async () => {
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (blob) void analyse(blob);
    } else {
      await recorder.start();
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Sound check lab</h1>
        <p className="text-muted-foreground text-sm">
          One recording, five results: the engine alone, the engine plus the sound check, the strict on-device score, strict combined with the engine, and the score by deduction with every mistake listed. Demo only;
          each recording uses one of today&apos;s analyses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Sound model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {model === "ready" ? (
            <p className="text-sm text-emerald-600">Loaded and cached in this browser.</p>
          ) : (
            <>
              <Button onClick={prepare} disabled={model === "loading"}>
                {model === "loading" ? `Downloading… ${progress}%` : "Load the model (about 240 MB, once)"}
              </Button>
              {model === "loading" && <Progress value={progress} />}
              {model === "error" && <p className="text-sm text-red-600">Could not load the model. See the console.</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. What to say</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <Button
                key={l.code}
                size="sm"
                variant={l.code === lang ? "default" : "outline"}
                onClick={() => {
                  setLang(l.code);
                  setText("");
                  setRun(null);
                }}
              >
                {l.name}
              </Button>
            ))}
          </div>
          <select
            className="w-full rounded-md border bg-transparent p-2 text-sm"
            value={phrases.some((p) => p.text === text) ? text : ""}
            onChange={(e) => setText(e.target.value)}
          >
            <option value="">{phrases[0]?.text ?? "Pick a phrase"}</option>
            {phrases.slice(1).map((p) => (
              <option key={p.text} value={p.text}>
                {p.text}
              </option>
            ))}
          </select>
          <Textarea
            placeholder="Or type your own text (needs Plus)"
            value={phrases.some((p) => p.text === text) ? "" : text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-lg font-medium">{target}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void loadReference(target, lang, "intermediate").then((r) => play(r.url))}
            >
              Hear the native reading
            </Button>
            <Button onClick={toggle} disabled={!!busy || model !== "ready"}>
              {recorder.recording ? `Stop (${recorder.seconds.toFixed(0)} s)` : "Record"}
            </Button>
          </div>
          {model !== "ready" && <p className="text-muted-foreground text-xs">Load the model first.</p>}
          {busy && <p className="text-sm">{busy}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {run && <Comparison run={run} lang={lang} />}
    </div>
  );
}

function Comparison({ run, lang }: { run: Run; lang: string }) {
  const a = run.engine.scores.accuracy;
  const b = run.withCheck?.scores.accuracy;
  const s = run.strict?.score;
  const f = run.strict?.features;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>3. Result</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Score title="Engine only" score={a} note={`${run.seconds.engine.toFixed(1)} s, server`} />
            {b !== undefined ? (
              <Score
                title="Engine + sound check"
                score={b}
                note={`${run.seconds.check.toFixed(1)} s extra, this device · raw sound match ${run.check?.match}% (native median for this language ≈ ${NATIVE_MATCH[lang] ?? 82}%)`}
              />
            ) : (
              <div className="text-sm text-red-600">Sound check failed: {run.checkError}</div>
            )}
            {s !== undefined && f && (
              <>
                <Score
                  title="Strict, device only (no API)"
                  score={s}
                  note={`GOP weakest-tenth ${f.gopP10.toFixed(2)} · deficit ${f.deficit.toFixed(2)} · ${Math.round(100 * f.gopFail)}% of sounds lost to another sound · frame distance ${f.dtw.toFixed(3)}`}
                />
                <Score
                  title="Strict + engine (lower of the two)"
                  score={Math.min(a, s)}
                  note="Engine catches wrong or missing words, strict catches accent."
                />
              </>
            )}
            {run.deduction && (
              <div className="sm:col-span-2">
                <Score
                  title="By deduction: 100 minus every caught mistake"
                  score={run.deduction.score}
                  note={`${run.deduction.items.length} mistakes caught, ${Math.round(100 - run.deduction.score)} points lost`}
                />
                {run.deduction.items.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {run.deduction.items.map((d, k) => (
                      <li key={k} className="flex gap-2">
                        <span className="w-12 shrink-0 text-right font-mono text-red-600">−{d.points}</span>
                        <span className="text-muted-foreground w-16 shrink-0 text-xs leading-5">{d.kind}</span>
                        <span>
                          {d.word !== undefined && d.word >= 0 && run.engine.words[d.word] && (
                            <b>{run.engine.words[d.word].text}: </b>
                          )}
                          {d.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void play(run.userUrl)}>
              Play my recording
            </Button>
            {run.refUrl && (
              <Button size="sm" variant="outline" onClick={() => void play(run.refUrl!)}>
                Play native reading
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Heard by the engine: “{run.engine.transcript}” · engines: {JSON.stringify(run.engine.engines)}
            {run.engine.warnings.length ? ` · warnings: ${run.engine.warnings.join("; ")}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Word by word</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="p-2">Word</th>
                <th className="p-2">Engine</th>
                <th className="p-2">+ check</th>
                <th className="p-2">Strict</th>
                <th className="p-2">Sounds: native / you</th>
                <th className="p-2">What the check found</th>
              </tr>
            </thead>
            <tbody>
              {run.engine.words.map((w, i) => {
                const c = run.withCheck?.words[i];
                const changed = c && c.score !== w.score;
                return (
                  <tr key={i} className={`border-t ${changed ? "bg-amber-500/10" : ""}`}>
                    <td className="p-2 font-medium">{w.text}</td>
                    <td className={`p-2 ${tone(w.score)}`}>
                      {w.score} <span className="text-muted-foreground text-xs">{w.status}</span>
                    </td>
                    <td className={`p-2 ${c ? tone(c.score) : ""}`}>
                      {c ? (
                        <>
                          {c.score} <span className="text-muted-foreground text-xs">{c.status}</span>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className={`p-2 ${run.strict?.words[i] ? tone(run.strict.words[i].score) : ""}`}>
                      {run.strict?.words[i]?.weakest ? (
                        <>
                          {run.strict.words[i].score}
                          <div className="text-muted-foreground font-mono text-xs">
                            /{run.strict.words[i].weakest!.ref}/ {run.strict.words[i].weakest!.lpr.toFixed(1)}
                            {run.strict.words[i].weakest!.lpr < 0 && ` → /${run.strict.words[i].weakest!.rival}/`}
                          </div>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {c?.native ? (
                        <>
                          /{c.native.ref}/
                          <br />/{c.native.heard}/ <span className="text-muted-foreground">({c.native.match}%)</span>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {c?.native?.issues.length
                        ? c.native.issues
                            .map((x) => (x.heard ? `/${x.heard}/ for /${x.ref}/` : `missing /${x.ref}/`))
                            .join(", ")
                        : "–"}
                      {w.diagnosis && <div className="text-muted-foreground mt-1">Engine: {w.diagnosis}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-muted-foreground mt-3 text-xs">
            Highlighted rows: the sound check lowered the word. It only ever lowers a score, never raises one. The
            combined sentence score is 75% engine words + 25% overall sound match. Strict: the model&apos;s confidence in
            each native sound on your audio (GOP), read against how natives score; under each word, its weakest
            sound, its margin, and the sound it was heard as when another one won.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function Score({ title, score, note }: { title: string; score: number; note: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-xs">{title}</div>
      <div className={`text-4xl font-semibold ${tone(score)}`}>{score}</div>
      <div className="text-sm">{bandFor(score).label}</div>
      <div className="text-muted-foreground mt-1 text-xs">{note}</div>
    </div>
  );
}
