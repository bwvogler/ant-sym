import assert from "node:assert/strict";
import type { FrameEnv } from "../gameLoop.ts";

// A frame source a test drives by hand (ui/gameLoop.ts takes it as its env): shared by the loop's tests and the tick gate's.

/** A frame source a test drives: `frame(ms)` runs the pending callback at that wall time. */
export function fakeEnv(start = 1000) {
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
