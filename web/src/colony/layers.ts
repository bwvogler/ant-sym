// A colony's layers (docs/refactor.md S3.3, ja-fnd.4.12): each layer's own state held in slots while another is bound, the
// view `layers` shows of each, and storing and loading the bound one (Colony.bind). Moved out of colony.ts verbatim but for
// `this` becoming `c` in store and load, and the static view becoming the function layerView.

import type { Colony, Layer } from "./colony.ts";
import { CELL, cellOf } from "./hex.ts";
import { cellAt } from "./transect.ts";

/** A layer's own copy of its state, held while another layer is bound (see Colony.layers). */
export type LayerSlots = { -readonly [K in keyof Layer]: Layer[K] };

/** Where a layer's view keeps its slots: a key only this module holds. */
export const SLOTS = Symbol("slots");

export type LayerView = Layer & { readonly [SLOTS]: LayerSlots };

/**
 * Layer l as `layers` shows it: each field read from the colony while l is bound, else from l's slots (see `layers`).
 * A function over the colony, so the getters reach its fields without aliasing `this`.
 */
export function layerView(c: Colony, l: number, s: LayerSlots): LayerView {
  return {
    [SLOTS]: s,
    get map() {
      return c.cur === l ? c.map : s.map;
    },
    get ph() {
      return c.cur === l ? c.ph : s.ph;
    },
    get nest() {
      return c.cur === l ? c.nest : s.nest;
    },
    get entrance() {
      return c.cur === l ? c.entrance : s.entrance;
    },
    get entranceCol() {
      return c.cur === l ? c.entranceCol : s.entranceCol;
    },
    get entranceRow() {
      return c.cur === l ? c.entranceRow : s.entranceRow;
    },
    get holes() {
      return c.cur === l ? c.holes : s.holes;
    },
    set holes(v) {
      if (c.cur === l) c.holes = v;
      else s.holes = v;
    },
    get outDist() {
      return c.cur === l ? c.outDist : s.outDist;
    },
    set outDist(v) {
      if (c.cur === l) c.outDist = v;
      else s.outDist = v;
    },
    get outCells() {
      return c.cur === l ? c.outCells : s.outCells;
    },
    set outCells(v) {
      if (c.cur === l) c.outCells = v;
      else s.outCells = v;
    },
    get outVersion() {
      return c.cur === l ? c.outVersion : s.outVersion;
    },
    set outVersion(v) {
      if (c.cur === l) c.outVersion = v;
      else s.outVersion = v;
    },
    get outAt() {
      return c.cur === l ? c.outAt : s.outAt;
    },
    set outAt(v) {
      if (c.cur === l) c.outAt = v;
      else s.outAt = v;
    },
    get enemies() {
      return c.cur === l ? c.enemies : s.enemies;
    },
    set enemies(v) {
      if (c.cur === l) c.enemies = v;
      else s.enemies = v;
    },
    get nestmates() {
      return c.cur === l ? c.nestmates : s.nestmates;
    },
    set nestmates(v) {
      if (c.cur === l) c.nestmates = v;
      else s.nestmates = v;
    },
    get friends() {
      return c.cur === l ? c.friends : s.friends;
    },
    set friends(v) {
      if (c.cur === l) c.friends = v;
      else s.friends = v;
    },
    get foreign() {
      return c.cur === l ? c.foreign : s.foreign;
    },
    set foreign(v) {
      if (c.cur === l) c.foreign = v;
      else s.foreign = v;
    },
    get raidMarks() {
      return c.cur === l ? c.raidMarks : s.raidMarks;
    },
    set raidMarks(v) {
      if (c.cur === l) c.raidMarks = v;
      else s.raidMarks = v;
    },
    get raidTarget() {
      return c.cur === l ? c.raidTarget : s.raidTarget;
    },
    set raidTarget(v) {
      if (c.cur === l) c.raidTarget = v;
      else s.raidTarget = v;
    },
    get raidNest() {
      return c.cur === l ? c.raidNest : s.raidNest;
    },
    set raidNest(v) {
      if (c.cur === l) c.raidNest = v;
      else s.raidNest = v;
    },
    get others() {
      return c.cur === l ? c.others : s.others;
    },
    set others(v) {
      if (c.cur === l) c.others = v;
      else s.others = v;
    },
  };
}

/** The bound layer's state, from the colony's fields into slots `s`. */
export function storeLayer(c: Colony, s: LayerSlots): void {
  s.map = c.map;
  s.ph = c.ph;
  s.nest = c.nest;
  s.entrance = c.entrance;
  s.entranceCol = c.entranceCol;
  s.entranceRow = c.entranceRow;
  s.holes = c.holes;
  s.outDist = c.outDist;
  s.outCells = c.outCells;
  s.outVersion = c.outVersion;
  s.outAt = c.outAt;
  s.enemies = c.enemies;
  s.nestmates = c.nestmates;
  s.friends = c.friends;
  s.foreign = c.foreign;
  s.raidMarks = c.raidMarks;
  s.raidTarget = c.raidTarget;
  s.raidNest = c.raidNest;
  s.others = c.others;
}

/** Slots `s` into the colony's fields: their layer is the bound one now. */
export function loadLayer(c: Colony, s: LayerSlots): void {
  c.map = s.map;
  c.ph = s.ph;
  c.nest = s.nest;
  c.entrance = s.entrance;
  c.entranceCol = s.entranceCol;
  c.entranceRow = s.entranceRow;
  c.holes = s.holes;
  c.outDist = s.outDist;
  c.outCells = s.outCells;
  c.outVersion = s.outVersion;
  c.outAt = s.outAt;
  c.enemies = s.enemies;
  c.nestmates = s.nestmates;
  c.friends = s.friends;
  c.foreign = s.foreign;
  c.raidMarks = s.raidMarks;
  c.raidTarget = s.raidTarget;
  c.raidNest = s.raidNest;
  c.others = s.others;
}

/**
 * Every nest's hole on the map (side view), whose funnels the colony's mound keeps open (world.heapMound). Again
 * whenever a colony is founded (Game.addColony), so an older colony's mound never buries the new hole (PR #42
 * review, S3).
 */
export function seeHoles(c: Colony): void {
  // One world: each nest's hole on both layers, by colony (the maps' nests are), the plane cell over its column.
  const line = c.line;
  if (line) {
    const curtain = (c.layers[c.home] as Layer).map;
    c.holeCells = curtain.nests.map((n) => {
      const e = n.entrance ?? n;
      cellOf(e.x, e.y);
      const col = CELL[0];
      const row = CELL[1];
      cellAt(line, col); // the curtain's column is the line's s
      return { col, row, px: CELL[0], py: CELL[1] };
    });
  }
  // On every layer with a hole into it (the side view's map; one world's curtain).
  for (const L of c.layers) {
    if (!L.entrance) continue;
    const holes: number[] = [];
    for (const n of L.map.nests ?? [L.nest])
      if (n.entrance) {
        cellOf(n.entrance.x, n.entrance.y);
        holes.push(CELL[0]);
      }
    L.holes = holes;
  }
}
