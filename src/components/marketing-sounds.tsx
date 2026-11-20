import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/json-ld";
import { Hero, languageSlug } from "@/components/marketing-pages";
import { Button } from "@/components/ui/button";
import { type Language } from "@/lib/languages";
import { MINIMAL_PAIRS } from "@/lib/minimal-pairs";
import { TITLE_MAX, clip } from "@/lib/site";
import { KIND_LABEL, soundSlug, soundsFor, type Sound, type SoundKind } from "@/lib/sounds";

export const soundPath = (language: Language, sound: Sound) => `/languages/${languageSlug(language)}/sounds/${soundSlug(sound)}`;
export const hubPath = (language: Language) => `/languages/${languageSlug(language)}/sounds`;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Names that are just a letter or two (“v”, “sh”, “ع”) read badly on their own, so they get a frame. */
const isBare = (name: string) => [...name].length <= 3;

/** The sound as a noun phrase, e.g. “English voiceless th” or “English “sh” sound”. */
function subject(sound: Sound, language: Language): string {
  if (isBare(sound.name)) return `${language.name} “${sound.name}” sound`;
  if (sound.name.toLowerCase().startsWith(language.name.toLowerCase())) return sound.name;
  return `${language.name} ${lowerFirst(sound.name)}`;
}

/** A symbol worth putting in a title: short, not already the name, and not a tone or rhythm mark. */
function titleSymbol(sound: Sound): string | null {
  if (sound.kind === "melody" || sound.symbol === sound.name || sound.symbol.length > 6 || sound.symbol.includes(" ")) return null;
  return sound.symbol;
}

export function soundTitle(sound: Sound, language: Language): string {
  const symbol = titleSymbol(sound);
  const s = subject(sound, language);
  // Longest form that still fits next to the brand suffix; the generator in pageMetadata clips as a last resort.
  const budget = TITLE_MAX - " · SayClear".length;
  const options = [`How to pronounce the ${s}${symbol ? ` (${symbol})` : ""}`, `How to pronounce the ${s}`, `How to pronounce ${s}`, `${s} pronunciation`];
  return options.find((o) => o.length <= budget) ?? options[options.length - 1];
}

export function soundDescription(sound: Sound): string {
  return clip(`${sound.how} Watch out: ${sound.watch} Practice words: ${sound.words.join(", ")}.`, 155);
}

export function hubTitle(language: Language): string {
  return `${language.name} sounds: pronunciation guides`;
}

export function hubDescription(language: Language): string {
  const names = soundsFor(language.code)
    .slice(0, 3)
    .map((s) => s.name)
    .join(", ");
  return clip(
    `${language.name} pronunciation guide: how to make each sound, the usual mistakes and words to practise, from ${names} and more.`,
    155,
  );
}

const KIND_ORDER: SoundKind[] = ["vowel", "consonant", "melody"];

