export type PlanId = "free" | "plus" | "pro";
export type Interval = "month" | "year";

export interface Entitlements {
  /** Recordings analysed per day. */
  dailyAnalyses: number;
  /** Reference-voice characters per day for texts outside the built-in library. */
  dailyVoiceChars: number;
  customText: boolean;
  voiceChoice: boolean;
  /** Rhythm and melody comparison against the reference voice. */
  prosody: boolean;
  /** Sound-by-sound scores. */
  phonemes: boolean;
  /** How many weak words the drill list keeps; null = no cap. */
  maxDrillWords: number | null;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Prices in US cents. */
  price: Record<Interval, number>;
  features: string[];
  entitlements: Entitlements;
}

export const TRIAL_DAYS = 7;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Find out what to fix.",
    price: { month: 0, year: 0 },
    features: [
      "5 recordings analysed every day",
      "Word-by-word feedback in 17 languages",
      "Phrasebook course and sound library",
      "Ear training, streaks and checkpoint tests",
      "Drill list of your 5 weakest words",
    ],
    entitlements: {
      dailyAnalyses: 5,
      dailyVoiceChars: 0,
      customText: false,
      voiceChoice: false,
      prosody: false,
      phonemes: false,
      maxDrillWords: 5,
    },
  },
  plus: {
    id: "plus",
    name: "Plus",
    tagline: "Practise as much as you want.",
    price: { month: 999, year: 7999 },
    features: [
      "60 recordings analysed every day",
      "Practise and save your own texts",
      "Rhythm and melody compared with a native voice",
      "Choose your coach voice: teacher, storyteller, everyday and more",
      "Unlimited drill list",
    ],
    entitlements: {
      dailyAnalyses: 60,
      dailyVoiceChars: 20_000,
      customText: true,
      voiceChoice: true,
      prosody: true,
      phonemes: false,
      maxDrillWords: null,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Polish every single sound.",
    price: { month: 1999, year: 14999 },
    features: [
      "Everything in Plus",
      "Sound-by-sound scoring in 15 languages",
      "Your weakest sounds tracked over time",
      "250 recordings analysed every day",
      "Priority support",
    ],
    entitlements: {
      dailyAnalyses: 250,
      dailyVoiceChars: 60_000,
      customText: true,
      voiceChoice: true,
      prosody: true,
      phonemes: true,
      maxDrillWords: null,
    },
  },
};

export const PAID_PLANS: Exclude<PlanId, "free">[] = ["plus", "pro"];

/** Stripe price lookup key for a plan and billing interval. */
export const lookupKey = (plan: PlanId, interval: Interval) => `uttala_${plan}_${interval}ly`;

export function parseLookupKey(key: string | null | undefined): { plan: PlanId; interval: Interval } | null {
  const m = /^uttala_(plus|pro)_(month|year)ly$/.exec(key ?? "");
  return m ? { plan: m[1] as PlanId, interval: m[2] as Interval } : null;
}

export const formatPrice = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Monthly-equivalent price, for showing what yearly billing works out to. */
export const perMonth = (plan: Plan, interval: Interval) =>
  interval === "year" ? Math.round(plan.price.year / 12) : plan.price.month;

export const yearlySaving = (plan: Plan) =>
  plan.price.month ? Math.round((1 - plan.price.year / (plan.price.month * 12)) * 100) : 0;
