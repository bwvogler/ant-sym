// The per-ant step record (docs/refactor.md S3.4): tick's stages (perceive, stance, decide, steer, move and dig, arrive) pass what one
// computed for the ant to the next through it. One record per tick, reused for every ant: each stage reads what an earlier stage wrote for this ant (a per-ant field is
// written before it is read: tick's stages were checked with every per-ant field poisoned between ants, ja-fnd.4.4.8), or
// what tick set for the whole tick or layer (no stage writes those: ui/tests/stageWrites.test.ts). Fields are initialised only so V8 keeps the numbers unboxed (review of #147); ui/tests/stageOrder.test.ts
// holds the order.

import type { ColonyParams } from "./params.ts";
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
