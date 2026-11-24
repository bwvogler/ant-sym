import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CELL, cellOf, CURTAIN, FOUNDING_RESERVE, GENERIC_ANT, Game, gameRng, generateOneWorld, PLANE } from "../../colony/index.ts";
import { devHook, installDevHook, type DevDeps } from "../../dev/hook.ts";
import { REHEARSE_DT } from "../rehearse.ts";
import type { Followed } from "../follow.ts";
import { SensedMap } from "../fungusSight.ts";
import { AntTraces } from "../trace.ts";

// The dev hook on window.jevAnts (ja-fnd.6.2): what scripts/e2e-one-world.mjs calls, and what each call does. Until now only the e2e
// (about 150 s, in a browser) used it; a renamed or dropped method failed there, long after the change.

const ROOT = new URL("../../../../", import.meta.url).pathname;

const game = (): Game => new Game(generateOneWorld(1), { regrow: 0 }, gameRng(1), [{ antCount: 8 }, { antCount: 8 }]);

/** The hook over a real game and recording handles. */
function make(over: Partial<DevDeps> = {}) {
  const g = game();
  const calls: {
    followed: (Followed | null)[];
    notices: [string, string | undefined][];
    cameras: number[];
    nests: number[];
    pens: number;
  } = {
    followed: [],
    notices: [],
    cameras: [],
    nests: [],
    pens: 0,
  };
  const followed: { current: Followed | null } = { current: null };
  const deps: DevDeps = {
    game: g,
    settings: { species: GENERIC_ANT.id, seed: 1, antCount: 8, rival: true, generation: 0 },
    notify: (text, tone) => calls.notices.push([text, tone]),
    traces: { traces: [{ colony: 1, i: 4, xs: [0, 1, 2], end: "home" }] } as unknown as AntTraces,
    view: "above",
    followed,
    setFollowed: (f) => calls.followed.push(f),
    sensed: new SensedMap(),
    field: {
      current: {
        camera: (v) => (calls.cameras.push(v), { x: v } as never),
        goNest: (k) => void calls.nests.push(k),
      },
    },
    openPen: () => void calls.pens++,
    ...over,
  };
  return { g, calls, followed, deps, hook: devHook(deps) };
}

test("the hook has every name the e2e guard calls on window.jevAnts", () => {
  const script = readFileSync(join(ROOT, "scripts/e2e-one-world.mjs"), "utf8");
  // The guard reaches the hook as window.jevAnts.<name>, or destructures it (const { game } = window.jevAnts); any other form
  // (a bracket access, a hook passed on whole) could use a name this check can't see.
  const DESTRUCTURE = /const\s*\{([^}]*)\}\s*=\s*window\.jevAnts\b/g;
  const destructured = [...script.matchAll(DESTRUCTURE)].flatMap((m) =>
    m[1]!
      .split(",")
      .map((x) => x.split(":")[0]!.trim())
      .filter(Boolean),
  );
  assert.deepEqual(
    [...script.replace(DESTRUCTURE, "").matchAll(/jevAnts(?!\??\.\w)/g)],
    [],
    "a use of window.jevAnts the name check can't read",
  );
  const used = new Set([...script.matchAll(/jevAnts\??\.(\w+)/g)].map((m) => m[1]!).concat(destructured));
  assert.ok(used.size >= 10, `the guard calls ${used.size} names`);
  const names = new Set(Object.keys(make().hook));
  for (const n of used) assert.ok(names.has(n), `the guard calls window.jevAnts.${n}, which the hook lacks`);
});

test("follow: a live ant is followed with its generation; a dead or missing one is not", () => {
  const { g, calls, hook } = make();
  const c = g.colonies[0]!;
  assert.equal(hook.follow(0, 0), true);
  assert.deepEqual(calls.followed, [{ k: 0, i: 0, gen: c.gen[0] }]);
  c.alive[0] = 0;
  assert.equal(hook.follow(0, 0), false, "dead");
  assert.equal(hook.follow(9, 0), false, "no such colony");
  assert.equal(calls.followed.length, 1, "nothing followed for either");
});

test("view and followed read what the page gave; notify passes the text and tone on", () => {
  const { followed, calls, hook } = make();
  assert.equal(hook.view(), "above");
  assert.equal(hook.followed(), null);
  followed.current = { k: 1, i: 2, gen: 3 };
  assert.deepEqual(hook.followed(), { k: 1, i: 2, gen: 3 }, "read when asked, not when installed");
  hook.notify("hello", "good");
  hook.notify("again");
  assert.deepEqual(calls.notices, [
    ["hello", "good"],
    ["again", undefined],
  ]);
});

