import { BASICS_TOPIC, COURSE, COURSE_ROMAN, TOPICS } from "./course";
import type { LevelId } from "./levels";
import { MINIMAL_PAIRS } from "./minimal-pairs";
import { soundsFor } from "./sounds";
import { tokenize } from "./text";

export interface Phrase {
  text: string;
  /** English meaning, shown to beginners. */
  meaning?: string;
  /** Romanisation for scripts a beginner may not read yet. */
  roman?: string;
}

export type DiagnosticStageKind = "sounds" | "rhythm" | "melody";

export interface DiagnosticPrompt {
  kind: DiagnosticStageKind;
  /** Short title of the stage, e.g. "Sounds & articulation". */
  title: string;
  /** Subtitle explaining what aspect of pronunciation this reading tests. */
  subtitle: string;
  /** The sentence to read aloud. */
  text: string;
  /** English meaning for non-English languages. */
  meaning?: string;
  /** Romanisation for non-Latin scripts. */
  roman?: string;
  /** Specific sounds, rhythm or melody features tested in this prompt. */
  targets: string[];
  /** Brief coaching cue shown before recording. */
  cue: string;
}

export interface Language {
  /** ISO 639-1 code, used for ElevenLabs and Intl. */
  code: string;
  name: string;
  native: string;
  /** Azure Pronunciation Assessment locale, when that language is supported there. */
  azure?: string;
  rtl?: boolean;
  /** The four starter phrases, in the order of STARTER_MEANINGS. */
  starter: string[];
  starterRoman?: string[];
  /** Short everyday sentences at natural speed, eight words at most (see SHORT in short.ts). */
  intermediate: string[];
  /** Short, dense sentences and tongue twisters that stack the hardest sounds. */
  advanced: string[];
}

const STARTER_MEANINGS = [
  "Hello, how are you?",
  "Thank you very much.",
  "Where is the station?",
  "I would like a coffee, please.",
];

