import { cellKey, centreX, centreY, hexDistance, keyX, keyY } from "../../web/src/colony/hex.ts";
import { isSky, rockAt, ROCK, SOIL } from "../../web/src/colony/world.ts";

const stallAfter = 5;
const maxLapCells = 16;
const maxStepSeconds = 2;
const maxLapSeconds = 12;

function enclosedSolid(map, keys) {
  const xs = keys.map((key) => keyX(key));
  const ys = keys.map((key) => keyY(key));
  const polygon = keys.map((key) => [centreX(keyX(key), keyY(key)), centreY(keyY(key))]);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x++) {
      const terrain = rockAt(map, x, y);
      if (terrain !== ROCK && terrain !== SOIL) continue;
      const px = centreX(x, y);
      const py = centreY(y);
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [ax, ay] = polygon[i];
        const [bx, by] = polygon[j];
        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
      }
      if (inside) return cellKey(x, y);
    }
  }
  return null;
}

function repeatedLap(trail) {
  const end = trail.length - 1;
  for (let period = 2; period <= maxLapCells && 2 * period <= end; period++) {
    const middle = end - period;
    const start = middle - period;
    if (trail[end].at - trail[middle].at > maxLapSeconds || trail[middle].at - trail[start].at > maxLapSeconds) continue;
    if (trail[end].cell !== trail[middle].cell || trail[end].cell !== trail[start].cell) continue;
    let same = true;
    for (let j = 1; j < period; j++) {
      if (trail[start + j].cell !== trail[middle + j].cell) {
        same = false;
        break;
      }
    }
    if (!same) continue;
    const cells = trail.slice(middle, end).map(({ cell }) => cell);
    if (new Set(cells).size === period) return { period, cells, at: trail[start].at };
  }
  return null;
}

export function observeNestMilling(colony, sampleSeconds) {
  const map = colony.layers[colony.home].map;
  const tracks = new Map();
  const sites = new Map();
  let outsideLobby = 0;
  let lobby = 0;
  let entrance = 0;
  let stationary = 0;
  let loadedStationary = 0;
  let backtrack = 0;
  let islandLoop = 0;
  let otherLoop = 0;
  let loadedLoop = 0;

  function sample(ant, x, y) {
    if (x === undefined || isSky(map, x, y)) {
      tracks.delete(ant);
      return;
    }
    const room = map.chambers?.list[map.chambers.at(x, y)];
    const ownRoom = room?.colony === colony.params.nest ? room.role : undefined;
    if (ownRoom === "reception") {
      lobby++;
      tracks.delete(ant);
      return;
    }
    if (hexDistance(x, y, colony.entranceCol, colony.entranceRow) <= 2) {
      entrance++;
      tracks.delete(ant);
      return;
    }
    outsideLobby++;
    const now = colony.time;
    const cell = cellKey(x, y);
    const load = (colony.carrying[ant] ? 1 : 0) | (colony.pellet[ant] ? 2 : 0) | (colony.broodHeld[ant] ? 4 : 0);
    const crop = colony.crop[ant];
    const working = colony.digT[ant] > 0;
    const current = tracks.get(ant);
    if (working || (current && current.crop !== crop)) {
      tracks.delete(ant);
      return;
    }
    if (!current || current.load !== load || current.age > colony.age[ant]) {
      tracks.set(ant, { crop, load, age: colony.age[ant], trail: [{ cell, at: now }], coveredUntil: now });
      return;
    }
    current.age = colony.age[ant];
    const { trail } = current;
    const last = trail.at(-1);
    if (cell === last.cell) {
      // Unloaded workers can feed brood by remaining close in the nursery.
      if (now - last.at >= stallAfter && (load || (ownRoom !== "brood" && ownRoom !== "royal"))) {
        stationary++;
        if (load) loadedStationary++;
      }
      return;
    }
    if (now - last.at > maxStepSeconds || hexDistance(x, y, keyX(last.cell), keyY(last.cell)) !== 1) trail.length = 0;
    trail.push({ cell, at: now });
    if (trail.length > maxLapCells * 2 + 1) trail.shift();
    const lap = repeatedLap(trail);
    if (!lap) {
      current.loop = undefined;
      return;
    }
    const seconds = now - Math.max(lap.at, current.coveredUntil);
    current.coveredUntil = now;
    if (lap.period === 2) {
      backtrack += seconds;
    } else {
      const island = current.loop?.period === lap.period ? current.loop.island : enclosedSolid(map, lap.cells);
      current.loop = { period: lap.period, island };
      if (island === null) otherLoop += seconds;
      else {
        islandLoop += seconds;
        sites.set(island, (sites.get(island) ?? 0) + seconds);
      }
    }
    if (load) loadedLoop += seconds;
  }

  function checkpoint() {
    const round = (v) => Math.round(v * 10) / 10;
    const outsideLobbySeconds = outsideLobby * sampleSeconds;
    const suspected = stationary * sampleSeconds + backtrack + islandLoop + otherLoop;
    return {
      outsideLobbyWorkerSeconds: round(outsideLobbySeconds),
      receptionWorkerSeconds: round(lobby * sampleSeconds),
      entranceWorkerSeconds: round(entrance * sampleSeconds),
      stationaryWorkerSeconds: round(stationary * sampleSeconds),
      loadedStationaryWorkerSeconds: round(loadedStationary * sampleSeconds),
      repeatedBacktrackWorkerSeconds: round(backtrack),
      islandLoopWorkerSeconds: round(islandLoop),
      otherLoopWorkerSeconds: round(otherLoop),
      loadedLoopWorkerSeconds: round(loadedLoop),
      suspectedWorkerSeconds: round(suspected),
      suspectedShare: outsideLobbySeconds > 0 ? suspected / outsideLobbySeconds : null,
      busiestIslands: [...sites]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key, seconds]) => ({ x: keyX(key), y: keyY(key), workerSeconds: round(seconds) })),
    };
  }
  return { sample, checkpoint };
}
