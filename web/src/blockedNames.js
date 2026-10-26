// Words that can't appear in a nickname: profanity, slurs, sexual words and curses, in English,
// Hebrew, Hebrew slang of Arabic origin, and their common transliterations and leetspeak.
// This is a client-side check only (Firestore rules can't run a list like this), so it keeps honest
// players from picking these names; it isn't a security boundary.
//
// Every term is blocked anywhere inside the name, and letters split by spaces, - _ = or digits
// still count ("f u c k", "כ-ו-ס", "z0-na"). Words that are also real names are blocked too.
// EXCEPTIONS holds a few very common innocent words that contain a short term; only that exact
// word is skipped and the rest of the name is still checked.

const CONTAINS_EN = [
  'fuck', 'fucc', 'fukk', 'fvck', 'fcuk', 'phuck', 'phuk', 'fuckr', 'fucker', 'fucking', 'fuking', 'fukin',
  'motherfuck', 'mothafuck', 'muthafuck', 'mofo', 'shit', 'bullshit', 'sheeit', 'shiit', 'bitch', 'biatch', 'beyotch',
  'bastard', 'asshole', 'arsehole', 'asshat', 'assclown', 'asswipe', 'assfuck', 'dumbass', 'jackass', 'fatass',
  'dickhead', 'dickface', 'dickwad', 'dicksuck', 'cocksuck', 'cockhead', 'sucker', 'suckmy', 'suckdick',
  'wanker', 'wanking', 'jerkoff', 'jackoff', 'cunts', 'cunting', 'cuntface', 'cunty', 'twats', 'pussy', 'pussies', 'pussie',
  'slut', 'whore', 'hoebag', 'skank', 'hooker', 'nigger', 'nigga', 'niggah', 'negro', 'faggot', 'fagot', 'faggit',
  'retard', 'tranny', 'shemale', 'dykes', 'kikes', 'wetback', 'beaner', 'raghead', 'towelhead', 'sandnigg',
  'hitler', 'heilhitler', 'siegheil', 'kkk', 'whitepower', 'porn', 'penis', 'vagina', 'dildo', 'vibrator',
  'blowjob', 'handjob', 'rimjob', 'footjob', 'boobjob', 'titjob', 'titties', 'titty', 'boobies', 'nipple',
  'cumshot', 'cumslut', 'cumdump', 'creampie', 'gangbang', 'bukkake', 'jizz', 'spunk', 'orgasm', 'masturbat',
  'butthole', 'buttplug', 'buttfuck', 'analsex', 'clitoris', 'scrotum', 'testicle', 'ballsack', 'nutsack',
  'erection', 'hardon', 'milf', 'dilf', 'incest', 'pedophil', 'paedophil', 'rapist', 'molest', 'bestiality',
  'zoophil', 'nudes', 'sexting', 'hentai', 'onlyfans', 'pornhub', 'xvideos', 'xhamster', 'bdsm', 'fetish',
  'bollock', 'bugger', 'tosser', 'bellend', 'knobhead', 'knobend', 'minge', 'shithead', 'shitface', 'goddamn',
  'douche', 'piss', 'cocksucker', 'motherfucker', 'sonofabitch', 'killyourself',   // Hebrew and Arabic slang written in English letters.
  'kusemek', 'kusemak', 'kusomak', 'kusomo', 'kosomak', 'kosomo', 'kusummak', 'kusumak', 'kusochtak', 'kusohtak',
  'kusukhtak', 'kusachtak', 'kusima', 'kusimma', 'kusamak', 'kusamuk', 'sharmuta', 'sharmoota', 'sharmota',
  'sharmut', 'sharmot', 'charmuta', 'benzona', 'binzona', 'bnzona', 'yabnzona', 'yabenzona', 'yaibnzona',
  'zonot', 'manyak', 'maniak', 'manyok', 'maniok', 'manyek', 'yinaal', 'yinal', 'yenaal', 'inaal',   'ahushar', 'achusharmut', 'koksinel', 'cocksinel', 'zubi', 'zubbi', 'metumtam', 'mefager', 'arbush',
  // Spanish, Russian, Arabic and others common online.
  'puta', 'puto', 'mierda', 'cabron', 'pendejo', 'chinga', 'verga', 'culero', 'joder', 'blyat', 'blyad',
  'pizda', 'pizdec', 'khuy', 'nahui', 'nahuy', 'yebat', 'yobany', 'scheisse',   'arschloch', 'hurensohn', 'fotze', 'wichser', 'merde', 'putain', 'salope', 'connard', 'enculé', 'vaffanculo',
  'cazzo', 'stronzo', 'kurwa', 'sikerim', 'orospu', 'sharmouta', 'teezak',
];

