import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../battle.ts";
import { Colony, MODES } from "../colony.ts";
import { CONTACTS, DEFAULT_RULE, FUNGAL_SITUATIONS, GROUNDS, LOADS, STRAIN_DEFAULT, decodeFungal, encodeFungal, localFungusRule, type FungalSituation } from "../fungalPolicy.ts";
import { fungalKey, fungusContext, offeredFor, offeredIn, packFungusRequest, readIntervention, worthAsking } from "../fungusBrain.ts";
import { DORMANT_SHOW, Fungus, INTERVENTIONS, LETHAL, STRAINS, intervention } from "../fungus.ts";
import { Game } from "../game.ts";
import { Recognition } from "../recognition.ts";
import { generateWorld, mulberry32, worldFromArrays, type WorldMap } from "../world.ts";

// The fungus policy (ja-t4d.5): one intervention per host, from what the
// fungus in that host senses; gated by the strain and the player's menu.

const ID = (id: string) => STRAINS.findIndex((s) => s.id === id);
const sit = (s: Partial<FungalSituation> = {}): FungalSituation => ({ strain: "garden", load: "mid", host: "explore", ground: "border", contact: "none", groomed: false, ...s });

function arena(): WorldMap {
  return worldFromArrays({ w: 40, h: 12 }, [{ x: 4, y: 6.5, r: 2 }, { x: 36, y: 6.5, r: 2 }]);
}

function placed(map: WorldMap, nest: number, odour: number, cells: [number, number][]): Colony {
  const c = new Colony(map, { antCount: Math.max(1, cells.length), maxAnts: Math.max(1, cells.length), nest, odour }, mulberry32(3 + nest));
  for (let i = 0; i < c.n; i++) {
    const cell = cells[i];
    c.alive[i] = cell ? 1 : 0;
    if (cell) {
      c.x[i] = cell[0] + 0.5;
      c.y[i] = cell[1] + 0.5;
    }
  }
  return c;
}

test("fungal situations: 288 per strain, and each encodes and decodes to itself", () => {
  assert.equal(FUNGAL_SITUATIONS, 288);
  const seen = new Set<number>();
  for (const load of LOADS)
    for (const host of MODES)
      for (const ground of GROUNDS)
        for (const contact of CONTACTS)
          for (const groomed of [false, true]) {
            const s = sit({ load, host, ground, contact, groomed });
            const code = encodeFungal(s);
            assert.ok(code >= 0 && code < FUNGAL_SITUATIONS);
            seen.add(code);
            assert.deepEqual(decodeFungal(code, "garden"), s);
          }
  assert.equal(seen.size, FUNGAL_SITUATIONS);
});

test("the local rule: each strain's default, unless the player hides groomed hosts or culls high-load fighters among strangers", () => {
  const rule = localFungusRule();
  assert.equal(rule(sit()), STRAIN_DEFAULT);
  assert.equal(rule(sit({ groomed: true })), STRAIN_DEFAULT, "hiding is off by default");
  assert.equal(rule(sit({ contact: "strangers", host: "fight", load: "high" })), STRAIN_DEFAULT, "culling is off by default");
  const set = localFungusRule({ hide: true, cull: true });
  assert.equal(set(sit({ groomed: true })), "dormant");
  assert.equal(set(sit({ contact: "strangers", host: "fight", load: "high" })), "cull");
  assert.equal(set(sit({ contact: "strangers", host: "fight", load: "mid" })), STRAIN_DEFAULT);
  assert.equal(set(sit({ contact: "kin", host: "fight", load: "high" })), STRAIN_DEFAULT);
  assert.deepEqual(DEFAULT_RULE, { hide: false, cull: false });
});

test("the gate: whatever a policy answers, a host runs only what its strain allows and the menu has on; lethal needs both", () => {
  const map = arena();
  const ids = [...INTERVENTIONS.map((v) => v.id), STRAIN_DEFAULT, "nonsense"];
  const menus: string[][] = [INTERVENTIONS.map((v) => v.id), [], ...INTERVENTIONS.map((v) => [v.id]), INTERVENTIONS.map((v) => v.id).filter((id) => !LETHAL.has(id))];
  for (const [s, strain] of STRAINS.entries())
    for (const menu of menus)
      for (const answer of ids) {
        const f = new Fungus(map);
        f.configure(DEFAULT_RULE, menu);
        f.policy = () => answer;
        const got = INTERVENTIONS[f.choose(sit({ strain: strain.id }), s)]!.id;
        assert.ok(got === "dormant" || (strain.allows.includes(got) && menu.includes(got)), `${strain.id}, menu [${menu}], answer ${answer}: ran ${got}`);
        if (LETHAL.has(got)) assert.ok(strain.allows.includes(got) && menu.includes(got));
      }
  // The fallbacks, by name.
  const f = new Fungus(map);
  f.policy = () => "cull";
  assert.equal(f.choose(sit({ strain: "lockpick" }), ID("lockpick")), intervention("soothe"), "Lockpick cannot cull: its own default");
  assert.equal(f.choose(sit({ strain: "bloom" }), ID("bloom")), intervention("share"), "Bloom can, but cull starts off the menu");
  f.configure(DEFAULT_RULE, [...f.menu, "cull"]);
  assert.equal(f.choose(sit({ strain: "bloom" }), ID("bloom")), intervention("cull"));
  f.configure(DEFAULT_RULE, ["dormant"]);
  assert.equal(f.choose(sit({ strain: "garden" }), ID("garden")), 0, "nothing on but dormant");
  assert.equal(new Fungus(map).menu.has("cull"), false);
});

