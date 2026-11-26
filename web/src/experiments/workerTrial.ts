import { AIMS, DOCTRINES, GENERIC_ANT, INFECTED, PLANE, SPECIES } from "../colony/index.ts";
import { ColonyJev } from "../ui/colonyJev.ts";
import { MAX_STEP } from "../ui/gameLoop.ts";
import { loadPrecache } from "../ui/precache.ts";
import { buildGame, GAME_SPEED, GAME_STRAIN, landingOf } from "../ui/useColony.ts";

const STEP_MS = MAX_STEP * 1000;
const MAX_DEBT_MS = 8 * STEP_MS;
const SLICE_MS = 12;
export const SNAPSHOT_MS = 1000 / 30;
export const ANT_STRIDE = 5;

export type Position = { x: number; y: number; layer: number };
export type TrialCommand = { type: "play"; playing: boolean };
export interface TrialFrame {
  type: "frame";
  time: number;
  playing: boolean;
  ants: Float32Array<ArrayBuffer>;
  above: Position;
  below: Position;
}
export type TrialMessage = TrialFrame | { type: "error"; message: string };

/** Both trial modes use the same fixed steps, bounded backlog and work per turn. */
export class TrialClock {
  #last = 0;
  #debt = 0;

  reset(now: number): void {
    this.#last = now;
    this.#debt = 0;
  }

  pump(now: number, tick: () => void, readClock = () => performance.now()): number {
    this.#debt = Math.min(MAX_DEBT_MS, this.#debt + Math.max(0, now - this.#last) * GAME_SPEED);
    this.#last = now;
    while (this.#debt >= STEP_MS) {
      this.#debt -= STEP_MS;
      tick();
      if (readClock() - now >= SLICE_MS) break;
    }
    return Math.max(0, (STEP_MS - this.#debt) / GAME_SPEED - (readClock() - now));
  }
}

/** Seed 1, two 600-ant colonies, with the same bundled policy path in both modes. */
export async function buildTrial() {
  const game = buildGame({ species: GENERIC_ANT.id, seed: 1, antCount: 600, rival: true, generation: 0, world: "endless" });
  const jev = new ColonyJev();
  jev.setDoctrine(DOCTRINES[0]!.text);
  jev.setAim(AIMS[0]!.text);
  await loadPrecache((context, entries, species) => {
    const ant = species === undefined ? GENERIC_ANT : SPECIES[species];
    return ant ? jev.seed(context, entries, ant) : 0;
  });
  jev.attachColonies(game.colonies, game.params.species, true);
  jev.attachFungus(game.fungus);
  const landing = landingOf(game);
  game.land(landing, GAME_STRAIN, { evolve: true });
  const colony = game.colonies[landing]!;
  const above = { ...colony.layers[PLANE]!.nest, layer: PLANE };
  const below = { ...colony.nest, layer: colony.home };

  return {
    tick: () => game.tick(MAX_STEP),
    frame(playing: boolean): TrialFrame {
      const ants = new Float32Array(game.colonies.reduce((slots, c) => slots + c.n, 0) * ANT_STRIDE);
      let offset = 0;
      for (let k = 0; k < game.colonies.length; k++) {
        const c = game.colonies[k]!;
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i]) continue;
          ants[offset++] = c.x[i]!;
          ants[offset++] = c.y[i]!;
          ants[offset++] = c.layer[i]!;
          ants[offset++] = k;
          ants[offset++] = c.load[i]! >= INFECTED ? 1 : 0;
        }
      }
      return { type: "frame", time: game.time, playing, ants: ants.subarray(0, offset), above, below };
    },
  };
}
