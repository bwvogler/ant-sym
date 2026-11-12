// Where a tooltip goes: below its anchor, flipped above when there is no room, and kept inside the window.
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placement {
  left: number;
  top: number;
  /** the tooltip sits above its anchor */
  above: boolean;
}

/** Margin kept to the window's edges, and the gap to the anchor (px). */
export const EDGE = 8;
export const GAP = 6;

export function place(anchor: Box, tip: { width: number; height: number }, view: { width: number; height: number }): Placement {
  const below = anchor.bottom + GAP;
  const fitsBelow = below + tip.height + EDGE <= view.height;
  const fitsAbove = anchor.top - GAP - tip.height >= EDGE;
  const above = !fitsBelow && fitsAbove;
  const rawTop = above ? anchor.top - GAP - tip.height : below;
  const top = Math.max(EDGE, Math.min(rawTop, view.height - EDGE - tip.height));
  const left = Math.max(EDGE, Math.min(anchor.left, view.width - EDGE - tip.width));
  return { left, top, above };
}
