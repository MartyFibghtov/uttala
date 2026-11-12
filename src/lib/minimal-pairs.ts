export interface MinimalPair {
  a: string;
  b: string;
  /** The contrast being trained. */
  contrast: string;
}

/**
 * Word pairs that differ in a single sound. Contrasts are chosen for high
 * functional load: confusing them changes many words, so they matter most
 * for being understood.
 */
export const MINIMAL_PAIRS: Record<string, MinimalPair[]> = {
  en: [
    { a: "ship", b: "sheep", contrast: "/ɪ/ – /iː/" },
    { a: "bit", b: "beat", contrast: "/ɪ/ – /iː/" },
    { a: "live", b: "leave", contrast: "/ɪ/ – /iː/" },
    { a: "bad", b: "bed", contrast: "/æ/ – /e/" },
    { a: "cat", b: "cut", contrast: "/æ/ – /ʌ/" },
    { a: "full", b: "fool", contrast: "/ʊ/ – /uː/" },
    { a: "pull", b: "pool", contrast: "/ʊ/ – /uː/" },
    { a: "coat", b: "caught", contrast: "/oʊ/ – /ɔː/" },
    { a: "light", b: "right", contrast: "/l/ – /r/" },
    { a: "lice", b: "rice", contrast: "/l/ – /r/" },
    { a: "think", b: "sink", contrast: "/θ/ – /s/" },
    { a: "three", b: "tree", contrast: "/θ/ – /t/" },
    { a: "then", b: "den", contrast: "/ð/ – /d/" },
    { a: "van", b: "ban", contrast: "/v/ – /b/" },
    { a: "vet", b: "wet", contrast: "/v/ – /w/" },
    { a: "sheep", b: "cheap", contrast: "/ʃ/ – /tʃ/" },
    { a: "cap", b: "cab", contrast: "final /p/ – /b/" },
    { a: "back", b: "bag", contrast: "final /k/ – /g/" },
  ],
  es: [
    { a: "pero", b: "perro", contrast: "/ɾ/ – /r/" },
    { a: "caro", b: "carro", contrast: "/ɾ/ – /r/" },
    { a: "pena", b: "peña", contrast: "/n/ – /ɲ/" },
    { a: "peso", b: "beso", contrast: "/p/ – /b/" },
    { a: "hablo", b: "habló", contrast: "stress" },
    { a: "paso", b: "pasó", contrast: "stress" },
  ],
  fr: [
    { a: "dessus", b: "dessous", contrast: "/y/ – /u/" },
    { a: "rue", b: "roue", contrast: "/y/ – /u/" },
    { a: "pur", b: "pour", contrast: "/y/ – /u/" },
    { a: "vin", b: "vent", contrast: "/ɛ̃/ – /ɑ̃/" },
    { a: "beau", b: "bon", contrast: "oral – nasal" },
    { a: "poisson", b: "poison", contrast: "/s/ – /z/" },
  ],
  de: [
    { a: "Staat", b: "Stadt", contrast: "/aː/ – /a/" },
    { a: "Miete", b: "Mitte", contrast: "/iː/ – /ɪ/" },
    { a: "schon", b: "schön", contrast: "/oː/ – /øː/" },
    { a: "Höhle", b: "Hölle", contrast: "/øː/ – /œ/" },
    { a: "fühlen", b: "füllen", contrast: "/yː/ – /ʏ/" },
    { a: "Kirche", b: "Kirsche", contrast: "/ç/ – /ʃ/" },
  ],
  it: [
    { a: "pala", b: "palla", contrast: "single – double /l/" },
    { a: "caro", b: "carro", contrast: "single – double /r/" },
    { a: "sete", b: "sette", contrast: "single – double /t/" },
    { a: "nono", b: "nonno", contrast: "single – double /n/" },
    { a: "capello", b: "cappello", contrast: "single – double /p/" },
  ],
  pt: [
    { a: "avô", b: "avó", contrast: "/o/ – /ɔ/" },
    { a: "pau", b: "pão", contrast: "oral – nasal" },
    { a: "caro", b: "carro", contrast: "/ɾ/ – /ʁ/" },
    { a: "mau", b: "mão", contrast: "oral – nasal" },
  ],
  nl: [
    { a: "man", b: "maan", contrast: "/ɑ/ – /aː/" },
    { a: "bom", b: "boom", contrast: "/ɔ/ – /oː/" },
    { a: "zon", b: "zoon", contrast: "/ɔ/ – /oː/" },
    { a: "deur", b: "duur", contrast: "/øː/ – /y/" },
  ],
  sv: [
    { a: "glas", b: "glass", contrast: "long – short vowel" },
    { a: "vit", b: "vitt", contrast: "long – short vowel" },
    { a: "tak", b: "tack", contrast: "long – short vowel" },
    { a: "ful", b: "full", contrast: "long – short vowel" },
  ],
  pl: [
    { a: "kasa", b: "kasza", contrast: "/s/ – /ʂ/" },
    { a: "bić", b: "być", contrast: "/i/ – /ɨ/" },
    { a: "wieś", b: "wiesz", contrast: "/ɕ/ – /ʂ/" },
    { a: "czy", b: "trzy", contrast: "/tʂ/ – /tʂʂ/" },
  ],
  uk: [
    { a: "лис", b: "ліс", contrast: "/ɪ/ – /i/" },
    { a: "кит", b: "кіт", contrast: "/ɪ/ – /i/" },
    { a: "лук", b: "люк", contrast: "hard – soft /l/" },
    { a: "грип", b: "гриб", contrast: "final /p/ – /b/" },
  ],
  ru: [
    { a: "мат", b: "мать", contrast: "hard – soft /t/" },
    { a: "брат", b: "брать", contrast: "hard – soft /t/" },
    { a: "угол", b: "уголь", contrast: "hard – soft /l/" },
    { a: "бил", b: "был", contrast: "/i/ – /ɨ/" },
  ],
  tr: [
    { a: "ol", b: "öl", contrast: "/o/ – /ø/" },
    { a: "kul", b: "kül", contrast: "/u/ – /y/" },
    { a: "kir", b: "kır", contrast: "/i/ – /ɯ/" },
  ],
  ja: [
    { a: "おばさん", b: "おばあさん", contrast: "short – long vowel" },
    { a: "ビル", b: "ビール", contrast: "short – long vowel" },
    { a: "かど", b: "カード", contrast: "short – long vowel" },
    { a: "きて", b: "きって", contrast: "single – double consonant" },
    { a: "すき", b: "つき", contrast: "/s/ – /ts/" },
  ],
  zh: [
    { a: "妈", b: "马", contrast: "tone 1 – tone 3" },
    { a: "买", b: "卖", contrast: "tone 3 – tone 4" },
    { a: "四", b: "是", contrast: "/s/ – /ʂ/" },
    { a: "知", b: "吃", contrast: "plain – aspirated" },
  ],
  ko: [
    { a: "불", b: "풀", contrast: "plain – aspirated" },
    { a: "자다", b: "차다", contrast: "plain – aspirated" },
    { a: "달", b: "딸", contrast: "plain – tense" },
    { a: "사다", b: "싸다", contrast: "plain – tense" },
  ],
  ar: [
    { a: "كلب", b: "قلب", contrast: "/k/ – /q/" },
    { a: "تين", b: "طين", contrast: "/t/ – /tˤ/" },
    { a: "سيف", b: "صيف", contrast: "/s/ – /sˤ/" },
    { a: "أمل", b: "عمل", contrast: "/ʔ/ – /ʕ/" },
  ],
  hi: [
    { a: "काना", b: "खाना", contrast: "plain – aspirated /k/" },
    { a: "पल", b: "फल", contrast: "plain – aspirated /p/" },
    { a: "बात", b: "भात", contrast: "plain – breathy /b/" },
    { a: "दाल", b: "डाल", contrast: "dental – retroflex /d/" },
  ],
};

/** The distinct contrasts trained in a language, in the order they are listed. */
export const contrastsFor = (lang: string): string[] => [
  ...new Set((MINIMAL_PAIRS[lang] ?? []).map((p) => p.contrast)),
];
