import { CURTAIN, PLANE, type Game } from "../colony/game.ts";

// A rehearsal (the e2e guard's: scripts/e2e-one-world.mjs, through the dev hook): which curtain ant comes up through a
// hole next, found on a copy of the game, never on the game itself. A save reloads bit-exact (U4b), so a copy built from
// the same world, loaded from the game's save and driven by the same policies, ticked with a fixed step, plays what the
// game will play ticked with that same step. The page's own loop is not fixed-step (each frame's step is its wall time
// times the speed, cut into steps of at most 1/30 s), so the guard pauses the page and steps the game itself (`step`).

/** The fixed step a rehearsal and the steps that follow it take: the page loop's longest (MAX_STEP). */
export const REHEARSE_DT = 1 / 30;

/** An ant that comes up: colony k, slot i at generation gen, on the `ticks`-th fixed step from now. */
export interface Crossing {
  k: number;
  i: number;
  gen: number;
  ticks: number;
}

/**
 * The game's copy: `fresh` (a new game of the same world and settings) loaded from its save, its colonies and fungus
 * driven by the game's own policies (Jev's cached answers on the page: a function, not saved).
 */
export function copyOf(game: Game, fresh: Game): Game {
  fresh.load(structuredClone(game.save()));
  game.colonies.forEach((c, k) => {
    const d = fresh.colonies[k];
    if (!d) throw new Error(`copyOf: the copy has no colony ${k}`);
    d.policy = c.policy;
    d.stancePolicy = c.stancePolicy;
    d.responses = c.responses;
  });
  fresh.fungus.policy = game.fungus.policy;
  return fresh;
}

/**
 * The first curtain ant to come up through a hole within `maxSeconds` of fixed steps, after `minTicks` steps below at the
 * least (so `minTicks` steps before, it is in the curtain to be followed), rehearsed on a copy (copyOf); null if none
 * does, or a queen flies first (the page would stop for her). The game is not touched. Cost: a save, a load and up to
 * maxSeconds / dt ticks of the copy.
 */
export function nextCrossing(game: Game, fresh: Game, maxSeconds: number, minTicks = 1, dt = REHEARSE_DT): Crossing | null {
  const copy = copyOf(game, fresh);
  const was = copy.colonies.map((c) => Uint8Array.from(c.layer));
  const gens = copy.colonies.map((c) => Uint32Array.from(c.gen));
  /** the step since which each ant has been below (0: from the start) */
  const since = copy.colonies.map((c) => new Int32Array(c.layer.length));
  const n = Math.round(maxSeconds / dt);
  for (let t = 1; t <= n; t++) {
    copy.tick(dt);
    if (copy.flights.length) return null;
    for (let k = 0; k < copy.colonies.length && k < was.length; k++) {
      const c = copy.colonies[k]!;
      const before = was[k]!;
      for (let i = 0; i < before.length; i++) {
        if (!c.alive[i] || c.gen[i] !== gens[k]![i]) continue;
        if (before[i] === CURTAIN && c.layer[i] === PLANE && t - since[k]![i]! >= minTicks) return { k, i, gen: c.gen[i] as number, ticks: t };
        if (before[i] !== CURTAIN && c.layer[i] === CURTAIN) since[k]![i] = t;
        before[i] = c.layer[i] as number;
      }
    }
  }
  return null;
}
