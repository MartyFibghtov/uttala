import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  AudioWaveform,
  BookOpen,
  CalendarClock,
  Ear,
  Flame,
  Gauge,
  ListChecks,
  MessageSquareText,
  Mic,
  Users,
} from "lucide-react";
import { Logo } from "@/components/app-shell";
import { Orb, OrbCluster } from "@/components/orb";
import { Pricing } from "@/components/pricing";
import { Button } from "@/components/ui/button";
import { CONTENT, languageSlug } from "@/components/marketing-pages";
import { LANGUAGES } from "@/lib/languages";
import { LEVEL_IDS, LEVELS } from "@/lib/levels";
import { SITE } from "@/lib/site";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" className="hidden rounded-full md:inline-flex">
            <Link href="/features">Features</Link>
          </Button>
          <Button asChild variant="ghost" className="hidden rounded-full md:inline-flex">
            <Link href="/languages">Languages</Link>
          </Button>
          <Button asChild variant="ghost" className="hidden rounded-full lg:inline-flex">
            <Link href="/method">Method</Link>
          </Button>
          <Button asChild variant="ghost" className="hidden rounded-full sm:inline-flex">
            <Link href="/pricing">Pricing</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="rounded-full">
            <Link href="/sign-up">Start free</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

const FOOTER: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Features", "/features"],
      ["Pricing", "/pricing"],
      ["Method", "/method"],
      ["Start free", "/sign-up"],
    ],
  },
  {
    title: "Languages",
    links: [
      ...LANGUAGES.slice(0, 5).map((l): [string, string] => [l.name, `/languages/${languageSlug(l)}`]),
      [`All ${LANGUAGES.length} languages`, "/languages"],
    ],
  },
  {
    title: "Support",
    links: [
      ["Help", "/help"],
      ["Sign in", "/sign-in"],
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Pronunciation coaching that shows what a listener would miss, and what to practise next.
          </p>
          <a href={`mailto:${SITE.contact}`} className="mt-3 inline-block text-sm text-muted-foreground hover:text-foreground">
            {SITE.contact}
          </a>
        </div>
        {FOOTER.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-medium">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-5 text-sm text-muted-foreground md:px-8">
          © {SITE.company}. Reference voices by ElevenLabs.
        </p>
      </div>
    </footer>
  );
}

const SYSTEM = [
  { icon: BookOpen, title: "Phrasebook course", body: "Seven units of everyday situations in every language, with meanings and up to three stars a phrase." },
  { icon: Gauge, title: "Sound library", body: `${CONTENT.sounds} guides to the sounds learners get wrong: how to make them and what to watch for.` },
  { icon: Ear, title: "Ear training", body: `${CONTENT.pairs} minimal pairs, tracked per contrast, so you hear the difference before you try to say it.` },
  { icon: ListChecks, title: "Personal drills", body: "Unclear words from your recordings are collected automatically and practised until they are clear." },
  { icon: CalendarClock, title: "Spaced checks", body: "Words you fix come back after 2 and 7 days. Pass both and they are mastered for good." },
  { icon: AudioWaveform, title: "Sound-by-sound scoring", body: `In ${CONTENT.soundLevel} languages, see which sound inside a word is off and track your weakest sounds.` },
  { icon: Flame, title: "Streaks and goals", body: "A daily plan, a goal you choose, and a calendar that shows the habit forming." },
  { icon: Mic, title: "Checkpoint test", body: "Three readings scored the same way every time: one number you can compare month to month." },
];

const NUMBERS: [string, string][] = [
  [String(CONTENT.languages), "languages"],
  [String(CONTENT.phrases), "course phrases"],
  [String(CONTENT.sounds), "sound guides"],
  [String(CONTENT.pairs), "listening pairs"],
];

/** A static picture of a result, so visitors see the product before signing up. */
function ResultPreview() {
  const words: [string, "ok" | "unclear" | "bad"][] = [
    ["I", "ok"],
    ["thought", "bad"],
    ["the", "ok"],
    ["weather", "unclear"],
    ["would", "ok"],
    ["be", "ok"],
    ["better", "ok"],
    ["this", "ok"],
    ["Thursday", "bad"],
  ];
  const style = { ok: "", unclear: "bg-amber-100 text-amber-950", bad: "bg-red-100 text-red-950" };
  return (
    <div className="relative w-full max-w-md rounded-2xl border bg-card/95 p-5 shadow-xl backdrop-blur" aria-hidden>
      <p className="text-lg leading-loose">
        {words.map(([w, s], i) => (
          <span key={i}>
            <span className={`rounded-md px-0.5 ${style[s]}`}>{w}</span>{" "}
          </span>
        ))}
      </p>
      <div className="mt-4 flex items-center justify-between border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Overall</p>
          <p className="text-3xl font-semibold tracking-tight text-amber-600 tabular-nums">74</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">“Thursday”</p>
          <p className="text-muted-foreground">heard as “Sursday”</p>
        </div>
        <Orb palette="gold" size={44} float="fast" />
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: Ear,
    title: "Listen",
    body: "Hear any text read by a native voice. Tap a single word to hear only that word, at full speed or slowed down.",
  },
  {
    icon: Mic,
    title: "Record",
    body: "Read it aloud. Up to thirty seconds is enough to show where a listener would lose you.",
  },
  {
    icon: ListChecks,
    title: "Fix what matters",
    body: "Every word is coloured by how clearly it came through. The weak ones go to short drills until you nail them three times, then come back for spaced checks.",
  },
];

const FEATURES = [
  {
    icon: MessageSquareText,
    title: "What a listener actually hears",
    body: "A recogniser that never saw your script writes down what it heard. Where it differs from the text, a person would have misheard you too.",
  },
  {
    icon: AudioLines,
    title: "Rhythm and melody, made visible",
    body: "Your pitch line is drawn over a native speaker's, word by word, so you can see where your tune goes its own way.",
  },
  {
    icon: Users,
    title: "A voice that fits how you learn",
    body: "A patient teacher, a storyteller or an everyday speaker. Listening drills switch voices so your ear learns the sound, not the person.",
  },
];

const FAQ = [
  {
    q: "How does it know what I got wrong?",
    a: "Three checks run on every recording. Your audio is lined up against the text you read to find each word. A separate recogniser, which has not seen the text, writes down what it heard. And your pitch and timing are compared with a native reading of the same text. Words that fail these checks are the ones you see highlighted.",
  },
  {
    q: "Will this remove my accent?",
    a: "The first goal is being understood easily, and most people get there well before their accent disappears. If you want to go further, the advanced level scores strictly and puts extra weight on rhythm and melody, which is where a remaining accent usually lives. No tool can promise a native accent; this one shows you precisely what is still different.",
  },
  {
    q: "Is my voice stored?",
    a: "No. A recording is sent for analysis and then discarded. We keep your scores and the list of words you are drilling, and you can download or delete them at any time.",
  },
  {
    q: "Which languages can I practise?",
    a: `${LANGUAGES.map((l) => l.name).join(", ")}. Sound-by-sound scoring on the Pro plan covers 15 of them.`,
  },
  {
    q: "Can I cancel?",
    a: "Yes, in two clicks from your account page. You keep your plan until the end of the period you paid for, and the free plan stays available after that.",
  },
];

export function Landing() {
  return (
    <>
      <section className="aurora-wash relative overflow-hidden border-b">
        <OrbCluster className="hidden opacity-90 lg:block" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight md:text-6xl">
              Sound clear. Then sound native.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Read aloud, and Uttala shows which words a listener would miss, how your rhythm and melody compare with
              a native voice, and exactly what to practise next.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/sign-up">
                  Start free
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full bg-background/70">
                <Link href="#how">See how it works</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Free plan, no card needed. 17 languages.</p>
          </div>
          <ResultPreview />
        </div>
      </section>

      <section className="border-b">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 md:grid-cols-4 md:px-8">
          {NUMBERS.map(([value, label]) => (
            <div key={label}>
              <dt className="sr-only">{label}</dt>
              <dd className="text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
              <dd className="text-sm text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:px-8 md:py-20">
        <h2 className="text-3xl font-semibold tracking-tight">Two minutes from text to feedback</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="rounded-2xl border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm text-muted-foreground">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight">It meets you where you are</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Tell us your level and the texts, the pace and the strictness of scoring change with it.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {LEVEL_IDS.map((id, i) => (
              <div key={id} className="rounded-2xl border bg-card p-6">
                <Orb palette={(["sky", "gold", "orchid"] as const)[i]} size={36} />
                <h3 className="mt-4 text-lg font-semibold">{LEVELS[id].name}</h3>
                <p className="mt-0.5 text-sm font-medium">“{LEVELS[id].headline}”</p>
                <p className="mt-2 text-sm text-muted-foreground">{LEVELS[id].description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
        <h2 className="text-3xl font-semibold tracking-tight">Feedback you can act on</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border bg-card p-6">
              <Icon className="size-5" />
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight">More than a score: a whole practice system</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            A course for the days you do not know what to practise, drills built from your own mistakes, and a schedule
            that keeps what you fix.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SYSTEM.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border bg-card p-5">
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
                  <Icon className="size-4" />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          <Button asChild variant="outline" className="mt-8 rounded-full bg-background">
            <Link href="/features">
              See every feature
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
        <h2 className="text-3xl font-semibold tracking-tight">{LANGUAGES.length} languages, each with its own sound guide</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The rolled rr of Spanish, the tones of Mandarin, the three kinds of stop in Korean: every language page lists
          what its learners struggle with.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
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

      <section id="pricing" className="scroll-mt-20 border-y bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Start free. Upgrade when it clicks.</h2>
          <p className="mx-auto mt-2 mb-10 max-w-xl text-center text-muted-foreground">
            The free plan is enough to find out what to fix. Paid plans let you fix it faster.
          </p>
          <Pricing />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-20">
        <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-6 divide-y border-y">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="aurora-wash relative overflow-hidden border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center md:px-8 md:py-20">
          <div className="flex items-end gap-3" aria-hidden>
            <Orb palette="sky" size={36} float="slow" />
            <Orb palette="orchid" size={56} float="fast" />
            <Orb palette="gold" size={40} float="slow" />
          </div>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight">Hear the difference today</h2>
          <p className="mt-2 max-w-md text-muted-foreground">Your first feedback takes about two minutes.</p>
          <Button asChild size="lg" className="mt-6 rounded-full">
            <Link href="/sign-up">
              Start free
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
