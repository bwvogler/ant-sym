import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../battle.ts";
import { Colony, localPolicy, type Situation } from "../colony.ts";
import { Fungus, STRAINS, preset } from "../fungus.ts";
import { compose, LEVERS } from "../levers.ts";
import { Game, MET, QUIET, type GameSave } from "../game.ts";
import { BINS, FUNGAL, MAX_MASK, Recognition, binCentre, binOf } from "../recognition.ts";
import { generateWorld, mulberry32, OPEN_WORLD, worldFromArrays, type WorldMap } from "../world.ts";
import { at, put } from "./hexmaps.ts";

/** Every host runs its strain's default intervention. */
/** Every host runs its strain's default preset (Fungus.resolve). */
const strainDefault = () => "default";

// Recognition (ja-t4d.3): enemies are strangers by odour, not by colony; the
// fungus calms (B1), widens a host's tolerance (B4) and gives it its own odour
// (B3/B7); a colony full of hosts drifts toward that odour, and two colonies
// that come to smell alike stop fighting: unified.

function arena(): WorldMap {
  return worldFromArrays({ w: 40, h: 12 }, [{ x: 4, y: 6.5, r: 2 }, { x: 36, y: 6.5, r: 2 }]);
}

/** A colony at nest `nest` with odour `odour`, its first ants at `cells` and the rest dead. */
function placed(map: WorldMap, nest: number, odour: number, cells: [number, number][], policy = localPolicy): Colony {
  const c = new Colony(map, { antCount: Math.max(1, cells.length), maxAnts: Math.max(1, cells.length), nest, odour }, mulberry32(7 + nest), policy);
  for (let i = 0; i < c.n; i++) {
    const cell = cells[i];
    c.alive[i] = cell ? 1 : 0;
    if (cell) {
      put(c, i, cell[0], cell[1]);
    }
  }
  return c;
}

const crowd = (x: number, y: number, n: number): [number, number][] => Array.from({ length: n }, () => [x, y]);

test("odour bands: an ant counts in its odour's band; look() counts only the bands that are strangers, weighted by calm", () => {
  assert.equal(binOf(0), 0);
  assert.equal(binOf(1), BINS - 1);
  assert.equal(binOf(0.5), BINS / 2);
  const map = arena();
  const a = placed(map, 0, 0, crowd(10, 6, 3));
  const b = placed(map, 1, 1, crowd(10, 6, 2));
  b.calm[1] = 0.75;
  const rec = new Recognition();
  rec.build([a, b]);
  rec.look(0, 0.35);
  assert.ok(Math.abs(rec.get(10, 6) - 1.25) < 1e-6, "two strangers, one of them three-quarters calm");
  rec.look(1, 0.35);
  assert.equal(rec.get(10, 6), 3);
  rec.look(0.5, 0.35);
  assert.ok(Math.abs(rec.get(10, 6) - 4.25) < 1e-6, "halfway between, both colonies are strangers");
  rec.look(0.5, 0.6);
  assert.equal(rec.get(10, 6), 0, "a wide enough tolerance: nobody is");
  assert.equal(rec.any(0, 0, 5, 5), false);
  assert.ok(Math.abs(binCentre(0) - 0.05) < 1e-9);
});

test("with every ant at its colony's odour and nobody calm, odour recognition fights exactly as colony recognition did", () => {
  const map = arena();
  for (let round = 0; round < 6; round++) {
    const setup = (): Colony[] => [placed(map, 0, 0, [...crowd(20, 6, 4), ...crowd(21, 6, 3)]), placed(map, 1, 1, [...crowd(20, 6, 3), ...crowd(21, 7, 5)])];
    const old = setup();
    const byColony = resolveFights(old, old.map((c) => occupancy(c, new CountGrid())), 0.3, mulberry32(round + 11));
    const now = setup();
    const rec = new Recognition();
    rec.build(now);
    const byOdour = resolveFights(now, now.map((c) => occupancy(c, new CountGrid())), 0.3, mulberry32(round + 11), undefined, rec);
    assert.deepEqual(byOdour, byColony, `round ${round}`);
    now.forEach((c, k) => assert.deepEqual([...c.alive], [...(old[k] as Colony).alive], `round ${round}, colony ${k}: the same ants died`));
  }
});

