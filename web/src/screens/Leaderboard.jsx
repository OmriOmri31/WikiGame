import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { publicName } from '../account';
import { topAndPins, rankOf } from '../boardLayout';
import { enterFullscreen } from '../fullscreen';
import { db } from '../firebase';
import { subscribeFastestPaths } from '../fastestSearch';
import { loadLocalScores } from '../localScores';
import { pendingGuestResultId } from '../guestClaim';
import { PageLink } from '../InfoLinks';
import { WIKIPEDIA_HOME_URL, WIKIPEDIA_LICENSE_URL } from '../legal';
import BotHelp from '../BotHelp';
import Stage from '../Stage';
import ThemeButton from '../ThemeButton';
import { formatDuration, formatScoreDate, timestampMillis } from '../time';
import { isReasoner, REASONER_NAME } from '../reasonerBot';
import { isWikiBot, pathLinkNames, WIKI_BOT_NAME } from '../wikiBot';
import { addIsraelDays, articleUrl, israelDateKey, normalizeTitle } from '../wikipedia';
import { israelMidnightMs, scoreDateKey } from '../dailyPair';
import { shareResult } from '../share';

const FREE_PAGE = 20;

const REASONER_HELP = 'וויקי בוט הוא בינה מלאכותית שמשחקת את המשחק היומי כמו כולם, קישור אחרי קישור. נסו לנצח אותו.';
const FASTEST_HELP = 'המחשב עבר על כל הקישורים ומצא את הדרך הקצרה ביותר. מפרסמים אותה רק למחרת.';
const LAYOUT_HINT_KEY = 'wikigame.boardHint';

// What the top of the daily section looked like last time, so the loading placeholder can take
// the same space: 'empty' (the no-result note), 'mine' (the player's row) or 'none'.
function readLayoutHint() {
  try {
    const hint = JSON.parse(localStorage.getItem(LAYOUT_HINT_KEY) || 'null');
    return hint && typeof hint === 'object' ? hint : null;
  } catch {
    return null;
  }
}

function writeLayoutHint(hint) {
  try {
    localStorage.setItem(LAYOUT_HINT_KEY, JSON.stringify(hint));
  } catch {
    // Storage can be unavailable (private mode); the placeholder then uses the default.
  }
}

function predictTopBlock(uid, highlightId, highlightMode) {
  const hasLocalDaily = loadLocalScores().some((row) => row.mode !== 'free');
  // A guest's block depends only on this device, so the guess is certain.
  if (!uid) return { kind: hasLocalDaily ? 'none' : 'empty', sure: true };
  const hint = readLayoutHint();
  const today = israelDateKey(new Date());
  const mineHeight = Number(hint?.mineHeight) || 0;
  if (highlightId && highlightMode !== 'free') return { kind: 'mine', height: mineHeight, sure: true };
  if (hint && hint.uid === uid && hint.day === today) {
    if (hint.kind === 'mine') return { kind: 'mine', height: mineHeight, sure: true };
    if (hint.kind === 'none') return { kind: 'none', sure: true };
    return { kind: 'empty', sure: true };
  }
  // Unknown: one placeholder with nothing under it, so whatever arrives cannot push anything.
  return { kind: 'empty', sure: false };
}

// Firestore rules allow create but not delete, so probe scores stay hidden here.
const IGNORED_SCORE_IDS = new Set([
  'Gxd5TIH6fiMMgK4qqznp',
  'WBwWbEGmFysvc440EjO8',
  'mXPsH85ZrHsQGW4OfskY',
  'GocwcHCAmyGj9QUz3OBf',
  'wiki-bot-rulecheck',
]);

function latestForUser(rows, uid) {
  if (!uid) return null;
  return rows.reduce((latest, row) => {
    if (row.uid !== uid) return latest;
    if (!latest || timestampMillis(row.timestamp) >= timestampMillis(latest.timestamp)) return row;
    return latest;
  }, null);
}

function bestForUser(rows, uid) {
  if (!uid) return null;
  return rows.find((row) => row.uid === uid) || null;
}

function savedPath(row) {
  if (!Array.isArray(row?.path)) return [];
  return row.path.map((title) => normalizeTitle(title)).filter(Boolean);
}

