import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  AudioWaveform,
  BookOpen,
  CalendarClock,
  ChartLine,
  Check,
  Ear,
  Flame,
  Gauge,
  MessageSquareText,
  Mic,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Orb } from "@/components/orb";
import { Button } from "@/components/ui/button";
import { LANGUAGES, unitsFor, type Language } from "@/lib/languages";
import { MINIMAL_PAIRS } from "@/lib/minimal-pairs";
import { SITE } from "@/lib/site";
import { KIND_LABEL, SOUNDS, soundsFor } from "@/lib/sounds";

export const languageSlug = (l: Language) =>
  l.name
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");

export const languageBySlug = (slug: string) => LANGUAGES.find((l) => languageSlug(l) === slug);

/** What the library holds, counted from the content itself so the site never overstates it. */
export const CONTENT = {
  languages: LANGUAGES.length,
  phrases: LANGUAGES.reduce((s, l) => s + unitsFor(l.code).reduce((n, u) => n + u.phrases.length, 0), 0),
  sounds: SOUNDS.length,
  pairs: Object.values(MINIMAL_PAIRS).reduce((s, p) => s + p.length, 0),
  soundLevel: LANGUAGES.filter((l) => l.azure).length,
};

function Hero({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="aurora-wash border-b">
      <div className="mx-auto max-w-4xl px-4 py-14 md:px-8 md:py-20">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
        <div className="mt-4 max-w-2xl text-lg text-muted-foreground">{children}</div>
      </div>
    </section>
  );
}

export function StartCta({ title = "Hear the difference today", body = "Your first feedback takes about two minutes." }: { title?: string; body?: string }) {
  return (
    <section className="aurora-wash relative overflow-hidden border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center md:px-8 md:py-20">
        <div className="flex items-end gap-3" aria-hidden>
          <Orb palette="sky" size={36} float="slow" />
          <Orb palette="orchid" size={56} float="fast" />
          <Orb palette="gold" size={40} float="slow" />
        </div>
        <h2 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-md text-muted-foreground">{body}</p>
        <Button asChild size="lg" className="mt-6 rounded-full">
          <Link href="/sign-up">
            Start free
            <ArrowRight />
          </Link>
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">Free plan, no card needed.</p>
      </div>
    </section>
  );
}

// --- Features ---------------------------------------------------------------

type Tier = "Free" | "Plus" | "Pro";

