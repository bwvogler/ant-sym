import { LIVE } from "../fog/knowledge.ts";
import type { FieldCtx } from "./ctx.ts";

/**
 * What the actors stage (ants, brood, the queen, alates, corpses) culls by: in view, and under the fog, only where an observer senses
 * the place now (docs/fog-of-war.md §5.1: ants are never remembered). Without the fog it is `inView` itself.
 */
export function actorCull(fc: FieldCtx, inView: (wx: number, wy: number) => boolean): (wx: number, wy: number) => boolean {
  const fog = fc.fog;
  if (!fog) return inView;
  return (wx, wy) => inView(wx, wy) && fog.stateAt(fc.lv, wx, wy) === LIVE;
}
