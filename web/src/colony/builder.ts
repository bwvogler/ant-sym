// The builder (docs/builder.md, PRD §73, ja-kjj8): a child's tools that change the world. Each one writes only to state the
// ants already sense (terrain, food and its quality, a colony's food trail) or takes trail away (rain); none tells an ant
// what to do. A stroke is applied between ticks and draws no random numbers, so a game no stroke touches runs bit for bit
// as before.
//
// Tools: dig (open ground), dirt (soil below; rock on the plane, which has no soil), rock, sugar and crumb (food of quality
// 1.5 and 0.5, assay A2b's), a crayon per colony (its food trail, kept topped up as it fades at the home trail's rate:
// the owner's call, PRD §73), and rain (every colony's trails and alarm under the cloud cleared). Guards keep the world
// sound: no dirt or rock on a nest's hole, on an ant or on brood.
//
// Undo is the Builder's, per page session: each stroke records what it changed, and undo puts back what is still its own
// (soil an ant dug since is left dug; sugar an ant took is gone). It is not saved; the builds are, as the map and the
// fields already are (Game.save), and the crayon lines with them.

import { CELL, cellOf, centreX, centreY } from "./hex.ts";
import type { Game } from "./game.ts";
import { routeClear } from "./homing.ts";
import type { Channel, Pheromones } from "./pheromone.ts";
import { FAINT, PLANE } from "./vocab.ts";
import { APHID, type AphidClump } from "./aphids.ts";
import {
  digCell,
  disc,
  dropFood,
  fillCell,
  inBounds,
  OPEN,
  openCell,
  qualityAt,
  ROCK,
  rockAt,
  SOIL,
  topRow,
  type WorldMap,
} from "./world.ts";

export type BuildTool = "dig" | "dirt" | "rock" | "sugar" | "crumb" | "aphids" | "crayon" | "noEntry" | "rain";
export const BUILD_TOOLS: readonly BuildTool[] = ["dig", "dirt", "rock", "sugar", "crumb", "aphids", "crayon", "noEntry", "rain"];

/** The tools' sizes and amounts (design marks; docs/builder.md "The mechanic"). Radii in world units. */
export const BUILD = {
  /** each tool's brush radius */
  radius: { dig: 1.6, dirt: 1.6, rock: 1.6, sugar: 1.6, crumb: 1.6, aphids: 1.6, crayon: 1.1, noEntry: 1.6, rain: 6 } as Record<
    BuildTool,
    number
  >,
  /** food put on each cell a sugar or crumb stroke touches: the world's own piles' (PLANE_WORLD.foodPerCell) */
  foodPerCell: 12,
  /** the most food a cell may hold from the builder, so a finger held on one spot doesn't heap a mountain */
  foodCap: 60,
  /** sugar's and crumb's quality: Beckers et al. 1993's 1 M against 0.1 M sugar, as assay A2b (docs/trails.md) */
  sugar: 1.5,
  crumb: 0.5,
  /** a crayon line's food trail at first (STRONG is 1; a busy trail by the nest runs a few) */
  crayonLevel: 4,
  /** its half-life, seconds: the home trail's (evaporation 0.02/s, t½ ≈ 35 s), the owner's call (PRD §73) */
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

/**
 * A crayon line: kept topped up to `level(age)` on its cells until it fades below FAINT. Saved with the game. `channel`:
 * "food" for a crayon (absent in saves before slice 2), "noEntry" for the no-entry paint, which is every colony's
 * (`colony` −1; docs/builder.md "Slice 2").
 */
export interface CrayonLine {
  colony: number;
  layer: number;
  channel?: "food" | "noEntry";
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
    const ch = line.channel ?? "food";
    for (const ph of linePheromones(game, line)) {
      const f = ph.fields[ch];
      for (let k = 0; k < line.cells.length; k += 2) {
        const x = line.cells[k] as number;
        const y = line.cells[k + 1] as number;
        const v = f.get(x, y);
        if (v < level) ph.depositCell(ch, x, y, level - v);
      }
    }
    lines[keep++] = line;
  }
  lines.length = keep;
}

