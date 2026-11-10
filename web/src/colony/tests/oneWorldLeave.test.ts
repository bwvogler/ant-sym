import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, FAINT, LIFESPAN, MIDDLE, MODES, PLANE, WAIT_STEPS, type Colony, type HoleCell, type Layer } from "../colony.ts";
import { Game, gameRng } from "../game.ts";
import { CELL, cellOf, centreX, centreY, discOffsets, hexDistance } from "../hex.ts";
import { generateOneWorld, type OneWorld } from "../oneWorld.ts";
import { localResponses, responses, type Where } from "../responses.ts";
import { decode, encode } from "../save.ts";

// Activation in one world (ja-web, PRD §48.6): every outgoing forager passes a gate at the top of its own shaft, within
// WAIT_STEPS of its hole. There it waits, asked `leave`: it goes out on meeting carriers that come down with food, as a
// scout now and then with none, and as a raid scout on "raid". Held there it smells the plane's raid trail where it ends
// at its hole, and is recruited by it. A carrier that came down with food has a pass back out. Seed 7's small plane, as
// oneWorldGame.test.ts.

const DT = 1 / 30;
const SEED = 7;
const EXPLORE = MODES.indexOf("explore");
const RETURN = MODES.indexOf("return");
const FIGHT = MODES.indexOf("fight");

const small = (seed = SEED): OneWorld => generateOneWorld(seed, { plane: { size: { w: 160, h: 100 } } });
/** A small one-world game with every ant young (they stay in), but for those a test makes old; no scouts unless a test sets them. */
const game = (ants = 10): Game => {
  const g = new Game(small(), { antCount: ants, rivalAnts: ants, regrow: 0 }, gameRng(SEED));
  for (const c of g.colonies) {
    for (let i = 0; i < c.n; i++) if (c.alive[i]) c.age[i] = ageOf(0);
    c.params.scoutRate = 0;
    c.params.raidScout = 0;
  }
  return g;
};
/** An age in band b (0 young, 1 middle-aged, 2 old) that every founder's lifespan outlasts. */
const ageOf = (b: 0 | 1 | 2) => [0.05, (0.15 + MIDDLE) / 2, 0.5][b]! * LIFESPAN;
const own = (c: Colony): HoleCell => c.holeCells[c.params.nest] as HoleCell;
const curtainHole = (h: HoleCell) => ({ x: centreX(h.col, h.row), y: centreY(h.row) });
const planeHole = (h: HoleCell) => ({ x: centreX(h.px, h.py), y: centreY(h.py) });
/** Steps (hex) from ant i of c, in the curtain, to its hole's cell: at most WAIT_STEPS at the gate (the tunnels' way is never shorter). */
const fromHole = (c: Colony, i: number): number => {
  cellOf(c.x[i]!, c.y[i]!);
  const h = own(c);
  return hexDistance(CELL[0] as number, CELL[1] as number, h.col, h.row);
};
/** Old ant i of c at the top of its own shaft, going out (exploring). */
const toGate = (c: Colony, i: number): void => {
  const at = curtainHole(own(c));
  c.age[i] = ageOf(2);
  c.putAnt(i, CURTAIN, at.x, at.y);
  c.mode[i] = EXPLORE;
  c.heading[i] = -Math.PI / 2;
};
/** Run g for `seconds`, calling `each` after every tick; stop early once `until` holds. Returns the seconds run. */
const run = (g: Game, seconds: number, each?: () => void, until?: () => boolean): number => {
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    if (until?.()) return k * DT;
    g.tick(DT);
    each?.();
  }
  return seconds;
};
/** Carriers `ants` of c (old, empty-jawed spares) come down its hole with food, one each `every` seconds in turn, for `seconds`. */
const carriersDown = (g: Game, c: Colony, ants: readonly number[], seconds: number, every = 0.2): void => {
  const p = planeHole(own(c));
  let next = 0;
  let n = 0;
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    if (g.time >= next) {
      const j = ants[n++ % ants.length]!;
      c.age[j] = ageOf(2);
      c.putAnt(j, PLANE, p.x, p.y);
      c.carrying[j] = 1;
      c.mode[j] = RETURN;
      next = g.time + every;
    }
    g.tick(DT);
  }
};
/** The colony's private fields `keys`, decoded; `edit` changes them, and they are put back (as oneWorldGame.test.ts: no test hook). */
const editPrivate = (c: Colony, keys: readonly string[], edit: (r: Record<string, unknown>) => void): void => {
  const saved = c.saveState().private as Record<string, unknown>;
  const r: Record<string, unknown> = {};
  for (const k of keys) r[k] = decode(saved[k]);
  edit(r);
  c.loadState({ fields: {}, private: Object.fromEntries(keys.map((k) => [k, encode(r[k])])) });
};