test("what the fungus senses, all of it local to its host: whose ground, and who touches it", () => {
  const map = arena();
  const sense = (setup: (a: Colony, b: Colony, f: Fungus) => void) => {
    const a = placed(map, 0, 0, [[20, 6], [3, 3]]);
    const b = placed(map, 1, 1, [[30, 2]]);
    a.foreign = b.ph;
    b.foreign = a.ph;
    a.load[0] = 0.8;
    a.strain[0] = ID("garden");
    const f = new Fungus(map, { grooming: 0 });
    f.hosts = 1;
    setup(a, b, f);
    const rec = new Recognition();
    rec.build([a, b]);
    f.step([a, b], [occupancy(a, new CountGrid()), occupancy(b, new CountGrid())], 1e-6, rec);
    return decodeFungal(a.fungal[0] as number, "garden");
  };
  assert.equal(sense(() => {}).ground, "border", "nobody's scent");
  assert.equal(sense((a) => a.ph.fields.home.set(20, 6, 1)).ground, "home");
  assert.equal(sense((_a, b) => b.ph.fields.home.set(20, 6, 1)).ground, "foreign");
  assert.equal(sense((a, b) => (a.ph.fields.home.set(20, 6, 1), b.ph.fields.home.set(20, 6, 0.8))).ground, "border", "both: no-man's land");
  assert.equal(sense(() => {}).contact, "none");
  assert.equal(sense((_a, b) => ((b.x[0] = 21.5), (b.y[0] = 6.5))).contact, "strangers");
  assert.equal(sense((a) => ((a.x[1] = 20.5), (a.y[1] = 7.5))).contact, "kin", "a nestmate");
  assert.equal(sense((_a, b) => ((b.x[0] = 21.5), (b.y[0] = 6.5), b.odour.fill(0.1))).contact, "allied", "another colony's ant that smells close enough to tolerate");
  assert.equal(sense((a, b) => ((a.x[1] = 20.5), (a.y[1] = 7.5), (b.x[0] = 21.5), (b.y[0] = 6.5), b.odour.fill(0.1))).contact, "allied", "allied over kin");
  assert.equal(sense((a, b) => ((a.x[1] = 20.5), (a.y[1] = 7.5), (b.x[0] = 21.5), (b.y[0] = 6.5))).contact, "strangers", "strangers over all");
  assert.equal(sense(() => {}).load, "high");
  assert.equal(sense(() => {}).host, "explore");
  // Nothing map-wide: where the nests' odours stand (the colonies' closeness) does not enter what the fungus senses.
  const far = sense(() => {});
  const near = sense((a, b) => ((a.nestOdour = 0.45), (b.nestOdour = 0.55)));
  assert.deepEqual(near, far);
});

test("groomed: a host among nestmates is groomed whether or not it hides (judged at its strain's visibility); hiding only shows them less", () => {
  const map = arena();
  const groomed = (dormant: boolean) => {
    const c = placed(map, 0, 0, [[20, 6], [20, 6], [20, 6]]);
    c.load[0] = 0.8;
    c.strain[0] = ID("bloom");
    c.resist[1] = c.resist[2] = 1;
    const f = new Fungus(map);
    f.hosts = 1;
    if (dormant) {
      // Kept dormant by the policy last step.
      c.expr[0] = 0;
      c.fungal[0] = 0;
    } else c.expr[0] = intervention("share");
    f.policy = () => (dormant ? "dormant" : "share");
    f.step([c], [occupancy(c, new CountGrid())], 1e-6);
    return decodeFungal(c.fungal[0] as number, "bloom").groomed;
  };
  assert.equal(groomed(false), true);
  // PR #7 review: judged at what a dormant host shows (a quarter), it read as ungroomed the step after it hid, woke, and hid again.
  assert.equal(groomed(true), true, `dormant shows ${DORMANT_SHOW} of its visibility, but its groomers are still there`);
});

