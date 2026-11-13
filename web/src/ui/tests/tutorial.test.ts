import { test } from "node:test";
import assert from "node:assert/strict";
import { CURTAIN, PLANE } from "../../colony/index.ts";
import {
  AFTER_SPEED,
  begin,
  cardFor,
  FAST_SPEED,
  faster,
  firstHost,
  markTutorialDone,
  next,
  observe,
  seenOf,
  TUTORIAL_SPEED,
  WATCH_SPEED,
  tutorialDone,
  WATCH_LIMIT,
  type Seen,
  type Tutorial,
} from "../tutorial.ts";
import { buildGame, GAME_SPEED, GAME_STRAIN, landingColony, landingOf, MAX_SPEED } from "../useColony.ts";

// The tutorial's machine (ja-7x4, PRD §61), driven by hand-made frames: what each step waits for and what it asks the page.

const host = { k: 0, i: 7, gen: 3 };
const frame = (p: Partial<Seen> = {}): Seen => ({ time: 0, candidate: null, host: null, hosts: 0, ...p });
const watching = (): Tutorial => ({ ...begin(), step: "watch", host, watchFrom: 10 });

test("the landing waits for the player, then plays at 1×", () => {
  const t = begin();
  assert.equal(observe(t, frame({ candidate: host })).t, t, "the landing card does not move on by itself");
  const r = next(t, 0);
  assert.equal(r.t.step, "waiting");
  assert.deepEqual(r.effect, { playing: true, speed: TUTORIAL_SPEED });
});

test("the first host found pauses the game and is followed", () => {
  const t = { ...begin(), step: "waiting" as const };
  assert.equal(observe(t, frame()).t, t, "no host yet: nothing happens");
  const r = observe(t, frame({ candidate: host }));
  assert.equal(r.t.step, "host");
  assert.deepEqual(r.t.host, host);
  assert.deepEqual(r.effect, { playing: false, follow: host });
  const w = next(r.t, 12);
  assert.equal(w.t.step, "watch");
  assert.equal(w.t.watchFrom, 12);
  assert.deepEqual(
    w.effect,
    { playing: true, speed: WATCH_SPEED, follow: host },
    "Follow it follows again, in case the player let go; the watch runs at 4×",
  );
});

test("watching ends when the host is clean, and says how many carry the fungus then", () => {
  const r = observe(watching(), frame({ time: 40, host: { alive: true, load: 0, layer: PLANE }, hosts: 5 }));
  assert.equal(r.t.step, "cleared");
  assert.equal(r.t.hosts, 5);
  assert.deepEqual(r.effect, { playing: false });
  assert.match(cardFor(r.t).body.join(" "), /5 other Ink ants carry you now/);
  // One other carrier when the host is clean; at the limit the host itself is still one of the count.
  assert.match(cardFor({ ...r.t, hosts: 1 }).body.join(" "), /1 other Ink ant carries you now/);
  assert.match(cardFor({ ...r.t, step: "timeout", hosts: 1 }).body.join(" "), /mycelium by the hole/);
});

test("a host still carrying a little is not clean", () => {
  assert.equal(observe(watching(), frame({ time: 40, host: { alive: true, load: 0.001, layer: PLANE } })).t.step, "watch");
});

test("watching ends when the host dies", () => {
  assert.equal(observe(watching(), frame({ time: 40, host: { alive: false, load: 0, layer: PLANE } })).t.step, "died");
});

test("watching ends at the limit with the host still carrying it", () => {
  const live = { alive: true, load: 0.2, layer: PLANE };
  assert.equal(observe(watching(), frame({ time: 10 + WATCH_LIMIT - 0.1, host: live })).t.step, "watch");
  assert.equal(observe(watching(), frame({ time: 10 + WATCH_LIMIT, host: live })).t.step, "timeout");
});