function SoundCta({ language, sound }: { language: Language; sound?: Sound }) {
  return (
    <section className="aurora-wash relative overflow-hidden border-t">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-14 text-center md:px-8">
        <h2 className="text-3xl font-semibold tracking-tight">
          {sound ? "Record these words and get scored, free" : `Record ${language.name} and get scored, free`}
        </h2>
        <p className="mt-2 max-w-md text-muted-foreground">
          See which words a listener would miss, and get drills for the sounds that need work.
        </p>
        <Button asChild size="lg" className="mt-6 rounded-full">
          <Link href="/sign-up">
            Start free
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** Every sound of one language on a single page, with the full guide for each. */
export function SoundHubPage({ language }: { language: Language }) {
  const sounds = soundsFor(language.code);
  const dir = language.rtl ? "rtl" : "ltr";
  return (
    <>
      <Breadcrumbs
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Languages", path: "/languages" },
          { name: language.name, path: `/languages/${languageSlug(language)}` },
          { name: "Sounds", path: hubPath(language) },
        ]}
      />
      <Hero eyebrow={`${language.name} · ${language.native}`} title={`${language.name} sounds: how to pronounce them`}>
        <p>
          {sounds.length} guides to the {language.name} sounds learners most often get wrong: how to make each one, what
          usually goes wrong, and words to practise.
        </p>
        <p className="mt-3 text-base">
          Looking for the whole course?{" "}
          <Link href={`/languages/${languageSlug(language)}`} className="font-medium text-foreground underline underline-offset-4">
            {language.name} pronunciation practice
          </Link>
          .
        </p>
      </Hero>
      <div className="mx-auto max-w-4xl px-4 py-12 md:px-8">
        <nav aria-label="Sounds in this language" className="mb-10">
          <ul className="flex flex-wrap gap-2">
            {sounds.map((s) => (
              <li key={s.id}>
                <a href={`#${soundSlug(s)}`} className="rounded-full border px-3 py-1 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {KIND_ORDER.map((kind) => {
          const group = sounds.filter((s) => s.kind === kind);
          if (!group.length) return null;
          return (
            <section key={kind} className="mb-12">
              <h2 className="text-2xl font-semibold tracking-tight">{KIND_LABEL[kind]}</h2>
              <div className="mt-6 space-y-5">
                {group.map((s) => (
                  <article key={s.id} id={soundSlug(s)} className="scroll-mt-20 rounded-2xl border bg-card p-6">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-xl font-semibold">{s.name}</h3>
                      <span className="font-mono text-lg text-muted-foreground">{s.symbol}</span>
                    </div>
                    <p className="mt-3 text-sm">
                      <span className="font-medium">How to make it: </span>
                      {s.how}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Watch out: </span>
                      {s.watch}
                    </p>
                    {s.extra?.map((t) => (
                      <p key={t} className="mt-2 text-sm text-muted-foreground">
                        {t}
                      </p>
                    ))}
                    <ul lang={language.code} dir={dir} className="mt-4 flex flex-wrap gap-2">
                      {s.words.map((w) => (
                        <li key={w} className="rounded-full bg-secondary px-3 py-1 text-sm">
                          {w}
                        </li>
                      ))}
                    </ul>
                    <Link href={soundPath(language, s)} className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
                      Open the {s.name} guide
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <SoundCta language={language} />
    </>
  );
}

/** One sound: how to make it, what goes wrong, practice words, related sounds and listening pairs. */
export function SoundPage({ language, sound }: { language: Language; sound: Sound }) {
  const dir = language.rtl ? "rtl" : "ltr";
  const related = soundsFor(language.code).filter((s) => s.id !== sound.id);
  const pairs = MINIMAL_PAIRS[language.code] ?? [];
  const title = soundTitle(sound, language);
  return (
    <>
      <Breadcrumbs
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Languages", path: "/languages" },
          { name: language.name, path: `/languages/${languageSlug(language)}` },
          { name: "Sounds", path: hubPath(language) },
          { name: sound.name, path: soundPath(language, sound) },
        ]}
      />
      <Hero eyebrow={`${language.name} · ${KIND_LABEL[sound.kind]} · ${sound.symbol}`} title={title}>
        <p>{sound.how}</p>
      </Hero>
      <div className="mx-auto max-w-4xl space-y-12 px-4 py-12 md:px-8">
        <section>
          <h2 className="text-2xl font-semibold tracking-tight">What usually goes wrong</h2>
          <p className="mt-3 text-muted-foreground">{sound.watch}</p>
          {sound.extra?.map((t) => (
            <p key={t} className="mt-3 text-muted-foreground">
              {t}
            </p>
          ))}
        </section>

        <section>
          <h2 className="text-2xl font-semibold tracking-tight">Practice words</h2>
          <p className="mt-2 text-muted-foreground">Easiest first. Say each one slowly, then at normal speed.</p>
          <ul lang={language.code} dir={dir} className="mt-4 flex flex-wrap gap-2">
            {sound.words.map((w) => (
              <li key={w} className="rounded-full border bg-card px-4 py-1.5 text-lg">
                {w}
              </li>
            ))}
          </ul>
        </section>

        {pairs.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">{language.name} words that differ by one sound</h2>
            <p className="mt-2 text-muted-foreground">If two of these sound the same to you, train your ear before your mouth.</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {pairs.map((p) => (
                <li key={`${p.a}-${p.b}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5">
                  <span className="font-medium" lang={language.code} dir={dir}>
                    {p.a} · {p.b}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.contrast}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {related.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">More {language.name} sounds</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {related.map((s) => (
                <li key={s.id}>
                  <Link
                    href={soundPath(language, s)}
                    className="inline-block rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <Link href={hubPath(language)} className="font-medium underline underline-offset-4">
                All {language.name} sound guides
              </Link>
            </p>
          </section>
        )}
      </div>
      <SoundCta language={language} sound={sound} />
    </>
  );
}
