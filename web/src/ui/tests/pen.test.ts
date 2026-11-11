import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INFECTED,
  type Flight,
  FLIGHT_2D,
  Game,
  gameRng,
  NO_ROOM,
  centreX,
  centreY,
  generateOneWorld,
  mainGround,
  generateSideWorld,
} from "../../colony/index.ts";
import { flightCircle, penGate, penGround, penSettle, type Settle, withinFlight } from "../pen.ts";

// The queen's pen (ja-lo8.9): the only time a colony's words change. It opens for a new queen with the fungus in her,
// from a colony whose queen the fungus reached, while Jev can read new words; else she founds on her mother's doctrine.

const flight = (load: number): Flight => ({ mother: 1, x: 0, y: 0, load, strain: 0, at: 10, food: 24 });

test("the pen opens only for a queen with you in her, from a colony whose queen you reached, while Jev can read words", () => {
  assert.deepEqual(penGate(flight(INFECTED), [false, true], null, "Amber"), { open: true });
  const clean = penGate(flight(INFECTED / 2), [false, true], null, "Amber");
  assert.equal(clean.open, false);
  assert.match(!clean.open ? clean.reason : "", /without you in her/);
  const closed = penGate(flight(1), [true, false], null, "Amber");
  assert.match(!closed.open ? closed.reason : "", /never reached Amber's queen/);
  const locked = penGate(flight(1), [false, true], "Jev's daily budget is spent", "Amber");
  assert.match(!locked.open ? locked.reason : "", /can't read new words now \(Jev's daily budget is spent\)/);
  for (const g of [clean, closed, locked]) assert.match(!g.open ? g.reason : "", /mother's doctrine/);
});

// One world (U5.2): the player clicks the top view where her queen flies, within FLIGHT_2D of her mother's hole.

const oneWorldGame = (seed: number): Game => new Game(generateOneWorld(seed), { antCount: 4, rivalAnts: 4, regrow: 0 }, gameRng(seed));

test("the pen's circle is her flight round her mother's hole on the plane; none off one world", () => {
  const g = oneWorldGame(1);
  const f = flight(1);
  const c = flightCircle(g, f)!;
  const h = g.colonies[1]!.holeCells[g.colonies[1]!.params.nest]!;
  assert.deepEqual(c, { x: centreX(h.px, h.py), y: centreY(h.py), r: FLIGHT_2D });
  // The hole is the line's: the second colony's is V1.
  const v = g.world!.line.holes[1]!;
  assert.deepEqual([h.px, h.py], [v.x, v.y]);
  const side = new Game(generateSideWorld(1), { antCount: 4, rivalAnts: 4 }, gameRng(1));
  assert.equal(flightCircle(side, f), null);
});

test("a click outside the circle is refused, without asking where she would settle; inside, the settling is the game's", () => {
  const c = { x: 100, y: 50, r: FLIGHT_2D };
  let asked = 0;
  const settle = (): Settle => (asked++, { ok: true, cell: { x: 1, y: 2 }, end: "end" });
  const out = penSettle(c, { x: 100 + FLIGHT_2D + 0.5, y: 50 }, "Amber", settle);
  assert.equal(out.ok, false);
  assert.match(!out.ok ? out.reason : "", /too far: she flies at most 140 from Amber's hole/);
  assert.equal(penSettle(c, { x: 100 + 100, y: 50 + 100 }, "Amber", settle).ok, false, "141 away, diagonally");
  assert.equal(asked, 0);
  assert.deepEqual(
    penSettle(c, { x: 100, y: 50 + FLIGHT_2D }, "Amber", settle),
    { ok: true, cell: { x: 1, y: 2 }, end: "end" },
    "on the edge",
  );
  assert.deepEqual(
    penSettle(c, { x: 130, y: 40 }, "Amber", () => ({ ok: false, reason: NO_ROOM })),
    { ok: false, reason: NO_ROOM },
  );
  assert.ok(withinFlight(c, { x: 100, y: 50 }));
});

test("a click inside the circle founds where the pen showed; the ground is kept while the line is the same", () => {
  const g = oneWorldGame(2);
  const world = g.world!;
  const ground = penGround(world);
  assert.equal(penGround(world), ground, "worked out again for the same line");
  const fresh = mainGround(world);
  for (let y = 0; y < world.plane.size.h; y += 7)
    for (let x = 0; x < world.plane.size.w; x += 7) assert.equal(ground(x, y), fresh(x, y), `(${x}, ${y})`);
  // Her flight from Amber (colony 1), pending; a click inside the circle where the preview says she settles.
  const f: Flight = { mother: 1, x: 0, y: 0, load: 0, strain: 0, at: 0, food: 24 };
  g.flights.push(f);
  const c = flightCircle(g, f)!;
  let p: { x: number; y: number } | null = null;
  let shown: Settle | null = null;
  for (let a = 0; a < 2 * Math.PI && !shown?.ok; a += Math.PI / 8) {
    p = { x: c.x + 120 * Math.cos(a), y: c.y + 120 * Math.sin(a) };
    shown = penSettle(c, p, "Amber", (q) => g.settleAt(q, ground));
  }
  assert.ok(shown?.ok, "nowhere round Amber to found");
  const k = g.found(f, p!);
  assert.equal(k, 2);
  assert.deepEqual(g.founded[0]!.spot, { cell: shown.cell, end: shown.end });
  // The line grew: the ground is worked out again, for the new holes.
  assert.notEqual(penGround(world), ground);
});