const CONTAINS_HE = [
  'זונה', 'זונות', 'בןזונה', 'בנזונה', 'בתזונה', 'יבנזונה', 'יאבנזונה', 'יבןזונה', 'שרמוט', 'שרמוטה',
  'שרמוטות', 'שרמיט', 'שרמוטת', 'אחושרמוט', 'אחוהשרמוט', 'אחשרמוט', 'כוסאמ', 'כוסעמ', 'כוסאומ', 'כוסומ',
  'כוסאוח', 'כוסאוכ', 'כוסאחות', 'כוסאחת', 'כוסאבוכ', 'כוסשלאמא', 'כוסאמאשל', 'כוסעמכ', 'כוסעמק', 'קוסאמ',
  'קוסעמ', 'קוסאוח', 'קוסומ', 'כוסית', 'כוסיות', 'כוסון', 'כוסונ', 'מניאק', 'מנייק', 'מניאקים', 'מניאקית',
  'זיונ', 'זיונים', 'מזדיינ', 'הזדיינ', 'תזדיינ', 'להזדיינ', 'זדיינ', 'לזיינ', 'זיינתי', 'זיינו', 'זיינת',
  'יזיינ', 'נזיינ', 'מזיינ', 'מוצצ', 'מוצצת', 'למצוצ', 'תמצצ', 'פורנו', 'פורנוגרפ', 'אורגזמ', 'אוננות', 'מאוננ',
  'לאוננ', 'דגדגנ', 'קוקסינל', 'מתרוממ', 'ערבוש', 'ערבושים', 'כושים', 'כושית', 'היטלר', 'נאצים', 'ינעלאבו',
  'ינעלדינ', 'ינעלרב', 'ינעלאבוכ', 'ילענאבו', 'ילענדינ', 'שמוק', 'שמוקים', 'פוצים', 'בולשיט', 'מאדרפאק',
  'פאקיו', 'פאקינג', 'פאקר', 'סאקר', 'ביאצ', 'חרמנ', 'חרמנית', 'זקפה', 'זקפות', 'מציצות', 'ציצים',
  'ציצימ', 'שפיכה', 'תחתים', 'מפגרים', 'מפגרת', 'מטומטמ', 'מטומטמת', 'אידיוט', 'אידיוטית',
  'קקהבראש', 'חראבראש', 'יאחרא', 'יאחמאר', 'יאכלב', 'בנכלב', 'בןכלב', 'בתכלב', 'יאכלבה', 'כלבתא', 'יאזבל',
  'זונהבת', 'אמאשלךזונה', 'נאציסט', 'דפוקים', 'אוכלזין', 'אוכלתזין', 'יאזונה',
  'כוסאוחתכ', 'כוסאוחתק', 'כוסאומכ', 'כוסאחותכ', 'כוסאמכ', 'כוסאמק', 'כוסעמאק', 'כוסעומכ', 'קוסאמק',
  'אירבכ', 'אירפיכ', 'אירבכוס', 'טיזכ', 'טיזק', 'טיזאק', 'שרמוטתא', 'חרהבתחת',
];

