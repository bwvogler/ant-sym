import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../battle.ts";
import { Colony, localPolicy, MODES } from "../colony.ts";
import { HOOK_LANES, hookContext, hookKey, localHookAnswer, packHookRequest, readHook, responsesFromAnswers } from "../colonyBrain.ts";
import { runGame } from "../experiment.ts";
import { HOOKS, localResponses, withResponses, type AntView } from "../responses.ts";
import { mulberry32, worldFromArrays, type WorldMap } from "../world.ts";

const view = (v: Partial<AntView> = {}): AntView => ({ mode: "explore", carrying: "none", atNest: false, tired: false, foodTrail: "none", homeTrail: "none", alarm: "none", enemy: "none", stance: "forage", ...v });

/** An open 60×20 field, nest at the left, a patch of food at the right. */
function field(food = 50): WorldMap {
  const size = { w: 60, h: 20 };
  const f = new Float32Array(size.w * size.h);
  for (let y = 8; y < 12; y++) for (let x = 44; x < 48; x++) f[y * size.w + x] = food;
  return worldFromArrays(size, [{ x: 6, y: 10, r: 3 }, { x: 54, y: 10, r: 3 }], { food: f });
}

function run(map: WorldMap, responses = localResponses, seconds = 60, ants = 40) {
  const c = new Colony(map, { antCount: ants, maxAnts: ants }, mulberry32(4), localPolicy, undefined, responses);
  for (let k = 0; k < seconds * 30; k++) c.tick(1 / 30);
  return c;
}

test("localResponses: today's rules, hook for hook", () => {
  assert.equal(localResponses.onFood(view()), true);
  assert.equal(localResponses.onFood(view({ mode: "fight" })), false, "a fighter leaves food alone");
  assert.equal(localResponses.onCarry(view({ carrying: "food" })), "return");
  assert.equal(localResponses.atSite(view({ carrying: "food", atNest: true })), true);
  assert.equal(localResponses.atSite(view({ carrying: "food", atNest: false })), false);
  assert.equal(localResponses.mark(view({ carrying: "food" })), "food");
  assert.equal(localResponses.mark(view()), "home");
  assert.equal(localResponses.onContact(view({ enemy: "near" })), "fight");
  assert.equal(localResponses.raiseAlarm(view({ mode: "fight" })), "normal");
  assert.equal(localResponses.alarmGain(view({ alarm: "faint" })), "flee");
  assert.equal(localResponses.alarmGain(view({ mode: "fight", alarm: "faint" })), "ignore");
});

test("onFood: ants that ignore food bring none home", () => {
  assert.ok(run(field()).stored > 0, "the local rule forages");
  const c = run(field(), withResponses({ onFood: () => false }));
  assert.equal(c.stored, 0);
  assert.equal(c.map.foodLeft, c.map.foodTotal, "nothing was picked up");
});

test("onCarry: a carrier keeps the mode its response chose, and is not asked the mode policy", () => {
  const map = field();
  const asked: string[] = [];
  const c = new Colony(map, { antCount: 1, maxAnts: 1, wander: 0, deposit: 0 }, mulberry32(2), (s) => (asked.push(s.mode), "explore"), undefined, withResponses({ onCarry: () => "explore" }));
  c.x[0] = 45.5;
  c.y[0] = 9.5; // on the food
  c.tick(1 / 30);
  assert.equal(c.carrying[0], 1);
  const before = asked.length;
  for (let k = 0; k < 30; k++) c.tick(1 / 30);
  assert.equal(c.mode[0], 0, "still exploring with its load");
  assert.equal(asked.length, before, "no mode question while carrying");
});

test("atSite: a carrier that keeps its load never stores it", () => {
  const c = run(field(), withResponses({ atSite: () => false }));
  assert.equal(c.stored, 0);
  let carrying = 0;
  for (let i = 0; i < c.n; i++) carrying += c.carrying[i] as number;
  assert.equal(c.map.foodTotal - c.map.foodLeft, carrying, "food taken is food still carried");
});