test("two colonies that smell alike share a cell and nobody dies; a calm side takes and deals less", () => {
  const map = arena();
  const kill = (oa: number, ob: number, calm: number) => {
    let deaths = [0, 0];
    for (let round = 0; round < 40; round++) {
      const cs = [placed(map, 0, oa, crowd(20, 6, 5)), placed(map, 1, ob, crowd(20, 6, 5))];
      for (let i = 0; i < 5; i++) (cs[0] as Colony).calm[i] = calm;
      const rec = new Recognition();
      rec.build(cs);
      const d = resolveFights(cs, cs.map((c) => occupancy(c, new CountGrid())), 0.2, mulberry32(round + 3), undefined, rec);
      deaths = [deaths[0]! + d[0]!, deaths[1]! + d[1]!];
    }
    return deaths;
  };
  assert.deepEqual(kill(0.45, 0.6, 0), [0, 0], "within tolerance: one supercolony");
  const war = kill(0, 1, 0);
  assert.ok(war[0]! > 20 && war[1]! > 20, `strangers fight: ${war}`);
  const calmed = kill(0, 1, 0.8);
  assert.ok(calmed[0]! < war[0]! / 3, `the calm side dies far less: ${calmed[0]} vs ${war[0]}`);
  assert.ok(calmed[1]! < war[1]! / 2, `and kills far less: ${calmed[1]} vs ${war[1]}`);
});

test("a calmed encounter raises no alarm; a real fight does", () => {
  const map = arena();
  const alarm = (calm: number) => {
    const cs = [placed(map, 0, 0, crowd(20, 6, 1)), placed(map, 1, 1, crowd(20, 6, 1))];
    (cs[1] as Colony).calm[0] = calm;
    const rec = new Recognition();
    rec.build(cs);
    resolveFights(cs, cs.map((c) => occupancy(c, new CountGrid())), 0.1, () => 0.999, undefined, rec);
    return (cs[0] as Colony).ph.read("alarm", at(20, 6).x, at(20, 6).y);
  };
  assert.ok(alarm(0) > 0);
  assert.equal(alarm(0.8), 0, "facing a fifth of an enemy");
});

test("an ant perceives a stranger near by its own odour and tolerance: a host's wider tolerance hides one", () => {
  const map = arena();
  const asked: Situation[] = [];
  const me = placed(map, 0, 0, [[20, 6]], (s) => {
    asked.push(s);
    return localPolicy(s);
  });
  const them = placed(map, 1, 0.55, [[21, 6]]); // band 5, centre 0.55 (bands are judged by centre, within 0.05)
  const rec = new Recognition();
  rec.build([me, them]);
  me.enemies = rec;
  me.tick(1 / 30);
  assert.equal(asked.at(-1)?.enemy, "near", "0.55 from it, past the 0.35 a healthy ant tolerates");
  me.tolerance[0] = 0.35 + 0.3; // soothe at full load
  me.reconsider();
  me.tick(1 / 30);
  assert.equal(asked.at(-1)?.enemy, "none", "the host tolerates it");
});

test("odour: an ant smells of its nest; a host carries a share of the fungus's own; the nest drifts toward the ants at it", () => {
  const map = arena();
  const c = placed(map, 0, 0, [...crowd(4, 6, 4), [20, 6]]);
  const rec = new Recognition();
  // A host away from the nest, at full share.
  c.mask[4] = MAX_MASK;
  rec.step([c], 0.1);
  assert.ok(Math.abs((c.odour[4] as number) - MAX_MASK * FUNGAL) < 1e-6, "its nest's odour, MAX_MASK of the way to the fungus's");
  assert.equal(c.nestOdour, 0, "nobody at the nest carries the fungus: the nest stays");
  // Hosts at the nest: the nest drifts toward them, and every ant follows its nest.
  for (let i = 0; i < 4; i++) c.mask[i] = MAX_MASK;
  for (let k = 0; k < 600; k++) rec.step([c], 0.1);
  assert.ok(c.nestOdour > 0.2, `the nest drifted toward the fungal odour: ${c.nestOdour}`);
  assert.ok(c.nestOdour <= FUNGAL + 1e-9);
  // A healthy ant again (the fungus cleared): it smells of its nest alone.
  c.mask[4] = 0;
  rec.step([c], 0.1);
  assert.ok(Math.abs((c.odour[4] as number) - c.nestOdour) < 1e-6);
});

test("a host is never a stranger to its own nest, at any share any intervention can give", () => {
  const tol = 0.35;
  for (const n0 of [0, 0.2, 0.5, 0.8, 1]) {
    const o = n0 + MAX_MASK * (FUNGAL - n0);
    assert.ok(Math.abs(o - n0) < tol, `nest ${n0}: host at ${o}`);
  }
  for (const lever of LEVERS) for (let level = 0; level < lever.words.length; level++) assert.ok(compose({ [lever.id]: level }).mask >= 0 && compose({ [lever.id]: level }).mask <= MAX_MASK, lever.id);
});

