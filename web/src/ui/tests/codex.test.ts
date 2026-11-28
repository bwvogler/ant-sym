import { test } from "node:test";
import assert from "node:assert/strict";
import { centreX, centreY, CURTAIN, INFECTED, MODES, PLANE } from "../../colony/index.ts";
import {
  ALL_KEY,
  codexNumbers,
  cues,
  listed,
  loadAll,
  loadSeen,
  newlyOpen,
  saveAll,
  saveSeen,
  SEEN_KEY,
  UNITY_SEEN,
  UNLOCK,
} from "../codex.ts";
import { GUIDE } from "../guide.ts";
import { buildGame } from "../useColony.ts";

// The Codex (PRD §69.4): guide entries open as the game first shows what each is about, through the fungus's hosts.

const calm = { deaths: 0, unityGap: 1, mutations: 0 };

test("every guide entry has its cue and a hint, and every row names a guide entry", () => {
  for (const e of GUIDE) {
    const u = UNLOCK[e.id];
    assert.ok(u, `${e.id}: add its row to UNLOCK (which cue opens it, and the hint its locked card says)`);
    assert.ok(u.hint.length > 0, e.id);
  }
  const ids = new Set(GUIDE.map((e) => e.id));
  for (const id of Object.keys(UNLOCK)) assert.ok(ids.has(id), `UNLOCK names ${id}, which the guide has not`);
});

test("newlyOpen: the entries the cues open that were not seen, in order; an entry with no row opens at the start", () => {
  const ids = ["fungus", "jobs", "food-trail", "alarm", "made-up"];
  assert.deepEqual(newlyOpen(ids, new Set(), new Set(["start"])), ["fungus", "made-up"]);
  assert.deepEqual(newlyOpen(ids, new Set(["fungus", "made-up"]), new Set(["start", "host", "alarm"])), ["jobs", "alarm"]);
  assert.deepEqual(newlyOpen(ids, new Set(ids), new Set(["start", "host", "hostCarrying", "alarm"])), [], "seen stays seen");
});

test("the game's numbers: a death, the odours drawing together, a mutation to keep", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 30, rival: true, generation: 0 });
  assert.deepEqual([...cues(g.colonies, calm)], ["start"], "a new game: no host, nothing else");
  assert.ok(cues(g.colonies, { ...calm, deaths: 1 }).has("death"));
  assert.ok(cues(g.colonies, { ...calm, unityGap: UNITY_SEEN }).has("unity"));
  assert.ok(!cues(g.colonies, { ...calm, unityGap: UNITY_SEEN + 0.01 }).has("unity"));
  assert.ok(cues(g.colonies, { ...calm, mutations: 1 }).has("mutation"));
});

test("a host's cues: where it is, what it carries, what it does, the alarm where it stands", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 30, rival: true, generation: 0 });
  const c = g.colonies[1]!;
  const i = c.alive.indexOf(1);
  // An ant that is not a host shows nothing, whatever it does.
  c.carrying[i] = 1;
  assert.ok(!cues(g.colonies, calm).has("hostCarrying"));
  c.load[i] = INFECTED;
  const below = cues(g.colonies, calm);
  assert.equal(c.layer[i], CURTAIN, "ants start underground");
  for (const k of ["host", "hostCarrying", "hostBelow"] as const) assert.ok(below.has(k), k);
  for (const k of ["hostOut", "hostFighting", "hostTired", "alarm"] as const) assert.ok(!below.has(k), k);

  const h = c.holeCells[1]!;
  c.putAnt(i, PLANE, centreX(h.px + 3, h.py), centreY(h.py));
  c.carrying[i] = 0;
  c.mode[i] = MODES.indexOf("fight");
  assert.ok(!cues(g.colonies, calm).has("hostFighting"), "the policy's fight mode is not a fight (review of #206, S1)");
  c.foes[i] = 1; // strangers met (battle.ts)
  c.tired[i] = 1;
  const out = cues(g.colonies, calm);
  for (const k of ["hostOut", "hostFighting", "hostTired"] as const) assert.ok(out.has(k), k);
  assert.ok(!out.has("hostBelow") && !out.has("hostCarrying"));
  // Alarm where the host stands, from either colony, past what the field shows.
  const other = g.colonies[0]!.layers[PLANE]!.ph.fields.alarm;
  other.set(c.cellX[i]!, c.cellY[i]!, 0.17);
  assert.ok(!cues(g.colonies, calm).has("alarm"), "under the field's threshold (0.18): not shown, not seen");
  other.set(c.cellX[i]!, c.cellY[i]!, 0.5);
  assert.ok(cues(g.colonies, calm).has("alarm"));
  other.set(c.cellX[i]!, c.cellY[i]!, 0);

  // A dead host shows nothing: a dead slot keeps its load (review of #206, S2).
  c.alive[i] = 0;
  assert.deepEqual([...cues(g.colonies, calm)], ["start"]);
});

test("below, the alarm is the curtain's at the host's cell, not the plane's (review of #206, S2)", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 30, rival: true, generation: 0 });
  const c = g.colonies[0]!;
  const i = c.alive.indexOf(1);
  c.load[i] = INFECTED;
  assert.equal(c.layer[i], CURTAIN);
  const [x, y] = [c.cellX[i]!, c.cellY[i]!];
  g.colonies[1]!.layers[PLANE]!.ph.fields.alarm.set(x, y, 5);
  assert.ok(!cues(g.colonies, calm).has("alarm"), "alarm on the plane at the same cell numbers: not where the host is");
  g.colonies[1]!.layers[CURTAIN]!.ph.fields.alarm.set(x, y, 5);
  assert.ok(cues(g.colonies, calm).has("alarm"));
});