test("mark: ants that lay nothing leave no trail; the local rule lays both", () => {
  const local = run(field(), localResponses, 20);
  assert.ok(local.ph.total("home") > 0 && local.ph.total("food") > 0);
  const quiet = run(field(), withResponses({ mark: () => "none" }), 20);
  assert.equal(quiet.ph.total("home"), 0);
  assert.equal(quiet.ph.total("food"), 0);
});

test("alarmGain: ants told to approach alarm gather at a blot; fleeing ones thin out", () => {
  const near = (c: Colony) => {
    let s = 0;
    for (let i = 0; i < c.n; i++) if (c.alive[i] && Math.hypot((c.x[i] as number) - 30, (c.y[i] as number) - 10) < 5) s++;
    return s;
  };
  const go = (r = localResponses) => {
    const map = field(0);
    const c = new Colony(map, { antCount: 80, maxAnts: 80 }, mulberry32(5), () => "explore", undefined, r);
    for (let k = 0; k < 600; k++) c.tick(1 / 30); // spread out
    let total = 0;
    for (let k = 0; k < 150; k++) {
      if (k % 15 === 0) c.paint("alarm", 30, 10, 3, 12);
      c.tick(1 / 30);
      total += near(c);
    }
    return total;
  };
  assert.ok(go(withResponses({ alarmGain: () => "approach" })) > go(), "approach draws more ants to the blot than flee");
});

/** Two colonies' ants on one cell of a bare field, every one fighting. */
function melee(responses = localResponses) {
  const map = worldFromArrays({ w: 40, h: 12 }, [{ x: 4, y: 6, r: 2 }, { x: 36, y: 6, r: 2 }]);
  const a = new Colony(map, { antCount: 10, maxAnts: 10, nest: 0 }, mulberry32(1), localPolicy, undefined, responses);
  const b = new Colony(map, { antCount: 10, maxAnts: 10, nest: 1 }, mulberry32(2));
  for (const c of [a, b])
    for (let i = 0; i < c.n; i++) {
      c.x[i] = 20.5;
      c.y[i] = 6.5;
    }
  a.carrying[0] = 1;
  const grids = [occupancy(a, new CountGrid()), occupancy(b, new CountGrid())];
  resolveFights([a, b], grids, 0.05, mulberry32(3));
  return { a, b, map };
}

test("onContact and raiseAlarm: fighters lay alarm; fleeing ants lay none and turn home; drop and run leaves the load", () => {
  const fight = melee();
  assert.ok(fight.a.ph.total("alarm") > 0, "fighters lay alarm");
  const quiet = melee(withResponses({ raiseAlarm: () => "none" }));
  assert.equal(quiet.a.ph.total("alarm"), 0, "a quiet fighter lays none");
  const loud = melee(withResponses({ raiseAlarm: () => "strong" }));
  assert.ok(Math.abs(loud.a.ph.total("alarm") - 2 * fight.a.ph.total("alarm")) < 1e-6, "strong is twice normal");
  const flee = melee(withResponses({ onContact: () => "flee" }));
  assert.equal(flee.a.ph.total("alarm"), 0);
  for (let i = 0; i < flee.a.n; i++) if (flee.a.alive[i]) assert.equal(flee.a.mode[i], 2, "return");
  const drop = melee(withResponses({ onContact: () => "drop" }));
  assert.equal(drop.a.carrying[0], 0);
  assert.equal(drop.map.foodLeft, 1, "the load is on the ground (or was dropped by the dying carrier)");
});

test("viewOf: what the ant sensed on its last tick", () => {
  const map = field();
  const c = new Colony(map, { antCount: 1, maxAnts: 1 }, mulberry32(1));
  c.tick(1 / 30); // at the nest
  const v = { ...c.viewOf(0) };
  const q = c.lastQuestion(0)!;
  assert.equal(v.atNest, true);
  assert.equal(v.carrying, "none");
  assert.deepEqual([v.mode, v.tired, v.foodTrail, v.homeTrail, v.alarm, v.enemy, v.stance], [MODES[c.mode[0] as number], q.tired, q.foodTrail, q.homeTrail, q.alarm, q.enemy, q.stance], "the same senses the mode question used");
});