test("judged as an ant judges it (by band centre, in float32), a host at full share is still no stranger to a healthy nestmate", () => {
  const map = arena();
  for (const n0 of [0, 1]) {
    // A healthy ant and a host two cells apart; the host's odour MAX_MASK of the way to the fungus's.
    const c = placed(map, n0, n0, [[10, 6], [12, 6]]);
    c.odour[1] = n0 + MAX_MASK * (FUNGAL - n0);
    const rec = new Recognition();
    rec.build([c]);
    rec.look(c.odour[0] as number, c.tolerance[0] as number);
    assert.equal(rec.get(12, 6), 0, `nest ${n0}: host at ${c.odour[1]} (band ${binOf(c.odour[1] as number)}) seen as a stranger`);
  }
});

test("the fungus writes calm, tolerance and the fungal share: Lockpick soothes, Garden blends", () => {
  const map = arena();
  const c = placed(map, 0, 0, [[10, 3], [10, 9]]);
  const lockpick = STRAINS.findIndex((s) => s.id === "lockpick");
  const garden = STRAINS.findIndex((s) => s.id === "garden");
  c.load[0] = 1;
  c.strain[0] = lockpick;
  c.load[1] = 0.5;
  c.strain[1] = garden;
  const f = new Fungus(map, { grooming: 0 });
  f.hosts = 2;
  f.policy = strainDefault; // these tests are about levers, not the policy
  f.step([c], [occupancy(c, new CountGrid())], 1e-6);
  assert.equal(c.expr[0], preset("soothe"));
  assert.ok(Math.abs((c.calm[0] as number) - 0.8) < 1e-5);
  assert.ok(Math.abs((c.tolerance[0] as number) - 0.65) < 1e-5);
  assert.equal(c.mask[0], 0);
  assert.equal(c.expr[1], preset("blend"));
  assert.ok(Math.abs((c.mask[1] as number) - 0.3) < 1e-5, "half load, half the share");
  assert.equal(c.calm[1], 0);
});

/** Both colonies of a game, every ant's odour and its nest's set: a, then b. */
function smellAs(g: Game, oa: number, ob: number): [Colony, Colony] {
  const [a, b] = g.colonies as [Colony, Colony];
  a.nestOdour = oa;
  b.nestOdour = ob;
  for (let i = 0; i < a.n; i++) a.odour[i] = oa;
  for (let i = 0; i < b.n; i++) b.odour[i] = ob;
  return [a, b];
}

/** Tick a game for `seconds`, putting every ant of both colonies back at cell (x, y) of the arena, or each at its own nest, before each tick. */
function hold(g: Game, seconds: number, where: [number, number] | "apart"): void {
  for (let k = 0; k < Math.round(seconds * 30); k++) {
    g.colonies.forEach((c, j) => {
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i]) continue;
        if (where === "apart") put(c, i, j === 0 ? 2 : 37, 6);
        else put(c, i, where[0], where[1]);
      }
    });
    g.tick(1 / 30);
  }
}

test("unity: the nests' odour gap, the quiet and the meeting; unified when they smell alike, have met, and nobody has died fighting for a minute", () => {
  const g = new Game(arena(), { antCount: 5, rivalAnts: 5 }, mulberry32(1));
  const u0 = g.unity();
  assert.equal(u0.gap, 1);
  assert.equal(u0.score, 0);
  assert.equal(u0.met, 0);
  assert.equal(u0.unified, false);
  smellAs(g, 0.45, 0.6);
  g.time = QUIET + 1;
  const alike = g.unity();
  assert.ok(Math.abs(alike.gap - 0.15) < 1e-6);
  assert.equal(alike.mixing, 1, "every ant within tolerance of the other nest");
  assert.equal(alike.unified, false, "they smell alike and it has been quiet, but nobody has met (ja-i0f)");
  assert.equal(alike.score, 0, "no meeting, no unity");
  // Both colonies in one cell for a minute: a meeting, not a fight (they smell alike).
  hold(g, QUIET, [20, 6]);
  smellAs(g, 0.45, 0.6);
  const u = g.unity();
  assert.ok(u.met >= MET, `met ${u.met.toFixed(3)}`);
  assert.ok(u.met > 0.6, "every ant in allied contact for a minute: most of the way to 1");
  assert.equal(u.score, 1);
  assert.equal(u.unified, true);
  assert.equal(g.outcome(), "unified");
});