test("hiding protects a visible strain: Bloom hidden from its groomers keeps more of its load", () => {
  const run = (hide: boolean) => {
    const g = new Game(generateWorld(1, { size: { w: 160, h: 100 } }), { antCount: 200, rivalAnts: 200 }, mulberry32(5));
    g.fungus.configure({ hide, cull: false }, g.fungus.menu);
    g.paintSpores(g.player.nest.x, g.player.nest.y, g.player.nest.r + 2, 3, 0.3, ID("bloom"));
    for (let k = 0; k < 30 * 40; k++) g.tick(1 / 30);
    return g.fungus.census(g.player);
  };
  const shown = run(false);
  const hidden = run(true);
  assert.ok(hidden.meanLoad > shown.meanLoad + 0.1, `load: hidden ${hidden.meanLoad.toFixed(2)} vs shown ${shown.meanLoad.toFixed(2)}`);
  assert.ok(hidden.meanResist < shown.meanResist, `and the colony primes less: ${hidden.meanResist.toFixed(3)} vs ${shown.meanResist.toFixed(3)}`);
});

test("cull: the host's odour is pushed past tolerance from its own nest, so its own colony fights it", () => {
  const map = arena();
  const c = placed(map, 0, 0, [[20, 6], [20, 6], [20, 6]]);
  const rec = new Recognition();
  c.estrange[0] = 1;
  rec.step([c], 0.1);
  assert.ok(Math.abs((c.odour[0] as number) - 0.5) < 1e-6, `odour ${c.odour[0]}`);
  rec.build([c]);
  const deaths = resolveFights([c], [occupancy(c, new CountGrid())], 1, () => 0, undefined, rec);
  assert.ok(deaths[0]! >= 1, "a stranger among its nestmates: it dies (and they may too)");
  assert.equal(c.alive[0], 0);
});

test("the fungus lane's request: the aim, one choice per fungal situation among only what that host may be given; anything else is rejected", () => {
  const menu = new Set(INTERVENTIONS.map((v) => v.id).filter((id) => !LETHAL.has(id)));
  const offer = (strain: string) => offeredFor(strain, menu);
  const req = packFungusRequest(
    [
      { id: "h0", situation: sit({ strain: "lockpick" }), offered: offer("lockpick") },
      { id: "h1", situation: sit({ strain: "bloom" }), offered: offer("bloom") },
    ],
    "Make them one.",
  );
  const state = req.state as { aim: string; hosts: Record<string, FungalSituation>; ants?: unknown; doctrine?: unknown };
  assert.equal(state.aim, "Make them one.");
  assert.equal(state.ants, undefined, "no ant in the fungus's request");
  assert.equal(state.doctrine, undefined, "and no colony doctrine");
  const crit = (id: string) => Object.keys((req.questions[`${id}_do`] as { criteria: Record<string, string> }).criteria);
  assert.deepEqual(crit("h0"), ["dormant", "soothe", "roam"]);
  assert.deepEqual(crit("h1"), ["dormant", "share", "roam"], "cull is Bloom's, but off the menu");
  assert.deepEqual(offeredFor("bloom", new Set([...menu, "cull"])), ["dormant", "share", "roam", "cull"]);
  const ans = (choice: string) => ({ h0_do: { type: "choice" as const, choice, confidence: 0.9 } });
  assert.equal(readIntervention(ans("soothe"), "h0", offer("lockpick")), "soothe");
  assert.equal(readIntervention(ans("blend"), "h0", offer("lockpick")), null, "Lockpick cannot blend");
  assert.equal(readIntervention(ans("cull"), "h0", offer("bloom")), null, "off the menu");
  assert.equal(fungalKey(sit(), offer("garden")), "garden|mid|explore|border|none|unseen|dormant,blend,soothe,share");
  assert.deepEqual(offeredIn(fungalKey(sit(), offer("garden"))), offer("garden"), "a key says what its question offered");
  assert.deepEqual(offeredIn(fungalKey(sit(), [])), []);
  assert.notEqual(fungusContext("a"), fungusContext("b"), "a new aim, a new cache");
  // PR #7 review: the menu was in the context, so switching cull (Bloom's alone) dropped Garden's and Lockpick's answers.
  const withCull = new Set([...menu, "cull"]);
  assert.equal(fungalKey(sit(), offeredFor("garden", withCull)), fungalKey(sit(), offer("garden")), "cull does not touch Garden's questions");
  assert.notEqual(fungalKey(sit({ strain: "bloom" }), offeredFor("bloom", withCull)), fungalKey(sit({ strain: "bloom" }), offer("bloom")), "but is a new question for Bloom");
  assert.equal(worthAsking(offer("garden")), true);
  assert.equal(worthAsking(["blend"]), false, "one thing on offer is no choice");
  assert.equal(worthAsking([]), false);
});

