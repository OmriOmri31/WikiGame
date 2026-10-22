import { useEffect, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { authErrorMessage } from '../account';
import { auth } from '../firebase';
import Stage from '../Stage';
import { formatDuration } from '../time';
import { REASONER_NAME } from '../reasonerBot';
import { WIKI_BOT_NAME, suggestArticles } from '../wikiBot';
import { addIsraelDays, articleUrl, israelDateKey, normalizeTitle } from '../wikipedia';
import { askDeskModel, runBfs, runReasoner } from '../lotteryBots';
import {
  ensureQueue,
  saveSlotResult,
  slotLabelDate,
  subscribeQueue,
  titlesChanged,
  updateSlotTitles,
} from '../lotteryQueue';

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function useStateRef(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function rowError(error) {
  if (error?.code === 'missingtitle') return 'הערך לא נמצא בוויקיפדיה. בחרו ערך מהרשימה.';
  if (error?.code === 'disambiguation') return 'זה דף פירושונים. בחרו ערך מהרשימה.';
  if (error?.code === 'same') return 'ההתחלה והיעד צריכים להיות ערכים שונים.';
  if (error?.code === 'permission-denied') return 'אין הרשאה לשמור. פרסמו את כללי Firestore.';
  return 'לא הצלחנו לשמור.';
}

function slotHeading(dateKey) {
  const today = israelDateKey();
  const when = slotLabelDate(dateKey);
  if (dateKey === today) return `היום · ${when}`;
  if (dateKey === addIsraelDays(today, 1)) return `מחר · ${when}`;
  return when;
}

function TitleField({
  id,
  label,
  value,
  disabled,
  open,
  items,
  active,
  loading,
  failed,
  onChange,
  onKeyDown,
  onBlur,
  onPick,
  onActive,
}) {
  const listId = `${id}-suggestions`;
  const activeId = open && items[active] ? `${id}-option-${active}` : undefined;
  return (
    <div className="desk-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {open ? (
        <ul className="desk-suggest" id={listId} role="listbox">
          {loading && items.length === 0 ? <li className="desk-suggest-note">מחפש…</li> : null}
          {failed && items.length === 0 ? <li className="desk-suggest-note">לא הצלחנו לחפש.</li> : null}
          {!loading && !failed && items.length === 0 ? <li className="desk-suggest-note">אין ערך כזה.</li> : null}
          {items.map((item, itemIndex) => (
            <li key={item.title} role="presentation">
              <button
                id={`${id}-option-${itemIndex}`}
                className={itemIndex === active ? 'is-active' : ''}
                type="button"
                role="option"
                aria-selected={itemIndex === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onActive(itemIndex)}
                onClick={() => onPick(item.title)}
              >
                <span>{item.title}</span>
                {item.description ? <small>{item.description}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function pathTitles(result) {
  if (!Array.isArray(result?.path)) return [];
  return result.path.map((title) => normalizeTitle(title)).filter(Boolean);
}

function DeskPath({ result }) {
  const titles = pathTitles(result);
  if (titles.length === 0) return null;
  const vias = Array.isArray(result.pathVia) ? result.pathVia : [];
  return (
    <p className="path-line desk-path" dir="rtl">
      {titles.map((title, index) => {
        const via = index > 0 ? (vias[index - 1] || '') : '';
        return (
          <span className="path-step" key={`${title}-${index}`}>
            {index > 0 ? <span className="path-sep" aria-hidden="true">←</span> : null}
            {via ? <span className="path-via">הפניה: <bdi>{via}</bdi></span> : null}
            <a href={articleUrl(title)} target="_blank" rel="noopener noreferrer">
              <bdi>{title}</bdi>
            </a>
          </span>
        );
      })}
    </p>
  );
}

function botLine(result, running) {
  if (running) return 'רץ…';
  if (!result) return 'עדיין לא רץ';
  if (result.status === 'error') return result.error || 'נכשל';
  if (result.gaveUp) return `ויתר אחרי ${result.pagesVisited} דפים`;
  const pages = `${result.pagesVisited} דפים`;
  const time = formatDuration(result.timeTaken, { milliseconds: false });
  return `${pages} · ${time}`;
}

function DeskSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!validEmail(nextEmail)) {
      setError(nextEmail ? 'כתובת האימייל אינה תקינה.' : 'יש להזין אימייל.');
      return;
    }
    if (!password) {
      setError('יש להזין סיסמה.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, nextEmail, password);
    } catch (signInError) {
      console.error(signInError);
      setError(authErrorMessage(signInError));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (popupError) {
      if (popupError?.code === 'auth/popup-closed-by-user' || popupError?.code === 'auth/cancelled-popup-request') {
        return;
      }
      if (popupError?.code !== 'auth/popup-blocked' && popupError?.code !== 'auth/operation-not-supported-in-this-environment') {
        console.error(popupError);
        setError(authErrorMessage(popupError));
        return;
      }
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError) {
        console.error(redirectError);
        setError(authErrorMessage(redirectError));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stage className="stage-home">
      <main className="desk-page is-gate">
        <h1>כניסה</h1>
        <form className="mail-form" onSubmit={submit} noValidate>
          <label htmlFor="desk-email">אימייל</label>
          <input
            id="desk-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
          />
          <label htmlFor="desk-password">סיסמה</label>
          <input
            id="desk-password"
            type="password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={busy}
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'רגע…' : 'התחברות'}
          </button>
        </form>
        <button className="secondary" type="button" onClick={google} disabled={busy}>
          התחברות עם Google
        </button>
      </main>
    </Stage>
  );
}

function Desk({ user, onPlay }) {
  const [board, setBoard] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [drafts, setDrafts] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [runs, setRuns] = useState({});
  const [signingOut, setSigningOut] = useState(false);
  const boardRef = useStateRef(board);
  const draftsRef = useStateRef(drafts);
  const saveChain = useRef(Promise.resolve());
  const runningRef = useRef(new Set());
  const suggestTimer = useRef(0);
  const suggestGen = useRef(0);
  const [suggest, setSuggest] = useState(null);
  const [openPaths, setOpenPaths] = useState({});

  useEffect(() => () => window.clearTimeout(suggestTimer.current), []);

  useEffect(() => {
    let live = true;
    ensureQueue().catch((error) => {
      console.error(error);
      if (live) setLoadError('לא הצלחנו להכין את התור.');
    });
    const stop = subscribeQueue((next, error) => {
      if (!live) return;
      if (error) {
        setLoadError('אין הרשאה לקרוא את התור. פרסמו את כללי Firestore.');
        return;
      }
      setBoard(next);
    });
    return () => {
      live = false;
      stop();
    };
  }, []);

  function draftKey(index, field) {
    return `${index}:${field}`;
  }

  function fieldValue(index, field, slot, source = drafts) {
    const draft = source[draftKey(index, field)];
    return draft === undefined ? slot[field] : draft;
  }

  function setDraft(index, field, value) {
    setDrafts((current) => ({ ...current, [draftKey(index, field)]: value }));
    setRowErrors((current) => ({ ...current, [index]: '' }));
  }

  function editTitle(index, field, value) {
    setDraft(index, field, value);
    const key = draftKey(index, field);
    const query = normalizeTitle(value);
    window.clearTimeout(suggestTimer.current);
    if (!query) {
      suggestGen.current += 1;
      setSuggest(null);
      return;
    }
    const generation = suggestGen.current + 1;
    suggestGen.current = generation;
    setSuggest({ key, items: [], active: 0, loading: true, failed: false });
    suggestTimer.current = window.setTimeout(async () => {
      try {
        const items = await suggestArticles(query);
        if (suggestGen.current !== generation) return;
        setSuggest({ key, items, active: 0, loading: false, failed: false });
      } catch (error) {
        console.error(error);
        if (suggestGen.current !== generation) return;
        setSuggest({ key, items: [], active: 0, loading: false, failed: true });
      }
    }, 150);
  }

  function moveSuggestion(delta) {
    setSuggest((current) => {
      if (!current || current.items.length === 0) return current;
      const count = current.items.length;
      const active = (current.active + delta + count) % count;
      return { ...current, active };
    });
  }

  function clearDrafts(index) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[draftKey(index, 'startTitle')];
      delete next[draftKey(index, 'goalTitle')];
      return next;
    });
  }

  function commit(index, overrides) {
    const run = () => commitNow(index, overrides);
    const job = saveChain.current.then(run, run);
    saveChain.current = job.then(() => {}, () => {});
    return job;
  }

  async function commitNow(index, overrides = {}) {
    const slot = boardRef.current?.slots?.[index];
    if (!slot) return null;
    const start = normalizeTitle(overrides.startTitle ?? fieldValue(index, 'startTitle', slot, draftsRef.current));
    const goal = normalizeTitle(overrides.goalTitle ?? fieldValue(index, 'goalTitle', slot, draftsRef.current));
    if (!titlesChanged(slot, start, goal)) {
      clearDrafts(index);
      return { start: slot.startTitle, goal: slot.goalTitle };
    }
    if (!start || !goal) {
      clearDrafts(index);
      setRowErrors((current) => ({ ...current, [index]: 'יש למלא התחלה ויעד.' }));
      return null;
    }
    try {
      const saved = await updateSlotTitles(index, start, goal);
      clearDrafts(index);
      return saved;
    } catch (error) {
      console.error(error);
      clearDrafts(index);
      setRowErrors((current) => ({ ...current, [index]: rowError(error) }));
      return null;
    }
  }

  function pickTitle(index, field, title) {
    suggestGen.current += 1;
    window.clearTimeout(suggestTimer.current);
    setSuggest(null);
    setDraft(index, field, title);
    commit(index, { [field]: title });
  }

  async function refresh(index) {
    if (runningRef.current.has(index)) return;
    runningRef.current.add(index);
    setOpenPaths((current) => ({ ...current, [`${index}:bfs`]: false, [`${index}:reasoner`]: false }));
    setRuns((current) => ({ ...current, [index]: { bfs: true, reasoner: true } }));
    try {
      const saved = await commit(index);
      const start = saved?.start;
      const goal = saved?.goal;
      if (!start || !goal) return;
      setRowErrors((current) => ({ ...current, [index]: '' }));
    const finish = (key) => {
      setRuns((current) => ({
        ...current,
        [index]: { ...current[index], [key]: false },
      }));
    };
    const bfs = runBfs(start, goal)
      .then((result) => saveSlotResult(index, 'bfs', start, goal, result))
      .catch((error) => {
        console.error(error);
        setRowErrors((current) => ({ ...current, [index]: 'החיפוש נכשל.' }));
      })
      .finally(() => finish('bfs'));
    const reasoner = runReasoner(start, goal, (prompt, schema, maxOutputTokens) => (
      askDeskModel(user, prompt, schema, maxOutputTokens)
    ))
      .then((result) => saveSlotResult(index, 'reasoner', start, goal, result))
      .catch((error) => {
        console.error(error);
        setRowErrors((current) => ({ ...current, [index]: 'וויקי בוט נכשל.' }));
      })
      .finally(() => finish('reasoner'));
    await Promise.all([bfs, reasoner]);
    } finally {
      runningRef.current.delete(index);
      setRuns((current) => ({ ...current, [index]: { bfs: false, reasoner: false } }));
    }
  }

  async function leave() {
    setSigningOut(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
      setSigningOut(false);
    }
  }

  const slots = board?.slots || [];

  return (
    <Stage>
      <main className="desk-page">
        <header className="desk-head">
          <h1>חמשת הימים הבאים</h1>
          <p className="lede">
            בכל יום בחצות המשחק הראשון מתפרסם, השאר זזים מקום אחד קדימה, ונוסף משחק חדש בסוף.
          </p>
        </header>
        {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}
        {(!board || slots.length === 0) && !loadError ? <p className="status">מכין את התור…</p> : null}
        <div className="desk-list">
          {slots.map((slot, index) => {
            const running = runs[index];
            const busy = Boolean(running?.bfs || running?.reasoner);
            const start = fieldValue(index, 'startTitle', slot);
            const goal = fieldValue(index, 'goalTitle', slot);
            return (
              <section className="desk-card" key={`${slot.dateKey}-${index}`} aria-label={slotHeading(slot.dateKey)}>
                <h2>{slotHeading(slot.dateKey)}</h2>
                <div className="desk-fields">
                  {['startTitle', 'goalTitle'].map((field) => {
                    const key = draftKey(index, field);
                    const menu = suggest?.key === key ? suggest : null;
                    return (
                      <TitleField
                        key={field}
                        id={`${field}-${index}`}
                        label={field === 'startTitle' ? 'התחלה' : 'יעד'}
                        value={field === 'startTitle' ? start : goal}
                        disabled={busy}
                        open={Boolean(menu)}
                        items={menu?.items || []}
                        active={menu?.active || 0}
                        loading={Boolean(menu?.loading)}
                        failed={Boolean(menu?.failed)}
                        onChange={(value) => editTitle(index, field, value)}
                        onPick={(title) => pickTitle(index, field, title)}
                        onActive={(itemIndex) => {
                          setSuggest((current) => (
                            current && current.key === key
                              ? { ...current, active: itemIndex }
                              : current
                          ));
                        }}
                        onBlur={() => {
                          if (suggest?.key === key) setSuggest(null);
                          commit(index);
                        }}
                        onKeyDown={(event) => {
                          if (suggest?.key !== key) return;
                          if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            moveSuggestion(1);
                          } else if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            moveSuggestion(-1);
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            setSuggest(null);
                          } else if (event.key === 'Enter' && suggest.items[suggest.active]) {
                            event.preventDefault();
                            pickTitle(index, field, suggest.items[suggest.active].title);
                          }
                        }}
                      />
                    );
                  })}
                </div>
                {[['bfs', WIKI_BOT_NAME, slot.bfs], ['reasoner', REASONER_NAME, slot.reasoner]].map(([key, name, result]) => {
                  const pathKey = `${index}:${key}`;
                  const open = Boolean(openPaths[pathKey]);
                  const available = !running?.[key] && pathTitles(result).length > 0;
                  return (
                    <div key={key}>
                      <div className="desk-bot-row">
                        <p className="desk-bot">{name}: {botLine(result, running?.[key])}</p>
                        {available ? (
                          <button
                            className="text-button compact"
                            type="button"
                            aria-expanded={open}
                            onClick={() => setOpenPaths((current) => ({ ...current, [pathKey]: !current[pathKey] }))}
                          >
                            {open ? 'הסתר דרך' : 'הדרך'}
                          </button>
                        ) : null}
                      </div>
                      {open && available ? <DeskPath result={result} /> : null}
                    </div>
                  );
                })}
                {rowErrors[index] ? <p className="form-error" role="alert">{rowErrors[index]}</p> : null}
                <div className="desk-actions">
                  <button
                    className="desk-button"
                    type="button"
                    disabled={busy || !slot.startTitle || !slot.goalTitle}
                    onClick={() => refresh(index)}
                  >
                    רענון
                  </button>
                  <button
                    className="desk-button is-play"
                    type="button"
                    disabled={!slot.startTitle || !slot.goalTitle}
                    onClick={() => onPlay({ startTitle: slot.startTitle, goalTitle: slot.goalTitle })}
                  >
                    שחק
                  </button>
                </div>
              </section>
            );
          })}
        </div>
        <button className="text-button danger" type="button" onClick={leave} disabled={signingOut}>
          התנתקות
        </button>
      </main>
    </Stage>
  );
}

export default function AdminScreen({ user, onPlay }) {
  if (!user) return <DeskSignIn />;
  return <Desk user={user} onPlay={onPlay} />;
}
