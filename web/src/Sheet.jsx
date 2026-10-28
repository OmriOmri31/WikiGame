import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { project, readTranslateY, rubberband, spring } from './spring';
import { useBackCloses } from './backGuard';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function releaseVelocity(history) {
  if (history.length < 2) return 0;
  const last = history[history.length - 1];
  const first = history.find((point) => last.t - point.t <= 100) || history[0];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return 0;
  return (last.y - first.y) / dt;
}

export default function Sheet({ open, onOpenChange, label, header, children }) {
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef(null);
  const scrimRef = useRef(null);
  const stopRef = useRef(null);
  const dragRef = useRef(null);
  const closeVelocity = useRef(0);

  if (open && !mounted) setMounted(true);
  useBackCloses(open, () => onOpenChange(false));

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useLayoutEffect(() => {
    if (!mounted) return undefined;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim) return undefined;
    if (dragRef.current) return undefined;

    const height = panel.getBoundingClientRect().height || window.innerHeight;
    const reduced = prefersReducedMotion();

    if (reduced) {
      panel.style.transform = 'none';
      scrim.style.opacity = open ? '1' : '0';
      if (!open) {
        const timer = window.setTimeout(() => setMounted(false), 200);
        return () => window.clearTimeout(timer);
      }
      return undefined;
    }

    const from = readTranslateY(panel);
    const velocity = open ? 0 : closeVelocity.current;
    const flicked = Math.abs(velocity) > 80;
    stopRef.current?.();
    stopRef.current = spring({
      from: Number.isFinite(from) ? from : (open ? height : 0),
      to: open ? 0 : height,
      velocity,
      response: 0.3,
      dampingRatio: flicked ? 0.8 : 1,
      onUpdate: (y) => {
        panel.style.transform = `translate3d(0, ${y}px, 0)`;
        scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - y / height)));
      },
      onRest: () => {
        closeVelocity.current = 0;
        if (!open) setMounted(false);
      },
    });

    return () => stopRef.current?.();
  }, [open, mounted]);

  useEffect(() => {
    if (open && mounted) panelRef.current?.focus();
  }, [open, mounted]);

  if (!mounted) return null;

  function applyDrag(y) {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim) return;
    const height = panel.getBoundingClientRect().height || window.innerHeight;
    panel.style.transform = `translate3d(0, ${y}px, 0)`;
    scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - y / height)));
  }

  function onPointerDown(event) {
    if (prefersReducedMotion()) return;
    if (event.button !== 0) return;
    if (event.target.closest('button, a, input')) return;
    const panel = panelRef.current;
    if (!panel) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    stopRef.current?.();
    const y = readTranslateY(panel);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      origin: y,
      history: [{ y, t: performance.now() }],
    };
    if (!open) onOpenChange(true);
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const panel = panelRef.current;
    const height = panel?.getBoundingClientRect().height || window.innerHeight;
    const raw = drag.origin + (event.clientY - drag.startY);
    const y = raw < 0 ? -rubberband(-raw, height) : raw;
    drag.history.push({ y, t: performance.now() });
    if (drag.history.length > 8) drag.history.shift();
    applyDrag(y);
  }

  function onPointerUp(event) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const panel = panelRef.current;
    if (!panel) return;
    const height = panel.getBoundingClientRect().height || window.innerHeight;
    const y = readTranslateY(panel);
    const velocity = releaseVelocity(drag.history);
    const projected = y + project(velocity);
    if (projected > height * 0.35 || y > height * 0.4) {
      closeVelocity.current = velocity;
      onOpenChange(false);
      return;
    }
    const flicked = Math.abs(velocity) > 80;
    stopRef.current?.();
    stopRef.current = spring({
      from: y,
      to: 0,
      velocity,
      response: 0.3,
      dampingRatio: flicked ? 0.8 : 1,
      onUpdate: (next) => applyDrag(next),
    });
  }

  return (
    <div className={`sheet-root${prefersReducedMotion() ? ' is-reduced' : ''}${open ? '' : ' is-closing'}`}>
      <div className="sheet-scrim" ref={scrimRef} onClick={() => onOpenChange(false)} />
      <section
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={panelRef}
      >
        <header
          className="sheet-header"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="grabber" aria-hidden="true" />
          {header}
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
