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
  intermediate: string[];
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
      "I thought the weather would be better this Thursday, but the forecast says there will be heavy rain throughout the whole region.",
      "On weekends I like to cook dinner for my friends and watch a good film.",
    ],
    advanced: [
      "Please call Stella. Ask her to bring these things with her from the store: six spoons of fresh snow peas, five thick slabs of blue cheese, and maybe a snack for her brother Bob.",
      "The North Wind and the Sun were arguing about which of them was stronger, when a traveller came along wrapped in a warm cloak.",
      "She sells seashells by the seashore, and the shells she sells are seashells, I'm sure.",
    ],
  },
  {
    code: "es",
    name: "Spanish",
    native: "Español",
    azure: "es-ES",
    starter: ["Hola, ¿cómo estás?", "Muchas gracias.", "¿Dónde está la estación?", "Quisiera un café, por favor."],
    intermediate: [
      "Mi perro corre rápido por la carretera, pero siempre regresa a casa cuando empieza a llover.",
      "Los fines de semana me gusta cocinar para mis amigos y ver una buena película.",
    ],
    advanced: [
      "El viento del norte y el sol discutían sobre cuál de los dos era el más fuerte, cuando pasó un viajero envuelto en una capa gruesa.",
      "Tres tristes tigres tragaban trigo en un trigal.",
    ],
  },
  {
    code: "fr",
    name: "French",
    native: "Français",
    azure: "fr-FR",
    starter: ["Bonjour, comment allez-vous ?", "Merci beaucoup.", "Où est la gare ?", "Je voudrais un café, s'il vous plaît."],
    intermediate: [
      "Un bon vin blanc se boit lentement, surtout quand on le partage avec de vieux amis dans un jardin tranquille.",
      "Le week-end, j'aime cuisiner pour mes amis et regarder un bon film.",
    ],
    advanced: [
      "Le vent du nord et le soleil se disputaient, chacun assurant qu'il était le plus fort, quand ils ont vu un voyageur qui s'avançait, enveloppé dans son manteau.",
      "Les chaussettes de l'archiduchesse sont-elles sèches, archi-sèches ?",
    ],
  },
  {
    code: "de",
    name: "German",
    native: "Deutsch",
    azure: "de-DE",
    starter: ["Hallo, wie geht es dir?", "Vielen Dank.", "Wo ist der Bahnhof?", "Ich möchte einen Kaffee, bitte."],
    intermediate: [
      "Ich möchte früh am Morgen durch die Stadt laufen und danach frische Brötchen für das Frühstück kaufen.",
      "Am Wochenende koche ich gern für meine Freunde und schaue einen guten Film.",
    ],
    advanced: [
      "Einst stritten sich der Nordwind und die Sonne, wer von ihnen beiden wohl der Stärkere wäre, als ein Wanderer, der in einen warmen Mantel gehüllt war, des Weges kam.",
      "Fischers Fritz fischt frische Fische, frische Fische fischt Fischers Fritz.",
    ],
  },
  {
    code: "it",
    name: "Italian",
    native: "Italiano",
    azure: "it-IT",
    starter: ["Ciao, come stai?", "Grazie mille.", "Dov'è la stazione?", "Vorrei un caffè, per favore."],
    intermediate: [
      "Ogni sera la nonna prepara gli gnocchi con il sugo di pomodoro e li serve a tutta la famiglia.",
      "Nel fine settimana mi piace cucinare per i miei amici e guardare un bel film.",
    ],
    advanced: [
      "Il vento del nord e il sole discutevano su chi dei due fosse il più forte, quando arrivò un viaggiatore avvolto in un mantello.",
      "Trentatré trentini entrarono a Trento, tutti e trentatré trotterellando.",
    ],
  },
  {
    code: "pt",
    name: "Portuguese",
    native: "Português",
    azure: "pt-BR",
    starter: ["Olá, como vai?", "Muito obrigado.", "Onde fica a estação?", "Eu queria um café, por favor."],
    intermediate: [
      "Amanhã de manhã vamos caminhar pela praia e depois tomar um café com pão quentinho.",
      "No fim de semana, gosto de cozinhar para os meus amigos e ver um bom filme.",
    ],
    advanced: [
      "O vento norte e o sol discutiam qual dos dois era o mais forte, quando passou um viajante envolto numa capa.",
      "O rato roeu a roupa do rei de Roma.",
    ],
  },
  {
    code: "nl",
    name: "Dutch",
    native: "Nederlands",
    azure: "nl-NL",
    starter: ["Hallo, hoe gaat het?", "Dank je wel.", "Waar is het station?", "Ik wil graag een koffie, alstublieft."],
    intermediate: [
      "Morgen gaan we met de fiets naar het strand en eten we verse vis in de haven.",
      "In het weekend kook ik graag voor mijn vrienden en kijk ik een goede film.",
    ],
    advanced: [
      "De noordenwind en de zon hadden een discussie over de vraag wie van hen tweeën de sterkste was, toen er juist iemand voorbijkwam die een dikke, warme jas aanhad.",
      "De kat krabt de krullen van de trap.",
    ],
  },
  {
    code: "sv",
    name: "Swedish",
    native: "Svenska",
    azure: "sv-SE",
    starter: ["Hej, hur mår du?", "Tack så mycket.", "Var ligger stationen?", "Jag vill ha en kaffe, tack."],
    intermediate: [
      "I morgon bitti vill jag ta en lång promenad vid havet och sedan dricka kaffe med en vän.",
      "På helgerna tycker jag om att laga mat åt mina vänner och se en bra film.",
    ],
    advanced: [
      "Nordanvinden och solen tvistade en gång om vem av dem som var starkast, när en vandrare kom vägen fram, insvept i en varm kappa.",
      "Sju sjösjuka sjömän åkte till stationen för att köpa nya skjortor.",
    ],
  },
  {
    code: "pl",
    name: "Polish",
    native: "Polski",
    azure: "pl-PL",
    starter: ["Cześć, jak się masz?", "Dziękuję bardzo.", "Gdzie jest dworzec?", "Poproszę kawę."],
    intermediate: [
      "W czwartek wieczorem chcę przeczytać książkę i wypić filiżankę gorącej herbaty.",
      "W weekendy lubię gotować dla przyjaciół i oglądać dobry film.",
    ],
    advanced: [
      "Wiatr północny i słońce spierali się, kto z nich jest silniejszy, gdy drogą nadszedł podróżny owinięty w ciepły płaszcz.",
      "W Szczebrzeszynie chrząszcz brzmi w trzcinie.",
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
      "Щоранку я п'ю гарячу каву і читаю новини, перш ніж їхати на роботу.",
      "На вихідних я люблю готувати для друзів і дивитися хороший фільм.",
    ],
    advanced: [
      "Північний вітер і сонце сперечалися, хто з них сильніший, коли дорогою проходив мандрівник, загорнутий у теплий плащ.",
      "Бабин біб розцвів у дощ, буде бабі біб у борщ.",
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
      "Каждое утро я пью горячий чай и читаю новости, прежде чем ехать на работу.",
      "По выходным я люблю готовить для друзей и смотреть хороший фильм.",
    ],
    advanced: [
      "Однажды северный ветер и солнце спорили, кто из них сильнее, и как раз в это время они заметили путешественника, закутанного в плащ.",
      "Карл у Клары украл кораллы, а Клара у Карла украла кларнет.",
    ],
  },
  {
    code: "tr",
    name: "Turkish",
    native: "Türkçe",
    azure: "tr-TR",
    starter: ["Merhaba, nasılsın?", "Çok teşekkür ederim.", "İstasyon nerede?", "Bir kahve istiyorum, lütfen."],
    intermediate: [
      "Yarın sabah erkenden kalkıp deniz kenarında uzun bir yürüyüş yapmak istiyorum.",
      "Hafta sonları arkadaşlarım için yemek yapmayı ve güzel bir film izlemeyi severim.",
    ],
    advanced: [
      "Kuzey rüzgârı ile güneş, hangisinin daha güçlü olduğunu tartışıyorlardı; o sırada kalın bir paltoya sarınmış bir yolcu geldi.",
      "Bir berber bir berbere, gel beraber bir berber dükkânı açalım demiş.",
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
      "明日の朝、駅の前で友達と会って、一緒に美味しいラーメンを食べに行きます。",
      "週末は友達のために料理をして、いい映画を見るのが好きです。",
    ],
    advanced: [
      "ある時、北風と太陽が力比べをしました。旅人のコートを脱がせた方が勝ちということに決めて、まず北風から始めました。",
      "隣の客はよく柿食う客だ。生麦生米生卵。",
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
      "明天早上我想去公园散步，然后和朋友一起喝一杯热茶。",
      "周末我喜欢给朋友们做饭，然后看一部好电影。",
    ],
    advanced: [
      "有一回，北风跟太阳正在争论谁的本事大。说着说着，来了一个过路的人，身上穿着一件厚大衣。",
      "四是四，十是十，十四是十四，四十是四十。",
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
      "내일 아침에 친구를 만나서 같이 맛있는 음식을 먹으러 갈 거예요.",
      "주말에는 친구들을 위해 요리하고 좋은 영화를 보는 것을 좋아해요.",
    ],
    advanced: [
      "바람과 햇님이 서로 힘이 더 세다고 다투고 있을 때, 한 나그네가 따뜻한 외투를 입고 걸어왔습니다.",
      "간장 공장 공장장은 강 공장장이고, 된장 공장 공장장은 공 공장장이다.",
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
      "أريد أن أشرب فنجاناً من القهوة في الصباح قبل أن أذهب إلى العمل.",
      "في عطلة نهاية الأسبوع أحب أن أطبخ لأصدقائي وأشاهد فيلماً جيداً.",
    ],
    advanced: [
      "كانت ريح الشمال تتجادل مع الشمس في أيهما أقوى من الأخرى، وإذا بمسافر يمر في الطريق متلفعاً بعباءة سميكة.",
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
      "कल सुबह मैं अपने दोस्त के साथ बाज़ार जाऊँगा और ताज़े फल ख़रीदूँगा।",
      "सप्ताहांत में मुझे अपने दोस्तों के लिए खाना बनाना और एक अच्छी फ़िल्म देखना पसंद है।",
    ],
    advanced: [
      "उत्तरी हवा और सूरज इस बात पर झगड़ रहे थे कि उन दोनों में ज़्यादा बलवान कौन है। तभी गरम चोगा पहने एक मुसाफ़िर उधर से गुज़रा।",
      "कच्चा पापड़, पक्का पापड़।",
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
      text: "Three brothers thought the weather this Thursday would feel much warmer near the river.",
      targets: ["/θ/ & /ð/ (th)", "/ɹ/ & /l/", "/ɪ/ vs /iː/", "/w/ vs /v/"],
      cue: "Place your tongue lightly between your teeth on “three” and “this”, and keep “feel” longer than “this”.",
    },
    {
      text: "It's important to practise a comfortable rhythm so people can understand every word without effort.",
      targets: ["Word stress", "Schwa /ə/ reduction", "Smooth word linking"],
      cue: "Lean on the stressed syllables in “important” and “comfortable”, and glide quickly through “to”, “a” and “can”.",
    },
    {
      text: "Are you taking the early train tomorrow, or would you rather drive together in the morning?",
      targets: ["Question rise ↗", "Choice contrast ↘", "Pitch range"],
      cue: "Let your pitch rise on “tomorrow” before the comma, then fall gently to close on “morning”.",
    },
  ],
  es: [
    {
      text: "Mi perro corre rápido por la carretera roja cuando regresamos temprano del trabajo.",
      meaning: "My dog runs fast along the red road when we return early from work.",
      targets: ["Rolled rr /r/", "Tapped /ɾ/", "Jota /x/", "Five pure vowels"],
      cue: "Flutter the tongue tip on “perro” and “carretera”, and keep every unstressed vowel crisp and pure.",
    },
    {
      text: "Los fines de semana me gusta cocinar para mis amigos y conversar tranquilamente en el jardín.",
      meaning: "On weekends I like to cook for my friends and chat calmly in the garden.",
      targets: ["Syllable-timed flow", "Soft /β, ð, ɣ/", "Word stress"],
      cue: "Give each syllable an even beat and keep medial b, d and g soft between vowels.",
    },
    {
      text: "¿Prefieres tomar un café caliente ahora mismo, o caminamos primero hacia la estación?",
      meaning: "Do you prefer to have a hot coffee right now, or shall we walk to the station first?",
      targets: ["Rising question ↗", "Falling alternative ↘", "Vowel linking"],
      cue: "Raise your pitch through the first question clause, then let it settle smoothly at the end.",
    },
  ],
  fr: [
    {
      text: "Un bon vin blanc se boit lentement dans une rue tranquille au cœur de Paris.",
      meaning: "A good white wine is drunk slowly in a quiet street in the heart of Paris.",
      targets: ["Nasal vowels /ɑ̃, ɛ̃, ɔ̃/", "French /y/ (rue)", "French /ʁ/", "Rounded /œ/"],
      cue: "Let air pass through your nose on “bon”, “vin” and “blanc” without pronouncing a hard final n.",
    },
    {
      text: "Le week-end, mes amis aiment cuisiner ensemble et partager un grand repas jusqu'au soir.",
      meaning: "On the weekend, my friends like to cook together and share a big meal until evening.",
      targets: ["Even syllable rhythm", "Liaison & linking", "Group-final length"],
      cue: "Link “mes‿amis” smoothly and lengthen only the last syllable of each phrase group.",
    },
    {
      text: "Est-ce que vous prenez le train de huit heures, ou préférez-vous partir un peu plus tard ?",
      meaning: "Are you taking the eight o'clock train, or do you prefer to leave a little later?",
      targets: ["Continuation rise ↗", "Question melody", "Rounded vowels"],
      cue: "Lift your voice at “huit heures” before the pause, then glide smoothly through the second half.",
    },
  ],
  de: [
    {
      text: "Ich möchte früh am Morgen durch die ruhige Straße laufen und frische Brötchen für das Frühstück kaufen.",
      meaning: "I would like to walk through the quiet street early in the morning and buy fresh rolls for breakfast.",
      targets: ["ich-sound /ç/", "Umlauts /yː, øː/", "German /ʁ/", "Consonant clusters"],
      cue: "Keep the tongue forward for /ç/ in “ich” and “möchte”, and round your lips tightly on “früh” and “Brötchen”.",
    },
    {
      text: "Am Wochenende koche ich gern für meine Freunde und erzähle ihnen von meiner letzten Reise.",
      meaning: "On weekends I like to cook for my friends and tell them about my last trip.",
      targets: ["Sentence stress", "Unstressed -e /ə/", "Final devoicing"],
      cue: "Stress the root syllables clearly and let unstressed endings like “-e” and “-en” stay light.",
    },
    {
      text: "Fahren wir heute Nachmittag mit dem Zug in die Stadt, oder bleiben wir lieber zu Hause?",
      meaning: "Are we taking the train into town this afternoon, or would we rather stay at home?",
      targets: ["Question rise ↗", "Alternative fall ↘", "ach-sound /x/"],
      cue: "Let your voice rise on “Stadt” before the comma and fall cleanly on “zu Hause”.",
    },
  ],
};

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
  const inter0 = l.intermediate[0] ?? starter0.text;
  const inter1 = l.intermediate[1] ?? inter0;
  const adv0 = l.advanced[0] ?? inter0;

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
      subtitle: "Tests how your voice rises for a question and falls on a polite statement.",
      text: `${starter2.text} ${starter0.text}`,
      meaning: starter2.meaning && starter0.meaning ? `${starter2.meaning} ${starter0.meaning}` : undefined,
      roman: starter2.roman && starter0.roman ? `${starter2.roman} ${starter0.roman}` : undefined,
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