export const LANGUAGES: Language[] = [
  {
    code: "en",
    name: "English",
    native: "English",
    azure: "en-US",
    starter: STARTER_MEANINGS,
    intermediate: [
      "I think it will rain on Thursday.",
      "We cook dinner for friends on weekends.",
      "Could you pass the water, please?",
      "The weather is better than yesterday.",
      "She walked to work this morning.",
    ],
    advanced: [
      "Three thin thinkers thought it through.",
      "Red lorry, yellow lorry.",
      "She sells seashells by the seashore.",
      "Which wristwatch is a Swiss wristwatch?",
    ],
  },
  {
    code: "es",
    name: "Spanish",
    native: "Español",
    azure: "es-ES",
    starter: ["Hola, ¿cómo estás?", "Muchas gracias.", "¿Dónde está la estación?", "Quisiera un café, por favor."],
    intermediate: [
      "Hoy cocino para mis amigos.",
      "¿Me pasas el agua, por favor?",
      "Mañana va a llover en la ciudad.",
      "Vivimos cerca de la estación.",
      "El tren sale a las ocho.",
    ],
    advanced: [
      "Tres tristes tigres tragaban trigo.",
      "Erre con erre, guitarra.",
      "El perro de Rosa corre rápido.",
      "Pablito clavó un clavito.",
    ],
  },
  {
    code: "fr",
    name: "French",
    native: "Français",
    azure: "fr-FR",
    starter: ["Bonjour, comment allez-vous ?", "Merci beaucoup.", "Où est la gare ?", "Je voudrais un café, s'il vous plaît."],
    intermediate: [
      "Il fait beau ce matin.",
      "Je cuisine pour mes amis le week-end.",
      "Tu peux répéter, s'il te plaît ?",
      "Le train part à huit heures.",
      "Nous habitons près de la gare.",
    ],
    advanced: [
      "Trois tortues trottaient sur un trottoir.",
      "Les chaussettes de l'archiduchesse sont sèches.",
      "Un chasseur sachant chasser sans son chien.",
      "Si six scies scient six cyprès.",
    ],
  },
  {
    code: "de",
    name: "German",
    native: "Deutsch",
    azure: "de-DE",
    starter: ["Hallo, wie geht es dir?", "Vielen Dank.", "Wo ist der Bahnhof?", "Ich möchte einen Kaffee, bitte."],
    intermediate: [
      "Ich trinke morgens gern Kaffee.",
      "Abends lese ich gern ein Buch.",
      "Können Sie das bitte wiederholen?",
      "Der Zug kommt um acht Uhr.",
      "Wir wohnen nicht weit vom Bahnhof.",
    ],
    advanced: [
      "Fischers Fritz fischt frische Fische.",
      "Blaukraut bleibt Blaukraut, Brautkleid bleibt Brautkleid.",
      "Zwischen zwei Zweigen zwitschern zwei Schwalben.",
      "Der dicke Dachdecker deckt dein Dach.",
    ],
  },
  {
    code: "it",
    name: "Italian",
    native: "Italiano",
    azure: "it-IT",
    starter: ["Ciao, come stai?", "Grazie mille.", "Dov'è la stazione?", "Vorrei un caffè, per favore."],
    intermediate: [
      "Stasera la nonna prepara la cena.",
      "Domenica andiamo al mare insieme.",
      "Può ripetere, per favore?",
      "Il treno parte alle otto.",
      "Abitiamo vicino alla stazione.",
    ],
    advanced: [
      "Trentatré trentini entrarono a Trento.",
      "Sopra la panca la capra campa.",
      "Tutta la famiglia mangia gli gnocchi.",
      "Nonna, quanta ricotta c'è nella pizza?",
    ],
  },
  {
    code: "pt",
    name: "Portuguese",
    native: "Português",
    azure: "pt-BR",
    starter: ["Olá, como vai?", "Muito obrigado.", "Onde fica a estação?", "Eu queria um café, por favor."],
    intermediate: [
      "Amanhã vamos caminhar pela praia.",
      "Eu gosto de cozinhar para os amigos.",
      "Pode repetir, por favor?",
      "O trem sai às oito horas.",
      "Moramos perto da estação.",
    ],
    advanced: [
      "O rato roeu a roupa do rei de Roma.",
      "Três pratos de trigo para três tigres tristes.",
      "A aranha arranha a rã.",
      "Olha a velha molhando a folha.",
    ],
  },
  {
    code: "nl",
    name: "Dutch",
    native: "Nederlands",
    azure: "nl-NL",
    starter: ["Hallo, hoe gaat het?", "Dank je wel.", "Waar is het station?", "Ik wil graag een koffie, alstublieft."],
    intermediate: [
      "Morgen fietsen we naar het strand.",
      "Na het eten lezen we een boek.",
      "Kunt u dat nog een keer zeggen?",
      "De trein vertrekt om acht uur.",
      "We wonen vlak bij het station.",
    ],
    advanced: [
      "De kat krabt de krullen van de trap.",
      "Buiten huilt de uil in de tuin.",
      "Gezellig gaan we graag naar Groningen.",
      "Scheveningen ligt aan zee.",
    ],
  },
  {
    code: "sv",
    name: "Swedish",
    native: "Svenska",
    azure: "sv-SE",
    starter: ["Hej, hur mår du?", "Tack så mycket.", "Var ligger stationen?", "Jag vill ha en kaffe, tack."],
    intermediate: [
      "I morgon tar jag en promenad.",
      "Efter maten dricker vi kaffe.",
      "Kan du säga det igen?",
      "Tåget går klockan åtta.",
      "Vi bor nära stationen.",
    ],
    advanced: [
      "Sju sjösjuka sjömän sköttes av sju sköna sjuksköterskor.",
      "Packa pappas kappsäck.",
      "Kvistfritt kvastskaft.",
      "Ute på sjön skiner solen.",
    ],
  },
  {
    code: "pl",
    name: "Polish",
    native: "Polski",
    azure: "pl-PL",
    starter: ["Cześć, jak się masz?", "Dziękuję bardzo.", "Gdzie jest dworzec?", "Poproszę kawę."],
    intermediate: [
      "Wieczorem czytam ciekawą książkę.",
      "Po obiedzie idziemy na spacer.",
      "Proszę powtórzyć jeszcze raz.",
      "Pociąg odjeżdża o ósmej.",
      "Mieszkamy blisko dworca.",
    ],
    advanced: [
      "W Szczebrzeszynie chrząszcz brzmi w trzcinie.",
      "Stół z powyłamywanymi nogami.",
      "Król Karol kupił królowej Karolinie korale.",
      "Szedł Sasza suchą szosą.",
    ],
  },
  {
    code: "uk",
    name: "Ukrainian",
    native: "Українська",
    azure: "uk-UA",
    starter: ["Привіт, як справи?", "Дуже дякую.", "Де вокзал?", "Я хотів би каву, будь ласка."],
    starterRoman: ["Pryvit, yak spravy?", "Duzhe diakuiu.", "De vokzal?", "Ya khotiv by kavu, bud laska."],
    intermediate: [
      "Зранку я читаю новини.",
      "Після вечері ми гуляємо в парку.",
      "Повторіть, будь ласка, ще раз.",
      "Потяг відходить о восьмій.",
      "Ми живемо біля вокзалу.",
    ],
    advanced: [
      "Бабин біб розцвів у дощ.",
      "На подвір'ї трава, на траві дрова.",
      "Гарна гуска гучно гелгоче.",
      "Сиди, Іване, і пиши листи.",
    ],
  },
  {
    code: "ru",
    name: "Russian",
    native: "Русский",
    azure: "ru-RU",
    starter: ["Привет, как дела?", "Большое спасибо.", "Где вокзал?", "Мне кофе, пожалуйста."],
    starterRoman: ["Privet, kak dela?", "Bolshoye spasibo.", "Gde vokzal?", "Mne kofe, pozhaluysta."],
    intermediate: [
      "Утром я читаю новости.",
      "После ужина мы гуляем в парке.",
      "Повторите, пожалуйста, ещё раз.",
      "Поезд уходит в восемь часов.",
      "Мы живём недалеко от вокзала.",
    ],
    advanced: [
      "Карл у Клары украл кораллы.",
      "Шла Саша по шоссе и сосала сушку.",
      "Ехал Грека через реку.",
      "На дворе трава, на траве дрова.",
    ],
  },
  {
    code: "tr",
    name: "Turkish",
    native: "Türkçe",
    azure: "tr-TR",
    starter: ["Merhaba, nasılsın?", "Çok teşekkür ederim.", "İstasyon nerede?", "Bir kahve istiyorum, lütfen."],
    intermediate: [
      "Yarın sabah sahilde yürüyeceğim.",
      "Akşamları uzun sohbetler ederiz.",
      "Tekrar söyler misiniz, lütfen?",
      "Tren saat sekizde kalkıyor.",
      "İstasyonun yakınında oturuyoruz.",
    ],
    advanced: [
      "Bir berber bir berbere gel beraber demiş.",
      "Şu köşe yaz köşesi, şu köşe kış köşesi.",
      "Dal sarkar, kartal kalkar.",
      "Kırk küp, kırkının da kulpu kırık.",
    ],
  },
  {
    code: "ja",
    name: "Japanese",
    native: "日本語",
    azure: "ja-JP",
    starter: ["こんにちは、お元気ですか。", "ありがとうございます。", "駅はどこですか。", "コーヒーをお願いします。"],
    starterRoman: ["Konnichiwa, ogenki desu ka.", "Arigatō gozaimasu.", "Eki wa doko desu ka.", "Kōhī o onegai shimasu."],
    intermediate: [
      "明日、友達と会います。",
      "晩ご飯のあとで散歩します。",
      "もう一度言ってください。",
      "電車は八時に出ます。",
      "駅の近くに住んでいます。",
    ],
    advanced: [
      "隣の客はよく柿食う客だ。",
      "生麦生米生卵。",
      "東京特許許可局。",
      "赤巻紙青巻紙黄巻紙。",
    ],
  },
  {
    code: "zh",
    name: "Chinese (Mandarin)",
    native: "中文",
    azure: "zh-CN",
    starter: ["你好，你好吗？", "非常感谢。", "车站在哪里？", "我想要一杯咖啡，谢谢。"],
    starterRoman: ["Nǐ hǎo, nǐ hǎo ma?", "Fēicháng gǎnxiè.", "Chēzhàn zài nǎlǐ?", "Wǒ xiǎng yào yì bēi kāfēi, xièxie."],
    intermediate: [
      "明天我去公园散步。",
      "晚上我们一起看电影。",
      "请再说一遍。",
      "火车八点出发。",
      "我们住在车站附近。",
    ],
    advanced: [
      "四是四，十是十。",
      "吃葡萄不吐葡萄皮。",
      "妈妈骑马，马慢，妈妈骂马。",
      "红鲤鱼与绿鲤鱼与驴。",
    ],
  },
  {
    code: "ko",
    name: "Korean",
    native: "한국어",
    azure: "ko-KR",
    starter: ["안녕하세요, 잘 지내세요?", "정말 감사합니다.", "역이 어디예요?", "커피 한 잔 주세요."],
    starterRoman: ["Annyeonghaseyo, jal jinaeseyo?", "Jeongmal gamsahamnida.", "Yeogi eodiyeyo?", "Keopi han jan juseyo."],
    intermediate: [
      "내일 친구를 만나요.",
      "저녁에 같이 영화를 봐요.",
      "다시 한번 말씀해 주세요.",
      "기차는 여덟 시에 출발해요.",
      "우리는 역 근처에 살아요.",
    ],
    advanced: [
      "간장 공장 공장장은 강 공장장이다.",
      "경찰청 철창살은 외철창살이다.",
      "내가 그린 기린 그림.",
      "저 콩깍지는 깐 콩깍지인가?",
    ],
  },
  {
    code: "ar",
    name: "Arabic",
    native: "العربية",
    azure: "ar-SA",
    rtl: true,
    starter: ["مرحباً، كيف حالك؟", "شكراً جزيلاً.", "أين المحطة؟", "أريد قهوة من فضلك."],
    starterRoman: ["Marḥaban, kayfa ḥāluk?", "Shukran jazīlan.", "Ayna al-maḥaṭṭa?", "Urīdu qahwa min faḍlik."],
    intermediate: [
      "أشرب القهوة في الصباح.",
      "نتمشى في الحديقة بعد العشاء.",
      "أعد من فضلك مرة أخرى.",
      "يغادر القطار في الثامنة.",
      "نسكن قرب المحطة.",
    ],
    advanced: [
      "خيط حرير على حائط خليل.",
      "قرأ قيس قصة قصيرة.",
      "صباح الخير يا صديقي الصغير.",
      "عين العصفور على العشب.",
    ],
  },
  {
    code: "hi",
    name: "Hindi",
    native: "हिन्दी",
    azure: "hi-IN",
    starter: ["नमस्ते, आप कैसे हैं?", "बहुत धन्यवाद।", "स्टेशन कहाँ है?", "मुझे एक कॉफ़ी चाहिए।"],
    starterRoman: ["Namaste, āp kaise hain?", "Bahut dhanyavād.", "Steshan kahān hai?", "Mujhe ek kofī chāhie."],
    intermediate: [
      "कल सुबह बाज़ार चलते हैं।",
      "शाम को हम साथ में टहलते हैं।",
      "कृपया फिर से बोलिए।",
      "ट्रेन आठ बजे चलती है।",
      "हम स्टेशन के पास रहते हैं।",
    ],
    advanced: [
      "कच्चा पापड़, पक्का पापड़।",
      "चंदू के चाचा ने चटनी चटाई।",
      "खड़क सिंह के खड़कने से खड़कती हैं खिड़कियाँ।",
      "फल और फूल थाली में हैं।",
    ],
  },
];

