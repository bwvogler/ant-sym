import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../battle.ts";
import { Colony, MODES } from "../colony.ts";
import { CONTACTS, DEFAULT_RULE, FUNGAL_SITUATIONS, GROUNDS, LOADS, STRAIN_DEFAULT, TOGETHER, decodeFungal, encodeFungal, localFungusRule, type FungalSituation } from "../fungalPolicy.ts";
import { fungalKey, fungusContext, offeredFor, packFungusRequest, readIntervention } from "../fungusBrain.ts";
import { DORMANT_SHOW, Fungus, INTERVENTIONS, LETHAL, STRAINS, intervention } from "../fungus.ts";
import { Game } from "../game.ts";
import { Recognition } from "../recognition.ts";
import { generateWorld, mulberry32, worldFromArrays, type WorldMap } from "../world.ts";

// The fungus policy (ja-t4d.5): one intervention per host, from what the
// fungus in that host senses; gated by the strain and the player's menu.

const ID = (id: string) => STRAINS.findIndex((s) => s.id === id);
const sit = (s: Partial<FungalSituation> = {}): FungalSituation => ({ strain: "garden", load: "mid", host: "explore", ground: "border", contact: "none", groomed: false, colonies: "apart", ...s });

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

test("fungal situations: 648 per strain, and each encodes and decodes to itself", () => {
  assert.equal(FUNGAL_SITUATIONS, 648);
  const seen = new Set<number>();
  for (const load of LOADS)
    for (const host of MODES)
      for (const ground of GROUNDS)
        for (const contact of CONTACTS)
          for (const groomed of [false, true])
            for (const colonies of TOGETHER) {
              const s = sit({ load, host, ground, contact, groomed, colonies });
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

test("what the fungus senses: whose ground, who touches the host, whether it is groomed, how far apart the colonies are", () => {
  const map = arena();
  const sense = (setup: (a: Colony, b: Colony, f: Fungus) => void, apart: "apart" | "close" | "one" | null = null) => {
    const a = placed(map, 0, 0, [[20, 6]]);
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
    f.step([a, b], [occupancy(a, new CountGrid()), occupancy(b, new CountGrid())], 1e-6, rec, apart);
    return decodeFungal(a.fungal[0] as number, "garden");
  };
  assert.equal(sense(() => {}).ground, "border", "nobody's scent");
  assert.equal(sense((a) => a.ph.fields.home.set(20, 6, 1)).ground, "home");
  assert.equal(sense((_a, b) => b.ph.fields.home.set(20, 6, 1)).ground, "foreign");
  assert.equal(sense((a, b) => (a.ph.fields.home.set(20, 6, 1), b.ph.fields.home.set(20, 6, 0.8))).ground, "border", "both: no-man's land");
  assert.equal(sense(() => {}).contact, "none");
  assert.equal(sense((_a, b) => ((b.x[0] = 21.5), (b.y[0] = 6.5))).contact, "strangers");
  assert.equal(sense((_a, b) => ((b.x[0] = 21.5), (b.y[0] = 6.5), b.odour.fill(0.1))).contact, "kin", "a rival ant that smells like it");
  assert.equal(sense(() => {}).load, "high");
  assert.equal(sense(() => {}).host, "explore");
  assert.equal(sense(() => {}).colonies, "apart", "nests at 0 and 1");
  assert.equal(sense(() => {}, "one").colonies, "one", "the game's own reading wins");
});

test("groomed: a visible host among nestmates is groomed; one the policy keeps dormant shows a quarter and is not", () => {
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
  assert.equal(groomed(true), false, `dormant shows ${DORMANT_SHOW} of its visibility`);
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
  const req = packFungusRequest(
    [
      { id: "h0", situation: sit({ strain: "lockpick" }) },
      { id: "h1", situation: sit({ strain: "bloom" }) },
    ],
    "Make them one.",
    menu,
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
  assert.equal(readIntervention(ans("soothe"), "h0", sit({ strain: "lockpick" }), menu), "soothe");
  assert.equal(readIntervention(ans("blend"), "h0", sit({ strain: "lockpick" }), menu), null, "Lockpick cannot blend");
  assert.equal(readIntervention(ans("cull"), "h0", sit({ strain: "bloom" }), menu), null, "off the menu");
  assert.equal(fungalKey(sit()), "garden|mid|explore|border|none|unseen|apart");
  assert.notEqual(fungusContext("a", menu), fungusContext("b", menu), "a new aim, a new cache");
  assert.notEqual(fungusContext("a", menu), fungusContext("a", new Set([...menu, "cull"])), "a new menu, a new cache");
  assert.equal(fungusContext("a", new Set(["soothe", "blend"])), fungusContext("a", new Set(["blend", "soothe"])), "the menu's order does not matter");
});