function fastestPath(row) {
  if (!Array.isArray(row?.fastestPath)) return null;
  return row.fastestPath.map((title) => normalizeTitle(title)).filter(Boolean);
}

function canReplay(row) {
  return Boolean(normalizeTitle(row?.startTitle) && normalizeTitle(row?.goalTitle));
}

function winKey(row) {
  const start = normalizeTitle(row?.startTitle);
  const goal = normalizeTitle(row?.goalTitle);
  if (!start || !goal) return '';
  return `${start}\n${goal}`;
}

// Shares the player's own result (spoiler-free for the daily game). Where there is no share
// sheet the text is copied, and the button says so for a moment.
function ShareButton({ row }) {
  const [note, setNote] = useState('');
  const timerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  async function share() {
    const outcome = await shareResult(row);
    if (outcome !== 'copied' && outcome !== 'failed') return;
    setNote(outcome === 'copied' ? 'הועתק' : 'לא הצלחנו להעתיק');
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setNote(''), 2000);
  }

  return (
    <button className="text-button compact" type="button" onClick={share}>
      <span aria-live="polite">{note || 'שיתוף'}</span>
    </button>
  );
}

function ScoreActions({ row, onShowPath, onShowFastest, onReplay, allowReplay, allowShare = false, showPath = true, showFastest = false }) {
  const replayReady = allowReplay && canReplay(row);
  return (
    <div className="score-actions">
      {showPath ? (
        <button className="text-button compact" type="button" onClick={() => onShowPath(row)}>
          הצג דרך
        </button>
      ) : null}
      {showFastest ? (
        <button className="text-button compact" type="button" onClick={() => onShowFastest(row)}>
          {WIKI_BOT_NAME}
        </button>
      ) : null}
      {allowReplay ? (
        <button
          className="text-button compact"
          type="button"
          onClick={() => onReplay(row)}
          disabled={!replayReady}
        >
          שחק שוב
        </button>
      ) : null}
      {allowShare && !row.gaveUp ? <ShareButton row={row} /> : null}
    </div>
  );
}

function rowName(row) {
  if (isWikiBot(row)) return WIKI_BOT_NAME;
  if (isReasoner(row)) return REASONER_NAME;
  return publicName(row?.name);
}

function OfficialMark() {
  return (
    <span className="official-mark">
      <svg className="official-seal" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4.7 8.2 7 10.4 11.3 5.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      רשמי
    </span>
  );
}

function DailyRow({ row, rank, highlighted, onShowPath, onReplay, allowReplay, allowShare, showPath, anchor = true }) {
  return (
    <div
      id={anchor ? `score-${row.id}` : undefined}
      className={['score-row', highlighted ? 'is-player' : '', isWikiBot(row) ? 'is-fastest' : '', isReasoner(row) ? 'is-reasoner' : ''].filter(Boolean).join(' ')}
    >
      <div className="score-main">
        <span className={Number.isInteger(rank) && rank <= 3 ? 'num is-medal' : 'num'}>{rank ?? '—'}</span>
        <span className="name">
          <span className="name-text">{rowName(row)}</span>
          {isReasoner(row) ? <OfficialMark /> : null}
          {isReasoner(row) ? <BotHelp label={`מה זה ${REASONER_NAME}?`} text={REASONER_HELP} /> : null}
          {row.gaveUp ? <span className="give-up-mark">ויתור</span> : null}
        </span>
        <span className="num" dir="ltr">{row.pagesVisited}</span>
        <span className="num">
          {isWikiBot(row) ? null : <bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi>}
        </span>
      </div>
      <ScoreActions
        row={row}
        onShowPath={onShowPath}
        onReplay={onReplay}
        allowReplay={allowReplay}
        allowShare={allowShare}
        showPath={showPath}
      />
    </div>
  );
}

