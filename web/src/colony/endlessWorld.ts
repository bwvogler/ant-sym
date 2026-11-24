// The endless world as a OneWorld (docs/endless-world.md §4-§5, PRD §66 E6.0.3, `ja-qpv.9`), pure: the endless plane (endlessMap.ts), its two start nests
// from the plane's own placement, and the line through them dug as the bounded one-world code digs it. No wild site is in the world to begin with: a
// Game over it lists the sites near what is awake (Game.feedSites) and wakes them by the fungus (Game.wakeSite).

import { generateEndlessPlane, type EndlessMap } from "./endlessMap.ts";
import type { EndlessOptions } from "./endlessPlane.ts";
import { oneWorldOnLines, type OneWorld } from "./oneWorld.ts";

/** A one world whose plane is an endless map. */
export interface EndlessWorld extends OneWorld {
  plane: EndlessMap;
}

/**
 * The endless world of `seed`: the plane's two start nests on one line (as `generateOneWorld`'s), its curtain dug under it, the plane a map with no edge
 * that makes its chunks as they are read. A `Game` over it turns new lines on and keeps its wild sites fed (Game's constructor reads `plane.endless`).
 */
export function generateEndlessWorld(seed: number, opts: Partial<EndlessOptions> = {}): EndlessWorld {
  const plane = generateEndlessPlane(seed, opts);
  return oneWorldOnLines(seed, plane, [[0, 1]]) as EndlessWorld;
}