/** The fields a line is laid in: its colony's on its layer, or every colony's for the no-entry paint (colony −1). */
export function linePheromones(game: Game, line: CrayonLine): Pheromones[] {
  const out: Pheromones[] = [];
  game.colonies.forEach((c, k) => {
    if (line.colony !== -1 && line.colony !== k) return;
    if (game.isFrozen(k)) return; // a sleeper's scent stands as it was
    const ph = c.layers[line.layer]?.ph;
    if (ph && ph.has(line.channel ?? "food")) out.push(ph);
  });
  return out;
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
  for (const c of game.colonies) {
    if (!c.layers[layer]) continue; // a curtain of another line: none of this colony's ants, hole, brood or queen are on it
    // Its own hole: the plane cell over it above, the crust's cell below.
    const h = c.holeCells[c.params.nest];
    if (h) {
      const p = layer === PLANE ? { x: centreX(h.px, h.py), y: centreY(h.py) } : { x: centreX(h.col, h.row), y: centreY(h.row) };
      disc(map, p.x, p.y, BUILD.holeGuard, add);
    }
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || c.layer[i] !== layer) continue;
      c.antCell(i);
      add(CELL[0], CELL[1]);
    }
    // Brood and the queen lie underground: on the colony's own curtain.
    if (layer === c.home) {
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
  | { kind: "terrain"; map: WorldMap; x: number; y: number; was: number; now: number; chamber: number }
  | { kind: "food"; map: WorldMap; x: number; y: number; added: number; quality: number }
  | { kind: "crayon"; line: CrayonLine }
  | { kind: "crayonMore"; line: CrayonLine; cells: number[] }
  | { kind: "aphids"; clump: AphidClump }
  | { kind: "aphidsMore"; clump: AphidClump; cells: number[]; start: number }
  | { kind: "rain"; colony: number; layer: number; channel: Channel; x: number; y: number; was: number }
  | { kind: "rainLine"; line: CrayonLine; cells: number[]; at: number }
  | { kind: "ant"; colony: number; i: number; gen: number; dx: number; dy: number };

/** What `Builder.watch` says the ants did with a build (docs/builder.md "Slice 2"): each said once. */
export type BuildEvent =
  | { kind: "foodFound"; tool: "sugar" | "crumb" }
  | { kind: "foodGone"; tool: "sugar" | "crumb" }
  | { kind: "lineFollowed"; colony: number; ants: number }
  | { kind: "antHome"; colony: number; seconds: number }
  | { kind: "antLost"; colony: number }
  | { kind: "aphidsFound"; colony: number }
  | { kind: "aphidsEaten" }
  | { kind: "aphidsGone" };

/** Aphids eaten from a clump before `watch` says the ants are eating them. */
export const APHIDS_EATEN_SAID = 3;

/** Ants on a crayon line at once for `watch` to say it is followed. */
export const FOLLOWED_AT = 3;

/** A sugar or crumb stroke being watched: its cells, what each held before, what it added. */
interface FoodWatch {
  tool: "sugar" | "crumb";
  cells: { map: WorldMap; x: number; y: number; before: number; added: number }[];
  found: boolean;
}

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
  return inBounds(map, x, y) && y >= topRow(map) && !(map.sky && map.sky.get(x, y) === 1 && rockAt(map, x, y) !== OPEN);
}

/** An ant the tweezers set down: colony, slot, its generation (a slot reborn is another ant), the game time and the
 * builder's count of moves at its last set-down (a new count: it was carried again). */
export interface MovedAnt {
  colony: number;
  i: number;
  gen: number;
  at: number;
  move: number;
}

/**
 * The builder for one game: applies strokes and undoes them. Strokes apply between ticks (the page's loop), never during
 * one. `apply` returns how many cells it changed (0: nothing to undo, and nothing recorded).
 */