function FreePlayRow({ row, highlighted, searching, onShowPath, onShowFastest, onReplay, allowReplay, allowShare }) {
  return (
    <div
      id={`score-${row.id}`}
      className={highlighted ? 'score-row is-player' : 'score-row'}
    >
      <div className="score-main free-main">
        <span>{formatScoreDate(row.timestamp)}</span>
        <span className="num" dir="ltr">{row.pagesVisited}</span>
        <span className="num"><bdi className="clock" dir="ltr">{formatDuration(row.timeTaken)}</bdi></span>
      </div>
      <p className="free-route" dir="rtl">
        <bdi>{row.startTitle || '—'}</bdi>
        <span className="path-sep" aria-hidden="true"> ← </span>
        <bdi>{row.goalTitle || '—'}</bdi>
        {row.gaveUp ? <span className="give-up-mark">ויתור</span> : null}
      </p>
      {searching ? (
        <p className="status free-search" role="status">מחפשים את הדרך המהירה ביותר…</p>
      ) : null}
      <ScoreActions
        row={row}
        onShowPath={onShowPath}
        onShowFastest={onShowFastest}
        onReplay={onReplay}
        allowReplay={allowReplay}
        allowShare={allowShare}
        showPath={savedPath(row).length > 0}
        showFastest={Array.isArray(row.fastestPath)}
      />
    </div>
  );
}

function PathLine({ titles, vias }) {
  return (
    <p className="path-line" dir="rtl">
      {titles.map((title, index) => {
        const via = index > 0 && Array.isArray(vias) ? (vias[index - 1] || '') : '';
        return (
          <span className="path-step" key={`${title}-${index}`}>
            {index > 0 ? <span className="path-sep" aria-hidden="true">←</span> : null}
            {via ? <span className="path-via">לחצו על <bdi>{via}</bdi></span> : null}
            <a href={articleUrl(title)} target="_blank" rel="noopener noreferrer">
              <bdi>{title}</bdi>
            </a>
          </span>
        );
      })}
    </p>
  );
}

