import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ESCAPE_LAYER, useEscape } from "./escape.ts";
import { FLOAT, IconButton } from "./kit.tsx";
import {
  ago,
  clearNotices,
  clearToasts,
  markNoticesRead,
  NOTICE_LEVEL_LABEL,
  NOTICE_LEVELS,
  noticeLog,
  setNoticeLevel,
  setNoticesOpen,
  subscribeToasts,
  unreadNotices,
  useNoticeLevel,
} from "./toasts.ts";
import Segmented from "./Segmented.tsx";

// The bell at the top right (owner, 2026-11-15; ja-mvo9.5's notification stack): every notice raised this visit, newest
// first, so a toast swiped away can be read later. A badge counts those not yet seen; opening the list marks them seen.

const DOT = { info: "bg-fg-3", warn: "bg-warn", good: "bg-accent" } as const;

export default function Notices() {
  const log = useSyncExternalStore(subscribeToasts, noticeLog, noticeLog);
  const unread = useSyncExternalStore(subscribeToasts, unreadNotices, unreadNotices);
  const level = useNoticeLevel();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Re-read "how long ago" now and then while the list is open.
  const [, tick] = useState(0);
  useEffect(() => {
    setNoticesOpen(open);
    if (!open) return;
    markNoticesRead();
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    // A press anywhere outside it closes it, as Escape does (below).
    const press = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", press, true);
    return () => {
      clearInterval(timer);
      // What the list showed has been read: none of it comes back onto the field for a fresh 7 s (review of #219, N5).
      clearToasts();
      setNoticesOpen(false);
      window.removeEventListener("pointerdown", press, true);
    };
  }, [open]);
  // Escape closes it, first, so a drawer under it stays open: a popover layer of the Escape manager (escape.ts), under a dialog opened over it.
  useEscape(
    ESCAPE_LAYER.popover,
    () => {
      setOpen(false);
      return true;
    },
    open,
  );
  // New notices while it is open are seen at once.
  useEffect(() => {
    if (open && unread) markNoticesRead();
  }, [open, unread]);
  return (
    <div ref={box} className={`pointer-events-auto relative flex items-center p-1 ${FLOAT}`}>
      <IconButton
        icon="bell"
        label="Notices"
        active={open}
        aria-pressed={undefined}
        aria-expanded={open}
        badge={unread ? (unread > 9 ? "9+" : unread) : undefined}
        badgeLabel={unread ? `${unread} new` : undefined}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <section
          aria-label="notices"
          className={`absolute top-full right-0 z-30 mt-2 flex max-h-[60dvh] w-80 max-w-[calc(100vw-1.5rem)] flex-col ${FLOAT}`}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <h2 className="text-[14px] font-semibold text-fg">Notices</h2>
            {log.length > 0 && (
              <button
                type="button"
                className="ml-auto rounded-md px-2 py-1 text-xs text-fg-3 hover:bg-raised hover:text-fg"
                onClick={clearNotices}
              >
                Clear
              </button>
            )}
          </div>
          <div className="border-b border-line px-3 py-2">
            <Segmented
              label="notices over the map"
              className="text-xs"
              fill
              options={NOTICE_LEVELS.map((l) => ({
                key: l,
                label: NOTICE_LEVEL_LABEL[l],
                on: level === l,
                onPick: () => setNoticeLevel(l),
              }))}
            />
            <p className="mt-1 text-[11px] text-fg-3">
              {level === "all"
                ? "Every notice floats over the map for a few seconds."
                : level === "important"
                  ? "Only warnings and the game's end float over the map. The rest wait here."
                  : "Nothing floats over the map. Notices wait here, and the bell counts them."}
            </p>
          </div>
          {log.length === 0 ? (
            <p className="px-3 py-4 text-sm text-fg-3">Nothing yet. Notices you swipe away wait here.</p>
          ) : (
            <ol className="min-h-0 flex-1 overflow-y-auto py-1">
              {log.map((n) => (
                <li key={n.id} className="flex gap-2 px-3 py-2 text-sm text-fg-2">
                  <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[n.tone]}`} />
                  <span className="min-w-0 flex-1">
                    {n.text}
                    {n.count > 1 && (
                      <span className="ml-1.5 rounded-full bg-fg/10 px-1.5 text-xs font-medium tabular-nums">×{n.count}</span>
                    )}
                    <span className="block text-[11px] text-fg-3">{ago(n.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
