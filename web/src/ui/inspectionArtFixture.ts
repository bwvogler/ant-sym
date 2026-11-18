import { buildGame } from "./useColony.ts";
import { SensedMap } from "./fungusSight.ts";
import { inspectPatch } from "./inspectionPatch.ts";
import { centreX, centreY, PLANE, CURTAIN } from "../colony/index.ts";
import type { DecayStage } from "./cadaverVisual.ts";
const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 });
/** Explicitly controlled art fixtures, never injected into a live game or presented as normal occupancy. */
export function cadaverArtFixture(below = false, stage: DecayStage = 0, stalkLevel = 2) {
  const p = inspectPatch(g, new SensedMap(), below ? CURTAIN : PLANE, centreX(50, 50), centreY(50), { food: false, home: false });
  for (const c of p.cells) {
    c.valid = true;
    c.surfaceStrip = false;
    const s = c.state;
    s.place.ground = "open";
    s.place.food = 0;
    s.place.hypha = false;
    s.place.hole = -1;
    s.place.chamber = null;
    s.place.spores = false;
    s.place.mound = 0;
    s.ants = [];
    s.queens = [];
    s.brood = [0, 0, 0];
    s.cadavers = [];
    s.fallen = 0;
    s.buried = 0;
    s.storedFoodMarks = 0;
    s.threads = [];
    s.knot = false;
    s.cord = false;
    s.stalk = false;
    s.stalkLevel = 0;
    s.colonised = false;
    s.fruit = false;
    s.sporulating = false;
    s.tips = [];
  }
  p.selected.cadavers = [{ stage, fungal: false }];
  p.selected.fallen = 1;
  if (stalkLevel && !below) {
    p.selected.stalk = true;
    p.selected.stalkLevel = stalkLevel;
    p.selected.colonised = true;
    p.selected.place.hypha = true;
  }
  const worker = p.cells[1].state;
  worker.ants = [{ k: 0, i: 0, gen: 1, x: 0, y: 0.15, heading: Math.PI * 0.3, carrying: false, quality: 1, infected: false, odour: 0.8 }];
  for (const i of [2, 3]) {
    const s = p.cells[i].state;
    s.cadavers = [{ stage: (i - 1) as DecayStage, fungal: false }];
    s.fallen = 1;
  }
  p.cells[4].state.place.ground = below ? "soil" : "rock";
  p.cells[5].state.place.ground = below ? "soil" : "rock";
  return p;
}
