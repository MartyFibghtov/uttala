const key = () => process.env.AZURE_SPEECH_KEY ?? "";
const region = () => process.env.AZURE_SPEECH_REGION ?? "";

export const hasAzure = () => key().length > 0 && region().length > 0;

export interface AzureWord {
  text: string;
  score: number;
  errorType: string;
  start?: number;
  end?: number;
  /** For each expected sound, the best-matching sound Azure heard (en-US only). */
  phonemes: { ipa: string; score: number; heard?: string }[];
}

export interface AzureAssessment {
  accuracy: number;
  fluency?: number;
  prosody?: number;
  words: AzureWord[];
}

type Scored = { AccuracyScore?: number; ErrorType?: string; FluencyScore?: number; ProsodyScore?: number };
type Nested = { PronunciationAssessment?: Scored };
type NBestPhoneme = { Phoneme?: string; Score?: number };
type RawPhoneme = Scored &
  Nested & { Phoneme?: string; NBestPhonemes?: NBestPhoneme[]; PronunciationAssessment?: Scored & { NBestPhonemes?: NBestPhoneme[] } };
type RawWord = Scored & Nested & { Word: string; Offset?: number; Duration?: number; Phonemes?: RawPhoneme[] };
type RawBest = Scored & Nested & { Words?: RawWord[] };

// The REST API flattens scores onto each object; the SDK nests them. Accept both.
const scored = (o: Scored & Nested): Scored => o.PronunciationAssessment ?? o;

/**
 * Azure only scores sounds one by one for some locales. For the others it copies the word's score onto
 * every sound, which would show invented precision, so those are dropped and the word counts as checked
 * word by word.
 */
function measuredPhonemes(w: RawWord, wordScore: number, locale: string): AzureWord["phonemes"] {
  const phonemes = (w.Phonemes ?? [])
    .filter((p) => p.Phoneme)
    .map((p) => {
      const best = (p.PronunciationAssessment?.NBestPhonemes ?? p.NBestPhonemes ?? [])[0]?.Phoneme;
      return {
        ipa: p.Phoneme as string,
        score: scored(p).AccuracyScore ?? 0,
        ...(best && best !== p.Phoneme ? { heard: best } : {}),
      };
    });
  // en-US is scored sound by sound; a perfect word there legitimately has every sound at 100.
  if (locale === "en-US") return phonemes;
  const copied = phonemes.length > 1 && phonemes.every((p) => Math.abs(p.score - wordScore) < 0.5);
  return copied ? [] : phonemes;
}

/**
 * Phoneme-level scoring via Azure Pronunciation Assessment (short-audio REST API).
 * Expects 16 kHz mono PCM WAV, at most ~30 s.
 */
export async function assessWithAzure(
  wav: Blob,
  text: string,
  locale: string,
): Promise<AzureAssessment> {
  const isEnUs = locale === "en-US";
  const params = {
    ReferenceText: text,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: true,
    PhonemeAlphabet: "IPA",
    // NBestPhonemeCount reports which sound was actually heard; Azure supports it for en-US only.
    ...(isEnUs ? { EnableProsodyAssessment: true, NBestPhonemeCount: 3 } : {}),
  };
  const url =
    (process.env.AZURE_SPEECH_ENDPOINT ?? `https://${region()}.stt.speech.microsoft.com`) +
    `/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(locale)}&format=detailed`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key(),
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
      "Pronunciation-Assessment": Buffer.from(JSON.stringify(params), "utf8").toString("base64"),
    },
    body: wav,
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Azure pronunciation assessment failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { RecognitionStatus?: string; NBest?: RawBest[] };
  const best = data.NBest?.[0];
  if (!best) throw new Error(`Azure returned no result (${data.RecognitionStatus ?? "unknown"}).`);
  const top = scored(best);
  return {
    accuracy: top.AccuracyScore ?? 0,
    fluency: top.FluencyScore,
    prosody: top.ProsodyScore,
    words: (best.Words ?? []).map((w) => {
      const hasTiming = typeof w.Offset === "number" && typeof w.Duration === "number" && w.Duration > 0;
      return {
        text: w.Word,
        score: scored(w).AccuracyScore ?? 0,
        errorType: scored(w).ErrorType ?? "None",
        ...(hasTiming
          ? { start: (w.Offset as number) / 1e7, end: ((w.Offset as number) + (w.Duration as number)) / 1e7 }
          : {}),
        phonemes: measuredPhonemes(w, scored(w).AccuracyScore ?? 0, locale),
      };
    }),
  };
}
