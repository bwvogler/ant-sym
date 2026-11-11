import { test } from "node:test";
import assert from "node:assert/strict";
import { CountGrid, occupancy, resolveFights } from "../../battle.ts";
import { choose, Colony, LIFESPAN, MIDDLE, YOUNG } from "../../colony.ts";
import { Game } from "../../game.ts";
import { packResponseRequest, readResponse, RESPONSE_HOOKS, responseContext, responseKey, responsesFromAnswers } from "../../colonyBrain.ts";
import { type Item, localResponses, responses, touchKey, type Touch } from "../../responses.ts";
import { dropFood, foodAt, generateSideWorld, mulberry32, worldFromArrays, type WorldMap } from "../../world.ts";
import { at, nestAt, put } from "../hexmaps.ts";

// The ant's response hooks (responses.ts): the local ones are the rules the colony had (the golden masters
// pin that whole games are unchanged); here, each hook swapped on its own changes what it should, and only
// that, and the lanes and readers that let Jev answer them.

/** A bare 40×12 top-down field: the nest on the left, one food cell straight east of it, 8 cells out. */
function corridor(food = 3): WorldMap {
  const size = { w: 40, h: 12 };
  const f = new Float32Array(size.w * size.h);
  f[6 * size.w + 14] = food;
  return worldFromArrays(size, [nestAt(6, 6, 2)], { food: f });
}

const touch = (t: Partial<Touch>): Touch => ({ mode: "explore", carrying: "none", porter: false, digging: false, place: "out", offered: "none", enemy: false, stance: "forage", quality: "fair", alarm: "none", odds: "none", returns: "none", raid: "strong", crowd: "few", ...t }) as Touch;

/** One ant heading east at the food 4 cells away, stepped until it is home with food or `seconds` pass. */
function forage(c: Colony, seconds = 20): { picked: boolean } {
  put(c, 0, 10, 6);
  c.heading[0] = 0;
  let picked = false;
  for (let k = 0; k < 30 * seconds && c.stored === 0; k++) {
    c.tick(1 / 30);
    if (c.carrying[0]) picked = true;
  }
  return { picked };
}

test("localResponses are the colony's rules before the hooks", () => {
  assert.equal(localResponses.trailRate(touch({ carrying: "food", quality: "rich" })), 1.2, "rich food: more trail (behaviour MR 3)");
  assert.equal(localResponses.trailRate(touch({ carrying: "food", quality: "poor" })), 0.83);
  assert.equal(localResponses.trailRate(touch({ carrying: "food" })), 1, "fair food lays as before");
  assert.equal(localResponses.get(touch({ offered: "food" })), true);
  assert.equal(localResponses.get(touch({ mode: "fight", offered: "food" })), false, "not mid-fight");
  for (const offered of ["soil", "corpse", "brood"] as const) assert.equal(localResponses.get(touch({ mode: "fight", offered })), true, `${offered}: the mechanic decides`);
  assert.equal(localResponses.carry(touch({ carrying: "food" })), "take");
  assert.equal(localResponses.carry(touch({ carrying: "corpse" })), "take");
  assert.equal(localResponses.drop(touch({ carrying: "food", place: "chamber" })), true);
  assert.equal(localResponses.trail(touch({ carrying: "food" })), "food");
  assert.equal(localResponses.trail(touch({})), "home");
  assert.equal(localResponses.trail(touch({ carrying: "brood" })), "home", "a nurse marks the way home");
  for (const t of [touch({ carrying: "soil" }), touch({ carrying: "corpse" }), touch({ carrying: "food", porter: true })]) assert.equal(localResponses.trail(t), "none", JSON.stringify(t));
  assert.equal(localResponses.trailRate(touch({})), 1);
  assert.equal(localResponses.alarmGain(touch({ mode: "fight" })), 0);
  assert.equal(localResponses.alarmGain(touch({ digging: true })), 0);
  assert.equal(localResponses.alarmGain(touch({})), 1);
  assert.equal(localResponses.raiseAlarm(touch({ mode: "fight", enemy: true })), 1);
});

test("get: an ant whose get response says no walks over food and leaves it", () => {
  const map = corridor(3);
  const c = new Colony(map, { antCount: 1, wander: 0 }, mulberry32(1));
  c.responses = responses({ get: () => false });
  const { picked } = forage(c, 10);
  assert.equal(picked, false);
  const f = at(14, 6);
  assert.equal(foodAt(map, f.x, f.y), 3);
  // And the local rule does pick it up on the same walk.
  const d = new Colony(corridor(3), { antCount: 1, wander: 0 }, mulberry32(1));
  assert.ok(forage(d, 10).picked);
});

