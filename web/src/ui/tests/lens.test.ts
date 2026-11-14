import { test } from "node:test";
import assert from "node:assert/strict";
import { centreX, centreY, CURTAIN, INFECTED, PLANE } from "../../colony/index.ts";
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
  assert.equal(line!.says, "where larvae are fed and pupae lie · 4 broods, 2 food");
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
});

test("where no host sensed lately, the lens says why no scent shows; never on rock or soil", () => {
  assert.deepEqual(whats({ sight: 0 }), ["Ground", "Unsensed"]);
  assert.equal(lensLines({ ...bare, sight: 0 }, null)[1]!.entry, "fungus-senses");
  assert.deepEqual(whats({ sight: 0, ground: "rock" }), ["Rock"]);
  assert.deepEqual(whats({ sight: 0, ground: "soil" }), ["Soil"]);
  assert.deepEqual(whats({ sight: 0.5 }), ["Ground"], "sensed: nothing to excuse");
});

test("the ground by view: open ground above is a tunnel below; rock and sky link nothing", () => {
  assert.equal(lensLines({ ...bare, view: "below" }, null)[0]!.what, "Tunnel");
  assert.equal(lensLines({ ...bare, ground: "rock" }, null)[0]!.entry, null);
  assert.equal(lensLines({ ...bare, ground: "air" }, null)[0]!.what, "Sky");
});

test("probe reads a real game: a hole on both views, a chamber below, and scent only where a host sensed it", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: true, generation: 0 });
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