export default function Leaderboard({ user, highlightId, highlightMode, onHome, onSignIn, onPlayAgain, onOpenPage }) {
  const [scores, setScores] = useState([]);
  const [freePlays, setFreePlays] = useState([]);
  const [playerScore, setPlayerScore] = useState(null);
  const [playerRank, setPlayerRank] = useState(null);
  const [bestScoreId, setBestScoreId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deviceDaily, setDeviceDaily] = useState([]);
  const [pinBlocks, setPinBlocks] = useState([]);
  const [fastestYesterday, setFastestYesterday] = useState(null);
  const [reasonerGiveUps, setReasonerGiveUps] = useState([]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeShown, setFreeShown] = useState(FREE_PAGE);
  const [wonKeys, setWonKeys] = useState(() => new Set());
  const [pathView, setPathView] = useState(null);
  const [fastestLive, setFastestLive] = useState({ pendingIds: [], paths: {} });
  const [hopNotes, setHopNotes] = useState(null);
  const pathDialogRef = useRef(null);
  const mineStripRef = useRef(null);
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;

  useEffect(() => subscribeFastestPaths(setFastestLive), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const local = loadLocalScores();
      const localDaily = local
        .filter((row) => row.mode !== 'free')
        .sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
      const localFree = local.filter((row) => row.mode === 'free');
      let readable = [];
      let remoteError = '';

      const todayKey = israelDateKey(new Date());
      const yesterdayKey = addIsraelDays(todayKey, -1);
      const uid = user?.uid || '';
      let mineAll = [];
      try {
        // The daily board needs yesterday's and today's daily rows. Free games are private (the
        // rules let only their player read them), so every query here asks for daily rows only or
        // for the player's own uid. Bot rows written before they carried dayKey are found by their
        // 00:00 stamp. All three queries use single-field indexes.
        const days = [yesterdayKey, todayKey];
        const stamps = days.map((key) => Timestamp.fromMillis(israelMidnightMs(key)));
        const scores = collection(db, 'scores');
        const [byDay, byStamp, own] = await Promise.all([
          getDocs(query(scores, where('mode', '==', 'daily'), where('dayKey', 'in', days))),
          getDocs(query(scores, where('mode', '==', 'daily'), where('timestamp', 'in', stamps))),
          uid ? getDocs(query(scores, where('uid', '==', uid))) : Promise.resolve(null),
        ]);
        const rowsOf = (snapshot) => (snapshot ? snapshot.docs : [])
          .filter((entry) => !IGNORED_SCORE_IDS.has(entry.id))
          .map((entry) => ({ id: entry.id, ...entry.data() }));
        const seen = new Set();
        readable = [...rowsOf(byDay), ...rowsOf(byStamp)].filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        });
        mineAll = rowsOf(own);
      } catch (loadError) {
        console.error(loadError);
        remoteError = 'לא הצלחנו לטעון את טבלת השיאים.';
      }

      if (cancelled) return;

      // Today's shortest route would give the answer away, so the box shows yesterday's.
      // If the day had more than one pair (a replaced pair), keep the one people actually played.
      const yesterdayDaily = readable.filter((row) => (
        row.mode !== 'free' && !row.lock && scoreDateKey(row) === yesterdayKey
      ));
      const playedKeys = new Map();
      yesterdayDaily.forEach((row) => {
        if (isWikiBot(row)) return;
        const key = winKey(row);
        if (key) playedKeys.set(key, (playedKeys.get(key) || 0) + (isReasoner(row) ? 100 : 1));
      });
      const fastest = yesterdayDaily
        .filter((row) => !row.gaveUp && isWikiBot(row) && Array.isArray(row.path) && row.path.length > 0)
        .sort((a, b) => (playedKeys.get(winKey(b)) || 0) - (playedKeys.get(winKey(a)) || 0)
          || timestampMillis(b.timestamp) - timestampMillis(a.timestamp))[0] || null;

      // The daily board is today's (Israel date) only. It resets at 00:00 on its own.
      const todayDaily = readable.filter((row) => scoreDateKey(row) === todayKey);
      const ranked = todayDaily.filter((row) => (
        row.mode !== 'free'
        && !row.gaveUp
        && !row.lock
        && !isWikiBot(row)
        && typeof row.name === 'string'
        && row.name.trim()
      ));

      ranked.sort((a, b) => {
        const pages = Number(a.pagesVisited) - Number(b.pagesVisited);
        if (pages) return pages;
        const time = Number(a.timeTaken) - Number(b.timeTaken);
        if (time) return time;
        return timestampMillis(a.timestamp) - timestampMillis(b.timestamp);
      });
      // One row per player: their best. (Older days could hold more than one daily score.)
      const placed = new Set();
      const rows = ranked.filter((row) => {
        if (!row.uid) return true;
        if (placed.has(row.uid)) return false;
        placed.add(row.uid);
        return true;
      });

      const mineFree = [
        ...mineAll.filter((row) => row.mode === 'free' && row.uid === uid),
        ...localFree,
      ].sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));

      const best = bestForUser(rows, uid);
      let mine = null;
      if (highlightMode !== 'free' && highlightId && uid) {
        const highlighted = rows.find((row) => row.id === highlightId && row.uid === uid);
        if (highlighted) mine = highlighted;
      }
      if (!mine) mine = latestForUser(rows, uid);
      const bot = rows.find(isReasoner) || null;
      const { top, blocks } = topAndPins(rows, {
        player: best,
        extra: mine && mine.id !== best?.id ? mine : null,
        bot,
      });

      const won = new Set();
      const addWin = (row) => {
        if (!row || row.mode === 'free' || isWikiBot(row) || row.gaveUp || row.lock) return;
        const key = winKey(row);
        if (key) won.add(key);
      };
      if (uid) mineAll.forEach((row) => {
        if (row.uid === uid) addWin(row);
      });
      localDaily.forEach(addWin);

      setScores(top);
      setFreePlays(mineFree);
      setDeviceDaily(localDaily.filter((row) => scoreDateKey(row) === todayKey));
      setPinBlocks(blocks);
      setFastestYesterday(fastest);
      setReasonerGiveUps(todayDaily.filter((row) => (
        isReasoner(row)
        && row.gaveUp
        && !row.lock
        && row.mode !== 'free'
        && typeof row.name === 'string'
        && row.name.trim()
      )));
      setWonKeys(won);
      setPlayerScore(mine || null);
      setPlayerRank(rankOf(rows, mine?.id));
      setBestScoreId(best?.id || '');
      setError(remoteError);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [highlightId, highlightMode, user]);

  useEffect(() => {
    if (loading || error) return;
    const uid = user?.uid || '';
    if (!uid) return;
    const previous = readLayoutHint();
    let kind = 'none';
    if (playerScore) kind = 'mine';
    else if (deviceDaily.length === 0) kind = 'empty';
    const measured = mineStripRef.current?.getBoundingClientRect().height;
    writeLayoutHint({
      uid,
      day: israelDateKey(new Date()),
      kind,
      mineHeight: measured ? Math.round(measured) : previous?.mineHeight || 0,
    });
  }, [loading, error, user, playerScore, deviceDaily]);

  useEffect(() => {
    if (loading || !highlightId) return undefined;
    document.getElementById(`score-${highlightId}`)?.scrollIntoView({ block: 'center' });
    return undefined;
  }, [highlightId, loading, scores, freePlays, deviceDaily]);

  useEffect(() => {
    if (!pathView) return undefined;
    pathDialogRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') setPathView(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathView]);

  useEffect(() => {
    if (!pathView) {
      setHopNotes(null);
      return undefined;
    }
    const row = pathView.row;
    const fastest = pathView.kind === 'fastest';
    const titles = fastest ? (fastestPath(row) || []) : savedPath(row);
    const annotate = fastest || isWikiBot(row);
    if (!annotate || titles.length < 2) {
      setHopNotes([]);
      return undefined;
    }
    const stored = fastest ? row.fastestVia : row.pathVia;
    if (Array.isArray(stored) && stored.length === titles.length - 1) {
      setHopNotes(stored.map((item) => (typeof item === 'string' ? item : '')));
      return undefined;
    }
    let cancelled = false;
    setHopNotes(null);
    pathLinkNames(titles).then((notes) => {
      if (!cancelled) setHopNotes(notes);
    }).catch((error) => {
      console.error(error);
      if (!cancelled) setHopNotes([]);
    });
    return () => {
      cancelled = true;
    };
  }, [pathView]);

  const topBlock = loading ? predictTopBlock(user?.uid || '', highlightId, highlightMode) : null;
  const highlightedId = playerScore?.id;
  const pathRow = pathView?.row || null;
  const showingFastest = pathView?.kind === 'fastest';
  const pathTitles = showingFastest ? (fastestPath(pathRow) || []) : savedPath(pathRow);
  const pathHeading = showingFastest || isWikiBot(pathRow) ? WIKI_BOT_NAME : 'הדרך';
  const boardHasRows = scores.length > 0 || pinBlocks.length > 0 || reasonerGiveUps.length > 0;

  function isYourScore(row) {
    return row.id === highlightedId || (bestScoreId !== '' && row.id === bestScoreId);
  }

  // Play again only on the player's own results: their account's rows, or this device's guest rows.
  function isOwnRow(row) {
    if (isWikiBot(row) || isReasoner(row)) return false;
    if (row.local) return true;
    return Boolean(user?.uid) && row.uid === user.uid;
  }

  function showDailyPath(row) {
    const key = winKey(row);
    if (key && wonKeys.has(key)) return true;
    if (!key && ((user?.uid && row.uid === user.uid) || row.local)) return true;
    return false;
  }
  const savedOnDevice = deviceDaily.some((row) => row.id === highlightId)
    || freePlays.some((row) => row.local && row.id === highlightId);

  function showPlayed(row) {
    setPathView({ row, kind: 'played' });
  }

  function showFastest(row) {
    setPathView({ row, kind: 'fastest' });
  }

  function replay(row) {
    if (!canReplay(row)) return;
    enterFullscreen();
    onPlayAgain(row);
  }

  function renderDaily(row, rank, highlighted, anchor = true) {
    return (
      <DailyRow
        key={row.id}
        row={row}
        rank={rank}
        highlighted={highlighted}
        onShowPath={showPlayed}
        onReplay={replay}
        allowReplay={isOwnRow(row)}
        allowShare={isOwnRow(row)}
        showPath={showDailyPath(row)}
        anchor={anchor}
      />
    );
  }

  return (
    <Stage className="stage-board">
      <header className="stage-bar">
        <span className="wordmark" aria-hidden="true" />
        <div className="stage-actions">
          <ThemeButton />
          <button className="pill pill-quiet" type="button" onClick={() => onHomeRef.current()}>
            חזרה
          </button>
        </div>
      </header>
      <main className="board">
        <div className="board-scroll">
          <p className="lede">הדירוג לפי מספר הצעדים, ואחר כך לפי הזמן.</p>
          {highlightId && savedOnDevice ? (
            <div className="saved-note" role="status">
              <p>התוצאה נשמרה במכשיר הזה.</p>
              {!user && onSignIn && highlightId === pendingGuestResultId() ? (
                <>
                  <p className="saved-note-sub">התחברו או הירשמו כדי לשמור אותה בחשבון שלכם.</p>
                  <button className="primary" type="button" onClick={onSignIn}>
                    התחברות או הרשמה
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="board-columns">
            <section aria-label="משחק יומי">
              <h2>משחק יומי</h2>

              {loading ? (
                // Placeholders in the final positions, so nothing moves when the scores arrive.
                <div className="board-skeleton" role="status" aria-label="טוען תוצאות…">
                  {topBlock?.kind === 'empty' ? <span className="skeleton skeleton-line" /> : null}
                  {topBlock?.kind === 'mine' ? (
                    <span className="skeleton skeleton-mine" style={topBlock.height ? { height: topBlock.height } : undefined} />
                  ) : null}
                  {topBlock?.sure ? (
                    <>
                      <span className="skeleton skeleton-fastest" />
                      <span className="skeleton skeleton-disclosure" />
                    </>
                  ) : null}
                </div>
              ) : null}
              {error ? <p className="form-error" role="alert">{error}</p> : null}

              {!loading && playerScore ? (
                <div className="mine-strip" ref={mineStripRef}>
                  <div className="score-table">
                    <div className="score-head">
                      <span>מקום</span>
                      <span>שם</span>
                      <span>צעדים</span>
                      <span>זמן</span>
                    </div>
                    {renderDaily(playerScore, playerRank, true, !boardOpen)}
                  </div>
                </div>
              ) : null}
              {/* Stays while the table is open: removing it moved the table up. */}
              {!loading && !playerScore && deviceDaily.length === 0 ? (
                <p className="empty">{boardHasRows ? 'עדיין אין לך תוצאה בטבלה.' : 'עדיין אין תוצאות.'}</p>
              ) : null}

              {fastestYesterday ? (
                <aside className="fastest-route" aria-label="הדרך המהירה של אתמול">
                  <div className="fastest-copy">
                    <h3>
                      הדרך המהירה של אתמול
                      <BotHelp label="מה זו הדרך המהירה?" text={FASTEST_HELP} />
                    </h3>
                    <p>
                      <bdi>{fastestYesterday.startTitle}</bdi>
                      <span className="path-sep" aria-hidden="true"> ← </span>
                      <bdi>{fastestYesterday.goalTitle}</bdi>
                      <span className="fastest-steps">
                        <bdi dir="ltr">{fastestYesterday.pagesVisited}</bdi>
                        {' '}
                        צעדים
                      </span>
                    </p>
                  </div>
                  <button className="text-button compact" type="button" onClick={() => showPlayed(fastestYesterday)}>
                    הצג דרך
                  </button>
                </aside>
              ) : null}

              {boardHasRows ? (
                <button
                  className="board-disclosure"
                  type="button"
                  aria-expanded={boardOpen}
                  onClick={() => setBoardOpen((open) => !open)}
                >
                  <span>{boardOpen ? 'הסתרת הטבלה' : 'טבלה יומית'}</span>
                  <span className="board-chevron" aria-hidden="true" />
                </button>
              ) : null}

              {boardOpen && (scores.length > 0 || pinBlocks.length > 0) ? (
                <div className="score-table">
                  <div className="score-head">
                    <span>מקום</span>
                    <span>שם</span>
                    <span>צעדים</span>
                    <span>זמן</span>
                  </div>
                  {scores.map((row, index) => renderDaily(row, index + 1, isYourScore(row)))}
                  {pinBlocks.map((block) => (
                    block.kind === 'gap'
                      ? <p className="dots" aria-hidden="true" key={`gap-${block.rank}`}>···</p>
                      : renderDaily(block.row, block.rank, block.highlighted || isYourScore(block.row))
                  ))}
                </div>
              ) : null}

              {boardOpen && reasonerGiveUps.length > 0 ? (
                <div className="outside-top">
                  {reasonerGiveUps.map((row) => renderDaily(row, null, false))}
                </div>
              ) : null}

              {boardOpen && !loading && !error && scores.length === 0 && reasonerGiveUps.length === 0 ? (
                <p className="empty">עדיין אין תוצאות.</p>
              ) : null}
            </section>

            <section className="free-board" aria-label="המשחקים החופשיים שלי">
              {loading && topBlock?.sure ? <span className="skeleton skeleton-disclosure" aria-hidden="true" /> : null}
              {!loading ? (
                <button
                  className="board-disclosure"
                  type="button"
                  aria-expanded={freeOpen}
                  onClick={() => setFreeOpen((open) => !open)}
                >
                  <span>{freeOpen ? 'הסתרת המשחקים החופשיים' : 'המשחקים החופשיים שלי'}</span>
                  <span className="board-chevron" aria-hidden="true" />
                </button>
              ) : null}
              {freeOpen && !loading && !error && freePlays.length === 0 ? (
                <p className="empty">עדיין אין משחקים חופשיים.</p>
              ) : null}
              {freeOpen && freePlays.length > 0 ? (
                <div className="score-table">
                  <div className="score-head free-main">
                    <span>תאריך</span>
                    <span>צעדים</span>
                    <span>זמן</span>
                  </div>
                  {freePlays.slice(0, freeShown).map((row) => {
                    const livePath = Array.isArray(row.fastestPath) ? null : fastestLive.paths[row.id];
                    const shown = Array.isArray(livePath) ? { ...row, fastestPath: livePath } : row;
                    const searching = !Array.isArray(shown.fastestPath)
                      && fastestLive.pendingIds.includes(row.id);
                    return (
                      <FreePlayRow
                        key={row.id}
                        row={shown}
                        searching={searching}
                        highlighted={highlightMode === 'free' && row.id === highlightId}
                        onShowPath={showPlayed}
                        onShowFastest={showFastest}
                        onReplay={replay}
                        allowReplay
                        allowShare
                      />
                    );
                  })}
                </div>
              ) : null}
              {freeOpen && freePlays.length > freeShown ? (
                <button className="text-button" type="button" onClick={() => setFreeShown((count) => count + FREE_PAGE)}>
                  עוד משחקים ({freePlays.length - freeShown})
                </button>
              ) : null}
            </section>

            {deviceDaily.length > 0 ? (
              <div className="device-scores">
                <h3>במכשיר הזה</h3>
                <div className="score-table">
                  {deviceDaily.map((row) => renderDaily(row, null, row.id === highlightId, false))}
                </div>
              </div>
            ) : null}

            <p className="wiki-attribution board-credit">
              תוכן מ<a href={WIKIPEDIA_HOME_URL} target="_blank" rel="noopener noreferrer">ויקיפדיה העברית</a>, ברישיון{' '}
              <a href={WIKIPEDIA_LICENSE_URL} target="_blank" rel="noopener noreferrer" dir="ltr">CC BY-SA 4.0</a>
              {onOpenPage ? (
                <>
                  {' · '}
                  <PageLink page="credits" onOpen={onOpenPage}>קרדיטים</PageLink>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="board-bar">
          <button className="primary" type="button" onClick={() => onHomeRef.current()}>
            משחק חדש
          </button>
        </div>
      </main>

      {pathView ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPathView(null)}>
          <div
            className="modal-card path-card"
            role="dialog"
            aria-modal="true"
            aria-label={pathHeading}
            tabIndex={-1}
            ref={pathDialogRef}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{pathHeading}</h2>
            {pathTitles.length > 0 ? (
              <>
                <PathLine
                  titles={pathTitles}
                  vias={(showingFastest || isWikiBot(pathRow)) ? hopNotes : []}
                />
                {(showingFastest || isWikiBot(pathRow)) && hopNotes === null ? (
                  <p className="status path-via-status">בודקים הפניות בדרך…</p>
                ) : null}
              </>
            ) : (
              <p className="lede">
                {showingFastest ? 'לא נמצאה דרך עד 25 דפים.' : 'הדרך לא נשמרה במשחק הזה.'}
              </p>
            )}
            <button className="primary" type="button" onClick={() => setPathView(null)}>סגור</button>
          </div>
        </div>
      ) : null}
    </Stage>
  );
}