test("drop: an ant whose drop response says no keeps its food at the nest", () => {
  const c = new Colony(corridor(3), { antCount: 1, wander: 0 }, mulberry32(1));
  c.responses = responses({ drop: () => false });
  const { picked } = forage(c, 20);
  assert.ok(picked);
  assert.equal(c.stored, 0);
  assert.equal(c.carrying[0], 1);
  const d = new Colony(corridor(3), { antCount: 1, wander: 0 }, mulberry32(1));
  forage(d, 20);
  assert.equal(d.stored, 1, "the local rule stores it");
});

test("carry: a carrier takes its load home without the mode policy being asked; told to put it down, it does, and the food lies there", () => {
  let asked = 0;
  const c = new Colony(corridor(3), { antCount: 1, wander: 0 }, mulberry32(1), (s) => (asked++, s.mode));
  put(c, 0, 14, 6); // on the food cell
  c.heading[0] = 0;
  c.tick(1 / 30); // picks the food up
  assert.equal(c.carrying[0], 1);
  const before = asked;
  c.tick(1 / 30);
  assert.equal(c.mode[0], 2, "taking it home: return");
  assert.equal(asked, before, "the mode policy is not asked while carrying");
  put(c, 0, 20, 6); // off the food, so it doesn't take its load straight up again
  const onMap = c.map.foodLeft;
  c.responses = responses({ carry: () => "put down" });
  c.tick(1 / 30);
  assert.equal(c.carrying[0], 0, "put down");
  assert.equal(c.map.foodLeft, onMap + 1, "the food is back on the map, not lost");
  assert.notEqual(c.mode[0], 2, "and its trip is over");
  assert.equal(c.stored, 0);
});

test("trail: no trail laid when the response says none; double when trailRate says 2", () => {
  const quiet = new Colony(corridor(0), { antCount: 50 }, mulberry32(3));
  quiet.responses = responses({ trail: () => "none" });
  for (let k = 0; k < 60; k++) quiet.tick(1 / 30);
  assert.equal(quiet.ph.total("home"), 0);

  const once = new Colony(corridor(0), { antCount: 50 }, mulberry32(3));
  const twice = new Colony(corridor(0), { antCount: 50 }, mulberry32(3));
  twice.responses = responses({ trailRate: () => 2 });
  once.tick(1 / 30);
  twice.tick(1 / 30);
  assert.ok(once.ph.total("home") > 0);
  assert.ok(Math.abs(twice.ph.total("home") - 2 * once.ph.total("home")) < 1e-3 * once.ph.total("home"));
});

/** Ten ants of each of two colonies in one cell of a bare field, fighting once; the first colony with `r` as its responses. */
function melee(r = localResponses): Colony {
  const m = worldFromArrays({ w: 40, h: 12 }, [nestAt(4, 6, 2), nestAt(36, 6, 2)]);
  const a = new Colony(m, { antCount: 10, maxAnts: 10, nest: 0 }, mulberry32(1));
  const b = new Colony(m, { antCount: 10, maxAnts: 10, nest: 1 }, mulberry32(2));
  a.responses = r;
  for (const c of [a, b]) for (let i = 0; i < c.n; i++) put(c, i, 20, 6);
  resolveFights([a, b], [occupancy(a, new CountGrid()), occupancy(b, new CountGrid())], 0.05, () => 0.999);
  return a;
}

test("raiseAlarm: fighters lay none when it says 0, twice as much when it says 2", () => {
  const normal = melee().ph.total("alarm");
  assert.ok(normal > 0);
  assert.equal(melee(responses({ raiseAlarm: () => 0 })).ph.total("alarm"), 0);
  assert.ok(Math.abs(melee(responses({ raiseAlarm: () => 2 })).ph.total("alarm") - 2 * normal) < 1e-6 * normal);
});

test("touch: what a response sees of an ant", () => {
  const c = new Colony(corridor(3), { antCount: 2, maxAnts: 2 }, mulberry32(1));
  c.carrying[1] = 1;
  put(c, 1, 30, 6);
  assert.deepEqual({ ...c.touch(0, false) }, touch({ place: "hole", raid: "none" }));
  assert.deepEqual({ ...c.touch(1, true) }, touch({ carrying: "food", enemy: true, raid: "none" }));
  assert.equal(c.item(1), "food");
});

test("response lanes: one question per situation, cached per hook and doctrine", () => {
  assert.equal(touchKey(touch({ carrying: "food", place: "chamber" })), "explore|food|-|-|chamber|none|clear|forage");
  for (const h of RESPONSE_HOOKS) {
    const req = packResponseRequest(h, [{ id: "s0", situation: touch({}) }, { id: "s1", situation: touch({ mode: "fight", enemy: true }) }], "Gather food.");
    assert.equal(Object.keys(req.questions).length, 2, h);
    assert.notEqual(responseContext(h, "Gather food."), responseContext(h, "Fight."), "a new doctrine is a new cache");
  }
  assert.notEqual(responseContext("get", "x"), responseContext("drop", "x"), "each hook its own cache");
});

