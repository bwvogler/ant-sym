import { test } from "node:test";
import assert from "node:assert/strict";
import { centreX, centreY, CURTAIN, INFECTED, MODES, PLANE } from "../../colony/index.ts";
import { ALL_KEY, cues, listed, loadAll, loadSeen, newlyOpen, saveAll, saveSeen, SEEN_KEY, UNITY_SEEN, UNLOCK } from "../codex.ts";
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
