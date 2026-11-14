// The builder (docs/builder.md, PRD §71, ja-kjj8): a child's tools that change the world. Each one writes only to state the
// ants already sense (terrain, food and its quality, a colony's food trail) or takes trail away (rain); none tells an ant
// what to do. A stroke is applied between ticks and draws no random numbers, so a game no stroke touches runs bit for bit
// as before.
//
// Tools: dig (open ground), dirt (soil below; rock on the plane, which has no soil), rock, sugar and crumb (food of quality
// 1.5 and 0.5, assay A2b's), a crayon per colony (its food trail, kept topped up as it fades at the home trail's rate:
// the owner's call, PRD §71), and rain (every colony's trails and alarm under the cloud cleared). Guards keep the world
// sound: no dirt or rock on a nest's hole, on an ant or on brood.
//
// Undo is the Builder's, per page session: each stroke records what it changed, and undo puts back what is still its own
// (soil an ant dug since is left dug; sugar an ant took is gone). It is not saved; the builds are, as the map and the
// fields already are (Game.save), and the crayon lines with them.

import { CELL, cellOf, centreX, centreY } from "./hex.ts";
import type { Game } from "./game.ts";
import type { Channel } from "./pheromone.ts";
import { CURTAIN, FAINT, PLANE } from "./vocab.ts";
import { digCell, disc, dropFood, fillCell, inBounds, OPEN, qualityAt, ROCK, rockAt, SOIL, type WorldMap } from "./world.ts";

export type BuildTool = "dig" | "dirt" | "rock" | "sugar" | "crumb" | "crayon" | "rain";
export const BUILD_TOOLS: readonly BuildTool[] = ["dig", "dirt", "rock", "sugar", "crumb", "crayon", "rain"];

/** The tools' sizes and amounts (design marks; docs/builder.md "The mechanic"). Radii in world units. */
export const BUILD = {
  /** each tool's brush radius */
  radius: { dig: 1.6, dirt: 1.6, rock: 1.6, sugar: 1.6, crumb: 1.6, crayon: 1.1, rain: 6 } as Record<BuildTool, number>,
  /** food put on each cell a sugar or crumb stroke touches: the world's own piles' (DEFAULT_WORLD.foodPerCell) */
  foodPerCell: 12,
  /** the most food a cell may hold from the builder, so a finger held on one spot doesn't heap a mountain */
  foodCap: 60,
  /** sugar's and crumb's quality: Beckers et al. 1993's 1 M against 0.1 M sugar, as assay A2b (docs/trails.md) */
  sugar: 1.5,
  crumb: 0.5,
  /** a crayon line's food trail at first (STRONG is 1; a busy trail by the nest runs a few) */
  crayonLevel: 4,
  /** its half-life, seconds: the home trail's (evaporation 0.02/s, t½ ≈ 35 s), the owner's call (PRD §71) */
  crayonHalfLife: 35,
  /** cells round a nest's hole no dirt or rock may cover */
  holeGuard: 2,
  /** strokes undo remembers */
  undoDepth: 20,
} as const;

/** Every trail and alarm channel rain clears (floor marks underground stay: they are a later tool's). */
export const RAIN_CHANNELS: readonly Channel[] = ["food", "home", "alarm", "noEntry", "raid"];

/** A stroke: a tool dragged (or tapped) through world points on one layer. `colony`: whose trail a crayon lays. */
export interface Stroke {
  tool: BuildTool;
  /** PLANE or CURTAIN in one world; 0 on a game on one map */
  layer: number;
  points: readonly { x: number; y: number }[];
  colony?: number;
}

/** A crayon line: kept topped up to `level(age)` on its cells until it fades below FAINT. Saved with the game. */
export interface CrayonLine {
  colony: number;
  layer: number;
  /** cell x, y pairs */
  cells: number[];
  age: number;
}

/** A crayon line's food trail at `age` seconds. */
export function crayonLevel(age: number): number {
  return BUILD.crayonLevel * Math.pow(0.5, age / BUILD.crayonHalfLife);
}

/** Top up every crayon line to its level and age it; drop the faded ones. Game.tick calls it while any line is drawn. */
export function stepCrayons(game: Game, dt: number): void {
  const lines = game.crayons;
  let keep = 0;
  for (const line of lines) {
    line.age += dt;
    const level = crayonLevel(line.age);
    if (level < FAINT) continue;
    const ph = game.colonies[line.colony]?.layers[line.layer]?.ph;
    if (!ph) continue;
    const f = ph.fields.food;
    for (let k = 0; k < line.cells.length; k += 2) {
      const x = line.cells[k] as number;
      const y = line.cells[k + 1] as number;
      const v = f.get(x, y);
      if (v < level) ph.depositCell("food", x, y, level - v);
    }
    lines[keep++] = line;
  }
  lines.length = keep;
}