export const isLanguage = (code: unknown): code is string =>
  typeof code === "string" && LANGUAGES.some((l) => l.code === code);

export const getLanguage = (code: string): Language =>
  LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

/** Built-in practice texts for a language and level. */
export function textsFor(code: string, level: LevelId): Phrase[] {
  const l = getLanguage(code);
  if (level !== "beginner") return l[level].map((text) => ({ text }));
  return l.starter.map((text, i) => ({
    text,
    meaning: l.code === "en" ? undefined : STARTER_MEANINGS[i],
    roman: l.starterRoman?.[i],
  }));
}

export interface Unit {
  id: string;
  title: string;
  blurb: string;
  phrases: Phrase[];
}

const unitCache = new Map<string, Unit[]>();

/** The phrasebook course for a language: seven units of four phrases. */
export function unitsFor(code: string): Unit[] {
  let units = unitCache.get(code);
  if (!units) {
    const l = getLanguage(code);
    units = [
      { ...BASICS_TOPIC, phrases: textsFor(l.code, "beginner") },
      ...TOPICS.map((t) => ({
        id: t.id,
        title: t.title,
        blurb: t.blurb,
        phrases: t.phrases.map((meaning, i) =>
          l.code === "en"
            ? { text: meaning }
            : { text: COURSE[l.code][t.id][i], meaning, roman: COURSE_ROMAN[l.code]?.[t.id][i] },
        ),
      })),
    ];
    unitCache.set(code, units);
  }
  return units;
}

