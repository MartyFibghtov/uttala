# SayClear marketing plan

Written 2026-11-19 by the marketing agent; edited by the product owner. Budget: 1000 SEK/month paid, organic-first.

## 0. Constraints that shape everything

1. **Free beta before ad spend.** No ad money until Stripe is live and Azure Speech is on the S0 tier (F0 was rate-limited).
2. **Swedish scoring is provisional** (docs/research.md: natives and SFI learners overlap on both signals). Market Swedish as "word-level feedback on what a listener would miss", never "measures how native you sound". English is the best-validated language (Azure vs expert ratings: Pearson 0.71, Spearman 0.81, n=96).
3. **The site is English only.** Swedish ads and keywords need Swedish landing pages or they bounce. A `/sv` site needs native review first.
4. **Prices:** Stripe prices carry SEK and EUR `currency_options` (docs/stripe-launch-checklist.md). Decide Stripe Tax / EU VAT before any Swedish campaign.
5. **Positioning:** intelligibility ("be understood"), not accent removal. The landing hero follows this.
6. **Free-tier cost is real** (each analysis well under 1–2 US cents, 5/day free). Worst case 500 free DAU × 5 × $0.02 ≈ $50/day. `GLOBAL_DAILY_ANALYSES_CAP` caps total daily spend.

**Money math:** 1000 SEK ≈ $100 (at ~9.5–10 SEK/USD — verify). At this budget paid ads are a message-testing instrument, not a growth engine.

## 1. Positioning

### 1.1 ICP segments (ranked by reach × willingness to pay)

| Rank | Segment | Why | Pays? | Risk |
|---|---|---|---|---|
| 1 | Swedish learners in Sweden: professionals/expats first, SFI students via teachers | Founder's local reach; ELSA/BoldVoice are English-only; sj, vowel length, u and pitch-accent guides exist | Pros/expats yes; SFI low (volume + word of mouth) | Swedish scoring unvalidated; English UI |
| 2 | Non-native English speakers who need to be understood at work | Biggest paying market; best-validated language | Yes | Crowded (ELSA, BoldVoice, Speak) |
| 3 | Swedes improving English | Swedish-language SEO ("engelskt uttal", "th-ljudet") likely less contested | Moderate | Small demand — verify volume |
| 4 | Self-directed learners of Spanish, German, Korean, Japanese, Mandarin, Russian… | Per-language long-tail SEO; 17 languages is real breadth | Moderate | Weaker validation |
| 5 | Teachers (SFI, schools, tutors) — a channel, not a buyer | Free classes feature, up to 60 learners per class | No | School GDPR questions (audio never stored helps) |

### 1.2 Core promise

**Say one short sentence. See which words a listener would miss. Drill those words until they land.**

Positioning statement: SayClear helps people who speak a second language be understood by showing, word by word, which parts a listener would miss, then turning the misses into drills.

### 1.3 Competitors (Nov 2026; sources disagree — re-check vendor pages before quoting; never print competitor prices on the site)

