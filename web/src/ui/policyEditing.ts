import { aimKey } from "./aimKey.ts";

// What the one editor for a policy's words does and looks like (ja-fnd.6.4.3), pure so `node --test` covers it; PolicyEditor.tsx binds it to
// elements. (A test cannot run a .tsx file: the elements themselves are the e2e's.)

import { seg } from "./styles.ts";

/** A preset: a name for words the game ships (the aims, the doctrines). */
export interface Preset {
  id: string;
  name: string;
  text: string;
}

/**
 * What a row of presets looks like: `segmented` is the Lab's joined buttons, `compact` the aim bar's smaller ones, `chips` the pen's separate
 * outlined buttons (which may end with extras of their own: her mother's words).
 */
export type PresetStyle = "segmented" | "compact" | "chips";

/** The row's classes (more of them from the place: a margin). */
export function presetRowClass(style: PresetStyle, more = ""): string {
  const base = {
    segmented: "flex overflow-hidden rounded-md border border-line text-sm",
    compact: "flex shrink-0 overflow-hidden rounded-md border border-line text-[13px]",
    chips: "flex flex-wrap gap-2",
  }[style];
  return `${base} ${more}`.trim();
}

/** One preset button's classes, by whether the words in the box are its. */
export function presetButtonClass(style: PresetStyle, on: boolean): string {
  if (style === "chips")
    return `rounded-md border px-2 py-1 text-xs ${on ? "border-accent text-accent" : "border-line text-fg-2 hover:bg-raised"}`;
  return `${seg(on)}${style === "compact" ? " px-2.5 py-1" : ""}`;
}

/** The classes every words box shares; a place adds its size and spacing. */
const BOX = "resize-none rounded-md border border-line bg-paper text-fg outline-none focus:border-accent disabled:opacity-60";

/** The box's classes: the shared ones, the place's own, and a growing box's hidden overflow while it is one line. */
export const wordsBoxClass = (more: string, grow: boolean, open: boolean): string =>
  `${BOX} ${more} ${grow && !open ? "overflow-hidden" : ""}`.trim();

/** A growing box (the aim bar's): one line until it has focus, then four, wrapping only then. */
export const growShape = (open: boolean): { rows: number; wrap: "soft" | "off" } =>
  open ? { rows: 4, wrap: "soft" } : { rows: 1, wrap: "off" };

/** What the box's events do (pure, so `node --test` covers them): each takes only what it reads of the event. */
export interface WordsRules {
  /** the words as typed (a draft: not settled) */
  onDraft: (text: string) => void;
  /** the words settled, when the box loses focus */
  onCommit?: (text: string) => void;
  /** Enter (not Shift+Enter, not confirming an input method) or Escape leaves the box, which commits (PRD §69.2: the aim) */
  enterCommits?: boolean;
}

export function wordsRules({ onDraft, onCommit, enterCommits = false }: WordsRules) {
  return {
    change: (e: { target: { value: string } }): void => onDraft(e.target.value),
    blur: (e: { target: { value: string } }): void => onCommit?.(e.target.value),
    key: (e: {
      key: string;
      shiftKey: boolean;
      nativeEvent: { isComposing: boolean };
      preventDefault(): void;
      currentTarget: { blur(): void };
    }): void => {
      if (enterCommits && aimKey(e.key, e.shiftKey, e.nativeEvent.isComposing) === "done") {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
  };
}
