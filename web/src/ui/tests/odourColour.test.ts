import assert from "node:assert/strict";
import { test } from "node:test";
import { type Colony, DEFAULT_SLEEP, hash01, odourSalt, STRANGER_EPS, TOLERANCE } from "../../colony/index.ts";
import { antTones } from "../field/ants.ts";
import {
  deltaE2000,
  labInGamut,
  labToRgb,
  nestColour,
  nestRgb,
  odourLab,
  odourRgb,
  odourToneRgb,
  ODOUR_OFFSET,
  quantiseTone,
  rgbToLab,
  type Rgb,
} from "../field/colour.ts";
import type { FieldTheme } from "../field/ctx.ts";

// The colour of a 4-axis odour (ja-zg1u.8): K = 1 draws as it always did; from two axes a colony's tone is made in Lab; the share of strangers it shows is held.
// The same numbers over the real endless world's sites, both themes, are in scripts/lab/odour-colour.mjs and PRD §91.

const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
// The page's --ink and --warn tokens (index.css), light and dark.
const LIGHT: [Rgb, Rgb] = [hex("#1f1d1a"), hex("#8a5300")];
const DARK: [Rgb, Rgb] = [hex("#ece8df"), hex("#e6a44a")];

test("CIEDE2000 gives Sharma, Wu and Dalal's published values for their pairs 1, 7 and 17", () => {
  assert.ok(Math.abs(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-4);
  assert.ok(Math.abs(deltaE2000([50, 3.1571, -77.2803], [50, 0, -82.7485]) - 2.8615) < 1e-4);
  assert.ok(Math.abs(deltaE2000([50, 2.5, 0], [73, 25, -18]) - 27.1492) < 1e-4);
  assert.equal(deltaE2000([60, 10, 10], [60, 10, 10]), 0);
});

test("Lab round trip: sRGB colours come back as they went, and a colour outside the gamut is brought in at its lightness and hue", () => {
  for (const c of [LIGHT[0], LIGHT[1], DARK[0], DARK[1], [0, 0, 0], [255, 255, 255], [12, 200, 77]] as Rgb[])
    assert.deepEqual(labToRgb(rgbToLab(c)), c);
  const out: [number, number, number] = [60, 120, 90];
  assert.equal(labInGamut(out), false);
  const [r, g, b] = labToRgb(out);
  assert.ok([r, g, b].every((v) => v >= 0 && v <= 255));
  const [L, a, bb] = rgbToLab([r, g, b]);
  assert.ok(Math.abs(L - 60) < 3, "its lightness stays");
  assert.ok(Math.abs(Math.atan2(bb, a) - Math.atan2(90, 120)) < 0.05, "and its hue");
});

test("one axis draws as it always did: the tone is the scalar mix from ink to warn, for a colony and an ant, in either theme", () => {
  for (const [ink, warn] of [LIGHT, DARK])
    for (const t of [0, 0.05, 0.3, 0.5, 0.95, 1]) {
      assert.deepEqual(odourToneRgb(ink, warn, [t], 0, 1), odourRgb(ink, warn, t));
      assert.deepEqual(nestRgb(ink, warn, { nestVec: [t], odourAxes: 1 }), odourRgb(ink, warn, t));
    }
  assert.equal(
    nestColour(LIGHT[0], LIGHT[1], { nestVec: [0.3], odourAxes: 1 }),
    "rgb(" + odourRgb(LIGHT[0], LIGHT[1], 0.3).join(", ") + ")",
  );
  // at an offset in the array, too (an ant's slot)
  assert.deepEqual(odourToneRgb(LIGHT[0], LIGHT[1], [0.9, 0.4, 0.8], 1, 1), odourRgb(LIGHT[0], LIGHT[1], 0.4));
});

test("the start colonies keep ink and warn at four axes, the fungal point is the middle tone, and the tone moves along the mean of the axes", () => {
  for (const [ink, warn] of [LIGHT, DARK]) {
    assert.deepEqual(odourToneRgb(ink, warn, [0, 0, 0, 0], 0, 4), ink);
    assert.deepEqual(odourToneRgb(ink, warn, [1, 1, 1, 1], 0, 4), warn);
    const il = rgbToLab(ink);
    const wl = rgbToLab(warn);
    const mid = odourLab(il, wl, [0.5, 0.5, 0.5, 0.5], 0, 4);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(mid[k]! - (il[k]! + wl[k]!) / 2) < 1e-9, "the middle of ink and warn in Lab");
    // The same mean on every axis is on the line whatever the spread of the axes round it is 0: the diagonal adds nothing.
    for (const t of [0.2, 0.7]) {
      const on = odourLab(il, wl, [t, t, t, t], 0, 4);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(on[k]! - (il[k]! + (wl[k]! - il[k]!) * t)) < 1e-9);
    }
  }
});