test("readResponse: nouls are yes strictly above ½; choices must be one of the hook's answers", () => {
  assert.equal(readResponse("get", { s0_get: { type: "noul", noul: 0.9 } }, "s0"), true);
  assert.equal(readResponse("get", { s0_get: { type: "noul", noul: 0.5 } }, "s0"), false);
  assert.equal(readResponse("drop", { s0_drop: { type: "choice", choice: "yes" } }, "s0"), null);
  assert.equal(readResponse("carry", { s0_carry: { type: "choice", choice: "put down" } }, "s0"), "put down");
  assert.equal(readResponse("carry", { s0_carry: { type: "choice", choice: "return" } }, "s0"), null, "a mode is no carry answer any more");
  assert.equal(readResponse("carry", { s0_carry: { type: "choice", choice: "dance" } }, "s0"), null);
  assert.equal(readResponse("trail", { s0_trail: { type: "choice", choice: "none" } }, "s0"), "none");
  assert.equal(readResponse("contact", { s0_contact: { type: "choice", choice: "drop and run" } }, "s0"), "drop and run");
  assert.equal(readResponse("contact", { s0_contact: { type: "choice", choice: "home" } }, "s0"), null);
  assert.equal(readResponse("trail", {}, "s0"), null);
});

test("responsesFromAnswers: cached answers win, the local responses cover the rest, and every lookup is heard", () => {
  const t = touch({ mode: "follow" });
  const heard: string[] = [];
  const r = responsesFromAnswers({ get: { [touchKey(t)]: false }, trail: { [touchKey(t)]: "none" } }, localResponses, (h, hit) => heard.push(`${h}:${hit}`));
  assert.equal(r.get(t), false);
  assert.equal(r.get(touch({})), true, "not cached: local");
  assert.equal(r.trail(t), "none");
  assert.equal(r.carry(touch({ carrying: "food" })), "take", "no cache for carry: local");
  assert.equal(r.trailRate(t), localResponses.trailRate(t), "hooks that are not lanes stay local");
  assert.deepEqual(heard, ["get:true", "get:false", "trail:true"]);
});

test("get is asked for loose soil, corpses and brood too, and refusing one leaves it lying", () => {
  const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };
  /** A side-view game with dead to bury, run for 150 s; what get was offered, and the most ants holding each item at once. */
  const run = (refuse: Item | null) => {
    const map = generateSideWorld(2, SMALL);
    const g = new Game(map, { antCount: 200, rival: false }, mulberry32(4));
    const c = g.player;
    const offered = new Set<Item>();
    c.responses = responses({ get: (t) => (offered.add(t.offered), t.offered !== refuse && localResponses.get(t)) });
    for (let i = 0; i < c.n; i++) c.age[i] = ((YOUNG + MIDDLE) / 2) * LIFESPAN * (i % 2); // half young (nurses), half middle-aged (undertakers)
    const held: Partial<Record<Item, number>> = {};
    for (let k = 0; k < 30 * 150; k++) {
      if (k === 30 * 20)
        for (let i = 0, n = 0; i < c.n && n < 20; i++)
          if (c.alive[i] && c.item(i) === "none" && c.y[i]! > map.nest.entrance!.y + 3) {
            c.kill(i);
            n++;
          }
      g.tick(1 / 30);
      if (k % 30 === 0) {
        const now: Partial<Record<Item, number>> = {};
        for (let i = 0; i < c.n; i++) if (c.alive[i]) now[c.item(i)] = (now[c.item(i)] ?? 0) + 1;
        for (const [it, n] of Object.entries(now) as [Item, number][]) held[it] = Math.max(held[it] ?? 0, n);
      }
    }
    return { offered, held, loose: c.loosePicked };
  };
  const local = run(null);
  for (const it of ["food", "soil", "corpse", "brood"] as const) assert.ok(local.offered.has(it), `get was offered ${it}`);
  assert.ok((local.held.corpse ?? 0) > 0 && (local.held.brood ?? 0) > 0 && local.loose > 0, JSON.stringify(local));
  assert.equal(run("corpse").held.corpse ?? 0, 0, "no corpse taken up");
  assert.equal(run("brood").held.brood ?? 0, 0, "no brood taken up");
  assert.equal(run("soil").loose, 0, "no loose pellet taken up");
});

