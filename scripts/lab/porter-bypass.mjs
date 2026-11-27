import { bypassPolicies } from "../../web/src/colony/bypassPolicy.ts";
import { refilled } from "../../web/src/colony/grid.ts";
import { cellKey, keyX, keyY, nx, ny } from "../../web/src/colony/hex.ts";
import { OPEN, SOIL, isSky, rockAt } from "../../web/src/colony/world.ts";

const pressureWindow = 20;
const minimumReversingSlots = 3;
const minimumDetour = 5;
const maximumDetour = 10;
const excavationLimit = 4;

function undergroundOpen(map, x, y) {
  return !isSky(map, x, y) && rockAt(map, x, y) === OPEN;
}

function nextToSky(map, x, y) {
  for (let d = 0; d < 6; d++) if (isSky(map, nx(x, y, d), ny(y, d))) return true;
  return false;
}

function routeDistance(map, from, to) {
  const visited = new Set(from);
  let frontier = from;
  for (let distance = 1; distance <= maximumDetour && frontier.length; distance++) {
    const next = [];
    for (const key of frontier) {
      for (let d = 0; d < 6; d++) {
        const x = nx(keyX(key), keyY(key), d);
        const y = ny(keyY(key), d);
        if (!undergroundOpen(map, x, y)) continue;
        const neighbor = cellKey(x, y);
        if (visited.has(neighbor)) continue;
        if (to.includes(neighbor)) return distance;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return Infinity;
}

function openingDetour(map, x, y) {
  const ring = Array.from({ length: 6 }, (_, d) => {
    const xx = nx(x, y, d);
    const yy = ny(y, d);
    return undergroundOpen(map, xx, yy) ? cellKey(xx, yy) : null;
  });
  const groups = [];
  const gap = ring.indexOf(null);
  if (gap < 0) return Infinity;
  for (let offset = 1; offset <= 6; offset++) {
    const d = (gap + offset) % 6;
    if (ring[d] === null) continue;
    if (ring[(d + 5) % 6] === null) groups.push([]);
    groups.at(-1).push(ring[d]);
  }
  return groups.length === 2 ? routeDistance(map, ...groups) : Infinity;
}

export function installPorterBypass(colony) {
  const map = colony.layers[colony.home].map;
  const pressure = new Map();
  const aimed = new Map();
  const opened = new Map();
  let choices = new Map();
  let selections = 0;
  let peakEligibleFaces = 0;

  function reversal(cell, ant) {
    const slots = pressure.get(cell) ?? new Map();
    slots.set(ant, colony.time);
    pressure.set(cell, slots);
  }

  function refresh() {
    choices = new Map();
    if (opened.size >= excavationLimit) return;
    const faces = new Map();
    for (const [cell, slots] of pressure) {
      for (const [ant, at] of slots) if (colony.time - at > pressureWindow) slots.delete(ant);
      if (!slots.size) pressure.delete(cell);
      if (slots.size < minimumReversingSlots) continue;
      const x = keyX(cell);
      const y = keyY(cell);
      if (!undergroundOpen(map, x, y)) continue;
      for (let d = 0; d < 6; d++) {
        const xx = nx(x, y, d);
        const yy = ny(y, d);
        const face = cellKey(xx, yy);
        if (opened.has(face) || rockAt(map, xx, yy) !== SOIL || nextToSky(map, xx, yy)) continue;
        if (refilled(map, xx, yy, colony.time, colony.params.backfill.hold)) continue;
        if (!faces.has(face)) faces.set(face, openingDetour(map, xx, yy));
        const detour = faces.get(face);
        if (detour < minimumDetour || detour > maximumDetour) continue;
        const prior = choices.get(cell);
        if (!prior || detour > prior.detour) choices.set(cell, { face, d, detour });
      }
    }
    peakEligibleFaces = Math.max(peakEligibleFaces, new Set([...choices.values()].map((choice) => choice.face)).size);
  }

  bypassPolicies.set(colony, {
    choose(ant, x, y) {
      if (opened.size >= excavationLimit) return -1;
      const choice = choices.get(cellKey(x, y));
      if (!choice || rockAt(map, keyX(choice.face), keyY(choice.face)) !== SOIL) return -1;
      if (aimed.get(ant)?.face !== choice.face) selections++;
      aimed.set(ant, choice);
      return choice.d;
    },
    aimedAt(ant, x, y) {
      return opened.size < excavationLimit && aimed.get(ant)?.face === cellKey(x, y);
    },
    opened(ant, x, y) {
      const key = cellKey(x, y);
      const choice = aimed.get(ant);
      aimed.delete(ant);
      if (choice?.face === key) opened.set(key, { x, y, seconds: colony.time, previousRouteSteps: choice.detour, porterEntries: 0 });
    },
  });
  return {
    reversal,
    visit(cell) {
      const site = opened.get(cell);
      if (site) site.porterEntries++;
    },
    refresh,
    checkpoint: () => ({ selections, peakEligibleFaces, opened: [...opened.values()].map((site) => ({ ...site })) }),
  };
}
