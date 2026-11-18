// D1: fixed-patch departure baseline (PRD §85). No departure action is implemented here.
import { Colony } from "./colony.ts";
import { CELL, cellOf, centreX, centreY } from "./hex.ts";
import { responses } from "./responses.ts";
import { OPEN, ROCK, worldFromArrays, mulberry32 } from "./world.ts";

export const DEPARTURE_GEOMETRIES = ["open", "corridor", "broad", "blocked"] as const;
export type DepartureGeometry = (typeof DEPARTURE_GEOMETRIES)[number];
export interface DepartureEpisode {
  ticks: number;
  path: number;
  radius: number;
  end: "exit" | "death" | "boundary";
}

/** Measures membership in a fixed footprint, never presence of food. One call per tick. */
export class DepartureProbe {
  readonly episodes: DepartureEpisode[] = [];
  private active: { ticks: number; path: number; radius: number; x: number; y: number; startX: number; startY: number } | null = null;
  sample(inside: boolean, x: number, y: number, alive = true): void {
    if (!alive || !inside) {
      if (this.active) {
        // Include the final step out, but not a death/slot-reuse displacement.
        if (alive) this.move(x, y);
        this.finish(alive ? "exit" : "death");
      }
      return;
    }
    if (!this.active) this.active = { ticks: 0, path: 0, radius: 0, x, y, startX: x, startY: y };
    this.move(x, y);
    this.active!.ticks++;
  }
  private move(x: number, y: number): void {
    const a = this.active!;
    a.path += Math.hypot(x - a.x, y - a.y);
    a.radius = Math.max(a.radius, Math.hypot(x - a.startX, y - a.startY));
    a.x = x;
    a.y = y;
  }
  finish(end: DepartureEpisode["end"] = "boundary"): void {
    if (!this.active) return;
    const { ticks, path, radius } = this.active;
    this.episodes.push({ ticks, path, radius, end });
    this.active = null;
  }
}

/** Single-ant motor assay, not a whole-colony fitness assay. Refuse every food offer. */
export function runDepartureBaseline(seed: number, geometry: DepartureGeometry, seconds = 30, observe = true) {
  if (!Number.isInteger(seed) || seed < 1 || !DEPARTURE_GEOMETRIES.includes(geometry) || !Number.isFinite(seconds) || seconds <= 0)
    throw new Error("invalid departure assay arguments");
  const w = 60,
    h = 36,
    cx = 30,
    cy = 18;
  const rock = new Uint8Array(w * h),
    food = new Float32Array(w * h),
    footprint = new Set<number>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const blocked =
        geometry === "corridor" ? Math.abs(y - cy) > 1 : geometry === "blocked" ? Math.abs(x - cx) > 3 || Math.abs(y - cy) > 3 : false;
      rock[y * w + x] = edge || blocked ? ROCK : OPEN;
      const radius = geometry === "broad" ? 7 : geometry === "blocked" ? 3 : 2;
      if (rock[y * w + x] === OPEN && Math.abs(x - cx) <= radius && Math.abs(y - cy) <= radius) {
        footprint.add(y * w + x);
        food[y * w + x] = 100;
      }
    }
  // The blocked arena's nest sits inside its enclosure; it is not an exit.
  const nx = geometry === "blocked" ? cx - 2 : 6;
  const map = worldFromArrays({ w, h }, [{ x: centreX(nx, cy), y: centreY(cy), r: 1 }], { rock, food });
  const rng = mulberry32(seed);
  const c = new Colony(map, { antCount: 1, maxAnts: 1, deposit: 0 }, rng);
  c.x[0] = centreX(cx, cy);
  c.y[0] = centreY(cy);
  c.bindPolicy("mode", () => "explore");
  let offers = 0;
  c.responses = responses({
    get: () => {
      offers++;
      return false;
    },
  });
  const probe = new DepartureProbe();
  const initialFood = map.foodLeft;
  let rockSamples = 0;
  let firstExitSeconds: number | null = null;
  const ticks = Math.round(seconds * 30);
  for (let tick = 0; tick < ticks; tick++) {
    c.tick(1 / 30);
    if (observe) {
      const [oldX, oldY] = CELL;
      try {
        cellOf(c.x[0]!, c.y[0]!);
        const x = CELL[0],
          y = CELL[1];
        const inBounds = x >= 0 && x < w && y >= 0 && y < h;
        const index = y * w + x;
        if (c.alive[0] && (!inBounds || rock[index] === ROCK)) rockSamples++;
        if (c.alive[0] && !(inBounds && footprint.has(index)) && firstExitSeconds === null) firstExitSeconds = (tick + 1) / 30;
        probe.sample(inBounds && footprint.has(index), c.x[0]!, c.y[0]!, !!c.alive[0]);
      } finally {
        CELL[0] = oldX;
        CELL[1] = oldY;
      }
    }
  }
  probe.finish();
  const completed = probe.episodes
    .filter((e) => e.end === "exit")
    .map((e) => e.ticks / 30)
    .sort((a, b) => a - b);
  const quantile = (q: number) => (completed.length ? completed[Math.ceil(completed.length * q) - 1]! : null);
  return {
    seed,
    geometry,
    seconds: ticks / 30,
    offers,
    foodUnchanged: map.foodLeft === initialFood,
    rockSamples,
    firstExitSeconds,
    exits: completed.length,
    censored: probe.episodes.filter((e) => e.end === "boundary").length,
    deaths: probe.episodes.filter((e) => e.end === "death").length,
    p50: quantile(0.5),
    p95: quantile(0.95),
    episodes: probe.episodes,
    // Caller compares exact serialized state and the next RNG draw with/without observation.
    state: c.saveState(),
    nextDraw: rng(),
  };
}
