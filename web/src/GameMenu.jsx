import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { spring } from './spring';

const OPEN_SCALE = 1;
const CLOSED_SCALE = 0.86;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readScale(element) {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === 'none') return 1;
  const scale = new DOMMatrix(transform).a;
  return Number.isFinite(scale) ? scale : 1;
}

function MenuIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 7h15M4.5 12h15M4.5 17h15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(2.4 2.4) scale(0.8)"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </g>
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 2.75v18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M6 4.2h12.2l-2.25 3.5 2.25 3.5H6z"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function GameMenu({ onRestart, onExit }) {
  const menuId = useId();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const stopRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [giveUpOpen, setGiveUpOpen] = useState(false);
  const reduced = prefersReducedMotion();

  if (open && !mounted) setMounted(true);

  function closeMenu(restoreFocus) {
    setOpen(false);
    if (restoreFocus) {
      buttonRef.current?.focus({ preventScroll: true });
      return;
    }
    if (rootRef.current?.contains(document.activeElement)) document.activeElement.blur();
  }

  function chooseRestart() {
    closeMenu(true);
    onRestart();
  }

  function chooseGiveUp() {
    closeMenu(false);
    setGiveUpOpen(true);
  }

  function cancelGiveUp() {
    setGiveUpOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  }

  function confirmGiveUp() {
    setGiveUpOpen(false);
    onExit();
  }

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });

    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu(true);
    };
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) closeMenu(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!giveUpOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelGiveUp();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [giveUpOpen]);

  useLayoutEffect(() => {
    if (!mounted) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    let alive = true;

    if (prefersReducedMotion()) {
      panel.style.transform = 'none';
      panel.style.opacity = open ? '1' : '0';
      if (!open) {
        const timer = window.setTimeout(() => {
          if (alive) setMounted(false);
        }, 200);
        return () => {
          alive = false;
          window.clearTimeout(timer);
        };
      }
      return () => {
        alive = false;
      };
    }

    const from = readScale(panel);
    stopRef.current?.();
    stopRef.current = spring({
      from: Number.isFinite(from) ? from : (open ? CLOSED_SCALE : OPEN_SCALE),
      to: open ? OPEN_SCALE : CLOSED_SCALE,
      response: 0.3,
      dampingRatio: 1,
      restDistance: 0.0015,
      restVelocity: 0.02,
      onUpdate: (scale) => {
        if (!alive) return;
        panel.style.transform = `scale(${scale})`;
        panel.style.opacity = String(Math.min(1, Math.max(0, (scale - CLOSED_SCALE) / (OPEN_SCALE - CLOSED_SCALE))));
      },
      onRest: () => {
        if (alive && !open) setMounted(false);
      },
    });

    return () => {
      alive = false;
      stopRef.current?.();
    };
  }, [open, mounted]);

  function onPanelKeyDown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = current < 0 ? 0 : (current + delta + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <>
      <div className={`game-menu${reduced ? ' is-reduced' : ''}`} ref={rootRef}>
        <button
          ref={buttonRef}
          className="menu-button"
          type="button"
          aria-label="תפריט"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          <MenuIcon />
        </button>
        {mounted ? (
          <div
            id={menuId}
            className={`game-menu-panel${reduced ? ' is-reduced' : ''}${open ? '' : ' is-closing'}`}
            role="menu"
            aria-label="אפשרויות המשחק"
            aria-hidden={!open}
            ref={panelRef}
            onKeyDown={onPanelKeyDown}
          >
            <button className="game-menu-item" type="button" role="menuitem" onClick={chooseRestart}>
              <span>התחלה מחדש</span>
              <RestartIcon />
            </button>
            <button className="game-menu-item danger" type="button" role="menuitem" onClick={chooseGiveUp}>
              <span>ויתור</span>
              <FlagIcon />
            </button>
          </div>
        ) : null}
      </div>

      {giveUpOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={cancelGiveUp}>
          <div
            className="modal-card confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="give-up-title"
            aria-describedby="give-up-body"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="give-up-title">לוותר על המשחק?</h2>
            <p id="give-up-body" className="lede">ההתקדמות בסיבוב הזה לא תישמר.</p>
            <button className="primary" type="button" autoFocus onClick={cancelGiveUp}>
              המשך לשחק
            </button>
            <button className="secondary danger" type="button" onClick={confirmGiveUp}>
              ויתור
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
