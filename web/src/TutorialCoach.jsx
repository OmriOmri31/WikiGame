import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The tutorial's overlay: everything is greyed out except the one thing to press, with a short
// line next to it. Taps on the grey part do nothing; the lit element works as usual.
const GAP = 6;
const MARGIN = 12;

function sameRect(a, b) {
  if (!a || !b) return a === b;
  return Math.round(a.top) === Math.round(b.top) && Math.round(a.left) === Math.round(b.left)
    && Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height);
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function TutorialCoach({ step, stepNumber, stepCount, onNext, onExit }) {
  const [rect, setRect] = useState(null);
  const [size, setSize] = useState(viewport);
  const [bubbleHeight, setBubbleHeight] = useState(0);
  const bubbleRef = useRef(null);
  const scrolledRef = useRef('');

  // Follow the lit element as the page scrolls, the keyboard opens or the sheet slides in.
  useEffect(() => {
    let frame = 0;
    let last = null;
    const measure = () => {
      const element = step?.target ? document.querySelector(step.target) : null;
      let next = null;
      if (element) {
        const box = element.getBoundingClientRect();
        if (box.width > 0 || box.height > 0) next = { top: box.top, left: box.left, width: box.width, height: box.height };
        if (next && scrolledRef.current !== step.id) {
          scrolledRef.current = step.id;
          const { height } = viewport();
          if (box.top < 0 || box.bottom > height) element.scrollIntoView({ block: 'center' });
        }
      }
      if (!sameRect(next, last)) {
        last = next;
        setRect(next);
      }
      const view = viewport();
      setSize((current) => (current.width === view.width && current.height === view.height ? current : view));
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [step?.id, step?.target]);

  useLayoutEffect(() => {
    const height = bubbleRef.current?.getBoundingClientRect().height || 0;
    if (Math.round(height) !== Math.round(bubbleHeight)) setBubbleHeight(height);
  });

  if (!step) return null;
  const { width, height } = size;
  const hole = rect ? {
    top: Math.max(0, rect.top - GAP),
    left: Math.max(0, rect.left - GAP),
    right: Math.min(width, rect.left + rect.width + GAP),
    bottom: Math.min(height, rect.top + rect.height + GAP),
  } : null;

  // The line goes under the lit element when it fits, otherwise above it.
  let bubbleTop = height / 2 - bubbleHeight / 2;
  if (hole) {
    const below = hole.bottom + MARGIN;
    const above = hole.top - MARGIN - bubbleHeight;
    if (below + bubbleHeight <= height - MARGIN) bubbleTop = below;
    else if (above >= MARGIN) bubbleTop = above;
    else bubbleTop = Math.max(MARGIN, height - MARGIN - bubbleHeight);
  }

  const shades = hole ? [
    { key: 'top', top: 0, left: 0, width, height: hole.top },
    { key: 'bottom', top: hole.bottom, left: 0, width, height: Math.max(0, height - hole.bottom) },
    { key: 'left', top: hole.top, left: 0, width: hole.left, height: hole.bottom - hole.top },
    { key: 'right', top: hole.top, left: hole.right, width: Math.max(0, width - hole.right), height: hole.bottom - hole.top },
  ] : [{ key: 'all', top: 0, left: 0, width, height }];

  return createPortal(
    <div className="coach" data-step={step.id}>
      {shades.map(({ key, ...box }) => (
        <div key={key} className="coach-shade" style={box} aria-hidden="true" />
      ))}
      {hole ? (
        <div
          className={step.next ? 'coach-ring is-blocking' : 'coach-ring'}
          style={{ top: hole.top, left: hole.left, width: hole.right - hole.left, height: hole.bottom - hole.top }}
          aria-hidden="true"
        />
      ) : null}
      <div className="coach-bubble" ref={bubbleRef} style={{ top: bubbleTop }} role="status" aria-live="polite">
        <p className="coach-count" aria-hidden="true"><bdi dir="ltr">{stepNumber}/{stepCount}</bdi></p>
        <p className="coach-text">{step.text}</p>
        {step.next ? (
          <button className="primary coach-next" type="button" onClick={onNext}>הבא</button>
        ) : null}
      </div>
      <button className="coach-close" type="button" aria-label="יציאה מההדרכה" onClick={onExit}>
        <CloseIcon />
      </button>
    </div>,
    document.body,
  );
}
