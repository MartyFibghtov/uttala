# Research: how pronunciation works and how software can coach it

This is the reasoning behind SayClear's design. Sources are listed at the end.

## 1. What pronunciation is

Speech has two layers, and both carry meaning.

**Segments (individual sounds).** Every language uses a small set of contrastive sounds, its *phonemes*: about 44 in English, 25 in Spanish, 5 vowels in Japanese against roughly 12 to 20 in English depending on the accent. A phoneme is a category, not a single sound. English /t/ is aspirated in "top", unreleased in "cat" and a flap in American "water"; these variants are *allophones*. Sounds are described by how they are made:

- Consonants: place (lips, teeth, alveolar ridge, palate, velum), manner (stop, fricative, nasal, approximant, trill) and voicing.
- Vowels: tongue height, tongue backness, lip rounding and length. Acoustically, vowel quality shows up as *formants* (F1 tracks height, F2 tracks backness).

**Prosody (suprasegmentals).** Stress, rhythm, intonation, tone and length. English reduces unstressed vowels to schwa and squeezes them in time; Spanish and Japanese keep syllables or moras more even; Mandarin and Vietnamese use pitch to distinguish words. Prosody is carried by three measurable signals: pitch (F0), duration and intensity.

**Why adults have an accent.** Learners hear a new language through the sound categories of their first one. Two foreign sounds that fall inside one native category are heard as the same sound (Japanese speakers and English /r/–/l/; Spanish speakers and /ɪ/–/iː/), so they are produced the same way. This is the core claim of Flege's Speech Learning Model and Best's Perceptual Assimilation Model, and it has a practical consequence: **perception has to be trained alongside production.**

## 2. What professionals actually do

| Technique | What it is | Evidence |
| --- | --- | --- |
| Intelligibility-first targets | Aim to be understood easily, not to erase the accent. Accent and intelligibility are only partly related. | Munro & Derwing; Levis's "intelligibility principle" |
| Functional load | Fix first the contrasts that distinguish many words (/ɪ/–/iː/, /l/–/r/), leave low-load ones (/θ/–/ð/) for later. | Brown 1988; Munro & Derwing 2006 |
| Minimal pairs | Words differing in one sound ("ship"/"sheep"), for both listening and speaking. | Standard practice; improves segmental accuracy |
| High-variability phonetic training (HVPT) | Identification tasks with many different voices and immediate feedback. | Strong lab evidence that it transfers to new speakers and to production (Logan, Lively & Pisoni 1991; Thomson 2018 review) |
| Articulatory instruction | Explicit description of tongue, lip and voicing settings; diagrams, mirrors. | Helps most for sounds with visible or describable gestures |
| Shadowing / imitation | Speaking along with or right after a model. | Good for rhythm and fluency; evidence thinner than for HVPT |
| Prosody work | Sentence stress, thought groups, pitch contours with visual feedback. | Prosody often affects intelligibility more than single sounds; visual pitch feedback helps (Hardison 2004) |
| Explicit corrective feedback | Telling the learner which sound was wrong and how. | Meta-analyses (Lee, Jang & Plonsky 2015; Saito 2012) show instruction with feedback works, medium-to-large effects |

Phoneticians' own tools are Praat (spectrograms, formants, pitch tracks), the IPA for transcription, and forced aligners (Montreal Forced Aligner) to locate each sound in a recording.

## 3. How a machine finds a mispronunciation

This field is called CAPT (computer-assisted pronunciation training), and the task is *mispronunciation detection and diagnosis*.

1. **Forced alignment.** Because the learner reads a known text, the system knows which sounds should occur. An acoustic model lines the expected sound sequence up with the audio, giving each word and sound a start and end time.
2. **Goodness of Pronunciation (GOP).** For each aligned segment, compare the model's probability for the expected phoneme with the best competing phoneme. A low ratio means the sound was off. Introduced by Witt & Young (2000); still the basis of commercial scoring.
3. **Free phoneme recognition.** Let a phoneme recogniser (today a self-supervised model such as wav2vec 2.0 fine-tuned with CTC on IPA labels) transcribe what was *actually* said, then diff that against the expected sequence. This yields a diagnosis ("you said /s/ for /θ/"), not only a score.
4. **Open transcription as an intelligibility test.** Run an ordinary speech recogniser with no knowledge of the script. Words it gets wrong are words a listener would likely mishear.
5. **Prosody.** Extract the pitch contour and segment durations, and compare them with a reference reading after aligning the two in time.

