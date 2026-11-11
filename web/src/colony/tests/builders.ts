// Test builders shared by the colony tests: the small maps and games, the step loop and the hand-placed colonies
// that used to be copied file to file (S0b, ja-fnd.1.3). A test whose setup differs keeps its own and says why.
import { LIFESPAN, MIDDLE, Colony, type HoleCell } from "../colony.ts";
import { type Policy } from "../vocab.ts";
import type { Game } from "../game.ts";
import { CELL, cellOf, centreX, centreY } from "../hex.ts";
import { generateOneWorld, type OneWorld } from "../oneWorld.ts";
import { decode, encode } from "../save.ts";
import { digCell, generateSideWorld, isSky, mulberry32, OPEN, rockAt, worldFromArrays, type WorldMap } from "../world.ts";
import { put } from "./hexmaps.ts";

/** One simulated step, as the page takes it (30 a second). */
export const DT = 1 / 30;

/** The side world most tests build: 256 × 160, one nest, the ground 40 rows down. Spread it to change a field. */
export const SMALL_SIDE = { size: { w: 256, h: 160 }, nestGap: 120, surface: 40, nestCount: 1 };

/** `n` steps of `g`. */
export const ticks = (g: Game, n: number): void => {
  for (let k = 0; k < n; k++) g.tick(DT);
};

/** Run `g` for `seconds`, calling `each` after every tick; stop early once `until` holds. Returns the seconds run. */
export const run = (g: Game, seconds: number, each?: () => void, until?: () => boolean): number => {
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    if (until?.()) return k * DT;
    g.tick(DT);
    each?.();
  }
  return seconds;
};

/** A 40 × 12 open map with a nest at each end, centred on row `nestY` (6 or 6.5, as each test had it), radius 2. */
export const arena = (nestY = 6): WorldMap =>
  worldFromArrays({ w: 40, h: 12 }, [
    { x: 4, y: nestY, r: 2 },
    { x: 36, y: nestY, r: 2 },
  ]);

/**
 * A colony of nest `opts.nest` with its first ants at `cells` and the rest dead. `seed` seeds its rng; `odour` and `policy`
 * are left to the colony's defaults unless given.
 */
export function placedAt(
  map: WorldMap,
  cells: [number, number][],
  opts: { nest: number; seed: number; odour?: number; policy?: Policy },
): Colony {
  const n = Math.max(1, cells.length);
  const params: Partial<Colony["params"]> = { antCount: n, maxAnts: n, nest: opts.nest };
  if (opts.odour !== undefined) params.odour = opts.odour;
  const c = new Colony(map, params, mulberry32(opts.seed), opts.policy);
  for (let i = 0; i < c.n; i++) {
    const cell = cells[i];
    c.alive[i] = cell ? 1 : 0;
    if (cell) put(c, i, cell[0], cell[1]);
  }
  return c;
}

/** The first open row at column `x` that is sky: where an ant can walk on the ground. */
export function walkway(map: WorldMap, x: number): number {
  for (let y = 0; y < map.size.h; y++) if (isSky(map, x, y) && rockAt(map, x, y) === OPEN) return y;
  return -1;
}

/** A brood chamber of three cells dug beside the royal one (to its east), for colony 0. */
export function broodChamber(map: ReturnType<typeof generateSideWorld>) {
  const ch = map.chambers!;
  cellOf(map.nest.x, map.nest.y);
  const [rx, ry] = [CELL[0], CELL[1]];
  let x = rx;
  while (rockAt(map, x, ry) === OPEN) x++;
  digCell(map, x, ry);
  const b = ch.add(0, ry, "brood");
  for (let k = 1; k <= 3; k++) {
    digCell(map, x + k, ry);
    ch.claim(b.id, x + k, ry, (a, y) => rockAt(map, a, y) === OPEN);
  }
  return { b, cell: [x + 2, ry] as const };
}

// One world (docs/one-world.md): a small plane keeps a game quick; seed 7's has two nests well inside it.

/** Seed `seed`'s one world with a 160 × 100 plane. */
export const smallOne = (seed = 7): OneWorld => generateOneWorld(seed, { plane: { size: { w: 160, h: 100 } } });
/** An age in band b (0 young, 1 middle-aged, 2 old) that every founder's lifespan outlasts. */
export const ageOf = (b: 0 | 1 | 2) => [0.05, (0.15 + MIDDLE) / 2, 0.5][b]! * LIFESPAN;
/** The colony's own hole. */
export const own = (c: Colony): HoleCell => c.holeCells[c.params.nest] as HoleCell;
/** A hole's world position in the curtain, and on the plane. */
export const curtainHole = (h: HoleCell) => ({ x: centreX(h.col, h.row), y: centreY(h.row) });
export const planeHole = (h: HoleCell) => ({ x: centreX(h.px, h.py), y: centreY(h.py) });

/**
 * The colony's private fields `keys`, decoded; `edit` changes them, and they are put back (no test hook on the colony). The
 * one place the tests reach private fields by name: a renamed `#field` is fixed here.
 */
export const editPrivate = (c: Colony, keys: readonly string[], edit: (r: Record<string, unknown>) => void): void => {
  const saved = c.saveState();
  const priv = saved.private as Record<string, unknown>;
  const pub = saved.fields as Record<string, unknown>;
  // A key is a #field (in `private`) or one of ants.ts's arrays (a property of the colony, in `fields`).
  const home = (k: string) => (k in priv ? priv : pub);
  const r: Record<string, unknown> = {};
  for (const k of keys) r[k] = decode(home(k)[k]);
  edit(r);
  const into = (src: Record<string, unknown>) => Object.fromEntries(keys.filter((k) => home(k) === src).map((k) => [k, encode(r[k])]));
  c.loadState({ fields: into(pub), private: into(priv) });
};