export const UNIT_IDS = [BASICS_TOPIC.id, ...TOPICS.map((t) => t.id)];

const DIAGNOSTIC_OVERRIDES: Record<
  string,
  [
    { text: string; meaning?: string; roman?: string; targets: string[]; cue: string },
    { text: string; meaning?: string; roman?: string; targets: string[]; cue: string },
    { text: string; meaning?: string; roman?: string; targets: string[]; cue: string },
  ]
> = {
  en: [
    {
      text: "Three brothers think this river feels warmer.",
      targets: ["/θ/ & /ð/ (th)", "/ɹ/ & /l/", "/ɪ/ vs /iː/", "/w/"],
      cue: "Put your tongue lightly between your teeth on “three” and “this”, and keep “feels” longer than “this”.",
    },
    {
      text: "It's important to speak at a comfortable pace.",
      targets: ["Word stress", "Schwa /ə/ reduction", "Smooth word linking"],
      cue: "Lean on “im-POR-tant” and “COM-fortable”, and glide quickly through “to”, “at” and “a”.",
    },
    {
      text: "Are you taking the train, or driving?",
      targets: ["Question rise ↗", "Choice contrast ↘", "Pitch range"],
      cue: "Let your pitch rise on “train” before the comma, then fall to close on “driving”.",
    },
  ],
  es: [
    {
      text: "Mi perro corre por la carretera roja.",
      meaning: "My dog runs along the red road.",
      targets: ["Rolled rr /r/", "Tapped /ɾ/", "Five pure vowels"],
      cue: "Flutter the tongue tip on “perro”, “corre” and “carretera”, and keep every vowel crisp and pure.",
    },
    {
      text: "Me gusta cocinar para mis amigos.",
      meaning: "I like to cook for my friends.",
      targets: ["Syllable-timed flow", "Soft /β, ð, ɣ/", "Word stress"],
      cue: "Give each syllable an even beat and keep the g in “amigos” soft between the vowels.",
    },
    {
      text: "¿Quieres un café, o caminamos?",
      meaning: "Do you want a coffee, or shall we walk?",
      targets: ["Rising question ↗", "Falling alternative ↘", "Vowel linking"],
      cue: "Raise your pitch on “café” before the comma, then let it settle on “caminamos”.",
    },
  ],
  fr: [
    {
      text: "Un bon vin blanc dans une rue tranquille.",
      meaning: "A good white wine in a quiet street.",
      targets: ["Nasal vowels /ɑ̃, ɛ̃, ɔ̃/", "French /y/ (rue)", "French /ʁ/"],
      cue: "Let air pass through your nose on “bon”, “vin” and “blanc” with no final n, and round your lips for “rue”.",
    },
    {
      text: "Mes amis aiment cuisiner ensemble.",
      meaning: "My friends like to cook together.",
      targets: ["Even syllable rhythm", "Liaison & linking", "Group-final length"],
      cue: "Link “mes‿amis” smoothly and lengthen only the last syllable, “-semble”.",
    },
    {
      text: "Vous partez à huit heures, ou plus tard ?",
      meaning: "Are you leaving at eight, or later?",
      targets: ["Continuation rise ↗", "Question melody", "Rounded vowels"],
      cue: "Lift your voice on “huit heures” before the comma, then let it fall on “plus tard”.",
    },
  ],
  de: [
    {
      text: "Ich möchte frische Brötchen zum Frühstück.",
      meaning: "I would like fresh rolls for breakfast.",
      targets: ["ich-sound /ç/", "Umlauts /yː, øː/", "German /ʁ/", "Consonant clusters"],
      cue: "Keep the tongue forward for /ç/ in “ich” and “möchte”, and round your lips tightly on “Brötchen” and “Frühstück”.",
    },
    {
      text: "Am Wochenende koche ich gern für Freunde.",
      meaning: "At weekends I like to cook for friends.",
      targets: ["Sentence stress", "Unstressed -e /ə/", "Final devoicing"],
      cue: "Stress the root syllables clearly and keep unstressed endings like “-e” and “-en” light.",
    },
    {
      text: "Fahren wir mit dem Zug, oder bleiben wir?",
      meaning: "Are we taking the train, or are we staying?",
      targets: ["Question rise ↗", "Alternative fall ↘", "ach-sound /x/"],
      cue: "Let your voice rise on “Zug” before the comma and fall cleanly on “bleiben wir”.",
    },
  ],
  it: [
    {
      text: "La nonna prepara gli gnocchi per tutti.",
      meaning: "Grandma makes gnocchi for everyone.",
      targets: ["Double consonants (nn/tt)", "gn /ɲ/ & gli /ʎ/", "Rolled /r/", "Pure vowels"],
      cue: "Hold the double consonants in “nonna” and “tutti” twice as long, and keep “gli gnocchi” smooth.",
    },
    {
      text: "Mi piace cucinare per i miei amici.",
      meaning: "I like to cook for my friends.",
      targets: ["Even syllable flow", "Word stress", "Smooth linking"],
      cue: "Keep unstressed vowels crisp, never a schwa, and lean gently on “-na-” in “cucinare”.",
    },
    {
      text: "Prendi un caffè adesso, o dopo?",
      meaning: "Are you having a coffee now, or later?",
      targets: ["Question rise ↗", "Choice contrast ↘", "Natural cadence"],
      cue: "Let your voice rise on “adesso” before the comma, then fall gently on “dopo”.",
    },
  ],
  pt: [
    {
      text: "Amanhã de manhã comemos pão quentinho.",
      meaning: "Tomorrow morning we eat warm bread.",
      targets: ["Nasal vowels /ɐ̃, õ/", "nh /ɲ/", "Open/closed e, o"],
      cue: "Let air resonate through your nose on “amanhã” and “pão” without adding a hard final n.",
    },
    {
      text: "Gosto de conversar depois do jantar.",
      meaning: "I like to chat after dinner.",
      targets: ["Word stress", "Unstressed vowel reduction", "Smooth linking"],
      cue: "Lean on the stressed “-sar” and “-tar”, and let unstressed final vowels glide lightly into the next word.",
    },
    {
      text: "Você vai de trem, ou caminhando?",
      meaning: "Are you going by train, or walking?",
      targets: ["Question rise ↗", "Choice contrast ↘", "Natural cadence"],
      cue: "Lift your pitch on “trem” before the comma, then let it settle on “caminhando”.",
    },
  ],
  nl: [
    {
      text: "Morgen gaan we gezellig naar buiten.",
      meaning: "Tomorrow we're going outside together.",
      targets: ["Dutch g /x/", "ui /œy/ diphthong", "Long vs. short vowels"],
      cue: "Give “morgen” and “gezellig” gentle friction at the back of the throat, and round your lips for “ui” in “buiten”.",
    },
    {
      text: "Ik kook graag voor mijn vrienden.",
      meaning: "I like to cook for my friends.",
      targets: ["Word stress", "Schwa /ə/ reduction", "Smooth linking"],
      cue: "Stress “kook” and “vrien-” clearly and keep “voor” and “mijn” light.",
    },
    {
      text: "Neem je de trein, of blijf je hier?",
      meaning: "Are you taking the train, or staying here?",
      targets: ["Question rise ↗", "Choice contrast ↘", "Natural cadence"],
      cue: "Let your pitch rise on “trein” before the comma, then drop cleanly on “hier”.",
    },
  ],
  sv: [
    {
      text: "I morgon köper jag en skjorta vid sjön.",
      meaning: "Tomorrow I'll buy a shirt by the lake.",
      targets: ["sj-sound /ɧ/", "Rounded ö /ø/", "Vowel length /ː/", "Pitch accent"],
      cue: "Round your lips on “skjorta” and “sjön”, and hold the long vowel in “köper” longer than the short ones.",
    },
    {
      text: "På helgerna lagar jag middag åt vänner.",
      meaning: "At weekends I cook dinner for friends.",
      targets: ["Long & short syllables", "Tone-2 pitch melody", "Smooth linking"],
      cue: "Give every stressed word one long beat, either a long vowel or a long consonant, without pausing.",
    },
    {
      text: "Tar du tåget, eller vill du gå?",
      meaning: "Are you taking the train, or do you want to walk?",
      targets: ["Question rise ↗", "Swedish pitch accent", "Natural cadence"],
      cue: "Let your voice lift on “tåget” before the comma, then fall naturally on “gå”.",
    },
  ],
  pl: [
    {
      text: "Wieczorem chcę wypić filiżankę herbaty.",
      meaning: "In the evening I want to drink a cup of tea.",
      targets: ["cz vs. ć", "Nasal ę", "Vowel y /ɨ/", "Consonant clusters"],
      cue: "Keep “cz” in “wieczorem” dark with the tongue tip back, brighten “ć” in “wypić”, and add no vowel inside “chcę”.",
    },
    {
      text: "Lubię gotować obiad dla przyjaciół.",
      meaning: "I like to cook dinner for my friends.",
      targets: ["Penultimate word stress", "Voicing assimilation", "Smooth linking"],
      cue: "Stress the second-to-last syllable of each word: LU-bię, go-TO-wać, przy-JA-ciół.",
    },
    {
      text: "Jedziesz pociągiem, czy idziemy pieszo?",
      meaning: "Are you going by train, or shall we walk?",
      targets: ["Question rise ↗", "Clause contrast ↘", "Natural cadence"],
      cue: "Raise your pitch on “pociągiem” before the comma, then let your voice settle on “pieszo”.",
    },
  ],
  uk: [
    {
      text: "Щоранку ми п'ємо гарячу каву на балконі.",
      roman: "Shchoranku my p'iemo hariachu kavu na balkoni.",
      meaning: "Every morning we drink hot coffee on the balcony.",
      targets: ["Ukrainian г /ɦ/", "и /ɪ/ vs. і /i/", "Soft consonants /ʲ/"],
      cue: "Keep “г” breathy and voiced in “гарячу”, and keep “и” in “ми” distinct from the clear “і” in “балконі”.",
    },
    {
      text: "На вихідних я готую вечерю для друзів.",
      roman: "Na vykhidnykh ya hotuiu vecheriu dlia druziv.",
      meaning: "At weekends I cook dinner for friends.",
      targets: ["Word stress", "Clear unstressed vowels", "Smooth linking"],
      cue: "Hit the stressed syllable firmly, go-TU-yu, ve-CHE-riu, and keep unstressed “о” and “е” clear.",
    },
    {
      text: "Ти поїдеш потягом, чи підемо пішки?",
      roman: "Ty poyidesh potiahom, chy pidemo pishky?",
      meaning: "Are you going by train, or shall we walk?",
      targets: ["Question rise ↗", "Choice contrast ↘", "Natural cadence"],
      cue: "Let your pitch rise on “потягом” before the comma, then glide down at the end.",
    },
  ],
  ru: [
    {
      text: "Каждое утро мы пьём горячий чай.",
      roman: "Kazhdoye utro my pyom goryachiy chay.",
      meaning: "Every morning we drink hot tea.",
      targets: ["Vowel reduction (о→а)", "Hard vs. soft /ʲ/", "ы /ɨ/", "Rolled /r/"],
      cue: "Relax unstressed “о” toward “а” in “горячий”, keep “ы” in “мы” deep, and soften “пь” in “пьём”.",
    },
    {
      text: "По выходным я готовлю ужин для друзей.",
      roman: "Po vykhodnym ya gotovlyu uzhin dlya druzey.",
      meaning: "At weekends I cook dinner for friends.",
      targets: ["Strong word stress", "Unstressed reduction", "Smooth linking"],
      cue: "Lean on one vowel per word, ga-TOV-lyu, U-zhin, dru-ZEY, and keep the rest short and light.",
    },
    {
      text: "Ты поедешь на поезде, или пойдём пешком?",
      roman: "Ty poyedesh na poyezde, ili poydyom peshkom?",
      meaning: "Are you going by train, or shall we walk?",
      targets: ["Question rise (IK-3) ↗", "Choice fall ↘", "Natural cadence"],
      cue: "Raise your pitch sharply on “поезде” before the comma, then let it fall cleanly at the end.",
    },
  ],
  tr: [
    {
      text: "Yarın sabah sıcak bir kahve içip yürüyeceğim.",
      meaning: "Tomorrow morning I'll drink a hot coffee and walk.",
      targets: ["Undotted ı /ɯ/", "ü /y/", "Soft ğ /ɰ/", "Tapped /ɾ/"],
      cue: "Keep “ı” in “sıcak” unrounded, round your lips on “yürüyeceğim”, and let “ğ” lengthen the vowel before it.",
    },
    {
      text: "Arkadaşlarım için yemek yapmayı severim.",
      meaning: "I love cooking for my friends.",
      targets: ["Final-syllable stress", "Vowel harmony", "Smooth linking"],
      cue: "Give each suffix an even, crisp beat and don't drop light final consonants between words.",
    },
    {
      text: "Trenle mi gidiyorsun, yoksa yürüyelim mi?",
      meaning: "Are you going by train, or shall we walk?",
      targets: ["Question particle (mi) ↗", "Choice contrast ↘", "Natural cadence"],
      cue: "Lift your pitch just before “mi” in the first clause, then lower it on the final question.",
    },
  ],
  ja: [
    {
      text: "東京駅で、ちょっと熱いコーヒーを飲みます。",
      roman: "Tōkyō-eki de, chotto atsui kōhī o nomimasu.",
      meaning: "At Tokyo Station, I drink a rather hot coffee.",
      targets: ["Long vowels /ː/", "Double consonants (っ)", "つ /ts/"],
      cue: "Hold “Tōkyō” and “kōhī” for two full beats each, and pause one beat on “っ” in “chotto”.",
    },
    {
      text: "週末は友達と映画を見ます。",
      roman: "Shūmatsu wa tomodachi to eiga o mimasu.",
      meaning: "At weekends I watch films with friends.",
      targets: ["Even mora timing", "Pitch accent drops", "Devoiced vowels"],
      cue: "Keep every beat the same length and mark words with pitch, not with loud English-style stress.",
    },
    {
      text: "電車で行きますか、それとも歩きますか。",
      roman: "Densha de ikimasu ka, soretomo arukimasu ka.",
      meaning: "Will you go by train, or will you walk?",
      targets: ["Clause rise ↗", "Question particle か ↗", "Pitch accent contour"],
      cue: "Let your pitch rise gently into the first “ka” before the pause, then finish clearly on the last “ka”.",
    },
  ],
  zh: [
    {
      text: "明天早上我去茶馆喝热茶。",
      roman: "Míngtiān zǎoshang wǒ qù cháguǎn hē rè chá.",
      meaning: "Tomorrow morning I'm going to the teahouse for hot tea.",
      targets: ["Four tones", "Retroflex zh/ch/sh", "Palatal j/q/x"],
      cue: "Keep each tone distinct: third-tone dips in “wǒ” and “guǎn”, sharp fourth-tone falls in “qù” and “rè”.",
    },
    {
      text: "周末我喜欢给朋友们做饭。",
      roman: "Zhōumò wǒ xǐhuan gěi péngyoumen zuò fàn.",
      meaning: "At weekends I like to cook for my friends.",
      targets: ["Tone sandhi & neutral tone", "Aspiration pʰ/tʰ/kʰ", "Phrase grouping"],
      cue: "Keep neutral tones like “huan” and “men” short and light, and give the toned syllables their full length.",
    },
    {
      text: "你坐火车去，还是走路去呢？",
      roman: "Nǐ zuò huǒchē qù, háishi zǒulù qù ne?",
      meaning: "Are you going by train, or on foot?",
      targets: ["Tone contour preservation", "Choice cadence (还是)", "Question ending ↗"],
      cue: "Keep every word's own tone while lifting the whole phrase gently toward “ne”.",
    },
  ],
  ko: [
    {
      text: "빵집에서 따뜻한 커피를 샀어요.",
      roman: "Ppangjibeseo ttatteutan keopireul sasseoyo.",
      meaning: "I bought a warm coffee at the bakery.",
      targets: ["Plain / aspirated / tense stops", "ㅡ /ɯ/ vowel", "Final batchim"],
      cue: "Hold tense “빵” and “따” tightly with no breath, and give aspirated “커피” a clear puff of air.",
    },
    {
      text: "주말에는 집에서 음식을 만들어요.",
      roman: "Jumareneun jibeseo eumsigeul mandeureoyo.",
      meaning: "At weekends I cook at home.",
      targets: ["Even syllable flow", "Sound linking (연음)", "Stop closure (batchim)"],
      cue: "Carry each final consonant into the next vowel, “지베서”, “음시글”, without chopping between syllables.",
    },
    {
      text: "기차를 탈까요, 아니면 걸을까요?",
      roman: "Gichareul talkkayo, animyeon georeulkkayo?",
      meaning: "Shall we take the train, or walk?",
      targets: ["Clause rise ↗", "Question ending (-까요) ↗", "Natural cadence"],
      cue: "Let your pitch rise gently on “탈까요” before the comma, then lift lightly at the end.",
    },
  ],
  ar: [
    {
      text: "أشرب في الصباح قهوة ساخنة قبل عملي.",
      roman: "Ashrabu fī ṣ-ṣabāḥi qahwatan sākhinatan qabla 'amalī.",
      meaning: "In the morning I drink hot coffee before work.",
      targets: ["ع /ʕ/ & ح /ħ/", "Emphatic ص /sˤ/ & ق /q/", "Short vs. long vowels"],
      cue: "Say “ح” in “الصباح” and “ع” in “عملي” deep in the throat, and keep “ق” far back in “قهوة”.",
    },
    {
      text: "أحب أن أطبخ لأصدقائي بعد العمل.",
      roman: "Uḥibbu an aṭbukha li-aṣdiqā'ī ba'da l-'amal.",
      meaning: "I like to cook for my friends after work.",
      targets: ["Long vowel timing", "Doubled consonants (shadda)", "Smooth linking"],
      cue: "Hold the doubled “بّ” in “أحبّ” and the long “ā” in “أصدقائي” for their full beat.",
    },
    {
      text: "هل تركب القطار، أم نمشي معاً؟",
      roman: "Hal tarkabu l-qiṭār, am namshī ma'an?",
      meaning: "Are you taking the train, or shall we walk together?",
      targets: ["Question rise (هل) ↗", "Choice contrast (أم) ↘", "Natural cadence"],
      cue: "Let your voice lift on “القطار” before the comma, then settle smoothly at the end.",
    },
  ],
  hi: [
    {
      text: "कल सुबह ताज़े फल और ठंडा पानी लेंगे।",
      roman: "Kal subah tāze phal aur ṭhanḍā pānī lenge.",
      meaning: "Tomorrow morning we'll get fresh fruit and cold water.",
      targets: ["Aspirated ph/ṭh", "Dental vs. retroflex", "Nasal vowels"],
      cue: "Give “फल” and “ठंडा” a clear puff of air, curl the tongue back for “ठ” and “ड”, and keep “ता” dental.",
    },
    {
      text: "हमें दोस्तों के लिए खाना बनाना पसंद है।",
      roman: "Hamein doston ke lie khānā banānā pasand hai.",
      meaning: "We like to cook for our friends.",
      targets: ["Even syllable timing", "Schwa deletion", "Smooth linking"],
      cue: "Keep syllables crisp and even, and don't add a vowel at the end of “पसंद”.",
    },
    {
      text: "आप ट्रेन से जाएँगे, या पैदल चलें?",
      roman: "Āp ṭren se jāenge, yā paidal chalein?",
      meaning: "Will you go by train, or shall we walk?",
      targets: ["Question rise ↗", "Choice contrast ↘", "Natural cadence"],
      cue: "Let your pitch rise toward “जाएँगे” before the comma, then fall gently at the end.",
    },
  ],
};

