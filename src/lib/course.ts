/**
 * The phrasebook course: the same six everyday situations in every language,
 * four phrases each. Together with the four starter phrases in `languages.ts`
 * they form a seven-unit course. Phrases avoid forms that depend on the
 * speaker's gender, so every learner can say them as written.
 */

export interface Topic {
  id: string;
  title: string;
  blurb: string;
  /** English meanings, in the order used by every language below. */
  phrases: [string, string, string, string];
}

/** The first unit is built from each language's starter phrases. */
export const BASICS_TOPIC = {
  id: "basics",
  title: "First words",
  blurb: "Greetings, thanks and the two questions every traveller asks.",
};

export const TOPICS: Topic[] = [
  {
    id: "people",
    title: "Meeting people",
    blurb: "Introductions and keeping a first conversation going.",
    phrases: ["Nice to meet you.", "Where are you from?", "Could you speak more slowly, please?", "See you tomorrow!"],
  },
  {
    id: "travel",
    title: "Getting around",
    blurb: "Tickets, directions and distances.",
    phrases: [
      "How do I get to the airport?",
      "A ticket to the city centre, please.",
      "Is it far from here?",
      "Turn left at the corner.",
    ],
  },
  {
    id: "food",
    title: "Eating out",
    blurb: "From asking for a table to paying the bill.",
    phrases: ["A table for two, please.", "What do you recommend?", "The bill, please.", "It was delicious."],
  },
  {
    id: "shopping",
    title: "Shopping",
    blurb: "Prices, sizes and paying.",
    phrases: ["How much does this cost?", "Can I pay by card?", "Do you have a bigger size?", "I'm just looking."],
  },
  {
    id: "work",
    title: "Work and study",
    blurb: "Meetings, requests and reacting to ideas.",
    phrases: [
      "I have a meeting at ten o'clock.",
      "Could you send me the file?",
      "That's a good idea.",
      "Let me think about it.",
    ],
  },
  {
    id: "help",
    title: "Health and help",
    blurb: "The phrases you hope not to need, said so they are understood first time.",
    phrases: ["I need a doctor.", "I don't feel well.", "Can you help me?", "Where is the nearest pharmacy?"],
  },
];

type Course = Record<string, string[]>;

