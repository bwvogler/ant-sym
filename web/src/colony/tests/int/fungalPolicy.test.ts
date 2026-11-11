import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../../battle.ts";
import { Colony, MODES, type Situation } from "../../colony.ts";
import { AROUSALS, CARRYING, DEFAULT_RULE, FUNGAL_SITUATIONS, PLACES, STRAIN_DEFAULT, TASKS, TOUCHES, decodeFungal, encodeFungal, localFungusRule, type FungalSituation } from "../../fungalPolicy.ts";
import { askedIn, FUNGUS_LEGEND, fungalKey, fungusContext, leverQuestions, packFungusRequest, readLevels, validLevels, worthAsking } from "../../fungusBrain.ts";
import { DEFAULT_MENU, DORMANT_SHOW, Fungus, LETHAL, LEVERS, STRAINS, preset } from "../../fungus.ts";
import { AS_IS, compose, CUSTOM, decodeLevels, encodeLevels, PRESETS, presetOf, pulled } from "../../levers.ts";
import { Game } from "../../game.ts";
import { Recognition } from "../../recognition.ts";
import { generateWorld, mulberry32, type WorldMap } from "../../world.ts";
import { at} from "../hexmaps.ts";
import { arena, placedAt } from "../builders.ts";

// The fungus policy (ja-t4d.5; levers, ja-lo8.4): a level for every lever per host, from what the fungus senses inside
// that host; levers off the player's menu stay as they are.

const ID = (id: string) => STRAINS.findIndex((s) => s.id === id);
const sit = (s: Partial<FungalSituation> = {}): FungalSituation => ({ arousal: "calm", touch: "none", place: "outside", task: "forager", carrying: "nothing", groomed: false, ...s });


const placed = (map: WorldMap, nest: number, odour: number, cells: [number, number][]): Colony => placedAt(map, cells, { nest, odour, seed: 3 + nest });

test("fungal situations: 864, and each encodes and decodes to itself", () => {
  assert.equal(FUNGAL_SITUATIONS, 864);
  const seen = new Set<number>();
  for (const arousal of AROUSALS)
    for (const touch of TOUCHES)
      for (const place of PLACES)
        for (const task of TASKS)
          for (const carrying of CARRYING)
            for (const groomed of [false, true]) {
              const s = sit({ arousal, touch, place, task, carrying, groomed });
              const code = encodeFungal(s);
              assert.ok(code >= 0 && code < FUNGAL_SITUATIONS);
              seen.add(code);
              assert.deepEqual(decodeFungal(code), s);
            }
  assert.equal(seen.size, FUNGAL_SITUATIONS);
});

test("the presets are the old interventions' levers exactly, so the local rule plays as it did", () => {
  const was: Record<string, Partial<typeof AS_IS>> = {
    soothe: { alarm: 0.25, calm: 0.8, tolerance: 0.3, quiet: 0.9 },
    share: { food: 1.5, foreignFood: 1, lay: 1.5, crossLay: 1 },
    roam: { home: 0.35, clock: 2.5 },
    blend: { mask: 0.6, tolerance: 0.15 },
    cull: { estrange: 1 },
    muddle: { marks: 0.3, swap: 1 },
    crown: { regicide: 1 },
    dormant: { show: DORMANT_SHOW },
  };
  for (const p of PRESETS) assert.deepEqual(compose(p.levels), { ...AS_IS, ...was[p.id] }, p.id);
  for (const [k, p] of PRESETS.entries()) assert.equal(presetOf(p.levels), k, `${p.id} is recognised`);
  assert.equal(presetOf({}), 0, "nothing pulled: as is (0)");
  assert.equal(presetOf({ food: 4, alarm: 0 }), CUSTOM, "a mix of Jev's own");
  assert.equal(presetOf({ alarm: 0 }), CUSTOM, "one of soothe's levers alone is not soothe");
});