function firstSentence(text: string, code: string): string {
  const seg = new Intl.Segmenter(code, { granularity: "sentence" });
  for (const s of seg.segment(text.trim())) {
    const t = s.segment.trim();
    if (t) return t;
  }
  return text.trim();
}

/**
 * Three-stage diagnostic pronunciation test for a language:
 * 1. Signature sounds (vowels & consonants)
 * 2. Rhythm, stress & linking
 * 3. Melody & intonation
 */
export function diagnosticPromptsFor(code: string): DiagnosticPrompt[] {
  const l = getLanguage(code);
  const sounds = soundsFor(l.code);
  const custom = DIAGNOSTIC_OVERRIDES[l.code];

  if (custom) {
    return [
      {
        kind: "sounds",
        title: "Sounds & articulation",
        subtitle: `Tests the vowels and consonants in ${l.name} that most often trip learners up.`,
        ...custom[0],
      },
      {
        kind: "rhythm",
        title: "Rhythm, stress & linking",
        subtitle: "Tests which syllables you lean on, which ones shrink, and how smoothly words connect.",
        ...custom[1],
      },
      {
        kind: "melody",
        title: "Melody & intonation",
        subtitle: "Tests how naturally your pitch rises on a question and settles at the end of a thought.",
        ...custom[2],
      },
    ];
  }

  const soundTargets = sounds
    .filter((s) => s.kind !== "melody")
    .slice(0, 3)
    .map((s) => `${s.name} (/${s.symbol}/)`);
  const melodySound = sounds.find((s) => s.kind === "melody");
  const starter0 = textsFor(l.code, "beginner")[0];
  const starter2 = textsFor(l.code, "beginner")[2];
  const inter0 = firstSentence(l.intermediate[0] ?? starter0.text, l.code);
  const inter1 = firstSentence(l.intermediate[1] ?? inter0, l.code);
  const adv0 = firstSentence(l.advanced[0] ?? inter0, l.code);

  return [
    {
      kind: "sounds",
      title: "Sounds & articulation",
      subtitle: `Tests the signature vowels and consonants of ${l.name} in connected words.`,
      text: inter0,
      targets: soundTargets.length ? soundTargets : ["Core vowels", "Consonant clarity", "Word endings"],
      cue: `Focus on clear vowel quality and crisp consonants rather than rushing through the sentence.`,
    },
    {
      kind: "rhythm",
      title: "Rhythm, stress & linking",
      subtitle: "Tests word timing, stressed vs. unstressed syllables, and smooth flow without pauses.",
      text: adv0.length <= 160 ? adv0 : inter1,
      targets: [melodySound ? melodySound.name : "Word stress", "Smooth linking", "Steady pace"],
      cue: "Read in natural phrase groups without stopping between every word.",
    },
    {
      kind: "melody",
      title: "Melody & intonation",
      subtitle: "Tests how your voice rises on a question and settles naturally at the end.",
      text: firstSentence(starter2.text, l.code),
      meaning: starter2.meaning,
      roman: starter2.roman,
      targets: ["Question pitch ↗", "Phrase melody ↘", "Natural cadence"],
      cue: "Let your pitch move naturally across the question rather than keeping a flat monotone.",
    },
  ];
}