test("camera asks the field for the plane above and the curtain below, and null before the field is there; goNest passes the colony on", () => {
  const { calls, hook } = make();
  assert.deepEqual(hook.camera("above"), { x: PLANE });
  assert.deepEqual(hook.camera("below"), { x: CURTAIN });
  assert.deepEqual(calls.cameras, [PLANE, CURTAIN]);
  hook.goNest(1);
  assert.deepEqual(calls.nests, [1]);
  const none = make({ field: { current: null } }).hook;
  assert.equal(none.camera("above"), null);
  assert.equal(none.goNest(0), undefined);
});

test("step takes the game itself n rehearsal steps", () => {
  const { g, hook } = make();
  const t0 = g.time;
  hook.step(3);
  assert.ok(Math.abs(g.time - (t0 + 3 * REHEARSE_DT)) < 1e-9, `three steps: ${g.time - t0}`);
  hook.step();
  assert.ok(Math.abs(g.time - (t0 + 4 * REHEARSE_DT)) < 1e-9, "one by default");
});

test("fly sends a new queen from that colony, reveals the mother and opens the pen; no such colony does nothing", () => {
  const { g, calls, hook } = make();
  assert.equal(hook.fly(9), false);
  assert.equal(g.flights.length, 0);
  assert.equal(calls.pens, 0);
  assert.equal(hook.fly(1), true);
  assert.equal(calls.pens, 1);
  assert.equal(g.revealed[1], true);
  const f = g.flights[0]!;
  const m = g.colonies[1]!;
  assert.deepEqual(
    { mother: f.mother, x: f.x, y: f.y, load: f.load, food: f.food, at: f.at },
    { mother: 1, x: m.nest.x, y: m.nest.y, load: 1, food: FOUNDING_RESERVE, at: g.time },
  );
  assert.equal(hook.fly(), true, "mother 0 by default");
});

test("traces lists each moved ant's colony, slot, points and end", () => {
  assert.deepEqual(make().hook.traces(), [{ k: 1, i: 4, points: 3, end: "home" }]);
});

test("sensed asks the sight map for the cell under (x, y), on the plane above and the curtain below (review of #250, S1)", () => {
  const asked: [number, number, number][] = [];
  const { hook } = make({
    sensed: { sight: (l: number, gx: number, gy: number) => (asked.push([l, gx, gy]), 0.5) } as unknown as SensedMap,
  });
  cellOf(2, 3);
  const near = [CELL[0], CELL[1]];
  cellOf(40, 50);
  const far = [CELL[0], CELL[1]];
  assert.notDeepEqual(near, far);
  cellOf(0, 0); // leave the scratch cell elsewhere: a read that skips cellOf(x, y) sees this one
  assert.equal(hook.sensed("below", 40, 50), 0.5);
  assert.deepEqual(asked.at(-1), [CURTAIN, ...far]);
  assert.equal(hook.sensed("above", 2, 3), 0.5);
  assert.deepEqual(asked.at(-1), [PLANE, ...near]);
});

test("fog reads what the fungus knows of the ground at (x, y) of a view, and is null without the fog (ja-1ypq.3.6)", () => {
  const asked: [number, number, number][] = [];
  const { hook } = make({
    sensed: {
      knowledge: { stateAt: (l: number, x: number, y: number) => (asked.push([l, x, y]), 1) },
    } as unknown as SensedMap,
  });
  assert.equal(hook.fog("above", 2, 3), 1);
  assert.deepEqual(asked.at(-1), [PLANE, 2, 3]);
  assert.equal(hook.fog("below", 40, 50), 1);
  assert.deepEqual(asked.at(-1), [CURTAIN, 40, 50]);
  assert.equal(make().hook.fog("above", 2, 3), null, "a map with no knowledge: no fog");
});

test("fly's defaults: mother 0, and the fungus's strain rides in her (review of #250, N1)", () => {
  const { g, hook } = make();
  hook.fly();
  assert.equal(g.flights.at(-1)!.mother, 0, "mother 0 by default");
  assert.equal(g.flights.at(-1)!.strain, g.fungus.evolution?.strain ?? 0);
  Object.defineProperty(g.fungus, "evolution", { get: () => ({ strain: 2 }) }); // shadows the getter on this fungus
  hook.fly(1);
  assert.equal(g.flights.at(-1)!.strain, 2, "the strain of the fungus now");
});

test("installDevHook puts the hook on window.jevAnts, with the keys devHook builds (review of #250, D1)", () => {
  const w = globalThis as unknown as { window?: { jevAnts?: Record<string, unknown> } };
  const had = w.window;
  w.window = {};
  try {
    const { deps } = make();
    installDevHook(deps);
    const hook = w.window.jevAnts!;
    assert.ok(hook, "window.jevAnts is set");
    assert.deepEqual(Object.keys(hook).sort(), Object.keys(devHook(deps)).sort());
    assert.equal(hook.game, deps.game);
  } finally {
    if (had === undefined) delete w.window;
    else w.window = had;
  }
});
