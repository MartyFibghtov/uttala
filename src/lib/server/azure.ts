const key = () => process.env.AZURE_SPEECH_KEY ?? "";
const region = () => process.env.AZURE_SPEECH_REGION ?? "";

export const hasAzure = () => key().length > 0 && region().length > 0;

export interface AzureWord {
  text: string;
  score: number;
  errorType: string;
  phonemes: { ipa: string; score: number }[];
}

export interface AzureAssessment {
  accuracy: number;
  fluency?: number;
  prosody?: number;
  words: AzureWord[];
}

type Scored = { AccuracyScore?: number; ErrorType?: string; FluencyScore?: number; ProsodyScore?: number };
type Nested = { PronunciationAssessment?: Scored };
type RawPhoneme = Scored & Nested & { Phoneme?: string };
type RawWord = Scored & Nested & { Word: string; Phonemes?: RawPhoneme[] };
type RawBest = Scored & Nested & { Words?: RawWord[] };

// The REST API flattens scores onto each object; the SDK nests them. Accept both.
const scored = (o: Scored & Nested): Scored => o.PronunciationAssessment ?? o;

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
    ...(isEnUs ? { EnableProsodyAssessment: true } : {}),
  };
  const url =
    `https://${region()}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
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
    words: (best.Words ?? []).map((w) => ({
      text: w.Word,
      score: scored(w).AccuracyScore ?? 0,
      errorType: scored(w).ErrorType ?? "None",
      phonemes: (w.Phonemes ?? [])
        .filter((p) => p.Phoneme)
        .map((p) => ({ ipa: p.Phoneme as string, score: scored(p).AccuracyScore ?? 0 })),
    })),
  };
}
