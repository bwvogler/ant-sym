import { readFileSync, writeFileSync } from "node:fs";
import type { ChunkLayer } from "../chunks.ts";
import { PLANE } from "../colony.ts";
import { MUTATION, pathTo } from "../evolution.ts";
import { STRAINS } from "../fungus.ts";
import { Game, GAME_REGROW, gameRng } from "../game.ts";
import { generateOneWorld } from "../oneWorld.ts";
import { mulberry32 } from "../world.ts";

// Golden masters, shared by tests/golden/*.test.ts (fast) and tests/slow/golden.test.ts: seeded one-world games (the
// top-down and side-view scenarios moved onto one world in S2.3a, ja-fnd.3.3.1), checked every 10 s for the colonies'
// counts and bit-exact hashes of every ant, each colony's pheromone fields and food on both layers. A refactor that should not change behaviour
// must keep them. A change meant to alter behaviour re-records them (GOLDEN_WRITE=1), says so in
// its PR, and re-runs the assays (npm run exp).

export interface Scenario {
  name: string;
  /** the full-size world played as the page plays it (regrowth, no auto-founding, hyphae, the page's random stream: `gameRng`); otherwise a small plane of 160 × 100 on Game's defaults */
  full?: boolean;
  seed: number;
  ants: number;
  seconds: number;
  /** alarm painted by the player's fungus brush at these times (s), on the plane at nest 0's hole */
  alarmAt?: number[];
  /**
   * One world only: the fungus landed at colony 0's hole, as the page's game plays it (full-size world, rival, regrowth, evolving,
   * hyphae on) and as scripts/lab/progression.mjs measures it, but on the fungus's local rule (no Jev answers bound, so a precache
   * re-ship can't move it). `grant` upgrades are given at landing; the rest are bought in UPGRADE_ORDER as soon as affordable.
   */
  landed?: { strain: string; grant?: string[] };
}

/** scripts/lab/progression.mjs's default buy order (the order a player who buys as soon as they can might keep). */
const UPGRADE_ORDER =
  "mycelium,infectivity,persistence,infectivity,fruiting,recognition,trails,stealth,senses,mycelium,persistence,evasion,infectivity,recognition,trails,royal,fruiting,evasion,royal,stealth".split(
    ",",
  );

/** FNV-1a over the raw bytes of typed arrays: equal only if every value is bit-identical. */
function fnv(arrays: ArrayBufferView[]): string {
  let h = 0x811c9dc5;
  for (const a of arrays)
    for (const b of new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) {
      h ^= b;
      h = Math.imul(h, 0x01000193);
    }
  return (h >>> 0).toString(16);
}

/**
 * Every chunk of a chunked field that holds something, with where it is, in (cy, cx) order. A chunk bit-identical to the
 * layer's empty fill reads the same as no chunk, so it is left out: whether a layer keeps or drops a chunk that holds
 * nothing (endless-world §7, ja-qpv.1), and how its table is laid out, is storage, not behaviour.
 */
function chunked(layer: ChunkLayer<Float32Array>): ArrayBufferView[] {
  const blank = new Float32Array(1).fill(layer.empty);
  const bits = new Uint32Array(blank.buffer)[0]!;
  const chunks: [number, number, Float32Array][] = [];
  layer.forEach((cx, cy, a) => {
    const words = new Uint32Array(a.buffer, a.byteOffset, a.length);
    if (!words.every((w) => w === bits)) chunks.push([cx, cy, a]);
  });
  chunks.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return chunks.flatMap(([cx, cy, a]) => [new Int32Array([cx, cy]), a]);
}

/** One world's sample: per layer ([plane, curtain]) the food and each colony's fields, each ant's layer in its hash, and the crossings. */
export type OneSample = {
  t: number;
  food: string[];
  colonies: {
    stored: number;
    births: number;
    losses: number;
    decisions: number;
    population: number;
    ants: string;
    fields: string[];
    crossedUp: number;
    crossedDown: number;
  }[];
  /** with `landed`: the fungus's whole saved state but its params (spores on every layer, hosts, evolution, hyphae, corpses), and each colony's infected */
  fungus?: { state: Record<string, string>; infected: number[] };
};

const DT = 1 / 30;

/**
 * Run a scenario and sample it every 10 s: a small plane (160 × 100) with the curtain under its line, or the full-size world
 * (`full`), and alarm on the plane at nest 0's hole. With `landed`, the full-size world with the fungus landed (Scenario.landed)
 * and its state in each sample.
 */
