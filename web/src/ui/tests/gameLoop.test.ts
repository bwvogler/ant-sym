import { test } from "node:test";
import assert from "node:assert/strict";
import { GameLoop, MAX_STEP } from "../gameLoop.ts";
import { fakeEnv } from "./fakeFrames.ts";
import { buildGame, DEFAULT_COLONY_CONTROLS } from "../useColony.ts";
import type { Journal } from "../../colony/index.ts";
import { decisionsOf } from "../stats.ts";
import type { GameSettings } from "../saves.ts";

// The frame loop without React or a browser (ja-fnd.6.1): the page's requestAnimationFrame is a hand-driven env, so a test steps
// the clock and reads what the loop did. Before, this was one effect in useColony that tore itself down on every pause and speed change.

const SETTINGS: GameSettings = { species: DEFAULT_COLONY_CONTROLS.species, seed: 1, antCount: 8, rival: true, generation: 0 };

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

/** The ticks a game takes (its dt each), recorded. */
function recordTicks(game: { tick(dt: number): void }): number[] {
  const ticks: number[] = [];
  const tick = game.tick.bind(game);
  game.tick = (dt: number) => (ticks.push(dt), tick(dt));
  return ticks;
}

test("a frame that is not a whole number of MAX_STEPs is cut into equal pieces that add up to dt times the speed (review of #270, S2)", () => {
  const { game, clock, loop } = make({ speed: 3 });
  loop.start();
  const ticks = recordTicks(game);
  clock.frame(30); // 0.09 s of sim: 3 steps of 0.03
  assert.equal(ticks.length, 3);
  assert.ok(Math.abs(ticks.reduce((a, b) => a + b, 0) - 0.09) < 1e-9, `${ticks}`);
  assert.ok(ticks.every((d) => Math.abs(d - 0.03) < 1e-9));
});

test("the first frame after start counts the time since start, not the clamp; a frame stamped before it steps nothing (review of #270, S2)", () => {
  const { game, clock, loop } = make({ speed: 1 });
  loop.start();
  const t0 = game.time;
  clock.frame(16);
  assert.ok(Math.abs(game.time - (t0 + 0.016)) < 1e-9, `16 ms at 1×: ${game.time - t0}`);
  const t1 = game.time;
  clock.frame(-40); // a frame stamped earlier than the last
  assert.equal(game.time, t1, "the sim never steps backwards");
});

test("choicesPerSecond is the colonies' decisions over the sim time, per second: 0 until a sim second has passed, then measured; 0 again after a pause", () => {
  const { game, clock, loop } = make({ speed: 4 });
  loop.start();
  clock.frame(50);
  assert.equal(loop.stats()!.choicesPerSecond, 0, "none before the first sim second");
  const d0 = decisionsOf(game);
  const t0 = game.time;
  clock.frames(30, 50); // 1.5 s wall, 6 s sim
  const rate = loop.stats()!.choicesPerSecond;
  assert.ok(rate > 0, `measured: ${rate}`);
  // the stats are taken every 150 ms: the rate is of the last whole sim second, so it can't exceed all the decisions over all the time
  assert.ok(rate <= (decisionsOf(game) - d0) / 1 + 1e-9 && game.time - t0 > 5);
  const per = (decisionsOf(game) - d0) / (game.time - t0);
  assert.ok(rate > per / 3 && rate < per * 3, `${rate} against the mean ${per}`);
  loop.set(false, 4);
  clock.frame(200);
  assert.equal(loop.stats()!.choicesPerSecond, 0, "a pause starts the rate over, as the sim stands still");
});

test("the rate is exactly the decisions over the sim time of its last window, a sim second at least: checked against a count kept beside the loop", () => {
  const { game, clock, loop } = make({ speed: 4 });
  loop.start();
  let at = { t: game.time, d: decisionsOf(game) };
  let expected = 0;
  let checked = 0;
  let prev = loop.stats();
  for (let k = 0; k < 120; k++) {
    clock.frame(50);
    if (game.time - at.t >= 1) {
      expected = (decisionsOf(game) - at.d) / (game.time - at.t);
      at = { t: game.time, d: decisionsOf(game) };
    }
    if (loop.stats() !== prev) {
      assert.equal(loop.stats()!.choicesPerSecond, expected, `frame ${k}`);
      prev = loop.stats();
      checked++;
    }
  }
  assert.ok(checked > 20 && expected > 0, `${checked} stats checked, the last rate ${expected}`);
});

test("the pace is measured each wall second, not only the first: steady over two windows, then the new speed's after a change (review of #270, S2)", () => {
  const { clock, loop } = make({ speed: 4 });
  loop.start();
  clock.frames(45, 50); // two windows and a bit
  assert.ok(Math.abs(loop.stats()!.pace - 4) < 0.2, `the second window: ${loop.stats()!.pace}`);
  loop.set(true, 2);
  clock.frames(25, 50);
  assert.ok(Math.abs(loop.stats()!.pace - 2) < 0.2, `after the change: ${loop.stats()!.pace}`);
});

