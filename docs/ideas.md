# Ideas and open decisions

Everything proposed so far, with the reasoning and the evidence behind it. Validation numbers live in
[research.md](research.md). Last updated 2026-11-15.

## 1. What the scoring can and cannot tell

- The engines (Azure Pronunciation Assessment, ElevenLabs Scribe and alignment, the on-device phone
  recogniser) judge whether each word and sound **landed in the right category**. They do not measure how
  far inside the category a sound is: vowel colour, consonant softness, timing, melody, voice placement.
- So the stack separates **clear from unclear** speech well, but cannot separate **clear-with-an-accent
  from native**, especially on short, easy phrases. Example (2026-11-15, the lab page): a non-Spanish speaker
  scored 96 engine-only and 96% raw sound match on "¿Dónde está la estación?".
- "Native-like" in the current wording means "every word we checked matched a native speaker", not "no
  listener would hear an accent". Only native listener ratings can confirm the latter.

## 2. Product direction: professional clarity as the default

Recommended. Build the product around clear, confident, accented professional speech instead of
accentlessness.

Why:
- Research (Munro & Derwing; Levis, the "intelligibility principle"): accent and intelligibility are
  separate; listeners and employers judge how easy you are to follow.
- It is what the engines measure reliably.
- Bigger, paying market: engineers, doctors, sales, job-seekers (meetings, presentations, interviews,
  calls). Competitors (BoldVoice, ELSA) sell "sound American"; clarity is a differentiator.
- A reachable goal keeps subscribers; full accentlessness is rare for adults and demotivates.

What would change:
1. **Anchor the top of the scale on fluent accented professionals** (TED talks, conference talks, earnings
   calls from YouTube) instead of newsreaders. The existing `scripts/realset.mts` pipeline can harvest and
   calibrate them.
2. **Weight errors by meaning risk (functional load).** Heavy: contrasts that change meaning (l/r, i/ɪ,
   v/w), dropped word endings. Light or ignored: harmless accent traits (a non-English r, slight vowel
   colour).
3. **Raise word stress and rhythm again.** They drive comprehensibility more than single vowels; this
   reverses the earlier sounds-first weighting for the clarity mode.
4. **Bands:** 90–100 Effortless to understand · 75–89 Clear, noticeable accent · 60–74 Understood with
   effort · below 60 Often misunderstood.
5. **Feedback in terms of risk:** "this could be heard as *right* instead of *light*"; drills target the
   highest-risk errors first.
6. **Work-scenario content:** stand-ups, presentations, interviews, phone calls.

## 3. Native-like as an optional stricter mode

- Same score scale, extra checks for accent traits (the on-device sound check, later GOP, see §4).
- Running cost is close to zero: the model runs on the device and downloads from Hugging Face (not our
  bandwidth). The only per-use cost is the native reference TTS (about 0.5–1 cent per sentence), usually
  already generated for "listen"; library sentences could be cached once for all users (not verified
  whether the server caches it today).
- Cost to the learner: one-time 240 MB download, 3–10 s extra per result, battery; low-end phones untested.
- Cost to us: per-language calibration for two modes, more testing and support, and the credibility
  risk until native listeners validate it (about 100 clips rated, roughly $100–300 on a rating platform).

## 4. Next scoring upgrade: goodness of pronunciation (GOP)

The current sound check decodes the nearest sound per frame (greedy CTC) and compares sequences, so a
slightly accented vowel still reads as the right vowel. GOP instead forces the native sound sequence onto
the learner's audio and scores the model's confidence in each expected sound against its best competitor.
A sound that is "e, but Russian-coloured" gets lower confidence.

- Same model (`onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX`), no API cost, on device.
- Plan: implement CTC forced alignment over the learner's logits, per-sound GOP, calibrate on the realset
  (natives vs learners per language, plus short read sentences), then show it as a third column in `/lab`.
- Risk: may still be too coarse in Spanish and Swedish; the calibration run decides before anyone tests.

## 5. Calibration fixes

- **Native anchors come from news speech** (long, fast). Short read phrases match the reference closely for
  everyone, so anchors are needed for read sentences too (TTS voices other than the reference voice, or
  read-aloud recordings of natives).
- **Fixed 2026-11-15:** the sound check could raise the sentence score when the match beat the native
  median. It now only holds or lowers it (`src/lib/sound-check.ts`).
- **Swedish:** natives and learners do not separate yet; needs real learner recordings or native ratings.
- **Spanish:** only one real learner in the set; needs more.
- **Spontaneous speech** is graded leniently (transcript-based); keep scripted reading for scores.
- **Native listener ratings** are the only way to confirm where 90 sits. About 5 natives × 100 clips.

## 6. Launch path

Status: free beta possible within days; not ready for a paid launch.

Blockers:
- Nothing since the first deploy is committed or deployed.
- Azure is on the free F0 tier and already returned "number of parallel requests exceeded"; upgrade to S0.
- Stripe, Resend (email), CRON_SECRET and company details are not set up.
- The precise sound check has been tested only on desktop Chrome through `/lab`; Safari and phones are
  untested.
- `.env.prod` holds production secrets on disk; delete it, never commit it.

Suggested order:
1. Commit and deploy; upgrade Azure; test the sound check in Chrome and Safari.
2. Free beta, 20–50 learners, English first (German and Russian next; other languages marked beta).
3. Native listener ratings during the beta.
4. Paid launch: Stripe, Resend, company details.

## 7. Tools built for this

- `npm run realset` — harvests native and learner clips from YouTube (kept local in `.data/`, never
  committed) plus speechocean762, and scores them with the app's own pipeline.
- `npm run phonecheck` — runs the on-device sound check on the same clips against TTS references.
- `/lab` — records once and shows engine-only next to engine + sound check, word by word.
- Evaluation API spend so far is about $1–3 of ElevenLabs (transcription and TTS); Azure stayed within the
  free tier. All results are cached, so reruns only pay for new clips.
