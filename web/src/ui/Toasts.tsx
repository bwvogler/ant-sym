import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import {
  currentToasts,
  dismissToast,
  noticesOpen,
  subscribeToasts,
  swipeOutcome,
  TOAST_MS,
  type Toast,
  type ToastPlace,
} from "./toasts.ts";

const TONE = {
  info: "border-line bg-panel text-fg",
  warn: "border-warn/40 bg-warn-soft text-warn",
  good: "border-accent/40 bg-accent-soft text-accent",
} as const;

const PLACE: Record<ToastPlace, string> = {
  top: "top-[7.5rem] sm:top-[4.5rem]",
  lab: "bottom-[calc(42dvh+5rem)] lg:bottom-[calc(42dvh+8rem)]",
  bottom: "bottom-20 lg:bottom-32",
  sheet: "max-sm:sr-only bottom-20 lg:bottom-32",
  "sheet-lab": "max-sm:sr-only bottom-[calc(42dvh+5rem)] lg:bottom-[calc(42dvh+8rem)]",
};

/**
 * The notices raised with pushToast, each gone after TOAST_MS, on a tap, or swiped away (owner, 2026-11-15): sideways
 * or down. A finger held on one stops its clock, and lifting a hold leaves it. A swiped notice is still in the log
 * behind the bell (ui/Notices.tsx). `place` (toastPlace): "bottom" over the tab bar, "top" under the HUD (while the builder's tray
 * fills the bottom), "lab" above Lab mode's workbench, at the map's foot (PRD §69.7), "sheet" and "sheet-lab" unseen on a
 * phone, where an open drawer is a bottom sheet that takes the screen (the notices are still announced to a screen reader,
 * and wait in the bell, whose badge counts them), and the bottom's or the Lab's place from sm up (PRD §69.9).
 */
export default function Toasts({ place = "bottom" }: { place?: ToastPlace }) {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts);
  // While the bell's list is open they are in it: none over it.
  const hidden = useSyncExternalStore(subscribeToasts, noticesOpen, noticesOpen);
  if (hidden) return null;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 ${PLACE[place]}`}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <Item key={t.id} t={t} />
      ))}
    </div>
  );
}

function Item({ t }: { t: Toast }) {
  // Where the finger went (CSS px) while it is down; null when no finger is on it.
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [leaving, setLeaving] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; at: number } | null>(null);
  // The timer waits while a finger holds the notice.
  useEffect(() => {
    if (drag) return;
    const timer = setTimeout(() => dismissToast(t.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [t.id, drag]);
  // A swiped notice slides off, then goes.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => dismissToast(t.id), 150);
    return () => clearTimeout(timer);
  }, [leaving, t.id]);
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, at: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ dx: 0, dy: 0 });
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    setDrag({ dx: e.clientX - s.x, dy: Math.max(0, e.clientY - s.y) });
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    setDrag(null);
    if (e.type === "pointerup" && swipeOutcome(dx, dy, performance.now() - s.at) === "dismiss") setLeaving(dx < 0 ? -1 : 1);
  };
  const dx = leaving ? leaving * 480 : (drag?.dx ?? 0);
  const dy = leaving ? 0 : Math.abs(drag?.dx ?? 0) > (drag?.dy ?? 0) ? 0 : (drag?.dy ?? 0);
  const fade = leaving ? 0 : 1 - Math.min(0.7, Math.max(Math.abs(dx), dy) / 200);
  return (
    <button
      type="button"
      className={`pointer-events-auto max-w-xl touch-none rounded-md border px-3 py-2 text-left text-sm shadow-lg select-none ${drag ? "" : "transition-[transform,opacity] duration-150"} ${TONE[t.tone]}`}
      style={{ transform: `translate(${dx}px, ${dy}px)`, opacity: fade }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && dismissToast(t.id)}
      title="Tap or swipe away; the bell at the top right keeps it"
      aria-label={`${t.text} (dismiss)`}
    >
      {t.text}
    </button>
  );
}
