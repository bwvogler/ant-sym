import assert from "node:assert/strict";
import { test } from "node:test";
import { CELL, cellOf, centreX, centreY, INFECTED, PLANE, type Colony } from "../../colony/index.ts";
import { toScreen } from "../camera.ts";
import { inspectCell } from "../cellInspection.ts";
import { drawPen } from "../field/overlays.ts";
import { chamberUnder, pickAnt } from "../field/hit.ts";
import { prepareFrame } from "../field/prelude.ts";
import { GRACE, Knowledge } from "../fog/knowledge.ts";
import { sensedFor } from "../fog/sources.ts";
import { probe, lensLines } from "../lens.ts";
import { living, specimenRow, type Specimen } from "../specimens.ts";
import { SensedMap } from "../fungusSight.ts";
import { buildGame } from "../useColony.ts";
import { recordingContext } from "./recordingContext.ts";

// The cards, the click and the follow under the fog (docs/fog-of-war.md §5.2, ja-1ypq.4): only what an observer senses now can be picked or followed;
// a place only remembered says how it was and when; a place never sensed says nothing.

const host = (x: number, y: number, layer = PLANE, n = 1): Colony =>
  ({
    n,
    params: { sensorDistance: 3 },
    alive: Uint8Array.of(1),
    load: Float32Array.of(INFECTED),
    layer: Uint8Array.of(layer),
    x: Float32Array.of(x),
    y: Float32Array.of(y),
  }) as unknown as Colony;
const hostAt = (gx: number, gy: number, layer = PLANE) => host(centreX(gx, gy), centreY(gy), layer);
const none = () => host(0, 0, PLANE, 0);

/** An ant of `n` slots at the given cells, healthy. */
function ants(cells: [number, number][]): Colony {
  return {
    n: cells.length,
    alive: Uint8Array.from(cells.map(() => 1)),
    layer: Uint8Array.from(cells.map(() => PLANE)),
    gen: Uint8Array.from(cells.map(() => 0)),
    load: Float32Array.from(cells.map(() => 0)),
    mode: Uint8Array.from(cells.map(() => 0)),
    carrying: Uint8Array.from(cells.map(() => 0)),
    fatigue: Float32Array.from(cells.map(() => 0)),
    params: { patience: 60 },
    x: Float32Array.from(cells.map(([gx, gy]) => centreX(gx, gy))),
    y: Float32Array.from(cells.map(([, gy]) => centreY(gy))),
  } as unknown as Colony;
}

test("a click picks an ant only where an observer senses it now", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const col = ants([
    [20, 20],
    [60, 20],
    [100, 20],
  ]);
  const cam = { x: 50, y: 20, zoom: 10 };
  const v = { w: 4000, h: 1000, dpr: 1 };
  const pickAt = (i: number, f: Knowledge | null) => {
    const [sx, sy] = toScreen(cam, v, col.x[i]!, col.y[i]!);
    return pickAnt([col], cam, v, 1, PLANE, sx, sy, f)?.i ?? null;
  };
  assert.equal(pickAt(1, null), 1, "without the fog any ant");
  assert.equal(pickAt(1, fog), null, "nothing sensed: none");
  sensed.stamp([hostAt(60, 20)], 1);
  assert.equal(pickAt(1, fog), 1, "live: picked");
  assert.equal(pickAt(0, fog), null, "an ant elsewhere, unsensed");
  sensed.stamp([none()], 1 + GRACE + 1);
  assert.equal(pickAt(1, fog), null, "remembered: not picked, though an ant may stand there");
});

test("a chamber nothing has sensed is not there to click", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const map = { chambers: { at: () => 0, list: [{ colony: 0 }] } } as never;
  const colonies = [{ params: { nest: 0 }, home: 0, layers: [{ map }] }] as never;
  const cam = { x: 20, y: 20, zoom: 10 };
  const v = { w: 800, h: 600, dpr: 1 };
  const [sx, sy] = toScreen(cam, v, centreX(20, 20), centreY(20));
  assert.deepEqual(chamberUnder(map, colonies, cam, v, sx, sy, { knowledge: fog, lv: PLANE }), null, "unsensed");
  sensed.stamp([hostAt(20, 20)], 1);
  assert.deepEqual(chamberUnder(map, colonies, cam, v, sx, sy, { knowledge: fog, lv: PLANE }), { k: 0, id: 0 }, "sensed");
  assert.deepEqual(chamberUnder(map, colonies, cam, v, sx, sy), { k: 0, id: 0 }, "no fog: as before");
});

test("following a non-host ends when it walks out of every observer's sight, and says so; a host stays followed", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const col = ants([[30, 30]]);
  const hostCol = host(centreX(30, 30), centreY(30));
  const f = { k: 0, i: 0, gen: 0 };
  const run = (lit: boolean) => {
    const follow = { current: f as typeof f | null };
    const lost: unknown[] = [];
    const ended: unknown[] = [];
    sensed.stamp([lit ? hostCol : none()], lit ? 1 : 1 + GRACE + 1);
    prepareFrame(
      [col],
      PLANE,
      { x0: 0, w: 512, h: 368 },
      { w: 800, h: 600, dpr: 1 },
      { cam: { x: 0, y: 0, zoom: 10 }, fitted: false, zoomedIn: false, aim: null } as never,
      {
        follow,
        followCb: { current: (g) => ended.push(g) },
        antLayer: { current: null },
        carryTo: { current: null },
        crossCb: { current: undefined },
        lostCb: { current: (g) => lost.push(g) },
        fog,
      },
    );
    return { follow: follow.current, lost, ended };
  };
  const seen = run(true);
  assert.deepEqual([seen.follow, seen.lost.length], [f, 0], "sensed: followed");
  const away = run(false);
  assert.deepEqual([away.follow, away.lost, away.ended], [null, [f], [null]], "out of sight: the follow ends, and the page is told");
});

