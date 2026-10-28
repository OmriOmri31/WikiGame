import { useEffect, useRef, useState } from 'react';
import { checkCustomPair } from '../customPair';
import { suggestArticles } from '../wikiBot';
import { normalizeTitle, sameTitle } from '../wikipedia';

// One article box with suggestions from Hebrew Wikipedia as the player types.
function ArticleField({ id, label, value, onChange, error, disabled }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef(0);
  const generation = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function edit(next) {
    onChange(next);
    window.clearTimeout(timer.current);
    const query = normalizeTitle(next);
    generation.current += 1;
    if (!query) {
      setOpen(false);
      setItems([]);
      return;
    }
    const run = generation.current;
    setOpen(true);
    setLoading(true);
    setFailed(false);
    timer.current = window.setTimeout(async () => {
      try {
        const found = await suggestArticles(query);
        if (run !== generation.current) return;
        setItems(found);
        setActive(0);
        // Nothing to choose when the only suggestion is what was typed: keep the button free.
        if (found.length === 1 && sameTitle(found[0].title, query)) setOpen(false);
      } catch (searchError) {
        console.error(searchError);
        if (run !== generation.current) return;
        setItems([]);
        setFailed(true);
      } finally {
        if (run === generation.current) setLoading(false);
      }
    }, 180);
  }

  function pick(title) {
    generation.current += 1;
    window.clearTimeout(timer.current);
    onChange(title);
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(event) {
    if (!open) return;
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      setActive((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      setActive((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Enter' && items[active]) {
      event.preventDefault();
      pick(items[active].title);
    }
  }

  const listId = `${id}-suggestions`;
  const errorId = `${id}-error`;
  return (
    <div className="pick-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${id}-option-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        disabled={disabled}
        autoComplete="off"
        enterKeyHint="next"
        placeholder="התחילו להקליד…"
        onChange={(event) => edit(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open ? (
        <ul className={items.length ? 'pick-suggest' : 'pick-suggest is-note'} id={listId} role="listbox">
          {loading && items.length === 0 ? <li className="pick-suggest-note">מחפשים…</li> : null}
          {failed && items.length === 0 ? <li className="pick-suggest-note">לא הצלחנו לחפש.</li> : null}
          {!loading && !failed && items.length === 0 ? <li className="pick-suggest-note">אין ערך כזה.</li> : null}
          {items.map((item, index) => (
            <li key={item.title} role="presentation">
              <button
                id={`${id}-option-${index}`}
                className={index === active ? 'is-active' : ''}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(item.title)}
              >
                <span>{item.title}</span>
                {item.description ? <small>{item.description}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="form-error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}

// "בחירה שלי": the player picks both articles; they are checked before the game starts.
export default function CustomPairForm({ onPlay, onBack, check = checkCustomPair }) {
  const [start, setStart] = useState('');
  const [goal, setGoal] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const pair = await check(start, goal);
      onPlay({ startTitle: pair.start, goalTitle: pair.goal });
    } catch (error) {
      setProblem({ field: error?.field || 'pair', message: error?.field ? error.message : 'לא הצלחנו לבדוק את הערכים. נסו שוב.' });
      setBusy(false);
    }
  }

  return (
    <form className="custom-pair" onSubmit={submit} noValidate>
      <ArticleField
        id="custom-start"
        label="מתחילים בערך"
        value={start}
        onChange={(next) => { setStart(next); if (problem?.field === 'start') setProblem(null); }}
        error={problem?.field === 'start' ? problem.message : ''}
        disabled={busy}
      />
      <ArticleField
        id="custom-goal"
        label="ומגיעים לערך"
        value={goal}
        onChange={(next) => { setGoal(next); if (problem?.field === 'goal') setProblem(null); }}
        error={problem?.field === 'goal' ? problem.message : ''}
        disabled={busy}
      />
      {problem?.field === 'pair' ? <p className="form-error" role="alert">{problem.message}</p> : null}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'בודקים…' : 'מתחילים לשחק'}
      </button>
      <button className="text-button free-cancel" type="button" onClick={onBack} disabled={busy}>
        חזרה
      </button>
    </form>
  );
}
