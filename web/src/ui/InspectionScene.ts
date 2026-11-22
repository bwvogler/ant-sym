import { wander } from "./hyphaeLook.ts";
import { inspectionMoundFloor } from "./inspectionMound.ts";
import * as T from "three";
import { voxelFrustum, type VoxelViewport } from "./voxelViewport.ts";
import { VoxelTerrainCache, buildVoxelTerrainChunk } from "./voxelTerrainChunks.ts";
import { INSPECTION_GROUND } from "./inspectionGround.ts";
import { ROLE_RGB } from "./palette.ts";
import { InspectionSoftware } from "./inspectionSoftware.ts";
import { buildPatchTerrain, faceColour } from "./drawInspectionPatch.ts";
import type { InspectionPatch } from "./inspectionPatch.ts";
import { cellKey, centreX, centreY } from "../colony/index.ts";
import { FOOD_SPOTS, APHID_SPOTS, foodDensity, foodKind, aphidDensity } from "./resourceSprites.ts";
import { leafTiles, LEAF_STEP, LEAF_BOTTOM, LEAF_TOP, LEAF_VEIN_TOP } from "./surfaceFood.ts";
import { inspectionScents, inspectionMarkers, SCENT_STYLES, type InspectionOverlays } from "./inspectionOverlays.ts";
import { hyphaShape, HYPHA_COLOURS } from "./hyphaVisual.ts";
import { fungalPrimitives, STALK_HEIGHT } from "./fungalStructures.ts";
import { mapOrbit, orbitCamera, inspectionFrameScale, mapTiltTarget, BELOW_WALK_PLANE, type InspectionOrbit } from "./inspectionOrbit.ts";
type V = [number, number, number];
interface Part {
  positions: number[];
  colours: number[];
}
export type InspectionModels = Record<string, { body: Part; band: Part }>;
const MODEL_URL = new URL("../assets/inspection-3d/models.json", import.meta.url).href;
/** The map palette uses CSS space-separated rgb(), while Three's parser expects commas. */
export const inspectionColour = (hex: string): V =>
  new T.Color(hex.replace(/^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/, "rgb($1,$2,$3)")).toArray() as V;
