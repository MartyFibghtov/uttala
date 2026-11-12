/**
 * The sound library: the sounds learners most often get wrong in each
 * language, with how to make them, what usually goes wrong, and words to
 * practise. English is covered broadly; other languages list their signature
 * difficulties. Ordered roughly by how much each one matters for being understood.
 */

export type SoundKind = "vowel" | "consonant" | "melody";

export interface Sound {
  /** URL-safe identifier, unique across languages. */
  id: string;
  lang: string;
  /** IPA symbol, or a short label for tones and rhythm. */
  symbol: string;
  name: string;
  kind: SoundKind;
  /** How to produce it. */
  how: string;
  /** The usual mistake and how to notice it. */
  watch: string;
  /** Practice words, easiest first. */
  words: string[];
}

type Row = [slug: string, symbol: string, name: string, kind: SoundKind, how: string, watch: string, words: string[]];

const v: SoundKind = "vowel";
const c: SoundKind = "consonant";
const m: SoundKind = "melody";

const ROWS: Record<string, Row[]> = {
  en: [
    ["th", "θ", "Voiceless th", c, "Put the tip of your tongue lightly between your teeth and blow air over it. No voice.", "It turns into /s/, /t/ or /f/. If your tongue stays behind your teeth, it is not th yet.", ["think", "three", "thank", "bath", "month"]],
    ["dh", "ð", "Voiced th", c, "Same tongue position as in “think”, but switch your voice on. You should feel a buzz on the tongue tip.", "It turns into /d/ or /z/. Slow down on small words like “the” and “this”, where it hides.", ["this", "that", "mother", "weather", "breathe"]],
    ["r", "ɹ", "English r", c, "Curl the tongue tip up and back without touching anything, and round your lips a little. The tongue never taps or trills.", "A tapped or rolled r, or one made in the throat. Hold the sound: if you can sustain it like a vowel, it is right.", ["red", "right", "very", "around", "car"]],
    ["l", "l", "Light and dark l", c, "Touch the tongue tip to the ridge behind your top teeth and let air pass round the sides. At the end of a word, also pull the back of the tongue up.", "Confusing it with r, or dropping it at the end of words like “feel”.", ["light", "really", "feel", "world", "little"]],
    ["ih", "ɪ", "Short i", v, "A short, relaxed sound between “ee” and “eh”. Jaw slightly open, lips loose, no smile.", "It becomes “ee”, so “ship” sounds like “sheep”. Keep it short and lazy.", ["ship", "sit", "big", "busy", "women"]],
    ["ee", "iː", "Long ee", v, "Spread your lips as if smiling, tongue high and forward, and hold the sound.", "Too short, so “leave” sounds like “live”. Give it length.", ["sheep", "seat", "leave", "people", "key"]],
    ["ae", "æ", "Flat a", v, "Open your jaw wide and spread your lips; the tongue stays low and forward.", "It closes into “e”, so “bad” sounds like “bed”. Drop the jaw further than feels natural.", ["cat", "bad", "happy", "black", "apple"]],
    ["uh", "ʌ", "Short u", v, "A short, central sound with a relaxed, half-open mouth. Lips are not rounded.", "It becomes “a” or “o”. “Cut” should not rhyme with “cat” or “cot”.", ["cup", "but", "money", "love", "enough"]],
    ["schwa", "ə", "Schwa", v, "The weakest sound in English: very short, mouth barely open, tongue at rest. It only appears in unstressed syllables.", "Giving unstressed vowels their full written value. English rhythm depends on shrinking them.", ["about", "banana", "today", "sofa", "problem"]],
    ["er", "ɜː", "Stressed er", v, "Tongue in the middle of the mouth, lips neutral, held long. In American English the tongue also curls for r.", "Replacing it with “or” or “ar”, so “work” sounds like “walk”.", ["bird", "work", "word", "learn", "girl"]],
    ["oo", "ʊ", "Short oo", v, "Short and relaxed with lightly rounded lips, the tongue high but not tense.", "It becomes long “oo”, so “full” sounds like “fool”.", ["book", "good", "put", "could", "woman"]],
    ["uu", "uː", "Long oo", v, "Round your lips tightly and hold the sound, tongue high and back.", "Too short or not rounded enough.", ["food", "blue", "move", "school", "two"]],
    ["aw", "ɔː", "Open o", v, "Jaw open, lips rounded, held long.", "Mixing it with the “oh” diphthong: “caught” is not “coat”.", ["law", "thought", "call", "door", "walk"]],
    ["ei", "eɪ", "Long a", v, "Start at “e” and glide up towards “ee”. Two positions in one syllable.", "Saying a single flat “e”, so “late” sounds like “let”.", ["day", "late", "rain", "great", "eight"]],
    ["ou", "oʊ", "Long o", v, "Start at a mid “o” and glide towards “oo”, rounding the lips as you go.", "A single pure “o” with no glide.", ["go", "home", "road", "know", "though"]],
    ["ai", "aɪ", "Long i", v, "Start with an open “ah” and glide up to “ee”.", "Cutting the glide short before voiceless consonants, as in “like” and “right”.", ["time", "like", "my", "right", "buy"]],
    ["v", "v", "v", c, "Rest your top teeth on your bottom lip and let voiced air buzz through.", "It becomes /b/ or /w/. The lips never close fully and never round.", ["very", "voice", "seven", "love", "have"]],
    ["w", "w", "w", c, "Round your lips tightly as for “oo”, then release quickly into the next vowel. The teeth are not involved.", "It becomes /v/, so “wine” sounds like “vine”.", ["we", "water", "away", "quick", "one"]],
    ["ng", "ŋ", "ng", c, "Raise the back of the tongue to the soft palate and send the sound through your nose. There is no g at the end.", "Adding a hard /g/ or /k/, or replacing it with /n/.", ["sing", "long", "thing", "singer", "going"]],
    ["h", "h", "h", c, "Just breath, shaped like the vowel that follows. Nothing in the mouth makes friction.", "Dropping it, or making a rough sound in the throat.", ["he", "house", "happy", "behind", "who"]],
    ["sh", "ʃ", "sh", c, "Pull the tongue back a little from the /s/ position and push your lips forward.", "It stays too close to /s/. Round the lips to darken it.", ["she", "shop", "station", "sure", "wash"]],
    ["ch", "tʃ", "ch", c, "Start as /t/ and release into “sh” in one movement.", "Releasing it as plain “sh”, so “chip” sounds like “ship”.", ["chair", "cheap", "watch", "much", "nature"]],
    ["j", "dʒ", "j", c, "The voiced partner of “ch”: start as /d/ and release into the sound in “vision”.", "It loses its stop and becomes “zh” or “y”.", ["job", "just", "age", "bridge", "energy"]],
    ["z", "z", "z", c, "The same position as /s/ with your voice switched on.", "Devoicing it at the end of words: “eyes” becomes “ice”.", ["zoo", "easy", "busy", "eyes", "because"]],
    ["ptk", "pʰ", "Puffed p, t, k", c, "At the start of a stressed syllable, release /p/, /t/ and /k/ with a small burst of air. Hold a hand in front of your mouth to feel it.", "No puff of air, so “pat” is heard as “bat”.", ["pen", "time", "come", "paper", "take"]],
    ["final", "d̚", "Final consonants", c, "Finish the word: keep the voice on through final /b/, /d/, /g/ and keep the vowel before them long.", "Dropping or devoicing the last sound, so “bed” is heard as “bet”.", ["bed", "bag", "need", "job", "five"]],
    ["stress", "ˈ", "Word stress", m, "One syllable in each word is longer, louder and higher. The others shrink, often to schwa.", "Giving every syllable the same weight, or stressing the wrong one.", ["photograph", "photography", "important", "comfortable", "develop"]],
  ],
  es: [
    ["rr", "r", "Rolled rr", c, "Rest the tongue tip loosely on the ridge behind your top teeth and push air so that it flutters several times.", "A single tap, an English r, or a throat sound. Start from “tr” and “dr” words, where it is easiest.", ["perro", "carro", "rojo", "tierra", "rápido"]],
    ["r", "ɾ", "Tapped r", c, "One quick flick of the tongue tip against the ridge, like the middle sound of American “water”.", "Holding it like an English r. It should take no time at all.", ["pero", "caro", "tres", "ahora", "hablar"]],
    ["vowels", "a e i o u", "Five pure vowels", v, "Each vowel has one fixed quality and never glides. Unstressed vowels keep their full sound.", "Sliding “o” into “ou” and “e” into “ei”, or weakening unstressed vowels.", ["mesa", "todo", "bonito", "chocolate", "universidad"]],
    ["bv", "β", "Soft b, d, g", c, "Between vowels the lips or tongue only approach each other and never close fully.", "Hard stops in the middle of words. “Nada” should sound almost like English “nah-tha”.", ["nada", "cada", "saber", "lago", "abogado"]],
    ["j", "x", "Jota", c, "Friction at the back of the mouth, where you make /k/, without stopping the air.", "A soft English h, or a hard /k/.", ["jamón", "gente", "trabajo", "mujer", "hijo"]],
  ],
  fr: [
    ["u", "y", "French u", v, "Say “ee” and, without moving your tongue, round your lips tightly.", "It becomes “oo”, so “rue” sounds like “roue”.", ["tu", "rue", "salut", "musique", "bureau"]],
    ["nasals", "ɑ̃ ɛ̃ ɔ̃", "Nasal vowels", v, "Let air pass through the nose while you say the vowel. The n or m that follows in spelling is not pronounced.", "Adding a clear /n/ after the vowel, or merging the three nasals.", ["vin", "vent", "bon", "enfant", "demain"]],
    ["r", "ʁ", "French r", c, "Friction at the very back of the mouth, near where you gargle. The tongue tip stays down behind the bottom teeth.", "Using a tongue-tip r.", ["rouge", "Paris", "merci", "très", "regarder"]],
    ["eu", "ø œ", "Rounded eu", v, "Say “é” or “è” and round your lips without moving your tongue.", "Replacing it with “oo” or “e”.", ["deux", "peu", "heure", "sœur", "bleu"]],
    ["liaison", "‿", "Even rhythm", m, "Every syllable gets about the same length, and the last syllable of each group is slightly longer. Final consonants link to a following vowel.", "English-style strong and weak syllables.", ["les amis", "vous avez", "comment allez-vous", "un petit enfant"]],
  ],
  de: [
    ["ich", "ç", "ich-sound", c, "Whisper a long “y” as in “yes”: the middle of the tongue is close to the hard palate.", "It becomes “sh” or “k”.", ["ich", "nicht", "Milch", "möchte", "sprechen"]],
    ["ach", "x", "ach-sound", c, "Friction at the back of the mouth after a, o and u, without stopping the air.", "A hard /k/.", ["Buch", "auch", "acht", "machen", "Nacht"]],
    ["ue", "yː ʏ", "ü", v, "Say “ee” and round your lips without moving your tongue.", "It becomes “oo”: “für” is not “fuhr”.", ["für", "über", "Tür", "müde", "fünf"]],
    ["oe", "øː œ", "ö", v, "Say “e” as in “Tee” and round your lips.", "Replacing it with “o” or “e”.", ["schön", "hören", "möchte", "zwölf", "Öl"]],
    ["final", "t", "Final devoicing", c, "At the end of a word, b, d and g are pronounced as p, t and k.", "Voicing them as in English.", ["Tag", "Hund", "gelb", "Abend", "Weg"]],
  ],
  it: [
    ["double", "tt", "Double consonants", c, "Hold the consonant for about twice as long, and keep the vowel before it short.", "Saying it single: “sette” becomes “sete”.", ["sette", "nonno", "palla", "bello", "troppo"]],
    ["r", "r", "Rolled r", c, "The tongue tip flutters against the ridge behind the top teeth: once for single r, several times for rr.", "An English r.", ["Roma", "caro", "carro", "grazie", "arrivederci"]],
    ["gli", "ʎ", "gli", c, "Press the middle of the tongue flat against the palate and let air pass round the sides.", "Saying “gl” or plain “l”.", ["famiglia", "figlio", "meglio", "aglio", "voglio"]],
    ["gn", "ɲ", "gn", c, "The whole front of the tongue touches the palate, like “ny” in one sound.", "Saying “g” then “n”.", ["gnocchi", "bagno", "signora", "ogni", "sogno"]],
  ],
  pt: [
    ["nasal", "ɐ̃ õ", "Nasal vowels", v, "Let air through the nose during the vowel. In “ão” the nasal sound glides towards “w”.", "Adding a full /n/ or /m/ after the vowel.", ["pão", "não", "mãe", "bem", "coração"]],
    ["rr", "ʁ", "Strong r", c, "At the start of a word and when written rr, the r is made in the throat, close to an English h.", "A tongue-tip r.", ["rio", "carro", "rua", "Brasil", "correr"]],
    ["lh", "ʎ", "lh", c, "Press the middle of the tongue against the palate, like “ly” in one sound.", "Plain “l”.", ["filho", "trabalho", "olho", "mulher", "melhor"]],
    ["open", "ɛ ɔ", "Open and closed e, o", v, "Portuguese has two e sounds and two o sounds. The open ones need a lower jaw.", "Using one middle value for both: “avó” and “avô” are different words.", ["avó", "avô", "café", "você", "porta"]],
  ],
  nl: [
    ["g", "x", "Dutch g", c, "Friction at the back of the mouth, like clearing your throat softly.", "A hard English g.", ["goed", "graag", "gezellig", "morgen", "dag"]],
    ["ui", "œy", "ui", v, "Start with rounded lips on a sound like “u” in “fur” and glide towards “ü”.", "Saying “ow” or “oy”.", ["huis", "uit", "tuin", "buiten", "ruim"]],
    ["long", "aː ɑ", "Long and short vowels", v, "Doubled vowels are long and tense; single ones in closed syllables are short.", "The same length for both: “man” is not “maan”.", ["man", "maan", "bom", "boom", "zon"]],
    ["sch", "sx", "sch", c, "An /s/ followed directly by the Dutch g.", "Saying “sh” or “sk”.", ["school", "schip", "schrijven", "misschien"]],
  ],
  sv: [
    ["sj", "ɧ", "sj-sound", c, "Round your lips and blow, with friction further back than in English “sh”.", "A plain “sh”.", ["sju", "sjuk", "station", "stjärna", "skjorta"]],
    ["length", "ː", "Long and short", v, "Every stressed syllable is long: either a long vowel, or a short vowel followed by a long consonant.", "Equal lengths: “glas” is not “glass”.", ["glas", "glass", "vit", "vitt", "tak"]],
    ["u", "ʉː", "Swedish u", v, "Start from “ee”, then pout your lips forward tightly.", "Saying “oo”.", ["hus", "du", "nu", "sju", "ute"]],
    ["pitch", "˥˩", "Pitch accent", m, "Many two-syllable words carry a second rise in pitch. It is what gives Swedish its sing-song tune.", "A flat English stress pattern.", ["flicka", "tala", "komma", "anden"]],
  ],
  pl: [
    ["sz", "ʂ ɕ", "sz and ś", c, "For sz, cz and ż the tongue tip pulls back and the sound is dark. For ś, ć and ź the middle of the tongue rises and the sound is bright.", "Using one English “sh” for both series.", ["szkoła", "siedem", "cześć", "życie", "źle"]],
    ["y", "ɨ", "y", v, "Say “i” as in “sit” and pull the tongue back slightly, lips relaxed.", "Saying “ee”: “być” is not “bić”.", ["być", "ty", "my", "dobry", "syn"]],
    ["nasal", "ɛ̃ ɔ̃", "ę and ą", v, "A nasal “e” and a nasal “o”. Before a stop they sound like en, em, on, om.", "A plain vowel.", ["są", "mąż", "język", "ręka", "dziękuję"]],
    ["clusters", "ʂtʂ", "Consonant clusters", c, "Say every consonant, but do not add vowels between them. Build the cluster one sound at a time.", "Inserting extra vowels.", ["chrząszcz", "wszystko", "szczęście", "przepraszam"]],
  ],
  uk: [
    ["h", "ɦ", "г", c, "A voiced, breathy sound in the throat, softer than English h. It is not /g/.", "Saying a hard /g/.", ["гарно", "голова", "багато", "дорога"]],
    ["y", "ɪ", "и and і", v, "и is like the vowel in “sit”; і is like “ee”. They distinguish words.", "Using “ee” for both.", ["кит", "кіт", "лис", "ліс", "ми"]],
    ["soft", "ʲ", "Soft consonants", c, "Raise the middle of the tongue towards the palate while making the consonant.", "A hard consonant followed by a separate “y”.", ["день", "сіль", "кінь", "дякую", "вчитель"]],
    ["voiced", "b d", "Voiced endings", c, "Final б, д, г, з stay voiced. They are not devoiced as in Russian or German.", "Devoicing: “гриб” is not “грип”.", ["гриб", "сад", "мороз", "дуб"]],
  ],
  ru: [
    ["soft", "ʲ", "Hard and soft consonants", c, "For a soft consonant, raise the middle of the tongue towards the palate as if saying “y” at the same moment.", "A hard consonant followed by a separate “y”: “мать” is not “мат”.", ["мать", "брать", "день", "соль", "семь"]],
    ["y", "ɨ", "ы", v, "Say “ee”, then pull the whole tongue back without rounding the lips.", "Saying “ee”: “был” is not “бил”.", ["ты", "мы", "был", "сын", "рыба"]],
    ["reduce", "ɐ ə", "Vowel reduction", v, "Unstressed о sounds like a; unstressed е sounds like a short и. Only the stressed vowel has its full value.", "Reading every о as o.", ["молоко", "хорошо", "спасибо", "говорить", "телефон"]],
    ["r", "r", "Rolled р", c, "The tongue tip flutters against the ridge behind the top teeth.", "An English r.", ["рука", "работа", "три", "город", "хорошо"]],
  ],
  tr: [
    ["i", "ɯ", "Undotted ı", v, "Say “oo” and spread your lips flat without moving the tongue.", "Saying “i”: “kır” is not “kir”.", ["kız", "sıcak", "ılık", "balık", "kapı"]],
    ["o", "ø y", "ö and ü", v, "Say “e” or “i” and round your lips.", "Saying “o” and “u”.", ["göz", "gün", "dört", "üç", "güzel"]],
    ["g", "ɰ", "Soft ğ", c, "It has no sound of its own: it lengthens the vowel before it.", "Pronouncing a hard g.", ["dağ", "değil", "öğrenci", "yağmur", "soğuk"]],
    ["r", "ɾ", "Tapped r", c, "One quick flick of the tongue tip. At the end of a word it is often whispered.", "An English r.", ["bir", "var", "merhaba", "teşekkürler"]],
  ],
  ja: [
    ["long", "ː", "Long vowels", v, "A long vowel lasts two beats instead of one. Nothing else changes.", "Saying it short: “おばあさん” becomes “おばさん”.", ["おばあさん", "ビール", "とうきょう", "せんせい", "コーヒー"]],
    ["small-tsu", "っ", "Double consonants", c, "Stop for one full beat of silence before the consonant.", "Skipping the pause: “きって” becomes “きて”.", ["きって", "ざっし", "がっこう", "ちょっと", "いっぱい"]],
    ["r", "ɾ", "Japanese r", c, "A light tap of the tongue tip behind the top teeth, between English r, l and d.", "A full English r or l.", ["らいねん", "りんご", "ありがとう", "くるま", "これ"]],
    ["pitch", "˥˩", "Pitch accent", m, "Japanese words have a pattern of high and low beats rather than a stressed syllable. Keep every beat the same length.", "English-style stress that stretches one syllable.", ["はし", "あめ", "にほん", "ありがとう"]],
    ["fu", "ɸ", "ふ", c, "Blow gently between both lips, as if cooling soup. The teeth do not touch the lip.", "An English f.", ["ふじさん", "ふゆ", "おふろ", "さいふ"]],
  ],
  zh: [
    ["tones", "˥ ˧˥ ˨˩˦ ˥˩", "Four tones", m, "First: high and level. Second: rising. Third: low, dipping. Fourth: sharp fall. The tone is part of the word.", "Flattening tones, or letting sentence intonation override them.", ["妈", "麻", "马", "骂", "你好"]],
    ["retroflex", "ʈʂ ʂ", "zh, ch, sh", c, "Curl the tongue tip up and back towards the roof of the mouth.", "Saying z, c, s: “是” is not “四”.", ["是", "知道", "吃", "上", "中国"]],
    ["palatal", "tɕ ɕ", "j, q, x", c, "Keep the tongue tip down behind the bottom teeth and raise the middle of the tongue. Lips are spread.", "English “j”, “ch” and “sh” with rounded lips.", ["谢谢", "七", "小", "请", "几"]],
    ["u", "y", "ü", v, "Say “ee” and round your lips without moving the tongue.", "Saying “oo”: “女” is not “怒”.", ["女", "去", "鱼", "绿", "学"]],
    ["aspiration", "pʰ p", "Puffed and plain", c, "p, t, k, q, ch, c carry a strong puff of air; b, d, g, j, zh, z have none. Neither series is voiced.", "Using English voicing instead of the puff.", ["爸", "怕", "大", "他", "哥"]],
  ],
  ko: [
    ["three", "p pʰ p͈", "Plain, puffed, tense", c, "Korean stops come in three kinds: plain (lightly breathy), aspirated (a strong puff) and tense (tight, no air at all).", "Only two kinds, as in English: “불”, “풀” and “뿔” are three words.", ["불", "풀", "뿔", "달", "딸"]],
    ["eo", "ʌ o", "ㅓ and ㅗ", v, "ㅓ is open and unrounded; ㅗ is closed with rounded lips.", "Using “o” for both.", ["어머니", "오다", "거리", "고리", "서울"]],
    ["eu", "ɯ", "ㅡ", v, "Say “oo” and spread your lips flat.", "Rounding the lips.", ["그", "음악", "한글", "이름", "쓰다"]],
    ["batchim", "k̚", "Final consonants", c, "A final consonant is stopped but not released: the mouth closes and stays closed.", "Releasing it or adding a vowel.", ["밥", "책", "옷", "꽃", "부엌"]],
  ],
  ar: [
    ["ayn", "ʕ", "ع", c, "Tighten the muscles deep in the throat while voicing, as if lifting something heavy.", "Leaving it out or saying a plain vowel.", ["عربي", "عين", "ساعة", "معلم", "شارع"]],
    ["hah", "ħ", "ح", c, "A strong, whispered h from deep in the throat, like breathing on glass to fog it.", "A soft English h, or the rougher خ.", ["حال", "صباح", "أحمد", "حب", "بحر"]],
    ["emphatic", "sˤ tˤ", "Emphatic consonants", c, "For ص, ض, ط and ظ, pull the back of the tongue down and back. Nearby vowels darken.", "Saying plain س, د, ت and ذ.", ["صباح", "طالب", "ضوء", "صيف", "مطار"]],
    ["qaf", "q", "ق", c, "Like /k/, but made further back, where the tongue meets the very back of the mouth.", "Saying /k/: “قلب” is not “كلب”.", ["قلب", "قهوة", "صديق", "قمر", "طريق"]],
  ],
  hi: [
    ["aspirated", "pʰ bʱ", "Aspirated consonants", c, "Add a clear puff of breath after the consonant. Voiced ones (भ, ध, घ) are breathy.", "No puff: “खाना” is heard as “काना”.", ["खाना", "फल", "भारत", "धन्यवाद", "घर"]],
    ["retroflex", "ʈ ɖ", "Retroflex consonants", c, "Curl the tongue tip back and touch the roof of the mouth behind the ridge.", "Using the same tongue position as for the dental series.", ["टमाटर", "ठीक", "डाल", "बड़ा", "पढ़ना"]],
    ["dental", "t̪ d̪", "Dental consonants", c, "Touch the tongue tip to the back of your top teeth, further forward than English t and d.", "English t and d, which sound retroflex to Hindi ears.", ["तुम", "दाल", "दो", "तीन", "बात"]],
    ["nasal", "̃", "Nasal vowels", v, "Let air pass through the nose during the whole vowel.", "Adding a full n.", ["हाँ", "मैं", "नहीं", "कहाँ", "पाँच"]],
  ],
};

export const SOUNDS: Sound[] = Object.entries(ROWS).flatMap(([lang, rows]) =>
  rows.map(([slug, symbol, name, kind, how, watch, words]) => ({
    id: `${lang}-${slug}`,
    lang,
    symbol,
    name,
    kind,
    how,
    watch,
    words,
  })),
);

export const soundsFor = (lang: string): Sound[] => SOUNDS.filter((s) => s.lang === lang);

export const getSound = (id: string): Sound | undefined => SOUNDS.find((s) => s.id === id);

export const KIND_LABEL: Record<SoundKind, string> = {
  vowel: "Vowels",
  consonant: "Consonants",
  melody: "Stress, tone and rhythm",
};

/** The guide entry that covers an IPA symbol from sound-level scoring, when there is one. */
export function soundForIpa(lang: string, ipa: string): Sound | undefined {
  const bare = ipa.replace(/[ˈˌ]/g, "");
  return soundsFor(lang).find((s) => s.symbol.split(" ").some((part) => part === bare || part.replace("ː", "") === bare));
}
