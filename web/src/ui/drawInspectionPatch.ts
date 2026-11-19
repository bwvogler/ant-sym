import { INSPECTION_GROUND, MOUND_GROUND, moundGroundLevel } from "./inspectionGround.ts";
import surface from "../assets/inspection/projection.json" with { type: "json" };
import lifecycle from "../assets/inspection/lifecycle-manifest.json" with { type: "json" };
import below from "../assets/inspection/below-manifest.json" with { type: "json" };
import { CELL, cellKey, cellOf, centreX, centreY } from "../colony/index.ts";
import { FOOD_SPOTS, APHID_SPOTS, foodDensity, foodKind, aphidDensity } from "./resourceSprites.ts";
import { workerDirection } from "./workerSprites.ts";
import {
  DEFAULT_INSPECTION_OVERLAYS,
  SCENT_STYLES,
  inspectionScents,
  inspectionMarkers,
  type InspectionOverlays,
} from "./inspectionOverlays.ts";
import { drawLeafTiles, SurfaceLeaves, type LeafTile } from "./surfaceFood.ts";
import type { InspectionPatch } from "./inspectionPatch.ts";

export const BELOW_ATLAS_URL = new URL("../assets/inspection/below-atlas.png", import.meta.url).href;
export const BELOW_ATLAS_SIZE = [below.width, below.height] as const;
export interface PatchImages {
  surface?: CanvasImageSource;
  lifecycle?: CanvasImageSource;
  below?: CanvasImageSource;
}
/** Worker crown is about 0.4 world units above its walking plane. */
export const SURFACE_ROCK_HEIGHT = 1;
type Point3 = [number, number, number];
interface Face {
  points: Point3[];
  kind: "soil" | "rock" | "back";
  normal: Point3;
  depth: number;
  grain: number;
  front: boolean;
  moundLevel: number;
}
const SIDES: [Point3, Point3[]][] = [
  [
    [1, 0, 0],
    [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  ],
  [
    [-1, 0, 0],
    [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  ],
  [
    [0, 1, 0],
    [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  ],
  [
    [0, -1, 0],
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  ],
  [
    [0, 0, 1],
    [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  ],
  [
    [0, 0, -1],
    [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  ],
];

/** Terrain from the supplied cells, cropped to the inspection or viewport bounds. No simulation geometry is written. */
export function buildPatchTerrain(patch: InspectionPatch, allSides = false): Face[] {
  const isBelow = patch.mode === "below",
    step = isBelow ? 0.06 : 0.05,
    limit = isBelow ? 26 : 31;
  const [gx, gy] = patch.selected.cell,
    cx = centreX(gx, gy),
    cy = centreY(gy);
  const slots = new Map(patch.cells.filter((c) => c.valid).map((c) => [cellKey(...c.state.cell), c]));
  const b = patch.bounds,
    originX = b ? cx : 0,
    originY = b ? -cy : 0,
    left = b ? Math.floor((b.left + originX) / step) : -limit,
    right = b ? Math.ceil((b.right + originX) / step) : limit,
    top = b ? Math.floor((-b.bottom + originY) / step) : -limit,
    bottom = b ? Math.ceil((-b.top + originY) / step) : limit,
    rows = bottom - top,
    columns = right - left,
    lower = new Int16Array(rows * columns),
    upper = new Int16Array(rows * columns),
    kinds = new Uint8Array(rows * columns),
    mounds = new Uint8Array(rows * columns);
  // Every terrain column is a solid depth interval. Keep that interval instead of allocating every buried voxel.
  for (let ix = left; ix < right; ix++)
    for (let iz = top; iz < bottom; iz++) {
      const x = (ix + 0.5) * step - originX,
        axis = (iz + 0.5) * step - originY;
      cellOf(cx + x, cy - axis);
      const slot = slots.get(cellKey(CELL[0], CELL[1]));
      if (!slot) continue;
      const ground = slot.state.place.ground,
        index = (ix - left) * rows + iz - top;
      if (!isBelow) {
        if (ground === "air") continue;
        lower[index] = -4;
        upper[index] = ground === "rock" ? SURFACE_ROCK_HEIGHT / step : 0;
        kinds[index] = ground === "rock" ? 2 : 1;
        if (ground === "open") mounds[index] = moundGroundLevel(slot.state.place.mound);
      } else {
        if (slot.surfaceStrip) {
          if (slot.surfaceEntrance || !slot.projectedGround || axis > -slot.y + Math.min(0.24, (slot.projectedSpoil ?? 0) * 0.04)) continue;
        } else if (ground === "air") continue;
        const open = !slot.surfaceStrip && ground === "open";
        lower[index] = open ? 18 : 0;
        upper[index] = 20;
        kinds[index] = open ? 3 : (slot.surfaceStrip ? slot.projectedGround : ground) === "rock" ? 2 : 1;
      }
    }
  const eye: Point3 = isBelow ? [1.8, -7.5, 1.25] : [1.1, -3.3, 2.43],
    faces: Face[] = [];
  for (let ix = left; ix < right; ix++)
    for (let iz = top; iz < bottom; iz++) {
      const index = (ix - left) * rows + iz - top,
        kind: Face["kind"] = kinds[index] === 3 ? "back" : kinds[index] === 2 ? "rock" : "soil";
      for (let h = lower[index]; h < upper[index]; h++) {
        const x = ix,
          y = isBelow ? h : iz,
          z = isBelow ? iz : h;
        for (const [normal, corners] of SIDES) {
          if (!allSides && normal[0] * eye[0] + normal[1] * eye[1] + normal[2] * eye[2] <= 0) continue;
          const xx = ix + normal[0],
            zz = iz + normal[isBelow ? 2 : 1],
            hh = h + normal[isBelow ? 1 : 2],
            neighbour = (xx - left) * rows + zz - top;
          if (xx >= left && xx < right && zz >= top && zz < bottom && hh >= lower[neighbour] && hh < upper[neighbour]) continue;
          const points = corners.map(([a, b, c]): Point3 => [
            (x + a) * step - originX,
            (y + b) * step - (isBelow ? 0 : originY),
            (z + c) * step - (isBelow ? originY : 0),
          ]);
          const depth = points.reduce((sum, p) => sum + p[0] * eye[0] + p[1] * eye[1] + p[2] * eye[2], 0) / 4;
          faces.push({
            points,
            normal,
            kind,
            depth,
            grain: Math.abs((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) % 5,
            moundLevel: mounds[index],
            front: isBelow && kind !== "back",
          });
        }
      }
    }
  return faces.sort((a, b) => a.depth - b.depth);
}

export function patchPoint(mode: InspectionPatch["mode"], width: number, height: number, x: number, y: number, z = 0): [number, number] {
  const p = mode === "below" ? below : surface,
    ppu = (Math.min(width / 384, height / 320) * 384) / (mode === "below" ? 4 : 4.15),
    factor = ppu / (p.frame / p.worldFrame);
  return [
    width / 2 + (p.anchor[0] - p.frame / 2 + p.basis[0][0] * x + p.basis[1][0] * y + p.basis[2][0] * z) * factor,
    height / 2 + (p.anchor[1] - p.frame / 2 + p.basis[0][1] * x + p.basis[1][1] * y + p.basis[2][1] * z) * factor,
  ];
}

export function faceColour(face: Face, mode: InspectionPatch["mode"]): string {
  const hex =
    face.kind === "back"
      ? INSPECTION_GROUND.back
      : face.kind === "rock"
        ? INSPECTION_GROUND.rock[face.grain]
        : (mode === "below" ? INSPECTION_GROUND.belowSoil : MOUND_GROUND[face.moundLevel])[face.grain];
  const shade =
    mode === "surface"
      ? face.normal[2] > 0
        ? 1
        : face.normal[1] < 0
          ? 0.72
          : 0.6
      : face.normal[1] < 0
        ? 1
        : face.normal[2] > 0
          ? 1.08
          : 0.79;
  const rgb = [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * shade)));
  return `rgb(${rgb.join(",")})`;
}

/** One terrain pair cached per live inspector; moving actors and counts do not rebuild the voxel background. */
export class InspectionPatchRenderer {
  private key = "";
  private terrain: { back: HTMLCanvasElement; front: HTMLCanvasElement } | null = null;
  private createCanvas: () => HTMLCanvasElement;
  private raised: Face[] = [];
  private leaves = new SurfaceLeaves();
  private leafSources: LeafTile[][] = [];
  private leafUnion: LeafTile[] = [];
  constructor(createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")) {
    this.createCanvas = createCanvas;
  }
  private background(patch: InspectionPatch, w: number, h: number): boolean {
    const key = JSON.stringify([
      patch.mode,
      w,
      h,
      patch.selected.cell,
      patch.cells.map((c) => [
        c.valid,
        c.state.place.ground,
        c.surfaceStrip,
        c.projectedGround,
        c.projectedSpoil,
        c.surfaceEntrance,
        moundGroundLevel(c.state.place.mound),
      ]),
    ]);
    if (key === this.key && this.terrain) return true;
    const back = this.createCanvas(),
      front = this.createCanvas();
    for (const canvas of [back, front]) {
      canvas.width = w;
      canvas.height = h;
    }
    const backCtx = back.getContext("2d")!,
      frontCtx = front.getContext("2d")!;
    this.raised = [];
    for (const face of buildPatchTerrain(patch)) {
      if (patch.mode === "surface" && face.points.some((p) => p[2] > 0)) {
        this.raised.push(face);
        continue;
      }
      const ctx = face.front ? frontCtx : backCtx;
      ctx.fillStyle = faceColour(face, patch.mode);
      ctx.beginPath();
      for (const [x, y, z] of face.points) {
        const p = patchPoint(patch.mode, w, h, x, patch.mode === "below" ? -z : -y, patch.mode === "below" ? below.rearDepth - y : z);
        ctx.lineTo(Math.round(p[0]), Math.round(p[1]));
      }
      ctx.closePath();
      ctx.fill();
    }
    this.terrain = { back, front };
    this.key = key;
    return false;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    patch: InspectionPatch,
    images: PatchImages,
    w: number,
    h: number,
    overlays: InspectionOverlays = DEFAULT_INSPECTION_OVERLAYS,
  ): { selectedWorkers: number; contextWorkers: number; drawnWorkers: number; terrainCacheHit: boolean } {
    const cacheHit = this.background(patch, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain!.back, 0, 0);
    const mode = patch.mode,
      ppu = (Math.min(w / 384, h / 320) * 384) / (mode === "below" ? 4 : 4.15),
      point = (x: number, y: number, z = 0) => patchPoint(mode, w, h, x, y, z);
    const layers: { depth: number; draw: () => void }[] = [];
    const drawAt = (x: number, y: number, z: number, draw: () => void) => {
      if (mode === "surface") layers.push({ depth: x * 1.1 + y * 3.3 + z * 2.43, draw });
      else draw();
    };
    for (const face of this.raised)
      layers.push({
        depth: face.depth,
        draw: () => {
          ctx.fillStyle = faceColour(face, mode);
          ctx.beginPath();
          face.points.forEach(([x, y, z], i) => {
            const p = point(x, -y, z).map(Math.round) as [number, number];
            if (i === 0) ctx.moveTo(...p);
            else ctx.lineTo(...p);
          });
          ctx.closePath();
          ctx.fill();
        },
      });
    const sprite = (name: string, x: number, y: number, z = 0) => {
      const desc = mode === "below" ? below : surface.names.includes(name) ? surface : lifecycle;
      const image = mode === "below" ? images.below : surface.names.includes(name) ? images.surface : images.lifecycle;
      const i = desc.names.indexOf(name);
      if (!image || i < 0) return;
      const p = point(x, y, z),
        factor = ppu / (desc.frame / desc.worldFrame);
      const alpha = ctx.globalAlpha;
      drawAt(x, y, z + 0.15, () => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(
          image,
          (i % desc.cols) * desc.stride + 1,
          Math.floor(i / desc.cols) * desc.stride + 1,
          desc.frame,
          desc.frame,
          p[0] - desc.anchor[0] * factor,
          p[1] - desc.anchor[1] * factor,
          desc.frame * factor,
          desc.frame * factor,
        );
        ctx.restore();
      });
    };
    const lookup = new Map([
      ...(patch.surfaceFood ?? []),
      ...patch.cells
        .filter((c) => c.valid && c.state.place.ground === "open" && foodKind(c.state.quality) === "plain")
        .map((c): [number, number] => [cellKey(...c.state.cell), c.state.place.food]),
    ]);
    const sheets: LeafTile[][] = [];
    const scale = ppu / 96;
    for (const cell of patch.cells) {
      if (!cell.valid || cell.surfaceStrip || cell.state.place.ground === "air") continue;
      const s = cell.state,
        p = s.place,
        x = cell.x,
        y = cell.y;
      if (overlays.scents && p.ground === "open") {
        const scents = inspectionScents(p);
        for (const { kind, strength } of scents) {
          ctx.save();
          ctx.globalAlpha = (kind === "home" ? 0.12 : 0.22) * strength;
          ctx.fillStyle = SCENT_STYLES[kind].colour;
          ctx.beginPath();
          for (let d = 0; d < 6; d++) {
            const a = Math.PI / 6 + (d * Math.PI) / 3;
            ctx.lineTo(...point(x + Math.cos(a) / Math.sqrt(3), y + Math.sin(a) / Math.sqrt(3), 0.008));
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // Separate rows and shapes let overlapping scalar scents remain distinguishable without arrows.
        for (const { kind, strength } of scents) {
          ctx.save();
          ctx.globalAlpha = 0.35 + 0.5 * strength;
          ctx.fillStyle = ctx.strokeStyle = SCENT_STYLES[kind].colour;
          ctx.lineWidth = 1.25 * scale;
          const row = kind === "home" ? -0.2 : kind === "food" ? 0 : 0.2;
          for (const offset of [-0.25, 0, 0.25]) {
            const a = point(x + offset, y + row, 0.012);
            if (kind === "food") ctx.fillRect(a[0] - 1.5 * scale, a[1] - 1.5 * scale, 3 * scale, 3 * scale);
            else {
              ctx.beginPath();
              ctx.moveTo(a[0] - 3 * scale, a[1]);
              ctx.lineTo(a[0] + 3 * scale, a[1]);
              if (kind === "alarm") {
                ctx.moveTo(a[0], a[1] - 3 * scale);
                ctx.lineTo(a[0], a[1] + 3 * scale);
              }
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }
      if (mode === "surface" && p.hole >= 0) {
        ctx.fillStyle = "#38291F";
        ctx.beginPath();
        for (let d = 0; d < 16; d++)
          ctx.lineTo(...point(x + 0.36 * Math.cos((d * Math.PI) / 8), y + 0.36 * Math.sin((d * Math.PI) / 8), 0.01));
        ctx.closePath();
        ctx.fill();
      }
      if (p.hypha) {
        ctx.strokeStyle = "#7A4FA0";
        ctx.fillStyle = "#7A4FA0";
        ctx.lineWidth = 2 * scale;
        for (const [a, b] of s.threads) {
          const target = patch.cells.find((c) => c.valid && Math.abs(c.x - x - a) < 1e-5 && Math.abs(c.y - y - b) < 1e-5);
          if (!target) continue;
          ctx.beginPath();
          ctx.moveTo(...point(x, y, 0.02));
          ctx.lineTo(...point(x + a * 0.5, y + b * 0.5, 0.02));
          ctx.stroke();
        }
        const p0 = point(x, y, 0.02),
          q = (s.knot ? 6 : 3) * scale;
        ctx.fillRect(p0[0] - q / 2, p0[1] - q / 2, q, q);
      }
      if (p.spores) {
        ctx.fillStyle = "#B18DD1";
        for (const [a, b] of [
          [-0.24, -0.1],
          [0.18, 0.15],
          [0.08, -0.28],
        ]) {
          const q = point(x + a, y + b, 0.025);
          ctx.fillRect(q[0], q[1], 3 * scale, 3 * scale);
        }
      }
      if (s.fallen > 0) sprite("corpse", x, y);
      for (let i = 0; i < 3; i++) if (s.brood[i] > 0) sprite("brood-" + i, x + [-0.22, 0, 0.23][i], y + [-0.18, 0.14, -0.12][i]);
      if (s.stalk) {
        ctx.strokeStyle = "#574361";
        ctx.lineWidth = 3 * scale;
        const a = point(x + 0.1, y),
          b = point(x + 0.1, y, 0.28);
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
        ctx.fillStyle = "#7A4FA0";
        ctx.fillRect(b[0] - 3 * scale, b[1] - 3 * scale, 6 * scale, 5 * scale);
      }
      const food = foodDensity(p.food);
      if (mode === "surface" && p.ground === "open" && foodKind(s.quality) === "plain") {
        const tiles = this.leaves.get(...s.cell, (a, b) => lookup.get(cellKey(a, b)) ?? 0);
        sheets.push(tiles);
      } else {
        ctx.globalAlpha = food.alpha;
        for (let i = 0; i < food.marks; i++) sprite("food-" + foodKind(s.quality), x + FOOD_SPOTS[i][0], y + FOOD_SPOTS[i][1]);
        ctx.globalAlpha = 1;
      }
      if (mode === "surface") {
        const aphids = aphidDensity(s.aphidDensity, 1);
        ctx.globalAlpha = aphids.alpha;
        for (let i = 0; i < aphids.marks; i++) sprite("aphid-" + i, x + APHID_SPOTS[i][0], y + APHID_SPOTS[i][1]);
        ctx.globalAlpha = 1;
      }
    }
    if (sheets.length !== this.leafSources.length || sheets.some((sheet, i) => sheet !== this.leafSources[i])) {
      this.leafSources = sheets;
      this.leafUnion = sheets.flat();
    }
    const [gx, gy] = patch.selected.cell,
      ox = centreX(gx, gy),
      oy = centreY(gy);
    if (mode === "surface")
      drawLeafTiles(
        ctx,
        this.leafUnion,
        (a, b, z) => point(a - ox, b - oy, z),
        true,
        (a, b, z, paint) => drawAt(a - ox, b - oy, z, paint),
      );
    const bodies = patch.cells
      .filter((c) => c.valid)
      .flatMap((cell) => [
        ...cell.state.ants.map((a) => ({ kind: "worker" as const, body: a, x: cell.x + a.x, y: cell.y + a.y })),
        ...cell.state.queens.map((a) => ({ kind: "queen" as const, body: a, x: cell.x + a.x, y: cell.y + a.y })),
      ])
      .sort((a, b) => point(a.x, a.y)[1] - point(b.x, b.y)[1]);
    let drawnWorkers = 0;
    for (const entity of bodies) {
      const { x, y } = entity;
      if (entity.kind === "queen") {
        const q = entity.body;
        sprite(q.alive ? "queen" : "queen-dead", x, y);
        const p = point(x, y, q.alive ? 0.3 : 0.12);
        drawAt(x, y, 0.31, () => {
          if (!q.alive) {
            ctx.strokeStyle = "#B34840";
            ctx.lineWidth = 2 * scale;
            ctx.beginPath();
            ctx.moveTo(p[0] - 5 * scale, p[1] - 5 * scale);
            ctx.lineTo(p[0] + 5 * scale, p[1] + 5 * scale);
            ctx.moveTo(p[0] + 5 * scale, p[1] - 5 * scale);
            ctx.lineTo(p[0] - 5 * scale, p[1] + 5 * scale);
            ctx.stroke();
          } else if (q.infected) {
            ctx.fillStyle = "#B18DD1";
            ctx.fillRect(p[0] - 2 * scale, p[1] - 2 * scale, 4 * scale, 4 * scale);
          }
        });
        continue;
      }
      const a = entity.body;
      drawnWorkers++;
      sprite("worker-" + workerDirection(a.heading), x, y);
      const hx = x + Math.cos(a.heading) * 0.46,
        hy = y + Math.sin(a.heading) * 0.46;
      if (a.carrying) sprite("food-" + foodKind(a.quality), hx, hy, 0.16);
      else if (a.cargo === "brood" && a.broodStage !== undefined) sprite("brood-" + a.broodStage, hx, hy, 0.16);
      else if (a.cargo === "corpse") sprite("corpse", hx, hy, 0.16);
      else if (a.cargo === "soil") sprite("food-crumb", hx, hy, 0.16);
      drawAt(x, y, 0.3, () => {
        if (a.infected) {
          const p = point(x, y, 0.27);
          ctx.fillStyle = "#B18DD1";
          ctx.fillRect(p[0] - 2 * scale, p[1] - 2 * scale, 4 * scale, 4 * scale);
        }
      });
    }
    layers.sort((a, b) => a.depth - b.depth).forEach((layer) => layer.draw());
    if (overlays.markers) {
      ctx.save();
      ctx.lineWidth = 1.5 * scale;
      for (const cell of patch.cells) {
        if (!cell.valid) continue;
        for (const marker of inspectionMarkers(cell.state.place)) {
          ctx.strokeStyle = marker.colour;
          ctx.beginPath();
          if (marker.kind === "entrance") {
            ctx.setLineDash([3 * scale, 3 * scale]);
            for (let d = 0; d < 24; d++) {
              const a = (d * Math.PI) / 12;
              ctx.lineTo(...point(cell.x + Math.cos(a) * 0.4, cell.y + Math.sin(a) * 0.4, 0.02));
            }
          } else {
            ctx.setLineDash([]);
            const a = point(cell.x - 0.3, cell.y - 0.25, 0.02);
            ctx.moveTo(a[0], a[1] - 4 * scale);
            ctx.lineTo(a[0] + 4 * scale, a[1]);
            ctx.lineTo(a[0], a[1] + 4 * scale);
            ctx.lineTo(a[0] - 4 * scale, a[1]);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    const selected = patch.cells[0];
    if (selected?.valid) {
      ctx.strokeStyle = "#68AF9A";
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      for (let d = 0; d < 6; d++) {
        const a = Math.PI / 6 + (d * Math.PI) / 3;
        ctx.lineTo(
          ...point(
            Math.cos(a) / Math.sqrt(3),
            Math.sin(a) / Math.sqrt(3),
            mode === "below" ? 0.025 : selected.state.place.ground === "rock" ? SURFACE_ROCK_HEIGHT + 0.012 : 0.012,
          ),
        );
      }
      ctx.closePath();
      ctx.stroke();
    }
    // The outline and location marks contact the back plane; solid cut faces occlude them too.
    ctx.drawImage(this.terrain!.front, 0, 0);
    const selectedWorkers = patch.selected.ants.length,
      contextWorkers = patch.cells
        .slice(1)
        .filter((c) => c.valid)
        .reduce((n, c) => n + c.state.ants.length, 0);
    return { selectedWorkers, contextWorkers, drawnWorkers, terrainCacheHit: cacheHit };
  }
}
