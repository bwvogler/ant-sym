import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { Game } from "../game.ts";
import { generateWorld, mulberry32 } from "../world.ts";

// The golden runs: a few seeded games recorded on the code as it was before
// the experiment harness (Phase 0) and the response hooks (Phase 1), and
// checked against that record. A refactor that only moves rules into params
// or hooks must leave every number, and every ant's position bit for bit,
// unchanged: same rules, same rng calls in the same order.
//
// Re-record (only when a behaviour change is intended, and say so in the PR):
//   GOLDEN_WRITE=1 node --test web/src/colony/tests/golden.test.ts

const FIXTURE = new URL("./golden.json", import.meta.url);
const DT = 1 / 30;

interface Scenario {
  name: string;
  seed: number;
  size: { w: number; h: number };
  ants: number;
  rival: boolean;
  seconds: number;
  /** alarm painted by the player's fungus at these times, at the map's centre */
  alarmAt: number[];
}

const SCENARIOS: Scenario[] = [
  { name: "war, small map", seed: 3, size: { w: 160, h: 100 }, ants: 150, rival: true, seconds: 150, alarmAt: [] },
  { name: "solo with alarm", seed: 2, size: { w: 160, h: 100 }, ants: 200, rival: false, seconds: 90, alarmAt: [10, 30, 31, 60] },
  { name: "war, default map", seed: 1, size: { w: 512, h: 320 }, ants: 300, rival: true, seconds: 60, alarmAt: [20] },
];

/** FNV-1a over the raw bits of float arrays: equal only if every value is bit-identical. */
function bits(...arrays: Float32Array[]): string {
  let h = 0x811c9dc5;
  for (const a of arrays) {
    const u = new Uint32Array(a.buffer, a.byteOffset, a.length);
    for (const v of u) {
      h ^= v;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16);
}

type Sample = { t: number; colonies: { stored: number; births: number; losses: number; decisions: number; population: number; pos: string }[] };

function record(s: Scenario): Sample[] {
  const map = generateWorld(s.seed, { size: s.size });
  const game = new Game(map, { antCount: s.ants, rivalAnts: s.ants, rival: s.rival }, mulberry32(s.seed * 7919));
  const out: Sample[] = [];
  const steps = Math.round(s.seconds / DT);
  const alarms = s.alarmAt.map((t) => Math.round(t / DT));
  for (let k = 1; k <= steps; k++) {
    if (alarms.includes(k)) game.player.paint("alarm", map.size.w / 2, map.size.h / 2, 4, 12);
    game.tick(DT);
    if (k % Math.round(10 / DT) === 0)
      out.push({
        t: Math.round(k * DT),
        colonies: game.colonies.map((c) => ({ stored: c.stored, births: c.births, losses: c.losses, decisions: c.decisions, population: c.population, pos: bits(c.x, c.y, c.heading) })),
      });
  }
  return out;
}

if (process.env.GOLDEN_WRITE) {
  writeFileSync(FIXTURE, JSON.stringify(Object.fromEntries(SCENARIOS.map((s) => [s.name, record(s)])), null, 1) + "\n");
}

const golden = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, Sample[]>;

for (const s of SCENARIOS) {
  test(`golden: ${s.name} (seed ${s.seed}) matches the recorded run exactly`, () => {
    const want = golden[s.name];
    assert.ok(want, `no recording for ${s.name}`);
    const got = record(s);
    for (let k = 0; k < want.length; k++) assert.deepEqual(got[k], want[k], `${s.name}: first difference at t = ${want[k]!.t} s`);
  });
}