test("one world: a rested forager is held at the top of its shaft until carriers come down with food, then goes out", () => {
  const g = game();
  const c = g.player;
  const i = 0;
  toGate(c, i);
  // With nothing coming back (and no scouts), it waits at the gate: never out, never down into the nest.
  let worst = 0;
  run(g, 20, () => {
    assert.equal(c.layer[i], CURTAIN, "it stays in");
    worst = Math.max(worst, fromHole(c, i));
    assert.equal(c.gateHeld, 1, "held at the gate");
  });
  assert.ok(worst <= WAIT_STEPS, `it mills at the top of the shaft (at worst ${worst} steps from the hole)`);
  assert.ok(c.met[i]! < c.params.leaveGate, "it has met no returns");
  assert.equal(c.crossedUp, 0);
  // Carriers come down past it, five a second: it goes out within a few seconds.
  const out = c.crossedUp;
  let left = -1;
  const t0 = g.time;
  const p = planeHole(own(c));
  let n = 0;
  for (let k = 0; k < Math.round(15 / DT) && left < 0; k++) {
    if (k % 6 === 0) {
      const j = 1 + (n++ % 5);
      c.age[j] = ageOf(2);
      c.putAnt(j, PLANE, p.x, p.y);
      c.carrying[j] = 1;
      c.mode[j] = RETURN;
    }
    g.tick(DT);
    if (c.layer[i] === PLANE) left = g.time - t0;
  }
  assert.ok(left >= 0 && left < 10, `out ${left.toFixed(1)} s after the carriers began coming down`);
  assert.ok(c.crossedUp > out);
  // The carriers stop: a forager new to the gate meets no returns there (each tick's count is last tick's carriers, not
  // every carrier ever), and waits.
  run(g, 2);
  const j = 7;
  toGate(c, j);
  run(g, 10, () => assert.equal(c.layer[j], CURTAIN, "the next forager waits"));
  assert.ok(c.met[j]! < c.params.leaveGate, `it has met no returns (met ${c.met[j]!.toFixed(2)})`);
});

test("one world: a forager deaf to returns stays at the gate while carriers come down, and leaves only as a scout", () => {
  const leaves = (scoutRate: number): boolean => {
    const g = game();
    const c = g.player;
    c.params.leaveGate = 1e9; // deaf: returns are always "none" (the gate is still on)
    c.params.scoutRate = scoutRate;
    toGate(c, 0);
    run(g, 1);
    carriersDown(g, c, [1, 2, 3, 4, 5], 15);
    return c.layer[0] === PLANE || c.crossedUp > 0;
  };
  assert.equal(leaves(0), false, "deaf, and no scouts: it stays in while 75 carriers come down past it");
  assert.equal(leaves(1), true, "deaf, scouts at 1 a second: it goes out as a scout");
});

test("one world: a carrier that came down with food goes back out past the gate unprompted, never held", () => {
  const g = game();
  const c = g.player;
  const i = 0;
  c.age[i] = ageOf(2);
  const p = planeHole(own(c));
  c.putAnt(i, PLANE, p.x + 1.5, p.y);
  c.carrying[i] = 1;
  c.mode[i] = RETURN;
  run(g, 1, undefined, () => c.layer[i] === CURTAIN);
  assert.equal(c.layer[i], CURTAIN, "down its hole");
  assert.equal(c.leaveOk[i], 1, "with a pass back out");
  let held = 0;
  run(
    g,
    120,
    () => (held += c.gateHeld),
    () => c.layer[i] === PLANE,
  );
  assert.equal(c.stored, 1, "it stored its food");
  assert.equal(c.layer[i], PLANE, "and went back out, with no returns and no scouts");
  assert.equal(held, 0, "never held at the gate");
  assert.equal(c.leaveOk[i], 0, "its pass used");
});

test("one world: a rested returner with empty jaws is held at the top as soon as it is down its hole", () => {
  const g = game();
  const c = g.player;
  // Homing rested and empty (a fight over, say): the local rule would send it exploring on the plane at once.
  c.policy = (s) => (s.mode === "return" ? "return" : s.mode);
  const i = 0;
  c.age[i] = ageOf(2);
  const p = planeHole(own(c));
  c.putAnt(i, PLANE, p.x + 1.5, p.y);
  c.mode[i] = RETURN;
  run(g, 1, undefined, () => c.layer[i] === CURTAIN);
  assert.equal(c.layer[i], CURTAIN, "down its hole");
  assert.equal(c.mode[i], EXPLORE, "its trip over, going out again");
  g.tick(DT);
  assert.equal(c.gateHeld, 1, "held at once");
  run(g, 20, () => {
    assert.ok(fromHole(c, i) <= WAIT_STEPS, "it never goes down into the nest");
    assert.equal(c.layer[i], CURTAIN);
  });
});

