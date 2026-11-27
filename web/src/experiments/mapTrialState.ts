import { chunkKey, chunkOf, type Cells, type ChunkLayer, type Colony, type Game } from "../colony/index.ts";

import type { MapTrialAction, MapTrialProgress } from "./mapTrialRuntime.ts";

const antFields = ["x", "y", "heading", "layer", "alive", "gen", "load", "odour", "carrying", "quality", "pellet", "corpse"] as const;
type AntField = (typeof antFields)[number];

function colonyView(c: Colony) {
  return {
    ants: antFields.map((key) => c[key].slice()),
    time: c.time,
    queen: c.queen,
    brood: c.brood.items,
    alates: c.alates,
    corpses: c.corpses,
    remains: c.remains,
    nestOdour: c.nestOdour,
  };
}

// The renderer keeps the seeded world and colony objects. Replicate the grid contents it reads, bypassing simulation mutators.
function layersOf(game: Game): (ChunkLayer<Cells> | undefined)[] {
  return [
    ...game.layers.flatMap((m) => [m.rock, m.food, m.quality, m.spoil, m.chambers?.cell]),
    ...game.colonies.flatMap((c) => Array.from(c.layers, (layer) => layer?.ph.fields.food)),
  ];
}

type ChunkChange = [layer: number, cx: number, cy: number, cells: Cells | null];
type Ground = {
  changes: ChunkChange[];
  fungus: ReturnType<Game["fungus"]["saveState"]>;
  maps: { dug: number; filled: number; foodLeft: number; moundCells?: number }[];
};

export interface MapTrialFrame {
  type: "frame";
  time: number;
  progress?: MapTrialProgress;
  colonies: ReturnType<typeof colonyView>[];
  ground?: Ground;
}

export type MapTrialReply =
  MapTrialFrame | { type: "world"; state: ReturnType<Game["save"]> } | { type: "error" | "notice"; message: string };
export type MapTrialCommand = { type: "init"; seed: number; antCount: number } | MapTrialAction;

// Compare four bytes at a time without a per-cell callback, including Float32 trails.
function chunkWords(cells: Cells): Uint32Array {
  return new Uint32Array(cells.buffer, cells.byteOffset, cells.byteLength / Uint32Array.BYTES_PER_ELEMENT);
}

function sameChunk(cells: Cells, previous: Uint32Array): boolean {
  const words = chunkWords(cells);
  for (let i = 0; i < words.length; i++) if (words[i] !== previous[i]) return false;
  return true;
}

export class MapTrialSnapshots {
  readonly #previous = new Map<number, Map<number, Uint32Array>>();

  frame(game: Game, includeGround: boolean): MapTrialFrame {
    return {
      type: "frame",
      time: game.time,
      colonies: game.colonies.map(colonyView),
      ground: includeGround
        ? {
            changes: this.#changes(game),
            fungus: game.fungus.saveState(),
            maps: game.layers.map(({ dug, filled, foodLeft, moundCells }) => ({ dug, filled, foodLeft, moundCells })),
          }
        : undefined,
    };
  }

  #changes(game: Game): ChunkChange[] {
    const changes: ChunkChange[] = [];
    layersOf(game).forEach((layer, index) => {
      if (!layer) return;
      const previous = this.#previous.get(index) ?? new Map<number, Uint32Array>();
      if (!this.#previous.has(index)) this.#previous.set(index, previous);
      const present = new Set<number>();
      layer.forEach((cx, cy, cells) => {
        const key = chunkKey(cx, cy);
        present.add(key);
        const before = previous.get(key);
        if (before && sameChunk(cells, before)) return;
        const copy = cells.slice();
        previous.set(key, chunkWords(copy));
        changes.push([index, cx, cy, copy]);
      });
      for (const key of previous.keys()) {
        if (present.has(key)) continue;
        previous.delete(key);
        const [cx, cy] = chunkOf(key);
        changes.push([index, cx, cy, null]);
      }
    });
    return changes;
  }
}

export function receiveMapFrame(game: Game, frame: MapTrialFrame): void {
  game.time = frame.time;
  frame.colonies.forEach(({ ants, brood, corpses, remains, ...values }, k) => {
    const c = game.colonies[k]!;
    antFields.forEach((key: AntField, i) => c[key].set(ants[i]!));
    c.brood.items.splice(0, c.brood.items.length, ...brood);
    c.corpses.splice(0, c.corpses.length, ...corpses);
    c.remains.splice(0, c.remains.length, ...remains);
    Object.assign(c, values);
  });
  if (!frame.ground) return;
  const layers = layersOf(game);
  for (const [index, cx, cy, cells] of frame.ground.changes) {
    if (cells) layers[index]?.put(cx, cy, cells);
    else layers[index]?.drop(cx, cy);
  }
  frame.ground.maps.forEach((map, k) => Object.assign(game.layers[k]!, map));
  game.fungus.loadState(frame.ground.fungus);
}
