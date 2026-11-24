import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, cellOf, centreX, centreY, ChunkLayer, CURTAIN, type Fungus, INFECTED, PLANE } from "../../colony/index.ts";
import { REMEMBERED } from "../fog/knowledge.ts";
import { SensedMap } from "../fungusSight.ts";
import { lensAnt, lensLines, type LensProbe, probe } from "../lens.ts";
import { buildGame } from "../useColony.ts";

// The lens (PRD §69.3): what is under the pointer, in words, as the field shows it.

const bare: LensProbe = {
  view: "above",
  ground: "open",
  food: 0,
  mound: 0,
  spores: false,
  hypha: false,
  sight: 1,
  alarm: 0,
  foodTrail: 0,
  homeTrail: 0,
  hole: -1,
  chamber: null,
};
// One game for the tests that read a real one (each touches its own cells and ants).
let built: ReturnType<typeof buildGame> | null = null;
const aGame = () => (built ??= buildGame({ species: "generic", seed: 3, antCount: 50, rival: true, generation: 0 }));

const whats = (p: Partial<LensProbe>, ant = null as Parameters<typeof lensLines>[1]) =>
  lensLines({ ...bare, ...p }, ant).map((l) => l.what);

test("the ant first, then the place: the hole, a chamber, what lies on the ground, and the ground last", () => {
  const ant = { k: 1, i: 7, mode: "fight", carrying: true, infected: true };
  const lines = lensLines({ ...bare, hole: 1, food: 3, spores: true }, ant);
  assert.deepEqual(
    lines.map((l) => l.what),
    ["Ant #7 of Amber", "Amber's hole", "Food", "Spores", "Ground"],
  );
  assert.equal(lines[0]!.says, "fight · carrying food · a host of yours");
  assert.equal(lines[0]!.entry, "fungus", "a host's entry is the fungus's");
  assert.equal(lensLines(bare, { ...ant, infected: false, carrying: false })[0]!.entry, "jobs");
  assert.equal(lensLines(bare, { ...ant, infected: false })[0]!.says, "fight · carrying food · not infected");
});

test("a chamber says its role, what it is for and what lies in it, and links the role's entry", () => {
  const [line] = lensLines({ ...bare, view: "below", ground: "open", chamber: { k: 0, role: "brood", brood: 4, food: 2.4 } }, null);
  assert.equal(line!.what, "Brood chamber of Ink");
  assert.equal(line!.says, "where larvae are fed and pupae lie · 4 brood, 2 food", "brood is a mass noun (review of #196, N1)");
  assert.equal(line!.entry, "brood");
  const royal = lensLines({ ...bare, view: "below", chamber: { k: 1, role: "royal", brood: 0, food: 0 } }, null)[0]!;
  assert.equal(royal.entry, "queen");
  assert.ok(!royal.says.includes("·"), "nothing lying in it: nothing said of it");
});

test("scent shows past the field's own thresholds, and the stronger trail of the two is the one said", () => {
  assert.ok(!whats({ alarm: 0.03 }).includes("Alarm"), "at the threshold the field draws nothing");
  assert.ok(whats({ alarm: 0.031 }).includes("Alarm"));
  assert.ok(!whats({ foodTrail: 0.02 }).includes("Food trail"));
  assert.deepEqual(
    whats({ foodTrail: 0.5, homeTrail: 0.4 }).filter((w) => w.endsWith("trail")),
    ["Food trail"],
  );
  assert.deepEqual(
    whats({ foodTrail: 0.3, homeTrail: 0.4 }).filter((w) => w.endsWith("trail")),
    ["Home trail"],
  );
  assert.match(lensLines({ ...bare, foodTrail: 0.7 }, null)[0]!.says, /^strong:/);
  assert.match(lensLines({ ...bare, foodTrail: 0.1 }, null)[0]!.says, /^faint:/);
  assert.match(lensLines({ ...bare, foodTrail: 0.5 }, null)[0]!.says, /^fair:/);
});

test("a tie between the trails is the food trail's, as the field paints it", () => {
  // Wherever both are saturated and freshly sensed, both are 1: the field paints food over home (f >= h).
  assert.deepEqual(
    whats({ foodTrail: 0.5, homeTrail: 0.5 }).filter((w) => w.endsWith("trail")),
    ["Food trail"],
  );
});

test("the mycelium and the mound are said, each with its entry", () => {
  const lines = lensLines({ ...bare, hypha: true, mound: 2 }, null);
  assert.deepEqual(
    lines.map((l) => [l.what, l.entry]),
    [
      ["Mycelium", "evolution"],
      ["Mound", "midden"],
      ["Ground", null],
    ],
  );
});

