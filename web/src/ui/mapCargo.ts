import type { Colony } from "../colony/index.ts";

/** The held item's recorded stage follows its living carrier on the viewed layer. No floor copies. */
export function carriedBroodOn(col: Pick<Colony, "brood" | "alive" | "layer" | "item">, layer: number): { i: number; stage: 0 | 1 | 2 }[] {
  const out: { i: number; stage: 0 | 1 | 2 }[] = [];
  for (const b of col.brood.items) {
    const i = b.held;
    if (i < 0 || !col.alive[i] || (layer >= 0 && col.layer[i] !== layer) || col.item(i) !== "brood") continue;
    out.push({ i, stage: b.stage });
  }
  return out;
}
