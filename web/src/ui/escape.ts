import { useEffect, useRef } from "react";

// One Escape manager (ja-fnd.6.4.1, docs/refactor.md S5.4). Escape closes one thing: the palette or the shortcuts sheet, then a pinned lens
// card, then the Go to menu (and the notices list), then the followed ant, then a drawer (PRD §69). Each surface that takes Escape used to
// listen for itself and decide whether it was first by asking the page: a `[aria-modal]` in the document, a `[role=tooltip]`, `defaultPrevented`.
// A surface now registers a claim on a layer while it is open, and the one listener here gives the key to the highest layer that takes it, so
// no surface looks at the DOM to know whether another is above it.
//
// This is the group above the field, in the capture phase. A claim that takes the key stops it there, so the field (which drops a follow on an
// Escape nobody took, keyboard.ts) and the surfaces under it (a drawer, the Codex, the Lab, the builder: still the bubble phase, with
// `defaultPrevented` as their rule) never see it.

/** Where a claim sits: a higher layer is asked first. */
export const ESCAPE_LAYER = {
  /** a pinned lens card */
  card: 80,
  /** a menu or a list over the field (the Go to menu, the notices) */
  popover: 60,
  /** a dialog over the whole page (the palette, the shortcuts sheet) */
  modal: 100,
} as const;

/** Whether the claim took the key (true), or does not want it now (false: the next layer is asked). */
export type EscapeClaim = (e: KeyboardEvent) => boolean;

/** The part of a keydown the stack reads and settles. */
export interface EscapeEvent {
  key: string;
  defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export class EscapeStack {
  #claims: { layer: number; seq: number; claim: EscapeClaim }[] = [];
  #seq = 0;

  /** Claim Escape on `layer` until the returned function is called. On one layer the latest claim is asked first. */
  register(layer: number, claim: EscapeClaim): () => void {
    const entry = { layer, seq: this.#seq++, claim };
    this.#claims.push(entry);
    return () => {
      this.#claims = this.#claims.filter((c) => c !== entry);
    };
  }

  get size(): number {
    return this.#claims.length;
  }

  /**
   * Give an Escape to the highest claim that takes it, and settle the event so nothing else acts on it (not the field, not a surface under
   * this one). An event something already took is left alone. Returns whether a claim took it.
   */
  handle(e: EscapeEvent & { key: string }): boolean {
    if (e.key !== "Escape" || e.defaultPrevented) return false;
    const order = [...this.#claims].sort((a, b) => b.layer - a.layer || b.seq - a.seq);
    for (const { claim } of order) {
      if (claim(e as unknown as KeyboardEvent)) {
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
    }
    return false;
  }
}

/** The page's stack, and its one listener (on while anything is registered). */
export const escapes = new EscapeStack();

/** Listen on `target` for the stack while it has a claim: a capture listener, so it comes before the field's and every surface's own. */
export function attachEscape(stack: EscapeStack, target: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
  const key = (e: KeyboardEvent) => void stack.handle(e);
  target.addEventListener("keydown", key, true);
  return () => target.removeEventListener("keydown", key, true);
}

let detach: (() => void) | null = null;
/** Claim Escape on `layer` while `active`. The claim may change between renders: the latest is the one asked. */
export function useEscape(layer: number, claim: EscapeClaim, active = true): void {
  const latest = useRef(claim);
  latest.current = claim;
  useEffect(() => {
    if (!active) return;
    detach ??= attachEscape(escapes, window);
    const off = escapes.register(layer, (e) => latest.current(e));
    return () => {
      off();
      if (escapes.size === 0) {
        detach?.();
        detach = null;
      }
    };
  }, [layer, active]);
}