const colour = inspectionColour;
function geometry(p: Part): T.BufferGeometry {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p.positions, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(p.colours, 3));
  g.computeVertexNormals();
  return g;
}
class Faces implements Part {
  positions: number[] = [];
  colours: number[] = [];
  face(ps: V[], c: V): void {
    for (let i = 1; i < ps.length - 1; i++)
      for (const p of [ps[0], ps[i], ps[i + 1]]) {
        this.positions.push(...p);
        this.colours.push(...c);
      }
  }
  box(at: V, size: V, c: V): void {
    const [x, y, z] = at.map((v, i) => v - size[i] / 2),
      [a, b, d] = size,
      p: V[] = [
        [x, y, z],
        [x + a, y, z],
        [x + a, y + b, z],
        [x, y + b, z],
        [x, y, z + d],
        [x + a, y, z + d],
        [x + a, y + b, z + d],
        [x, y + b, z + d],
      ];
    for (const ids of [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [3, 7, 6, 2],
      [1, 2, 6, 5],
      [0, 4, 7, 3],
    ])
      this.face(
        ids.map((i) => p[i]),
        c,
      );
  }
  beam(a: V, b: V, w: number, c: V): void {
    const direction = new T.Vector3(...b).sub(new T.Vector3(...a)),
      len = direction.length();
    if (len < 1e-8) return;
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), direction.normalize()),
      mid = new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(0.5),
      local = new Faces();
    local.box([0, 0, 0], [w, w, len], c);
    for (let i = 0; i < local.positions.length; i += 3) {
      const p = new T.Vector3(...(local.positions.slice(i, i + 3) as V)).applyQuaternion(q).add(mid);
      this.positions.push(p.x, p.y, p.z);
    }
    this.colours.push(...local.colours);
  }
}
interface Pool {
  capacity: number;
  used: number;
  body: T.InstancedMesh;
  band: T.InstancedMesh | null;
}
/** Real geometry at shared world scale, with a software depth-buffered fallback and no independent animation clock. */
export class InspectionScene {
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-2.15, 2.15, 1.792, -1.792, 0.05, 50);
  readonly renderer: Pick<T.WebGLRenderer, "render" | "dispose" | "setSize">;
  readonly accelerated: boolean;
  orbit: InspectionOrbit = mapOrbit();
  private mode: InspectionPatch["mode"];
  private models = new Map<string, { body: T.BufferGeometry; band: T.BufferGeometry }>();
  private pools = new Map<string, Pool>();
  private material = new T.MeshLambertMaterial({ vertexColors: true });
  private unlit = new T.MeshBasicMaterial({ vertexColors: true });
  private terrain = new T.Group();
  private terrainWasViewport = false;
  private terrainChunks = new VoxelTerrainCache<T.Mesh>(
    (chunk) => {
      const f = new Faces();
      for (const face of buildVoxelTerrainChunk(chunk)) f.face(face.points, colour(faceColour(face, chunk.patch.mode)));
      return new T.Mesh(geometry(f), this.material);
    },
    (mesh) => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    },
  );
  private contents = new T.Group();
  private overlays = new T.Group();
  private terrainKey = "";
  private contentsKey = "";
  private overlayKey = "";
  private cube = new T.Object3D();
  private bandInk = new T.Color("#302A24");
  private bandAmber = new T.Color("#AB761D");
  private bandTone = new T.Color();
  private viewport: VoxelViewport | null = null;
  private paletteKey = "";
  static async create(canvas: HTMLCanvasElement, mode: InspectionPatch["mode"], software = false): Promise<InspectionScene> {
    const r = await fetch(MODEL_URL);
    if (!r.ok) throw Error("Voxel models could not load");
    return new InspectionScene(canvas, mode, (await r.json()) as InspectionModels, software);
  }
  private constructor(canvas: HTMLCanvasElement, mode: InspectionPatch["mode"], models: InspectionModels, software = false) {
    this.mode = mode;
    try {
      if (software) throw Error("Use software inspection");
      const gpu = new T.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
      gpu.setSize(384, 320, false);
      gpu.setPixelRatio(1);
      gpu.setClearColor(0, 0);
      gpu.outputColorSpace = T.SRGBColorSpace;
      this.renderer = gpu;
      this.accelerated = true;
    } catch {
      this.renderer = new InspectionSoftware(canvas);
      this.accelerated = false;
    }
    this.scene.add(new T.AmbientLight(0xffffff, 1.5));
    const key = new T.DirectionalLight(0xfff2dc, 2.2),
      fill = new T.DirectionalLight(0xe0edff, 0.6);
    key.position.set(-3, -5, 8);
    fill.position.set(5, 2, 3);
    this.scene.add(key, fill, this.terrain, this.contents, this.overlays);
    // The queen's nest atlas has cooler shadows and lighter shell facets than
    // the worker atlas. Keep these tones in model space for either renderer.
    const workerPalette = ["#231F1C", "#362F29", "#4C4137", "#65513F", "#896B4D"];
    const queenPalette = ["#1B1D23", "#3D3432", "#514644", "#7B6559", "#846B5C"];
    for (const [name, m] of Object.entries(models)) {
      const body = geometry(m.body);
      const band = geometry(m.band);
      this.models.set(name, { body, band });
      if (!m.band.positions.length) continue;
      const queen = name === "queen" || name === "alate-body";
      const [shadow, edge, midtone, topFace, highlight] = (queen ? queenPalette : workerPalette).map((hex) => new T.Color(hex));
      const litLeg = new T.Color(queen ? "#645550" : "#776755");
      body.computeBoundingBox();
      const height = body.boundingBox!.max.z;
      const shellShade = (mesh: T.BufferGeometry, stripe: boolean, tunnel = false) => {
        const positions = mesh.getAttribute("position");
        const colours = mesh.getAttribute("color");
        const normals = mesh.getAttribute("normal");
        const tone = new T.Color();
        // Give both triangles of a voxel quad the same tone.
        const vertices = positions.array;
        const sameVertex = (a: number, b: number) =>
          vertices[a] === vertices[b] && vertices[a + 1] === vertices[b + 1] && vertices[a + 2] === vertices[b + 2];
        for (let i = 0; i < positions.count;) {
          const quad = i + 5 < positions.count && sameVertex(i * 3, i * 3 + 9) && sameVertex(i * 3 + 6, i * 3 + 12);
          const end = i + (quad ? 6 : 3);
          const divisor = (quad ? 2 : 3) * height;
          const z = (positions.getZ(i) + positions.getZ(i + 2) + (quad ? 0 : positions.getZ(i + 1))) / divisor;
          const y = (positions.getY(i) + positions.getY(i + 2) + (quad ? 0 : positions.getY(i + 1))) / divisor;
          const top = Math.max(0, normals.getZ(i));
          const light = T.MathUtils.clamp(0.6 * z + 0.27 * top + 0.28 * y, 0, 1);
          if (stripe) {
            // Like the sprite mask, modulate the colony tint with a neutral ramp.
            tone.setScalar(0.65 + 0.5 * light).convertSRGBToLinear();
          } else if (colours.getZ(i) > 0.027) {
            const shellLight = tunnel ? T.MathUtils.clamp(light + 0.1 * top + 0.18 * y, 0, 1) : light;
            tone.copy(shellLight > 0.84 ? highlight : shellLight > 0.66 ? topFace : shellLight > 0.4 ? midtone : edge);
          } else if (tunnel) {
            // Catch light on the upper edges of the limbs against the dark back wall.
            tone.copy(shadow).lerp(litLeg, top * (0.64 + 0.36 * T.MathUtils.clamp(z * 2, 0, 1)));
          } else {
            tone.copy(top > 0.5 ? edge : shadow);
          }
          for (; i < end; i++) colours.setXYZ(i, tone.r, tone.g, tone.b);
        }
      };
      if (name === "worker" || name === "queen") {
        const tunnelBody = body.clone();
        shellShade(tunnelBody, false, true);
        this.models.set(name + "-below", { body: tunnelBody, band });
      }
      shellShade(body, false);
      shellShade(band, true);
    }
    for (const [name, c] of [
      ["infection", "#B18DD1"],
      ["dead-cross", "#B34840"],
    ] as const) {
      const f = new Faces();
      if (name === "infection") f.box([0, 0, 0], [0.045, 0.045, 0.045], colour(c));
      else {
        f.beam([-0.07, -0.07, 0], [0.07, 0.07, 0], 0.025, colour(c));
        f.beam([-0.07, 0.07, 0], [0.07, -0.07, 0], 0.025, colour(c));
      }
      this.models.set(name, { body: geometry(f), band: geometry({ positions: [], colours: [] }) });
    }
    const style = getComputedStyle(canvas);
    try {
      this.setPalette(style.getPropertyValue("--ink").trim() || "#302A24", style.getPropertyValue("--warn").trim() || "#AB761D");
    } catch {
      /* neutral defaults */
    }
  }
  reset(): void {
    this.orbit = mapOrbit();
  }
  setViewport(view: VoxelViewport): void {
    const next = voxelFrustum(view);
    if (!this.viewport || next.width !== this.viewport.width || next.height !== this.viewport.height)
      this.renderer.setSize(next.width, next.height, false);
    this.viewport = next;
  }
  get terrainStats() {
    return {
      active: this.terrainWasViewport ? this.terrain.children.length : 0,
      cached: this.terrainChunks.size,
      rebuilt: this.terrainChunks.rebuilt,
    };
  }
  setPalette(ink: string, amber: string): void {
    const key = ink + "/" + amber;
    if (key === this.paletteKey) return;
    this.bandInk.fromArray(inspectionColour(ink)).convertLinearToSRGB();
    this.bandAmber.fromArray(inspectionColour(amber)).convertLinearToSRGB();
    this.paletteKey = key;
  }
  angle(): void {
    this.orbit = { yaw: 0, tilt: 0.65 };
  }
  private clear(g: T.Group): void {
    for (const child of [...g.children]) {
      g.remove(child);
      if (child instanceof T.Mesh) child.geometry.dispose();
    }
  }
  private add(g: T.Group, f: Faces, lit = true): void {
    if (f.positions.length) g.add(new T.Mesh(geometry(f), lit ? this.material : this.unlit));
  }
  private floor: ReturnType<typeof inspectionMoundFloor>;
  private point(x: number, y: number, z = 0): V {
    return this.mode === "surface" ? [x, -y, z + (this.floor?.(x, y) ?? 0)] : [x, BELOW_WALK_PLANE - z, -y];
  }
  private actor(name: string, x: number, y: number, z = 0, heading = 0, odour?: number, pitch = 0): void {
    if (this.mode === "below" && (name === "worker" || name === "queen")) name += "-below";
    const model = this.models.get(name);
    if (!model) return;
    let pool = this.pools.get(name);
    if (!pool || pool.used >= pool.capacity) {
      const capacity = pool ? pool.capacity * 2 : 32,
        used = pool?.used ?? 0,
        hasBand = model.band.getAttribute("position").count > 0,
        body = new T.InstancedMesh(model.body, hasBand ? this.unlit : this.material, capacity),
        band = hasBand ? new T.InstancedMesh(model.band, this.unlit, capacity) : null;
      body.frustumCulled = false;
      if (band) band.frustumCulled = false;
      if (pool) {
        const m = new T.Matrix4(),
          c = new T.Color();
        for (let i = 0; i < used; i++) {
          pool.body.getMatrixAt(i, m);
          body.setMatrixAt(i, m);
          if (band && pool.band) {
            pool.band.getMatrixAt(i, m);
            band.setMatrixAt(i, m);
            pool.band.getColorAt(i, c);
            band.setColorAt(i, c);
          }
        }
        this.scene.remove(pool.body);
        this.scene.remove(pool.band!);
        pool.body.dispose();
        pool.band?.dispose();
      }
      pool = { capacity, used, body, band };
      this.pools.set(name, pool);
      this.scene.add(body);
      if (band) this.scene.add(band);
    }
    this.cube.position.set(...this.point(x, y, z));
    this.cube.quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), -heading);
    if (pitch) this.cube.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -pitch));
    if (this.mode === "below") this.cube.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
    this.cube.updateMatrix();
    pool.body.setMatrixAt(pool.used, this.cube.matrix);
    if (pool.band) {
      pool.band.setMatrixAt(pool.used, this.cube.matrix);
      // Sample the UI palette in sRGB, as the sprite tint does. The geometry's
      // neutral shading gives the band depth while preserving its hue.
      const t = Math.max(0, Math.min(1, odour ?? 0));
      pool.band.setColorAt(pool.used, this.bandTone.copy(this.bandInk).lerp(this.bandAmber, t).convertSRGBToLinear());
    }
    pool.used++;
  }
  draw(patch: InspectionPatch, options: InspectionOverlays): void {
    const mode = patch.mode;
    if (mode !== this.mode) {
      this.mode = mode;
      this.reset();
      this.terrainKey = this.contentsKey = this.overlayKey = "";
    }
    this.floor = inspectionMoundFloor(patch);
    const terrainKey = JSON.stringify([
      mode,
      patch.bounds,
      patch.selected.cell,
      patch.cells.map((c) => [
        c.valid,
        c.surfaceStrip,
        c.state.place.ground,
        c.projectedGround,
        c.projectedSpoil,
        c.surfaceEntrance,
        c.state.place.mound,
        mode === "surface" && c.state.place.hole >= 0,
      ]),
    ]);
    this.terrainChunks.rebuilt = 0;
    if (terrainKey !== this.terrainKey) {
      if (this.terrainWasViewport) this.terrain.clear();
      else this.clear(this.terrain);
      if (patch.bounds) {
        const cx = centreX(...patch.selected.cell),
          cy = centreY(patch.selected.cell[1]);
        for (const chunk of this.terrainChunks.update(patch)) {
          chunk.value.position.set(chunk.x - cx, mode === "surface" ? cy - chunk.y : 0, mode === "below" ? cy - chunk.y : 0);
          this.terrain.add(chunk.value);
        }
      } else {
        const f = new Faces();
        for (const face of buildPatchTerrain(patch, true)) f.face(face.points, colour(faceColour(face, mode)));
        this.add(this.terrain, f);
      }
      this.terrainWasViewport = !!patch.bounds;
      this.terrainKey = terrainKey;
    }
    const [gx, gy] = patch.selected.cell,
      cx = centreX(gx, gy),
      cy = centreY(gy);
    const contentsKey = JSON.stringify([
      terrainKey,
      patch.cells.map(({ state: s }) => [
        s.place.food,
        s.quality,
        s.place.hypha,
        s.threads,
        s.cord,
        s.knot,
        s.knotSprouted,
        s.fruit,
        s.colonised,
        s.sporulating,
        s.stalkLevel,
        s.tips,
      ]),
      [...(patch.surfaceFood ?? [])],
    ]);
    if (contentsKey !== this.contentsKey) {
      this.clear(this.contents);
      const f = new Faces();
      if (mode === "surface") {
        const food = new Map([
          ...(patch.surfaceFood ?? []),
          ...patch.cells
            .filter((c) => c.valid && c.state.place.ground === "open" && foodKind(c.state.quality) === "plain")
            .map((c) => [cellKey(...c.state.cell), c.state.place.food] as [number, number]),
        ]);
        const tiles = patch.cells
            .filter((c) => c.valid && c.state.place.ground === "open" && foodKind(c.state.quality) === "plain")
            .flatMap((c) => leafTiles(...c.state.cell, (x, y) => food.get(cellKey(x, y)) ?? 0)),
          heights = new Map(
            tiles.map((t) => [`${Math.round(t.x / LEAF_STEP)},${Math.round(t.y / LEAF_STEP)}`, t.vein ? LEAF_VEIN_TOP : LEAF_TOP]),
          );
        const onGround = (x: number, y: number, z: number) => this.point(x, -y, z);
        for (const t of tiles) {
          const x = t.x - cx,
            y = t.y - cy,
            h = t.vein ? LEAF_VEIN_TOP : LEAF_TOP,
            s = LEAF_STEP,
            ix = Math.round(t.x / s),
            iy = Math.round(t.y / s);
          f.face(
            [onGround(x, -y - s, h), onGround(x + s, -y - s, h), onGround(x + s, -y, h), onGround(x, -y, h)],
            colour(t.vein ? "#A3B85B" : "#627C37"),
          );
          f.face(
            [
              onGround(x, -y, LEAF_BOTTOM),
              onGround(x + s, -y, LEAF_BOTTOM),
              onGround(x + s, -y - s, LEAF_BOTTOM),
              onGround(x, -y - s, LEAF_BOTTOM),
            ],
            colour("#4C622C"),
          );
          for (const [dx, dy, a, b] of [
            [1, 0, [x + s, -y], [x + s, -y - s]],
            [-1, 0, [x, -y - s], [x, -y]],
            [0, 1, [x + s, -y - s], [x, -y - s]],
            [0, -1, [x, -y], [x + s, -y]],
          ] as [number, number, [number, number], [number, number]][]) {
            const other = heights.get(`${ix + dx},${iy + dy}`) ?? LEAF_BOTTOM;
            if (other < h) f.face([onGround(...a, h), onGround(...b, h), onGround(...b, other), onGround(...a, other)], colour("#4C622C"));
          }
        }
      }
      const edges = new Set<string>();
      for (const c of patch.cells) {
        if (!c.valid || c.surfaceStrip || c.state.place.ground !== "open") continue;
        const s = c.state;
        if (s.place.hypha)
          for (const [dx, dy] of s.threads) {
            const a: [number, number] = [cx + c.x, cy + c.y],
              b: [number, number] = [a[0] + dx, a[1] + dy],
              key = [a.map((v) => v.toFixed(5)).join(","), b.map((v) => v.toFixed(5)).join(",")].sort().join("/");
            if (edges.has(key)) continue;
            edges.add(key);
            const shape = hyphaShape(a, b),
              target = patch.cells.find((n) => n.valid && Math.abs(n.x - c.x - dx) < 1e-5 && Math.abs(n.y - c.y - dy) < 1e-5),
              pts = target ? shape.points : shape.points.slice(0, 5),
              cord = s.cord || target?.state.cord;
            for (let i = 1; i < pts.length; i++) {
              const a = pts[i - 1],
                b = pts[i];
              f.beam(
                this.point(a[0] - cx, a[1] - cy, 0.035),
                this.point(b[0] - cx, b[1] - cy, 0.035),
                cord ? 0.075 : 0.045,
                colour(HYPHA_COLOURS.body),
              );
              if (cord) {
                const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
                for (const side of [-1, 1]) {
                  const ox = (-(b[1] - a[1]) / len) * 0.026 * side,
                    oy = ((b[0] - a[0]) / len) * 0.026 * side;
                  f.beam(
                    this.point(a[0] - cx + ox, a[1] - cy + oy, 0.066),
                    this.point(b[0] - cx + ox, b[1] - cy + oy, 0.066),
                    0.018,
                    colour(side < 0 ? "#FFFFFF" : "#C4C4A2"),
                  );
                }
              }
            }
            for (const [a, b] of shape.hairs) {
              if (!target && Math.hypot(a[0] - cx - c.x, a[1] - cy - c.y) > 0.51) continue;
              f.beam(this.point(a[0] - cx, a[1] - cy, 0.038), this.point(b[0] - cx, b[1] - cy, 0.05), 0.018, colour("#FFFFFF"));
            }
          }
        if (s.place.hypha && !s.threads.length && !s.knot && !s.tips?.length)
          f.box(this.point(c.x, c.y, 0.035), [0.07, 0.07, 0.07], colour(HYPHA_COLOURS.body));
        const spot = [0, 0];
        wander(cx + c.x, cy + c.y, spot);
        for (const p of fungalPrimitives({ ...s, stalkLevel: mode === "surface" ? s.stalkLevel : 0 }, cellKey(...s.cell))) {
          const point = (p: V) => this.point(spot[0] - cx + p[0], spot[1] - cy + p[1], p[2]);
          if (p.kind === "beam") f.beam(point(p.a), point(p.b), p.width, colour(p.colour));
          else f.box(point(p.at), mode === "surface" ? p.size : [p.size[0], p.size[2], p.size[1]], colour(p.colour));
        }
      }
      this.add(this.contents, f);
      this.contentsKey = contentsKey;
    }
    const overlayKey = JSON.stringify([
      terrainKey,
      options,
      patch.cells.map((c) => [
        c.state.place.homeTrail.toFixed(2),
        c.state.place.foodTrail.toFixed(2),
        c.state.place.alarm.toFixed(2),
        c.state.place.hole,
        c.state.place.chamber?.role,
        c.state.place.spores,
      ]),
    ]);
    if (overlayKey !== this.overlayKey) {
      this.clear(this.overlays);
      const f = new Faces();
      for (let at = 0; at < patch.cells.length; at++) {
        const c = patch.cells[at];
        if (!c.valid || c.surfaceStrip || c.state.place.ground !== "open") continue;
        const { x, y, state: s } = c;
        const line = (a: [number, number], b: [number, number], w: number, hex: string, z = 0.015) =>
          f.beam(this.point(x + a[0], y + a[1], z), this.point(x + b[0], y + b[1], z), w, colour(hex));
        if (options.chambers && mode === "below" && s.place.chamber) {
          const rgb = ROLE_RGB[s.place.chamber.role];
          if (rgb) {
            const tint = new T.Color(INSPECTION_GROUND.back).lerp(new T.Color(`rgb(${rgb.join(",")})`), 0.2).toArray() as V;
            const hex: V[] = Array.from({ length: 6 }, (_, j) =>
              this.point(
                x + Math.cos(Math.PI / 6 + (j * Math.PI) / 3) / Math.sqrt(3),
                y + Math.sin(Math.PI / 6 + (j * Math.PI) / 3) / Math.sqrt(3),
                0.005,
              ),
            );
            f.face(hex.reverse(), tint);
          }
        }
        if (at === 0 && options.selection !== false)
          for (let j = 0; j < 6; j++) {
            const a = (j * Math.PI) / 3 + Math.PI / 6,
              b = ((j + 1) * Math.PI) / 3 + Math.PI / 6;
            line([Math.cos(a) * 0.565, Math.sin(a) * 0.565], [Math.cos(b) * 0.565, Math.sin(b) * 0.565], 0.018, "#68AF9A");
          }
        if (mode === "surface" && s.place.hole >= 0) {
          const ps: V[] = [];
          for (let i = 0; i < 16; i++)
            ps.push(this.point(x + 0.36 * Math.cos((i * Math.PI) / 8), y + 0.36 * Math.sin((i * Math.PI) / 8), 0.005));
          f.face(ps.reverse(), colour("#38291F"));
        }
        if (s.place.spores)
          for (const [a, b] of [
            [-0.24, -0.1],
            [0.18, 0.15],
            [0.08, -0.28],
          ])
            f.box(this.point(x + a, y + b, 0.025), [0.035, 0.035, 0.035], colour("#B18DD1"));
        if (options.markers)
          for (const mark of inspectionMarkers(s.place)) {
            const n = mark.kind === "entrance" ? 20 : 4,
              r = mark.kind === "entrance" ? 0.4 : 0.43;
            for (let i = 0; i < n; i++) {
              if (n === 20 && i % 2) continue;
              line(
                [Math.cos((i * Math.PI * 2) / n) * r, Math.sin((i * Math.PI * 2) / n) * r],
                [Math.cos(((i + 1) * Math.PI * 2) / n) * r, Math.sin(((i + 1) * Math.PI * 2) / n) * r],
                0.017,
                mark.colour,
              );
            }
          }
        if (options.scents)
          for (const scent of inspectionScents(s.place)) {
            const hex = SCENT_STYLES[scent.kind].colour,
              amount = Math.ceil(scent.strength * 4);
            for (let i = 0; i < amount; i++) {
              const xx = -0.33 + i * 0.2,
                yy = scent.kind === "home" ? -0.27 : scent.kind === "food" ? 0 : 0.27;
              if (scent.kind === "home") line([xx - 0.05, yy], [xx + 0.05, yy], 0.016, hex);
              else if (scent.kind === "food") f.box(this.point(x + xx, y + yy, 0.02), [0.03, 0.03, 0.03], colour(hex));
              else {
                line([xx - 0.035, yy - 0.035], [xx + 0.035, yy + 0.035], 0.014, hex);
                line([xx - 0.035, yy + 0.035], [xx + 0.035, yy - 0.035], 0.014, hex);
              }
            }
          }
      }
      this.add(this.overlays, f, false);
      this.overlayKey = overlayKey;
    }
    for (const p of this.pools.values()) p.used = 0;
    for (const c of patch.cells) {
      if (!c.valid || c.surfaceStrip || c.state.place.ground !== "open") continue;
      const { x, y, state: s } = c;
      for (const d of s.cadavers ?? []) this.actor(`corpse-${d.stage}`, x, y, 0, d.heading ?? 0);
      if (!s.cadavers && s.fallen > 0) this.actor("corpse", x, y);
      for (let i = 0; i < 3; i++) if (s.brood[i] > 0) this.actor("brood-" + i, x + [-0.22, 0, 0.23][i], y + [-0.18, 0.14, -0.12][i]);
      const food = foodDensity(s.place.food);
      if (!(mode === "surface" && foodKind(s.quality) === "plain"))
        for (let i = 0; i < food.marks; i++) this.actor("food-" + foodKind(s.quality), x + FOOD_SPOTS[i][0], y + FOOD_SPOTS[i][1]);
      const stores = s.storedFoodMarks ?? 0;
      for (let i = 0; i < Math.min(5, stores); i++) this.actor("food-plain", x + FOOD_SPOTS[i][0], y + FOOD_SPOTS[i][1]);
      const aphids = aphidDensity(s.aphidDensity, 1);
      for (let i = 0; i < aphids.marks; i++) this.actor("aphid", x + APHID_SPOTS[i][0], y + APHID_SPOTS[i][1]);
      for (const q of s.queens) {
        this.actor(q.alive ? "queen" : "queen-dead", x + q.x, y + q.y, 0, 0, q.odour);
        if (!q.alive) this.actor("dead-cross", x + q.x, y + q.y, 0.18);
        else if (q.infected) this.actor("infection", x + q.x, y + q.y, 0.43);
      }
      for (const a of s.ants) {
        const ax = x + a.x,
          ay = y + a.y,
          ux = Math.cos(a.heading),
          uy = Math.sin(a.heading),
          dx = ux * 0.22,
          dy = uy * 0.22,
          height = this.floor?.(ax, ay) ?? 0,
          clearance = Math.min(height, 0.025),
          rise = this.floor ? this.floor(ax + dx, ay + dy) - this.floor(ax - dx, ay - dy) : 0,
          pitch = Math.atan2(rise, 0.44);
        this.actor("worker", ax, ay, clearance, a.heading, a.odour, pitch);
        if (a.infected) this.actor("infection", ax, ay, 0.43 + clearance);
        const cargo = a.carrying
          ? "food-" + foodKind(a.quality)
          : a.cargo === "brood" && a.broodStage !== undefined
            ? "brood-" + a.broodStage
            : a.cargo === "corpse"
              ? `corpse-${a.corpseStage ?? 0}`
              : a.cargo === "soil"
                ? "food-crumb"
                : undefined;
        if (cargo) {
          // Keep the load at the mouth as the body tilts uphill or downhill.
          const reach = 0.46 * Math.cos(pitch) - 0.16 * Math.sin(pitch),
            hx = ax + ux * reach,
            hy = ay + uy * reach,
            hz = height + clearance + 0.46 * Math.sin(pitch) + 0.16 * Math.cos(pitch) - (this.floor?.(hx, hy) ?? 0);
          this.actor(cargo, hx, hy, hz, a.heading, undefined, pitch);
        }
      }
    }
    for (const p of this.pools.values()) {
      p.body.count = p.used;
      p.body.instanceMatrix.needsUpdate = true;
      if (p.band) {
        p.band.count = p.used;
        p.band.instanceMatrix.needsUpdate = true;
        if (p.band.instanceColor) p.band.instanceColor.needsUpdate = true;
      }
    }
    const view = this.viewport,
      orbit = orbitCamera(mode, view?.orbit ?? this.orbit),
      target = new T.Vector3(...(view ? mapTiltTarget(mode, view.x, view.y) : mode === "surface" ? [0, 0, 0.15] : [0, 0.6, 0]));
    this.camera.position.copy(target).add(new T.Vector3(...orbit.position));
    this.camera.up.set(...orbit.up);
    this.camera.lookAt(target);
    const bounds: V[] = [];
    if (mode === "surface" && !view)
      for (const c of patch.cells)
        if (c.valid && !c.surfaceStrip && c.state.place.ground === "open" && (c.state.stalkLevel || c.state.place.mound > 0)) {
          const h = c.state.stalkLevel ? STALK_HEIGHT[c.state.stalkLevel >= 2 ? 2 : 1] : 0;
          if (this.floor && c.state.place.mound > 0) bounds.push(this.point(c.x, c.y));
          for (const x of [c.x - 0.22, c.x + 0.48])
            for (const y of [c.y - 0.2, c.y + 0.29]) for (const z of [0, h + 0.04]) bounds.push(this.point(x, y, z));
        }
    const frame = inspectionFrameScale(bounds, mode, this.orbit),
      halfWidth = view ? view.width / view.pixelsPerWorld / 2 : 2.15 * frame,
      halfHeight = view ? view.height / view.pixelsPerWorld / 2 : 1.792 * frame;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    if (this.terrainWasViewport) this.terrain.clear();
    else this.clear(this.terrain);
    this.terrainChunks.dispose();
    this.clear(this.contents);
    this.clear(this.overlays);
    for (const p of this.pools.values()) {
      p.body.dispose();
      p.band?.dispose();
    }
    for (const geometry of new Set([...this.models.values()].flatMap(({ body, band }) => [body, band]))) geometry.dispose();
    this.material.dispose();
    this.unlit.dispose();
    this.renderer.dispose();
  }
}
