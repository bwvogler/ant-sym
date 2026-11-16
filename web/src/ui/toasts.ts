// Short notices over the field (ja-lo8.2): what changed that the player should know about, without a panel to read.
// One small store, like learn.ts, so anything can raise one.
//
// Every notice is also kept in a log (newest first), so a toast swiped away can be read again later from the bell at the
// top right (owner, 2026-11-15; ja-mvo9.5's notification stack). The log lives as long as the page; it is not saved.
//
// Too many (owner, 2026-11-16): a notice raised again while it still shows adds to a count ("×3") rather than stacking, and
// the player can ask for the important ones only, or none on the field at all (the bell still counts them).

import { useSyncExternalStore } from "react";

export type ToastTone = "info" | "warn" | "good";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  /** how many times this notice has been raised while it showed (the same text, or the same group): 1 the first time */
  count: number;
  /** changes each time it is raised again, so its clock starts over */
  bump: number;
  /** one that shows even when the player has asked for important notices only (a warning, or one raised so) */
  important: boolean;
}

/** A toast as the store holds it: with the group it counts in, if any. */
interface Shown extends Toast {
  group?: string;
}

/** A notice in the log: the toast, when it was raised (Date.now()), and whether the player has opened the log since. */
export interface Notice extends Toast {
  at: number;
  read: boolean;
}

/** Where the notices sit (Toasts' `place`). */
export type ToastPlace = "bottom" | "top" | "lab" | "sheet" | "sheet-lab";

/**
 * Where notices go for what is on screen (PRD §69.9). The builder's tray fills the bottom, so they go under the HUD. Lab
 * mode's workbench is the map's foot, so they sit above it. An open drawer is a bottom sheet on a phone, which they would
 * cover (review of #182, N10): there they are not shown (still announced; they wait in the bell) instead, and everywhere else they keep the place they would have had.
 */
export function toastPlace(on: { building: boolean; drawer: boolean; lab: boolean }): ToastPlace {
  if (on.building) return "top";
  if (on.drawer) return on.lab ? "sheet-lab" : "sheet";
  return on.lab ? "lab" : "bottom";
}

/** How long a notice stays, in milliseconds. */
export const TOAST_MS = 7000;
/** At most this many at once: the oldest goes first. */
const MAX = 3;
/** Notices the log keeps: the oldest goes first. */
export const LOG_MAX = 50;

let toasts: readonly Shown[] = [];
/** The bell's list is open: the field's toasts hide meanwhile, being in it already (review of #219, N2). */
let logOpen = false;
let log: readonly Notice[] = [];
let next = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export interface PushOptions {
  /** notices of one kind whose words differ ("3 ants are following your line") share a group: raised again, one count */
  group?: string;
  /** shows even for important notices only; a warning always does */
  important?: boolean;
  now?: number;
}

/**
 * Raise a notice. One already showing with the same text (or the same group) is not stacked: it counts up ("×2"), takes the
 * latest words, and its 7 s start over, in the log as well as on the field. Returns its id. Each new one raised goes in
 * the log. The third argument is the time (tests) or the options.
 */
export function pushToast(text: string, tone: ToastTone = "info", opts: number | PushOptions = {}): number {
  const o: PushOptions = typeof opts === "number" ? { now: opts } : opts;
  const now = o.now ?? Date.now();
  const same = toasts.find((t) => (o.group !== undefined ? t.group === o.group : t.group === undefined && t.text === text));
  if (same) {
    const again: Shown = { ...same, text, count: same.count + 1, bump: same.bump + 1 };
    toasts = toasts.map((t) => (t.id === same.id ? again : t));
    log = log.map((n) => (n.id === same.id ? { ...n, text, count: again.count, at: now, read: false } : n));
    emit();
    return same.id;
  }
  const t: Shown = { id: next++, text, tone, count: 1, bump: 0, important: o.important ?? tone === "warn", group: o.group };
  toasts = [...toasts, t].slice(-MAX);
  log = [{ ...t, at: now, read: false }, ...log].slice(0, LOG_MAX);
  emit();
  return t.id;
}

/** How many notices float over the field (the player's choice, kept per browser): all of them, the important ones, or none. */
export type NoticeLevel = "all" | "important" | "bell";
export const NOTICE_LEVELS: readonly NoticeLevel[] = ["all", "important", "bell"];
export const NOTICE_LEVEL_LABEL: Record<NoticeLevel, string> = { all: "All", important: "Important only", bell: "Bell only" };
export const NOTICE_LEVEL_KEY = "jevants.notices";

/** A stored value as a level: anything but important or bell is all. */
export function parseNoticeLevel(raw: string | null | undefined): NoticeLevel {
  return raw === "important" || raw === "bell" ? raw : "all";
}

/** Whether a toast shows on the field at this level. The rest are still in the log, and still announced to a screen reader. */
export function showsAt(level: NoticeLevel, t: { important: boolean }): boolean {
  return level === "all" || (level === "important" && t.important);
}

let level: NoticeLevel | null = null;

export function noticeLevel(): NoticeLevel {
  if (level === null)
    try {
      level = parseNoticeLevel(localStorage.getItem(NOTICE_LEVEL_KEY));
    } catch {
      level = "all";
    }
  return level;
}

export function setNoticeLevel(next: NoticeLevel): void {
  level = next;
  try {
    if (next === "all") localStorage.removeItem(NOTICE_LEVEL_KEY);
    else localStorage.setItem(NOTICE_LEVEL_KEY, next);
  } catch {
    // no storage: it holds for this page only
  }
  emit();
}

export function useNoticeLevel(): NoticeLevel {
  return useSyncExternalStore(subscribeToasts, noticeLevel, () => "all");
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
