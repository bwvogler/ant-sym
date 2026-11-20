import projection from "../assets/inspection/projection.json" with { type: "json" };
import lifecycleProjection from "../assets/inspection/lifecycle-manifest.json" with { type: "json" };
import type { CellInspectionState } from "./cellInspection.ts";
import { APHID_SPOTS, FOOD_SPOTS, foodDensity, foodKind, aphidDensity } from "./resourceSprites.ts";
import { workerDirection } from "./workerSprites.ts";
import { ALARM_SHOWN, TRAIL_SHOWN } from "./lens.ts";

export const INSPECTION_ATLAS_URL = new URL("../assets/inspection/inspection-atlas.png", import.meta.url).href;
export const LIFECYCLE_ATLAS_URL = new URL("../assets/inspection/inspection-lifecycle.png", import.meta.url).href;
export const LIFECYCLE_ATLAS_SIZE = [lifecycleProjection.width, lifecycleProjection.height] as const;
/** Fixed orthographic basis exported by Blender. Map y points down; the exported vector already accounts for that. */
export function inspectionPoint(x: number, y: number, z = 0): [number, number] {
  const [a, b, c] = projection.basis;
  return [a[0] * x + b[0] * y + c[0] * z, a[1] * x + b[1] * y + c[1] * z];
}