test("arrive (ja-qnx): a returner home with empty jaws is no longer returning, though its policy keeps returners returning", () => {
  // Jev's answer to every returner, home or not (PRD §42.4): keep returning. Anything else explores.
  const stubborn = (s: { mode: string }) => (s.mode === "return" ? "return" : "explore") as "return" | "explore";
  const home = (arrive: "explore" | "return") => {
    // leaveGate 0: the trip's end alone (with the gate, behaviour MR 5, a rested forager home waits for returns: see leave).
    const c = new Colony(corridor(0), { antCount: 1, maxAnts: 1, arrive, leaveGate: 0 }, mulberry32(1));
    c.policy = stubborn;
    put(c, 0, 12, 6);
    c.mode[0] = 2; // return
    let left = 0;
    for (let k = 0; k < 30 * 8; k++) {
      c.tick(1 / 30);
      if (c.mode[0] !== 2) left = Math.max(left, Math.hypot(c.x[0]! - c.nest.x, c.y[0]! - c.nest.y));
    }
    return { mode: c.mode[0], left };
  };
  const ends = home("explore");
  assert.notEqual(ends.mode, 2, "it explores");
  assert.ok(ends.left > c0r(), `and walks out again (${ends.left.toFixed(1)})`);
  assert.equal(home("return").mode, 2, "without it, it stays home returning (until REST)");
});

/** The corridor's nest radius. */
const c0r = () => corridor(0).nests[0]!.r;

test("arrive: putting a load down ends the trip, wherever it was put down", () => {
  const c = new Colony(corridor(0), { antCount: 1, maxAnts: 1 }, mulberry32(1));
  c.policy = (s) => (s.mode === "return" ? "return" : "explore");
  c.responses = responses({ drop: () => true });
  put(c, 0, 30, 6);
  c.carrying[0] = 1;
  c.tick(1 / 30);
  assert.equal(c.mode[0], 2, "carrying: going home");
  c.carrying[0] = 0; // put down out here (as a carrier told to put it down would)
  c.tick(1 / 30);
  assert.equal(c.mode[0], 0, "load down: exploring, not returning");
});

test("arrive in the side view: a fresh forager returning to the royal chamber is no longer returning; a tired one, or a young one, stays in", () => {
  const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };
  const at = (age: number, since: number) => {
    const c = new Colony(generateSideWorld(2, SMALL), { antCount: 1, maxAnts: 1 }, mulberry32(1));
    c.policy = (s) => (s.mode === "return" ? "return" : "explore"); // Jev's answer to returners: keep returning
    c.x[0] = c.queen!.x;
    c.y[0] = c.queen!.y;
    c.age[0] = age * LIFESPAN;
    c.lifespan[0] = Infinity;
    c.mode[0] = 2;
    c.fatigue[0] = since;
    for (let k = 0; k < 5; k++) c.tick(1 / 30);
    return c.mode[0];
  };
  assert.notEqual(at(0.6, 0), 2, "a fresh forager: its trip is over");
  assert.equal(at(0.6, 1e4), 2, "a tired forager stays in");
  assert.equal(at(YOUNG / 2, 0), 2, "the young work inside: they make no trips");
});

test("rest on a top-down map: a tired returner rests in the nest for restTime before its trip ends (ja-q47; the hole used to rest it at once)", () => {
  // leaveGate 0: rest alone (with the gate, behaviour MR 5, the rested ant then waits for returns: see leave).
  const c = new Colony(corridor(0), { antCount: 1, maxAnts: 1, restTime: 30, leaveGate: 0 }, mulberry32(1));
  c.policy = (s) => (s.mode === "return" ? "return" : "explore");
  put(c, 0, 6, 6); // in the nest
  c.mode[0] = 2;
  c.fatigue[0] = c.params.patience * 1.5; // tired
  let left = -1;
  for (let k = 1; k <= 30 * 90 && left < 0; k++) {
    c.tick(1 / 30);
    if (c.mode[0] !== 2) left = k / 30;
  }
  // From 1.5 × patience a full rest inside takes 1.5 × restTime (45 s) at the soonest (tired until fully rested); it
  // rests only while inside the nest's radius, which a homing ant drifts in and out of, so allow some more.
  assert.ok(left >= 44.9 && left <= 75, `rested and out after ${left.toFixed(1)} s`);
});