test("levers compose, each on its own fields; levers off the menu stay as they are", () => {
  const v = compose({ food: 4, alarm: 0, odour: 2, show: 0 });
  assert.equal(v.food, 2.5);
  assert.equal(v.alarm, 0.25);
  assert.equal(v.mask, 0.6);
  assert.equal(v.show, DORMANT_SHOW);
  assert.equal(v.home, 1, "untouched");
  const off = compose({ food: 4, alarm: 0 }, new Set(["alarm"]));
  assert.equal(off.food, 1, "food is off the menu");
  assert.equal(off.alarm, 0.25);
  for (const lever of LEVERS) {
    assert.ok(lever.asIs >= 0 && lever.asIs < lever.words.length, lever.id);
    assert.equal(lever.words.length, lever.values.length, lever.id);
    assert.deepEqual({ ...AS_IS, ...lever.values[lever.asIs] }, AS_IS, `${lever.id}: its "as is" level is the world as it is`);
  }
  assert.deepEqual(
    pulled({ food: 3, alarm: 2, rival: 0 }).map((p) => p.lever.id),
    ["food"],
    "only levers away from as is",
  );
  assert.equal(encodeLevels({ food: 3 }, ["food", "alarm"]), "3,2");
  assert.deepEqual(decodeLevels("3,2", ["food", "alarm"]), { food: 3, alarm: 2 });
  assert.equal(decodeLevels("3", ["food", "alarm"]), null, "one level per lever asked");
  assert.equal(decodeLevels("9,2", ["food", "alarm"]), null, "a level out of range");
});

test("the local rule: each strain's default preset, unless the player hides groomed hosts or culls hosts fighting foreigners", () => {
  const rule = localFungusRule();
  assert.equal(rule(sit()), STRAIN_DEFAULT);
  assert.equal(rule(sit({ groomed: true })), STRAIN_DEFAULT, "hiding is off by default");
  assert.equal(rule(sit({ touch: "foreigner", arousal: "fighting" })), STRAIN_DEFAULT, "culling is off by default");
  const set = localFungusRule({ hide: true, cull: true });
  assert.equal(set(sit({ groomed: true })), "dormant");
  assert.equal(set(sit({ touch: "foreigner", arousal: "fighting" })), "cull");
  assert.equal(set(sit({ touch: "foreigner", arousal: "calm" })), STRAIN_DEFAULT, "a calm foreigner is tolerated");
  assert.equal(set(sit({ touch: "nestmate", arousal: "fighting" })), STRAIN_DEFAULT);
  assert.deepEqual(DEFAULT_RULE, { hide: false, cull: false });
});

test("the gate: whatever a policy answers, a host pulls only levers on the menu; lethal ones start off", () => {
  const map = arena(6.5);
  const f = new Fungus(map);
  assert.equal(f.menu.has("weapon"), false);
  assert.equal(f.menu.has("crown"), false);
  assert.ok(!f.menu.has("marks"), "no nest on a top-down map: floor marks are off it");
  const asked = f.asked;
  assert.deepEqual(asked, DEFAULT_MENU.filter((id) => id !== "marks" && id !== "queenSignal" && id !== "queenScent"), "a worker's levers on a top-down map: no nest, no queen");
  const levels = Object.fromEntries(asked.map((id) => [id, 0]));
  f.policy = () => encodeLevels(levels, asked);
  assert.deepEqual(f.choose(sit(), ID("garden")), levels, "Jev's levels, read over the levers asked");
  f.policy = () => "1,2";
  assert.deepEqual(f.choose(sit(), ID("garden")), PRESETS[preset("blend")]!.levels, "an answer that is not one: the strain's default");
  f.policy = () => "cull";
  const c = placed(map, 0, 0, [[20, 6]]);
  f.expressLevels(c, 0, f.choose(sit(), ID("bloom")), 1);
  assert.equal(c.estrange[0], 0, "cull is off the menu: the odour weapon stays as is");
  f.configure(DEFAULT_RULE, [...f.menu, "weapon"]);
  f.expressLevels(c, 0, f.choose(sit(), ID("bloom")), 1);
  assert.equal(c.estrange[0], 1, "on the menu, it bites");
  assert.equal(c.expr[0], preset("cull"));
});

