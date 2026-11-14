import { useEffect, useSyncExternalStore } from "react";
import { currentToasts, dismissToast, subscribeToasts, TOAST_MS, type Toast } from "./toasts.ts";

const TONE = {
  info: "border-line bg-panel text-fg",
  warn: "border-warn/40 bg-warn-soft text-warn",
  good: "border-accent/40 bg-accent-soft text-accent",
} as const;

/** The notices raised with pushToast, bottom centre, each gone after TOAST_MS or on a click. */
export default function Toasts() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-4"
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
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(t.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [t.id]);
  return (
    <button
      type="button"
      className={`pointer-events-auto max-w-xl rounded-md border px-3 py-2 text-left text-sm shadow-lg max-sm:pointer-events-none ${TONE[t.tone]}`}
      onClick={() => dismissToast(t.id)}
      title="Dismiss"
    >
      {t.text}
    </button>
  );
}
