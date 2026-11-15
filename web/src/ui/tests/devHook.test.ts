import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CURTAIN, FOUNDING_RESERVE, GENERIC_ANT, Game, gameRng, generateOneWorld, PLANE } from "../../colony/index.ts";
import { devHook, type DevDeps } from "../../dev/hook.ts";
import { REHEARSE_DT } from "../rehearse.ts";
import type { Followed } from "../follow.ts";
import { SensedMap } from "../fungusSight.ts";
import { AntTraces } from "../trace.ts";

// The dev hook on window.jevAnts (ja-fnd.6.2): what scripts/e2e-one-world.mjs calls, and what each call does. Until now only the e2e
// (about 150 s, in a browser) used it; a renamed or dropped method failed there, long after the change.

const ROOT = new URL("../../../../", import.meta.url).pathname;

const game = (): Game => new Game(generateOneWorld(1), { antCount: 8, rivalAnts: 8, regrow: 0 }, gameRng(1));

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
  return { g, calls, followed, hook: devHook(deps) };
}

test("the hook has every name the e2e guard calls on window.jevAnts", () => {
  const script = readFileSync(join(ROOT, "scripts/e2e-one-world.mjs"), "utf8");
  const used = new Set([...script.matchAll(/jevAnts\??\.(\w+)/g)].map((m) => m[1]!));
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