/** The map a stroke's layer is. */
export function layerMap(game: Game, layer: number): WorldMap {
  const m = game.layers[layer];
  if (!m) throw new Error(`builder: no layer ${layer}`);
  return m;
}

/** The cells (x, y pairs) a stroke covers, in stroke order, each once: discs of the tool's radius along the path. */
export function strokeCells(map: WorldMap, tool: BuildTool, points: readonly { x: number; y: number }[]): number[] {
  const r = BUILD.radius[tool];
  const seen = new Set<number>();
  const out: number[] = [];
  const visit = (x: number, y: number) => {
    const key = (y + 0x8000) * 0x10000 + (x + 0x8000);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(x, y);
  };
  // Between two points, steps of half a cell, so a fast finger leaves no gaps.
  let prev: { x: number; y: number } | null = null;
  for (const p of points) {
    if (prev) {
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      const n = Math.ceil(d / 0.5);
      for (let k = 1; k < n; k++) disc(map, prev.x + ((p.x - prev.x) * k) / n, prev.y + ((p.y - prev.y) * k) / n, r, visit);
    }
    disc(map, p.x, p.y, r, visit);
    prev = p;
  }
  return out;
}

/** Cells no dirt or rock may cover on a layer: every nest's hole (and a guard round it), every ant, the brood and the queen. */
export function guarded(game: Game, layer: number): Set<number> {
  const map = layerMap(game, layer);
  const out = new Set<number>();
  const key = (x: number, y: number) => (y + 0x8000) * 0x10000 + (x + 0x8000);
  const add = (x: number, y: number) => out.add(key(x, y));
  const one = game.layers.length === 1;
  for (const c of game.colonies) {
    // Its own hole: the plane cell over it above, the crust's cell below; on one map, its nest (and the side view's entrance).
    const h = c.holeCells[c.params.nest];
    const holes: { x: number; y: number }[] = [];
    if (one) {
      holes.push({ x: c.nest.x, y: c.nest.y });
      if (c.nest.entrance) holes.push(c.nest.entrance);
    } else if (h)
      holes.push(layer === PLANE ? { x: centreX(h.px, h.py), y: centreY(h.py) } : { x: centreX(h.col, h.row), y: centreY(h.row) });
    for (const p of holes) disc(map, p.x, p.y, BUILD.holeGuard, add);
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || (!one && c.layer[i] !== layer)) continue;
      c.antCell(i);
      add(CELL[0], CELL[1]);
    }
    // Brood and the queen lie underground (the curtain in one world).
    if (one || layer === CURTAIN) {
      for (const b of c.brood.items) add(b.x, b.y);
      if (c.queen?.alive) {
        cellOf(c.queen.x, c.queen.y);
        add(CELL[0], CELL[1]);
      }
    }
  }
  return out;
}

/** What one stroke changed, for undo. */
type Change =
  | { kind: "terrain"; map: WorldMap; x: number; y: number; was: number; now: number }
  | { kind: "food"; map: WorldMap; x: number; y: number; added: number; quality: number }
  | { kind: "crayon"; line: CrayonLine }
  | { kind: "crayonMore"; line: CrayonLine; cells: number[] }
  | { kind: "rain"; colony: number; layer: number; channel: Channel; x: number; y: number; was: number }
  | { kind: "rainLine"; line: CrayonLine; cells: number[]; at: number };

/** Change a cell's terrain the way the ants' own digging and filling does, so the maps' counts and caches follow. */
function setTerrain(map: WorldMap, x: number, y: number, to: number): boolean {
  const was = rockAt(map, x, y);
  if (was === to) return false;
  if (to === OPEN) {
    if (was === ROCK) map.rock.set(x, y, SOIL);
    else if (was !== SOIL) return false;
    return digCell(map, x, y); // not by an ant: no fresh-dig frontier
  }
  if (was === OPEN && !fillCell(map, x, y, -Infinity)) return false; // not by an ant: no fresh pellet to smell
  if (to === ROCK) {
    map.rock.set(x, y, ROCK);
    map.filled++; // the way-out field's version (homing.ts) moves on
  } else if (was === ROCK) {
    map.rock.set(x, y, SOIL);
    map.filled++;
  }
  return true;
}

/** Whether cell (x, y) is ground the builder may change: on the map, under the curtain's sky rows. */
function buildable(map: WorldMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && y >= (map.surfaceRows ?? 0) && !(map.sky && map.sky.get(x, y) === 1 && rockAt(map, x, y) !== OPEN);
}

/**
 * The builder for one game: applies strokes and undoes them. Strokes apply between ticks (the page's loop), never during
 * one. `apply` returns how many cells it changed (0: nothing to undo, and nothing recorded).
 */
export class Builder {
  readonly game: Game;
  #undo: Change[][] = [];
  #joinable = false;

