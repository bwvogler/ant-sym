// The per-ant step record (docs/refactor.md S3.4): tick's stages (perceive, stance, decide, steer, move and dig, arrive) pass what one
// computed for the ant to the next through it. One record per tick, reused for every ant: each stage reads what an earlier stage wrote for this ant (a per-ant field is
// written before it is read: tick's stages were checked with every per-ant field poisoned between ants, ja-fnd.4.4.8), or
// what tick set for the whole tick or layer (no stage writes those: ui/tests/stageWrites.test.ts). Fields are initialised only so V8 keeps the numbers unboxed (review of #147); ui/tests/stageOrder.test.ts
// holds the order.

import type { ColonyParams } from "./params.ts";
import { CROWD_HALF, FOES_HALF, MET_HALF, THREAT_HALF } from "./tuning.ts";
import type { Item, Responses } from "./responses.ts";
import type { Pheromones } from "./pheromone.ts";
import type { Nest, WorldMap } from "./world.ts";

export class AntStep {
  ca = 0;
  sa = 0;
  h = 0;
  fl = 0;
  ff = 0;
  fr = 0;
  hl = 0;
  hf = 0;
  hr = 0;
  al = 0;
  af = 0;
  ar = 0;
  toEnemy: number | null = null;
  p!: ColonyParams;
  rng!: () => number;
  dt = 0;
  hold = false;
  rgate = false;
  foeLeak = 0;
  sgate = false;
  threatLeak = 0;
  heldNow = 0;
  held = false;
  carrying = false;
  pellet = false;
  nursing = false;
  outward = false;
  reporting = false;
  gate = false;
  goal!: Nest;
  nest!: Nest;
  x0 = 0;
  y0 = 0;
  mode = 0;
  prevMode = 0;
  item!: Item;
  resp!: Responses;
  waiting = false;
  rolled = false;
  fleeFrom: number | null = null;
  map!: WorldMap;
  ph!: Pheromones;
  home!: Nest;
  a = 0;
  digging = false;
  leak = false;
  metLeak = 0;
  crowdKeep = 0;
}

/** One layer's gates for a tick (Colony.tick): whether it gates leaving, raids by trail and each ant's own stance, and their leaks. */
export interface Gates {
  gate: boolean;
  /** one world's curtain (ja-web): outgoing foragers are held at the top of their own shaft (the gate) and asked `leave` there */
  hold: boolean;
  /** whether `met` leaks on this layer: where the colony gates leaving (one world: on both layers, so it fades on a trip out too) */
  leak: boolean;
  metLeak: number;
  rgate: boolean;
  foeLeak: number;
  sgate: boolean;
  threatLeak: number;
  crowdKeep: number;
}

/**
 * A layer's gates for a tick of dt, open ground's only (`open`: no hole into the layer). Activation (behaviour MR 5):
 * `met` leaks over MET_HALF. Raids by trail (behaviour MR 5.2): a finder's count of strangers met leaks like `met`. Each
 * ant's own stance (docs/stance.md): its threat leaks like `foes`; a waiting ant feels its home's crowd over CROWD_HALF.
 * One world (`one`, ja-web): nobody waits on the plane, where every returner goes down its hole; activation is the
 * curtain's, at the top of each shaft (`hold`), where the waiting ant feels its crowd too. Raids by trail and each ant's
 * own stance stay the plane's.
 */
export function gatesFor(p: ColonyParams, open: boolean, one: boolean, dt: number): Gates {
  const gate = p.leaveGate > 0 && open && !one;
  const hold = p.leaveGate > 0 && one && !open;
  const leak = p.leaveGate > 0 && (open || one);
  const rgate = p.raidGate > 0 && open;
  const sgate = p.stanceGate > 0 && open;
  return {
    gate,
    hold,
    leak,
    metLeak: leak ? Math.exp((-dt * Math.LN2) / MET_HALF) : 1,
    rgate,
    foeLeak: rgate ? Math.exp((-dt * Math.LN2) / FOES_HALF) : 1,
    sgate,
    threatLeak: sgate ? Math.exp((-dt * Math.LN2) / THREAT_HALF) : 1,
    crowdKeep: sgate || hold ? Math.exp((-dt * Math.LN2) / CROWD_HALF) : 1,
  };
}
