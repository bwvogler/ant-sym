// Short notices over the field (ja-lo8.2): what changed that the player should know about, without a panel to read.
// One small store, like learn.ts, so anything can raise one.
//
// Every notice is also kept in a log (newest first), so a toast swiped away can be read again later from the bell at the
// top right (owner, 2026-11-15; ja-mvo9.5's notification stack). The log lives as long as the page; it is not saved.

export type ToastTone = "info" | "warn" | "good";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

/** A notice in the log: the toast, when it was raised (Date.now()), and whether the player has opened the log since. */
export interface Notice extends Toast {
  at: number;
  read: boolean;
}

/** How long a notice stays, in milliseconds. */
export const TOAST_MS = 7000;
/** At most this many at once: the oldest goes first. */
const MAX = 3;
/** Notices the log keeps: the oldest goes first. */
export const LOG_MAX = 50;

let toasts: readonly Toast[] = [];
/** The bell's list is open: the field's toasts hide meanwhile, being in it already (review of #219, N2). */
let logOpen = false;
let log: readonly Notice[] = [];
let next = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

/** Raise a notice; the same text already showing is not raised twice. Returns its id. Each one raised goes in the log. */
export function pushToast(text: string, tone: ToastTone = "info", now = Date.now()): number {
  const same = toasts.find((t) => t.text === text);
  if (same) return same.id;
  const t = { id: next++, text, tone };
  toasts = [...toasts, t].slice(-MAX);
  log = [{ ...t, at: now, read: false }, ...log].slice(0, LOG_MAX);
  emit();
  return t.id;
}

/** Take a toast off the field. It stays in the log. */
export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const currentToasts = (): readonly Toast[] => toasts;

/** Take every toast off the field (they stay in the log): the list just showed them (review of #219, N5). */
export function clearToasts(): void {
  if (!toasts.length) return;
  toasts = [];
  emit();
}

export const noticesOpen = (): boolean => logOpen;

export function setNoticesOpen(open: boolean): void {
  if (open === logOpen) return;
  logOpen = open;
  emit();
}

/** The log, newest first. */
export const noticeLog = (): readonly Notice[] => log;

/** Notices raised since the log was last opened. */
export const unreadNotices = (): number => log.reduce((n, x) => n + (x.read ? 0 : 1), 0);

/** The player has seen the log: every notice in it is read. */
export function markNoticesRead(): void {
  if (!log.some((x) => !x.read)) return;
  log = log.map((x) => (x.read ? x : { ...x, read: true }));
  emit();
}

/** Empty the log (the toasts on the field stay). */
export function clearNotices(): void {
  log = [];
  emit();
}

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/**
 * What a finger's move on a toast does when it lifts, from how far it went (CSS px): a tap (barely moved) or a swipe
 * past SWIPE_PX either way dismisses it; anything between slides it back.
 */
export const SWIPE_PX = 60;
export const TAP_PX = 6;
/** A press held this long (ms) is a hold to read, not a tap: lifting it leaves the notice (review of #219, N1). */
export const HOLD_MS = 500;
export function swipeOutcome(dx: number, dy: number, heldMs = 0): "dismiss" | "stay" {
  const tap = Math.hypot(dx, dy) <= TAP_PX && heldMs < HOLD_MS;
  return tap || Math.abs(dx) >= SWIPE_PX || dy >= SWIPE_PX ? "dismiss" : "stay";
}

/** How long ago `at` was, in a few words ("just now", "5 min ago", "2 h ago"). */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}
