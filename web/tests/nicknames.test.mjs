// Run with: npm test (from web/). Plain node:test, no extra packages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKED_TERM_COUNT, isBlockedNickname } from '../src/blockedNames.js';
import { NICKNAME_ERRORS, cleanNickname, nicknameLength, nicknameProblem } from '../src/nicknameRules.js';

const BLOCKED = [
  'fuck', 'FUCK', 'fucker', 'Fuuuuck', 'fuuck', 'f-u-c-k', 'f_u_c_k', 'f u c k', 'f-u_c k', 'f=u=c=k', 'f1u2c3k',
  'fvck', 'phuck', 'fuk', 'fck', 'sucker', 'wanker', 'shit', 'sh1t', '5hit', 'bitch', 'b1tch', 'ass', 'a55', 'ASS',
  'asss', 'ass123', 'class ass', 'dick', 'Dick', 'D1ck', 'Dikla', 'Moby Dick', 'dikk', 'cock', 'Peacock', 'cunt',
  'cunting', 'pussy', 'slut', 'whore', 'nigga', 'n1gger', 'faggot', 'porn', 'p0rn', 'penis', 'sex', 's3x', 'sexy',
  'Essex', 'cum', 'tits', 'boobs', 'rape', 'nazi', 'hitler', 'xxx', 'wtf', 'kus', 'kus123', 'k u s', 'KUS', 'kos',
  'kusemek', 'kusomak', 'zona', 'zo-na', 'z o n a', 'zoona', 'benzona', 'sharmuta', 'manyak', 'zayin', 'tizi',
  'hara', 'Wang', 'Finn', 'Omri fuck', 'my dick', 'Arizona',
  'זונה', 'בן_זונה', 'בן זונה', 'בןזונה', 'הזונה', 'זונות', 'ז ו נ ה', 'ז-ו_נ ה', 'כוס', 'כ ו ס', 'כ-ו-ס',
  'כוס123', 'כ1ו2ס', 'כוס-ok', 'עומרי כוס', 'כוסאמק', 'כוס אמק', 'כוסעמק', 'כוסאוחתק', 'כוסית', 'זין', 'ז י ן',
  'זין7', 'זיון', 'זיונים', 'מזדיין', 'תזדיין', 'לך תזדיין', 'מניאק', 'מנייק', 'שרמוטה', 'שרמוטות', 'אחושרמוטה',
  'שמוק', 'חרא', 'תחת', 'פאק', 'פאקיו', 'בולשיט', 'סקס', 'סקסי', 'פורנו', 'מוצץ', 'הומו', 'נאצי', 'ינעל',
  'ינעלאבוק', 'כוסֶ', 'זוֹנָה', 'קוס', 'קוסאמק', 'טיז', 'זובי', 'מפגר', 'דביל', 'טמבל', 'אהבל', 'פוץ', 'כלבה',
  'חרמן', 'ציצים', 'יא_חמאר', 'בן-כלב', 'דיק', 'ד י ק', 'פין', 'פ י ן', 'ממזר', 'מנוול', 'חלאה', 'אשכנאצי',
  'פרענק', 'כושי', 'ערבוש', 'אונס', 'ביצים', 'שדיים', 'בולבול', 'כוסות כוס', 'צדיק זין',
];

const INNOCENT = [
  'Omri', 'Omri Nir', 'Dana', 'Noa', 'Noa Kirel', 'Yossi', 'Avi_1', 'Neo=1', 'abc-123', 'Gamer99', 'WikiFan',
  'Player_7', 'class', 'Pass', 'Glass', 'Grass', 'Bass', 'Assaf', 'Hassan', 'Moshe', 'David', 'Yael', 'Tamar',
  'Itay', 'Lior', 'Shira', 'Matan', 'Roni', 'Guy', 'Eden', 'Amit', 'Ido', 'Tom', 'Bob', 'Momo', 'Neta',
  'עומרי', 'עומרי ניר', 'נועה', 'דניאל', 'יוסי', 'שמוליק', 'מיכל', 'כוסות', 'כוסברה', 'כוסמת', 'אחראי', 'הומור',
  'צדיק', 'ציצית', 'פינה', 'פיני', 'הומוס', 'גייס', 'הגייה', 'אורן', 'עידו', 'שקד', 'ויקי123', 'גיבור', 'מלך_99', 'אסף', 'רז=1', 'זיו', 'זיוה',
  'משה כהן', 'דנה לוי', 'יעל', 'תמר', 'איתי', 'ליאור', 'שירה', 'מתן', 'רוני', 'גיא', 'עדן', 'עמית', 'נטע',
  'שמש', 'כלבלב', 'דבש', 'ירח', 'כוכב', 'אריה', 'נמר',
];

test('blocked list is large', () => {
  assert.ok(BLOCKED_TERM_COUNT > 600, `only ${BLOCKED_TERM_COUNT} terms`);
});

test('blocked names are blocked', () => {
  const missed = BLOCKED.filter((name) => !isBlockedNickname(name));
  assert.deepEqual(missed, []);
});

test('innocent names pass', () => {
  const caught = INNOCENT.filter((name) => isBlockedNickname(name));
  assert.deepEqual(caught, []);
});

test('nickname format', () => {
  assert.equal(nicknameProblem(''), NICKNAME_ERRORS.empty);
  assert.equal(nicknameProblem('   '), NICKNAME_ERRORS.empty);
  assert.equal(nicknameProblem('a'), NICKNAME_ERRORS.short);
  assert.equal(nicknameProblem('abcdefghi'), '');
  assert.equal(nicknameProblem('אבגדהוזחט'), '');
  assert.equal(nicknameProblem('abcdefghij'), NICKNAME_ERRORS.long);
  assert.equal(nicknameProblem('אבגדהוזחטי'), NICKNAME_ERRORS.long);
  assert.equal(nicknameProblem('Omri Nir'), '');
  assert.equal(nicknameProblem('עומרי ניר'), '');
  assert.equal(nicknameProblem('  Omri   Nir  '), '');
  assert.equal(cleanNickname('  Omri   Nir  '), 'Omri Nir');
  assert.equal(nicknameProblem('ab cd efg'), '');
  assert.equal(nicknameProblem('ab cd efgh'), NICKNAME_ERRORS.long);
  assert.equal(nicknameProblem('a-b_c=d'), '');
  for (const bad of ['Omri!', 'omri.n', 'a/b', 'a+b', 'עומרי😀', '😀😀', 'a\u200Db', 'ab@c', 'ab#', "o'neil", 'שָׁלוֹם', 'Café', 'ab\u05F3']) {
    assert.equal(nicknameProblem(bad), NICKNAME_ERRORS.chars, bad);
  }
  assert.equal(nicknameProblem('Wiki-Bot'), NICKNAME_ERRORS.reserved);
  assert.equal(nicknameProblem('Wiki Bot'), NICKNAME_ERRORS.reserved);
  assert.equal(nicknameProblem('ויקיבוט'), NICKNAME_ERRORS.reserved);
  assert.equal(nicknameProblem('fucker'), NICKNAME_ERRORS.blocked);
  assert.equal(nicknameProblem('f u c k'), NICKNAME_ERRORS.blocked);
  assert.equal(nicknameProblem('שרמוטה'), NICKNAME_ERRORS.blocked);
});

test('length counts graphemes', () => {
  assert.equal(nicknameLength('👍🏽👨‍👩‍👧'), 2);
  assert.equal(nicknameLength('שָׁלוֹם'), 4);
  assert.equal(nicknameLength('abc'), 3);
});
