import { useEffect } from "react";
import { useLatest } from "./useLatest.ts";

// One Escape manager (ja-fnd.6.4, docs/refactor.md S5.4). Escape closes one thing: the palette or the shortcuts sheet, then a pinned lens
// card, then the Go to menu (and the notices list), then the followed ant, then a tooltip, the Codex, the Lab or a drawer, then the builder
// (PRD §69). Each surface that takes Escape used to listen for itself and decide whether it was first by asking the page: a `[aria-modal]` in
// the document, a `[role=tooltip]`, `defaultPrevented`. A surface now registers a claim on a layer while it is open, and a listener here gives
// the key to the highest layer that takes it, so no surface looks at the DOM to know whether another is above it.
//
// There are two stacks, either side of the map. `above` is a capture listener: it comes before the field's own handler (which drops a follow on
// an Escape nobody took, keyboard.ts) and before every element's, and a claim that takes the key stops it there. `below` is a bubble listener
// on the window: the field has had its turn, and so has a control with focus (a chart's crosshair, the aim box), which settle the event
// themselves (`defaultPrevented` is the one rule between a handler and the stack).

/** Where a claim sits, in its stack: a higher layer is asked first. */
export const ESCAPE_LAYER = {
  /** above the field: a dialog over the whole page (the palette, the shortcuts sheet) */
  modal: 100,
  /** above the field: a pinned lens card */
  card: 80,
  /** above the field: a menu or a list over the field (the Go to menu, the notices) */
  popover: 60,
  /** below the field: a tooltip */
  tooltip: 90,
  /** below the field: the Codex */
  codex: 70,
  /** below the field: the Lab (only for a key pressed with focus in it) */
  lab: 60,
  /** below the field: a drawer beside the map */
  drawer: 50,
  /** below the field: the builder */
  builder: 40,
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

/** Which side of the field a claim is on: `above` comes before the field's own Escape (capture), `below` after it (bubble). */
export type EscapePhase = "above" | "below";

/** The page's two stacks. */
export const escapes: Record<EscapePhase, EscapeStack> = { above: new EscapeStack(), below: new EscapeStack() };

/** Listen on `target` for the stack: in the capture phase (before the field's and every element's handler) or the bubble phase (after them). */
export function attachEscape(
  stack: EscapeStack,
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  capture = true,
): () => void {
  const key = (e: KeyboardEvent) => void stack.handle(e);
  target.addEventListener("keydown", key, capture);
  return () => target.removeEventListener("keydown", key, capture);
}

const detach: Record<EscapePhase, (() => void) | null> = { above: null, below: null };
/** Claim Escape on `layer` of a stack (above the field by default) while `active`. The claim may change between renders: the latest is the one asked. */
export function useEscape(layer: number, claim: EscapeClaim, active = true, phase: EscapePhase = "above"): void {
  const latest = useLatest(claim);
  useEffect(() => {
    if (!active) return;
    const stack = escapes[phase];
    detach[phase] ??= attachEscape(stack, window, phase === "above");
    const off = stack.register(layer, (e) => latest.current(e));
    return () => {
      off();
      if (stack.size === 0) {
        detach[phase]?.();
        detach[phase] = null;
      }
    };
  }, [layer, active, phase, latest]);
}