  constructor(game: Game) {
    this.game = game;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  /**
   * Apply a stroke. `join`: it carries on the stroke before (a finger still dragging), so one undo takes both back; the
   * first piece of a drag joins nothing.
   */
  apply(stroke: Stroke, join = false): number {
    const last = this.#undo[this.#undo.length - 1];
    // A crayon drag goes on as one line: its pieces extend the line the drag began.
    const tail = join && this.#joinable ? last?.[last.length - 1] : undefined;
    const extend =
      (tail?.kind === "crayon" || tail?.kind === "crayonMore") &&
      tail.line.colony === (stroke.colony ?? 0) &&
      tail.line.layer === stroke.layer &&
      this.game.crayons.includes(tail.line)
        ? tail.line
        : undefined;
    const changes = this.#apply(stroke, extend);
    if (!changes.length) return 0;
    if (join && last && this.#joinable) last.push(...changes);
    else {
      this.#undo.push(changes);
      if (this.#undo.length > BUILD.undoDepth) this.#undo.shift();
    }
    this.#joinable = true;
    return changes.length;
  }

  /** A new drag begins: the next stroke starts a new undo even if it says join (and its first piece changed nothing). */
  begin(): void {
    this.#joinable = false;
  }

  #apply({ tool, layer, points, colony = 0 }: Stroke, extend?: CrayonLine): Change[] {
    const game = this.game;
    const map = layerMap(game, layer);
    const cells = strokeCells(map, tool, points);
    const out: Change[] = [];
    if (tool === "dig" || tool === "dirt" || tool === "rock") {
      // The plane has no soil: dirt there is rock (a wall), as rock is.
      const to = tool === "dig" ? OPEN : tool === "rock" || !map.hasSoil ? ROCK : SOIL;
      const guard = to === OPEN ? null : guarded(game, layer);
      for (let k = 0; k < cells.length; k += 2) {
        const x = cells[k] as number;
        const y = cells[k + 1] as number;
        if (!buildable(map, x, y) || guard?.has((y + 0x8000) * 0x10000 + (x + 0x8000))) continue;
        if (to !== OPEN && map.food.get(x, y) > 0) continue; // food is never buried
        const was = rockAt(map, x, y);
        if (setTerrain(map, x, y, to)) out.push({ kind: "terrain", map, x, y, was, now: to });
      }
    } else if (tool === "sugar" || tool === "crumb") {
      const quality = tool === "sugar" ? BUILD.sugar : BUILD.crumb;
      for (let k = 0; k < cells.length; k += 2) {
        const x = cells[k] as number;
        const y = cells[k + 1] as number;
        if (!buildable(map, x, y) || rockAt(map, x, y) !== OPEN) continue;
        const had = map.food.get(x, y);
        const add = Math.min(BUILD.foodPerCell, BUILD.foodCap - had);
        if (add <= 0) continue;
        const q = qualityAt(map, x, y);
        dropFood(map, centreX(x, y), centreY(y), add, quality);
        map.foodTotal += add; // counted, as regrowth's food is (game.ts), so the stats' share stays a share
        out.push({ kind: "food", map, x, y, added: add, quality: q });
      }
    } else if (tool === "crayon") {
      const ph = game.colonies[colony]?.layers[layer]?.ph;
      if (!ph) return out;
      const open: number[] = [];
      for (let k = 0; k < cells.length; k += 2) {
        const x = cells[k] as number;
        const y = cells[k + 1] as number;
        if (rockAt(map, x, y) === OPEN) open.push(x, y);
      }
      if (!open.length) return out;
      if (extend) {
        // The drag's line goes on: its new cells, each once, at the line's level now.
        const have = new Set<number>();
        for (let k = 0; k < extend.cells.length; k += 2) have.add((extend.cells[k + 1]! + 0x8000) * 0x10000 + (extend.cells[k]! + 0x8000));
        const added: number[] = [];
        for (let k = 0; k < open.length; k += 2)
          if (!have.has((open[k + 1]! + 0x8000) * 0x10000 + (open[k]! + 0x8000))) added.push(open[k]!, open[k + 1]!);
        if (!added.length) return out;
        extend.cells.push(...added);
        stepCrayons(game, 0);
        out.push({ kind: "crayonMore", line: extend, cells: added });
        return out;
      }
      const line: CrayonLine = { colony, layer, cells: open, age: 0 };
      game.crayons.push(line);
      stepCrayons(game, 0); // drawn at once, before the next tick
      out.push({ kind: "crayon", line });
    } else {
      // Rain: every colony's trails and alarm on this layer, and the crayon lines' cells under the cloud.
      const under = new Set<number>();
      for (let k = 0; k < cells.length; k += 2) under.add((cells[k + 1]! + 0x8000) * 0x10000 + (cells[k]! + 0x8000));
      game.colonies.forEach((c, ci) => {
        const ph = c.layers[layer]?.ph;
        if (!ph) return;
        for (const channel of RAIN_CHANNELS) {
          if (!ph.has(channel)) continue;
          const f = ph.fields[channel];
          for (let k = 0; k < cells.length; k += 2) {
            const x = cells[k] as number;
            const y = cells[k + 1] as number;
            const was = f.get(x, y);
            if (was === 0) continue;
            f.set(x, y, 0);
            out.push({ kind: "rain", colony: ci, layer, channel, x, y, was });
          }
        }
      });
      game.crayons.forEach((line, at) => {
        if (line.layer !== layer) return;
        const kept: number[] = [];
        const gone: number[] = [];
        for (let k = 0; k < line.cells.length; k += 2) {
          const x = line.cells[k] as number;
          const y = line.cells[k + 1] as number;
          (under.has((y + 0x8000) * 0x10000 + (x + 0x8000)) ? gone : kept).push(x, y);
        }
        if (!gone.length) return;
        line.cells = kept;
        out.push({ kind: "rainLine", line, cells: gone, at });
      });
    }
    return out;
  }

  /** Undo the last stroke: put back what is still its own. False if there is nothing to undo. */
  undo(): boolean {
    this.#joinable = false;
    const changes = this.#undo.pop();
    if (!changes) return false;
    const game = this.game;
    const guards = new Map<number, Set<number>>();
    const guardOf = (map: WorldMap) => {
      const l = game.layers.indexOf(map);
      let g = guards.get(l);
      if (!g) guards.set(l, (g = guarded(game, l)));
      return g;
    };
    for (let k = changes.length - 1; k >= 0; k--) {
      const c = changes[k] as Change;
      if (c.kind === "terrain") {
        // Only if the cell is still as the stroke left it (an ant may have dug it since), and never onto an ant or the brood.
        if (rockAt(c.map, c.x, c.y) !== c.now) continue;
        if (c.was !== OPEN && guardOf(c.map).has((c.y + 0x8000) * 0x10000 + (c.x + 0x8000))) continue;
        if (c.was !== OPEN && c.map.food.get(c.x, c.y) > 0) continue;
        setTerrain(c.map, c.x, c.y, c.was);
      } else if (c.kind === "food") {
        const v = c.map.food.get(c.x, c.y);
        const take = Math.min(v, c.added);
        if (take <= 0) continue;
        c.map.food.set(c.x, c.y, v - take);
        c.map.foodLeft -= take;
        c.map.foodTotal -= take;
        if (c.map.quality && v - take <= 0) c.map.quality.set(c.x, c.y, c.quality);
      } else if (c.kind === "crayon") {
        const at = game.crayons.indexOf(c.line);
        if (at >= 0) game.crayons.splice(at, 1);
        const f = game.colonies[c.line.colony]?.layers[c.line.layer]?.ph.fields.food;
        if (!f) continue;
        const level = crayonLevel(c.line.age);
        for (let j = 0; j < c.line.cells.length; j += 2) {
          const x = c.line.cells[j] as number;
          const y = c.line.cells[j + 1] as number;
          f.set(x, y, Math.max(0, f.get(x, y) - level));
        }
      } else if (c.kind === "crayonMore") {
        const drop = new Set<number>();
        for (let j = 0; j < c.cells.length; j += 2) drop.add((c.cells[j + 1]! + 0x8000) * 0x10000 + (c.cells[j]! + 0x8000));
        const kept: number[] = [];
        for (let j = 0; j < c.line.cells.length; j += 2) {
          const x = c.line.cells[j] as number;
          const y = c.line.cells[j + 1] as number;
          if (!drop.has((y + 0x8000) * 0x10000 + (x + 0x8000))) kept.push(x, y);
        }
        c.line.cells = kept;
        const f = game.colonies[c.line.colony]?.layers[c.line.layer]?.ph.fields.food;
        const level = crayonLevel(c.line.age);
        if (f)
          for (let j = 0; j < c.cells.length; j += 2)
            f.set(c.cells[j]!, c.cells[j + 1]!, Math.max(0, f.get(c.cells[j]!, c.cells[j + 1]!) - level));
      } else if (c.kind === "rain") {
        const ph = game.colonies[c.colony]?.layers[c.layer]?.ph;
        if (ph && ph.fields[c.channel].get(c.x, c.y) < c.was)
          ph.depositCell(c.channel, c.x, c.y, c.was - ph.fields[c.channel].get(c.x, c.y));
      } else {
        c.line.cells.push(...c.cells);
        if (!game.crayons.includes(c.line) && crayonLevel(c.line.age) >= FAINT)
          game.crayons.splice(Math.min(c.at, game.crayons.length), 0, c.line);
      }
    }
    return true;
  }
}
