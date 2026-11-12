import type { LevelId } from "./levels";
import type { Entitlements, Interval, PlanId } from "./plans";

export type WordStatus = "ok" | "unclear" | "mispronounced" | "omitted";

export interface PhonemeResult {
  ipa: string;
  score: number;
  /** The IPA sound actually heard when different from the target phoneme. */
  heardIpa?: string;
  /** Specific description of what was wrong with this sound. */
  issue?: string;
  /** Articulatory tip for fixing this phoneme. */
  tip?: string;
}

export interface WordResult {
  index: number;
  text: string;
  /** Character offsets of the word in the target text. */
  from: number;
  to: number;
  status: WordStatus;
  score: number;
  /** What the speech recogniser heard instead, when it differs. */
  heard?: string;
  /** Expected IPA transcription of the word. */
  expectedIpa?: string;
  /** Actual IPA transcription heard in the recording. */
  heardIpa?: string;
  /** High-level category of pronunciation error (e.g. Vowel quality, Consonant substitution). */
  errorCategory?: string;
  /** Detailed explanation of what went wrong in this word. */
  diagnosis?: string;
  /** Concrete articulatory instruction on how to fix the error. */
  fix?: string;
  /** Note when syllable stress or lexical tone was misplaced. */
  stressIssue?: string;
  /** Timing of the word in the learner's recording, in seconds. */
  start?: number;
  end?: number;
  phonemes?: PhonemeResult[];
}

export interface Engines {
  elevenlabs: boolean;
  azure: boolean;
  openai?: boolean;
}

export interface FocusSound {
  ipa: string;
  name: string;
  count: number;
  tip: string;
  soundId?: string;
}

export interface AssessResult {
  engines: Engines;
  demo: boolean;
  /** True when phoneme-level scores are present. */
  phonemeLevel: boolean;
  transcript: string;
  words: WordResult[];
  insertions: string[];
  scores: {
    accuracy: number;
    intelligibility: number;
    completeness: number;
  };
  duration: number;
  warnings: string[];
  /** Detailed phonetic coaching summary for the entire recording. */
  overallFeedback?: string;
  /** Key sounds identified in this recording that need attention. */
  focusSounds?: FocusSound[];
}

export interface TimedChar {
  c: string;
  s: number;
  e: number;
}

export interface TtsResponse {
  audio: string;
  mime: string;
  chars: TimedChar[];
  voiceId: string;
}

export type VoiceRole = "everyday" | "teacher" | "storyteller" | "presenter" | "creator" | "character";

export interface Voice {
  id: string;
  name: string;
  langs: string[];
  role: VoiceRole;
  accent?: string;
  gender?: string;
  age?: string;
  previewUrl?: string;
}

export interface Profile {
  lang: string;
  level: LevelId;
  onboarded: boolean;
}

export interface SubscriptionInfo {
  status: string;
  interval: Interval | null;
  /** Unix seconds. */
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

/** Everything the signed-in app needs to render. */
export interface Me {
  user: { id: string; name: string; email: string };
  profile: Profile;
  plan: PlanId;
  entitlements: Entitlements;
  usage: { used: number; limit: number };
  subscription: SubscriptionInfo | null;
  trialAvailable: boolean;
  /** Whether payments are configured on this deployment. */
  billing: boolean;
  engines: Engines;
  voices: Voice[];
}

export interface ProsodyResult {
  fluency: number | null;
  rhythm: number | null;
  intonation: number | null;
  /** Learner speaking pace relative to the reference (1 = same). */
  pace: number | null;
  hesitations: number;
  contour: ContourPoint[];
}

export interface ContourPoint {
  /** Word index + fraction through the word. */
  x: number;
  /** Semitones relative to the speaker's own median pitch. */
  user: number | null;
  ref: number | null;
}

export interface Attempt {
  id: string;
  at: number;
  lang: string;
  text: string;
  overall: number;
  accuracy: number;
  intelligibility: number;
  fluency: number | null;
  rhythm: number | null;
  intonation: number | null;
  demo: boolean;
  level?: LevelId;
  /** Length of the recording in seconds. */
  seconds?: number;
  /** Points earned for this attempt. */
  xp?: number;
}

export interface WeakWord {
  key: string;
  lang: string;
  text: string;
  context: string;
  attempts: number;
  avg: number;
  last: number;
  streak: number;
  heard?: string;
  at: number;
  /**
   * Set once the word has been said clearly three times in a row: it then
   * rests and comes back for spaced checks. `reviews` counts the checks passed.
   */
  reviews?: number;
  /** When the next spaced check is due (ms since epoch). */
  due?: number;
}

export interface MasteredWord {
  key: string;
  lang: string;
  text: string;
  at: number;
}

export interface SavedText {
  id: string;
  lang: string;
  text: string;
  at: number;
}

export interface GeneratedText {
  id: string;
  lang: string;
  level: LevelId;
  text: string;
  meaning?: string;
  roman?: string;
  /** Short coaching note on which weak spots this text works on. */
  focus: string;
  /** Specific weak words, sounds or contrasts woven into the text. */
  targets: string[];
  at: number;
}

/** Result of a checkpoint test: a comparable snapshot of where the learner stands. */
export interface Checkpoint {
  at: number;
  lang: string;
  score: number;
  accuracy: number;
  intelligibility: number;
  recommended: LevelId;
}

/** What the learner chose to share and receive. All off by default. */
export interface CommunityPrefs {
  /** Public display name in the league. */
  handle: string;
  league: boolean;
  reminders: boolean;
}

export interface League {
  /** Monday the week began, YYYY-MM-DD (UTC). */
  weekStart: string;
  rows: { rank: number; name: string; points: number; you: boolean }[];
  yourPoints: number;
}

export interface ClassSummary {
  id: string;
  name: string;
  role: "owner" | "member";
  members: number;
  /** Join code, visible to the teacher only. */
  code?: string;
}

export interface ClassDetail extends ClassSummary {
  weekStart: string;
  roster: {
    id: string;
    name: string;
    points: number;
    you: boolean;
    /** Teacher-only detail for this week. */
    recordings?: number;
    average?: number;
    lastActive?: string;
  }[];
}

export interface ListeningTally {
  right: number;
  total: number;
}

export interface WeakPhoneme {
  key: string;
  lang: string;
  ipa: string;
  count: number;
  avg: number;
  examples: string[];
}