/** Layered voxel sprites with actual relative actor positions. Soil grit is illustrative; contents and connections are live. */
export function drawCellInspection(
  ctx: CanvasRenderingContext2D,
  atlas: CanvasImageSource,
  state: CellInspectionState,
  width: number,
  height: number,
  showTrails = true,
  lifecycle?: CanvasImageSource,
): void {
  const scale = Math.min(width / 384, height / 320),
    ox = width / 2,
    oy = height * 0.58;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  const point = (x: number, y: number, z = 0): [number, number] => {
    const [a, b] = inspectionPoint(x, y, z);
    return [ox + a * scale, oy + b * scale];
  };
  const sprite = (name: string, x = 0, y = 0, z = 0) => {
    const i = projection.names.indexOf(name);
    if (i < 0) return;
    const p = point(x, y, z);
    ctx.drawImage(
      atlas,
      (i % projection.cols) * projection.stride + 1,
      Math.floor(i / projection.cols) * projection.stride + 1,
      256,
      256,
      p[0] - projection.anchor[0] * scale,
      p[1] - projection.anchor[1] * scale,
      256 * scale,
      256 * scale,
    );
  };
  const nestSprite = (name: string, x = 0, y = 0, z = 0) => {
    if (!lifecycle) return;
    const i = lifecycleProjection.names.indexOf(name);
    if (i < 0) return;
    const p = point(x, y, z);
    const pixelScale = (lifecycleProjection.worldFrame / projection.worldFrame) * (projection.frame / lifecycleProjection.frame) * scale;
    ctx.drawImage(
      lifecycle,
      (i % lifecycleProjection.cols) * lifecycleProjection.stride + 1,
      Math.floor(i / lifecycleProjection.cols) * lifecycleProjection.stride + 1,
      lifecycleProjection.frame,
      lifecycleProjection.frame,
      p[0] - lifecycleProjection.anchor[0] * pixelScale,
      p[1] - lifecycleProjection.anchor[1] * pixelScale,
      lifecycleProjection.frame * pixelScale,
      lifecycleProjection.frame * pixelScale,
    );
  };
  const p = state.place;
  if (p.ground !== "air") sprite(p.ground === "rock" ? "ground-rock" : p.ground === "soil" ? "ground-soil" : "ground-open");
  if (p.hole >= 0 && p.ground === "open") {
    ctx.fillStyle = "#38291f";
    ctx.beginPath();
    for (let d = 0; d < 16; d++) {
      const a = (d * Math.PI) / 8;
      ctx.lineTo(...point(0.36 * Math.cos(a), 0.36 * Math.sin(a), 0.005));
    }
    ctx.closePath();
    ctx.fill();
  }
  if (showTrails && p.ground === "open") {
    for (const [value, cut, colour] of [
      [p.homeTrail, TRAIL_SHOWN, "#c46e28"],
      [p.foodTrail, TRAIL_SHOWN, "#1f6f5c"],
      [p.alarm, ALARM_SHOWN, "#b34840"],
    ] as const) {
      if (value <= cut) continue;
      ctx.save();
      ctx.globalAlpha = 0.25 * value;
      ctx.fillStyle = colour;
      ctx.beginPath();
      for (let d = 0; d < 6; d++) {
        const a = Math.PI / 6 + (d * Math.PI) / 3;
        const v = point(Math.cos(a) / Math.sqrt(3), Math.sin(a) / Math.sqrt(3), 0.008);
        ctx.lineTo(...v);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  // Sparse square grit/spoil and spores are texture indicators of the recorded cell fields, not simulated particles.
  if (p.mound > 0)
    for (const [x, y] of [
      [-0.28, 0.1],
      [0.18, 0.25],
      [0.22, -0.23],
      [-0.12, -0.24],
    ])
      sprite("food-crumb", x, y);
  if (p.hypha) {
    const a = point(0, 0, 0.015);
    ctx.strokeStyle = "#7a4fa0";
    ctx.fillStyle = "#7a4fa0";
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = "square";
    for (const [x, y] of state.threads) {
      const b = point(x * 0.48, y * 0.48, 0.015);
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
    }
    const q = (state.knot ? 9 : 4) * scale;
    ctx.fillRect(a[0] - q / 2, a[1] - q / 2, q, q);
  }
  if (p.spores) {
    ctx.fillStyle = "#ac81d0";
    for (const [x, y] of [
      [-0.24, -0.1],
      [0.18, 0.15],
      [0.08, -0.28],
      [-0.1, 0.3],
    ]) {
      const [a, b] = point(x, y, 0.025);
      ctx.fillRect(a - 2 * scale, b - 2 * scale, 4 * scale, 4 * scale);
    }
  }
  if (state.stalk) {
    const a = point(0.1, 0),
      b = point(0.1, 0, 0.28);
    ctx.strokeStyle = "#574361";
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
    ctx.fillStyle = "#7a4fa0";
    ctx.fillRect(b[0] - 4 * scale, b[1] - 3 * scale, 8 * scale, 6 * scale);
  }
  const food = foodDensity(p.food);
  ctx.globalAlpha = food.alpha;
  for (let i = 0; i < food.marks; i++) sprite("food-" + foodKind(state.quality), ...FOOD_SPOTS[i]);
  ctx.globalAlpha = 1;
  const aphids = aphidDensity(state.aphidDensity, 1);
  ctx.globalAlpha = aphids.alpha;
  for (let i = 0; i < aphids.marks; i++) sprite("aphid-" + (i & 3), ...APHID_SPOTS[i]);
  ctx.globalAlpha = 1;
  if (state.fallen > 0) nestSprite("corpse");
  const broodSpots = [
    [-0.22, -0.18],
    [0, 0.14],
    [0.23, -0.12],
  ] as const;
  for (let stage = 0; stage < 3; stage++) if ((state.brood?.[stage] ?? 0) > 0) nestSprite("brood-" + stage, ...broodSpots[stage]);
  // Back-to-front by projected foot position. Every occupant is included; none is packed or spread for the picture.
  const bodies = [
    ...state.ants.map((body) => ({ kind: "worker" as const, body })),
    ...(state.queens ?? []).map((body) => ({ kind: "queen" as const, body })),
  ];
  bodies.sort((a, b) => inspectionPoint(a.body.x, a.body.y)[1] - inspectionPoint(b.body.x, b.body.y)[1]);
  for (const entity of bodies) {
    if (entity.kind === "queen") {
      const queen = entity.body;
      nestSprite(queen.alive ? "queen" : "queen-dead", queen.x, queen.y);
      ctx.globalAlpha = 1;
      const [x, y] = point(queen.x, queen.y, queen.alive ? 0.3 : 0.12);
      if (!queen.alive) {
        ctx.strokeStyle = "#b34840";
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(x - 7 * scale, y - 7 * scale);
        ctx.lineTo(x + 7 * scale, y + 7 * scale);
        ctx.moveTo(x + 7 * scale, y - 7 * scale);
        ctx.lineTo(x - 7 * scale, y + 7 * scale);
        ctx.stroke();
      } else if (queen.infected) {
        ctx.fillStyle = "#ac81d0";
        ctx.fillRect(x - 3 * scale, y - 3 * scale, 6 * scale, 6 * scale);
      }
      continue;
    }
    const ant = entity.body;
    sprite("worker-" + workerDirection(ant.heading), ant.x, ant.y);
    if (ant.carrying)
      sprite("food-" + foodKind(ant.quality), ant.x + Math.cos(ant.heading) * 0.46, ant.y + Math.sin(ant.heading) * 0.46, 0.16);
    else if (ant.cargo === "brood" && ant.broodStage !== undefined)
      nestSprite("brood-" + ant.broodStage, ant.x + Math.cos(ant.heading) * 0.46, ant.y + Math.sin(ant.heading) * 0.46, 0.16);
    else if (ant.cargo === "corpse") nestSprite("corpse", ant.x + Math.cos(ant.heading) * 0.46, ant.y + Math.sin(ant.heading) * 0.46, 0.16);
    else if (ant.cargo === "soil") sprite("food-crumb", ant.x + Math.cos(ant.heading) * 0.46, ant.y + Math.sin(ant.heading) * 0.46, 0.16);
    if (ant.infected) {
      const [x, y] = point(ant.x, ant.y, 0.27);
      ctx.fillStyle = "#ac81d0";
      ctx.fillRect(x - 3 * scale, y - 3 * scale, 6 * scale, 6 * scale);
    }
  }
}
