import { seg } from "./styles.ts";

// A joined group of buttons (ja-fnd.6.4.5, docs/refactor.md S5.4): the speed, the view, the trails drawn, the appearance, the sounds, the
// notices, the Codex's tabs, the pen's side and the rows of presets were nine hand-written copies of one thing. What it looks like is here,
// pure, so a Node test pins the class strings; Segmented.tsx binds it to elements.

/** The group's classes: the joined, rounded frame; the place adds its own (a text size, a margin, `shrink-0`). */
export function segRowClass(more = ""): string {
  return `flex overflow-hidden rounded-md border border-line${more ? ` ${more}` : ""}`;
}

/**
 * One button's classes by whether it is on. `fill`: the buttons share the group's width. `soft`: the lighter look (the pen's side), where
 * the one that is on takes the accent's tint and no solid fill. `more`: the place's own (a padding at a phone's width, a flex layout for an icon).
 */
export function segButtonClass(on: boolean, o: { fill?: boolean; soft?: boolean; more?: string } = {}): string {
  const look = o.soft ? `px-2 py-1 text-xs ${on ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised"}` : seg(on);
  return `${o.fill ? "flex-1 " : ""}${look}${o.more ? ` ${o.more}` : ""}`;
}