/** Meaning and romanisation of a built-in phrase, if the text is one. */
export function findPhrase(code: string, text: string): Phrase | undefined {
  for (const unit of unitsFor(code)) {
    const hit = unit.phrases.find((p) => p.text === text);
    if (hit) return hit;
  }
  const diag = diagnosticPromptsFor(code).find((p) => p.text === text);
  if (diag) return { text: diag.text, meaning: diag.meaning, roman: diag.roman };
  return undefined;
}

/**
 * True when the text comes from the built-in library: a whole practice text,
 * a course phrase, a sentence or word taken from one, a sound-library word or
 * a listening-drill word.
 */
export function isLibraryText(code: string, text: string): boolean {
  return libraryOf(code).has(text.trim());
}

const libraries = new Map<string, Set<string>>();

function libraryOf(code: string): Set<string> {
  let set = libraries.get(code);
  if (!set) {
    const l = getLanguage(code);
    set = new Set<string>();
    const sentences = new Intl.Segmenter(code, { granularity: "sentence" });
    const course = unitsFor(l.code).flatMap((u) => u.phrases.map((p) => p.text));
    const soundWords = soundsFor(l.code).flatMap((s) => s.words);
    const diagnostic = diagnosticPromptsFor(l.code).map((p) => p.text);
    for (const text of [...course, ...l.intermediate, ...l.advanced, ...soundWords, ...diagnostic]) {
      set.add(text);
      for (const s of sentences.segment(text)) set.add(s.segment.trim());
      for (const t of tokenize(text, code)) set.add(t.text);
    }
    for (const p of MINIMAL_PAIRS[code] ?? []) set.add(p.a).add(p.b);
    libraries.set(code, set);
  }
  return set;
}
