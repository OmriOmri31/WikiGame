import { useEffect, useId, useRef, useState } from 'react';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { accountName } from './account';
import { db } from './firebase';
import { findShortestPath } from './wikiBot';
import { resolveArticleTitle, sameTitle, searchArticles } from './wikipedia';

function YinYangIcon() {
  return (
    <svg className="yin-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        fill="currentColor"
        d="M12 2.75a9.25 9.25 0 0 1 0 18.5 4.625 4.625 0 0 1 0-9.25 4.625 4.625 0 0 0 0-9.25z"
      />
      <circle className="yin-hole" cx="12" cy="7.375" r="1.35" />
      <circle cx="12" cy="16.625" r="1.35" fill="currentColor" />
    </svg>
  );
}

function TitleField({ id, label, value, onChange, disabled, suggestions, onPick, active, onActive }) {
  const listId = `${id}-suggest`;
  const rootRef = useRef(null);
  const visible = active && suggestions.length > 0;

  return (
    <div className="title-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="חיפוש בויקיפדיה"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        onChange={(event) => {
          onChange(event.target.value);
          onActive(true);
        }}
        onFocus={() => onActive(true)}
        onBlur={(event) => {
          if (rootRef.current?.contains(event.relatedTarget)) return;
          onActive(false);
        }}
      />
      {visible ? (
        <ul className="title-suggest" id={listId} role="listbox">
          {suggestions.map((title) => (
            <li key={title} role="presentation">
              <button
                type="button"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(title);
                  onActive(false);
                }}
              >
                {title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function useArticleSearch(query, enabled) {
  const [titles, setTitles] = useState([]);

  useEffect(() => {
    const term = query.trim();
    if (!enabled || !term) {
      setTitles([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchArticles(term, { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted) setTitles(next);
        })
        .catch((error) => {
          if (error.name === 'AbortError') return;
          console.error(error);
          if (!controller.signal.aborted) setTitles([]);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  return titles;
}

async function canonicalTitle(raw, missingMessage) {
  try {
    return await resolveArticleTitle(raw);
  } catch (error) {
    if (error?.code === 'missingtitle') {
      const missing = new Error(missingMessage);
      missing.code = 'missingtitle';
      throw missing;
    }
    throw error;
  }
}

export default function CustomPair({ user, onCreated }) {
  const formId = useId();
  const requestRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [goal, setGoal] = useState('');
  const [activeField, setActiveField] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const startSuggestions = useArticleSearch(start, open && !busy);
  const goalSuggestions = useArticleSearch(goal, open && !busy);

  useEffect(() => {
    if (!open) return undefined;
    const field = document.getElementById(`${formId}-start`);
    field?.focus();
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestRef.current += 1;
      setBusy(false);
      setSeeking(false);
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, formId]);

  function close() {
    requestRef.current += 1;
    setBusy(false);
    setSeeking(false);
    setOpen(false);
  }

  function show() {
    requestRef.current += 1;
    setStart('');
    setGoal('');
    setActiveField('start');
    setError('');
    setBusy(false);
    setSeeking(false);
    setOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    const startRaw = start.trim();
    const goalRaw = goal.trim();
    if (!startRaw) {
      setError('יש לבחור ערך התחלה.');
      return;
    }
    if (!goalRaw) {
      setError('יש לבחור ערך מטרה.');
      return;
    }

    const request = requestRef.current + 1;
    requestRef.current = request;
    setActiveField('');
    setBusy(true);
    setSeeking(false);
    setError('');
    try {
      const startTitle = await canonicalTitle(startRaw, 'ערך ההתחלה לא נמצא.');
      if (requestRef.current !== request) return;
      const goalTitle = await canonicalTitle(goalRaw, 'ערך המטרה לא נמצא.');
      if (requestRef.current !== request) return;
      if (sameTitle(startTitle, goalTitle)) {
        setError('ערך ההתחלה וערך המטרה צריכים להיות שונים.');
        setBusy(false);
        return;
      }

      setSeeking(true);
      const found = await findShortestPath(startTitle, goalTitle);
      if (requestRef.current !== request) return;
      const fastestPath = Array.isArray(found?.path) ? found.path : [];
      const ref = await addDoc(collection(db, 'scores'), {
        uid: user.uid,
        name: accountName(user),
        mode: 'free',
        preset: true,
        pagesVisited: 0,
        timeTaken: 0,
        startTitle,
        goalTitle,
        path: [],
        fastestPath,
        timestamp: Timestamp.now(),
      });
      if (requestRef.current !== request) return;
      setOpen(false);
      setBusy(false);
      setSeeking(false);
      onCreated(ref.id);
    } catch (saveError) {
      console.error(saveError);
      if (requestRef.current !== request) return;
      const knownMissing = saveError?.code === 'missingtitle' && saveError.message !== 'missing';
      setError(knownMissing ? saveError.message : 'לא הצלחנו להוסיף את המשחק. נסו שוב.');
      setBusy(false);
      setSeeking(false);
    }
  }

  return (
    <>
      <button
        className="sun-button yin-button"
        type="button"
        aria-label="בחירת ערך התחלה וערך מטרה"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <YinYangIcon />
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation" onClick={close}>
          <form
            className="modal-card pair-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
            onClick={(event) => event.stopPropagation()}
            onSubmit={submit}
          >
            <h2 id={`${formId}-title`}>משחק לפי בחירה</h2>
            <p className="lede">בחרו ערך התחלה וערך מטרה. המשחק יופיע בטבלה עם הדרך המהירה ביותר.</p>
            <TitleField
              id={`${formId}-start`}
              label="ערך התחלה"
              value={start}
              onChange={setStart}
              disabled={busy}
              suggestions={startSuggestions}
              onPick={setStart}
              active={activeField === 'start'}
              onActive={(next) => setActiveField((current) => (next ? 'start' : (current === 'start' ? '' : current)))}
            />
            <TitleField
              id={`${formId}-goal`}
              label="ערך מטרה"
              value={goal}
              onChange={setGoal}
              disabled={busy}
              suggestions={goalSuggestions}
              onPick={setGoal}
              active={activeField === 'goal'}
              onActive={(next) => setActiveField((current) => (next ? 'goal' : (current === 'goal' ? '' : current)))}
            />
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {seeking ? <p className="status">מחפשים את הדרך המהירה ביותר. זה יכול לקחת כחצי דקה.</p> : null}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'רגע…' : 'הוספה לטבלה'}
            </button>
            <button className="text-button" type="button" onClick={close}>
              ביטול
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
