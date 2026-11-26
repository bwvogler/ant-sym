import { AIMS, DOCTRINES, GENERIC_ANT, INFECTED, PLANE, SPECIES } from "../colony/index.ts";
import { ColonyJev } from "../ui/colonyJev.ts";
import { FixedStepClock, MAX_STEP } from "../ui/fixedStepClock.ts";
import { DEFAULT_ANTS } from "../ui/playbackOptions.ts";
import { loadPrecache } from "../ui/precache.ts";
import { buildGame, GAME_SPEED, GAME_STRAIN, landingOf } from "../ui/useColony.ts";

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

export class TrialClock extends FixedStepClock {
  constructor() {
    super(GAME_SPEED);
  }
}

export const trialSettings = (seed: number, antCount = DEFAULT_ANTS) => ({
  species: GENERIC_ANT.id,
  seed,
  antCount,
  rival: true,
  generation: 0,
  world: "endless" as const,
});

/** Two equally sized colonies with the same bundled policy path in both modes. */
export async function buildTrialGame(seed = 1, antCount = DEFAULT_ANTS) {
  const game = buildGame(trialSettings(seed, antCount));
  const jev = new ColonyJev();
  jev.setDoctrine(DOCTRINES[0]!.text);
  jev.setAim(AIMS[0]!.text);
  await loadPrecache((context, entries, species) => {
    const ant = species === undefined ? GENERIC_ANT : SPECIES[species];
    return ant ? jev.seed(context, entries, ant) : 0;
  });
  jev.attachColonies(game.colonies, game.params.species, true);
  jev.attachFungus(game.fungus);
  game.land(landingOf(game), GAME_STRAIN, { evolve: true });
  return game;
}

export async function buildTrial() {
  const game = await buildTrialGame();
  const landing = landingOf(game);
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