test("a host that goes below is noted on the card, once, without leaving the watch", () => {
  const r = observe(watching(), frame({ time: 20, host: { alive: true, load: 0.2, layer: CURTAIN } }));
  assert.equal(r.t.step, "watch");
  assert.equal(r.t.below, true);
  assert.equal(r.effect, undefined, "no pause: the follow carries the camera across");
  assert.match(cardFor(r.t).body.join(" "), /down the hole/);
});

test("Faster only while the game decides, and only until the next card", () => {
  const f = faster(watching());
  assert.equal(f.t.fast, true);
  assert.deepEqual(f.effect, { speed: FAST_SPEED });
  assert.deepEqual(faster(begin()).effect, {}, "not on a paused card");
  const done = observe(f.t, frame({ time: 40, host: { alive: true, load: 0, layer: PLANE } }));
  assert.equal(done.t.fast, false);
});

test("the outcome card leads to the aim, and the aim's button ends it at the game's own speed", () => {
  const aim = next({ ...watching(), step: "cleared" }, 50);
  assert.equal(aim.t.step, "aim");
  assert.equal(cardFor(aim.t).highlight, "aim");
  const end = next(aim.t, 50);
  assert.equal(end.t.step, "done");
  assert.deepEqual(end.effect, { playing: true, speed: AFTER_SPEED, done: true });
});

test("the done flag: kept in storage, and a storage that throws just shows the tutorial again", () => {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.equal(tutorialDone(store), false);
  markTutorialDone(store);
  assert.equal(tutorialDone(store), true);
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(tutorialDone(broken), false);
  assert.doesNotThrow(() => markTutorialDone(broken));
  assert.equal(tutorialDone(null), false);
});

test("the seed chooses the colony the fungus lands by: none is the player's (PRD §65)", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((s) => landingColony(s, 2)),
    [1, 0, 1, 0],
  );
  assert.equal(landingColony(7, 1), 0, "one colony: that one");
  const g = buildGame({ species: "generic", seed: 3, antCount: 50, rival: true, generation: 0 });
  assert.equal(landingOf(g), 1, "before the landing, the seed's colony");
  g.land(0, GAME_STRAIN, { evolve: true });
  assert.equal(landingOf(g), 0, "after it, where it landed");
});

test("in a real game the first host is found within seconds of the landing, and is the tutorial's whether followed or not", () => {
  // Seed 1 lands by the second colony (Amber): the tutorial follows whichever the fungus is in.
  const g = buildGame({ species: "generic", seed: 1, antCount: 100, rival: true, generation: 0 });
  const k = landingOf(g);
  assert.equal(k, 1);
  g.land(k, GAME_STRAIN, { evolve: true });
  let t: Tutorial = { ...begin(), step: "waiting" };
  for (let k = 0; k < 30 * 30 && t.step === "waiting"; k++) {
    g.tick(1 / 30);
    t = observe(t, seenOf(g, t)).t;
  }
  assert.equal(t.step, "host", "a host within 30 s");
  const c = g.colonies[k]!;
  assert.deepEqual(t.host, firstHost(c, k));
  // Nothing on the page follows it here: the tutorial reads its own host, so it is alive and carrying the fungus.
  const s = seenOf(g, { ...t, step: "watch" });
  assert.equal(s.host?.alive, true);
  assert.ok((s.host?.load ?? 0) > 0);
  assert.ok(s.hosts >= 1, "the host is counted among the ants carrying the fungus");
  // Its slot taken by a newborn (another generation) is another ant: the host is gone, not clean.
  const reborn = seenOf(g, { ...t, step: "watch", host: { ...t.host!, gen: t.host!.gen + 1 } });
  assert.equal(reborn.host?.alive, false);
});

test("the tutorial's copies of the page's speeds match them: back to the game's speed, Faster at the top speed", () => {
  assert.equal(AFTER_SPEED, GAME_SPEED);
  assert.equal(FAST_SPEED, MAX_SPEED);
});