test("at two and three axes the start colonies are ink and warn too (the offset reads the axes beyond their own mean)", () => {
  for (const K of [2, 3]) {
    assert.deepEqual(odourToneRgb(LIGHT[0], LIGHT[1], Array(K).fill(0), 0, K), LIGHT[0]);
    assert.deepEqual(odourToneRgb(LIGHT[0], LIGHT[1], Array(K).fill(1), 0, K), LIGHT[1]);
  }
});

test("a quantised tone is on the grid of 17, still within a step of the tone, and ants of near odours share it", () => {
  assert.deepEqual(quantiseTone([0, 17, 255]), [0, 17, 255]);
  assert.deepEqual(quantiseTone([8, 3, 251]), [0, 0, 255]);
  const q = quantiseTone([100, 150, 200]);
  q.forEach((v, k) => assert.ok(Math.abs(v - [100, 150, 200][k]!) <= 8.5));
});

/**
 * A wild colony's odour at a lattice of sites, by the game's own hash (the endless world's sites are the same draws), and the share of the stranger pairs
 * among them whose drawn colours differ by CIEDE2000 12 or more: the tone is held to showing a stranger in most cases (measured on the real world's
 * neighbours, seeds 1-20: 90-93 %, scripts/lab/odour-colour.mjs).
 */
function shown(K: number, [ink, warn]: [Rgb, Rgb], threshold = 12): { strangers: number; share: number } {
  const sites: number[][] = [];
  for (let rx = 0; rx < 40; rx++)
    for (let ry = 0; ry < 20; ry++) sites.push(Array.from({ length: K }, (_, k) => hash01(3, odourSalt(k), rx, ry)));
  const lab = sites.map((o) => rgbToLab(quantiseTone(odourToneRgb(ink, warn, o, 0, K))));
  let strangers = 0;
  let vis = 0;
  for (let n = 0; n < 20000; n++) {
    const i = Math.floor(hash01(9, 1, n, 0) * sites.length);
    const j = Math.floor(hash01(9, 2, n, 0) * sites.length);
    if (i === j) continue;
    if (Math.hypot(...sites[i]!.map((x, k) => x - sites[j]![k]!)) <= TOLERANCE + STRANGER_EPS) continue;
    strangers++;
    if (deltaE2000(lab[i]!, lab[j]!) >= threshold) vis++;
  }
  return { strangers, share: vis / strangers };
}

test("at four axes strangers show: of the wild colonies that are strangers, over 85 % differ in colour by 12 or more, in both themes", () => {
  for (const theme of [LIGHT, DARK]) {
    const r = shown(4, theme);
    assert.ok(r.strangers > 5000);
    assert.ok(r.share > 0.85, `${r.share}`);
  }
});

test("the same wild colonies drawn by the first axis alone (what the page did at four axes) hide far more strangers: the colour has to carry the other three", () => {
  // Axis 0 only: the old scalar tone read off a four-axis odour. A stranger by any axis shows only when the first one differs.
  const first = (theme: [Rgb, Rgb]) => {
    let strangers = 0;
    let vis = 0;
    const sites: number[][] = [];
    for (let rx = 0; rx < 40; rx++)
      for (let ry = 0; ry < 20; ry++) sites.push(Array.from({ length: 4 }, (_, k) => hash01(3, odourSalt(k), rx, ry)));
    const lab = sites.map((o) => rgbToLab(odourToneRgb(theme[0], theme[1], [o[0]!], 0, 1)));
    for (let n = 0; n < 20000; n++) {
      const i = Math.floor(hash01(9, 1, n, 0) * sites.length);
      const j = Math.floor(hash01(9, 2, n, 0) * sites.length);
      if (i === j || Math.hypot(...sites[i]!.map((x, k) => x - sites[j]![k]!)) <= TOLERANCE + STRANGER_EPS) continue;
      strangers++;
      if (deltaE2000(lab[i]!, lab[j]!) >= 12) vis++;
    }
    return vis / strangers;
  };
  assert.ok(first(LIGHT) < 0.6, `${first(LIGHT)}`);
  assert.ok(shown(4, LIGHT).share - first(LIGHT) > 0.3);
});

