// Colours the layers share (ja-fnd.6.3.5): a colony's tone by its odour. Plain TypeScript.

export type Rgb = [number, number, number];

/** A colony's tone by its odour t (0…1): ink at 0, the warn tone at 1, mixed between. */
export function odourRgb(ink: Rgb, warn: Rgb, t: number): Rgb {
  const m = (k: 0 | 1 | 2) => Math.round(ink[k] + (warn[k] - ink[k]) * Math.min(1, Math.max(0, t)));
  return [m(0), m(1), m(2)];
}

export function odourColour(ink: Rgb, warn: Rgb, t: number): string {
  const [r, g, b] = odourRgb(ink, warn, t);
  return `rgb(${r}, ${g}, ${b})`;
}

// A colony's tone by a K-axis odour (ja-zg1u.8, docs/odour-space.md "Play"). One axis keeps the scalar tone above, bit for bit. From two axes up the
// tone is made in CIELAB: the mean of the axes runs along the ink-to-warn line (the two start colonies, at 0 and 1 on every axis, keep ink and warn; the
// fungal point, 0.5, is the middle tone), and what the axes add to it beyond their mean (`ODOUR_OFFSET`, a fixed 3 x 4 matrix of each axis's distance above their mean) turns the lightness and the two colour axes. Four numbers cannot all show in three, so one direction of the odour space is invisible: the
// numbers for how often that hides a stranger are in `scripts/lab/odour-colour.mjs` and PRD §91.

/** CIELAB (D65): L 0-100, a and b about ±100. */
export type Lab = [number, number, number];

const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const gam = (l: number): number => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
const D65 = [0.95047, 1, 1.08883] as const;
const fwd = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
const inv = (f: number): number => (f ** 3 > 216 / 24389 ? f ** 3 : (116 * f - 16) / (24389 / 27));

export function rgbToLab([r, g, b]: Rgb): Lab {
  const R = lin(r),
    G = lin(g),
    B = lin(b);
  const x = fwd((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / D65[0]);
  const y = fwd(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
  const z = fwd((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / D65[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Whether a Lab colour is inside the sRGB gamut (before it is clamped). */
export function labInGamut(lab: Lab): boolean {
  return linearRgb(lab).every((v) => v >= -0.0005 && v <= 1.0005);
}

function linearRgb([L, a, b]: Lab): Rgb {
  const fy = (L + 16) / 116;
  const x = inv(fy + a / 500) * D65[0];
  const y = inv(fy);
  const z = inv(fy - b / 200) * D65[2];
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

/** A displayable colour: a Lab colour outside the sRGB gamut keeps its lightness and hue and loses chroma (found by halving) until it fits. */
export function labToRgb(lab: Lab): Rgb {
  let [L, a, b] = lab;
  L = Math.min(100, Math.max(0, L));
  if (!labInGamut([L, a, b])) {
    let lo = 0,
      hi = 1;
    for (let it = 0; it < 12; it++) {
      const m = (lo + hi) / 2;
      if (labInGamut([L, a * m, b * m])) lo = m;
      else hi = m;
    }
    a *= lo;
    b *= lo;
  }
  const [r, g, bl] = linearRgb([L, a, b]);
  const c = (v: number) => Math.round(gam(Math.min(1, Math.max(0, v))));
  return [c(r), c(g), c(bl)];
}

/** CIEDE2000 (Sharma, Wu & Dalal 2005), kL = kC = kH = 1: about 1 is the least a trained eye sees, 10 or more reads as another colour at a glance. */
export function deltaE2000(p: Lab, q: Lab): number {
  const rad = Math.PI / 180;
  const [L1, a1, b1] = p,
    [L2, a2, b2] = q;
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1,
    ap2 = (1 + G) * a2;
  const C1 = Math.hypot(ap1, b1),
    C2 = Math.hypot(ap2, b2);
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1 = hue(b1, ap1),
    h2 = hue(b2, ap2);
  const dL = L2 - L1,
    dC = C2 - C1;
  let dh = 0;
  if (C1 * C2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * rad) / 2);
  const Lm = (L1 + L2) / 2,
    Cb = (C1 + C2) / 2;
  let hm = h1 + h2;
  if (C1 * C2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hm /= 2;
    else hm = (hm + (hm < 360 ? 360 : -360)) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cb,
    Sh = 1 + 0.015 * Cb * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/** What an axis's distance above the mean adds to the ink-to-warn line, in Lab per unit of odour: rows L, a, b; columns the axes (the first K are read). */
export const ODOUR_OFFSET: readonly (readonly number[])[] = [
  [-21, -66, 11, 24],
  [-42, 57, -52, 24],
  [-34, -22, 94, -53],
];

/** The Lab of an odour: ink-to-warn along the mean of its axes, plus the offset of what is left. K = 1 is not made here (odourToneRgb). */
export function odourLab(inkLab: Lab, warnLab: Lab, odour: ArrayLike<number>, at: number, K: number, offset = ODOUR_OFFSET): Lab {
  let t = 0;
  for (let k = 0; k < K; k++) t += clamp01(odour[at + k] as number);
  t /= K;
  const out: Lab = [
    inkLab[0] + (warnLab[0] - inkLab[0]) * t,
    inkLab[1] + (warnLab[1] - inkLab[1]) * t,
    inkLab[2] + (warnLab[2] - inkLab[2]) * t,
  ];
  for (let r = 0; r < 3; r++) {
    const row = offset[r] as readonly number[];
    let s = 0;
    for (let k = 0; k < K; k++) s += (row[k] as number) * (clamp01(odour[at + k] as number) - t);
    out[r] += s;
  }
  return out;
}

const clamp01 = (v: number): number => (v !== v ? 0 : Math.min(1, Math.max(0, v)));

/** A colony's or an ant's tone by its odour at `odour[at ..]` of K axes: the scalar tone at one axis, the Lab tone above. */
export function odourToneRgb(ink: Rgb, warn: Rgb, odour: ArrayLike<number>, at: number, K: number): Rgb {
  if (K === 1) return odourRgb(ink, warn, odour[at] as number);
  return labToRgb(odourLab(rgbToLab(ink), rgbToLab(warn), odour, at, K));
}

/** What a colony's tone is read from: its nest's odour vector and how many axes it has (Colony.nestVec, Colony.odourAxes). */
export interface NestOdour {
  nestVec: ArrayLike<number>;
  odourAxes: number;
}

/** A colony's nest and ants' tone: by its nest's odour vector. */
export function nestRgb(ink: Rgb, warn: Rgb, col: NestOdour): Rgb {
  return odourToneRgb(ink, warn, col.nestVec, 0, col.odourAxes);
}

export function nestColour(ink: Rgb, warn: Rgb, col: NestOdour): string {
  const [r, g, b] = nestRgb(ink, warn, col);
  return `rgb(${r}, ${g}, ${b})`;
}

/** A tone for drawing many ants: each channel on a grid of 17, so ants of one colony whose odours differ a little share a sprite and a stroke. */
export function quantiseTone([r, g, b]: Rgb): Rgb {
  const q = (v: number) => Math.min(255, Math.round(v / 17) * 17);
  return [q(r), q(g), q(b)];
}