test("fatigue (ja-q47): the young (inside workers) never tire; carrying neither tires nor rests outside; rest comes a little at a time", () => {
  const SMALL = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };
  const g = new Game(generateSideWorld(2, SMALL), { antCount: 200, rival: false }, mulberry32(4));
  const c = g.player;
  const step = c.params.patience / c.params.restTime / 30; // a tick's rest
  let maxYoung = 0;
  let partialRests = 0;
  let foragersTired = 0;
  for (let k = 0; k < 30 * 300; k++) {
    const before = Float32Array.from(c.fatigue);
    g.tick(1 / 30);
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i]) continue;
      const f = c.fatigue[i]!;
      if (c.band(i) === 0) maxYoung = Math.max(maxYoung, f);
      if (c.band(i) === 2 && f > c.params.patience) foragersTired++;
      if (c.carrying[i] && !c.porting(i)) assert.ok(f <= before[i]! + 1e-6, `ant ${i}, carrying: fatigue rose ${before[i]} -> ${f}`);
      if (f > 0 && before[i]! - f > step / 2 && before[i]! - f < step * 1.5) partialRests++;
    }
  }
  assert.equal(maxYoung, 0, "the young never go out, so they never tire");
  assert.ok(foragersTired > 0, "foragers do tire");
  assert.ok(partialRests > 0, "fatigue falls a tick's rest at a time inside, not in one step");
});

test("fatigue: finding food clears it at once (the search succeeded)", () => {
  const c = new Colony(corridor(3), { antCount: 1, maxAnts: 1, wander: 0 }, mulberry32(1));
  put(c, 0, 14, 6); // on the food
  c.heading[0] = 0;
  c.fatigue[0] = c.params.patience * 1.5;
  c.tick(1 / 30);
  assert.equal(c.carrying[0], 1, "it took the food");
  assert.equal(c.fatigue[0], 0, "and is rested by its success");
});

test("REST waits for rest: a tired returner held at the nest is not sent out after REST's 10 s", () => {
  const c = new Colony(corridor(0), { antCount: 1, maxAnts: 1, restTime: 60 }, mulberry32(1));
  c.policy = (s) => (s.mode === "return" ? "return" : "explore");
  c.mode[0] = 2;
  c.fatigue[0] = c.params.patience * 2; // a full rest takes 120 s
  for (let k = 0; k < 30 * 20; k++) {
    put(c, 0, 6, 6); // held in the nest
    c.tick(1 / 30);
  }
  assert.equal(c.mode[0], 2, "still resting at 20 s");
});

test("fatigue: fighting out of the nest tires an ant too, so a raid ends with the raiders going home (review of #36)", () => {
  const c = new Colony(corridor(0), { antCount: 1, maxAnts: 1 }, mulberry32(1));
  c.policy = () => "fight";
  put(c, 0, 30, 6);
  c.mode[0] = 3;
  for (let k = 0; k < 30 * 5; k++) c.tick(1 / 30);
  assert.ok(c.fatigue[0]! > 4, `fatigue ${c.fatigue[0]} after 5 s fighting out`);
});

test("fatigue: it stops at twice patience, so rest from the worst takes twice restTime; the clock slows rest as it slows tiring", () => {
  const out = (clock: number) => {
    const c = new Colony(corridor(0), { antCount: 1, maxAnts: 1 }, mulberry32(1));
    c.policy = () => "explore";
    c.clock[0] = clock;
    for (let k = 0; k < 30 * 300; k++) {
      put(c, 0, 30, 6); // kept out, searching
      c.tick(1 / 30);
    }
    return c;
  };
  const kept = out(1);
  assert.equal(kept.fatigue[0], 2 * kept.params.patience, "capped at twice patience after 300 s out");
  // Rest from the cap, in the nest: ×1 clock takes 2 × restTime; ×2 clock takes twice that.
  const rest = (c: Colony, seconds: number) => {
    c.mode[0] = 2;
    c.policy = (s) => (s.mode === "return" ? "return" : "explore");
    for (let k = 0; k < 30 * seconds; k++) {
      put(c, 0, 6, 6);
      c.tick(1 / 30);
    }
    return c.fatigue[0]!;
  };
  assert.ok(rest(kept, kept.params.restTime) > 0.9 * kept.params.patience, "restTime rests only half of the cap");
  const slow = out(2);
  assert.equal(slow.fatigue[0], 2 * slow.params.patience, "a ×2 clock reaches the cap too, in 240 s");
  assert.ok(rest(slow, 2 * slow.params.restTime) > 0.9 * slow.params.patience, "with a ×2 clock, 2 × restTime rests only half of the cap");
});