| Competitor | Positioning | Price found | How SayClear differs |
|---|---|---|---|
| ELSA Speak | English pronunciation | Premium annual $79.99–$159.99, conflicting ([ToolRadar](https://toolradar.com/tools/elsa-speak/pricing), [Fitgap](https://us.fitgap.com/products/021926/elsa-speak)) | 17 languages, real free tier, "heard as" view, no accent promise |
| BoldVoice | American accent, coach videos | $24.99/mo, $149.99/yr ([SpeakShark](https://speakshark.com/blog/boldvoice-alternatives)) | Plus ≈ half; Pro same price — don't claim "cheaper" for Pro |
| Speechling | Human coach feedback | Free up to 10 sessions/mo; paid from $19.99/mo ([Speechling](https://speechling.com/pricing)) | Instant, high-volume practice; human feedback is better for subtle accent — say so |
| Duolingo | General course | Super SEK 99–119/mo ([Subger](https://subger.com/en/er/service/duolingo-nordic)) | "The speaking practice you add next to Duolingo" |
| Praktika | AI avatar conversation | Conflicting ([blog](https://praktika.ai/blog/how-much-does-it-cost-to-learn-spanish-september-2026), [App Store](https://apps.apple.com/us/app/-/id1624701477)) | Targeted pronunciation vs conversation |

Unverified: which competitors support Swedish; Duolingo Max per-word scoring. No "first/only" claims until checked.

**Defensible claims (from the code):** 17 languages · free plan with 5 analysed recordings/day · audio never stored · classes free for teachers · every result says which check it used · honest about limits (Method page).

## 2. Organic plan

### 2.1 Keyword clusters (volumes unverified — pull from Keyword Planner / Search Console)

| Cluster | Example queries | Target page |
|---|---|---|
| A. Swedish pronunciation (EN) | swedish pronunciation practice, how to pronounce sj sound, swedish vowel length, swedish pitch accent, swedish tongue twisters | `/languages/swedish/sounds/*`, `/languages/swedish` |
| B. Swedish pronunciation (SV) | svenskt uttal, uttala svenska ord, öva uttal svenska, uttalsövningar, sj-ljudet, tungvrickare | future `/sv` pages (after native review) |
| C. English pronunciation (SV) | engelskt uttal, uttala engelska ord, th-ljudet engelska | future `/sv/engelskt-uttal` |
| D. Pronunciation checker (EN) | pronunciation checker, check my pronunciation, free pronunciation test | future `/pronunciation-checker` |
| E. Per-language | spanish pronunciation practice, rolled r practice, mandarin tones practice, korean tense consonants | `/languages/[lang]`, sound pages |
| F. Alternatives | elsa speak alternative, boldvoice alternative | `/alternatives/*` (only after verifying facts) |
| G. Teachers | pronunciation activities for class, SFI uttalsövningar | future `/for-teachers` |

Priority: A, E, B first; D needs a build; C, F later.

### 2.2 Programmatic SEO page map

Shipped in this release: public sound guides `/languages/[lang]/sounds` and `/languages/[lang]/sounds/[sound]` (from `src/lib/sounds.ts`), in the sitemap with structured data.

Next candidates:

| Route | Source | Title example |
|---|---|---|
| `/languages/[lang]/tongue-twisters` | advanced texts in `languages.ts` | Swedish tongue twisters with pronunciation tips |
| `/minimal-pairs/[lang]` | `MINIMAL_PAIRS` | Swedish minimal pairs: hear the difference |
| `/pronunciation-checker` (+ per language) | new no-signup tool (3 takes/IP/day, hard rate limit, counted against the global cap) | Free pronunciation checker: see which words get missed |
| `/sv`, `/sv/uttal/[sound]` | Swedish copy, native-reviewed | Så uttalar du sj-ljudet: guide och övningsord |

Quality rules: no template-only pages — each needs unique substance (common mistakes by first language, minimal pairs, worked example). Index tier-1 pages first (Swedish, English, Spanish); expand after impressions.

### 2.3 Content calendar (weeks 1–12, ~8–10 h/week)

| Week | Site & SEO | Community | Short video | Partners & launch |
|---|---|---|---|---|
| 1 | Search Console, cookieless analytics, UTM capture | Read sub rules; answer questions without links | Record 8 clips in one session | List 20 SFI schools/teachers |
| 2 | Native review of Swedish sound pages | r/learnswedish: answer 5 questions (sj, length, pitch accent) | Post 4 clips | Message 10 SFI teachers |
| 3 | Deepen English + Spanish sound content | One value thread in r/learnswedish | 4 clips incl. before/after | Ask 2–3 mods about sharing a free tool |
| 4 | Build checker tool (or `/for-teachers`) | Intro in 2 expat FB groups with admin permission | 4 clips | Prepare Product Hunt assets |
| 5 | Checker live | Post checker where tools are allowed | 4 clips | Free Plus to 3 YouTube teachers |
| 6 | Tongue-twister pages, all languages | Follow-ups | 4 clips | Directory submissions |
| 7 | German, Korean, Mandarin sound content | 10 more answers | 4 clips | **Product Hunt launch** (Tue–Thu) |
| 8 | Minimal-pair pages; fix titles from Search Console | Show HN / Indie Hackers build story | 4 clips | Feedback from first 5 teachers |
| 9 | `/sv/engelskt-uttal` | r/languagelearning value post | 4 clips | Teacher outreach round 2 |
| 10 | `/alternatives/*` (verified facts only) | Continue | 4 clips | Referral pilot if built |
| 11 | Refresh best page, internal links | Continue | Double down on best format | First class case study |
| 12 | Review traffic/sign-ups by source, prune | | | Plan next 90 days |

### 2.4 Communities

- **r/learnswedish** (best fit): answer sj / vowel length / pitch accent questions plainly; link only when it directly answers; disclose "I built this".
- **r/Svenska** (mostly natives): only the "Swedes learning English" angle.
- **r/languagelearning, r/ESL, r/EnglishLearning:** one value post/month (e.g. data on what a recogniser mishears).
- **Per-language subs** (r/Spanish, r/German, r/Korean, r/LearnJapanese, r/ChineseLanguage, r/russian, r/Polish): sound guides as answers.
- **r/sweden:** don't post.
- Rules: 9 value comments per product mention; always disclose; never cross-post identical text.
- **Facebook** expat / "Swedish for immigrants" groups: ask admins first; offer a free printable sj guide.
- **Discord:** answer in 2–3 existing servers; no own server until ~200 active users.

### 2.5 Short-form video (4/week, one master clip → TikTok, Reels, Shorts)

Formats: tongue-twister score · before/after (take 1 vs take 4, real scores) · "heard as" screen recording · one sound in 20 s (from `sounds.ts`) · minimal-pair quiz (glas/glass) · teacher/learner reaction (written consent only). Present scores as "what the app measured". Check ElevenLabs terms before using reference voices in marketing video.

### 2.6 Partnerships

- **SFI schools/teachers:** "Free class code; you see each learner's weekly points, recordings, average and last active day; recordings are never stored." Ask for a one-class pilot; have a one-page privacy summary ready.
- **Tutors:** free Plus for honest feedback + a class code.
- **YouTubers** (Swedish-learning, 5k–50k subs): free Plus/Pro, no scripted review, no payment at this stage.

### 2.7 Product Hunt & directories (after ≥20 real users)

- [ ] Fast demo path (checker tool, or sign-up → first result in 2 minutes)
- [ ] 3 screenshots + 30–45 s demo video
- [ ] Tagline ≤60 chars: "See which words a listener would miss"
- [ ] Maker comment incl. what it cannot do
- [ ] 10–20 real users asked for honest comments (no voting rings)
- [ ] Directories: AlternativeTo, There's An AI For That, Futurepedia, Toolify, BetaList, Uneed, Indie Hackers; Capterra/G2 once there are reviews
- [ ] Show HN only with a technical story ("pronunciation scoring that never stores audio")
- [ ] Privacy/terms reviewed

### 2.8 Referral (not built)

Each invite gives both people +5 analysed recordings/day for 30 days (≤ ~10 cents/user/day). Plus a shareable result card (coloured words + score, no audio). Only after activation > 40%.

## 3. Paid plan: 1000 SEK/month

### 3.1 What it buys

Assumed Swedish long-tail CPC 6–15 SEK (unverified estimate). 600 SEK ≈ 60 clicks ≈ 6 sign-ups ≈ under one payer. Value per sign-up ≈ 15 SEK at 3% conversion. **Paid acquisition will not pay back at this scale — use it to learn which message and keyword convert.**

### 3.2 Split

| Channel | SEK/mo | Purpose | Start |
|---|---|---|---|
| Google Search (Swedish + English long-tail) | 600 (20/day) | Sign-up rate per keyword/message | After Stripe live + Azure S0 |
| Reddit promoted posts (subreddit targeting) | 250 | Test the community message | Week 3+ (check minimum daily budget) |
| Meta (Instagram) | 150 | Month 2: retarget if audience ≥500/30 days, else boost best organic Reel in Sweden | Month 2 |

Consent: ad pixels need a cookie-consent banner in Sweden. Use cookieless analytics (Plausible/Umami) + first-party UTM capture; add pixels only with consent, otherwise move the 150 SEK to Google.

### 3.3 Google Search setup

- Location: Sweden, presence only. Phrase + exact match only.
- **Campaign A (Swedish; landing `/languages/swedish` until `/sv` exists):** "svenskt uttal", "öva svenska uttal", "uttala svenska ord", "uttalsövningar svenska", "sj-ljudet".
- **Campaign B (English; landing `/languages/swedish`):** "swedish pronunciation practice", "learn swedish pronunciation", "swedish pronunciation app", "swedish accent training".
- Negatives: translator, translate, google translate, forvo, lyrics, names, ikea, jobb, gratis ljud; single-word "how to pronounce X".
- Low-volume keywords won't serve — move that effort to SEO.
- Bidding: manual CPC or max clicks capped at 15 SEK. No target CPA under 30 conversions.

### 3.4 KPIs and kill/scale rules (judge nothing before 50 clicks/campaign)

| Metric | Expected | Action |
|---|---|---|
| Search CTR | ≥3% | <2% after 30 clicks: rewrite headlines |
| Landing → sign-up | 8–15% | <5% after 25 clicks: fix the landing page |
| Cost per sign-up | 60–120 SEK | >150 SEK after 3 weeks: pause ad group |
| Sign-up → activated | ≥40% | <25%: fix the first minute, pause spend |
| Cost per activated user | <250 SEK | Scale only below 100 SEK |

Scale: cost per sign-up <60 SEK and activation ≥40% for two weeks → shift budget to the winner. Don't raise the total until organic payers cover it. Kill: keyword with ≥20 clicks and no sign-up → negative.

## 4. Funnel & metrics

Funnel: visit → try/sign up → first analysed recording → **activated** → returns D2–7 → natural limit → trial → paid.

**Activated** = within 24 h of sign-up, two analysed recordings and at least one word detail opened. Leading indicator: first analysis within 10 min of sign-up.

| Step | Target (assumption; revise after 200 sign-ups) |
|---|---|
| Visit → sign-up | 3–5% |
| Visit → try (checker) | 10–20% |
| Sign-up → activated | 40–50% |
| Activated → week-1 return | 30% |
| Sign-up → paid by day 30 | 2–3% (stretch 5%) |
| Trial → paid | 35–50% |

### Honest upsell moments (never before the first result)

1. Daily limit reached: "You've used today's 5. They reset at [local time], or Plus gives you 60 a day."
2. Rhythm & melody chart (Plus): offered when clicked, no nagging.
3. Drill list full (5 words): "Your list keeps your 5 weakest. Plus keeps them all."
4. Own texts (Plus): strongest professional trigger.
5. Voice choice (Plus): low priority.
6. Pro: only after a plateau (e.g. 10+ takes with the same word still flagged).
7. Trial reminder: Stripe's trial-ending email before the charge, with how to cancel.

### Events to instrument (capture UTM/referrer on first landing; attach to sign-up server-side)

UTM: `utm_source` google|reddit|tiktok|instagram|youtube|producthunt|teacher|directory · `utm_medium` cpc|organic_social|community|referral|email · `utm_campaign` e.g. `sv-uttal-search` · `utm_content` variant · `utm_term` keyword.

| Group | Events |
|---|---|
| Acquisition | page_view, cta_click, tool_try_started, tool_result_viewed, signup_started, sign_up_completed (method, UTM) |
| Setup | language_selected, level_selected, first_recording_started |
| Activation | first_analysis_completed, word_detail_opened, word_replayed, retry_take, activated |
| Habit | drill_started, drill_graduated, daily_goal_met, streak_day, sound_check_used |
| Upsell | limit_reached, drill_cap_hit, locked_feature_clicked, upsell_viewed, upsell_clicked, pricing_viewed |
| Revenue | checkout_started, trial_started, trial_converted, plan_changed, subscription_canceled (reason) |
| Community | class_created, class_joined, league_opted_in, reminder_opted_in |
| Derived | D1/D7/D30 retention, cost per analysis by language, free-tier spend per active user |

## 5. 30/60/90 days

- **Days 1–30 (beta):** deploy, Azure S0, analytics + UTM, native review of Swedish sound pages, 20–50 beta learners (r/learnswedish, expat groups, teachers), 16 videos, 10 SFI teachers. Goal: 100–200 sign-ups, 5 user conversations. No ad spend.
- **Days 31–60 (prove one channel):** Stripe live, Resend, company details, tax decision. Checker tool. Google 600 SEK + Reddit 250 SEK with consent handled. Product Hunt week 7–8. Native-listener rating round for Swedish (~$100–300). Goal: 400–800 cumulative sign-ups, first payers.
- **Days 61–90 (double down):** cut the worst channel/pages, referral pilot if activation >40%, teacher case study, decide on a Swedish UI by where users come from. Goal: 600–1,500 sign-ups, 250–600 activated, 10–30 payers (targets, not forecasts).

## 6. Copy

Swedish copy needs native review before use.

### Hero variants

EN:
1. **Find the words a listener would miss. Then fix them.** — Read one short sentence aloud. SayClear marks every word by how clearly it came through, then turns the weak ones into drills. *(live)*
2. **Swedish pronunciation practice, one short sentence at a time.** — Record yourself, see which words a listener would miss, and drill the sj sound, long and short vowels and pitch accent.
3. **Be easy to understand in your second language.** — Word-by-word feedback in 17 languages. On Plus, rhythm and melody compared with a native voice.

SV:
1. **Se vilka ord en lyssnare skulle missa. Öva dem sedan.** — Läs en kort mening högt. SayClear markerar varje ord efter hur tydligt det hördes och gör de svaga orden till övningar.
2. **Öva svenskt uttal, en kort mening i taget.** — Spela in dig själv, se vilka ord som inte kom fram och öva sj-ljudet, långa och korta vokaler och tonaccenten tills de sitter.
3. **Bli lätt att förstå på ditt andra språk.** — Ord-för-ord-feedback på 17 språk. Gratis att börja, inget kort.

### Google responsive search ads (headline ≤30, description ≤90 — verify in the editor)

1. **SV "svenskt uttal":** H: Öva svenskt uttal · Se vilka ord som missas · Gratis att börja. D: Läs en kort mening högt och se vilka ord en lyssnare skulle missa. 17 språk. · Orden du missar blir träningslistor. Spela in, få svar, öva igen. Gratis plan.
2. **EN Swedish learners:** H: Swedish Pronunciation Practice · Practise the Swedish sj Sound · See Which Words Get Missed. D: Say one short Swedish sentence. See which words a listener would miss. Free to start. · Drills built from your own mistakes. Word by word feedback, no card needed.
3. **EN work:** H: Be Understood at Work · Word-by-Word Feedback · Free Plan, No Card Needed. D: Say a sentence, see which words a listener would mishear, then drill them. Free to start. · On Plus, paste your own presentation and practise it one sentence at a time.
4. **SV words:** H: Uttala svenska ord rätt · Öva sj-ljudet · Prova gratis i 2 minuter. D: Säg en kort mening och se vilka ord som inte kom fram. Guide till sj-ljudet. · Gratis plan, inget kort. Dina svåra ord samlas i en träningslista du kan öva på.
5. **EN generic:** H: Pronunciation Practice App · 17 Languages, One Short Take · Hear What a Listener Hears. D: Read a short sentence aloud. Get word-by-word feedback and a drill list. Free to start. · Spanish, German, Korean, Swedish and 13 more. Start with the sounds learners get wrong.

"No card needed" refers to the free plan; the paid trial collects a card.

### TikTok hooks (real recordings and scores only)

1. "I scored 61 on this Swedish tongue twister. Can you beat it?"
2. "The app heard 'Thursday' as something else. Here's the one sound I was missing."
3. "If you can't hear the difference between these two Swedish words, your mouth can't say it either." (glas / glass)
4. "Your accent isn't the problem. These three words are."
5. "One Swedish sentence. Every word scored. Which one am I failing?"

## Open items for the founder

1. Pull real search volumes/CPC (Keyword Planner, Search Console).
2. Re-check competitor prices on their own pages before any public use.
3. Native Swedish review of all Swedish copy and sound guides.
4. Decide whether to build the free checker tool before day 30.
5. Check ElevenLabs terms for reference voices in marketing video.