export function record(s: Scenario): OneSample[] {
  const L = s.landed;
  const world = L || s.full ? generateOneWorld(s.seed) : generateOneWorld(s.seed, { plane: { size: { w: 160, h: 100 } } });
  const page = L || s.full; // the page's game: the full-size world, rival, regrowth, no auto-founding, hyphae, the page's random stream
  const game = page
    ? new Game(world, { regrow: GAME_REGROW, autoFound: false, fungus: { hyphae: true } }, gameRng(s.seed, 0), [
        { antCount: s.ants },
        { antCount: s.ants },
      ])
    : new Game(world, {}, mulberry32(s.seed * 7919), [{ antCount: s.ants }, { antCount: s.ants }]);
  const queue = [...UPGRADE_ORDER];
  if (L) {
    const strain = STRAINS.findIndex((x) => x.id === L.strain);
    if (strain < 0) throw new Error(`${s.name}: no strain ${L.strain}`);
    game.land(0, strain, { evolve: true });
    for (const id of L.grant ?? []) {
      const e = game.fungus.evolution!;
      if (e.cost(id) === null) throw new Error(`${s.name}: can't grant ${id}`);
      for (const x of pathTo(e.save().levels, id)) {
        e.growth += e.cost(x)! / MUTATION;
        if (!game.fungus.upgrade(x)) throw new Error(`${s.name}: grant ${x} not bought`);
      }
    }
  }
  const out: OneSample[] = [];
  const alarms = (s.alarmAt ?? []).map((t) => Math.round(t / DT));
  const spot = world.plane.nests[0]!;
  const every = Math.round(10 / DT);
  for (let k = 1; k <= Math.round(s.seconds / DT); k++) {
    if (alarms.includes(k)) game.colonies[0]!.paint("alarm", spot.x, spot.y, 4, 12, PLANE);
    game.tick(DT);
    const e = L && game.fungus.evolution;
    // The first upgrade in the order it can keep now, as progression.mjs buys: one it can't yet afford doesn't hold up a cheaper one.
    if (e)
      for (let j = 0; j < queue.length; j++) {
        if (e.cost(queue[j]!) === null) queue.splice(j--, 1);
        else if (game.fungus.upgrade(queue[j]!)) {
          queue.splice(j, 1);
          break;
        }
      }
    if (k % every === 0)
      out.push({
        t: Math.round(k * DT),
        food: game.layers.map((m) => fnv(chunked(m.food))),
        colonies: game.colonies.map((c) => ({
          stored: c.stored,
          births: c.births,
          losses: c.losses,
          decisions: c.decisions,
          population: c.population,
          ants: fnv([c.x, c.y, c.heading, c.mode, c.carrying, c.pellet, c.alive, c.layer]),
          fields: c.layers.map((L) => fnv(Object.values(L.ph.fields).flatMap(chunked))),
          crossedUp: c.crossedUp,
          crossedDown: c.crossedDown,
        })),
        ...(L && { fungus: fungusSample(game) }),
      });
  }
  return out;
}

/** The fungus's saved state but its params, hashed part by part (a change of a default param shows only if it changes what the fungus does), and each colony's infected. */
function fungusSample(game: Game): { state: Record<string, string>; infected: number[] } {
  const { params: _, ...state } = game.fungus.saveState();
  const text = new TextEncoder();
  return {
    state: Object.fromEntries(Object.entries(state).map(([k, v]) => [k, fnv([text.encode(JSON.stringify(v) ?? "")])])),
    infected: game.colonies.map((c) => game.fungus.census(c).infected),
  };
}

/** The recording for a fixture file. GOLDEN_WRITE=1 writes it afresh and then fails the run, so a stray variable can't pass silently. */
export function fixture(file: URL, scenarios: Scenario[]): Record<string, OneSample[]> {
  if (process.env.GOLDEN_WRITE) {
    writeFileSync(file, JSON.stringify(Object.fromEntries(scenarios.map((s) => [s.name, record(s)])), null, 1) + "\n");
    throw new Error(`GOLDEN_WRITE: re-recorded ${file.pathname}; run again without it to check`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, OneSample[]>;
}

/** Check a run against its recording: the same number of samples, each equal. */
export function check(
  s: Scenario,
  want: OneSample[] | undefined,
  got: OneSample[],
  deepEqual: (a: unknown, b: unknown, msg: string) => void,
  equal: (a: unknown, b: unknown, msg: string) => void,
): void {
  equal(!!want, true, `no recording for ${s.name}`);
  equal(got.length, want!.length, `${s.name}: ${got.length} samples, recording has ${want!.length}`);
  for (let k = 0; k < want!.length; k++) deepEqual(got[k], want![k], `${s.name}: first difference at t = ${want![k]!.t} s`);
}
