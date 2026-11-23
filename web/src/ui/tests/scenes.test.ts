import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cellKey, centreX, centreY, CURTAIN, type Game, HYPHA_ROOT, Hyphae, PLANE, R } from "../../colony/index.ts";
import type { FieldPen } from "../field/ctx.ts";
import { stateAt } from "./recordingContext.ts";
import { renderScene, type Scene } from "./sceneHarness.ts";

// The renderer's scenes, headless (ja-fnd.6.3.9): each is one frame of FieldRenderer over a small real game on the recording context, with the sprite
// sets ready. The call log of each is kept as a golden (its hash, its length and its count of the calls that matter), so a change to any layer shows as
// a changed scene. `GOLDEN_WRITE=1` records them again. sceneHarness.ts says what the log cannot see; the Chromium scenes (scripts/field-shots.mjs) are the
// arbiter of pixels.
//
// How sharp the net is (measured when it was recorded): every stage dropped from the list, and every pair of neighbouring stages swapped, fails a scene
// (19 of 19; three of them, dropping the fungus or voxel stage and swapping the fungus with the actors, fail by a later stage throwing for want of what
// the dropped one leaves, not by a changed log). Of 70 sampled arithmetic mutants of the layer files (a seeded sample; the script is not kept), 43 fail one. The 27 that pass are clamps that no scene makes binding (a minimum of
// `7 * d` against a zoom term that is larger at these zooms), and paths no scene reaches (a carried ant's head offset, the brood's square, a nest's mound
// radius, the spore tint of the minimap). The fungal sprite set is never drawn (its stalks stand on colonised corpses, which a game this young has none of); the nest sheet is drawn only by the queen scenes, and the cadaver set by one corpse. Those are guarded by each layer's own log tests (ants, nests, marks, ground, fungus, overlays), which were swept
// the same way as they moved.

const FILE = fileURLToPath(new URL("./fixtures/scenes.json", import.meta.url));

const nest0 =
  (zoom: number): Scene["at"] =>
  (g) => ({ x: g.colonies[0]!.nest.x, y: g.colonies[0]!.nest.y, zoom });
/** The queen and the brood are on the home layer: a scene centred on the queen shows the nest sheet's sprites. */
const atQueen: Scene["at"] = (g) => ({ x: g.colonies[0]!.queen!.x, y: g.colonies[0]!.queen!.y, zoom: 24 });
/** A dead worker on the plane at the first ant: the cadaver sprite set draws it. */
const withCorpse = (g: Game) => {
  const a = antOn(g, PLANE);
  g.colonies[0]!.corpses.push({ x: a.x, y: a.y, held: -1, died: g.colonies[0]!.time - 30, heading: 0.5, load: 0, strain: 0, layer: PLANE });
};
const middle =
  (zoom: number): Scene["at"] =>
  (_g, e) => ({ x: e.x0 + e.w / 2, y: e.h / 2, zoom });
/** The first live ant of colony 0 on a layer: the scenes centre on it, and follow it, so there is something to draw at a zoom that shows ants. */
const antOn = (g: Game, layer: number) => {
  const col = g.colonies[0]!;
  let i = 0;
  while (!(col.alive[i] && col.layer[i] === layer)) i++;
  return { k: 0, i, gen: col.gen[i]!, x: col.x[i]!, y: col.y[i]! };
};
const atAnt =
  (layer: number, zoom: number): Scene["at"] =>
  (g) => {
    const a = antOn(g, layer);
    return { x: a.x, y: a.y, zoom };
  };

/** The time of day of the desert ant, as a fraction of its day (heat.ts: `(t + heatStart) / heatDay`). */
const setDay = (g: Game, frac: number) => {
  const p = g.colonies[0]!.params;
  g.colonies[0]!.time = frac * p.heatDay - p.heatStart + p.heatDay * 4;
};
/** The queen's pen over the first hole: a circle, and under the pointer a preview that always settles. */
const penAt = (g: Game, ok: boolean): FieldPen => {
  const h = g.world.line.holes[0]!;
  return {
    x: centreX(h.x, h.y),
    y: centreY(h.y),
    r: 5,
    preview: () =>
      ok ? ({ ok: true, cell: { x: h.x + 3, y: h.y }, end: "end" } as never) : ({ ok: false, reason: "too far from the line" } as never),
    onPick: () => {},
  };
};