export class Builder {
  readonly game: Game;
  #undo: Change[][] = [];
  #joinable = false;
  #food: FoodWatch[] = [];
  #followed = new WeakSet<CrayonLine>();
  #moved: MovedAnt[] = [];
  /** the clumps a child put down, watched until they are gone: found yet, eaten said yet (docs/aphids.md "Play") */
  #clumps = new Map<AphidClump, { found: boolean; eaten: boolean }>();
  #moves = 0;

  constructor(game: Game) {
    this.game = game;
    // Clumps already in the game (a loaded save) are watched to their end, said found and eaten already (review of #243, N7).
    // A clump saved before anyone found it never says "found" after the load: only a notice (N10).
    for (const c of game.aphids) this.#clumps.set(c, { found: true, eaten: c.eaten >= APHIDS_EATEN_SAID });
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
    const lineColony = stroke.tool === "noEntry" ? -1 : (stroke.colony ?? 0);
    const extend =
      (tail?.kind === "crayon" || tail?.kind === "crayonMore") &&
      tail.line.colony === lineColony &&
      (tail.line.channel ?? "food") === (stroke.tool === "noEntry" ? "noEntry" : "food") &&
      tail.line.layer === stroke.layer &&
      this.game.crayons.includes(tail.line)
        ? tail.line
        : undefined;
    const clump =
      stroke.tool === "aphids" &&
      (tail?.kind === "aphids" || tail?.kind === "aphidsMore") &&
      tail.clump.layer === stroke.layer &&
      this.game.aphids.includes(tail.clump)
        ? tail.clump
        : undefined;
    const changes = this.#apply(stroke, extend, clump);
    if (!changes.length) return 0;
    for (const c of changes) if (c.kind === "aphids") this.#clumps.set(c.clump, { found: false, eaten: false });
    if (stroke.tool === "sugar" || stroke.tool === "crumb") {
      const cells = changes.flatMap((c) =>
        c.kind === "food" ? [{ map: c.map, x: c.x, y: c.y, before: c.map.food.get(c.x, c.y) - c.added, added: c.added }] : [],
      );
      const w = this.#food[this.#food.length - 1];
      if (join && this.#joinable && w && w.tool === stroke.tool && !w.found) w.cells.push(...cells);
      else this.#food.push({ tool: stroke.tool, cells, found: false });
    }
    if (join && last && this.#joinable) last.push(...changes);
    else {
      this.#undo.push(changes);
      if (this.#undo.length > BUILD.undoDepth) this.#undo.shift();
    }
    this.#joinable = true;
    return changes.length;
  }

  /**
   * The tweezers (docs/builder.md "Slice 2"): set colony k's ant i down at world (x, y) on the plane, as a finger lets
   * go. Its belief of home moves by as much (carriedX, carriedY), so it runs its old vector and searches where that
   * ends, as a displaced desert ant does. Plane only, one world only, open ground only. `join`: the same drag goes on.
   * False if it could not be moved.
   */
  moveAnt(k: number, i: number, x: number, y: number, join = false): boolean {
    const game = this.game;
    const c = game.colonies[k];
    if (!game.world || !c || !c.alive[i] || c.layer[i] !== PLANE) return false;
    const map = layerMap(game, PLANE);
    cellOf(x, y);
    if (!buildable(map, CELL[0], CELL[1]) || rockAt(map, CELL[0], CELL[1]) !== OPEN) return false;
    const dx = x - c.x[i]!;
    const dy = y - c.y[i]!;
    if (dx === 0 && dy === 0) return false;
    c.putAnt(i, PLANE, x, y);
    // The places it stored on its way out are not where it now is: no retrace by them (docs/builder.md "Slice 2";
    // review of #229, S1). An undo can't give them back: a put-back ant has none for the rest of this trip.
    routeClear(c, i);
    c.carriedX[i] += dx;
    c.carriedY[i] += dy;
    const change: Change = { kind: "ant", colony: k, i, gen: c.gen[i]!, dx, dy };
    const last = this.#undo[this.#undo.length - 1];
    if (join && last && this.#joinable) last.push(change);
    else {
      this.#undo.push([change]);
      if (this.#undo.length > BUILD.undoDepth) this.#undo.shift();
    }
    this.#joinable = true;
    this.#moved = this.#moved.filter((m) => !(m.colony === k && m.i === i));
    this.#moved.push({ colony: k, i, gen: c.gen[i]!, at: game.time, move: ++this.#moves });
    return true;
  }

  /** The moved ants not home, dead or undone at the last watch() (it prunes them once a second: check). Read only. */
  moved(): readonly Readonly<MovedAnt>[] {
    return this.#moved;
  }

  /**
   * What the ants did with the builds since the last call, each said once (docs/builder.md "Slice 2"): sugar or crumbs
   * found and gone, a crayon line followed by FOLLOWED_AT or more, a moved ant home (down a hole) or dead. Reads the
   * game, never changes it. The page calls it once a second.
   */
  watch(): BuildEvent[] {
    const game = this.game;
    const out: BuildEvent[] = [];
    this.#food = this.#food.filter((w) => {
      let left = 0;
      let all = 0;
      for (const c of w.cells) {
        all += c.added;
        left += Math.max(0, Math.min(c.added, c.map.food.get(c.x, c.y) - c.before));
      }
      if (!w.found && left < all - 0.5) {
        w.found = true;
        out.push({ kind: "foodFound", tool: w.tool });
      }
      if (left <= 0.5) {
        out.push({ kind: "foodGone", tool: w.tool });
        return false;
      }
      return true;
    });
    for (const line of game.crayons) {
      if ((line.channel ?? "food") !== "food" || this.#followed.has(line)) continue;
      const c = game.colonies[line.colony];
      if (!c) continue;
      const on = new Set<number>();
      for (let k = 0; k < line.cells.length; k += 2) on.add((line.cells[k + 1]! + 0x8000) * 0x10000 + (line.cells[k]! + 0x8000));
      let n = 0;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || (game.world && c.layer[i] !== line.layer)) continue;
        c.antCell(i);
        if (on.has((CELL[1] + 0x8000) * 0x10000 + (CELL[0] + 0x8000))) n++;
      }
      if (n >= FOLLOWED_AT) {
        this.#followed.add(line);
        out.push({ kind: "lineFollowed", colony: line.colony, ants: n });
      }
    }
    // Aphids (docs/aphids.md "Play"): found (an ant carrying food on the clump), some eaten, all gone; each said once.
    for (const [clump, said] of this.#clumps) {
      if (!game.aphids.includes(clump)) {
        out.push({ kind: "aphidsGone" });
        this.#clumps.delete(clump);
        continue;
      }
      if (!said.found) {
        const on = new Set<number>();
        for (let k = 0; k < clump.cells.length; k += 2) on.add((clump.cells[k + 1]! + 0x8000) * 0x10000 + (clump.cells[k]! + 0x8000));
        game.colonies.forEach((c, k) => {
          for (let i = 0; i < c.n && !said.found; i++) {
            // An ant carrying food on the clump. One crossing it with sugar would say so too (honeydew is sugar's quality): rare,
            // and only a notice (review of #243, N6).
            if (!c.alive[i] || !c.carrying[i] || (game.world && c.layer[i] !== clump.layer)) continue;
            c.antCell(i);
            if (on.has((CELL[1] + 0x8000) * 0x10000 + (CELL[0] + 0x8000))) {
              said.found = true;
              out.push({ kind: "aphidsFound", colony: k });
            }
          }
        });
      }
      if (!said.eaten && clump.eaten >= APHIDS_EATEN_SAID) {
        said.eaten = true;
        out.push({ kind: "aphidsEaten" });
      }
    }
    this.#moved = this.#moved.filter((m) => {
      const c = game.colonies[m.colony];
      if (!c || !c.alive[m.i] || c.gen[m.i] !== m.gen) {
        out.push({ kind: "antLost", colony: m.colony });
        return false;
      }
      if (c.layer[m.i] !== PLANE) {
        out.push({ kind: "antHome", colony: m.colony, seconds: game.time - m.at });
        return false;
      }
      return true;
    });
    return out;
  }