/** Translations by language code, then topic id. English uses the meanings themselves. */
export const COURSE: Record<string, Course> = {
  es: {
    people: ["Mucho gusto en conocerte.", "¿De dónde eres?", "¿Puedes hablar más despacio, por favor?", "¡Hasta mañana!"],
    travel: ["¿Cómo llego al aeropuerto?", "Un billete al centro, por favor.", "¿Está lejos de aquí?", "Gira a la izquierda en la esquina."],
    food: ["Una mesa para dos, por favor.", "¿Qué me recomienda?", "La cuenta, por favor.", "Estaba delicioso."],
    shopping: ["¿Cuánto cuesta esto?", "¿Puedo pagar con tarjeta?", "¿Tiene una talla más grande?", "Solo estoy mirando."],
    work: ["Tengo una reunión a las diez.", "¿Podrías enviarme el archivo?", "Es una buena idea.", "Déjame pensarlo."],
    help: ["Necesito un médico.", "No me siento bien.", "¿Puede ayudarme?", "¿Dónde está la farmacia más cercana?"],
  },
  fr: {
    people: ["Ravi de vous rencontrer.", "D'où venez-vous ?", "Pouvez-vous parler plus lentement, s'il vous plaît ?", "À demain !"],
    travel: ["Comment aller à l'aéroport ?", "Un billet pour le centre-ville, s'il vous plaît.", "C'est loin d'ici ?", "Tournez à gauche au coin de la rue."],
    food: ["Une table pour deux, s'il vous plaît.", "Qu'est-ce que vous recommandez ?", "L'addition, s'il vous plaît.", "C'était délicieux."],
    shopping: ["Combien ça coûte ?", "Je peux payer par carte ?", "Vous avez une taille plus grande ?", "Je regarde seulement."],
    work: ["J'ai une réunion à dix heures.", "Pourriez-vous m'envoyer le fichier ?", "C'est une bonne idée.", "Laissez-moi y réfléchir."],
    help: ["J'ai besoin d'un médecin.", "Je ne me sens pas bien.", "Pouvez-vous m'aider ?", "Où est la pharmacie la plus proche ?"],
  },
  de: {
    people: ["Freut mich, Sie kennenzulernen.", "Woher kommen Sie?", "Können Sie bitte langsamer sprechen?", "Bis morgen!"],
    travel: ["Wie komme ich zum Flughafen?", "Eine Fahrkarte ins Stadtzentrum, bitte.", "Ist es weit von hier?", "Biegen Sie an der Ecke links ab."],
    food: ["Einen Tisch für zwei, bitte.", "Was empfehlen Sie?", "Die Rechnung, bitte.", "Es war köstlich."],
    shopping: ["Wie viel kostet das?", "Kann ich mit Karte zahlen?", "Haben Sie das eine Nummer größer?", "Ich schaue mich nur um."],
    work: ["Ich habe um zehn Uhr eine Besprechung.", "Könnten Sie mir die Datei schicken?", "Das ist eine gute Idee.", "Lassen Sie mich darüber nachdenken."],
    help: ["Ich brauche einen Arzt.", "Mir geht es nicht gut.", "Können Sie mir helfen?", "Wo ist die nächste Apotheke?"],
  },
  it: {
    people: ["Piacere di conoscerti.", "Di dove sei?", "Puoi parlare più lentamente, per favore?", "A domani!"],
    travel: ["Come arrivo all'aeroporto?", "Un biglietto per il centro, per favore.", "È lontano da qui?", "Gira a sinistra all'angolo."],
    food: ["Un tavolo per due, per favore.", "Che cosa mi consiglia?", "Il conto, per favore.", "Era delizioso."],
    shopping: ["Quanto costa questo?", "Posso pagare con la carta?", "Avete una taglia più grande?", "Sto solo guardando."],
    work: ["Ho una riunione alle dieci.", "Potresti mandarmi il file?", "È una buona idea.", "Fammi pensare."],
    help: ["Ho bisogno di un medico.", "Non mi sento bene.", "Può aiutarmi?", "Dov'è la farmacia più vicina?"],
  },
  pt: {
    people: ["Prazer em conhecer você.", "De onde você é?", "Pode falar mais devagar, por favor?", "Até amanhã!"],
    travel: ["Como chego ao aeroporto?", "Uma passagem para o centro, por favor.", "Fica longe daqui?", "Vire à esquerda na esquina."],
    food: ["Uma mesa para dois, por favor.", "O que você recomenda?", "A conta, por favor.", "Estava delicioso."],
    shopping: ["Quanto custa isto?", "Posso pagar com cartão?", "Tem um tamanho maior?", "Só estou olhando."],
    work: ["Tenho uma reunião às dez horas.", "Você poderia me enviar o arquivo?", "É uma boa ideia.", "Deixe-me pensar."],
    help: ["Preciso de um médico.", "Não estou me sentindo bem.", "Pode me ajudar?", "Onde fica a farmácia mais próxima?"],
  },
  nl: {
    people: ["Aangenaam kennis te maken.", "Waar kom je vandaan?", "Kunt u wat langzamer praten, alstublieft?", "Tot morgen!"],
    travel: ["Hoe kom ik bij het vliegveld?", "Een kaartje naar het centrum, alstublieft.", "Is het ver hiervandaan?", "Ga op de hoek linksaf."],
    food: ["Een tafel voor twee, alstublieft.", "Wat raadt u aan?", "De rekening, alstublieft.", "Het was heerlijk."],
    shopping: ["Hoeveel kost dit?", "Kan ik met de kaart betalen?", "Heeft u een grotere maat?", "Ik kijk alleen even rond."],
    work: ["Ik heb om tien uur een vergadering.", "Kun je me het bestand sturen?", "Dat is een goed idee.", "Laat me er even over nadenken."],
    help: ["Ik heb een dokter nodig.", "Ik voel me niet lekker.", "Kunt u mij helpen?", "Waar is de dichtstbijzijnde apotheek?"],
  },
  sv: {
    people: ["Trevligt att träffas.", "Var kommer du ifrån?", "Kan du prata lite långsammare, tack?", "Vi ses i morgon!"],
    travel: ["Hur kommer jag till flygplatsen?", "En biljett till centrum, tack.", "Är det långt härifrån?", "Sväng vänster vid hörnet."],
    food: ["Ett bord för två, tack.", "Vad rekommenderar du?", "Notan, tack.", "Det var jättegott."],
    shopping: ["Hur mycket kostar den här?", "Kan jag betala med kort?", "Har ni en större storlek?", "Jag tittar bara."],
    work: ["Jag har ett möte klockan tio.", "Kan du skicka filen till mig?", "Det är en bra idé.", "Låt mig tänka på saken."],
    help: ["Jag behöver en läkare.", "Jag mår inte bra.", "Kan du hjälpa mig?", "Var ligger närmaste apotek?"],
  },
  pl: {
    people: ["Miło mi cię poznać.", "Skąd jesteś?", "Czy możesz mówić wolniej?", "Do jutra!"],
    travel: ["Jak dojechać na lotnisko?", "Poproszę bilet do centrum.", "Czy to daleko stąd?", "Skręć w lewo na rogu."],
    food: ["Poproszę stolik dla dwóch osób.", "Co warto zamówić?", "Poproszę rachunek.", "Było pyszne."],
    shopping: ["Ile to kosztuje?", "Czy mogę zapłacić kartą?", "Czy jest większy rozmiar?", "Tylko się rozglądam."],
    work: ["Mam spotkanie o dziesiątej.", "Czy możesz wysłać mi ten plik?", "To dobry pomysł.", "Muszę to przemyśleć."],
    help: ["Potrzebuję lekarza.", "Źle się czuję.", "Czy możesz mi pomóc?", "Gdzie jest najbliższa apteka?"],
  },
  uk: {
    people: ["Приємно познайомитися.", "Звідки ви?", "Говоріть, будь ласка, повільніше.", "До завтра!"],
    travel: ["Як дістатися до аеропорту?", "Один квиток до центру, будь ласка.", "Це далеко звідси?", "Поверніть ліворуч на розі."],
    food: ["Столик на двох, будь ласка.", "Що ви порадите?", "Рахунок, будь ласка.", "Було дуже смачно."],
    shopping: ["Скільки це коштує?", "Можна заплатити карткою?", "У вас є більший розмір?", "Я просто дивлюся."],
    work: ["У мене зустріч о десятій.", "Надішліть мені, будь ласка, файл.", "Це гарна ідея.", "Дайте мені подумати."],
    help: ["Мені потрібен лікар.", "Мені погано.", "Ви можете мені допомогти?", "Де найближча аптека?"],
  },
  ru: {
    people: ["Приятно познакомиться.", "Откуда вы?", "Говорите, пожалуйста, помедленнее.", "До завтра!"],
    travel: ["Как добраться до аэропорта?", "Один билет до центра, пожалуйста.", "Это далеко отсюда?", "Поверните налево на углу."],
    food: ["Столик на двоих, пожалуйста.", "Что вы посоветуете?", "Счёт, пожалуйста.", "Было очень вкусно."],
    shopping: ["Сколько это стоит?", "Можно оплатить картой?", "У вас есть размер побольше?", "Я просто смотрю."],
    work: ["У меня встреча в десять часов.", "Пришлите мне, пожалуйста, файл.", "Это хорошая идея.", "Дайте мне подумать."],
    help: ["Мне нужен врач.", "Я плохо себя чувствую.", "Вы можете мне помочь?", "Где ближайшая аптека?"],
  },
  tr: {
    people: ["Tanıştığımıza memnun oldum.", "Nerelisiniz?", "Daha yavaş konuşabilir misiniz, lütfen?", "Yarın görüşürüz!"],
    travel: ["Havalimanına nasıl gidebilirim?", "Şehir merkezine bir bilet, lütfen.", "Buradan uzak mı?", "Köşeden sola dönün."],
    food: ["İki kişilik bir masa, lütfen.", "Ne tavsiye edersiniz?", "Hesap, lütfen.", "Çok lezzetliydi."],
    shopping: ["Bu ne kadar?", "Kartla ödeyebilir miyim?", "Daha büyük bedeni var mı?", "Sadece bakıyorum."],
    work: ["Saat onda bir toplantım var.", "Dosyayı bana gönderebilir misiniz?", "Bu iyi bir fikir.", "Bir düşüneyim."],
    help: ["Bir doktora ihtiyacım var.", "Kendimi iyi hissetmiyorum.", "Bana yardım edebilir misiniz?", "En yakın eczane nerede?"],
  },
  ja: {
    people: ["はじめまして、よろしくお願いします。", "ご出身はどちらですか。", "もう少しゆっくり話してください。", "また明日！"],
    travel: ["空港へはどうやって行きますか。", "中心街までの切符を一枚ください。", "ここから遠いですか。", "角を左に曲がってください。"],
    food: ["二人用のテーブルをお願いします。", "おすすめは何ですか。", "お会計をお願いします。", "とてもおいしかったです。"],
    shopping: ["これはいくらですか。", "カードで払えますか。", "もっと大きいサイズはありますか。", "見ているだけです。"],
    work: ["十時に会議があります。", "ファイルを送っていただけますか。", "それはいい考えですね。", "少し考えさせてください。"],
    help: ["医者が必要です。", "気分が悪いです。", "手伝っていただけますか。", "一番近い薬局はどこですか。"],
  },
  zh: {
    people: ["很高兴认识你。", "你是哪里人？", "请你说慢一点，好吗？", "明天见！"],
    travel: ["去机场怎么走？", "请给我一张去市中心的票。", "离这儿远吗？", "在路口向左拐。"],
    food: ["请给我们一张两个人的桌子。", "你推荐什么？", "请结账。", "很好吃。"],
    shopping: ["这个多少钱？", "可以刷卡吗？", "有大一点的吗？", "我只是看看。"],
    work: ["我十点有一个会议。", "你能把文件发给我吗？", "这是个好主意。", "让我想一想。"],
    help: ["我需要看医生。", "我不舒服。", "你能帮我吗？", "最近的药店在哪里？"],
  },
  ko: {
    people: ["만나서 반갑습니다.", "어디에서 오셨어요?", "좀 더 천천히 말씀해 주세요.", "내일 봐요!"],
    travel: ["공항에 어떻게 가요?", "시내까지 표 한 장 주세요.", "여기에서 멀어요?", "모퉁이에서 왼쪽으로 도세요."],
    food: ["두 명 자리 부탁합니다.", "뭐가 맛있어요?", "계산서 주세요.", "정말 맛있었어요."],
    shopping: ["이거 얼마예요?", "카드로 계산할 수 있어요?", "더 큰 사이즈 있어요?", "그냥 구경하고 있어요."],
    work: ["열 시에 회의가 있어요.", "파일을 보내 주실 수 있어요?", "좋은 생각이에요.", "생각해 볼게요."],
    help: ["의사가 필요해요.", "몸이 안 좋아요.", "도와주실 수 있어요?", "가장 가까운 약국이 어디예요?"],
  },
  ar: {
    people: ["تشرفت بمعرفتك.", "من أين أنت؟", "هل يمكنك التحدث ببطء من فضلك؟", "أراك غداً!"],
    travel: ["كيف أصل إلى المطار؟", "تذكرة إلى وسط المدينة من فضلك.", "هل هو بعيد من هنا؟", "انعطف يساراً عند الزاوية."],
    food: ["طاولة لشخصين من فضلك.", "بماذا تنصحني؟", "الحساب من فضلك.", "كان لذيذاً جداً."],
    shopping: ["كم سعر هذا؟", "هل يمكنني الدفع بالبطاقة؟", "هل عندكم مقاس أكبر؟", "أنا أتفرج فقط."],
    work: ["عندي اجتماع في الساعة العاشرة.", "هل يمكنك أن ترسل لي الملف؟", "هذه فكرة جيدة.", "دعني أفكر في الأمر."],
    help: ["أحتاج إلى طبيب.", "لا أشعر أنني بخير.", "هل يمكنك مساعدتي؟", "أين أقرب صيدلية؟"],
  },
  hi: {
    people: ["आपसे मिलकर खुशी हुई।", "आप कहाँ से हैं?", "कृपया धीरे बोलिए।", "कल मिलते हैं!"],
    travel: ["हवाई अड्डे तक कैसे पहुँचें?", "शहर के केंद्र का एक टिकट दीजिए।", "क्या यह यहाँ से दूर है?", "कोने से बाएँ मुड़िए।"],
    food: ["दो लोगों के लिए एक मेज़ चाहिए।", "आप क्या सुझाएँगे?", "बिल दीजिए।", "खाना बहुत स्वादिष्ट था।"],
    shopping: ["इसका दाम क्या है?", "क्या कार्ड से भुगतान हो सकता है?", "क्या इससे बड़ा साइज़ है?", "बस देख रहे हैं।"],
    work: ["मेरी दस बजे मीटिंग है।", "क्या आप मुझे फ़ाइल भेज सकते हैं?", "यह अच्छा विचार है।", "मुझे सोचने दीजिए।"],
    help: ["मुझे डॉक्टर चाहिए।", "मेरी तबीयत ठीक नहीं है।", "क्या आप मेरी मदद कर सकते हैं?", "सबसे नज़दीकी दवा की दुकान कहाँ है?"],
  },
};