const EXACT_EN = [
  'ass', 'asses', 'arse', 'arses', 'anal', 'anus', 'fag', 'fags', 'dick', 'dicks', 'cock', 'cocks', 'cunt', 'twat',
  'wank', 'wanks', 'prick', 'pricks', 'tit', 'tits', 'boob', 'boobs', 'cum', 'cums', 'sex', 'sexy', 'sexx', 'sexi',
  'rape', 'raped', 'rapes', 'nazi', 'nazis', 'hoe', 'hoes', 'thot', 'thots', 'slag', 'shag', 'knob',   'semen', 'horny', 'orgy', 'pedo', 'paedo', 'clit', 'boner', 'suck', 'sucks', 'spaz',
  'spic', 'spick', 'chink', 'gook', 'kike', 'coon', 'paki', 'dyke', 'homo',   'wtf', 'stfu', 'gtfo', 'fml', 'kys', 'xxx', 'nsfw', 'fck', 'fuk', 'fuq', 'fux', 'fuc', 'phuq', 'sht',
  'btch', 'bich', 'biatch', 'cnt', 'dik', 'dikk', 'kok', 'puss', 'poon', 'pussi', 'jizm', 'tard',   'nigg', 'niga', 'nibba', 'hitlr', 'kunt', 'whor', 'hore',
  'skeet', 'vajay', 'peen', 'pecker', 'schlong',   'shat', 'shits', 'shite', 'feck',   'cuck',   // Hebrew and Arabic slang written in English letters.
  'kus', 'kuss', 'koos', 'kusit', 'kusiot', 'zona', 'zonah', 'zayin', 'zubb', 'zibi', 'zebi',
  'sharmut', 'manyak', 'tahat', 'tiz', 'tizi', 'teez', 'ahbal', 'debil', 'dabil',
  'tembel', 'timbel', 'homo', 'mefager', 'yakalb', 'putz',
  'shmuk', 'schmuck', 'shmock', 'kusi', 'kussi', 'ayri', 'eyri', 'zubi', 'zobi',   'kuss',
];

const EXACT_HE = [
  'כוס', 'קוס', 'כוסה', 'כוסכ', 'כוסים', 'זינ', 'זינים', 'הזינ', 'יזינ', 'זיינ', 'זיינה', 'פות', 'פותה', 'ציצי',
  'ציצ', 'תחת', 'תחתכ', 'תחתשל', 'חרא', 'חארה', 'חראות', 'סקס', 'סקסי', 'סקסית', 'פוצ',
  'פוצה', 'שיט', 'פאק', 'פאקמ', 'סאק', 'ביצ', 'זבל', 'זבלה', 'דפוק', 'דפוקה', 'מפגר', 'דביל', 'דבילית',
  'טמבל', 'טמבלית', 'אהבל', 'אהבלה', 'מטומטמ', 'הומו', 'נאצי', 'נאצית', 'כושי', 'חמאר', 'כלבה',
  'ינעל', 'ילענ', 'זבי', 'זובי', 'טיז', 'נייכ', 'ניכ', 'שרמוט', 'זונ', 'מוצצ',   'אנאל', 'פורנ', 'ליזיינ', 'כוסאמא',
  'אונס', 'פדופיל', 'פדופילים', 'נבלה', 'נבלות', 'שמוקה',
];


