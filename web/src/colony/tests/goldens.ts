import { readFileSync, writeFileSync } from "node:fs";
import type { ChunkLayer } from "../chunks.ts";
import { PLANE } from "../colony.ts";
import { Game } from "../game.ts";
import { generateOneWorld } from "../oneWorld.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN_WORLD } from "../world.ts";

// Golden masters, shared by tests/golden/golden.test.ts (fast) and tests/slow/golden.test.ts: seeded
// games recorded on main before the behaviour MRs (response hooks), checked every 10 s for the
// colonies' counts and bit-exact hashes of every ant, each colony's pheromone fields and the map's food. A refactor that should not change behaviour
// must keep them. A change meant to alter behaviour re-records them (GOLDEN_WRITE=1), says so in
// its PR, and re-runs the assays (npm run exp).

export interface Scenario {
  name: string;
  /** "one": one world (docs/one-world.md), its plane 160 × 100, recorded by its own branch of `record` */
  view: "side" | "top" | "one";
  seed: number;
  ants: number;
  seconds: number;
  /** alarm painted by the player's fungus brush at these times (s): at the player's entrance in the side view (where its ants pass), at the map's centre top-down, on the plane at nest 0's hole in one world */
  alarmAt?: number[];
}

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

export type Sample = {
  t: number;
  food: string;
  colonies: { stored: number; births: number; losses: number; decisions: number; population: number; ants: string; fields: string }[];
};

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
};

const DT = 1 / 30;

/** Run a scenario the way the page builds its game, and sample it every 10 s. */
export function record(s: Scenario): Sample[] | OneSample[] {
  if (s.view === "one") return recordOne(s);
  const map = s.view === "side" ? generateSideWorld(s.seed) : generateWorld(s.seed, { ...OPEN_WORLD, size: { w: 160, h: 100 } });
  const game = new Game(map, { antCount: s.ants, rivalAnts: s.ants }, mulberry32(s.seed * 7919));
  const out: Sample[] = [];
  const alarms = (s.alarmAt ?? []).map((t) => Math.round(t / DT));
  const spot = map.nests[0]?.entrance ?? { x: map.size.w / 2, y: map.size.h / 2 };
  const every = Math.round(10 / DT);
  for (let k = 1; k <= Math.round(s.seconds / DT); k++) {
    if (alarms.includes(k)) game.player.paint("alarm", spot.x, spot.y, 4, 12);
    game.tick(DT);
    if (k % every === 0)
      out.push({
        t: Math.round(k * DT),
        food: fnv(chunked(map.food)),
        colonies: game.colonies.map((c) => ({
          stored: c.stored,
          births: c.births,
          losses: c.losses,
          decisions: c.decisions,
          population: c.population,
          ants: fnv([c.x, c.y, c.heading, c.mode, c.carrying, c.pellet, c.alive]),
          fields: fnv(Object.values(c.ph.fields).flatMap(chunked)),
        })),
      });
  }
  return out;
}

/** record's one-world branch: a small plane (160 × 100) with the curtain under its line, and alarm on the plane at nest 0's hole. */
function recordOne(s: Scenario): OneSample[] {
  const world = generateOneWorld(s.seed, { plane: { size: { w: 160, h: 100 } } });
  const game = new Game(world, { antCount: s.ants, rivalAnts: s.ants }, mulberry32(s.seed * 7919));
  const out: OneSample[] = [];
  const alarms = (s.alarmAt ?? []).map((t) => Math.round(t / DT));
  const spot = world.plane.nests[0]!;
  const every = Math.round(10 / DT);
  for (let k = 1; k <= Math.round(s.seconds / DT); k++) {
    if (alarms.includes(k)) game.player.paint("alarm", spot.x, spot.y, 4, 12, PLANE);
    game.tick(DT);
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
      });
  }
  return out;
}

/** The recording for a fixture file. GOLDEN_WRITE=1 writes it afresh and then fails the run, so a stray variable can't pass silently. */
export function fixture(file: URL, scenarios: Scenario[]): Record<string, Sample[] | OneSample[]> {
  if (process.env.GOLDEN_WRITE) {
    writeFileSync(file, JSON.stringify(Object.fromEntries(scenarios.map((s) => [s.name, record(s)])), null, 1) + "\n");
    throw new Error(`GOLDEN_WRITE: re-recorded ${file.pathname}; run again without it to check`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, Sample[] | OneSample[]>;
}

/** Check a run against its recording: the same number of samples, each equal. */
export function check(
  s: Scenario,
  want: Sample[] | OneSample[] | undefined,
  got: Sample[] | OneSample[],
  deepEqual: (a: unknown, b: unknown, msg: string) => void,
  equal: (a: unknown, b: unknown, msg: string) => void,
): void {
  equal(!!want, true, `no recording for ${s.name}`);
  equal(got.length, want!.length, `${s.name}: ${got.length} samples, recording has ${want!.length}`);
  for (let k = 0; k < want!.length; k++) deepEqual(got[k], want![k], `${s.name}: first difference at t = ${want![k]!.t} s`);
}