/** Romanisation for scripts a beginner may not read yet, parallel to COURSE. */
export const COURSE_ROMAN: Record<string, Course> = {
  uk: {
    people: ["Pryiemno poznaiomytysia.", "Zvidky vy?", "Hovorit, bud laska, povilnishe.", "Do zavtra!"],
    travel: ["Yak distatysia do aeroportu?", "Odyn kvytok do tsentru, bud laska.", "Tse daleko zvidsy?", "Povernit livoruch na rozi."],
    food: ["Stolyk na dvokh, bud laska.", "Shcho vy poradyte?", "Rakhunok, bud laska.", "Bulo duzhe smachno."],
    shopping: ["Skilky tse koshtuie?", "Mozhna zaplatyty kartkoiu?", "U vas ye bilshyi rozmir?", "Ya prosto dyvliusia."],
    work: ["U mene zustrich o desiatii.", "Nadishlit meni, bud laska, fail.", "Tse harna ideia.", "Daite meni podumaty."],
    help: ["Meni potriben likar.", "Meni pohano.", "Vy mozhete meni dopomohty?", "De naiblyzhcha apteka?"],
  },
  ru: {
    people: ["Priyatno poznakomitsya.", "Otkuda vy?", "Govorite, pozhaluysta, pomedlenneye.", "Do zavtra!"],
    travel: ["Kak dobratsya do aeroporta?", "Odin bilet do tsentra, pozhaluysta.", "Eto daleko otsyuda?", "Povernite nalevo na uglu."],
    food: ["Stolik na dvoikh, pozhaluysta.", "Chto vy posovetuyete?", "Schyot, pozhaluysta.", "Bylo ochen vkusno."],
    shopping: ["Skolko eto stoit?", "Mozhno oplatit kartoy?", "U vas yest razmer pobolshe?", "Ya prosto smotryu."],
    work: ["U menya vstrecha v desyat chasov.", "Prishlite mne, pozhaluysta, fayl.", "Eto khoroshaya ideya.", "Dayte mne podumat."],
    help: ["Mne nuzhen vrach.", "Ya plokho sebya chuvstvuyu.", "Vy mozhete mne pomoch?", "Gde blizhayshaya apteka?"],
  },
  ja: {
    people: ["Hajimemashite, yoroshiku onegai shimasu.", "Goshusshin wa dochira desu ka.", "Mō sukoshi yukkuri hanashite kudasai.", "Mata ashita!"],
    travel: ["Kūkō e wa dō yatte ikimasu ka.", "Chūshingai made no kippu o ichimai kudasai.", "Koko kara tōi desu ka.", "Kado o hidari ni magatte kudasai."],
    food: ["Futari-yō no tēburu o onegai shimasu.", "Osusume wa nan desu ka.", "Okaikei o onegai shimasu.", "Totemo oishikatta desu."],
    shopping: ["Kore wa ikura desu ka.", "Kādo de haraemasu ka.", "Motto ōkii saizu wa arimasu ka.", "Mite iru dake desu."],
    work: ["Jūji ni kaigi ga arimasu.", "Fairu o okutte itadakemasu ka.", "Sore wa ii kangae desu ne.", "Sukoshi kangaesasete kudasai."],
    help: ["Isha ga hitsuyō desu.", "Kibun ga warui desu.", "Tetsudatte itadakemasu ka.", "Ichiban chikai yakkyoku wa doko desu ka."],
  },
  zh: {
    people: ["Hěn gāoxìng rènshi nǐ.", "Nǐ shì nǎlǐ rén?", "Qǐng nǐ shuō màn yìdiǎn, hǎo ma?", "Míngtiān jiàn!"],
    travel: ["Qù jīchǎng zěnme zǒu?", "Qǐng gěi wǒ yì zhāng qù shì zhōngxīn de piào.", "Lí zhèr yuǎn ma?", "Zài lùkǒu xiàng zuǒ guǎi."],
    food: ["Qǐng gěi wǒmen yì zhāng liǎng ge rén de zhuōzi.", "Nǐ tuījiàn shénme?", "Qǐng jiézhàng.", "Hěn hǎochī."],
    shopping: ["Zhège duōshao qián?", "Kěyǐ shuākǎ ma?", "Yǒu dà yìdiǎn de ma?", "Wǒ zhǐshì kànkan."],
    work: ["Wǒ shí diǎn yǒu yí ge huìyì.", "Nǐ néng bǎ wénjiàn fā gěi wǒ ma?", "Zhè shì ge hǎo zhǔyi.", "Ràng wǒ xiǎng yi xiǎng."],
    help: ["Wǒ xūyào kàn yīshēng.", "Wǒ bù shūfu.", "Nǐ néng bāng wǒ ma?", "Zuìjìn de yàodiàn zài nǎlǐ?"],
  },
  ko: {
    people: ["Mannaseo bangapseumnida.", "Eodieseo osyeosseoyo?", "Jom deo cheoncheonhi malsseumhae juseyo.", "Naeil bwayo!"],
    travel: ["Gonghange eotteoke gayo?", "Sinaekkaji pyo han jang juseyo.", "Yeogieseo meoreoyo?", "Motungieseo oenjjogeuro doseyo."],
    food: ["Du myeong jari butakhamnida.", "Mwoga masisseoyo?", "Gyesanseo juseyo.", "Jeongmal masisseosseoyo."],
    shopping: ["Igeo eolmayeyo?", "Kadeuro gyesanhal su isseoyo?", "Deo keun saijeu isseoyo?", "Geunyang gugyeonghago isseoyo."],
    work: ["Yeol sie hoeuiga isseoyo.", "Paireul bonae jusil su isseoyo?", "Joeun saenggagieyo.", "Saenggakhae bolgeyo."],
    help: ["Uisaga piryohaeyo.", "Momi an joayo.", "Dowajusil su isseoyo?", "Gajang gakkaun yakgugi eodiyeyo?"],
  },
  ar: {
    people: ["Tasharraftu bimaʿrifatik.", "Min ayna anta?", "Hal yumkinuka at-taḥadduth bibuṭʾ min faḍlik?", "Arāka ghadan!"],
    travel: ["Kayfa aṣilu ilā al-maṭār?", "Tadhkira ilā wasaṭ al-madīna min faḍlik.", "Hal huwa baʿīd min hunā?", "Inʿaṭif yasāran ʿinda az-zāwiya."],
    food: ["Ṭāwila li-shakhṣayn min faḍlik.", "Bimādhā tanṣaḥunī?", "Al-ḥisāb min faḍlik.", "Kāna ladhīdhan jiddan."],
    shopping: ["Kam siʿru hādhā?", "Hal yumkinunī ad-dafʿ bil-biṭāqa?", "Hal ʿindakum maqās akbar?", "Anā atafarraj faqaṭ."],
    work: ["ʿIndī ijtimāʿ fī as-sāʿa al-ʿāshira.", "Hal yumkinuka an tursila lī al-malaff?", "Hādhihi fikra jayyida.", "Daʿnī ufakkir fī al-amr."],
    help: ["Aḥtāju ilā ṭabīb.", "Lā ashʿuru annanī bikhayr.", "Hal yumkinuka musāʿadatī?", "Ayna aqrab ṣaydaliyya?"],
  },
  hi: {
    people: ["Āpse milkar khushī huī.", "Āp kahān se hain?", "Kripayā dhīre bolie.", "Kal milte hain!"],
    travel: ["Havāī aḍḍe tak kaise pahunchen?", "Shahar ke kendra kā ek ṭikaṭ dījie.", "Kyā yah yahān se dūr hai?", "Kone se bāen muṛie."],
    food: ["Do logon ke lie ek mez chāhie.", "Āp kyā sujhāenge?", "Bil dījie.", "Khānā bahut svādishṭ thā."],
    shopping: ["Iskā dām kyā hai?", "Kyā kārḍ se bhugtān ho saktā hai?", "Kyā isse baṛā sāiz hai?", "Bas dekh rahe hain."],
    work: ["Merī das baje mīṭing hai.", "Kyā āp mujhe fāil bhej sakte hain?", "Yah achchhā vichār hai.", "Mujhe sochne dījie."],
    help: ["Mujhe ḍôkṭar chāhie.", "Merī tabīyat ṭhīk nahīn hai.", "Kyā āp merī madad kar sakte hain?", "Sabse nazdīkī davā kī dukān kahān hai?"],
  },
};
