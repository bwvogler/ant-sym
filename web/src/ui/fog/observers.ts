import { centreX, centreY, INFECTED, keyX, keyY, type Colony, type Fungus } from "../../colony/index.ts";

// Who sees, for the fog of war (docs/fog-of-war.md §4.1, PRD §89, ja-1ypq.1): the fungus's hosts, through their antennae, and the
// fungus's living body. A picture only: the simulation never reads it. An observer is a point, a layer and a reach; a later organism
// (ja-1ypq.8) adds a source here with the reach from its own sense table.

/** How far the fungus's living body sees round each of its cells (design: the order of contact plus short-range chemistry; owner, 2026-11-23). */
export const BODY_SIGHT = 2;
/** Sim seconds between two stamps of the body: it grows on the hyphae's clock (a tip step every 1-2 s), so every step would be wasted. */
export const BODY_EVERY = 1;

/** Where an observer's sight goes: layer `l`, world point (x, y), reach `r` in cells. */
export type Sight = (l: number, x: number, y: number, r: number) => void;

/** The hosts the player sees through: living ants of its strain with a load at or past INFECTED, at their sensors' reach plus `margin`. */
export function hostSight(colonies: readonly Colony[], strain: number, margin: number, see: Sight): void {
  for (const c of colonies) {
    const r = c.params.sensorDistance + margin;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || c.load[i] < INFECTED) continue;
      // The lab and the tests have no evolving fungus: every strain is then the player's.
      if (strain >= 0 && c.strain[i] !== strain) continue;
      see(c.layer[i] ?? 0, c.x[i], c.y[i], r);
    }
  }
}

/** The fungus's living body: every hypha cell and every cell of its patch (landing, flowers) on each of `layers` maps. Spores and corpses see nothing. */
export function bodySight(fungus: Fungus, layers: number, see: Sight): void {
  for (let l = 0; l < layers; l++) {
    const patch = fungus.patchOn(l);
    for (let i = 0; i < patch.length; i += 2) see(l, centreX(patch[i], patch[i + 1]), centreY(patch[i + 1]), BODY_SIGHT);
    const h = fungus.hyphaeOn(l);
    if (!h) continue;
    for (const key of h.parent.keys()) {
      const gx = keyX(key);
      const gy = keyY(key);
      see(l, centreX(gx, gy), centreY(gy), BODY_SIGHT);
    }
  }
}