test("the mode situation carries atNest: an ant at home is asked as at home (ja-qnx)", () => {
  const map = field();
  const seen: boolean[] = [];
  const c = new Colony(map, { antCount: 1, maxAnts: 1 }, mulberry32(1), (s) => (seen.push(s.atNest), "explore"));
  c.tick(1 / 30);
  assert.equal(seen[0], true);
});

test("hook lanes: a key per view of the fields each hook reads, a request, a reader and a context per doctrine", () => {
  for (const hook of HOOKS) {
    const lane = HOOK_LANES[hook];
    assert.ok(lane.fields.length > 0 && Object.keys(lane.criteria).length >= 2, hook);
    const v = view({ carrying: "food", atNest: true, alarm: "faint" });
    assert.equal(hookKey(hook, v), hookKey(hook, { ...v }));
    const f = lane.fields[0]!;
    const other = { ...v, [f]: f === "atNest" || f === "tired" ? !v[f] : f === "mode" ? "fight" : f === "carrying" ? "none" : f === "stance" ? "raid" : f === "enemy" ? "near" : "strong" } as AntView;
    assert.notEqual(hookKey(hook, v), hookKey(hook, other), `${hook}: ${f} tells views apart`);
    const req = packHookRequest(hook, [{ id: "s0", situation: v }], "be brave");
    const state = req.state as { doctrine: string; ants: Record<string, Partial<AntView>> };
    assert.equal(state.doctrine, "be brave");
    assert.deepEqual(Object.keys(state.ants.s0!).sort(), [...lane.fields].sort(), `${hook}: only its fields are sent`);
    const answer = Object.keys(lane.criteria)[0]!;
    assert.equal(readHook(hook, { [`s0_${hook}`]: { type: "choice", choice: answer } }, "s0"), answer);
    assert.equal(readHook(hook, { [`s0_${hook}`]: { type: "choice", choice: "dance" } }, "s0"), null);
    assert.notEqual(hookContext(hook, "a"), hookContext(hook, "b"));
  }
});

test("responsesFromAnswers: cached answers win, the local rule covers the rest, and the local rule's own answers change nothing", () => {
  const v = view({ mode: "follow" });
  const r = responsesFromAnswers({ onFood: { [hookKey("onFood", v)]: "ignore" }, mark: { [hookKey("mark", v)]: "none" } });
  assert.equal(r.onFood(v), false);
  assert.equal(r.onFood(view({ mode: "explore" })), true, "not cached: local");
  assert.equal(r.mark(v), "none");
  assert.equal(r.onContact(v), "fight");
  // A cache filled with the local rule's answers plays exactly like the local rule.
  const views = [view(), view({ carrying: "food" }), view({ mode: "fight", alarm: "strong" }), view({ atNest: true, carrying: "food" })];
  const cache: Record<string, Record<string, string>> = {};
  for (const hook of HOOKS) for (const w of views) (cache[hook] ??= {})[hookKey(hook, w)] = localHookAnswer(hook, w);
  const same = responsesFromAnswers(cache);
  for (const hook of HOOKS) for (const w of views) assert.equal(localHookAnswer(hook, w, same), localHookAnswer(hook, w), `${hook}`);
});

test("runGame takes responses for either side", () => {
  const a = runGame({ seed: 1, world: () => field(), game: { rival: false, antCount: 30 }, player: { colony: { antCount: 30, maxAnts: 30 } }, seconds: 30 });
  const b = runGame({ seed: 1, world: () => field(), game: { rival: false, antCount: 30 }, player: { colony: { antCount: 30, maxAnts: 30 }, responses: withResponses({ onFood: () => false }) }, seconds: 30 });
  assert.ok(a.colonies[0]!.stored > 0);
  assert.equal(b.colonies[0]!.stored, 0);
});
