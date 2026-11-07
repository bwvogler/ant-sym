// Short notices over the field (ja-lo8.2): what changed that the player should know about, without a panel to read.
// One small store, like learn.ts, so anything can raise one.

export type ToastTone = "info" | "warn" | "good";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

/** How long a notice stays, in milliseconds. */
export const TOAST_MS = 7000;
/** At most this many at once: the oldest goes first. */
const MAX = 3;

let toasts: readonly Toast[] = [];
let next = 1;
const listeners = new Set<() => void>();

function set(t: readonly Toast[]): void {
  toasts = t;
  for (const fn of listeners) fn();
}

/** Raise a notice; the same text already showing is not raised twice. Returns its id. */
export function pushToast(text: string, tone: ToastTone = "info"): number {
  const same = toasts.find((t) => t.text === text);
  if (same) return same.id;
  const t = { id: next++, text, tone };
  set([...toasts, t].slice(-MAX));
  return t.id;
}

export function dismissToast(id: number): void {
  set(toasts.filter((t) => t.id !== id));
}

export const currentToasts = (): readonly Toast[] => toasts;

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