Known limits: scores at the single-phoneme level are noisy (one vendor benchmark puts Azure at 0.66 and the academic state of the art at 0.68 correlation with human raters at phone level; sentence-level agreement is much higher), modern recognisers are trained to *understand* accented speech and therefore forgive real errors, and models are weaker for children, noisy rooms and under-resourced languages.

## 4. What is available to build on

| Option | Gives | Limits |
| --- | --- | --- |
| **ElevenLabs text-to-speech** (`/v1/text-to-speech/{voice}/with-timestamps`) | Reference audio in many languages with per-character timing | A voice speaking outside its verified language can carry an accent; choose native voices |
| **ElevenLabs Scribe** (`/v1/speech-to-text`) | Transcript, word timings and per-word confidence in 90+ languages | Word level only; forgiving of accents |
| **ElevenLabs Forced Alignment** (`/v1/forced-alignment`) | Timing of every character and word of a known text, plus an alignment loss per word | Loss scale is undocumented; no phoneme labels |
| **Azure Pronunciation Assessment** | Accuracy per phoneme, syllable and word; fluency; completeness; 33 locales | Prosody score and IPA phoneme names are en-US only; short clips over REST |
| **SpeechAce and similar** | Phoneme scores | Fewer languages; paid per call |
| **Self-hosted wav2vec 2.0 / ZIPA phoneme models** | Language-universal IPA recognition and GOP, full control | Needs a GPU service, G2P per language and calibration data |

**Conclusion.** ElevenLabs covers the reference voice, the intelligibility test, timing and prosody for essentially any language, but it does not score individual sounds. Sound-level scoring needs a phoneme-aware engine. SayClear therefore uses ElevenLabs as the universal base layer and treats phoneme scoring as a pluggable second layer (Azure today, a self-hosted model later).

## 5. How SayClear applies this

| Research finding | Product decision |
| --- | --- |
| Intelligibility is the goal | "Understood" score: share of words an unscripted recogniser got right |
| Known text enables alignment | Learner reads a set text; forced alignment times every word |
| GOP-style evidence | Word score blends recogniser confidence and alignment fit; Azure phoneme scores replace it where available |
| Sounds drive perceived accent most; prosody also counts | Sounds and words carry 75% of the overall score. Pitch is tracked in the browser, normalised to each speaker's median, and compared with the reference word by word; rhythm compares each word's share of speaking time |
| Feedback must be specific | Click any word to see what was heard instead, its sounds, and to replay just that slice of yourself and of the reference |
| Practise what is weakest | Words under 80 go to a drill list and leave after three clear repetitions in a row |
| Perception before production; HVPT | Listening drill: minimal pairs played in a different voice each round |
| Words in isolation, then in context | Each drill word can be practised alone or in its original sentence |

## 6. Open items

- **Human ratings per language.** The scale is anchored on native news speech and, for English, on expert ratings (section 7). German, Spanish, Russian and Swedish still need native listeners rating learner clips to confirm where 90 sits.
- **More learner audio.** Exam videos often feature the teacher rather than a candidate; the learner side of the test set is small and weakly labelled.
- **Articulation guidance.** Per-phoneme instructions and mouth diagrams, selected by the learner's first language.
- **Tone languages.** Per-syllable tone contour comparison for Mandarin, Cantonese, Vietnamese and Thai.
- **Scheduling.** Spaced repetition over the drill list instead of a simple three-in-a-row rule.
- **Accounts.** Progress currently lives in the browser only.

## 7. Validation on real speech (November 2026)

No human raters were involved. Two sources, built with `npm run realset` and `npm run phonecheck` (audio kept locally under `.data/`, never committed):

