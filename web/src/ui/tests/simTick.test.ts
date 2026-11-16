import { test } from "node:test";
import assert from "node:assert/strict";
import { GameLoop } from "../gameLoop.ts";
import { gatedSubscribe } from "../statSelect.ts";
import { buildGame, DEFAULT_COLONY_CONTROLS } from "../useColony.ts";
import { fakeEnv } from "./fakeFrames.ts";

// The subscription behind useSimTick (ja-fnd.6.1, part 3; review of #274, S2): a component that draws on a schedule takes its pace from the
// loop's stats ticks. The hook is one effect around gatedSubscribe, so what it does is tested here, on a real GameLoop and a hand-driven frame source.

const SETTINGS = { species: DEFAULT_COLONY_CONTROLS.species, seed: 1, antCount: 8, rival: true, generation: 0 };

function started() {
  const clock = fakeEnv();
  const loop = new GameLoop(buildGame(SETTINGS), null, { playing: true, speed: 4, onFlight: () => {}, env: clock.env });
  loop.start();
  return { clock, loop };
}

test("it fires on the loop's ticks no more often than the gate allows, and the first tick fires at once", () => {
  const { clock, loop } = started();
  const at: number[] = [];
  gatedSubscribe(loop, 250, clock.env.now, () => at.push(clock.env.now()));
  assert.deepEqual(at, [], "nothing before a tick");
  clock.frames(100, 50); // 5 s of 20 Hz frames: the stats come about every 150-200 ms
  assert.ok(at.length > 5, `${at.length} fires in 5 s`);
  for (let k = 1; k < at.length; k++) {
    const gap = at[k]! - at[k - 1]!;
    assert.ok(gap >= 250, `gap ${gap} ms: never sooner than the gate`);
    assert.ok(gap <= 250 + 200, `gap ${gap} ms: rounded up to the next tick, not more`);
  }
});

test("the function it returns stops it, and leaves the loop with no subscriber of this", () => {
  const subs = new Set<() => void>();
  const fake = { subscribe: (fn: () => void) => (subs.add(fn), () => void subs.delete(fn)) };
  let fired = 0;
  const stop = gatedSubscribe(
    fake,
    0,
    () => 0,
    () => fired++,
  );
  assert.equal(subs.size, 1);
  for (const fn of subs) fn();
  assert.equal(fired, 1);
  stop();
  assert.equal(subs.size, 0, "unsubscribed from the loop (a new game's loop must not keep the old one's components)");
  stop(); // twice: harmless
});

test("each subscription has a gate of its own: a second one fires on its first tick whatever the first did", () => {
  const { clock, loop } = started();
  let a = 0;
  let b = 0;
  gatedSubscribe(loop, 1000, clock.env.now, () => a++);
  clock.frames(10, 50); // 500 ms: the first fired once
  assert.equal(a, 1);
  gatedSubscribe(loop, 1000, clock.env.now, () => b++);
  clock.frames(4, 50); // a tick or two later
  assert.equal(b, 1, "its own first tick fires at once");
  assert.equal(a, 1, "and the first one's gate is untouched by it");
});

test("a gate follows the clock it is given: a slower clock, fewer fires", () => {
  const { clock, loop } = started();
  let wall = 0;
  let n = 0;
  gatedSubscribe(
    loop,
    250,
    () => wall,
    () => n++,
  );
  clock.frames(40, 50); // the clock given never moves: only the first passes
  assert.equal(n, 1);
  wall += 300;
  clock.frames(4, 50);
  assert.equal(n, 2, "the clock moved past the gate: the next tick fires");
});