test("one world: a tired returner goes down to rest, then comes back up and is held at the top", () => {
  const g = game();
  const c = g.player;
  const i = 0;
  c.age[i] = ageOf(2);
  c.fatigue[i] = 2 * c.params.patience;
  const p = planeHole(own(c));
  c.putAnt(i, PLANE, p.x + 1.5, p.y);
  c.mode[i] = RETURN;
  run(g, 1, undefined, () => c.layer[i] === CURTAIN);
  assert.equal(c.layer[i], CURTAIN, "down its hole");
  assert.equal(c.mode[i], RETURN, "tired: still homing, to rest");
  let deepest = 0;
  let heldAt = -1;
  run(
    g,
    180,
    () => {
      assert.equal(c.layer[i], CURTAIN, "never out");
      deepest = Math.max(deepest, fromHole(c, i));
      if (c.gateHeld === 1) heldAt = g.time;
    },
    () => heldAt >= 0,
  );
  assert.ok(deepest > 2 * WAIT_STEPS, `it went down to rest (${deepest} steps from the hole)`);
  assert.ok(heldAt >= 0, "rested, it came up and was held at the gate");
  assert.equal(c.fatigue[i], 0, "rested");
  assert.ok(fromHole(c, i) <= WAIT_STEPS);
});

test("one world: `leave` = raid sends the ant held at the gate up and out as a recruited raid scout, in fight", () => {
  const raid = (stanceGate: number) => {
    const g = game();
    const c = g.player;
    c.responses = responses({ leave: () => "raid" });
    c.params.raidScout = 2;
    c.params.stanceGate = stanceGate;
    const i = 0;
    toGate(c, i);
    let mode = -1;
    run(
      g,
      15,
      () => {
        if (c.layer[i] === PLANE && mode < 0) mode = c.mode[i]!;
      },
      () => mode >= 0,
    );
    return { c, i, mode };
  };
  const { c, i, mode } = raid(1);
  assert.ok(c.raidable, "a rival lives");
  assert.equal(c.raidScouts, 1, "one raid scout sent");
  assert.equal(c.recruited[i], 1, "recruited: its stance is raid");
  assert.equal(c.layer[i], PLANE, "out");
  assert.equal(mode, FIGHT, "on the plane, in fight");
  // The control: where the stance is the colony's (stanceGate 0), "raid" is a wait at raidScout, a scout like any other.
  const ctl = raid(0);
  assert.equal(ctl.c.recruited[ctl.i], 0, "not recruited");
  assert.equal(ctl.c.raidScouts, 0);
});

test("one world: a finder's raid trail ending at the hole recruits the ants held at the gate, and they go out on it", () => {
  const recruit = (trail: boolean) => {
    const g = game();
    const c = g.player;
    c.params.raidRecruit = 1;
    const ants = [0, 1, 2, 3, 4];
    for (const i of ants) toGate(c, i);
    const p = planeHole(own(c));
    let smelt = false;
    c.responses = responses({
      leave: (t) => {
        if (t.raid !== "none") smelt = true;
        return localResponses.leave(t);
      },
    });
    run(g, 20, () => {
      // The finder's trail home, ending on the hole (kept up: it fades with a half-life of about 17 s).
      if (trail && Math.round(g.time / DT) % 15 === 0) c.paint("raid", p.x, p.y, 2, 5, PLANE);
    });
    return { c, ants, smelt };
  };
  const { c, ants, smelt } = recruit(true);
  assert.ok(smelt, "asked `leave`, they smelt the trail at the hole");
  assert.ok(c.recruits >= 3, `recruited at the gate (${c.recruits} of 5)`);
  assert.ok(
    ants.some((i) => c.recruited[i] === 1 && c.layer[i] === PLANE),
    "recruited, they went out on the trail",
  );
  const ctl = recruit(false);
  assert.equal(ctl.smelt, false, "the control: no trail, none smelt");
  assert.equal(ctl.c.recruits, 0, "and none recruited");
  assert.ok(
    ctl.ants.every((i) => ctl.c.layer[i] === CURTAIN),
    "all still held",
  );
});

