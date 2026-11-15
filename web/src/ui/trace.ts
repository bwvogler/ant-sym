// A moved ant's way home, drawn on the top view (docs/builder.md "Slice 2", ja-cwjp): after the tweezers set an ant down,
// its walk is recorded frame by frame, the run of its old vector in one stroke and its search loops in another, until
// it goes down a hole or dies; then the line fades. This is the displaced-ant experiment (Wehner & Srinivasan 1981)
// made visible to a child. Pure: it reads the game and the builder, never changes them, and holds no DOM.

import { PLANE, type Builder } from "../colony/index.ts";

/** A new point once the ant is this far (world units) from the last one. */
export const TRACE_STEP = 0.5;
/** Points kept a trace at most: past it, every second point is dropped (the line keeps its shape, coarser). */
export const TRACE_MAX = 2000;
/** How long a finished trace stays, fading, in milliseconds. */
export const TRACE_FADE_MS = 10_000;

export interface Trace {
  colony: number;
  i: number;
  gen: number;
  /** the builder's move count when it was set down: a new one means it was carried again, and the trace starts over */
  move: number;
  xs: number[];
  ys: number[];
  /** 1 where the ant was searching (its vector run out), 0 on its vector's run */
  search: number[];
  /** when it ended (the `now` given to update), or null while it walks */
  done: number | null;
  /** how it ended: down a hole (home) or dead */
  end: "home" | "lost" | null;
}

export class AntTraces {
  readonly #builder: Builder;
  #traces: Trace[] = [];

  constructor(builder: Builder) {
    this.#builder = builder;
  }

  get traces(): readonly Trace[] {
    return this.#traces;
  }

  /** Record a frame: a point for each moved ant still walking; end, fade and drop the rest. `now`: a clock in ms. */
  update(now: number): void {
    const game = this.#builder.game;
    const moved = this.#builder.moved();
    for (const m of moved) {
      const t = this.#traces.find((x) => x.colony === m.colony && x.i === m.i && x.gen === m.gen);
      if (t && t.move === m.move) continue;
      // Set down (again): its way home starts here.
      const fresh: Trace = { colony: m.colony, i: m.i, gen: m.gen, move: m.move, xs: [], ys: [], search: [], done: null, end: null };
      if (t) this.#traces[this.#traces.indexOf(t)] = fresh;
      else this.#traces.push(fresh);
    }
    this.#traces = this.#traces.filter((t) => {
      if (t.done !== null) return now - t.done < TRACE_FADE_MS;
      const c = game.colonies[t.colony];
      if (!c || !c.alive[t.i] || c.gen[t.i] !== t.gen) {
        t.done = now;
        t.end = "lost";
        return true;
      }
      if (c.layer[t.i] !== PLANE) {
        t.done = now;
        t.end = "home";
        return true;
      }
      // Still on the plane but no longer moved: the move was undone. Nothing to show.
      if (!moved.some((m) => m.colony === t.colony && m.i === t.i && m.gen === t.gen)) return false;
      const x = c.x[t.i]!;
      const y = c.y[t.i]!;
      const n = t.xs.length;
      if (n && Math.hypot(x - t.xs[n - 1]!, y - t.ys[n - 1]!) < TRACE_STEP) return true;
      t.xs.push(x);
      t.ys.push(y);
      t.search.push(c.search[t.i] !== 0 ? 1 : 0);
      if (t.xs.length > TRACE_MAX) thin(t);
      return true;
    });
  }
}

/** Drop every second point but the first and the last. */
function thin(t: Trace): void {
  const keep = (_: number, k: number, a: readonly number[]) => k % 2 === 0 || k === a.length - 1;
  t.xs = t.xs.filter(keep);
  t.ys = t.ys.filter(keep);
  t.search = t.search.filter(keep);
}

/** A trace's opacity at `now`: 1 while it walks, then fading to 0 over TRACE_FADE_MS. */
export function traceAlpha(t: Trace, now: number): number {
  return t.done === null ? 1 : Math.max(0, 1 - (now - t.done) / TRACE_FADE_MS);
}