const FEATURE_GROUPS: {
  title: string;
  intro: string;
  items: { icon: typeof Mic; title: string; body: string; points: string[]; tier: Tier }[];
}[] = [
  {
    title: "Feedback",
    intro: "Three independent checks on every recording, turned into something you can act on.",
    items: [
      {
        icon: MessageSquareText,
        title: "Word-by-word clarity",
        body: "Every word of your text is coloured by how clearly it came through, and you see what a listener heard instead.",
        points: ["Clear, unclear, mispronounced or skipped", "“Heard as” for misheard words", "Replay just that word: you, then the reference"],
        tier: "Free",
      },
      {
        icon: AudioLines,
        title: "Rhythm and melody",
        body: "Your pitch line drawn over a native speaker's, word by word, plus scores for fluency, rhythm and intonation.",
        points: ["Pitch tracked in your browser", "Hesitations and pace against the reference", "Extra weight at the advanced level"],
        tier: "Plus",
      },
      {
        icon: AudioWaveform,
        title: "Sound-by-sound scoring",
        body: "See which sound inside a word is off, and keep a running list of your weakest sounds.",
        points: [`Available in ${CONTENT.soundLevel} languages`, "Each sound links to its guide", "Tracked over time"],
        tier: "Pro",
      },
    ],
  },
  {
    title: "Learning",
    intro: "Structure for the days you do not know what to practise.",
    items: [
      {
        icon: BookOpen,
        title: "Phrasebook course",
        body: "Seven units of everyday situations in every language, from first greetings to asking for a doctor.",
        points: ["28 phrases per language with meanings", "Romanisation where the script is new", "Up to three stars per phrase"],
        tier: "Free",
      },
      {
        icon: Gauge,
        title: "Sound library",
        body: "The sounds learners most often get wrong: how to make each one, what usually goes wrong, and words to practise.",
        points: [`${CONTENT.sounds} guides across ${CONTENT.languages} languages`, "Tongue and lip positions in plain words", "Record any practice word and get a score"],
        tier: "Free",
      },
      {
        icon: Ear,
        title: "Ear training",
        body: "Minimal pairs train you to hear a contrast before you try to say it. Accuracy is tracked per contrast.",
        points: [`${CONTENT.pairs} word pairs`, "A smart mix that returns to your weakest contrast", "Different voices each round on paid plans"],
        tier: "Free",
      },
      {
        icon: Mic,
        title: "Your own texts",
        body: "Paste the presentation, interview answers or lines you actually need, and save them to your library.",
        points: ["Up to 600 characters per text", "The same feedback as built-in texts", "Saved to your account"],
        tier: "Plus",
      },
    ],
  },
  {
    title: "Making it stick",
    intro: "Fixing a word once is easy. These keep it fixed.",
    items: [
      {
        icon: Target,
        title: "Personal drill list",
        body: "Unclear words from any recording are collected automatically and practised alone or in their sentence.",
        points: ["Three clear takes in a row to graduate", "Free keeps your 5 weakest words", "Unlimited on paid plans"],
        tier: "Free",
      },
      {
        icon: CalendarClock,
        title: "Spaced checks",
        body: "A graduated word rests, then comes back after 2 days and again after 7. Pass both and it is mastered.",
        points: ["Recall after a gap is what builds memory", "Slip once and the word returns to learning", "Mastered words are kept on record"],
        tier: "Free",
      },
      {
        icon: Flame,
        title: "Streaks and daily goals",
        body: "A daily plan, a points goal you choose, and a calendar that shows the habit forming.",
        points: ["Four goal sizes, from 2 to 20 minutes", "18 achievements", "Ranks that grow with practice"],
        tier: "Free",
      },
      {
        icon: ChartLine,
        title: "Progress you can trust",
        body: "Trends for every skill, and a checkpoint test that uses the same texts each time so the numbers compare.",
        points: ["Five skills tracked separately", "Checkpoint with a recommended level", "Download or delete your data any time"],
        tier: "Free",
      },
    ],
  },
  {
    title: "Together",
    intro: "Optional, private by default, and built for people who know each other.",
    items: [
      {
        icon: Users,
        title: "Classes for teachers and groups",
        body: "Create a class, share a six-letter code, and see who is practising: points, recordings, average score and last active day.",
        points: ["Free for teachers", "Up to 60 learners per class", "Learners see only names and weekly points"],
        tier: "Free",
      },
      {
        icon: Flame,
        title: "Weekly league",
        body: "A fresh ranking every Monday by points from analysed recordings, under a display name you choose.",
        points: ["Opt-in, leave any time", "Scored on the server, so it cannot be gamed from the browser", "Only recordings count"],
        tier: "Free",
      },
      {
        icon: CalendarClock,
        title: "Gentle reminders",
        body: "An email when you have gone quiet for two days, at most once every three days.",
        points: ["Off until you turn it on", "One-click stop in every email", "No marketing mail"],
        tier: "Free",
      },
    ],
  },
  {
    title: "The details",
    intro: "Small things that add up over hundreds of recordings.",
    items: [
      {
        icon: Users,
        title: "Voices that fit how you learn",
        body: "A patient teacher, a storyteller or an everyday speaker. “Auto” picks a native voice suited to your level.",
        points: ["Preview every voice", "Slow playback without changing pitch", "Tap any word to hear just that word"],
        tier: "Plus",
      },
      {
        icon: ShieldCheck,
        title: "Private by design",
        body: "Recordings are analysed and discarded. We keep scores and drill words, never your voice.",
        points: ["Audio is never stored", "One-click data export", "Delete your account yourself"],
        tier: "Free",
      },
    ],
  },
];