test("where no host sensed lately, the lens says why no scent shows; only on open ground", () => {
  assert.deepEqual(whats({ sight: 0 }), ["Ground", "Unsensed"]);
  assert.equal(lensLines({ ...bare, sight: 0 }, null)[1]!.entry, "fungus-senses");
  assert.deepEqual(whats({ sight: 0, ground: "rock" }), ["Rock"]);
  assert.deepEqual(whats({ sight: 0, ground: "soil" }), ["Soil"]);
  assert.deepEqual(whats({ sight: 0, ground: "air" }), ["Sky"], "no scent ever shows in the sky (review of #196, N2)");
  assert.deepEqual(whats({ sight: 0.5 }), ["Ground"], "sensed: nothing to excuse");
});

test("the ground by view: open ground above is a tunnel below; rock and sky link nothing", () => {
  assert.equal(lensLines({ ...bare, view: "below" }, null)[0]!.what, "Tunnel");
  assert.equal(lensLines({ ...bare, ground: "rock" }, null)[0]!.entry, null);
  assert.equal(lensLines({ ...bare, ground: "air" }, null)[0]!.what, "Sky");
  assert.equal(lensLines({ ...bare, ground: "soil" }, null)[0]!.entry, "midden", "soil above: the mound's");
  assert.equal(lensLines({ ...bare, ground: "soil", view: "below" }, null)[0]!.entry, "chambers", "soil below: the nest's");
});

test("probe reads a real game: a hole on both views, a chamber below, and scent only where a host sensed it", () => {
  const g = aGame();
  const w = g.world!;
  const sensed = new SensedMap();
  const lw = { colonies: g.colonies, fungus: g.fungus, world: w };
  const h = g.colonies[0]!.holeCells[1]!;
  assert.equal(probe(lw, sensed, PLANE, centreX(h.px, h.py), centreY(h.py)).hole, 1, "Amber's hole above");
  assert.equal(probe(lw, sensed, CURTAIN, centreX(h.col, h.row), centreY(h.row)).hole, 1, "and below");
  assert.equal(probe(lw, sensed, PLANE, centreX(h.px + 3, h.py), centreY(h.py)).hole, -1, "beside it: no hole");

  // A cell in a chamber (each colony starts with its royal chamber dug): the lens names its role and its colony.
  const chambers = w.curtain.chambers!;
  const ch = chambers.list.find((c) => c.cells > 0 && c.colony === g.colonies[1]!.params.nest)!; // Amber's: not colony 0's
  let cell: [number, number] | null = null;
  for (let gy = ch.y0; gy <= ch.y1 && !cell; gy++)
    for (let gx = ch.x0; gx <= ch.x1 && !cell; gx++) if (chambers.at(gx, gy) === ch.id) cell = [gx, gy];
  const at = probe(lw, sensed, CURTAIN, centreX(cell![0], cell![1]), centreY(cell![1]));
  assert.equal(at.chamber?.role, ch.role);
  assert.equal(g.colonies[at.chamber!.k]!.params.nest, ch.colony, "the chamber's colony by its nest");
  assert.equal(at.chamber?.k, 1);

  // A food trail under an ant above: nothing shows until the ant is a host and the fungus has sensed through it.
  const c = g.colonies[0]!;
  const i = c.alive.indexOf(1);
  const h0 = c.holeCells[0]!;
  const [x, y] = [centreX(h0.px + 4, h0.py), centreY(h0.py)];
  c.putAnt(i, PLANE, x, y); // out on the surface, four cells from Ink's hole
  const ph = c.layers[PLANE]!.ph;
  const p0 = probe(lw, sensed, PLANE, x, y);
  ph.fields.food.set(h0.px + 4, h0.py, 8);
  assert.equal(probe(lw, sensed, PLANE, x, y).foodTrail, 0, "not sensed: no trail");
  c.load[i] = INFECTED;
  sensed.stamp(g.colonies, g.time);
  const p1 = probe(lw, sensed, PLANE, x, y);
  assert.equal(p1.sight, 1);
  assert.equal(p1.foodTrail, 1, "8 is past full (4): the field's full wash");
  assert.equal(probe(lw, sensed, PLANE, x, y, { food: false, home: true }).foodTrail, 0, "the food trail turned off: none said");
  assert.equal(p0.sight, 0);
  assert.deepEqual(lensAnt(g.colonies, 0, i)?.infected, true);
  assert.equal(lensAnt(g.colonies, 0, c.n + 5), null, "no such ant");
});