test("unity needs contact: colonies that smell alike but never meet are not one (ja-i0f, the underground repro in miniature)", () => {
  const g = new Game(arena(), { antCount: 5, rivalAnts: 5 }, mulberry32(1));
  smellAs(g, 0.45, 0.6);
  hold(g, 2 * QUIET, "apart");
  smellAs(g, 0.45, 0.6);
  const u = g.unity();
  assert.ok(u.quiet >= QUIET, "nobody has died fighting");
  assert.ok(u.gap <= 0.35, "the nests smell alike");
  assert.equal(u.met, 0, "nobody met");
  assert.equal(u.unified, false);
  assert.equal(g.outcome(), "playing");
});

test("unity: strangers in contact are not a meeting", () => {
  const g = new Game(arena(), { antCount: 5, rivalAnts: 5 }, mulberry32(1));
  smellAs(g, 0.1, 0.9);
  // One tick together: the fight resolves, but strangers touching count for nothing.
  hold(g, 1 / 30, [20, 6]);
  assert.equal(g.unity().met, 0);
});

test("unity: the meeting is saved, and a save from before it loads as not met", () => {
  const g = new Game(arena(), { antCount: 5, rivalAnts: 5 }, mulberry32(1));
  smellAs(g, 0.45, 0.6);
  hold(g, 10, [20, 6]);
  const met = g.unity().met;
  assert.ok(met > 0);
  const saved = JSON.parse(JSON.stringify(g.save())) as GameSave;
  const back = new Game(arena(), { antCount: 5, rivalAnts: 5 }, mulberry32(1));
  back.load(saved);
  assert.equal(back.unity().met, met);
  delete (saved.private as { met?: number }).met;
  const old = new Game(arena(), { antCount: 5, rivalAnts: 5 }, mulberry32(1));
  old.load(saved);
  assert.equal(old.unity().met, 0);
});

test("a colony whose nest smells like ours is no rival: the strategist forages instead of raiding kin", () => {
  const g = new Game(arena(), { antCount: 5, rivalAnts: 5, strategyEvery: 1 }, mulberry32(2));
  const [a, b] = g.colonies as [Colony, Colony];
  // A strategist that would always raid a rival.
  for (const c of [a, b]) c.stancePolicy = () => "raid";
  g.tick(1 / 30);
  assert.equal(a.stance, "raid", "strangers: raid");
  a.nestOdour = 0.45;
  b.nestOdour = 0.55;
  for (let k = 0; k < 31; k++) g.tick(1 / 30);
  assert.equal(a.stance, "forage", "kin: nobody to raid");
  assert.equal(b.stance, "forage");
});

// A whole game, so slower than the rest: its own timeout, and the bench's small map (160×100).
const GAME = { timeout: 60_000 };

/** Seed 2, 150 + 150 ants, Garden painted on the nests of `which` colonies, five sim-minutes. */
function garden(which: "both" | "one"): Game {
  const strain = STRAINS.findIndex((s) => s.id === "garden");
  const g = new Game(generateWorld(2, { ...OPEN_WORLD, size: { w: 160, h: 100 } }), { antCount: 150, rivalAnts: 150 }, mulberry32(13));
  for (const c of which === "both" ? g.colonies : [g.player]) g.paintSpores(c.nest.x, c.nest.y, c.nest.r + 2, 3, 0.3, strain);
  for (let k = 0; k < 30 * 300; k++) g.tick(1 / 30);
  return g;
}

test("in a real game: Garden in both colonies brings them to one odour and the fighting stops", GAME, () => {
  const g = garden("both");
  const u = g.unity();
  assert.ok(u.gap < 0.35, `nests within tolerance: gap ${u.gap.toFixed(2)}`);
  assert.ok(u.quiet >= QUIET, `nobody has died fighting for a minute: quiet ${u.quiet.toFixed(0)} s`);
  assert.ok(u.met >= MET, `the colonies have met as allies: met ${u.met.toFixed(4)} (ja-i0f)`);
  assert.equal(g.outcome(), "unified");
});

// Whether Garden painted on one colony crosses into the rival depends on the map (over seeds 1–6 it
// reaches the rival's nest on every one, and unifies most), so this checks what holds on all of them.
test("in a real game: Garden in one colony moves that colony halfway and no further; the rival, if it crosses, stops halfway too", GAME, () => {
  const g = garden("one");
  assert.ok(g.player.nestOdour > 0.2 && g.player.nestOdour <= 0.5, `the player's nest moved toward the fungal odour, no further: ${g.player.nestOdour.toFixed(2)}`);
  assert.ok(g.rival!.nestOdour >= 0.5, `the rival's nest stops at the fungal odour too: ${g.rival!.nestOdour.toFixed(2)}`);
});