test("one world: a finder lays its raid trail on to its own hole, where the ants held at the gate smell it, and has told once down it", () => {
  const g = game();
  const c = g.player;
  const i = 0;
  c.age[i] = ageOf(2);
  const h = own(c);
  const p = planeHole(h);
  // Home from strangers 12 cells out, telling (as a finder is made: reporting, its foes met, homing afresh).
  c.putAnt(i, PLANE, p.x + 12, p.y);
  c.mode[i] = RETURN;
  c.recruited[i] = 1;
  c.reporting[i] = 1;
  c.foes[i] = 1;
  c.since[i] = 0;
  // What the gate smells: the trail on the hole's cell and the six round it.
  const raid = (c.layers[PLANE] as Layer).ph.fields.raid;
  const o = discOffsets(1)[h.py & 1] as Int16Array;
  const atHole = (): number => {
    let m = 0;
    for (let k = 0; k < o.length; k += 2) m = Math.max(m, raid.get(h.px + o[k]!, h.py + o[k + 1]!));
    return m;
  };
  run(g, 20, undefined, () => c.layer[i] === CURTAIN);
  assert.equal(c.layer[i], CURTAIN, "down its hole");
  assert.equal(c.reporting[i], 0, "told");
  assert.ok(atHole() >= FAINT, `its trail reaches the hole (${atHole().toFixed(3)})`);
});

test("one world: an ant at the gate senses its place as `hole`, as at a nest's mouth on open ground; deeper in, its tunnels and chambers", () => {
  const g = game();
  const c = g.player;
  const i = 0;
  toGate(c, i);
  const places: Where[] = [];
  c.responses = responses({
    leave: (t) => {
      places.push(t.place);
      return "wait";
    },
  });
  run(g, 3);
  assert.ok(places.length > 0, "asked `leave`");
  assert.ok(
    places.every((w) => w === "hole"),
    `at the gate: ${[...new Set(places)].join(", ")}`,
  );
  assert.equal(c.place(i), "hole");
  // Deeper in: the royal chamber.
  const q = c.queen!;
  c.putAnt(i, CURTAIN, q.x, q.y);
  assert.equal(c.place(i), "chamber");
});

test("one world: a porter and a spoil carrier at the top of the shaft are never held at the gate", () => {
  const g = game();
  const c = g.player;
  const at = curtainHole(own(c));
  const royal = g.world!.curtain.chambers!.list.find((r) => r.role === "royal" && r.colony === c.params.nest)!.id;
  // Ant 0 is a porter (food moved between chambers, already the colony's); ant 1 carries spoil up and out. Both old, and
  // both still in the mode they walked in with, as on the step a load is picked up (the next step sends a carrier home).
  c.age[0] = ageOf(2);
  c.age[1] = ageOf(2);
  c.carrying[0] = 1;
  c.mode[0] = EXPLORE;
  editPrivate(c, ["porter", "portTo", "inJaws"], (r) => {
    (r.porter as Uint8Array)[0] = 1;
    (r.portTo as Int16Array)[0] = royal;
    r.inJaws = (r.inJaws as number) + 1;
  });
  c.pellet[1] = 1;
  c.mode[1] = EXPLORE;
  for (const i of [0, 1]) {
    c.putAnt(i, CURTAIN, at.x, at.y);
    c.heading[i] = -Math.PI / 2;
  }
  // (Once its food is put down, the porter is a forager like any other, and is held if it climbs to the gate.)
  let porting = 0;
  run(g, 5, () => {
    if (c.porting(0)) {
      porting++;
      assert.equal(c.layer[0], CURTAIN, "the porter's food stays in");
    }
    if (c.porting(0) || (c.pellet[1] && c.layer[1] === CURTAIN)) assert.equal(c.gateHeld, 0, "nobody held while carrying");
  });
  assert.ok(porting > 30, `it ported a while (${porting} ticks)`);
  assert.equal(c.layer[1], PLANE, "the spoil went out");
});

test("one world: a crowded gate with no returns sends raid scouts out (crowd is felt at the gate)", () => {
  const g = game(30);
  const c = g.player;
  c.params.raidScout = 1;
  c.params.crowdAt = 10;
  for (let i = 0; i < 20; i++) toGate(c, i);
  run(g, 20);
  assert.ok(c.raidScouts > 0, `raid scouts: ${c.raidScouts}`);
});

test("one world: a recruited raider in fight at the gate is held until `leave` says go", () => {
  const g = game();
  const c = g.player;
  c.responses = responses({ leave: () => "wait" });
  toGate(c, 0);
  c.recruited[0] = 1;
  c.mode[0] = FIGHT;
  run(g, 10, () => assert.equal(c.layer[0], CURTAIN, "held"));
  assert.equal(c.crossedUp, 0);
});

test("one world: a middle-aged forager at the top of its shaft is not held at the gate (only the old are; ja-lp4.6.8 revisits it)", () => {
  const g = game();
  const c = g.player;
  toGate(c, 0);
  c.age[0] = ageOf(1);
  let held = 0;
  run(
    g,
    20,
    () => (held += c.gateHeld),
    () => c.layer[0] === PLANE,
  );
  assert.equal(held, 0, "never held");
  assert.equal(c.layer[0], PLANE, "it goes out with no returns and no scouts");
});