test("quality: tasted at pickup, carried, offered to get and trailRate, and kept when put down", () => {
  const size = { w: 40, h: 12 };
  const f = new Float32Array(size.w * size.h);
  const q = new Float32Array(size.w * size.h).fill(1);
  f[6 * size.w + 14] = 3;
  q[6 * size.w + 14] = 1.5;
  const map = worldFromArrays(size, [nestAt(6, 6, 2)], { food: f, quality: q });
  const c = new Colony(map, { antCount: 1, wander: 0 }, mulberry32(1));
  const seen: { hook: string; quality: string }[] = [];
  c.responses = responses({
    get: (t) => (seen.push({ hook: "get", quality: t.quality }), localResponses.get(t)),
    trailRate: (t) => (t.carrying === "food" && seen.push({ hook: "trailRate", quality: t.quality }), 1),
  });
  const { picked } = forage(c, 20);
  assert.ok(picked);
  assert.ok(seen.some((s) => s.hook === "get" && s.quality === "rich"), "get is offered rich food");
  assert.ok(seen.some((s) => s.hook === "trailRate" && s.quality === "rich"), "a carrier of rich food knows it");
  // Put down where it stands, the food keeps its quality, blended by amount with what lies there.
  const m2 = worldFromArrays(size, [nestAt(6, 6, 2)], {});
  const c2 = new Colony(m2, { antCount: 1, wander: 0 }, mulberry32(1));
  put(c2, 0, 20, 6);
  c2.carrying[0] = 1;
  c2.quality[0] = 0.5;
  c2.responses = responses({ carry: () => "put down" });
  c2.tick(1 / 30);
  assert.equal(c2.carrying[0], 0);
  const where = at(20, 6);
  assert.equal(foodAt(m2, where.x, where.y), 1);
  assert.ok(m2.quality, "a quality layer appears when food other than 1 is put down");
});

test("touchKey: quality is in the key only when it isn't fair (keys cached before quality still match)", () => {
  assert.equal(touchKey(touch({})), "explore|none|-|-|out|none|clear|forage");
  assert.equal(touchKey(touch({ carrying: "food", quality: "rich" })), "explore|food|-|-|out|none|clear|forage|rich");
});

test("noEntry: a follower at a food trail's end with no food marks it; with food there, it doesn't; noEntry 0 lays none", () => {
  const size = { w: 40, h: 12 };
  const run = (food: number, noEntry: number): number => {
    const f = new Float32Array(size.w * size.h);
    if (food) for (let y = 4; y <= 8; y++) for (let x = 21; x <= 23; x++) f[y * size.w + x] = food; // a small pile at the trail's end
    const map = worldFromArrays(size, [nestAt(4, 6, 2)], { food: f });
    const c = new Colony(map, { antCount: 1, wander: 0, noEntryAvoid: 4 }, mulberry32(1));
    c.policy = () => "follow";
    c.responses = responses({ noEntry: () => noEntry });
    // A food trail along rows 5–7 from the nest to x = 20 (on over the pile, when there is one), strongest at its far end, as carriers lay it.
    for (let x = 8; x <= (food ? 23 : 20); x++) for (let y = 5; y <= 7; y++) c.ph.depositCell("food", x, y, 1 + x / 4);
    put(c, 0, 12, 6);
    c.heading[0] = 0;
    for (let k = 0; k < 30 * 4; k++) c.tick(1 / 30);
    let s = 0;
    for (let y = 0; y < size.h; y++) for (let x = 0; x < size.w; x++) s += c.ph.fields.noEntry.get(x, y);
    return s;
  };
  assert.ok(run(0, 1) > 0, "spent: marked");
  assert.equal(run(3, 1), 0, "food in sight: not marked");
  assert.equal(run(0, 0), 0, "the noEntry response says none");
});

test("choose (behaviour MR 3): left, ahead or right with chances (k + C)²; near even as k grows", () => {
  const share = (l: number, f: number, r: number, k: number) => {
    const rng = mulberry32(7);
    const n = 20000;
    const out = { left: 0, ahead: 0, right: 0 };
    for (let i = 0; i < n; i++) {
      const t = choose(l, f, r, 1, k, rng);
      if (t < 0) out.left++;
      else if (t > 0) out.right++;
      else out.ahead++;
    }
    return { left: out.left / n, ahead: out.ahead / n, right: out.right / n };
  };
  const s = share(3, 0, 1, 1); // weights 16, 1, 4
  assert.ok(Math.abs(s.left - 16 / 21) < 0.02 && Math.abs(s.ahead - 1 / 21) < 0.01 && Math.abs(s.right - 4 / 21) < 0.02, JSON.stringify(s));
  const big = share(3, 0, 1, 1000);
  for (const v of Object.values(big)) assert.ok(Math.abs(v - 1 / 3) < 0.02, JSON.stringify(big));
});

test("dropFood blends quality by amount (and a first drop on bare ground takes the food's)", () => {
  const map = worldFromArrays({ w: 10, h: 10 }, [nestAt(2, 2, 1)], {});
  const p = at(6, 6);
  dropFood(map, p.x, p.y, 1, 0.5);
  assert.equal(map.quality?.get(6, 6), 0.5);
  dropFood(map, p.x, p.y, 3, 1.5);
  assert.equal(map.quality?.get(6, 6), (1 * 0.5 + 3 * 1.5) / 4);
  assert.equal(foodAt(map, p.x, p.y), 4);
});