/** Hyphae on the plane by the first nest: a run of eight cells east, a branch off the third (the game has none this young, so the fungus is given them). */
const withHyphae = (g: Game) => {
  const h = new Hyphae();
  const n = g.colonies[0]!.nest;
  const x0 = Math.round(n.x);
  const y = Math.round(n.y / R);
  h.parent.set(cellKey(x0, y), HYPHA_ROOT);
  for (let k = 1; k <= 8; k++) h.parent.set(cellKey(x0 + k, y), cellKey(x0 + k - 1, y));
  h.parent.set(cellKey(x0 + 3, y + 1), cellKey(x0 + 3, y));
  h.parent.set(cellKey(x0 + 3, y + 2), cellKey(x0 + 3, y + 1));
  h.fusions = [cellKey(x0 + 3, y + 2), cellKey(x0 + 6, y)];
  (g.fungus as unknown as { hyphaeOn: (l: number) => Hyphae | null }).hyphaeOn = (l) => (l === PLANE ? h : null);
};

export const SCENES: Record<string, Scene> = {
  "above-fit": { ticks: 200 },
  "above-nest0": { ticks: 200, at: nest0(24) },
  "above-nest0-near": { ticks: 200, at: nest0(60) },
  "above-ants": { ticks: 200, at: atAnt(PLANE, 24) },
  "above-followed": { ticks: 200, at: atAnt(PLANE, 24), follow: (g) => antOn(g, PLANE) },
  "below-labels": { ticks: 200, lv: CURTAIN, at: atAnt(CURTAIN, 24), labels: true, follow: (g) => antOn(g, CURTAIN) },
  "above-dark": { ticks: 200, at: atAnt(PLANE, 24), dark: true },
  "above-retina": { ticks: 100, at: nest0(24), size: { w: 1200, h: 800, dpr: 2 } },
  "above-smell": { ticks: 400, at: nest0(24), smell: true },
  "above-specimens": {
    ticks: 200,
    at: atAnt(PLANE, 24),
    size: { w: 800, h: 600, dpr: 2 },
    specimens: (g) => [{ ...antOn(g, PLANE), no: 1 }],
  },
  "far-aphids": {
    ticks: 200,
    at: nest0(10),
    aphids: (g) => {
      const n = g.colonies[0]!.nest;
      return [
        {
          layer: PLANE,
          cells: [Math.round(n.x) + 2, Math.round(n.y / R), Math.round(n.x) + 3, Math.round(n.y / R)],
          start: 4,
          eaten: 1,
          age: 0,
          owed: 0,
        },
      ];
    },
  },
  "far-ants": {
    ticks: 300,
    at: atAnt(PLANE, 10),
    size: { w: 800, h: 600, dpr: 2 },
    follow: (g) => antOn(g, PLANE),
    specimens: (g) => [{ ...antOn(g, PLANE), no: 2 }],
  },
  "far-nest": { ticks: 200, at: nest0(10), size: { w: 800, h: 600, dpr: 2 } },
  "far-hyphae": { ticks: 200, at: nest0(10), setup: withHyphae },
  "above-trace": {
    ticks: 200,
    at: nest0(24),
    traces: (g) => {
      const n = g.colonies[0]!.nest;
      const xs = [0, 1, 2, 3, 4, 5, 5.5, 5, 5.5, 6].map((k) => n.x + 2 + k);
      const ys = [0, 0, 0, 0, 0, 0, 0.6, 1.2, 1.8, 1.4].map((k) => n.y + k);
      return [{ colony: 0, i: 0, gen: 0, move: 1, xs, ys, search: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1], done: null, end: null }];
    },
  },
  "far-followed-low": { ticks: 200, at: atAnt(PLANE, 4), size: { w: 800, h: 600, dpr: 2 }, follow: (g) => antOn(g, PLANE) },
  "above-pen": { ticks: 200, at: nest0(24), pen: (g) => penAt(g, true), hover: [400, 300] },
  "above-pen-refused": { ticks: 200, at: nest0(24), size: { w: 800, h: 600, dpr: 2 }, pen: (g) => penAt(g, false), hover: [400, 300] },
  "above-aphids": {
    ticks: 200,
    at: nest0(24),
    size: { w: 800, h: 600, dpr: 2 },
    aphids: (g) => {
      const n = g.colonies[0]!.nest;
      const cells = [Math.round(n.x) + 2, Math.round(n.y / R), Math.round(n.x) + 3, Math.round(n.y / R)];
      return [{ layer: PLANE, cells, start: 4, eaten: 1, age: 0, owed: 0 }];
    },
  },
  "above-hyphae": { ticks: 200, at: nest0(24), size: { w: 800, h: 600, dpr: 2 }, setup: withHyphae },
  "desert-noon": { species: "desert", ticks: 100, at: atAnt(PLANE, 24), setup: (g) => setDay(g, 0.33) },
  "desert-night": { species: "desert", ticks: 100, at: atAnt(PLANE, 24), size: { w: 800, h: 600, dpr: 2 }, setup: (g) => setDay(g, 0.84) },
  "desert-hyphae": { species: "desert", ticks: 100, at: nest0(24), setup: (g) => (setDay(g, 0.84), withHyphae(g)) },
  "queen-below": { ticks: 200, lv: CURTAIN, at: atQueen },
  "queen-below-dark": { ticks: 200, lv: CURTAIN, at: atQueen, dark: true, size: { w: 800, h: 600, dpr: 2 } },
  "above-corpse": { ticks: 200, at: atAnt(PLANE, 24), setup: withCorpse },
  "below-fit": { ticks: 200, lv: CURTAIN },
  "below-near": { ticks: 200, lv: CURTAIN, at: middle(24) },
  "below-ants": { ticks: 200, lv: CURTAIN, at: atAnt(CURTAIN, 24), size: { w: 800, h: 600, dpr: 2 } },
  "below-followed": { ticks: 200, lv: CURTAIN, at: atAnt(CURTAIN, 24), follow: (g) => antOn(g, CURTAIN) },
  "below-dark": { ticks: 200, lv: CURTAIN, at: atAnt(CURTAIN, 24), dark: true },
};