test("a change of play or speed starts the windows over: stats on the next frame, frame count and pace from now; an unchanged set does nothing", () => {
  const { clock, loop } = make({ speed: 4 });
  loop.start();
  clock.frames(30, 50);
  const stats = loop.stats();
  loop.set(true, 4); // the page's echo after a flight pause: nothing changes
  clock.frame(20);
  assert.equal(loop.stats(), stats, "an unchanged set neither resets the cadence nor takes stats at once");
  loop.set(true, 6);
  clock.frame(20); // 20 ms after the last frame, far under 150 ms: the stats come anyway
  assert.notEqual(loop.stats(), stats);
  assert.equal(loop.stats()!.pace, 6);
});

test("the frame count restarts with start and with a change, and counts every second after the first", () => {
  const { clock, loop } = make();
  loop.start();
  clock.frames(26, 40); // a second and a bit
  const a = loop.fps();
  assert.ok(a >= 24 && a <= 26, `${a}`);
  clock.frames(26, 40);
  assert.ok(loop.fps() >= 24 && loop.fps() <= 26, `the second second: ${loop.fps()}`);
  clock.frames(10, 40); // frames of the next second already counted
  loop.set(true, 5);
  clock.frames(26, 40);
  assert.ok(loop.fps() >= 24 && loop.fps() <= 26, `from the change, not from before it: ${loop.fps()}`);
  loop.stop();
  loop.start();
  clock.frames(26, 40);
  assert.ok(loop.fps() >= 24 && loop.fps() <= 26, `from the restart: ${loop.fps()}`);
});

test("subscribers hear a frame count change as well as the stats, and before the frame listeners run", () => {
  const { clock, loop, frame } = make();
  const order: string[] = [];
  loop.subscribe(() => order.push("told"));
  frame.add(() => order.push("listener"));
  loop.start();
  clock.frame(1100); // stats and a frame count in the one frame
  assert.deepEqual(order, ["told", "listener"], "told once, then the listeners");
  order.length = 0;
  clock.frame(1100);
  assert.equal(order[0], "told");
});

test("a new loop for a new game shows the stats and frame count of the one before until its first frame (they were React state)", () => {
  const first = make();
  first.loop.start();
  first.clock.frames(30, 50);
  const second = new GameLoop(buildGame({ ...SETTINGS, seed: 2 }), null, {
    playing: true,
    speed: 4,
    onFlight: () => {},
    env: fakeEnv().env,
    carry: first.loop,
  });
  assert.equal(second.stats(), first.loop.stats());
  assert.equal(second.fps(), first.loop.fps());
  assert.ok(second.stats());
  const none = new GameLoop(buildGame(SETTINGS), null, { playing: true, speed: 4, onFlight: () => {}, env: fakeEnv().env });
  assert.equal(none.stats(), null, "no loop before: nothing to show");
  assert.equal(none.fps(), 0);
});

test("a frame count that changes with no new stats is still told (the stats came 20 ms before)", () => {
  const { clock, loop } = make();
  let told = 0;
  loop.subscribe(() => told++);
  loop.start();
  clock.frame(990); // the stats; the frame count's second is not over
  assert.equal(told, 1);
  clock.frame(20); // 1010 ms since start: the frame count, and no stats
  assert.equal(told, 2, "told of the frame count alone");
  assert.equal(loop.fps(), 2);
});

test("onStep runs after every sim step, not every frame; paused it does not; unsubscribed it stops (the fog's sight keeps up with the sim)", () => {
  const { game, clock, loop } = make({ speed: 8 });
  let steps = 0;
  const times: number[] = [];
  const off = loop.onStep(() => (steps++, times.push(game.time)));
  let ticks = 0;
  const tick = game.tick.bind(game);
  game.tick = (dt: number) => (ticks++, tick(dt));
  loop.start();
  clock.frame(50); // 0.4 s of sim in several steps
  assert.ok(ticks > 1, `${ticks} ticks in one frame`);
  assert.equal(steps, ticks, "one call per tick, after it");
  assert.ok(
    times.every((t, i) => i === 0 || t > times[i - 1]!),
    "each after its own tick",
  );
  loop.set(false, 8);
  const before = steps;
  clock.frames(3);
  assert.equal(steps, before, "paused: no steps");
  loop.set(true, 8);
  off();
  clock.frame(50);
  assert.equal(steps, before, "unsubscribed");
});

test("advance steps the game by hand and runs the step subscribers: the Lab's step control goes through it", () => {
  const { game, loop } = make();
  let steps = 0;
  loop.onStep(() => steps++);
  const t0 = game.time;
  loop.advance(MAX_STEP);
  loop.advance(MAX_STEP);
  assert.equal(steps, 2);
  assert.ok(Math.abs(game.time - (t0 + 2 * MAX_STEP)) < 1e-9);
});