test("followChoice (top-down): at a fork a follower mostly takes the stronger trail, and sometimes the weaker", () => {
  // A stem east along row 10, then two branches at ±60° (the hex rows' own diagonals): up 4× stronger than down.
  const size = { w: 40, h: 22 };
  const branch = (c: Colony, up: boolean, level: number) => {
    let x = 16;
    for (let k = 0; k < 9; k++) {
      const y = up ? 10 - k : 10 + k;
      for (let w = -1; w <= 1; w++) c.ph.depositCell("food", x + w, y, level);
      if (y % 2 === 0) x += up ? 0 : 1; // walk the NE / SE diagonal in offset rows
      else x += up ? 1 : 0;
    }
  };
  let strong = 0;
  let weak = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const map = worldFromArrays(size, [nestAt(3, 10, 2)], {});
    const c = new Colony(map, { antCount: 1, wander: 0 }, mulberry32(seed));
    c.policy = () => "follow";
    for (let x = 6; x <= 16; x++) for (let y = 9; y <= 11; y++) c.ph.depositCell("food", x, y, 4);
    branch(c, true, 8);
    branch(c, false, 2);
    put(c, 0, 8, 10);
    c.heading[0] = 0;
    for (let k = 0; k < 30 * 4 && Math.abs((c.y[0]) - at(8, 10).y) < 5; k++) c.tick(1 / 30);
    const dy = (c.y[0]) - at(8, 10).y;
    if (dy <= -5) strong++;
    else if (dy >= 5) weak++;
  }
  assert.ok(strong >= 0.7 * (strong + weak) && strong + weak >= 30, `stronger ${strong}, weaker ${weak}`);
  assert.ok(weak >= 1, `a choice, not a certainty: weaker ${weak} of ${strong + weak}`);
});

test("graded alarm (behaviour MR 4): faint draws an empty-jawed explorer, a follower holds its trail; strong repels; fighters and diggers ignore it", () => {
  assert.equal(localResponses.alarmGain(touch({ alarm: "faint" })), -1, "faint draws an explorer");
  assert.equal(localResponses.alarmGain(touch({ mode: "follow", alarm: "faint" })), 0, "a follower keeps to its trail");
  assert.equal(localResponses.alarmGain(touch({ alarm: "faint", carrying: "food", mode: "return" })), 1, "a carrier keeps clear");
  assert.equal(localResponses.alarmGain(touch({ alarm: "strong" })), 1, "strong repels");
  assert.equal(localResponses.alarmGain(touch({ mode: "fight", alarm: "faint" })), 0);
  assert.equal(localResponses.alarmGain(touch({ digging: true, alarm: "strong" })), 0);
});

test("contact (behaviour MR 4): raiders and defenders fight; foraging, every ant turns away", () => {
  assert.equal(localResponses.contact(touch({ stance: "raid", odds: "outnumbered" })), "fight");
  assert.equal(localResponses.contact(touch({ stance: "raid", carrying: "food", mode: "return" })), "flee", "a carrier takes its load home, raid or not");
  assert.equal(localResponses.contact(touch({ stance: "defend", odds: "even" })), "fight");
  assert.equal(localResponses.contact(touch({ mode: "fight", odds: "outnumbered" })), "fight", "its policy sent it to fight");
  assert.equal(localResponses.contact(touch({ odds: "outnumbering" })), "flee", "foraging, it turns away even outnumbering");
  assert.equal(localResponses.contact(touch({ odds: "even" })), "flee");
  assert.equal(localResponses.contact(touch({ mode: "follow", odds: "outnumbered" })), "flee");
  assert.equal(localResponses.contact(touch({ carrying: "food", mode: "return", odds: "outnumbering" })), "flee");
  assert.equal(responseKey("contact", touch({ odds: "even" })), "explore|none|-|-|out|none|clear|forage|alarm:none|odds:even", "the contact lane keys on odds and alarm");
  assert.equal(responseKey("carry", touch({ odds: "even", alarm: "strong" })), "explore|none|-|-|out|none|clear|forage", "the other lanes, never sent them, don't");
});

test("the contact lane (behaviour MR 4) is sent alarm and odds; the other lanes are not", () => {
  const t = touch({ enemy: true, alarm: "strong", odds: "outnumbered" });
  type Ants = { ants: Record<string, Record<string, unknown>> };
  const c = (packResponseRequest("contact", [{ id: "s0", situation: t }], "Gather food.").state as Ants).ants;
  assert.equal(c.s0?.alarm, "strong");
  assert.equal(c.s0?.odds, "outnumbered");
  const g = (packResponseRequest("carry", [{ id: "s0", situation: t }], "Gather food.").state as Ants).ants;
  assert.equal(g.s0?.alarm, undefined);
  assert.equal(g.s0?.odds, undefined);
});