// PR #7 review fixes.

test("hiding holds: with hide on, a groomed host stays dormant instead of flipping between dormant and its default every step", () => {
  const g = new Game(generateWorld(1, { size: { w: 160, h: 100 } }), { antCount: 120, rivalAnts: 120 }, mulberry32(4));
  g.fungus.configure({ hide: true, cull: false }, g.fungus.menu);
  g.paintSpores(g.player.nest.x, g.player.nest.y, g.player.nest.r + 3, 3, 0.4, ID("garden"));
  const c = g.player;
  const prev = new Int8Array(c.n).fill(-1);
  let flips = 0;
  let steps = 0;
  let hostSteps = 0;
  for (let t = 0; t < 30 * 10; t++) {
    const stepped = g.fungus.due(1 / 30);
    g.tick(1 / 30);
    if (!stepped) continue;
    steps++;
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || (c.fungal[i] as number) < 0) {
        prev[i] = -1;
        continue;
      }
      hostSteps++;
      const e = c.expr[i] as number;
      if ((prev[i] as number) >= 0 && prev[i] !== e) flips++;
      prev[i] = e;
    }
  }
  assert.ok(steps >= 90 && hostSteps > 1000, `${steps} steps, ${hostSteps} host-steps`);
  // Before the fix ~70 % of host-steps flipped (16,657 in 200 steps); now ~6.5 %: a host changes when it walks in or out of its groomers.
  assert.ok(flips < hostSteps * 0.1, `${flips} flips in ${hostSteps} host-steps`);
});

test("the gate: with the default and dormant off, a host runs the first thing still on; with nothing on it runs as-is and does not hide", () => {
  const f = new Fungus(arena());
  const garden = ID("garden");
  f.configure(DEFAULT_RULE, ["soothe", "share", "roam"]); // Garden's blend and dormant off
  assert.equal(f.choose(sit(), garden), intervention("soothe"), "not dormant: the player switched it off");
  f.policy = () => "dormant";
  assert.equal(f.choose(sit(), garden), intervention("soothe"));
  f.configure(DEFAULT_RULE, ["roam"]); // nothing Garden allows
  assert.equal(f.choose(sit(), garden), 0, "nothing on: as-is");
  // As-is with dormant off does not hide: a nestmate sees the strain's full visibility (it is groomed as hard as if it showed).
  const load = (menu: string[]) => {
    const c = placed(arena(), 0, 0, [[20, 6], [20, 6], [20, 6]]);
    c.load[0] = 0.8;
    c.strain[0] = garden;
    c.resist[1] = c.resist[2] = 1;
    c.expr[0] = 0;
    c.fungal[0] = 0;
    const g = new Fungus(arena());
    g.configure(DEFAULT_RULE, menu);
    g.hosts = 1;
    g.step([c], [occupancy(c, new CountGrid())], 0.5);
    return c.load[0] as number;
  };
  assert.ok(load(["roam"]) < load(["dormant", "roam"]), "hiding is dormant's, and dormant is off");
});

test("cull bites from a high load, where the local rule culls: at 0.7 its own nestmates already take it for a stranger", () => {
  for (const l of [0.7, 0.75, 1]) {
    const map = arena();
    const c = placed(map, 0, 0, [[20, 6], [20, 6], [20, 6]]);
    const f = new Fungus(map);
    f.express(c, 0, intervention("cull"), l);
    const rec = new Recognition();
    rec.step([c], 0.1);
    rec.build([c]);
    rec.look(c.odour[1] as number, rec.params.tolerance);
    assert.ok(rec.around(20, 6, 40, 12) >= 1, `load ${l}: odour ${(c.odour[0] as number).toFixed(3)} is a stranger's`);
  }
});

test("contact: a calmed stranger still smells strange (the fungus senses strangers, not allied)", () => {
  for (const calm of [0, 0.8]) {
    const map = arena();
    const a = placed(map, 0, 0, [[20, 6]]);
    const b = placed(map, 1, 1, [[20, 6]]);
    b.calm[0] = calm;
    const f = new Fungus(map);
    f.paint([a], 20.5, 6.5, 0.6, 0, 0.5, ID("garden"));
    const rec = new Recognition();
    rec.build([a, b]);
    f.step([a, b], [a, b].map((c) => occupancy(c, new CountGrid())), 0.1, rec);
    assert.equal(decodeFungal(a.fungal[0] as number, "garden").contact, "strangers", `calm ${calm}`);
    // A fight still counts it as calmed (what soothe is for).
    rec.look(a.odour[0] as number, rec.params.tolerance);
    assert.ok(Math.abs(rec.around(20, 6, 40, 12) - (1 - calm)) < 1e-6);
  }
});