const TIER_STYLE: Record<Tier, string> = {
  Free: "bg-secondary text-foreground",
  Plus: "bg-amber-100 text-amber-900",
  Pro: "bg-foreground text-background",
};

export function FeaturesPage() {
  return (
    <>
      <Hero eyebrow="Features" title="Everything between “I think that was right” and knowing">
        <p>
          Uttala listens the way a careful teacher would, then gives you a plan: a course to follow, drills built from
          your own mistakes, and a schedule that keeps what you fix.
        </p>
      </Hero>
      {FEATURE_GROUPS.map((group, g) => (
        <section key={group.title} className={g % 2 ? "border-y bg-secondary/40" : ""}>
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-16">
            <h2 className="text-3xl font-semibold tracking-tight">{group.title}</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">{group.intro}</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {group.items.map(({ icon: Icon, title, body, points, tier }) => (
                <div key={title} className="rounded-2xl border bg-card p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                      <Icon className="size-4" />
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TIER_STYLE[tier]}`}>
                      {tier === "Free" ? "All plans" : `${tier} and up`}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
      <section className="mx-auto max-w-6xl px-4 py-14 text-center md:px-8">
        <p className="text-muted-foreground">
          See what each plan includes on the{" "}
          <Link href="/pricing" className="font-medium text-foreground underline underline-offset-4">
            pricing page
          </Link>
          , or read{" "}
          <Link href="/method" className="font-medium text-foreground underline underline-offset-4">
            how the scoring works
          </Link>
          .
        </p>
      </section>
      <StartCta />
    </>
  );
}

// --- Languages --------------------------------------------------------------

export function LanguagesPage() {
  return (
    <>
      <Hero eyebrow="Languages" title={`Pronunciation coaching in ${CONTENT.languages} languages`}>
        <p>
          Every language has the full course, drill list, ear training and rhythm and melody comparison. Sound-by-sound
          scoring is available in {CONTENT.soundLevel} of them.
        </p>
      </Hero>
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LANGUAGES.map((l) => (
            <Link
              key={l.code}
              href={`/languages/${languageSlug(l)}`}
              className="group flex flex-col rounded-2xl border bg-card p-5 transition-all hover:border-foreground/40 hover:shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{l.name}</h2>
                <span className="text-sm text-muted-foreground" lang={l.code}>
                  {l.native}
                </span>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">
                {soundsFor(l.code)
                  .slice(0, 3)
                  .map((s) => s.name)
                  .join(", ")}
                {soundsFor(l.code).length > 3 ? " and more" : ""}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{l.azure ? "Sound-by-sound scoring" : "Word-level scoring"}</span>
                <ArrowRight className="size-4 text-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <StartCta />
    </>
  );
}

export function LanguagePage({ language }: { language: Language }) {
  const sounds = soundsFor(language.code);
  const shownSounds = sounds.slice(0, 8);
  const pairs = MINIMAL_PAIRS[language.code] ?? [];
  const units = unitsFor(language.code);
  const samples = units.slice(0, 4).map((u) => ({ unit: u.title, phrase: u.phrases[0] }));
  const facts = [
    [String(units.reduce((s, u) => s + u.phrases.length, 0)), "course phrases"],
    [String(sounds.length), "sound guides"],
    [String(pairs.length), "listening pairs"],
    [language.azure ? "Yes" : "Word level", "sound-by-sound scoring"],
  ];

  return (
    <>
      <Hero eyebrow={`${language.name} · ${language.native}`} title={`Improve your ${language.name} pronunciation`}>
        <p>
          Read {language.name} aloud and see which words a listener would miss, how your rhythm and melody compare with a
          native voice, and exactly what to practise next.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-full">
            <Link href="/sign-up">
              Start {language.name} free
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full bg-background/70">
            <Link href="/features">See all features</Link>
          </Button>
        </div>
      </Hero>

      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 py-10 md:grid-cols-4 md:px-8">
        {facts.map(([value, label]) => (
          <div key={label} className="rounded-2xl border bg-card p-5">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 md:px-8">
        <h2 className="text-3xl font-semibold tracking-tight">The {language.name} sounds learners struggle with</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Each has a guide in the app with practice words you can record and score.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {shownSounds.map((s) => (
            <article key={s.id} className="rounded-2xl border bg-card p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold">{s.name}</h3>
                <span className="font-mono text-lg text-muted-foreground">{s.symbol}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{KIND_LABEL[s.kind]}</p>
              <p className="mt-3 text-sm">{s.how}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Watch out: </span>
                {s.watch}
              </p>
              <p className="mt-3 text-sm text-muted-foreground" lang={language.code}>
                {s.words.join(" · ")}
              </p>
            </article>
          ))}
        </div>
        {sounds.length > shownSounds.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            And {sounds.length - shownSounds.length} more in the app&apos;s sound library.
          </p>
        )}
      </section>

      {pairs.length > 0 && (
        <section className="border-y bg-secondary/40">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
            <h2 className="text-3xl font-semibold tracking-tight">Words that differ by a single sound</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              If two of these sound the same to you, your mouth cannot tell them apart either. Ear training fixes that
              first.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pairs.map((p) => (
                <div key={`${p.a}-${p.b}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
                  <span className="font-medium" lang={language.code}>
                    {p.a} · {p.b}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.contrast}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <h2 className="text-3xl font-semibold tracking-tight">Phrases you will practise</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {samples.map(({ unit, phrase }) => (
            <div key={phrase.text} className="rounded-xl border bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">{unit}</p>
              <p className="mt-1 text-lg" lang={language.code} dir={language.rtl ? "rtl" : "ltr"}>
                {phrase.text}
              </p>
              {phrase.roman && <p className="text-sm text-muted-foreground italic">{phrase.roman}</p>}
              {phrase.meaning && <p className="text-sm text-muted-foreground">{phrase.meaning}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 md:px-8">
        <h2 className="text-lg font-semibold">Other languages</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {LANGUAGES.filter((l) => l.code !== language.code).map((l) => (
            <Link
              key={l.code}
              href={`/languages/${languageSlug(l)}`}
              className="rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {l.name}
            </Link>
          ))}
        </div>
      </section>
      <StartCta title={`Start speaking clearer ${language.name}`} />
    </>
  );
}

// --- Method -----------------------------------------------------------------

const PRINCIPLES = [
  {
    title: "Being understood comes first",
    body: "Accent and intelligibility are only partly related. Research on second-language speech consistently finds that learners can be easy to understand while keeping a clear accent, so Uttala's headline measure is how much of what you said a listener would recognise.",
    source: "Munro & Derwing; Levis, the intelligibility principle",
  },
  {
    title: "Train the ear with the mouth",
    body: "Adults hear a new language through the sound categories of their first. Two foreign sounds that fall into one native category are heard as the same, and so are produced the same. Listening drills with varied voices are one of the best-supported techniques in the field.",
    source: "Flege, Speech Learning Model; Logan, Lively & Pisoni 1991; Thomson 2018",
  },
  {
    title: "Fix what distinguishes the most words",
    body: "Some contrasts separate hundreds of word pairs and others almost none. The sound library and listening pairs are ordered so that the contrasts with the highest pay-off come first.",
    source: "Brown 1988; Munro & Derwing 2006, functional load",
  },
  {
    title: "Rhythm and melody carry meaning",
    body: "Stress, timing and pitch often affect understanding more than single sounds do, and seeing your pitch against a model helps you change it.",
    source: "Hardison 2004",
  },
  {
    title: "Feedback has to be specific",
    body: "Instruction with explicit corrective feedback produces medium to large gains. That is why every result points at particular words, shows what was heard instead, and ends in one concrete next step.",
    source: "Saito 2012; Lee, Jang & Plonsky 2015",
  },
  {
    title: "Spacing makes it last",
    body: "A word said right three times in a row is not yet learned. Recalling it after a gap of days is what moves it into long-term memory, so graduated words return for two spaced checks.",
    source: "The spacing effect, one of the most replicated findings in learning research",
  },
];

const PIPELINE = [
  ["Alignment", "Because you read a known text, your audio can be lined up against it. Each word gets a start time, an end time and a measure of how well the audio fits."],
  ["Open transcription", "A separate recogniser that has not seen the text writes down what it heard. Where its transcript differs from the text, a person would likely have misheard you too."],
  ["Word scores", "Alignment fit and recogniser confidence are blended into a 0–100 score per word, judged against a threshold that depends on your level."],
  ["Sound scores", "Where a phoneme-level engine is available, each sound inside the word is scored and replaces the word-level estimate."],
  ["Rhythm and melody", "Pitch is tracked in your browser and normalised to your own voice, then compared with the reference reading word by word. Timing compares each word's share of the speaking time."],
];

export function MethodPage() {
  return (
    <>
      <Hero eyebrow="Method" title="How Uttala listens, and why it teaches this way">
        <p>
          The product is built on what pronunciation research has found to work, and on a scoring pipeline we would
          rather explain than mystify.
        </p>
      </Hero>

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <h2 className="text-3xl font-semibold tracking-tight">Six principles</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <article key={p.title} className="rounded-2xl border bg-card p-6">
              <span className="text-sm text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
              <p className="mt-3 text-xs text-muted-foreground">{p.source}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y bg-secondary/40">
        <div className="mx-auto max-w-4xl px-4 py-14 md:px-8">
          <h2 className="text-3xl font-semibold tracking-tight">What happens to a recording</h2>
          <ol className="mt-8 space-y-5">
            {PIPELINE.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-muted-foreground">
            The recording itself is discarded once it has been analysed. Only the scores are kept.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 md:px-8">
        <h2 className="text-3xl font-semibold tracking-tight">What it cannot do</h2>
        <ul className="mt-6 space-y-4 text-sm">
          {[
            ["Single-sound scores are noisy.", "Even the best published systems agree only moderately with human raters at the level of one sound. Trust the pattern across several recordings more than any single number."],
            ["Recognisers are forgiving.", "Modern speech recognition is trained to understand accented speech, so it lets some real errors through. Strict scoring at the advanced level compensates in part."],
            ["Conditions matter.", "A noisy room, a distant microphone or a very short recording all lower accuracy. The app tells you when it could not measure something."],
            ["No tool can promise a native accent.", "What it can do is show you precisely what is still different, and make the practice efficient."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border bg-card p-5">
              <span className="font-medium">{title}</span> <span className="text-muted-foreground">{body}</span>
            </li>
          ))}
        </ul>
      </section>
      <StartCta title="Try the method on your own voice" />
    </>
  );
}

// --- Help -------------------------------------------------------------------

export const HELP: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "Getting started",
    items: [
      { q: "What do I need?", a: "A recent browser and a microphone. A headset or the microphone on a phone held close works better than a laptop across the room. No app to install." },
      { q: "Which level should I choose?", a: "Start with the one whose description sounds like you. The checkpoint test recommends a level from three short readings, and you can switch at any time without losing progress." },
      { q: "How long should I practise?", a: "Short and daily beats long and rare. The default goal takes about five minutes; you can change it in Settings." },
      { q: "Can I learn several languages?", a: "Yes. Switch language from any page. History, drill list and course progress are kept separately for each." },
    ],
  },
  {
    title: "Scores and feedback",
    items: [
      { q: "What do the colours mean?", a: "Plain words came through clearly. Amber words were unclear, red ones were mispronounced or heard as something else, and struck-through words were not heard at all. The thresholds are stricter at higher levels." },
      { q: "Why did a word I said correctly get a low score?", a: "Usually background noise, a clipped start or end of the recording, or a very quiet voice. Record again closer to the microphone. If a word keeps scoring low, compare your slice of audio with the reference: the difference is often audible once isolated." },
      { q: "What is the “Understood” score?", a: "The share of words that a recogniser which never saw your text wrote down correctly. It is the closest measure to what a real listener experiences." },
      { q: "Why is my score lower at the advanced level?", a: "Advanced scoring uses stricter thresholds and gives rhythm and melody more weight. Use the checkpoint test for a number that is comparable across levels." },
    ],
  },
  {
    title: "Course, drills and review",
    items: [
      { q: "How do I clear a course phrase?", a: "Score 70 or more on it. 80 earns two stars and 90 three. Only your best score counts." },
      { q: "How does the drill list work?", a: "Words that come out unclear in any recording are added automatically. Say a word clearly three times in a row and it rests. It returns for a check after 2 days and again after 7; pass both and it is mastered. If it slips, it goes back to learning." },
      { q: "What are points for?", a: "They measure practice, not skill: 10 to 20 for a recording, 1 or 2 for a listening round. They fill your daily goal, keep your streak and raise your rank." },
      { q: "I missed a day. Is my streak gone?", a: "A streak counts consecutive days with any practice, so a missed day resets it. Your longest streak is kept." },
    ],
  },
  {
    title: "Classes and league",
    items: [
      { q: "I am a teacher. How do I use this with my learners?", a: "Open Community, create a class and share its six-letter code. Learners enter the code under “Join a class”. You then see each learner's points, number of recordings, average score and last active day for the week. Creating classes is free." },
      { q: "What do classmates see about me?", a: "Your account name and your points for the week. Only the teacher sees your recording count, average score and last active day. Nobody hears your recordings: they are never stored." },
      { q: "How does the weekly league work?", a: "It is optional. Choose a display name and you are ranked with other learners who opted in, by points from analysed recordings since Monday (UTC). You can leave at any time and your name disappears from the board." },
      { q: "How do I stop reminder emails?", a: "Use the link at the bottom of any reminder, or turn them off in Settings. They are off unless you switched them on." },
    ],
  },
  {
    title: "Plans and billing",
    items: [
      { q: "What is free?", a: "Five analysed recordings a day, the whole course, the sound library, ear training, and a drill list of your five weakest words." },
      { q: "How does the trial work?", a: "New subscribers get seven days before the first payment. Cancel during the trial and nothing is charged." },
      { q: "How do I cancel or change plan?", a: "From Settings, open “Manage billing”. You keep your plan until the end of the period you paid for." },
      { q: "When does my daily allowance reset?", a: "At midnight UTC." },
    ],
  },
  {
    title: "Privacy",
    items: [
      { q: "Is my voice stored?", a: "No. A recording is sent for analysis and then discarded. We keep scores, your drill words and your settings." },
      { q: "Can I get or delete my data?", a: "Yes. Settings has a download button for everything we hold, a button to clear your progress, and one to delete the account entirely." },
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      { q: "The microphone does not work.", a: "Click the padlock or site-settings icon in your browser's address bar and allow the microphone, then reload. On a phone, also check that the browser itself has microphone permission in system settings." },
      { q: "There is no sound when I press Listen.", a: "Check the device volume and that the tab is not muted. On iPhone, the silent switch also mutes web audio in some browsers." },
      { q: "My progress looks different on another device.", a: "Progress syncs to your account a few seconds after each change and when you leave the page. Open the app on the first device once more, then reload the second." },
    ],
  },
];

export function HelpPage() {
  return (
    <>
      <Hero eyebrow="Help" title="Answers, without the wait">
        <p>
          Cannot find it here? Write to{" "}
          <a href={`mailto:${SITE.contact}`} className="font-medium text-foreground underline underline-offset-4">
            {SITE.contact}
          </a>
          .
        </p>
      </Hero>
      <section className="mx-auto max-w-3xl px-4 py-14 md:px-8">
        <nav className="flex flex-wrap gap-2" aria-label="Help topics">
          {HELP.map((g) => (
            <a
              key={g.title}
              href={`#${g.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className="rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {g.title}
            </a>
          ))}
        </nav>
        {HELP.map((g) => (
          <div key={g.title} id={g.title.toLowerCase().replace(/[^a-z]+/g, "-")} className="scroll-mt-20 pt-12">
            <h2 className="text-2xl font-semibold tracking-tight">{g.title}</h2>
            <div className="mt-4 divide-y border-y">
              {g.items.map(({ q, a }) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>
      <StartCta />
    </>
  );
}