interface Golden {
  hash: string;
  calls: number;
  drawImages: number;
  /** the pixels of the images the frame made (the minimap's, a chunk's): the log prints only their size */
  pixels: string;
  strokes: number;
}

const summary = (log: string[], pixels: Uint8ClampedArray[]): Golden => ({
  hash: createHash("sha256").update(log.join("\n")).digest("hex").slice(0, 16),
  calls: log.length,
  pixels: pixels
    .reduce((h, p) => h.update(p), createHash("sha256"))
    .digest("hex")
    .slice(0, 16),
  drawImages: log.filter((l) => l.startsWith("drawImage(")).length,
  strokes: log.filter((l) => l === "stroke()").length,
});

const recorded: Record<string, Golden> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
const write = process.env.GOLDEN_WRITE === "1";
const made: Record<string, Golden> = {};

for (const [name, scene] of Object.entries(SCENES)) {
  test(`scene ${name}: the frame's call log is the recorded one`, () => {
    const { log, pixels } = renderScene(scene);
    assert.ok(log.length > 50, "the frame drew");
    assert.ok(!log.some((l) => /NaN|undefined/.test(l)), "no NaN or undefined reached the context");
    const now = summary(log, pixels);
    made[name] = now;
    if (!write) assert.deepEqual(now, recorded[name], `${name}: record again with GOLDEN_WRITE=1 if the change is meant`);
  });
}

test("a frame's strokes are drawn the same whatever the frame before it left set: cap, join and width at every stroke", () => {
  const PROPS = ["lineCap", "lineJoin", "lineWidth"];
  const strokes = (log: string[], from: number, to: number) => {
    const out: string[] = [];
    for (let i = from; i < to; i++)
      if (/^(stroke|strokeText)\(/.test(log[i]!))
        out.push(`${i - from} ${log[i]!.slice(0, 40)} ${PROPS.map((p) => stateAt(log, i, p)).join("/")}`);
    return out;
  };
  for (const [name, scene] of Object.entries(SCENES)) {
    const { full, from } = renderScene({ ...scene, frames: 2 });
    const first = strokes(full, 0, from);
    assert.ok(first.length > 0, `${name} strokes`);
    assert.deepEqual(strokes(full, from, full.length), first, `${name}: the second frame's strokes see what the first left set`);
  }
});

test("the scenes are the recorded set, and a write records them", { concurrency: false }, () => {
  if (write) writeFileSync(FILE, JSON.stringify(made, null, 2) + "\n");
  else assert.deepEqual(Object.keys(recorded).sort(), Object.keys(SCENES).sort());
});