  /** A new drag begins: the next stroke starts a new undo even if it says join (and its first piece changed nothing). */
  begin(): void {
    this.#joinable = false;
  }

  #apply({ tool, layer, points, colony = 0 }: Stroke, extend?: CrayonLine, clump?: AphidClump): Change[] {
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
        // The chamber the cell belonged to, so undo can give it back (fillCell releases it; review of #204, N7).
        const chamber = map.chambers?.at(x, y) ?? -1;
        if (setTerrain(map, x, y, to)) out.push({ kind: "terrain", map, x, y, was, now: to, chamber });
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
    } else if (tool === "aphids") {
      // A clump on open ground (docs/aphids.md): a drag grows the clump it began, cell by cell. Aphids live on the surface:
      // in one world, the plane only.
      if (game.layers.length > 1 && layer !== PLANE) return out;
      const have = new Set<number>();
      if (clump)
        for (let k = 0; k < clump.cells.length; k += 2) have.add((clump.cells[k + 1]! + 0x8000) * 0x10000 + (clump.cells[k]! + 0x8000));
      const open: number[] = [];
      for (let k = 0; k < cells.length; k += 2) {
        const x = cells[k] as number;
        const y = cells[k + 1] as number;
        const key = (y + 0x8000) * 0x10000 + (x + 0x8000);
        if (have.has(key) || !buildable(map, x, y) || rockAt(map, x, y) !== OPEN) continue;
        have.add(key);
        open.push(x, y);
      }
      if (!open.length) return out;
      const start = (open.length / 2) * APHID.perCell;
      if (clump) {
        clump.cells.push(...open);
        clump.start += start;
        out.push({ kind: "aphidsMore", clump, cells: open, start });
      } else {
        const made: AphidClump = { layer, cells: open, start, eaten: 0, age: 0, owed: 0 };
        game.aphids.push(made);
        out.push({ kind: "aphids", clump: made });
      }
    } else if (tool === "crayon" || tool === "noEntry") {
      // A crayon is one colony's food trail; the no-entry paint is every colony's "no entry" (docs/builder.md "Slice 2").
      const probe: CrayonLine = {
        colony: tool === "noEntry" ? -1 : colony,
        layer,
        cells: [],
        age: 0,
        channel: tool === "noEntry" ? "noEntry" : "food",
      };
      if (!linePheromones(game, probe).length) return out;
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
      const line: CrayonLine = { ...probe, cells: open };
      if (line.channel === "food") delete line.channel; // a crayon's line saves as before
      game.crayons.push(line);
      stepCrayons(game, 0); // drawn at once, before the next tick
      out.push({ kind: "crayon", line });
    } else {
      // Rain: every colony's trails and alarm on this layer, and the crayon lines' cells under the cloud.
      const under = new Set<number>();
      for (let k = 0; k < cells.length; k += 2) under.add((cells[k + 1]! + 0x8000) * 0x10000 + (cells[k]! + 0x8000));
      game.colonies.forEach((c, ci) => {
        if (game.isFrozen(ci)) return; // rain does not wash a sleeper's trails
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
    // Undone builds are not watched: no "all gone" for sugar a child took back, no "home" for an ant put back.
    const undoneFood = new Set(changes.flatMap((c) => (c.kind === "food" ? [`${c.x},${c.y}`] : [])));
    if (undoneFood.size) this.#food = this.#food.filter((w) => !w.cells.some((c) => undoneFood.has(`${c.x},${c.y}`)));
    for (const c of changes) if (c.kind === "ant") this.#moved = this.#moved.filter((m) => !(m.colony === c.colony && m.i === c.i));
    for (const c of changes) if (c.kind === "aphids") this.#clumps.delete(c.clump);
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
        // Reopened, a chamber cell goes back to its chamber: only an ant digging a chamber face claims one otherwise.
        if (setTerrain(c.map, c.x, c.y, c.was) && c.was === OPEN && c.chamber >= 0)
          c.map.chambers?.claim(c.chamber, c.x, c.y, openCell(c.map));
      } else if (c.kind === "food") {
        const v = c.map.food.get(c.x, c.y);
        const take = Math.min(v, c.added);
        if (take <= 0) continue;
        c.map.food.set(c.x, c.y, v - take);
        c.map.foodLeft -= take;
        c.map.foodTotal -= take;
        if (c.map.quality && v - take <= 0) c.map.quality.set(c.x, c.y, c.quality);
      } else if (c.kind === "aphids") {
        // The clump goes; honeydew it already made stays where it lies, as food.
        const at = game.aphids.indexOf(c.clump);
        if (at >= 0) game.aphids.splice(at, 1);
      } else if (c.kind === "aphidsMore") {
        // A drag's pieces share one undo with the clump it began: this shrinks a clump the same undo then removes (defensive).
        const drop = new Set<number>();
        for (let j = 0; j < c.cells.length; j += 2) drop.add((c.cells[j + 1]! + 0x8000) * 0x10000 + (c.cells[j]! + 0x8000));
        const kept: number[] = [];
        for (let j = 0; j < c.clump.cells.length; j += 2) {
          const x = c.clump.cells[j] as number;
          const y = c.clump.cells[j + 1] as number;
          if (!drop.has((y + 0x8000) * 0x10000 + (x + 0x8000))) kept.push(x, y);
        }
        c.clump.cells = kept;
        c.clump.start = Math.max(0, c.clump.start - c.start);
      } else if (c.kind === "crayon") {
        const at = game.crayons.indexOf(c.line);
        if (at >= 0) game.crayons.splice(at, 1);
        const level = crayonLevel(c.line.age);
        for (const ph of linePheromones(game, c.line)) {
          const f = ph.fields[c.line.channel ?? "food"];
          for (let j = 0; j < c.line.cells.length; j += 2) {
            const x = c.line.cells[j] as number;
            const y = c.line.cells[j + 1] as number;
            f.set(x, y, Math.max(0, f.get(x, y) - level));
          }
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
        const level = crayonLevel(c.line.age);
        for (const ph of linePheromones(game, c.line)) {
          const f = ph.fields[c.line.channel ?? "food"];
          for (let j = 0; j < c.cells.length; j += 2)
            f.set(c.cells[j]!, c.cells[j + 1]!, Math.max(0, f.get(c.cells[j]!, c.cells[j + 1]!) - level));
        }
      } else if (c.kind === "ant") {
        // Back where the finger picked it up, if it is still that ant, on the plane, and the ground there is open.
        const col = game.colonies[c.colony];
        if (!col || !col.alive[c.i] || col.gen[c.i] !== c.gen || col.layer[c.i] !== PLANE) continue;
        const bx = col.x[c.i]! - c.dx;
        const by = col.y[c.i]! - c.dy;
        cellOf(bx, by);
        if (rockAt(layerMap(game, PLANE), CELL[0], CELL[1]) !== OPEN) continue;
        col.putAnt(c.i, PLANE, bx, by);
        col.carriedX[c.i] -= c.dx;
        col.carriedY[c.i] -= c.dy;
      } else if (c.kind === "rain") {
        const ph = game.colonies[c.colony]?.layers[c.layer]?.ph;
        // not into a colony asleep now: it stands as it was, an undo included
        if (ph && !game.isFrozen(c.colony) && ph.fields[c.channel].get(c.x, c.y) < c.was)
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
