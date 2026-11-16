import { test } from "node:test";
import assert from "node:assert/strict";
import { GameLoop, MAX_STEP, type FrameEnv } from "../gameLoop.ts";
import { buildGame } from "../useColony.ts";
import { DEFAULT_COLONY_CONTROLS } from "../useColony.ts";
import type { Journal } from "../../colony/index.ts";
import type { GameSettings } from "../saves.ts";

// The frame loop without React or a browser (ja-fnd.6.1): the page's requestAnimationFrame is a hand-driven env, so a test steps
// the clock and reads what the loop did. Before, this was one effect in useColony that tore itself down on every pause and speed change.

const SETTINGS: GameSettings = { species: DEFAULT_COLONY_CONTROLS.species, seed: 1, antCount: 8, rival: true, generation: 0 };

/** A frame source a test drives: `frame(ms)` runs the pending callback at that wall time. */
function fakeEnv(start = 1000) {
  let t = start;
  let cb: ((t: number) => void) | null = null;
  const calls = { request: 0, cancel: 0 };
  const env: FrameEnv = {
    now: () => t,
    request: (f) => {
      calls.request++;
      cb = f;
      return calls.request;
    },
    cancel: () => {
      calls.cancel++;
      cb = null;
    },
  };
  return {
    env,
    calls,
    pending: () => cb !== null,
    /** the next frame, `ms` of wall time later */
    frame(ms = 50) {
      assert.ok(cb, "a frame is pending");
      t += ms;
      const f = cb;
      cb = null;
      f(t);
    },
    frames(n: number, ms = 50) {
      for (let k = 0; k < n; k++) this.frame(ms);
    },
  };
}

function make(over: { playing?: boolean; speed?: number } = {}) {
  const game = buildGame(SETTINGS);
  const clock = fakeEnv();
  const flights: number[] = [];
  const frame = new Set<() => void>();
  const loop = new GameLoop(game, null, {
    playing: over.playing ?? true,
    speed: over.speed ?? 4,
    onFlight: () => flights.push(game.time),
    frame,
    env: clock.env,
  });
  return { game, clock, loop, flights, frame };
}

test("a frame steps the game by the wall time times the speed; paused, it does not", () => {
  const { game, clock, loop } = make({ speed: 4 });
  loop.start();
  const t0 = game.time;
  clock.frame(50);
  assert.ok(Math.abs(game.time - (t0 + 0.05 * 4)) < 1e-9, `0.05 s at 4×: ${game.time - t0}`);
  loop.set(false, 4);
  const t1 = game.time;
  clock.frames(3);
  assert.equal(game.time, t1, "paused: the clock stands still");
  loop.set(true, 2);
  clock.frame(50);
  assert.ok(Math.abs(game.time - (t1 + 0.05 * 2)) < 1e-9, "resumed at 2×");
});

test("a frame is stepped in pieces no longer than MAX_STEP, and a long frame counts at most 50 ms", () => {
  const { game, clock, loop } = make({ speed: 8 });
  loop.start();
  const ticks: number[] = [];
  const tick = game.tick.bind(game);
  game.tick = (dt: number) => (ticks.push(dt), tick(dt));
  clock.frame(5000); // a tab that was hidden
  assert.ok(Math.abs(ticks.reduce((a, b) => a + b, 0) - 0.05 * 8) < 1e-9, "clamped to 50 ms of wall time");
  assert.ok(ticks.length > 1 && ticks.every((d) => d <= MAX_STEP + 1e-12), `${ticks.length} steps, the longest ${Math.max(...ticks)}`);
});

test("play, pause and speed changes go on without stopping the loop (no cancel, one request a frame)", () => {
  const { clock, loop } = make();
  loop.start();
  clock.frame();
  loop.set(false, 4);
  loop.set(true, 8);
  loop.set(true, 1);
  clock.frames(2);
  assert.equal(clock.calls.cancel, 0, "nothing was torn down");
  assert.equal(clock.calls.request, 1 + 3, "the start's request and one per frame");
});

test("stop cancels the pending frame and stops the frames; start again goes on", () => {
  const { game, clock, loop } = make();
  loop.start();
  loop.start(); // twice: one loop
  assert.equal(clock.calls.request, 1);
  clock.frame();
  loop.stop();
  assert.equal(clock.calls.cancel, 1);
  assert.equal(clock.pending(), false);
  const t = game.time;
  loop.stop(); // twice: no second cancel
  assert.equal(clock.calls.cancel, 1);
  loop.start();
  clock.frame();
  assert.ok(game.time > t, "goes on after a restart");
});

