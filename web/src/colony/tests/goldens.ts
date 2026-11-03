import { readFileSync, writeFileSync } from "node:fs";
import { Game } from "../game.ts";
import { generateSideWorld, generateWorld, mulberry32, OPEN_WORLD } from "../world.ts";

// Golden masters, shared by tests/golden.test.ts (fast) and tests/slow/golden.test.ts: seeded
// games recorded on main before the behaviour MRs (response hooks), checked every 10 s for the
// colonies' counts and a bit-exact hash of every ant. A refactor that should not change behaviour
// must keep them. A change meant to alter behaviour re-records them (GOLDEN_WRITE=1), says so in
// its PR, and re-runs the assays (npm run exp).

export interface Scenario {
  name: string;
  view: "side" | "top";
  seed: number;
  ants: number;
  seconds: number;
  /** alarm painted by the player's fungus brush at these times (s): at the player's entrance in the side view (where its ants pass), at the map's centre top-down */
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

export type Sample = { t: number; colonies: { stored: number; births: number; losses: number; decisions: number; population: number; ants: string }[] };

const DT = 1 / 30;

/** Run a scenario the way the page builds its game, and sample it every 10 s. */
export function record(s: Scenario): Sample[] {
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
        colonies: game.colonies.map((c) => ({ stored: c.stored, births: c.births, losses: c.losses, decisions: c.decisions, population: c.population, ants: fnv([c.x, c.y, c.heading, c.mode, c.carrying, c.pellet, c.alive]) })),
      });
  }
  return out;
}

/** The recording for a fixture file. GOLDEN_WRITE=1 writes it afresh and then fails the run, so a stray variable can't pass silently. */
export function fixture(file: URL, scenarios: Scenario[]): Record<string, Sample[]> {
  if (process.env.GOLDEN_WRITE) {
    writeFileSync(file, JSON.stringify(Object.fromEntries(scenarios.map((s) => [s.name, record(s)])), null, 1) + "\n");
    throw new Error(`GOLDEN_WRITE: re-recorded ${file.pathname}; run again without it to check`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, Sample[]>;
}

/** Check a run against its recording: the same number of samples, each equal. */
export function check(s: Scenario, want: Sample[] | undefined, got: Sample[], deepEqual: (a: unknown, b: unknown, msg: string) => void, equal: (a: unknown, b: unknown, msg: string) => void): void {
  equal(!!want, true, `no recording for ${s.name}`);
  equal(got.length, want!.length, `${s.name}: ${got.length} samples, recording has ${want!.length}`);
  for (let k = 0; k < want!.length; k++) deepEqual(got[k], want![k], `${s.name}: first difference at t = ${want![k]!.t} s`);
}
