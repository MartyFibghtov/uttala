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
  /** Natural, challenging spoken sentences that exercise the hardest sounds and cadence. */
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
      "Did you sleep well last night?",
      "I left my umbrella on the bus.",
      "We should leave a little earlier tomorrow.",
      "Have you tried the new bakery nearby?",
      "My sister is visiting us next month.",
      "What time does the grocery store close?",
      "I usually drink tea in the afternoon.",
      "Let's take a quick break outside.",
      "Do you mind if I open the window?",
      "He forgot to bring his jacket again.",
      "Our flight was delayed by an hour.",
      "Which platform does our train leave from?",
      "I'll call you back after lunch.",
    ],
    advanced: [
      "Actually, I'd rather take the earlier train.",
      "They've been working on this project all month.",
      "Would you mind checking the weather forecast first?",
      "Although the restaurant was crowded, service stayed smooth.",
      "I barely recognized him without his glasses on.",
      "She's thinking of moving closer to the river.",
      "Everything felt much warmer once we stepped inside.",
      "We should probably confirm our reservation before Friday.",
      "The traffic through the tunnel moved surprisingly fast.",
      "Have you noticed how quiet the neighborhood gets?",
      "Let's grab lunch before the afternoon meeting.",
      "That documentary about climbing was genuinely worth watching.",
      "Could you forward those photographs when you're free?",
      "The theater around the corner shows independent films.",
      "My brother volunteered to drive us there.",
      "It took ages to figure out what happened.",
      "Why did they decide to cancel tomorrow's workshop?",
      "I'm gradually getting used to the early mornings.",
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
      "Siempre tomo un café después de comer.",
      "¿A qué hora abre la panadería hoy?",
      "Esta tarde tengo que comprar fruta fresca.",
      "Prefiero caminar por el parque los domingos.",
      "¿Puedes cerrar la ventana, por favor?",
      "Llegamos un poco tarde por el tráfico.",
      "El restaurante de la esquina está lleno.",
      "Voy a llamar a mi hermana luego.",
      "Hoy hace demasiado calor para salir ahora.",
      "El teléfono se quedó sin batería ayer.",
      "¿Nos vemos frente al museo a las cinco?",
      "A veces trabajo desde casa los viernes.",
      "Ya preparé la maleta para el viaje.",
    ],
    advanced: [
      "La verdad es que no me esperaba eso.",
      "Si hubiera salido antes, habría llegado a tiempo.",
      "Ojalá deje de llover antes del sábado.",
      "Todavía me cuesta recordar el nombre del barrio.",
      "A pesar del ruido, dormí bastante bien anoche.",
      "No vale la pena discutir por ese detalle.",
      "Cuando llegué al aeropuerto, el vuelo ya salía.",
      "El proyecto requiere más tiempo del que pensábamos.",
      "Por suerte encontramos una mesa en la terraza.",
      "Ese barrio ha cambiado muchísimo en pocos años.",
      "No sé si llevar paraguas o dejarlo aquí.",
      "Creo que ese restaurante cerró el año pasado.",
      "Al final decidimos quedarnos en casa viendo películas.",
      "¡Qué raro que todavía no haya contestado nadie!",
      "De vez en cuando preparo arroz con verduras.",
      "Me alegra mucho que hayamos resuelto el problema.",
      "La carretera de la sierra tiene muchas curvas.",
      "Tan pronto como termine aquí, salgo para allá.",
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
      "Je prends toujours un café après le déjeuner.",
      "La boulangerie du quartier ouvre très tôt.",
      "J'ai oublié mon parapluie dans le métro.",
      "On se retrouve devant le cinéma ce soir.",
      "Tu veux boire quelque chose de frais ?",
      "Il pleut beaucoup depuis ce matin.",
      "Mon train a dix minutes de retard.",
      "Je dois acheter du pain avant de rentrer.",
      "Le dimanche, j'aime lire tranquillement au parc.",
      "Tu as déjà vu ce film au cinéma ?",
      "Tu peux fermer la porte derrière toi ?",
      "Mon téléphone n'a presque plus de batterie.",
      "Nous partons en vacances la semaine prochaine.",
    ],
    advanced: [
      "Franchement, je ne m'attendais pas à ça.",
      "Si tu m'avais prévenu, j'aurais attendu.",
      "Finalement, la réunion a duré moins longtemps.",
      "Il vaut mieux vérifier avant de signer.",
      "On dirait que le temps va changer bientôt.",
      "Je préfère régler ce dossier dès maintenant.",
      "Ce restaurant vaut vraiment le détour, tu verras.",
      "Malgré le bruit, j'ai réussi à dormir.",
      "Le quartier a énormément changé depuis quelques années.",
      "Je doute qu'on puisse finir avant vendredi.",
      "Heureusement, il restait une table en terrasse.",
      "À mon avis, cette solution reste la meilleure.",
      "Pourtant, elle m'avait promis de rappeler hier.",
      "Ça ne sert à rien de se presser.",
      "Tu crois vraiment que ça va marcher ?",
      "J'ai du mal à suivre son raisonnement.",
      "D'habitude, je préfère voyager en train.",
      "Bref, on a passé une excellente soirée.",
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
      "Hast du heute Abend schon etwas vor?",
      "Ich muss noch schnell beim Bäcker vorbei.",
      "Wann fängt der Film heute Abend an?",
      "Das Wetter soll am Wochenende schöner werden.",
      "Mein Bruder wohnt seit zwei Jahren in München.",
      "Kannst du mir kurz das Salz reichen?",
      "Ich habe meinen Regenschirm im Büro vergessen.",
      "Wir treffen uns um halb sieben vorm Kino.",
      "Möchtest du lieber Tee oder kaltes Wasser?",
      "Leider habe ich heute keine Zeit dafür.",
      "Auf welchem Gleis fährt unser Zug ab?",
      "Gestern sind wir lange durch den Park spaziert.",
      "Ich rufe dich gleich nach dem Essen an.",
    ],
    advanced: [
      "Eigentlich wollte ich heute früher nach Hause fahren.",
      "Könntest du das Fenster bitte einen Spalt öffnen?",
      "Obwohl es geregnet hat, sind wir draußen geblieben.",
      "Die Preise in der Innenstadt sind deutlich gestiegen.",
      "Ehrlich gesagt habe ich damit überhaupt nicht gerechnet.",
      "Ich habe völlig vergessen, ihm Bescheid zu sagen.",
      "Nach der Arbeit gehen wir meistens noch spazieren.",
      "Zum Glück haben wir unsere Regenjacken mitgenommen.",
      "Weißt du zufällig, wann die nächste Straßenbahn kommt?",
      "Diese Suppe schmeckt mit frischen Kräutern viel besser.",
      "Am besten reservieren wir für Samstag einen Tisch.",
      "Der Vortrag über Stadtplanung war überraschend spannend.",
      "Hast du deinen Schlüssel wieder im Büro gelassen?",
      "Sobald der Nebel verschwindet, wird die Aussicht herrlich.",
      "Manchmal lohnt es sich, einfach ruhig nachzufragen.",
      "Für diese Strecke brauchen wir ungefähr zwanzig Minuten.",
      "Wie lange dauert es gewöhnlich bis zur Küste?",
      "Dort drüben gibt es ein gemütliches kleines Café.",
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
      "Prendo sempre un caffè dopo pranzo.",
      "Il negozio sotto casa chiude alle sette.",
      "Ho dimenticato l'ombrello in ufficio stamattina.",
      "Ci vediamo davanti al teatro alle nove.",
      "Vuoi bere qualcosa di fresco adesso?",
      "Fuori piove forte da questa mattina.",
      "L'autobus oggi ha dieci minuti di ritardo.",
      "Devo comprare il pane prima di tornare.",
      "La domenica mi piace leggere sul balcone.",
      "Hai già visto questo film al cinema?",
      "Puoi chiudere la finestra per cortesia?",
      "Il mio telefono è quasi scarico ormai.",
      "La settimana prossima partiamo per la montagna.",
    ],
    advanced: [
      "Sinceramente non mi aspettavo una risposta così.",
      "Se lo avessi saputo, avrei aspettato volentieri.",
      "Alla fine la riunione è durata molto meno.",
      "Conviene controllare tutto prima di firmare.",
      "Sembra che il tempo stia per cambiare.",
      "Preferisco risolvere questo problema entro venerdì.",
      "Quel posto merita davvero, ci torneremo presto.",
      "Nonostante il traffico, siamo arrivati in orario.",
      "Il quartiere è cambiato tantissimo negli ultimi anni.",
      "Dubito che riescano a finire entro stasera.",
      "Per fortuna c'era ancora un tavolo libero.",
      "Secondo me questa soluzione resta la migliore.",
      "Eppure aveva promesso di richiamare in giornata.",
      "Non vale la pena arrabbiarsi per così poco.",
      "Pensi davvero che possa funzionare stavolta?",
      "Faccio fatica a seguire il suo ragionamento.",
      "Di solito preferisco prendere il treno regionale.",
      "Meno male che abbiamo portato le giacche pesanti.",
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
      "Sempre tomo um café depois do almoço.",
      "A padaria da esquina abre bem cedo.",
      "Esqueci meu guarda-chuva no ônibus hoje.",
      "Vamos nos encontrar na frente do cinema.",
      "Você quer beber alguma coisa bem gelada?",
      "Está chovendo muito desde cedo hoje.",
      "O metrô atrasou quase dez minutos agora.",
      "Preciso comprar pão antes de voltar para casa.",
      "Aos domingos gosto de ler na varanda.",
      "Você já assistiu a esse filme novo?",
      "Pode fechar a janela, por gentileza?",
      "Meu celular está quase sem bateria agora.",
      "Semana que vem viajamos para a serra.",
    ],
    advanced: [
      "Sinceramente, eu não esperava uma resposta dessas.",
      "Se eu soubesse antes, teria esperado mais.",
      "No fim das contas, a reunião durou menos.",
      "Vale a pena conferir tudo antes de assinar.",
      "Parece que o tempo vai mudar logo.",
      "Prefiro resolver esse problema até sexta-feira.",
      "Aquele restaurante novo vale mesmo a visita.",
      "Apesar do trânsito, chegamos na hora certa.",
      "O bairro mudou bastante nos últimos anos.",
      "Duvido que consigam terminar isso hoje à noite.",
      "Por sorte, ainda havia uma mesa na calçada.",
      "Na minha opinião, essa opção continua melhor.",
      "Mesmo assim, ela prometeu ligar ainda hoje.",
      "Não adianta correr se a loja já fechou.",
      "Você acha mesmo que isso vai funcionar?",
      "Às vezes é difícil acompanhar o raciocínio dele.",
      "Quando eu chegar lá, te mando uma mensagem.",
      "Ainda bem que trouxemos um casaco mais quente.",
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
      "Heb je vanavond al plannen gemaakt?",
      "Het regent vandaag bijna de hele dag.",
      "Ik moet straks nog even boodschappen doen.",
      "Hoe laat gaat de winkel vanavond dicht?",
      "Mijn zus woont sinds kort in Utrecht.",
      "Wil je een kopje thee of liever water?",
      "Ik ben mijn paraplu op het werk vergeten.",
      "Zullen we vanmiddag ergens een broodje eten?",
      "Op welk spoor komt onze trein aan?",
      "We drinken vaak koffie op het terras.",
      "Mag ik het raam een stukje openzetten?",
      "Gisteren hebben we heerlijk in het park gewandeld.",
      "Ik bel je meteen na de lunch terug.",
    ],
    advanced: [
      "Eigenlijk had ik verwacht dat het drukker was.",
      "Zullen we onderweg ergens een rustig plekje zoeken?",
      "Het uitzicht vanuit de trein was echt prachtig.",
      "Ik twijfel tussen de groene en de blauwe.",
      "Volgens mij duurt de reis ongeveer veertig minuten.",
      "Heb je enig idee waar mijn sleutels liggen?",
      "Na afloop hebben we gezellig nog wat gedronken.",
      "Gelukkig kwamen we precies op tijd aan.",
      "De schilderijen in dat museum zijn heel mooi.",
      "Kun je het geluid iets zachter zetten, alsjeblieft?",
      "Op zaterdagochtend ga ik vaak naar de markt.",
      "Hij vroeg zich af of het verstandig was.",
      "Misschien moeten we het plan opnieuw bekijken.",
      "Door het slechte weer bleven we liever binnen.",
      "Ik hoop dat het onderzoek snel duidelijkheid geeft.",
      "Waarom staat de verwarming boven nog steeds aan?",
      "De nieuwe buren hebben gisteren uitgebreid kennisgemaakt.",
      "Zou het lukken om de afspraak te verzetten?",
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
      "Har du några planer för i kväll?",
      "Det ska tydligen regna hela dagen.",
      "Jag måste handla lite mat på vägen hem.",
      "När stänger mataffären här i närheten?",
      "Min syster flyttade till Göteborg förra året.",
      "Vill du ha te eller kallt vatten?",
      "Jag glömde mitt paraply på bussen i morse.",
      "Ska vi ses vid fem utanför bion?",
      "Vilket spår går vårt tåg ifrån?",
      "Vi brukar fika på söndagar efter lunchen.",
      "Går det bra om jag öppnar fönstret?",
      "I går gick vi längs vattnet i solen.",
      "Jag ringer dig så fort jag kommer fram.",
    ],
    advanced: [
      "Egentligen hade jag gärna stannat kvar lite längre.",
      "Skulle du kunna skicka rapporten före lunch?",
      "Trots det grå vädret blev promenaden riktigt skön.",
      "Priserna i centrum har tyvärr stigit ganska kraftigt.",
      "Jag hörde faktiskt inte alls vad han sa.",
      "Efter jobbet brukar vi ta en öl tillsammans.",
      "Vilken tur att vi tog med varma kläder.",
      "Vet du när sista bussen mot kusten går?",
      "Den där soppan smakar fantastiskt med färska örter.",
      "Vi borde kanske boka ett bord till kvällen.",
      "På lördagar vaknar jag sällan före klockan nio.",
      "Föreläsningen om hållbart byggande var väldigt intressant.",
      "Ligger dina nycklar fortfarande kvar i köket?",
      "Så fort dimman lättar blir utsikten riktigt härlig.",
      "Ibland är det skönt att bara vara tyst.",
      "Den här sträckan tar ungefär tjugo minuter.",
      "Hur länge har ni bott här i stan?",
      "Bakom kyrkan ligger ett mysigt litet bageri.",
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
      "Rano zawsze piję mocną kawę.",
      "Dzisiaj pogoda jest naprawdę piękna.",
      "W sobotę robimy zakupy na targu.",
      "Czy możesz zamknąć okno przed wyjściem?",
      "Czekamy na autobus przy głównym placu.",
      "W piątek zapraszamy znajomych na kolację.",
      "Muszę jeszcze kupić świeży chleb i masło.",
      "Brat pracuje w centrum od zeszłego roku.",
      "Lubię słuchać muzyki w czasie jazdy.",
      "Na obiad przygotuję zupę pomidorową.",
      "Zwykle wracam do domu przed szóstą.",
      "W niedzielę odwiedzamy dziadków na wsi.",
      "Proszę położyć torbę obok drzwi.",
    ],
    advanced: [
      "Szczerze mówiąc, nikt nie spodziewał się takiej zmiany.",
      "Zanim podejmiemy decyzję, sprawdźmy jeszcze wszystkie szczegóły.",
      "Mimo korków zdążyliśmy na pociąg w ostatniej chwili.",
      "W tej restauracji trzeba rezerwować stolik z wyprzedzeniem.",
      "Wygląda na to, że pogoda jutro się pogorszy.",
      "Na dłuższą metę takie rozwiązanie się nie sprawdzi.",
      "Zabierz ciepły sweter, bo wieczorem robi się chłodno.",
      "Wracając znad morza, zawsze zatrzymujemy się na kawę.",
      "Przepraszam za spóźnienie, ale tramwaj utknął w centrum.",
      "Co do terminu, możemy wszystko przesunąć na poniedziałek.",
      "Szkoda przepłacać za rzeczy, których prawie nie używamy.",
      "Ostatnio ceny w sklepach poszły wyraźnie w górę.",
      "Ten film trzyma w napięciu od pierwszej minuty.",
      "Na wszelki wypadek weź lepiej ze sobą parasol.",
      "W całym domu pachnie świeżo mieloną kawą.",
      "Najwyraźniej doszło do jakiegoś nieporozumienia przy rezerwacji.",
      "Chętnie pójdziemy na ten koncert, jeśli zostaną bilety.",
      "Po tak długiej podróży marzymy tylko o odpoczynku.",
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
      "Увечері ми часто дивимося цікавий фільм.",
      "Сьогодні на вулиці тепло і сонячно.",
      "У суботу вранці ми йдемо на ринок.",
      "Зачиніть, будь ласка, вікно перед виходом.",
      "Ми чекаємо на автобус біля зупинки.",
      "У п'ятницю до нас прийдуть добрі друзі.",
      "Треба ще купити свіжого хліба та сиру.",
      "Брат працює в центрі з минулого року.",
      "Я люблю слухати музику під час дороги.",
      "На обід ми готуємо борщ і салат.",
      "Зазвичай я повертаюся додому перед шостою.",
      "У неділю ми завжди телефонуємо батькам.",
      "Покладіть, будь ласка, сумку біля дверей.",
    ],
    advanced: [
      "Чесно кажучи, ніхто не очікував такого швидкого результату.",
      "Перш ніж ухвалювати рішення, варто перевірити всі деталі.",
      "Через затори ми ледве встигли на ранковий потяг.",
      "У цьому ресторані столик краще бронювати заздалегідь.",
      "Схоже на те, що завтра погода помітно погіршиться.",
      "Зрештою, такий варіант навряд чи спрацює як слід.",
      "Візьми теплу кофту, бо ввечері біля річки прохолодно.",
      "Коли повертаємося з гір, завжди зупиняємося на обід.",
      "Перепрошую за запізнення, але трамвай застряг на перехресті.",
      "Щодо термінів, пропоную перенести зустріч на понеділок.",
      "Не варто переплачувати за речі, якими рідко користуєшся.",
      "Останнім часом ціни в магазинах відчутно зросли.",
      "Цей фільм тримає в напрузі з першої хвилини.",
      "Про всяк випадок візьміть із собою теплу куртку.",
      "На кухні смачно пахне свіжою кавою та випічкою.",
      "Мабуть, сталося якесь непорозуміння під час бронювання.",
      "Із задоволенням підемо на виставку, якщо матимемо час.",
      "Після довгої дороги найбільше хочеться спокійно відпочити.",
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
      "Вечером мы часто смотрим интересный фильм.",
      "Сегодня на улице тепло и солнечно.",
      "В субботу утром мы ходим на рынок.",
      "Закройте, пожалуйста, окно перед уходом.",
      "Мы ждём автобус рядом с остановкой.",
      "В пятницу к нам придут старые друзья.",
      "Надо ещё купить свежий хлеб и сыр.",
      "Брат работает в центре с прошлого года.",
      "Я люблю слушать музыку по дороге домой.",
      "На обед мы готовим суп и салат.",
      "Обычно я возвращаюсь домой к шести часам.",
      "В воскресенье мы всегда звоним родителям.",
      "Поставьте, пожалуйста, сумку около двери.",
    ],
    advanced: [
      "Честно говоря, никто не ожидал такого быстрого результата.",
      "Прежде чем принимать решение, стоит проверить все детали.",
      "Несмотря на пробки, мы успели на поезд вовремя.",
      "В этом ресторане столик лучше бронировать заранее.",
      "Похоже на то, что завтра погода заметно испортится.",
      "В конечном счёте такой вариант вряд ли сработает.",
      "Возьми тёплый свитер, а то вечером станет прохладно.",
      "Когда возвращаемся из поездки, всегда заезжаем поужинать.",
      "Извините за опоздание, но трамвай застрял в центре.",
      "Что касается сроков, давайте перенесём встречу на понедельник.",
      "Нет смысла переплачивать за вещи, которыми редко пользуешься.",
      "В последнее время цены в магазинах ощутимо выросли.",
      "Этот фильм держит в напряжении с первой минуты.",
      "На всякий случай возьмите с собой тёплую куртку.",
      "На кухне вкусно пахнет свежим кофе и выпечкой.",
      "Очевидно, при бронировании возникло небольшое недоразумение.",
      "С удовольствием сходим на выставку, если останется время.",
      "После долгой дороги больше всего хочется спокойно отдохнуть.",
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
      "Bugün hava düne göre biraz daha serin.",
      "Hafta sonu arkadaşlarla yeni kafeye gideceğiz.",
      "Eve dönerken fırından taze simit ve ekmek alacağım.",
      "Bu akşam evde kalıp güzel bir film izleyeceğim.",
      "Kahvaltıda genellikle peynir, zeytin ve domates yeriz.",
      "Otobüs durağı hemen şu binanın arkasında kalıyor.",
      "Çantamı evde unuttuğum için geri dönmek zorunda kaldım.",
      "Pazar sabahları geç kalkıp uzun bir kahvaltı yaparız.",
      "Yeni işin için seni gönülden tebrik ederim.",
      "Yarın öğleden sonra müzenin önünde buluşalım mı?",
      "Şemsiyeni yanına al, birazdan yağmur yağmaya başlayacak.",
      "Bu ceket sana çok yakıştı, rengi de harika.",
      "Kapıya gelince bana haber ver, hemen inerim.",
    ],
    advanced: [
      "Yağmur dinene kadar şu küçük kitapçıda biraz bekleyelim.",
      "Toplantının bu kadar uzun süreceğini hiç tahmin etmemiştim.",
      "Yolculuk sırasında gördüğümüz köylerin manzarası gerçekten büyüleyiciydi.",
      "Konuyu yarın sabah daha sakin bir kafayla konuşalım.",
      "Garsonun önerdiği zeytinyağlı mezelerin hepsi birbirinden tazeydi.",
      "Trafik yüzünden uçağa son anda yetişebildik.",
      "Küçük ayrıntılar yüzünden planımızı bozmaya hiç gerek yok.",
      "Uzun zamandır görüşemediğimiz arkadaşlarla nihayet bir araya geldik.",
      "Yeni taşındığımız mahalledeki komşularımız oldukça güler yüzlü.",
      "Rüzgâr öyle sert esiyordu ki yürümekte bile zorlandık.",
      "Söylediklerine katılıyorum ama bu konuda biraz farklı düşünüyorum.",
      "Sözleşmeyi imzalamadan önce bütün şartları dikkatlice gözden geçirmeliyiz.",
      "Fırından yeni çıkmış sıcacık böreğin kokusu sokağı sarmıştı.",
      "Keşke yaz tatili biletlerimizi birkaç hafta önce alsaydık.",
      "Merak etme, bu sorunu bir şekilde mutlaka çözeceğiz.",
      "Üst kattaki tadilat yüzünden sabahtan beri gürültü dinmedi.",
      "Hızlıca hazırlanıp çıkalım, yoksa ilk vapuru kaçıracağız.",
      "Bana kalırsa şehrin en güzel zamanı ilkbahar aylarıdır.",
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
      "毎朝コーヒーを飲みます。",
      "今日は少し寒いですね。",
      "図書館で本を借ります。",
      "新しい靴を買いました。",
      "昼ご飯はもう食べましたか。",
      "仕事は五時に終わります。",
      "窓を開けてもいいですか。",
      "写真を撮りましょうか。",
      "明日は雨が降りそうです。",
      "日本語を勉強しています。",
      "よく聞こえませんでした。",
      "今、ちょっと忙しいです。",
      "次の電車に乗ります。",
    ],
    advanced: [
      "せっかくの休みなのに雨ですね。",
      "そろそろ出かけたほうがいいよ。",
      "思ったよりずっと簡単だった。",
      "すっかり忘れてしまいました。",
      "念のため確認しておこう。",
      "最近ちょっと寝不足なんです。",
      "どうぞ遠慮なく召し上がってください。",
      "この店、いつも混んでいますね。",
      "話がちょっと長くなりそうです。",
      "なるほど、そういうことですか。",
      "ちょうど今、着いたところです。",
      "あいにく今日は都合が悪いんです。",
      "これ、ずっと欲しかったんです。",
      "無理をしないでくださいね。",
      "週末はのんびり過ごしたいです。",
      "また近いうちに集まりましょう。",
      "道に迷って少し遅れました。",
      "気づいたらもう夕方だった。",
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
      "我每天早上喝一杯热茶。",
      "今天外面的风很大。",
      "下班以后我去超市买菜。",
      "你平时喜欢听什么音乐？",
      "请问洗手间在几楼？",
      "这件衣服的颜色很漂亮。",
      "我还没有吃晚饭呢。",
      "周末我想在家好好休息。",
      "外面开始下小雨了。",
      "我把手机忘在家里了。",
      "图书馆里非常安静。",
      "天气预报说下午会晴。",
      "今年秋天我们去爬山吧。",
    ],
    advanced: [
      "没想到路上堵车这么严重。",
      "说实话，我也有点儿紧张。",
      "这家馆子的菜味道真不错。",
      "幸好带了伞，差点淋湿了。",
      "怪不得今天街上这么热闹。",
      "你先忙着，我一会儿再过来。",
      "顺便帮我拿一下快递好吗？",
      "这件事我们还是当面聊吧。",
      "本来打算出门，突然下起雨来。",
      "真巧，我正准备找你呢。",
      "时间过得真快，一晃半年了。",
      "难得大家都在，干脆一起吃饭。",
      "我实在想不起他的名字了。",
      "别着急，事情总会解决的。",
      "最近工作太忙，都没空运动。",
      "难怪找不到，原来在这儿呢！",
      "听起来这个主意挺靠谱的。",
      "要不咱们换一家餐厅试试？",
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
      "오늘 날씨가 정말 좋네요.",
      "아침마다 따뜻한 차를 마셔요.",
      "도서관에서 조용히 책을 읽어요.",
      "주말에 공원에서 같이 산책할까요?",
      "지금 조금 바빠서 나중에 전화할게요.",
      "버스 정류장이 여기서 가까워요?",
      "어제 새로 산 옷을 입었어요.",
      "점심시간에 회사 앞에서 만나요.",
      "한국어를 매일 조금씩 연습해요.",
      "창문을 열면 시원한 바람이 불어요.",
      "차가 많이 막혀서 조금 늦을 것 같아요.",
      "이 근처에 맛있는 식당이 있어요?",
      "퇴근하고 집에 가서 푹 쉬었어요.",
    ],
    advanced: [
      "생각보다 일이 훨씬 빨리 끝났어요.",
      "오랜만에 친구들을 만나서 수다를 떨었어요.",
      "눈 깜짝할 사이에 벌써 주말이네요.",
      "솔직히 말하면 저도 조금 걱정돼요.",
      "마음에 드는 물건을 겨우 찾았어요.",
      "집에 우산을 두고 와서 다 젖었어요.",
      "이야기에 빠져서 시간 가는 줄 몰랐어요.",
      "무리하지 말고 천천히 해도 괜찮아요.",
      "하마터면 마지막 기차를 놓칠 뻔했어요.",
      "그 가게는 언제 가도 사람이 많더라고요.",
      "별일 없으면 이번 주에 같이 밥 먹어요.",
      "요즘 잠을 설쳐서 하루 종일 피곤해요.",
      "약속 시간에 딱 맞춰서 도착했어요.",
      "괜찮으시면 제가 먼저 말씀드려도 될까요?",
      "기분 전환 삼아 바람 좀 쐬고 올게요.",
      "겉으로 보기에는 아주 멀쩡해 보였어요.",
      "사정이 있어서 이번 모임에는 못 가요.",
      "날씨가 쌀쌀하니까 따뜻하게 챙겨 입고 나가세요.",
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
      "الطقس اليوم لطيف جداً ومناسب للمشي.",
      "أحب قراءة الكتب في المساء قبل النوم.",
      "سنلتقي بالأصدقاء في المطعم الجديد غداً.",
      "هل تفضل الشاي بالنعناع أم عصير البرتقال؟",
      "أحتاج إلى شراء فواكه طازجة من السوق.",
      "يصل الضيوف إلى المطار بعد ساعة تقريباً.",
      "الطريق إلى وسط المدينة مزدحم في الصباح.",
      "تبدأ العطلة الصيفية في نهاية هذا الشهر.",
      "أعمل من البيت يومين في الأسبوع فقط.",
      "نسيت مفاتيحي على الطاولة في غرفة الجلوس.",
      "هل يمكنك فتح النافذة ليدخل بعض الهواء؟",
      "المكتبة العامة قريبة جداً من بيتنا الجديد.",
      "أتعلم اللغة العربية لأنني أحب السفر والتواصل.",
    ],
    advanced: [
      "لم أتوقع أن يستغرق الاجتماع كل هذا الوقت.",
      "أصبح الطريق السريع أهدأ بكثير بعد منتصف الليل.",
      "لا بأس إذا تأخرنا قليلاً بسبب الازدحام المروري.",
      "أنصحك بتجربة هذا الطبق الشهير في المطعم.",
      "علينا مراجعة التفاصيل بدقة قبل توقيع العقد النهائي.",
      "تغيرت خطط السفر فجأة بسبب الأحوال الجوية السيئة.",
      "أعتقد أن الصبر والهدوء يحلان معظم المشكلات اليومية.",
      "على الرغم من التعب، استمتعنا كثيراً بالرحلة الجبلية.",
      "يصعب سماع الحديث بوضوح وسط هذه الضوضاء العالية.",
      "تسببت الرياح القوية في انقطاع الكهرباء عن الحي.",
      "ساعدتني نصيحتك كثيراً في اتخاذ القرار الصحيح.",
      "رائحة الخبز الطازج تملأ المخبز كل صباح.",
      "أفضل قضاء العطلة بعيداً عن ضجيج المدينة.",
      "لحسن الحظ وصلنا إلى المطار قبل الإقلاع بقليل.",
      "من الأفضل أن نغادر قبل ازدحام الشوارع.",
      "بصراحة، أوافقك الرأي تماماً في هذه المسألة المهمة.",
      "كنا نتحدث عن ذكريات الطفولة حتى ساعة متأخرة.",
      "يحتاج إتقان أي مهارة جديدة إلى ممارسة يومية.",
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
      "आज मौसम कल से थोड़ा ठंडा है।",
      "सर्दियों में गरम चाय बहुत अच्छी लगती है।",
      "क्या आप मुझे बस स्टॉप का रास्ता बताएँगे?",
      "रविवार को हम सब घर पर ही रुकेंगे।",
      "कृपया कमरे की एक खिड़की थोड़ी खोल दीजिए।",
      "मैंने मेज़ पर घर की चाबी रखी है।",
      "हम रोज़ सुबह सात बजे नाश्ता करते हैं।",
      "दफ़्तर से लौटते समय ताज़ी सब्ज़ियाँ ले आना।",
      "बच्चे शाम को पार्क में खेल रहे हैं।",
      "चलो, आज रात बाहर खाना खाते हैं।",
      "मुझे हिंदी बोलने में बहुत मज़ा आता है।",
      "आज बाहर बहुत तेज़ हवा चल रही है।",
      "अगले महीने हम पहाड़ों पर घूमने जाएँगे।",
    ],
    advanced: [
      "लगता है आज शाम तक बारिश ज़रूर होगी।",
      "लंबी बैठक के बाद आखिरकार बात बन गई।",
      "इतने शोर में कुछ भी सुनाई नहीं देता।",
      "भीड़ के कारण गाड़ी समय पर नहीं पहुँची।",
      "पुराने बाज़ार की रौनक देखते ही बनती है।",
      "फैसला लेने से पहले अच्छी तरह सोच लीजिए।",
      "समय मिला तो रास्ते में उनसे ज़रूर मिलेंगे।",
      "मसालों की खुशबू पूरे घर में फैल गई।",
      "ईमानदारी से कहूँ तो यह योजना बढ़िया है।",
      "ठंडी हवा से मौसम अचानक सुहावना हो गया।",
      "चिंता मत कीजिए, सब कुछ ठीक हो जाएगा।",
      "गाँव की शांत सुबह बहुत सुकून देती है।",
      "ट्रेन छूटने में कुछ ही मिनट बाकी थे।",
      "काम निपटाकर हम सब तुरंत घर निकलेंगे।",
      "सफ़र पर निकलने से पहले सामान जाँच लें।",
      "जल्दबाज़ी करने से काम बिगड़ भी सकता है।",
      "पुरानी तस्वीरें देखते ही बचपन याद आ गया।",
      "हर दिन अभ्यास करने से आत्मविश्वास बढ़ता है।",
    ],
  },
];

export const isLanguage = (code: unknown): code is string =>
  typeof code === "string" && LANGUAGES.some((l) => l.code === code);

export const getLanguage = (code: string): Language =>
  LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

function starterPhrases(l: Language): Phrase[] {
  return l.starter.map((text, i) => ({
    text,
    meaning: l.code === "en" ? undefined : STARTER_MEANINGS[i],
    roman: l.starterRoman?.[i],
  }));
}

/** Built-in practice texts for a language and level. */
export function textsFor(code: string, level: LevelId): Phrase[] {
  const l = getLanguage(code);
  if (level === "beginner") return unitsFor(l.code).flatMap((u) => u.phrases);
  return l[level].map((text) => ({ text }));
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
      { ...BASICS_TOPIC, phrases: starterPhrases(l) },
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
