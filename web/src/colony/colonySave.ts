// A colony's save (docs/refactor.md S3.3, ja-fnd.4.12): its public fields, the private state COLONY_STATE lists, each other layer's own state, and back. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `c`; saveState and loadState stay the colony's methods and call these.

import type { Colony, Layer } from "./colony.ts";
import { encode as encodeSave, fillLike, loadFields, saveFields } from "./save.ts";

/**
 * The Layer keys that carry state from tick to tick, which a save keeps for every layer but the bound one (whose values
 * are the colony's own fields, saved with them): its scent, the holes it sees and its cached way out. Every other key
 * is built again: the map, nest and entrance by the constructor and the world, the rest wired by the game (Game.wire,
 * aimAt). tests/save.test.ts holds every key to one list or the other.
 *
 * On today's plane only `ph` changes: it has no entrance, so `seeHoles` leaves its `holes` empty and its way out
 * (`outDist` … `outAt`) is never worked out. Those are saved for completeness, and no test reaches them (#63's review, N3).
 */
export const LAYER_STATE = ["ph", "holes", "outDist", "outCells", "outVersion", "outAt"] as const satisfies readonly (keyof Layer)[];

/** The colony's own state that is not a public field or an ants.ts array, saved by name in `private` (a field added to the colony that carries state between ticks is listed here, or in COLONY_SKIP when it is code or rebuilt on load; tests/soak/save.test.ts holds that). */
export const COLONY_STATE = [
  "cur",
  "ti",
  "alarmAnt",
  "alarmSmelt",
  "oddsNow",
  "t",
  "outDist",
  "outCells",
  "outVersion",
  "outAt",
  "layT",
  "inJaws",
  "belief",
  "entrance",
  "entranceCol",
  "entranceRow",
  "holes",
  "heaped",
  "goalX",
  "goalY",
  "holeX",
  "storedSeen",
  "returning",
  "returned",
  "holeIn",
  "holeSeen",
  "s",
  "chamberNest",
  "goalCells",
  "want",
  "enRouteTo",
  "portViewAt",
] as const;

/** Colony fields a save leaves out: what the game wires (the map, the nest, other colonies' scent and grids, raid aims: Game saves those as indices), the layers (the maps and scents again) and the policies. */
export const COLONY_SKIP: ReadonlySet<string> = new Set([
  ...COLONY_STATE,
  "plumeTurn", // smellsFood's answer, read in the same tick
  "policyDrew", // set and read within one ask (policyDraw)
  "policyDraw", // code: the draw handed to the mode policy
  "rng",
  "own",
  "map",
  "nest",
  "layers",
  "home",
  "line",
  "holeCells",
  "policy",
  "stancePolicy",
  "responses",
  "onBury",
  "onDie",
  "enemies",
  "foreign",
  "friends",
  "nestmates",
  "raidTarget",
  "raidNest",
  "raidMarks",
  "others",
  "felt",
  "donors",
  "scentSum",
  "perceived",
]);

// ——— saving (save.ts, ja-lo8.6) ———

/**
 * This colony's state for a save: its public data (not the references the game wires: the map, other colonies'
 * scent, the grids, its policies; its own scent saves itself), and the state COLONY_STATE lists, by name in `private` (not its random stream: the game saves that,
 * shared by every colony). tests/soak/save.test.ts holds the lists to the colony's own properties.
 */
export function saveColony(c: Colony): Record<string, unknown> {
  return {
    fields: saveFields(c, COLONY_SKIP),
    // One world (U4b): each layer's own state but the bound one's (null: in `fields` and `private`), by LAYER_STATE.
    ...(c.layers.length > 1
      ? {
          layers: c.layers.map((L, l) => (l === c.cur ? null : Object.fromEntries(LAYER_STATE.map((k) => [k, encodeSave(L[k])])))),
        }
      : {}),
    private: encodeSave(Object.fromEntries(COLONY_STATE.map((k) => [k, (c as unknown as Record<string, unknown>)[k]]))),
  };
}

/** A saved state back into this colony (saveState), in place where it can be: a fresh colony of the same world and params. */
export function loadColony(c: Colony, saved: Record<string, unknown>): void {
  const r = saved.private as Record<string, unknown>;
  // `fields` and the private fields hold the bound layer's scent, map state and way out: the same layer must be bound
  // here (between ticks it is home, so this only fails for another game's colony).
  if ("cur" in r && r.cur !== c.cur) throw new Error(`save: a colony saved with layer ${String(r.cur)} bound, here ${c.cur}`);
  loadFields(c, saved.fields as Record<string, unknown>);
  for (const k of COLONY_STATE) {
    if (k === "cur" || !(k in r)) continue;
    const own = c as unknown as Record<string, unknown>;
    own[k] = fillLike(own[k], r[k]);
  }
  // Every other layer's own state (one world), in place through its view: its slots, since it is not bound.
  const layers = saved.layers as (Record<string, unknown> | null)[] | undefined;
  if (layers) {
    if (layers.length !== c.layers.length) throw new Error(`save: a colony saved on ${layers.length} layers, here ${c.layers.length}`);
    layers.forEach((x, l) => {
      if (!x) return;
      const L = c.layers[l] as unknown as Record<string, unknown>;
      // In place where it can be (the scent loads itself; its view has no setter for it), else through the view's setter.
      for (const k of LAYER_STATE)
        if (k in x) {
          const v = fillLike(L[k], x[k]);
          if (v !== L[k]) L[k] = v;
        }
    });
  }
}