test("below, the lens reads the curtain's own scent, sensing, spores and mycelium (review of #196, S5)", () => {
  const g = aGame();
  const w = g.world!;
  const sensed = new SensedMap();
  const lw = { colonies: g.colonies, fungus: g.fungus, world: w };
  // An Amber ant underground, where the colony starts, and a food trail in its cell of the curtain.
  const c = g.colonies[1]!;
  const i = [...c.alive.keys()].find((j) => c.alive[j] && c.layer[j] === CURTAIN)!;
  const [x, y] = [c.x[i]!, c.y[i]!];
  cellOf(x, y);
  const [gx, gy] = [CELL[0], CELL[1]];
  c.layers[CURTAIN]!.ph.fields.food.set(gx, gy, 8);
  sensed.stamp(g.colonies, g.time);
  assert.equal(probe(lw, sensed, CURTAIN, x, y).foodTrail, 0, "before it is a host: no trail below");
  c.load[i] = INFECTED;
  sensed.stamp(g.colonies, g.time);
  const below = probe(lw, sensed, CURTAIN, x, y);
  assert.equal(below.view, "below");
  assert.equal(below.sight, 1, "the curtain's sensing, not the plane's");
  assert.equal(below.foodTrail, 1, "the curtain's trail, not the plane's");
  assert.equal(probe(lw, sensed, PLANE, x, y).foodTrail, 0, "the same point above: the plane's, none");

  // Spores and hyphae on the curtain only: the lens below finds them, above it doesn't.
  const curtainSpores = new ChunkLayer((n) => new Float32Array(n), 0);
  curtainSpores.set(gx, gy, 1e6);
  const planeSpores = new ChunkLayer((n) => new Float32Array(n), 0);
  const fungus = {
    spores: planeSpores,
    sporesOn: (l: number) => ({ spores: l === CURTAIN ? curtainSpores : planeSpores }),
    hyphaeOn: (l: number) => (l === CURTAIN ? { has: (hx: number, hy: number) => hx === gx && hy === gy } : null),
  } as unknown as Fungus;
  const fake = { ...lw, fungus };
  const f = probe(fake, sensed, CURTAIN, x, y);
  assert.deepEqual([f.spores, f.hypha], [true, true]);
  const up = probe(fake, sensed, PLANE, x, y);
  assert.deepEqual([up.spores, up.hypha], [false, false]);
});

test("a colony the game has frozen: its ant, its hole and its chambers say they are asleep; another colony's do not", () => {
  const ant = { k: 1, i: 7, mode: "rest", carrying: false, infected: false };
  const asleep = new Set([1]);
  const lines = lensLines({ ...bare, hole: 1, view: "below", chamber: { k: 1, role: "brood", brood: 0, food: 0 }, asleep }, ant);
  assert.equal(lines[0]!.says, "rest · not infected · asleep");
  assert.match(lines[1]!.says, /the way up · asleep: the game has paused it while the fungus is elsewhere$/);
  assert.match(lines[2]!.says, /where larvae are fed and pupae lie · asleep: the game has paused it/);
  const remembered = lensLines(
    { ...bare, view: "below", fog: REMEMBERED, chamber: { k: 1, role: "none", brood: 0, food: 0 }, asleep },
    null,
  );
  assert.match(remembered[0]!.says, /nobody senses it · asleep/, "a remembered chamber still says whose colony sleeps");
  const other = lensLines(
    { ...bare, hole: 0, view: "below", chamber: { k: 0, role: "brood", brood: 0, food: 0 }, asleep },
    { ...ant, k: 0 },
  );
  assert.ok(!other.some((l) => l.says.includes("asleep")), "colony 0 is awake");
  assert.ok(!lensLines({ ...bare, hole: 1 }, ant).some((l) => l.says.includes("asleep")), "nothing frozen: nothing said");
});

test("probe carries the sensed map's frozen colonies, and only when some are", () => {
  const g = aGame();
  const lw = { colonies: g.colonies, fungus: g.fungus, world: g.world! };
  const sensed = new SensedMap();
  const h = g.colonies[0]!.holeCells[1]!;
  assert.equal(probe(lw, sensed, PLANE, centreX(h.px, h.py), centreY(h.py)).asleep, undefined, "nothing frozen: no field at all");
  sensed.asleep.add(1);
  assert.deepEqual([...(probe(lw, sensed, PLANE, centreX(h.px, h.py), centreY(h.py)).asleep ?? [])], [1]);
});
