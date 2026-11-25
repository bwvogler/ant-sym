import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELL,
  cellOf,
  centreX,
  centreY,
  CHUNK_BITS,
  Game,
  gameRng,
  generateEndlessWorld,
  INFECTED,
  PLANE,
  type Colony,
} from "../../colony/index.ts";
import { LIVE, REMEMBERED, UNKNOWN } from "../fog/knowledge.ts";
import { loadFog, saveFog, sensedFor } from "../fog/sources.ts";
import { SensedMap, SENSED_FADE } from "../fungusSight.ts";

// ja-0iuy (PRD §66): an endless plane is centred, so its rows run negative. A host at y < 0 senses what is round it; the rows under 0 are skipped only on
// a bounded map and on a curtain (whose rows start at 0).

const R_SEEN = 6;
/** Every cell (gx, gy) of layer `l` with sight in a box, as "gx,gy". */
function lit(s: SensedMap, l: number, y0: number, y1: number): Set<string> {
  const out = new Set<string>();
  for (let gy = y0; gy <= y1; gy++) for (let gx = -40; gx <= 160; gx++) if (s.sight(l, gx, gy) > 0) out.add(`${gx},${gy}`);
  return out;
}

test("an endless plane senses a disc at y < 0 just as it does at the mirror y > 0", () => {
  const s = new SensedMap();
  s.endless = true;
  s.mark(PLANE, 100, -50, R_SEEN);
  s.mark(PLANE, 100, 50, R_SEEN);
  const neg = lit(s, PLANE, -80, -1);
  const pos = lit(s, PLANE, 0, 80);
  assert.ok(neg.size > 50, `the disc at y < 0 lights cells (${neg.size})`);
  // (x, y) and (x, -y) are mirrors up to where the hexagon rows fall: about as many cells, the same spread of columns.
  assert.ok(Math.abs(neg.size - pos.size) <= 4, `as many cells as the disc at y > 0 (${neg.size} and ${pos.size})`);
  const cols = (set: Set<string>) => [...set].map((k) => Number(k.split(",")[0])).sort((a, b) => a - b);
  assert.ok(Math.abs(cols(neg)[0]! - cols(pos)[0]!) <= 1);
  assert.ok(Math.abs(cols(neg).at(-1)! - cols(pos).at(-1)!) <= 1);
  // Every lit cell's centre is within the reach.
  for (const k of neg) {
    const [gx, gy] = k.split(",").map(Number) as [number, number];
    assert.ok(Math.hypot(centreX(gx, gy) - 100, centreY(gy) + 50) <= R_SEEN + 1e-9, k);
  }
});

test("a bounded map keeps skipping rows under 0, and so does a curtain on an endless game", () => {
  const b = new SensedMap();
  b.mark(PLANE, 100, -50, R_SEEN);
  assert.equal(lit(b, PLANE, -80, -1).size, 0, "a bounded plane: nothing under row 0");
  b.mark(PLANE, 100, 2, R_SEEN);
  assert.equal(lit(b, PLANE, -80, -1).size, 0, "a disc straddling row 0 lights only its rows from 0");
  assert.ok(lit(b, PLANE, 0, 20).size > 0);
  const e = new SensedMap();
  e.endless = true;
  e.mark(1, 100, -50, R_SEEN); // layer 1: a curtain, bounded below by row 0 as ever
  e.mark(1, 100, 2, R_SEEN);
  assert.equal(lit(e, 1, -80, -1).size, 0, "a curtain of an endless game");
  assert.ok(lit(e, 1, 0, 20).size > 0);
});

/** A real endless game, its first colony's ant `i` made a host. */
function game(): Game {
  const g = new Game(generateEndlessWorld(4), {}, gameRng(4), [{ antCount: 20 }, { antCount: 20 }]);
  for (let k = 0; k < 20; k++) g.tick(0.05);
  return g;
}
const hostSlot = (c: Colony): number => {
  for (let i = 0; i < c.n; i++) if (c.alive[i]) return i;
  throw new Error("no living ant");
};

/** The (gx, gy) cell of a world point. */
function cellAt(x: number, y: number): [number, number] {
  cellOf(x, y);
  return [CELL[0], CELL[1]];
}

test("a host put at y < 0 of a real endless game is live there, then remembered once nothing senses it", () => {
  const g = game();
  const sensed = sensedFor(g, true);
  const k = sensed.knowledge!;
  const c = g.colonies[0]!;
  const i = hostSlot(c);
  // Every other ant is clean, so the one host is the only observer.
  for (const col of g.colonies) col.load.fill(0);
  c.load[i] = INFECTED;
  const x = 300;
  const y = -400;
  c.putAnt(i, PLANE, x, y);
  const [gx, gy] = cellAt(x, y);
  assert.ok(gy < 0 && gy >> CHUNK_BITS < 0, "a negative row, in a negative chunk row");
  assert.equal(k.state(PLANE, gx, gy), UNKNOWN, "before a stamp");
  sensed.stampGame(g);
  assert.equal(sensed.endless, true, "stampGame reads it from the game");
  assert.equal(k.state(PLANE, gx, gy), LIVE, "live under the host");
  assert.equal(k.state(PLANE, gx, gy - 2), LIVE, "and on the rows round it that are negative too");
  assert.ok(k.chunks(PLANE) > 0 && sensed.revealed(PLANE, gx >> CHUNK_BITS, gy >> CHUNK_BITS), "the chunk is revealed");
  assert.ok(k.snapshot(PLANE, "rock", gx, gy) !== undefined, "the ground is copied");
  // The host walks to y > 0; the cell is no longer sensed and, after the grace, is remembered.
  c.putAnt(i, PLANE, x, 400);
  const t0 = g.time;
  while (g.time - t0 < SENSED_FADE / 2) g.tick(0.05);
  sensed.stampGame(g);
  assert.equal(k.state(PLANE, gx, gy), REMEMBERED, "remembered once nothing senses it");
  assert.equal(k.stateAt(PLANE, x, y), REMEMBERED);
});

test("the fog's save and load round-trip cells at negative chunk rows", () => {
  const g = game();
  const sensed = sensedFor(g, true);
  const c = g.colonies[0]!;
  const i = hostSlot(c);
  for (const col of g.colonies) col.load.fill(0);
  c.load[i] = INFECTED;
  const spots: [number, number][] = [
    [300, -400],
    [-900, -70],
    [50, -1],
  ];
  for (const [x, y] of spots) {
    c.putAnt(i, PLANE, x, y);
    g.tick(0.05);
    sensed.stampGame(g);
  }
  const save = saveFog(sensed)!;
  const back = sensedFor(g, true);
  loadFog(back, JSON.parse(JSON.stringify(save)));
  const was = sensed.knowledge!;
  const now = back.knowledge!;
  let checked = 0;
  for (const [x, y] of spots) {
    const [gx, gy] = cellAt(x, y);
    assert.ok(gy < 0);
    assert.ok(was.explored(PLANE, gx, gy), "explored before the save");
    assert.ok(now.explored(PLANE, gx, gy), "explored after the load");
    assert.equal(now.snapshot(PLANE, "rock", gx, gy), was.snapshot(PLANE, "rock", gx, gy));
    assert.equal(now.lastSeen(PLANE, gx, gy), was.lastSeen(PLANE, gx, gy));
    checked++;
  }
  assert.equal(checked, spots.length);
  assert.equal(now.chunks(PLANE), was.chunks(PLANE), "as many chunks");
  // The loaded fog is remembered (nothing senses it on the new map), where it was.
  const [gx, gy] = cellAt(300, -400);
  assert.equal(now.state(PLANE, gx, gy), REMEMBERED);
});
