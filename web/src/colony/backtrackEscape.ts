import type { Colony } from "./colony.ts";
import { cellKey, hexDistance, nx, ny } from "./hex.ts";
import { isSky, OPEN, rockAt } from "./world.ts";

interface Trail {
  last: number;
  previous: number;
  age: number;
  at: number;
  load: number;
  reversals: number;
}

const memorySeconds = 2;

export const backtrackEscapes = new WeakMap<Colony, ReturnType<typeof createBacktrackEscape>>();

function loadOf(colony: Colony, ant: number): number {
  return Number(Boolean(colony.carrying[ant])) | (Number(Boolean(colony.pellet[ant])) << 1) | (Number(Boolean(colony.broodHeld[ant])) << 2);
}

export function createBacktrackEscape(
  colony: Colony,
  steer = true,
  onNoExit?: (ant: number, x: number, y: number, backX: number, backY: number, load: number) => void,
) {
  const trails = new Map<number, Trail>();
  let tries = 0;
  let noExit = 0;
  let withExit = 0;

  function moved(ant: number, x: number, y: number, toX: number, toY: number) {
    const load = loadOf(colony, ant);
    if (!load || colony.cur !== colony.home || colony.onPlane || isSky(colony.map, x, y) || isSky(colony.map, toX, toY)) {
      trails.delete(ant);
      return;
    }
    if (x === toX && y === toY) return;
    if (hexDistance(x, y, toX, toY) !== 1) {
      trails.delete(ant);
      return;
    }
    const from = cellKey(x, y);
    const to = cellKey(toX, toY);
    const trail = trails.get(ant);
    const sameTrip = trail?.last === from && trail.load === load && trail.age <= colony.age[ant] && colony.time - trail.at <= memorySeconds;
    const reversals = sameTrip && trail.previous === to ? trail.reversals + 1 : 0;
    trails.set(ant, { last: to, previous: from, at: colony.time, load, age: colony.age[ant], reversals });
  }

  function choose(ant: number, x: number, y: number, planned: number, cue: (x: number, y: number) => number): number {
    const trail = trails.get(ant);
    if (
      !trail ||
      trail.reversals < 2 ||
      trail.last !== cellKey(x, y) ||
      trail.load !== loadOf(colony, ant) ||
      trail.age > colony.age[ant] ||
      colony.time - trail.at > memorySeconds ||
      trail.previous !== cellKey(nx(x, y, planned), ny(y, planned))
    )
      return planned;

    let best = -1;
    let bestCue = -Infinity;
    for (const turn of [3, 2, -2, 1, -1]) {
      const direction = (planned + turn + 6) % 6;
      const tx = nx(x, y, direction);
      const ty = ny(y, direction);
      if (isSky(colony.map, tx, ty) || rockAt(colony.map, tx, ty) !== OPEN) continue;
      const score = cue(tx, ty);
      if (score > bestCue) {
        best = direction;
        bestCue = score;
      }
    }
    trail.reversals = 0;
    if (best < 0) {
      noExit++;
      onNoExit?.(ant, x, y, nx(x, y, planned), ny(y, planned), trail.load);
      return planned;
    }
    withExit++;
    if (!steer) return planned;
    tries++;
    return best;
  }

  return { moved, choose, checkpoint: () => ({ tries, noExit, withExit }) };
}