// Added in the second pass: words that are also names or ordinary words, and more variants.
const MORE_EN = [
  'dick', 'dik', 'dikk', 'dicc', 'dyck', 'diick', 'dickk', 'dck', 'deek', 'dicky', 'dickie', 'dixx',
  'kos', 'koss', 'kuz', 'kuus', 'wang', 'wangs', 'hara', 'harra', 'khara', 'chara', 'hhara', 'kalb', 'yakalb',
  'suka', 'cyka', 'huy', 'ass', 'arse', 'tit', 'cum', 'sex', 'anal', 'anus', 'rape', 'hoe', 'cock', 'nazi',
  'finn', 'zain', 'zayn', 'zib', 'zebbi', 'tizak', 'teezak', 'manyuk', 'manyac', 'maniac', 'sharmoot',
  'zonna', 'zoona', 'benzonah', 'kusemak', 'kussemak', 'kusummak', 'kosomak', 'airi', 'ayir', 
  'nude', 'naked', 'strip', 'stripper', 'escort', 'pimp', 'gigolo', 'perv', 'pervert', 'incel', 'idiot',
  'moron', 'stupid', 'loser', 'dumb', 'freak', 'slave', 'damn', 'crap', 'turd', 'poop', 'fart', 'butt',
  'balls', 'nuts', 'willy', 'dong', 'bimbo', 'hump', 'horny', 'kinky', 'lewd', 'nsfw', 'onlyfan', 'sugardad',
  'thong', 'panties', 'sperm', 'semen', 'condom', 'viagra', 'pedo', 'grope', 'molest', 'pussy',
  'bitch', 'shit', 'shiet', 'fack', 'fak', 'fuc', 'fuk', 'fuq', 'fck', 'phuk', 'wtf',
];
const MORE_HE = [
  'דיק', 'דיקים', 'דיקהד', 'דיקי', 'פינ', 'פינים', 'הומו', 'הומואים', 'כושי', 'כושים', 'ערבוש', 'ערבושה',
  'אשכנאצ', 'פרענק', 'פרחה', 'פרחות', 'קוקסינלית', 'ממזר', 'ממזרים', 'ממזרה', 'מנוול', 'מנוולת', 'חלאה',
  'חלאות', 'נבלה', 'תסתומ', 'שתמות', 'יאמניאק', 'יאזבל', 'יאשרמוטה', 'יאכוס', 'כוסשלכ', 'כוסשלאמכ',
  'כוסרבאכ', 'כוסאמאשכ', 'כוסאחותכ', 'קוסאחתכ', 'כוסעומק', 'זונהבנזונה', 'תזיינ', 'מזדיינים', 'זיינ',
  'ביצים', 'שדיים', 'פטמה', 'פטמות', 'עירומ', 'בולבול', 'בולבולים', 'אנס', 'אונס', 'אנסים', 'פדופיל',
  'אנאלי', 'סקסי', 'סקסית', 'פורנו', 'סטריפטיז', 'חשפנ', 'זונוֹת', 'זינ', 'זיןשלי', 'מציצה', 'למצוצ',
  'גמירה', 'ביאצ', 'ביצ', 'פאק', 'פאקינג', 'שיט', 'חרא', 'חארה', 'תחת', 'כוס', 'קוס', 'כוסית', 'ציצי',
  'ציצים', 'פות', 'פוצ', 'מפגר', 'דביל', 'אידיוט', 'טמבל', 'אהבל', 'מטומטמ', 'זבל', 'דפוק', 'כלבה',
  'ינעל', 'ילענ', 'זבי', 'זובי', 'טיז', 'ניכ', 'נייכ', 'אירי', 'איירי', 'חמאר', 'שרמוט', 'זונה', 'מוצצ',
  'נאצי', 'היטלר', 'שמוק', 'פוצימ', 'חרמנ', 'זקפ', 'שפיכ', 'אורגזמ', 'אוננ', 'דגדגנ', 'מתרוממ', 'לסבו',
];

