import { useEffect, useRef } from 'react';

function BackIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M19 12H6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M11.2 6.4 5.5 12l5.7 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M14.4 14.4 19.2 19.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 14.2 12 8.8l5.5 5.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 9.8 12 15.2l5.5-5.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 7l10 10M17 7 7 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function backLabel(backUses, onFirstPage) {
  if (onFirstPage) return 'חזרה לדף הקודם, זה הדף הראשון';
  if (backUses < 1) return 'חזרה לדף הקודם, לא נותרו שימושים';
  return `חזרה לדף הקודם, נותרו ${backUses}`;
}

export default function GameTools({
  backUses,
  backDisabled,
  onFirstPage,
  onBack,
  searchDisabled,
  searchOpen,
  onToggleSearch,
}) {
  return (
    <div className="game-tools">
      <button
        className="menu-button back-button"
        type="button"
        disabled={backDisabled}
        aria-label={backLabel(backUses, onFirstPage)}
        onClick={onBack}
      >
        <BackIcon />
        <bdi className="back-count" dir="ltr" aria-hidden="true">{backUses}</bdi>
      </button>
      <button
        className="menu-button search-tool"
        type="button"
        disabled={searchDisabled}
        aria-label={searchDisabled ? 'חיפוש בדף, זמין רק בדף אחד במשחק' : 'חיפוש בדף'}
        aria-expanded={searchOpen}
        aria-controls="page-find"
        onClick={onToggleSearch}
      >
        <SearchIcon />
      </button>
    </div>
  );
}

export function FindBar({
  query,
  onQueryChange,
  matchIndex,
  matchCount,
  matchCapped,
  onNext,
  onPrev,
  onCloseSearch,
}) {
  const inputRef = useRef(null);
  const trimmed = query.trim();
  const countLabel = !trimmed
    ? ''
    : matchCount < 1
      ? '0'
      : `${matchIndex + 1}/${matchCount}${matchCapped ? '+' : ''}`;
  const countAria = !trimmed
    ? ''
    : matchCount < 1
      ? 'אין תוצאות'
      : `התאמה ${matchIndex + 1} מתוך ${matchCount}${matchCapped ? ' לפחות' : ''}`;

  useEffect(() => {
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
    input?.select();
  }, []);

  function onFindKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCloseSearch();
      return;
    }
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (event.shiftKey) onPrev();
      else onNext();
    }
  }

  return (
    <div
      className="find-bar"
      id="page-find"
      role="search"
      aria-label="חיפוש בדף"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        id="page-find-input"
        className="find-input"
        ref={inputRef}
        type="search"
        dir="auto"
        value={query}
        placeholder="חיפוש בדף"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onFindKeyDown}
      />
      <span
        className={`find-count${trimmed && matchCount < 1 ? ' is-empty' : ''}`}
        dir="ltr"
        aria-live="polite"
        aria-atomic="true"
        aria-label={countAria}
      >
        {countLabel}
      </span>
      <button
        className="find-icon-button"
        type="button"
        aria-label="ההתאמה הקודמת"
        disabled={matchCount < 1}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onPrev}
      >
        <UpIcon />
      </button>
      <button
        className="find-icon-button"
        type="button"
        aria-label="ההתאמה הבאה"
        disabled={matchCount < 1}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onNext}
      >
        <DownIcon />
      </button>
      <button
        className="find-icon-button"
        type="button"
        aria-label="סגירת החיפוש"
        onPointerDown={(event) => event.preventDefault()}
        onClick={onCloseSearch}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
