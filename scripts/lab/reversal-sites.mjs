import { crust } from "../../web/src/colony/dig.ts";
import { diggable, floorGround, refilled, startable } from "../../web/src/colony/grid.ts";
import { cellKey, nx, ny } from "../../web/src/colony/hex.ts";
import { isSky, OPEN, SOIL, rockAt } from "../../web/src/colony/world.ts";

const windowSeconds = 20;

function adjacentFaces(colony, x, y, backX, backY) {
  const map = colony.map;
  const faces = [];
  for (let direction = 0; direction < 6; direction++) {
    const fx = nx(x, y, direction);
    const fy = ny(y, direction);
    if (rockAt(map, fx, fy) !== SOIL || isSky(map, fx, fy) || crust(colony, fx, fy)) continue;
    if (refilled(map, fx, fy, colony.time, colony.params.backfill.hold) || floorGround(map, fx, fy)) continue;
    let touchesReturnCell = false;
    let touchesOtherOpenCell = false;
    for (let d = 0; d < 6; d++) {
      const xx = nx(fx, fy, d);
      const yy = ny(fy, d);
      if (rockAt(map, xx, yy) !== OPEN || isSky(map, xx, yy) || (xx === x && yy === y)) continue;
      if (xx === backX && yy === backY) touchesReturnCell = true;
      else touchesOtherOpenCell = true;
    }
    const opens = touchesOtherOpenCell ? "other-open-ground" : touchesReturnCell ? "beside-return-edge" : "pocket";
    const ordinaryFace = diggable(map, fx, fy, direction) || startable(map, fx, fy, direction);
    faces.push({ x: fx, y: fy, opens, ordinaryFace });
  }
  return faces;
}

function observeWindow(state, ant, now) {
  state.recent.set(ant, now);
  for (const [slot, at] of state.recent) {
    if (now - at > windowSeconds) state.recent.delete(slot);
  }
  state.peakSlotsIn20s = Math.max(state.peakSlotsIn20s, state.recent.size);
}

const rounded = (seconds) => Math.round(seconds * 10) / 10;
const loadNames = { 1: "food", 2: "spoilOrCorpse", 4: "brood" };

export function observeReversalSites(colony) {
  const sites = new Map();

  function record(ant, x, y, backX, backY, load) {
    const key = cellKey(x, y);
    const now = colony.time;
    let site = sites.get(key);
    if (!site) {
      site = {
        x,
        y,
        events: 0,
        loads: {},
        slots: new Set(),
        recent: new Map(),
        peakSlotsIn20s: 0,
        first: now,
        last: now,
        faces: new Map(),
      };
      sites.set(key, site);
    }
    site.events++;
    site.slots.add(ant);
    site.last = now;
    const loadName = loadNames[load] ?? "mixed";
    site.loads[loadName] = (site.loads[loadName] ?? 0) + 1;
    observeWindow(site, ant, now);

    for (const face of adjacentFaces(colony, x, y, backX, backY)) {
      const id = cellKey(face.x, face.y);
      const earlier = site.faces.get(id);
      let entry = earlier?.get(face.opens);
      if (!entry) {
        entry = {
          x: face.x,
          y: face.y,
          opens: face.opens,
          events: 0,
          ordinaryFaceEvents: 0,
          slots: new Set(),
          recent: new Map(),
          peakSlotsIn20s: 0,
        };
        if (earlier) earlier.set(face.opens, entry);
        else site.faces.set(id, new Map([[face.opens, entry]]));
      }
      entry.events++;
      if (face.ordinaryFace) entry.ordinaryFaceEvents++;
      entry.slots.add(ant);
      observeWindow(entry, ant, now);
    }
  }

  function checkpoint() {
    return [...sites.values()]
      .map((site) => ({
        x: site.x,
        y: site.y,
        events: site.events,
        workerSlots: site.slots.size,
        peakSlotsIn20s: site.peakSlotsIn20s,
        firstSeconds: rounded(site.first),
        lastSeconds: rounded(site.last),
        loads: { ...site.loads },
        faces: [...site.faces.values()]
          .flatMap((entries) => [...entries.values()])
          .map((face) => ({
            x: face.x,
            y: face.y,
            opens: face.opens,
            events: face.events,
            ordinaryFaceEvents: face.ordinaryFaceEvents,
            workerSlots: face.slots.size,
            peakSlotsIn20s: face.peakSlotsIn20s,
          })),
      }))
      .sort((a, b) => b.events - a.events || b.peakSlotsIn20s - a.peakSlotsIn20s);
  }

  return { record, checkpoint };
}