/** A localStorage stand-in; `broken` throws on every call, as blocked storage can. */
function fakeStorage(broken = false) {
  const m = new Map<string, string>();
  const fail = () => {
    throw new Error("blocked");
  };
  return {
    getItem: (k: string) => (broken ? fail() : (m.get(k) ?? null)),
    setItem: (k: string, v: string) => (broken ? fail() : void m.set(k, v)),
    removeItem: (k: string) => (broken ? fail() : void m.delete(k)),
    m,
  };
}

test("what is seen, and the show-all switch, outlive the page; missing, blocked or bad storage starts empty", () => {
  const st = fakeStorage();
  saveSeen(() => st, new Set(["jobs", "alarm"]));
  assert.deepEqual([...loadSeen(() => st)].sort(), ["alarm", "jobs"]);
  assert.equal(
    loadAll(() => st),
    false,
  );
  saveAll(() => st, true);
  assert.equal(st.m.get(ALL_KEY), "1");
  assert.equal(
    loadAll(() => st),
    true,
  );
  saveAll(() => st, false);
  assert.equal(st.m.has(ALL_KEY), false);

  st.m.set(SEEN_KEY, "{not json");
  assert.deepEqual([...loadSeen(() => st)], []);
  st.m.set(SEEN_KEY, JSON.stringify(["jobs", 7, null]));
  assert.deepEqual([...loadSeen(() => st)], ["jobs"], "only names are kept");

  const broken = fakeStorage(true);
  assert.deepEqual([...loadSeen(() => broken)], []);
  assert.equal(
    loadAll(() => broken),
    false,
  );
  assert.doesNotThrow(() => saveSeen(() => broken, new Set(["x"])));
  assert.doesNotThrow(() => saveAll(() => broken, true));
  assert.deepEqual([...loadSeen(() => null)], []);
});

test("one notice names what opened together", () => {
  assert.equal(listed(["Home trail"]), "Home trail");
  assert.equal(listed(["Home trail", "Choosing a branch"]), "Home trail and Choosing a branch");
  assert.equal(listed(["a", "b", "c"]), "a, b and c");
  assert.equal(listed([]), "");
});

test("the game's numbers from the page's stats: the odours' gap only while two colonies stand (review of #206, N4, N9)", () => {
  const side = (population: number, losses = 0) => ({ population, losses });
  assert.deepEqual(codexNumbers(null), { deaths: 0, unityGap: 1, mutations: 0 }, "before the first stats");
  const st = { sides: [side(40, 2), side(30, 1)], unity: { gap: 0.4 }, evolution: { mutations: 3 } };
  assert.deepEqual(codexNumbers(st), { deaths: 3, unityGap: 0.4, mutations: 3 });
  // A wipe-out: Game.unity's gap is 0 once fewer than two stand; that is not the odours drawing together.
  assert.equal(codexNumbers({ ...st, sides: [side(40), side(0, 30)], unity: { gap: 0 } }).unityGap, 1);
  assert.equal(codexNumbers({ ...st, sides: [side(40), side(0), side(12)] }).unityGap, 0.4, "a third colony still standing: two stand");
  assert.equal(codexNumbers({ ...st, evolution: null }).mutations, 0);
});

test("the unity cue scales with the odour space: the gap starts at sqrt(axes), and 0.9 of that, not 0.9, is drawing together (ja-zg1u.8)", () => {
  const g = buildGame({ species: "generic", seed: 3, antCount: 30, rival: true, generation: 0 });
  const K4 = { deaths: 0, mutations: 0, span: 2 };
  assert.ok(!cues(g.colonies, { ...K4, unityGap: 2 }).has("unity"), "the start: the gap is the span");
  assert.ok(!cues(g.colonies, { ...K4, unityGap: 1.81 }).has("unity"));
  assert.ok(cues(g.colonies, { ...K4, unityGap: 1.8 }).has("unity"), "0.9 of 2");
  // At the old reading (1 at the start, 0.9 to fire) a four-axis game's gap of 1.5 was already 'drawing together': 1.9 is not now.
  assert.ok(!cues(g.colonies, { ...K4, unityGap: 1.9 }).has("unity"));
  // One axis, with or without a span: as it was.
  assert.ok(cues(g.colonies, { deaths: 0, mutations: 0, unityGap: 0.9, span: 1 }).has("unity"));
  assert.ok(!cues(g.colonies, { deaths: 0, mutations: 0, unityGap: 0.91, span: 1 }).has("unity"));
  assert.ok(cues(g.colonies, { ...calm, unityGap: UNITY_SEEN }).has("unity"));
  assert.ok(!cues(g.colonies, { ...calm, unityGap: UNITY_SEEN + 0.01 }).has("unity"));
});

test("the Codex's numbers from the stats carry the span, and a lone colony's gap reads as the span (no cue), not 1", () => {
  const side = (population: number, losses = 0) => ({ population, losses });
  const st = { sides: [side(40), side(0, 30)], unity: { gap: 0 }, evolution: null };
  assert.deepEqual(codexNumbers(null, 2), { deaths: 0, unityGap: 2, mutations: 0, span: 2 });
  assert.equal(codexNumbers(st, 2).unityGap, 2, "a wipe-out is not the odours drawing together at four axes either");
  assert.deepEqual(codexNumbers(st), { deaths: 30, unityGap: 1, mutations: 0 }, "one axis: no span key, as before");
});