test("with no offset (colour by the mean of the axes alone) many strangers share a colour: the offset is what separates them", () => {
  const lab = (o: number[], off: readonly (readonly number[])[]) => odourLab(rgbToLab(LIGHT[0]), rgbToLab(LIGHT[1]), o, 0, 4, off);
  const none = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  // Two odours with the same mean on four axes and 1.0 apart: strangers by any reading.
  const a = [0.1, 0.9, 0.1, 0.9];
  const b = [0.9, 0.1, 0.9, 0.1];
  assert.ok(deltaE2000(lab(a, none), lab(b, none)) < 0.01, "the mean alone cannot tell them apart");
  assert.ok(deltaE2000(rgbToLab(labToRgb(lab(a, ODOUR_OFFSET))), rgbToLab(labToRgb(lab(b, ODOUR_OFFSET)))) > 12, "the offset can");
});

test("the tones of a colony's ants: one axis is a band each in band order, as drawn before; four axes are one tone for ants in one band of the odour", () => {
  const theme = { inkRgb: [10, 20, 30], warnRgb: [200, 100, 50] } as unknown as FieldTheme;
  const fake = (K: number, odours: number[][], alive: number[] = odours.map(() => 1), layer: number[] = odours.map(() => 1)) =>
    ({
      n: odours.length,
      odourAxes: K,
      odour: Float64Array.from(odours.flat()),
      odourAt: (i: number, k = 0) => odours[i]![k]!,
      alive,
      layer,
    }) as unknown as Colony;
  // K = 1: bands 0, 3 and 9, drawn in that order, each in the scalar tone of its band over the ten.
  const one = antTones(theme, fake(1, [[0.95], [0.02], [0.35], [0.31]]), 1);
  assert.deepEqual([...one.rgb.keys()], [0, 3, 9]);
  assert.deepEqual(
    one.rgb.get(3),
    [10, 20, 30].map((v, k) => Math.round(v + (([200, 100, 50][k] as number) - v) * (3 / 9))),
  );
  assert.deepEqual([...one.of], [9, 0, 3, 3]);
  // K = 4: a colony's ants of one band share a tone; another band of one axis is another tone; the dead and other layers have none.
  const four = antTones(
    theme,
    fake(
      4,
      [
        [0.52, 0.52, 0.52, 0.52],
        [0.55, 0.51, 0.58, 0.54],
        [0.52, 0.52, 0.52, 0.92],
        [0.9, 0.1, 0.1, 0.1],
        [0.9, 0.1, 0.1, 0.1],
      ],
      [1, 1, 1, 1, 0],
      [1, 1, 1, 0, 1],
    ),
    1,
  );
  assert.equal(four.of[0], four.of[1], "the same band of the four");
  assert.notEqual(four.of[0], four.of[2], "a band apart on the fourth axis alone is another tone");
  assert.deepEqual(
    [...four.rgb.keys()],
    [...four.rgb.keys()].sort((a, b) => a - b),
    "in key order",
  );
  assert.equal(four.rgb.size, 2, "the ant on another layer and the dead one have no tone");
  for (const [key, rgb] of four.rgb) assert.equal(key, (rgb[0] << 16) | (rgb[1] << 8) | rgb[2], "the key is the colour");
});

test("most wild colonies are drawn in a colour at least 12 from both start colonies' ink and warn (nearly all of them are strangers to both)", () => {
  // The W of the endless world: neighbours within this distance wake together (DEFAULT_SLEEP.distance): the colours here are those of colonies that meet.
  assert.ok(DEFAULT_SLEEP.distance > 0);
  let far = 0;
  let n = 0;
  for (let rx = 0; rx < 60; rx++)
    for (let ry = 0; ry < 20; ry++) {
      const o = Array.from({ length: 4 }, (_, k) => hash01(5, odourSalt(k), rx, ry));
      const c = rgbToLab(quantiseTone(odourToneRgb(LIGHT[0], LIGHT[1], o, 0, 4)));
      n++;
      if (deltaE2000(c, rgbToLab(LIGHT[0])) >= 12 && deltaE2000(c, rgbToLab(LIGHT[1])) >= 12) far++;
    }
  assert.ok(far / n > 0.7, `${far / n}`); // measured 0.78 here: the colour cannot show every stranger (scripts/lab/odour-colour.mjs)
});
