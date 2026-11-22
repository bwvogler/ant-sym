export type FungalPoint = [number, number, number];
export interface FungalStructures {
  knot?: boolean;
  knotSprouted?: boolean;
  fruit?: boolean;
  colonised?: boolean;
  sporulating?: boolean;
  stalkLevel?: number;
  tips?: [number, number][];
}
export type FungalPrimitive =
  | { kind: "box"; at: FungalPoint; size: FungalPoint; colour: string }
  | { kind: "beam"; a: FungalPoint; b: FungalPoint; width: number; colour: string };
export const STALK_HEIGHT = [0, 1.8, 2.8] as const;
export const FUNGAL = {
  ivory: "#F3F0DF",
  fresh: "#FFFFFF",
  fibre: "#C4C4A2",
  rind: "#40352C",
  rindLight: "#6E5740",
  rindTop: "#947452",
  stem: "#775134",
  stemLight: "#AD8A61",
  spores: "#7F9253",
  sporeLight: "#B7BE79",
  sporeDark: "#52613A",
} as const;
export function stalkPoint(t: number, height: number): FungalPoint {
  return [
    0.06 + 0.18 * t * t + 0.12 * Math.sin(Math.PI * t),
    0.02 - 0.09 * t + 0.04 * Math.sin(2 * Math.PI * t),
    0.15 + (height - 0.15) * t,
  ];
}
/** Deterministic decorative geometry; state alone decides whether a structure exists. */
export function fungalPrimitives(s: FungalStructures, seed = 0): FungalPrimitive[] {
  const out: FungalPrimitive[] = [],
    phase = (((seed >>> 0) % 8) * Math.PI) / 4;
  const box = (at: FungalPoint, size: FungalPoint, colour: string) => out.push({ kind: "box", at, size, colour });
  const beam = (a: FungalPoint, b: FungalPoint, width: number, colour: string) => out.push({ kind: "beam", a, b, width, colour });
  const fringe = (x: number, y: number, r: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = phase + (i * Math.PI * 2) / n,
        dx = Math.cos(t),
        dy = Math.sin(t);
      beam([x + dx * r * 0.4, y + dy * r * 0.4, 0.025], [x + dx * r, y + dy * r, 0.035], 0.018, FUNGAL.ivory);
      beam(
        [x + dx * r, y + dy * r, 0.035],
        [x + dx * (r + 0.045) - dy * 0.025, y + dy * (r + 0.045) + dx * 0.025, 0.03],
        0.012,
        FUNGAL.fresh,
      );
    }
  };
  if (s.knot) {
    fringe(0, 0, 0.21, 7);
    box([0, 0, 0.075], [0.27, 0.22, 0.13], FUNGAL.rind);
    for (const [x, y, z, w] of [
      [-0.1, -0.05, 0.1, 0.13],
      [0.08, -0.065, 0.12, 0.15],
      [-0.035, 0.07, 0.13, 0.14],
      [0.1, 0.07, 0.09, 0.1],
    ]) {
      box([x, y, z], [w, w * 0.8, 0.11], FUNGAL.rindLight);
      box([x - 0.015, y - 0.01, z + 0.059], [w * 0.55, w * 0.55, 0.018], FUNGAL.rindTop);
    }
    beam([-0.12, 0.015, 0.12], [0.09, 0.015, 0.14], 0.014, FUNGAL.fibre);
    if (s.knotSprouted) {
      beam([-0.07, -0.07, 0.14], [-0.16, -0.14, 0.2], 0.027, FUNGAL.ivory);
      beam([-0.16, -0.14, 0.2], [-0.23, -0.13, 0.21], 0.016, FUNGAL.fresh);
    }
  }
  if (s.colonised) fringe(0.035, 0.055, 0.25, 9);
  if (s.fruit || (s.colonised && s.sporulating)) {
    const cx = s.colonised ? 0.035 : -0.08,
      cy = s.colonised ? 0.055 : 0.015;
    if (!s.colonised) fringe(cx, cy, 0.2, 6);
    for (let i = 0; i < 13; i++) {
      const t = phase + i * 2.4,
        r = 0.045 + (i % 4) * 0.038,
        x = cx + Math.cos(t) * r,
        y = cy + Math.sin(t) * r,
        h = 0.09 + (i % 3) * 0.027;
      beam([x, y, 0.025], [x + 0.018, y, h], 0.018, FUNGAL.ivory);
      box([x + 0.018, y, h], [0.052, 0.045, 0.035], i % 3 ? FUNGAL.spores : FUNGAL.sporeLight);
    }
  }
  if ((s.stalkLevel ?? 0) > 0) {
    const h = STALK_HEIGHT[s.stalkLevel! >= 2 ? 2 : 1];
    // Emerge through the thorax of the associated cadaver, rather than from an unrelated ground peg.
    for (let i = 1; i <= 12; i++) {
      const a = stalkPoint((i - 1) / 12, h),
        b = stalkPoint(i / 12, h);
      beam(a, b, 0.055 - i * 0.0025, FUNGAL.stem);
      beam([a[0] - 0.011, a[1] - 0.012, a[2]], [b[0] - 0.011, b[1] - 0.012, b[2]], 0.009, FUNGAL.stemLight);
    }
    const base = stalkPoint(0, h);
    for (let i = 0; i < 5; i++) {
      const t = phase + (i * Math.PI * 2) / 5;
      beam(
        [base[0] + Math.cos(t) * 0.065, base[1] + Math.sin(t) * 0.065, 0.085],
        [base[0] + Math.cos(t) * 0.022, base[1] + Math.sin(t) * 0.022, 0.23],
        0.014,
        FUNGAL.ivory,
      );
    }
    // A rounded, asymmetric brown ascomatal cushion with small raised pores. No green flag or mushroom cap.
    const p = stalkPoint(0.8, h),
      step = 0.03;
    for (let x = -3; x <= 4; x++)
      for (let y = -3; y <= 3; y++)
        for (let z = -4; z <= 4; z++) {
          const q = ((x * step) / 0.105) ** 2 + ((y * step) / 0.078) ** 2 + ((z * step) / 0.13) ** 2;
          if (q > 1) continue;
          const hash = Math.abs(x * 17 + y * 31 + z * 43 + seed) % 5;
          box(
            [p[0] + 0.055 + x * step, p[1] + y * step, p[2] + z * step],
            [step, step, step],
            hash < 2 ? FUNGAL.rind : hash < 4 ? FUNGAL.rindLight : FUNGAL.rindTop,
          );
          if (q > 0.6 && hash === 0)
            box([p[0] + 0.055 + x * step * 1.08, p[1] + y * step * 1.1, p[2] + z * step * 1.04], [0.016, 0.018, 0.018], FUNGAL.rind);
        }
  }
  for (const [dx, dy] of s.tips ?? []) {
    const l = Math.hypot(dx, dy) || 1,
      x = dx / l,
      y = dy / l;
    for (const side of [-1, 0, 1]) {
      const mid: FungalPoint = [x * 0.1 - y * side * 0.025, y * 0.1 + x * side * 0.025, 0.05];
      beam([0, 0, 0.035], mid, 0.032, FUNGAL.ivory);
      beam(mid, [x * 0.23 - y * side * 0.075, y * 0.23 + x * side * 0.075, 0.045], 0.018, FUNGAL.fresh);
    }
  }
  return out;
}
/** Fixed world footprint, bounded cache and small rasters at distant map zoom. The projection is aerial. */
export type FungalMapLayer = "all" | "ground" | "raised";
/** Draw the mat below cadavers and the stalk above them, as the mesh renderer's depth buffer does. */
export function fungalMapPrimitives(s: FungalStructures, seed: number, layer: FungalMapLayer): FungalPrimitive[] {
  return fungalPrimitives(layer === "ground" ? { ...s, stalkLevel: 0 } : layer === "raised" ? { stalkLevel: s.stalkLevel } : s, seed);
}
export class FungalMapSprites {
  private cache = new Map<string, HTMLCanvasElement>();
  draw(
    ctx: CanvasRenderingContext2D,
    s: FungalStructures,
    seed: number,
    x: number,
    y: number,
    zoom: number,
    layer: FungalMapLayer = "all",
  ): void {
    const res = Math.max(16, Math.min(128, 2 ** Math.ceil(Math.log2(zoom * 1.2)))),
      key = JSON.stringify([s, (seed >>> 0) % 8, res, layer]);
    let cv = this.cache.get(key);
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = cv.height = res;
      const pen = cv.getContext("2d")!,
        m = res / 2,
        u = res / 1.2;
      for (const p of fungalMapPrimitives(s, seed, layer).sort(
        (a, b) => (a.kind === "box" ? a.at[2] : a.b[2]) - (b.kind === "box" ? b.at[2] : b.b[2]),
      )) {
        pen.fillStyle = pen.strokeStyle = p.colour;
        if (p.kind === "box")
          pen.fillRect(m + (p.at[0] - p.size[0] / 2) * u, m + (p.at[1] - p.size[1] / 2) * u, p.size[0] * u, p.size[1] * u);
        else {
          pen.lineWidth = p.width * u;
          pen.beginPath();
          pen.moveTo(m + p.a[0] * u, m + p.a[1] * u);
          pen.lineTo(m + p.b[0] * u, m + p.b[1] * u);
          pen.stroke();
        }
      }
      if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, cv);
    }
    ctx.drawImage(cv, x - zoom * 0.6, y - zoom * 0.6, zoom * 1.2, zoom * 1.2);
  }
}
