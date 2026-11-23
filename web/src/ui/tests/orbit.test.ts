import assert from "node:assert/strict";
import { test } from "node:test";
import type { Camera } from "../camera.ts";
import { orbitKey, resetOrbit, tiltMap, type OrbitHost } from "../field/orbit.ts";
import { mapOrbit, tiltFromDrag, type InspectionOrbit } from "../inspectionOrbit.ts";
import { MAP_ORBIT_READY_ZOOM } from "../mapVoxel.ts";

// The inspection tilt of the close map (ja-fnd.6.3.12): what a drag of the orbit handle and its keys do to the orbit and the camera.

function host(o: { zoom?: number; dpr?: number; orbit?: InspectionOrbit } = {}) {
  const st = { orbit: o.orbit ?? mapOrbit(), cam: { x: 10, y: 20, zoom: o.zoom ?? 1 } as Camera, sets: [] as Camera[] };
  const h: OrbitHost = {
    orbit: {
      get current() {
        return st.orbit;
      },
      set current(v) {
        st.orbit = v;
      },
    },
    camera: () => st.cam,
    setCamera: (c) => (st.sets.push(c), (st.cam = c)),
    dpr: () => o.dpr ?? 1,
  };
  return { st, h };
}

test("a drag tilts the map from where it started, upright in yaw, and zooms in to the close view first when the camera is farther out", () => {
  const { st, h } = host({ zoom: 2 });
  const start = mapOrbit();
  tiltMap(h, start, -60);
  const tilt = tiltFromDrag(start, -60);
  assert.notEqual(tilt, 0, "a drag up tilts");
  assert.deepEqual(st.orbit, { yaw: 0, tilt });
  assert.deepEqual(st.sets, [{ x: 10, y: 20, zoom: MAP_ORBIT_READY_ZOOM }], "zoomed to the ready zoom, the centre kept");
});

test("the ready zoom is in device pixels, and a camera already at it or past it is left alone", () => {
  const dpr2 = host({ zoom: 2, dpr: 2 });
  tiltMap(dpr2.h, mapOrbit(), -60);
  assert.equal(dpr2.st.sets[0]!.zoom, MAP_ORBIT_READY_ZOOM * 2);
  const close = host({ zoom: MAP_ORBIT_READY_ZOOM });
  tiltMap(close.h, mapOrbit(), -60);
  assert.deepEqual(close.st.sets, [], "at the ready zoom");
  const past = host({ zoom: MAP_ORBIT_READY_ZOOM * 3 });
  tiltMap(past.h, mapOrbit(), -60);
  assert.deepEqual(past.st.sets, [], "past it");
  assert.notEqual(past.st.orbit.tilt, 0, "the tilt was set");
});

test("a drag that gives the tilt it already has changes nothing (no zoom, no orbit write)", () => {
  const { st, h } = host({ zoom: 2, orbit: { yaw: 0.4, tilt: tiltFromDrag(mapOrbit(), -60) } });
  const before = st.orbit;
  tiltMap(h, mapOrbit(), -60);
  assert.equal(st.orbit, before, "the same object: untouched, its yaw too");
  assert.deepEqual(st.sets, []);
});

test("Home and Escape stand the map upright; the arrows step the tilt by 12 from where it is; any other key is not the handle's", () => {
  const { st, h } = host({ zoom: MAP_ORBIT_READY_ZOOM, orbit: { yaw: 0, tilt: tiltFromDrag(mapOrbit(), -60) } });
  assert.equal(orbitKey(h, "Home"), true);
  assert.deepEqual(st.orbit, mapOrbit());
  st.orbit = { yaw: 0, tilt: tiltFromDrag(mapOrbit(), -60) };
  assert.equal(orbitKey(h, "Escape"), true);
  assert.deepEqual(st.orbit, mapOrbit());
  const base = mapOrbit();
  assert.equal(orbitKey(h, "ArrowUp"), true);
  assert.deepEqual(st.orbit, { yaw: 0, tilt: tiltFromDrag(base, -12) }, "up steps by -12");
  const up = st.orbit;
  assert.equal(orbitKey(h, "ArrowDown"), true);
  assert.deepEqual(st.orbit, { yaw: 0, tilt: tiltFromDrag(up, 12) }, "down by +12 from there");
  const keep = st.orbit;
  assert.equal(orbitKey(h, "a"), false);
  assert.equal(st.orbit, keep, "another key leaves it");
});

test("resetOrbit stands it upright without touching the camera", () => {
  const { st, h } = host({ orbit: { yaw: 0, tilt: 0.7 } });
  resetOrbit(h);
  assert.deepEqual(st.orbit, mapOrbit());
  assert.deepEqual(st.sets, []);
});
