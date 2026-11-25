import { CHUNK, isEndless, type Cells, type ChunkLayer, type EndlessMap, type Game } from "../../colony/index.ts";
import { sideOf } from "../stats.ts";
import { CorpseMemory } from "./corpses.ts";
import { KnownColonies } from "./known.ts";
import { Knowledge, type Source } from "./knowledge.ts";
import { SensedMap } from "../fungusSight.ts";

// The ground the fog remembers (docs/fog-of-war.md §4.3, ja-1ypq.3.1): what a ground chunk paints from, per layer. The fungus's own
// spores are not here: they are its body, which the player always knows. Ants are never remembered.

/** The names the painter asks the snapshot by. */
export const SNAP = { rock: "rock", food: "food", quality: "quality", spoil: "spoil", chamber: "chamber" } as const;

type PlaneChunk = ReturnType<EndlessMap["plane"]["chunk"]>;

/** A chunk of `layer`'s `empty`, which a source of a layer with no generator regenerates. */
function blank(layer: ChunkLayer<Cells>): () => Cells {
  let a: Float32Array | undefined;
  return () => (a ??= new Float32Array(CHUNK * CHUNK).fill(layer.empty));
}

/**
 * Every ground source of layer `layer` of `game`: what a chunk paints from. On the endless plane a chunk no one changed is the plane's own
 * (rock, food) or the layer's `empty`, so those sources say how to regenerate it and the fog drops the snapshots that match (Source.regen).
 */
export function layerSources(game: Game, layer: number): Source[] {
  const m = game.layers[layer];
  if (!m) return [];
  const plane = isEndless(m) ? m.plane : null;
  // The plane's chunk is a pure function of the seed and costs a regeneration (20-40 ms cold) that makes rock and food together: the rock and the
  // food of one chunk, asked one after the other, share one.
  let made: { cx: number; cy: number; chunk: PlaneChunk } | null = null;
  const own = (cx: number, cy: number): PlaneChunk => {
    if (!made || made.cx !== cx || made.cy !== cy) made = { cx, cy, chunk: plane!.chunk(cx, cy) };
    return made.chunk;
  };
  const out: Source[] = [];
  out.push({
    name: SNAP.rock,
    layer,
    at: (cx, cy) => m.rock.chunk(cx, cy),
    regen: plane ? (cx, cy) => own(cx, cy).rock : undefined,
  });
  out.push({
    name: SNAP.food,
    layer,
    at: (cx, cy) => m.food.chunk(cx, cy),
    regen: plane ? (cx, cy) => own(cx, cy).food : undefined,
  });
  if (m.quality) {
    const q = blank(m.quality);
    out.push({ name: SNAP.quality, layer, at: (cx, cy) => m.quality!.chunk(cx, cy), regen: plane ? () => q() : undefined });
  }
  if (m.spoil) {
    const e = blank(m.spoil);
    out.push({ name: SNAP.spoil, layer, at: (cx, cy) => m.spoil!.chunk(cx, cy), regen: plane ? () => e() : undefined });
  }
  if (m.chambers) out.push({ name: SNAP.chamber, layer, at: (cx, cy) => m.chambers!.cell.chunk(cx, cy) });
  return out;
}

/** Every layer's ground, as sources of the truth. */
export function groundSources(game: Game): Source[] {
  return game.layers.flatMap((_, layer) => layerSources(game, layer));
}

/** Whether the page runs with the fog of war: on by default (owner's go, 2026-11-24); `?fog=0` turns it off (the Lab and the guards that want the whole map). */
export function fogFromUrl(search = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("fog") !== "0";
}

/** What a save of the page's fog holds (F7, ja-1ypq.7): the knowledge, the corpses remembered and the colonies known, as JSON. */
export interface FogSave {
  knowledge: unknown;
  corpses: unknown;
  known: unknown;
}

/** The fog a loaded game is to start with: `useColony` leaves a record's here when it loads it, and `sensedFor` takes it up. */
export const fogCarried = new WeakMap<Game, FogSave>();

/** The fog of `s` as a save holds it, or null without the fog. */
export function saveFog(s: SensedMap): FogSave | null {
  const { knowledge, corpses, known } = s.fogMemory(); // past `suspended`: the builder hides the fog, not its memory
  if (!knowledge || !corpses || !known) return null;
  return { knowledge: knowledge.save(), corpses: corpses.save(), known: known.save() };
}

/** Put a saved fog into `s` (where it has the fog): what was remembered at the save is remembered again. */
export function loadFog(s: SensedMap, saved: FogSave): void {
  const { knowledge, corpses, known } = s.fogMemory();
  knowledge?.load(saved.knowledge);
  corpses?.load(saved.corpses);
  known?.load(saved.known);
}

/** The sensed map for `game`: with the fog's knowledge hung on it when `fog`, and the fog a loaded save carried. */
export function sensedFor(game: Game, fog: boolean): SensedMap {
  const s = new SensedMap();
  if (fog) {
    // The sources follow the game's layers: a line founded later (its curtain is a layer) is remembered too.
    s.knowledge = new Knowledge(s, (layer) => layerSources(game, layer));
    s.corpses = new CorpseMemory();
    s.known = new KnownColonies((c, g) => sideOf(c, g.fungus));
    const carried = fogCarried.get(game);
    if (carried) loadFog(s, carried);
  }
  return s;
}