test("the lens: nothing of a place never sensed; how it was and when for one only remembered", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 20, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  const plane = game.world.plane;
  const q: [number, number] = [200, 200];
  const [x, y] = [centreX(q[0], q[1]), centreY(q[1])];
  plane.food.set(q[0], q[1], 0.5);
  const g = { colonies: game.colonies, fungus: game.fungus, world: game.world };
  const says = () => lensLines(probe(g, sensed, PLANE, x, y), null).map((l) => l.what);
  assert.deepEqual(says(), ["Unexplored"], "never sensed");
  sensed.stamp([hostAt(q[0], q[1])], 1);
  assert.ok(says().includes("Food") && !says().includes("Last seen"), "live: the food, no 'last seen'");
  sensed.stamp([none()], 1 + GRACE + 9);
  plane.food.set(q[0], q[1], 0); // eaten while nobody was there
  const away = lensLines(probe(g, sensed, PLANE, x, y), null);
  assert.ok(
    away.some((l) => l.what === "Food"),
    "remembered: the food as last seen, not as it is now",
  );
  const seen = away.find((l) => l.what === "Last seen")!;
  assert.ok(/^\d+ s ago/.test(seen.says), `the age: ${seen.says}`);
});

test("inspecting a cell: nothing if never sensed; no ant of a remembered one; the dead as they lay; the whole of a live one", () => {
  const game = buildGame({ species: "generic", seed: 3, antCount: 40, rival: true, generation: 0 });
  const sensed = sensedFor(game, true);
  const col = game.colonies[0]!;
  let i = 0;
  while (!col.alive[i]) i++;
  const layer = col.layer[i]!;
  cellOf(col.x[i]!, col.y[i]!);
  const [gx, gy] = [CELL[0], CELL[1]];
  const g = { colonies: game.colonies, fungus: game.fungus, world: game.world };
  const read = () => inspectCell(g, sensed, layer, centreX(gx, gy), centreY(gy), { food: true, home: true });
  assert.deepEqual([read().ants.length, read().cadavers!.length], [0, 0], "never sensed: nothing");
  col.corpses.push({ x: gx, y: gy, held: -1, died: col.time, heading: 0, load: 0, strain: 0, layer });
  sensed.stamp([hostAt(gx, gy, layer)], 1);
  sensed.corpses!.update(game, sensed.knowledge!, () => 2);
  assert.ok(read().ants.length > 0 && read().cadavers!.length >= 1, "live: the ant and the dead");
  sensed.stamp([none()], 1 + GRACE + 1);
  col.corpses.length = 0; // carried off while nobody was there
  const r = read();
  assert.equal(r.ants.length, 0, "remembered: no ant (they are never remembered)");
  assert.equal(r.cadavers!.length, 1, "the dead as they lay when last seen");
});

test("specimens out of sight: no death news from where nobody sees, and the row says only who it is", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const col = ants([[30, 30]]);
  const s: Specimen = { k: 0, i: 0, gen: 0, no: 1 };
  assert.equal(specimenRow([col], s, fog)!.lost, true, "alive, unsensed: lost sight");
  sensed.stamp([hostAt(30, 30)], 1);
  assert.equal(specimenRow([col], s, fog)!.lost, undefined, "sensed: the row");
  sensed.stamp([none()], 1 + GRACE + 1);
  (col as { alive: Uint8Array }).alive[0] = 0; // it dies where nobody sees
  assert.deepEqual(living([s], [col], fog), { kept: [s], gone: [] }, "unseen death: still a specimen, out of sight");
  assert.equal(specimenRow([col], s, fog)!.lost, true);
  sensed.stamp([hostAt(30, 30)], 1 + GRACE + 2);
  assert.deepEqual(living([s], [col], fog), { kept: [], gone: [s] }, "seen to be gone: it leaves");
});

test("the queen's pen asks no preview of ground the fungus has not sensed", () => {
  const sensed = new SensedMap();
  const fog = new Knowledge(sensed, []);
  const rec = recordingContext();
  let asked = 0;
  const pn = { x: 20, y: 20, r: 50, preview: () => (asked++, { ok: false, reason: "too far" }) };
  const cam = { x: 20, y: 20, zoom: 10 };
  const v = { w: 800, h: 600, dpr: 1 };
  const [hx, hy] = toScreen(cam, v, centreX(40, 40), centreY(40));
  const k = { ctx: rec.ctx, theme: { accent: "#a", warn: "#w", ink: "#i", paper: "#p" }, c: cam, v, d: 1, world: {}, fog } as never;
  const inp = { pen: pn, hover: [hx, hy], penSeen: { current: null } } as never;
  drawPen(k, inp);
  assert.equal(asked, 0, "unsensed: no preview and no reason");
  sensed.stamp([hostAt(40, 40)], 1);
  drawPen(k, inp);
  assert.equal(asked, 1, "sensed: the preview");
});