test("leave (behaviour MR 5): out now on many returns, soon on few, wait on none; a fighting stance doesn't wait", () => {
  assert.equal(localResponses.leave(touch({ mode: "return", returns: "many" })), "now");
  assert.equal(localResponses.leave(touch({ mode: "return", returns: "few" })), "soon");
  assert.equal(localResponses.leave(touch({ mode: "return", returns: "none" })), "wait");
  // Each ant's own stance (docs/stance.md): a crowded home with nothing coming back sends it out as a raid scout.
  assert.equal(localResponses.leave(touch({ mode: "return", returns: "none", crowd: "many" })), "raid");
  assert.equal(localResponses.leave(touch({ mode: "return", returns: "few", crowd: "many" })), "soon", "food coming back: forage");
  assert.equal(localResponses.leave(touch({ mode: "return", returns: "none", stance: "defend" })), "now");
  assert.equal(localResponses.leave(touch({ mode: "return", returns: "none", stance: "raid" })), "now", "a forager home on a raid stance goes out whatever comes back (MR 5)");
  // Raiding (behaviour MR 5.2): a raider home, in mode fight, goes on a scout's raid trail; without one it waits, and the scouts search.
  assert.equal(localResponses.leave(touch({ mode: "fight", stance: "raid", raid: "none" })), "wait");
  assert.equal(localResponses.leave(touch({ mode: "fight", stance: "raid", raid: "faint" })), "now");
  assert.equal(localResponses.leave(touch({ mode: "fight", stance: "raid", raid: "strong" })), "now");
  assert.equal(responseKey("leave", touch({ mode: "return", returns: "few" })), "return|none|-|-|out|none|clear|forage|returns:few|crowd:few", "a forager's key has its returns and its crowd");
  assert.equal(responseKey("leave", touch({ mode: "fight", stance: "raid", raid: "faint" })), "fight|none|-|-|out|none|clear|raid|raid:faint", "a raider's key has the raid trail, and no returns");
  assert.equal(responseKey("get", touch({ returns: "many" })), "explore|none|-|-|out|none|clear|forage", "the other lanes, never sent it, don't");
  type Ants = { ants: Record<string, Record<string, unknown>> };
  const l = (packResponseRequest("leave", [{ id: "s0", situation: touch({ mode: "return", returns: "few" }) }], "Gather food.").state as Ants).ants;
  assert.equal(l.s0?.returns, "few");
  assert.equal(l.s0?.crowd, "few");
  assert.equal(l.s0?.raid, undefined, "a forager is not sent the raid trail");
  const f = (packResponseRequest("leave", [{ id: "s0", situation: touch({ mode: "fight", stance: "raid", raid: "faint" }) }], "Gather food.").state as Ants).ants;
  assert.equal(f.s0?.raid, "faint");
  assert.equal(f.s0?.returns, undefined, "a raider is not sent its returns");
  assert.equal(f.s0?.crowd, undefined, "nor its crowd");
  const g = (packResponseRequest("trail", [{ id: "s0", situation: touch({ returns: "few" }) }], "Gather food.").state as Ants).ants;
  assert.equal(g.s0?.returns, undefined);
  assert.equal(g.s0?.raid, undefined, "only the leave lane is sent either");
  assert.equal(g.s0?.crowd, undefined);
});

test("leave (behaviour MR 5): a rested forager home waits until nestmates come home with food; a scout goes anyway", () => {
  // Ant 0 is home, rested, in "return". Ant 1, if there, comes home beside it with food once a second and puts it down.
  const run = (returns: boolean, scoutRate: number) => {
    const c = new Colony(corridor(0), { antCount: 2, maxAnts: 2, leaveGate: 1, scoutRate }, mulberry32(3));
    put(c, 0, 6, 6);
    c.mode[0] = 2; // return
    if (!returns) c.alive[1] = 0;
    for (let k = 0; k < 30 * 20; k++) {
      if (returns && k % 30 === 0) {
        c.x[1] = c.x[0]!;
        c.y[1] = c.y[0]!;
        c.carrying[1] = 1;
        c.mode[1] = 2;
      }
      c.tick(1 / 30);
      if (c.mode[0] !== 2) return k / 30;
    }
    return Infinity;
  };
  assert.equal(run(false, 0), Infinity, "with nobody coming home with food and no scouting, it waits, and stays in the nest");
  const met = run(true, 0);
  assert.ok(met < 10, `nestmates coming home with food send it out (${met.toFixed(1)} s)`);
  assert.ok(run(false, 5) < 2, "a high scout rate sends it out with no returns");
});