test("the stats come at most every 150 ms; subscribers are told when they do", () => {
  const { clock, loop } = make();
  let told = 0;
  const off = loop.subscribe(() => told++);
  loop.start();
  assert.equal(loop.stats(), null, "none before the first frame");
  clock.frame(50);
  const first = loop.stats();
  assert.ok(first, "the first frame takes them (the clock is far past the last, 0)");
  assert.equal(told, 1);
  clock.frame(50);
  clock.frame(50);
  assert.equal(loop.stats(), first, "100 ms later: the same stats, no notice");
  assert.equal(told, 1);
  clock.frame(60);
  assert.notEqual(loop.stats(), first, "over 150 ms: new ones");
  assert.equal(told, 2);
  off();
  clock.frames(4, 200);
  assert.equal(told, 2, "unsubscribed: not told");
});

test("the frame count is told once a second", () => {
  const { clock, loop } = make();
  loop.start();
  clock.frames(20, 40); // 800 ms
  assert.equal(loop.fps(), 0);
  clock.frames(6, 40); // past a second
  assert.ok(loop.fps() >= 24 && loop.fps() <= 26, `about 25 frames: ${loop.fps()}`);
});

test("the pace is the speed asked at start and after a change, then the sim seconds a wall second", () => {
  const { clock, loop } = make({ speed: 4 });
  loop.start();
  clock.frame(50);
  assert.equal(loop.stats()!.pace, 4, "the speed asked, until the first second is measured");
  clock.frames(25, 50); // a second and more
  assert.ok(Math.abs(loop.stats()!.pace - 4) < 0.2, `measured: ${loop.stats()!.pace}`);
  loop.set(false, 4);
  clock.frame(200);
  assert.equal(loop.stats()!.pace, 0, "paused: no pace until the first second after");
  loop.set(true, 3);
  clock.frame(200);
  assert.equal(loop.stats()!.pace, 3, "a change starts the pace over, at the speed asked");
});

test("a new queen in the air pauses at once: the page is told, the stats are taken that frame, and no more steps are taken", () => {
  const { game, clock, loop, flights } = make();
  loop.start();
  clock.frame();
  const c = game.colonies[0]!;
  game.flights.push({ mother: 0, x: c.nest.x, y: c.nest.y, load: 0, strain: 0, at: game.time, food: 1 });
  const before = loop.stats();
  clock.frame(20); // under 150 ms since the last stats: they are taken anyway
  assert.equal(flights.length, 1, "the page is told once");
  assert.equal(loop.stats()!.flights, 1);
  assert.notEqual(loop.stats(), before);
  const t = game.time;
  clock.frames(3);
  assert.equal(game.time, t, "the loop stands until the page resumes it");
  assert.equal(flights.length, 1, "and does not tell again");
  loop.set(false, 4); // what the page does with the told pause: no change to the loop
  loop.set(true, 4);
  game.flights.length = 0;
  clock.frame();
  assert.ok(game.time > t, "resumed");
});

test("every frame calls the frame listeners, after the stats, in the order they were added, and a removed one is not called", () => {
  const { clock, loop, frame } = make();
  const order: string[] = [];
  let seenStats: unknown = "unset";
  frame.add(() => (order.push("a"), (seenStats = loop.stats())));
  frame.add(() => order.push("b"));
  const off = () => frame.delete([...frame][1]!);
  loop.start();
  clock.frame();
  assert.deepEqual(order, ["a", "b"]);
  assert.ok(seenStats, "the stats of this frame were taken before the listeners ran");
  off();
  clock.frame();
  assert.deepEqual(order, ["a", "b", "a"]);
});

test("the journal observes every step the loop takes", () => {
  const game = buildGame(SETTINGS);
  const clock = fakeEnv();
  let observed = 0;
  const journal = { observe: () => observed++ } as unknown as Journal;
  const loop = new GameLoop(game, journal, { playing: true, speed: 8, onFlight: () => {}, env: clock.env });
  const ticks: number[] = [];
  const tick = game.tick.bind(game);
  game.tick = (dt: number) => (ticks.push(dt), tick(dt));
  loop.start();
  clock.frame(50);
  assert.ok(ticks.length > 1);
  assert.equal(observed, ticks.length, "once after each tick");
  loop.set(false, 8);
  clock.frame(50);
  assert.equal(observed, ticks.length, "not while paused");
});

test("a stop from inside a frame (a listener) ends the loop: no further frame is requested", () => {
  const { clock, loop, frame } = make();
  frame.add(() => loop.stop());
  loop.start();
  clock.frame();
  assert.equal(clock.pending(), false, "no frame was asked for after the stop");
  assert.equal(clock.calls.request, 1);
});