test("what the fungus senses is its host's body, never its mode, and nothing map-wide", () => {
  const map = arena(6.5);
  const sense = (setup: (a: Colony, b: Colony) => void) => {
    const a = placed(map, 0, 0, [[20, 6], [3, 3]]);
    const b = placed(map, 1, 1, [[30, 2]]);
    a.load[0] = 0.8;
    a.strain[0] = ID("garden");
    const f = new Fungus(map, { grooming: 0 });
    f.hosts = 1;
    setup(a, b);
    const rec = new Recognition();
    rec.build([a, b]);
    f.step([a, b], [occupancy(a, new CountGrid()), occupancy(b, new CountGrid())], 1e-6, rec);
    return decodeFungal(a.fungal[0] as number);
  };
  assert.equal(sense(() => {}).touch, "none");
  assert.equal(sense((_a, b) => ((b.x[0] = at(21, 6).x), (b.y[0] = at(21, 6).y))).touch, "foreigner");
  assert.equal(sense((a) => ((a.x[1] = at(20, 7).x), (a.y[1] = at(20, 7).y))).touch, "nestmate");
  assert.equal(sense((a, b) => ((a.x[1] = at(20, 7).x), (a.y[1] = at(20, 7).y), (b.x[0] = at(21, 6).x), (b.y[0] = at(21, 6).y))).touch, "foreigner", "a foreigner over a nestmate");
  // Touch is smell, not colony (PR #42 review, S4): an ant of the other colony that smells like home is a nestmate to
  // the fungus, and a nestmate that smells foreign is a foreigner; the host's own odour never counts.
  assert.equal(sense((_a, b) => ((b.x[0] = at(21, 6).x), (b.y[0] = at(21, 6).y), (b.odour[0] = 0))).touch, "nestmate", "a foreign ant at the host's odour");
  assert.equal(sense((a) => ((a.x[1] = at(20, 7).x), (a.y[1] = at(20, 7).y), (a.odour[1] = 1))).touch, "foreigner", "an estranged nestmate");
  assert.equal(sense((a) => (a.odour[0] = 1)).touch, "none", "a host that smells foreign itself, alone");
  assert.equal(sense(() => {}).place, "outside");
  assert.equal(sense((a) => ((a.x[0] = at(4, 6).x), (a.y[0] = at(4, 6).y))).place, "chamber", "on a nest's disc, top-down");
  assert.equal(sense(() => {}).task, "forager", "top-down: every ant forages");
  assert.equal(sense(() => {}).carrying, "nothing");
  assert.equal(sense((a) => (a.carrying[0] = 1)).carrying, "food");
  assert.equal(sense(() => {}).arousal, "calm", "a host that never chose");
  const asked = (q: Partial<Situation>) => (a: Colony) => (a.lastQuestion = () => ({ mode: "explore", tired: false, foodTrail: "none", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage", ...q }));
  assert.equal(sense(asked({ alarm: "faint" })).arousal, "alarmed");
  assert.equal(sense(asked({ alarm: "strong", enemy: "near" })).arousal, "fighting", "strangers close outrank alarm");
  // Not the mode: an ant that changes what it does, in the same body and place, is the same situation to the fungus.
  for (const m of MODES.keys()) assert.deepEqual(sense((a) => (a.mode[0] = m)), sense(() => {}), `mode ${MODES[m]}`);
  // Nothing map-wide: where the nests' odours stand does not enter what the fungus senses.
  assert.deepEqual(
    sense((a, b) => ((a.nestOdour = 0.45), (b.nestOdour = 0.55))),
    sense(() => {}),
  );
});

test("groomed: a host among nestmates is groomed whether or not it hides (judged at its strain's visibility); hiding only shows them less", () => {
  const map = arena(6.5);
  const groomed = (hide: boolean) => {
    const c = placed(map, 0, 0, [[20, 6], [20, 6], [20, 6]]);
    c.load[0] = 0.8;
    c.strain[0] = ID("bloom");
    c.resist[1] = c.resist[2] = 1;
    const f = new Fungus(map);
    f.hosts = 1;
    if (hide) c.show[0] = DORMANT_SHOW;
    f.policy = () => (hide ? "dormant" : "share");
    f.step([c], [occupancy(c, new CountGrid())], 1e-6);
    return decodeFungal(c.fungal[0] as number).groomed;
  };
  assert.equal(groomed(false), true);
  // PR #7 review: judged at what a hidden host shows (a quarter), it read as ungroomed the step after it hid, showed, and hid again.
  assert.equal(groomed(true), true, `a hidden host shows ${DORMANT_SHOW} of its visibility, but its groomers are still there`);
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

test("hiding needs its lever: with 'fungus showing' off the menu, a dormant host shows its strain's full visibility", () => {
  const load = (menu: string[]) => {
    const c = placed(arena(6.5), 0, 0, [[20, 6], [20, 6], [20, 6]]);
    c.load[0] = 0.8;
    c.strain[0] = ID("garden");
    c.resist[1] = c.resist[2] = 1;
    const g = new Fungus(arena(6.5));
    g.configure({ hide: true, cull: false }, menu);
    g.policy = () => "dormant";
    g.hosts = 1;
    g.step([c], [occupancy(c, new CountGrid())], 0.5);
    g.step([c], [occupancy(c, new CountGrid())], 0.5);
    return c.load[0] as number;
  };
  assert.ok(load(["home"]) < load(["show", "home"]), "hiding is the showing lever's, and it is off");
});

test("cull: the host's odour is pushed past tolerance from its own nest, so its own colony fights it", () => {
  const map = arena(6.5);
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

test("cull bites from a high load: at 0.7 its own nestmates already take it for a stranger", () => {
  for (const l of [0.7, 0.75, 1]) {
    const map = arena(6.5);
    const c = placed(map, 0, 0, [[20, 6], [20, 6], [20, 6]]);
    const f = new Fungus(map);
    f.configure(DEFAULT_RULE, [...f.menu, "weapon"]);
    f.express(c, 0, preset("cull"), l);
    const rec = new Recognition();
    rec.step([c], 0.1);
    rec.build([c]);
    rec.look(c.odour[1] as number, rec.params.tolerance);
    assert.ok(rec.around(20, 6, { x0: 0, size: { w: 40, h: 12 } }) >= 1, `load ${l}: odour ${(c.odour[0] as number).toFixed(3)} is a stranger's`);
  }
});

test("the fungus lane's request: the aim, a score per lever on the menu for each host, read back to levels; nothing else is taken", () => {
  const asked = DEFAULT_MENU.filter((id) => id !== "marks" && id !== "queenSignal" && id !== "queenScent");
  const req = packFungusRequest(
    [
      { id: "h0", situation: sit(), asked },
      { id: "h1", situation: sit({ touch: "foreigner", arousal: "fighting" }), asked: ["calm", "alarmLaid"] },
    ],
    "Make them one.",
  );
  const state = req.state as { legend: string; aim: string; hosts: Record<string, FungalSituation>; ants?: unknown; doctrine?: unknown };
  assert.equal(state.aim, "Make them one.");
  assert.equal(state.ants, undefined, "no ant in the fungus's request");
  assert.equal(state.doctrine, undefined, "and no colony doctrine");
  assert.deepEqual(state.hosts.h1, sit({ touch: "foreigner", arousal: "fighting" }));
  for (const lever of LEVERS) assert.ok(FUNGUS_LEGEND.includes(`${lever.id}: ${lever.brief}`), `the legend explains ${lever.id}`);
  assert.deepEqual(Object.keys(req.questions).filter((k) => k.startsWith("h1_")), ["h1_alarmLaid", "h1_calm"].sort((a, b) => LEVERS.findIndex((v) => `h1_${v.id}` === a) - LEVERS.findIndex((v) => `h1_${v.id}` === b)));
  assert.equal(Object.keys(req.questions).filter((k) => k.startsWith("h0_")).length, asked.length);
  for (const q of Object.values(req.questions)) assert.equal(q.type, "score");
  const score = (n: number) => ({ type: "score" as const, score: n });
  assert.equal(readLevels({ h1_calm: score(1.6), h1_alarmLaid: score(0.2) }, "h1", ["alarmLaid", "calm"]), "0,2", "rounded to the nearest level");
  assert.equal(readLevels({ h1_calm: score(9) }, "h1", ["calm"]), "2", "within the lever's range");
  assert.equal(readLevels({ h1_calm: score(1) }, "h1", ["alarmLaid", "calm"]), null, "a lever missing: not cached");
  assert.equal(readLevels({ h1_calm: { type: "choice", choice: "x" } as never }, "h1", ["calm"]), null);
  const key = fungalKey(sit(), ["calm", "alarmLaid"]);
  assert.equal(key, "calm|none|outside|forager|nothing|unseen|calm,alarmLaid");
  assert.deepEqual(askedIn(key), ["calm", "alarmLaid"], "a key says which levers its question asked");
  assert.equal(validLevels(key, "1,0"), true);
  assert.equal(validLevels(key, "1"), false);
  assert.equal(validLevels(key, "3,0"), false, "calm has three levels");
  assert.deepEqual(Object.keys(leverQuestions("h9", ["food"])), ["h9_food"]);
  assert.notEqual(fungusContext("a"), fungusContext("b"), "a new aim, a new cache");
  assert.notEqual(fungusContext("a", "side"), fungusContext("a"), "the side view, its own cache");
  assert.equal(worthAsking(asked), true);
  assert.equal(worthAsking([]), false, "no lever on: nothing to ask");
  assert.ok(!DEFAULT_MENU.some((id) => LETHAL.has(id)), "lethal levers start off the menu");
});

test("hiding holds: with hide on, a groomed host stays hidden instead of flipping every step", () => {
  const g = new Game(generateWorld(1, { size: { w: 160, h: 100 } }), { antCount: 120, rivalAnts: 120 }, mulberry32(4));
  g.fungus.configure({ hide: true, cull: false }, g.fungus.menu);
  g.paintSpores(g.player.nest.x, g.player.nest.y, g.player.nest.r + 3, 3, 0.4, ID("garden"));
  const c = g.player;
  const prev = new Int16Array(c.n).fill(-1);
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
  assert.ok(flips < hostSteps * 0.1, `${flips} flips in ${hostSteps} host-steps`);
});
