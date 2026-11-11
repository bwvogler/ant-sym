import { ChunkLayer } from "../chunks.ts";
import { CountGrid, occupancy } from "../battle.ts";
import type { Game, GameSave } from "../game.ts";
import { Recognition } from "../recognition.ts";
import type { WorldMap } from "../world.ts";

// A hash of everything a game holds that can be read from outside, for the save tests (save.test.ts, oneWorldSave.test.ts):
// a restored game must hash as the unbroken one, at the save and after running on. Every layer is in it (one world: the
// plane and the curtain), each colony's scent on each, the fungus, the line and what the game reads off its grids.

function fnv(h: number, bytes: Uint8Array): number {
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

/** Any value as JSON, Maps and Sets as their entries (JSON.stringify writes them as {}). */
function json(v: unknown): string {
  return JSON.stringify(v, (_, x: unknown) => (x instanceof Map ? { $map: [...x.entries()] } : x instanceof Set ? { $set: [...x] } : x));
}

export function hashGame(g: Game): string {
  let h = 0x811c9dc5;
  const view = (a: ArrayBufferView) => (h = fnv(h, new Uint8Array(a.buffer, a.byteOffset, a.byteLength)));
  const text = (v: unknown) => (h = fnv(h, new TextEncoder().encode(json(v))));
  // A layer's chunks in (cy, cx) order: the order its table keeps them in is not state (a reload may lay it out anew).
  const layer = (l: ChunkLayer<Uint8Array | Uint16Array | Float32Array>) => {
    const chunks: [number, number, ArrayBufferView][] = [];
    l.forEach((cx, cy, a) => chunks.push([cx, cy, a]));
    chunks.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [cx, cy, a] of chunks) {
      view(new Int32Array([cx, cy]));
      view(a);
    }
  };
  const walk = (o: object) => {
    for (const [, v] of Object.entries(o)) {
      if (ArrayBuffer.isView(v)) view(v);
      else if (v instanceof ChunkLayer) layer(v);
    }
  };
  text([g.time, g.strategyChoices, g.regrown, g.revealed, g.landed, g.founded, g.flights]);
  g.layers.forEach((m: WorldMap) => {
    text([m.x0, m.size, m.foodLeft, m.foodTotal, m.dug, m.filled, m.moundCells ?? null, m.nests]);
    walk(m);
    if (m.chambers) {
      layer(m.chambers.cell);
      text(m.chambers.list);
    }
  });
  const line = g.world?.line;
  if (line) text([line.holes, line.sHole, line.sMin, line.sMax, line.margin]);
  for (const c of g.colonies) {
    walk(c);
    // Its scent on every layer it lives on, and each layer's own way out and holes.
    for (const L of c.layers) {
      for (const f of Object.values(L.ph.fields)) layer(f);
      text([L.holes, L.outCells, L.outVersion, L.outAt]);
      if (L.outDist) view(L.outDist);
    }
    text([
      c.stored,
      c.births,
      c.losses,
      c.decisions,
      c.larder,
      c.stance,
      c.queen,
      c.brood.items,
      c.corpses,
      c.midden,
      c.alates,
      c.eaten,
      c.nestOdour,
      c.odourAim,
    ]);
    // Its private fields too, as its save holds them: the hash above sees only what can be read from outside.
    text(c.saveState().private);
  }
  text(g.fungus.saveState());
  // What the game reads off its occupancy grids and recognition bands (Game.#refresh): unity, and strangers by each nest.
  text([g.unity(), g.colonies.map((_, k) => g.enemiesNearNest(k))]);
  return (h >>> 0).toString(16);
}

/**
 * The grids and bands built again from the living, as a load did before saves kept them (Game.#refresh): for the
 * controls that show a save's tick needs its own grids. Load a save into a fresh game first, then call this on it.
 */
export function gridsFromLiving(g: Game): GameSave["grids"] {
  const one = g.layers.length === 1;
  return {
    counts: g.layers.map((_, l) => g.colonies.map((c) => occupancy(c, new CountGrid(), one ? -1 : l).saveState())),
    bands: g.layers.map((_, l) => {
      const r = new Recognition();
      r.build(g.colonies, one ? -1 : l);
      return r.saveBands();
    }),
  };
}