// Identity words and slurs for gay, lesbian, bi and trans people. Kids use them to mock others,
// so they're blocked in nicknames too.
const IDENTITY_EN = [
  'gay', 'gays', 'gey', 'ghey', 'g4y', 'gaay', 'lesbian', 'lesbo', 'lesbi', 'lesb', 'lezzie', 'lezzy', 'lezbo',
  'lezbian', 'trans', 'tranny', 'trany', 'trannie', 'transgender', 'transexual', 'transsexual', 'queer', 'qweer',
  'homo', 'homos', 'homosexual', 'bisexual', 'bisexsual', 'bisexual', 'lgbt', 'lgbtq', 'lgbtqia', 'fag', 'fagg',
  'faggot', 'faggit', 'fagot', 'dyke', 'dike', 'shemale', 'ladyboy', 'twink', 'poof', 'poofter', 'pouf', 'sissy',
  'pansy', 'nancyboy', 'butch', 'tgirl', 
];
const IDENTITY_HE = [
  'גיי', 'גייז', 'לסבי', 'לסבית', 'לסביות', 'לסבו', 'טרנס', 'טרנסית', 'טרנסג\'נדר', 'טרנסגנדר', 'טרנסים',
  'טרנסווסטיט', 'קוויר', 'קויר', 'ביסקסואל', 'ביסקסואלית', 'בי סקסואל', 'להט״ב', 'להטב', 'להטבק', 'הומו', 'הומואים',
  'הומואית', 'הומוסקסואל', 'קוקסינל', 'קוקצינל', 'קוקסנל', 'אוחצ\'ה', 'אוחצה', 'אוחצ', 'שימייל', 'שי מייל',
  'מתרוממ', 'מתרוממת', 'דראג קווין', 'ליידיבוי',
];

// Very common innocent words with a short term inside. Only these exact words are skipped.
const EXCEPTIONS = [
  'class', 'glass', 'grass', 'pass', 'bass', 'mass', 'assaf', 'hassan',
  'גייס', 'הגייה', 'כוסות', 'כוסברה', 'כוסמת', 'אחראי', 'הומור', 'הומוס', 'צדיק', 'ציצית', 'פינה', 'פיני',
];

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

// Lower case, no accents or niqqud, Hebrew final letters as regular letters.
function base(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036F\u0591-\u05C7]/g, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (ch) => FINALS[ch]);
}

const lettersOnly = (text) => text.replace(/[^a-z\u05D0-\u05EA]/g, '');
const leet = (text) => text.replace(/[013457@$!|+]/g, (ch) => LEET[ch]);

// The joined forms of a name: leet read as letters (other digits dropped) and all digits dropped,
// each also with runs of 3+ of the same letter cut to 2 and to 1.
function forms(name) {
  const text = base(name);
  const out = new Set();
  for (const joined of [lettersOnly(leet(text)), lettersOnly(text)]) {
    out.add(joined);
    out.add(joined.replace(/(.)\1{2,}/g, '$1$1'));
    out.add(joined.replace(/(.)\1{2,}/g, '$1'));
  }
  return [...out].filter(Boolean);
}

const normalTerm = (term) => lettersOnly(leet(base(term)));
const TERMS = [...new Set([...CONTAINS_EN, ...CONTAINS_HE, ...EXACT_EN, ...EXACT_HE, ...MORE_EN, ...MORE_HE, ...IDENTITY_EN, ...IDENTITY_HE]
  .map(normalTerm).filter((term) => term.length >= 3))];
const SINGLE = new Set(TERMS.filter((term) => !/(.)\1/.test(term)));
const SAFE = [...new Set(EXCEPTIONS.map(normalTerm))].sort((a, b) => b.length - a.length);

export const BLOCKED_TERM_COUNT = TERMS.length;
export const NICKNAME_EXCEPTIONS = EXCEPTIONS;

// Hides each exact exception word (with a break so the two sides don't join up).
const mask = (text) => SAFE.reduce((rest, word) => rest.split(word).join('|'), text);

// The blocked terms found in a name (normalised spelling), or [] when it's fine.
export function blockedTermsIn(name) {
  const found = new Set();
  for (const form of forms(name)) {
    const rest = mask(form);
    const flat = mask(form.replace(/(.)\1+/g, '$1'));
    for (const term of TERMS) {
      // "fuuck", "kuus": with every double letter squeezed, terms without double letters still match.
      if (rest.includes(term) || (SINGLE.has(term) && flat.includes(term))) found.add(term);
    }
  }
  // Drop terms that are only part of a longer match ("זונ" inside "בנזונה").
  return [...found].filter((term) => ![...found].some((other) => other !== term && other.includes(term)));
}

export function isBlockedNickname(name) {
  return blockedTermsIn(name).length > 0;
}
