import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const EDGE = 8;

// A small "?" next to a bot's name. Hover shows the note on a mouse, a tap toggles it.
export default function BotHelp({ label, text }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [place, setPlace] = useState(null);
  const buttonRef = useRef(null);
  const tipRef = useRef(null);
  const tipId = useId();
  const open = pinned || hovered;

  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const tip = tipRef.current;
    if (!button || !tip) return;
    const rect = button.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const viewW = document.documentElement.clientWidth;
    const viewH = window.innerHeight;
    // RTL: the note starts at the button's right edge and grows to the left.
    let left = rect.right - width;
    left = Math.max(EDGE, Math.min(left, viewW - width - EDGE));
    let top = rect.bottom + 6;
    if (top + height > viewH - EDGE) top = Math.max(EDGE, rect.top - height - 6);
    setPlace({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function close() {
      setPinned(false);
      setHovered(false);
    }
    function onPointer(event) {
      if (buttonRef.current?.contains(event.target) || tipRef.current?.contains(event.target)) return;
      close();
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setPlace(null);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        className="bot-help"
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setPinned((value) => !value)}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false); }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open ? createPortal(
        <span
          ref={tipRef}
          id={tipId}
          role="tooltip"
          dir="rtl"
          className="bot-help-tip"
          style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }}
        >
          {text}
        </span>,
        document.body,
      ) : null}
    </>
  );
}