- **YouTube.** Native news broadcasts per language (BBC, PBS, tagesschau, heute journal, RTVE, Antena 3, Первый канал, SVT) and learners in speaking-exam videos (IELTS, telc, Goethe, DELE, ТРКИ, SFI). Each video is cut to three minutes, transcribed with speaker labels, and split into sentences by the dominant speaker. Labels are weak: several "exam" videos turned out to be teachers, and those were excluded after checking.
- **speechocean762** (Apache-2.0). 96 English sentences by Mandarin speakers, stratified over expert accuracy ratings 3–10, with word ratings by five experts.

**Findings**

| Check | Result |
| --- | --- |
| Azure accuracy vs expert sentence ratings (n=96) | Pearson 0.71, Spearman 0.81 |
| Azure 75% + on-device sound match 25% | Pearson 0.78, Spearman 0.81 (GOPT reports 0.74 on the same corpus) |
| Words the experts marked wrong | Azure catches 70% with 8% false flags |
| Native news vs IELTS learners, raw Azure | 99 vs 96: barely separated |
| Native news vs IELTS learners, sound match | 96 vs 72.5; no learner sentence above 88, no native below 84 |
| Words flagged by the sound check | 1% of native news words, 21% of learner words (English) |
| German, sound match | Natives 78–88 per video, exam candidates 55–72 |
| Russian | Learners 64.5 and 84.5 on Azure (34.5 and 61.5 sound match) vs natives 87–98 |
| Swedish | Not separated: natives and SFI learners overlap on both signals. Provisional. |

**Decisions taken from it**

- Raw Azure scores are generous (correct but accented words land at 94–97). Scores are re-anchored per language on the native news distribution (`NATIVE_P10` in `src/lib/levels.ts`), so the slowest tenth of native words reads 92 and 90+ means within the range natives reach. Experts' 9–10 sentences now score 90+, their 7 and below mostly do not.
- Outside en-US, Azure copies the word score onto every sound; those numbers are no longer shown.
- The multilingual phone recogniser (wav2vec2 trained on espeak IPA, Apache-2.0) compares the learner with the native reference voice on the learner's device. Natives match the reference less closely in some languages (regional variety, style), so the match is read against each language's native level (`NATIVE_MATCH` in `src/lib/sound-check.ts`).

## Sources

- [ElevenLabs: Forced Alignment API](https://elevenlabs.io/docs/api-reference/forced-alignment/create) and [capability overview](https://elevenlabs.io/docs/overview/capabilities/forced-alignment)
- [ElevenLabs: Speech to Text (Scribe)](https://elevenlabs.io/docs/eleven-creative/playground/speech-to-text)
- [ElevenLabs: Text to speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)
- [Microsoft: Use pronunciation assessment](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)
- [Microsoft: Speech service release notes (language coverage)](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/releasenotes)
- [Microsoft Q&A: phoneme results outside en-US](https://learn.microsoft.com/en-us/answers/questions/2242726/pronunciation-assessment-not-working-for-languages)
- [Vendor benchmark of phone-level scoring (dev.to)](https://dev.to/fabiosuizu/17mb-vs-12gb-how-a-tiny-model-beats-human-experts-at-pronunciation-scoring-524i)
- [Enhancing GOP in CTC-based mispronunciation detection (arXiv 2506.02080)](https://arxiv.org/html/2506.02080v2)
- [L1-aware multilingual mispronunciation detection (arXiv 2309.07719)](https://arxiv.org/pdf/2309.07719)
- [Universal phone recognition for multilingual speech assessment (arXiv 2601.21205)](https://arxiv.org/pdf/2601.21205)
- [Wav2Vec2Phoneme, Hugging Face docs](https://huggingface.co/transformers/model_doc/wav2vec2_phoneme)
- [Ease and Difficulty in L2 Pronunciation Teaching: A Mini-Review (Frontiers)](https://www.frontiersin.org/articles/10.3389/fcomm.2020.626985/full)
- Witt & Young (2000), *Phone-level pronunciation scoring and assessment for interactive language learning*; Flege (1995), Speech Learning Model; Munro & Derwing (2006) on functional load; Lee, Jang & Plonsky (2015) and Saito (2012) meta-analyses; Thomson (2018) HVPT review; Hardison (2004). These are cited from background knowledge and were not re-read for this document.

Proposals, open decisions and the launch path are collected in [ideas.md](ideas.md).
