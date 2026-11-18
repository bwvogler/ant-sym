import * as T from "three";
const srgb = (v: number) => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));
/** Same real mesh geometry and depth test as the GPU path, with cached static mesh layers. */
export class InspectionSoftware {
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private pixels: Uint32Array;
  private depth: Float32Array;
  private background: Uint32Array;
  private backgroundDepth: Float32Array;
  private key = "";
  private cache = new WeakMap<T.Mesh, { key: string; pixels: Uint32Array; depth: Float32Array }>();
  constructor(privateCanvas: HTMLCanvasElement) {
    const ctx = privateCanvas.getContext("2d");
    if (!ctx) throw Error("No inspection canvas context");
    this.ctx = ctx;
    this.image = ctx.createImageData(privateCanvas.width, privateCanvas.height);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.depth = new Float32Array(this.pixels.length);
    this.background = new Uint32Array(this.pixels.length);
    this.backgroundDepth = new Float32Array(this.pixels.length);
  }
  render(scene: T.Scene, camera: T.Camera): void {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const w = this.image.width,
      h = this.image.height,
      view = new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      matrix = new T.Matrix4(),
      world = new T.Matrix4(),
      instance = new T.Matrix4(),
      rgb = new T.Color(),
      light = new T.Vector3(-3, -5, 8).normalize();
    const staticMeshes: T.Mesh[] = [],
      actors: T.InstancedMesh[] = [];
    scene.traverseVisible((o) => {
      if (o instanceof T.InstancedMesh) actors.push(o);
      else if (o instanceof T.Mesh) staticMeshes.push(o);
    });
    const raster = (object: T.Mesh, pixels: Uint32Array, depth: Float32Array) => {
      const g = object.geometry,
        pos = g.getAttribute("position"),
        colors = g.getAttribute("color"),
        normals = g.getAttribute("normal"),
        index = g.index,
        count = index?.count ?? pos.count;
      const material = Array.isArray(object.material) ? object.material[0] : object.material,
        unlit = material instanceof T.MeshBasicMaterial;
      const p = new Float64Array(9),
        normal = new T.Vector3();
      for (let at = 0; at < (object instanceof T.InstancedMesh ? object.count : 1); at++) {
        rgb.setRGB(1, 1, 1);
        if (object instanceof T.InstancedMesh) {
          object.getMatrixAt(at, instance);
          world.multiplyMatrices(object.matrixWorld, instance);
          if (object.instanceColor) object.getColorAt(at, rgb);
        } else world.copy(object.matrixWorld);
        matrix.multiplyMatrices(view, world);
        const e = matrix.elements,
          normalMatrix = new T.Matrix3().getNormalMatrix(world);
        for (let f = 0; f < count; f += 3) {
          for (let v = 0; v < 3; v++) {
            const id = index ? index.getX(f + v) : f + v,
              x = pos.getX(id),
              y = pos.getY(id),
              z = pos.getZ(id),
              q = e[3] * x + e[7] * y + e[11] * z + e[15];
            p[v * 3] = (((e[0] * x + e[4] * y + e[8] * z + e[12]) / q + 1) * w) / 2;
            p[v * 3 + 1] = ((1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / q) * h) / 2;
            p[v * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) / q;
          }
          const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = p,
            area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
          if (area >= -1e-7 || Math.min(z0, z1, z2) > 1 || Math.max(z0, z1, z2) < -1) continue;
          const id = index ? index.getX(f) : f;
          if (normals) normal.fromBufferAttribute(normals, id).applyMatrix3(normalMatrix).normalize();
          const shade = unlit ? 1 : 0.58 + 0.65 * Math.max(0, normal.dot(light)),
            r = srgb((colors ? colors.getX(id) : 1) * rgb.r * shade),
            green = srgb((colors ? colors.getY(id) : 1) * rgb.g * shade),
            b = srgb((colors ? colors.getZ(id) : 1) * rgb.b * shade),
            packed = (255 << 24) | (b << 16) | (green << 8) | r;
          const left = Math.max(0, Math.floor(Math.min(x0, x1, x2))),
            right = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2))),
            top = Math.max(0, Math.floor(Math.min(y0, y1, y2))),
            bottom = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
          for (let y = top; y <= bottom; y++)
            for (let x = left; x <= right; x++) {
              const a = ((x1 - x - 0.5) * (y2 - y - 0.5) - (y1 - y - 0.5) * (x2 - x - 0.5)) / area,
                bb = ((x2 - x - 0.5) * (y0 - y - 0.5) - (y2 - y - 0.5) * (x0 - x - 0.5)) / area,
                c = 1 - a - bb;
              if (a < -0.00001 || bb < -0.00001 || c < -0.00001) continue;
              const z = a * z0 + bb * z1 + c * z2,
                i = y * w + x;
              if (z < depth[i]) {
                depth[i] = z;
                pixels[i] = packed;
              }
            }
        }
      }
    };
    const cameraKey = view.elements.join(","),
      key = cameraKey + staticMeshes.map((o) => o.uuid + o.geometry.uuid + o.matrixWorld.elements.join(",")).join("/");
    if (key !== this.key) {
      this.background.fill(0);
      this.backgroundDepth.fill(Infinity);
      for (const mesh of staticMeshes) {
        const mk = cameraKey + mesh.geometry.uuid + mesh.matrixWorld.elements.join(",");
        let cached = this.cache.get(mesh);
        if (!cached || cached.key !== mk) {
          cached = { key: mk, pixels: new Uint32Array(this.pixels.length), depth: new Float32Array(this.depth.length).fill(Infinity) };
          raster(mesh, cached.pixels, cached.depth);
          this.cache.set(mesh, cached);
        }
        for (let i = 0; i < this.pixels.length; i++)
          if (cached.depth[i] < this.backgroundDepth[i]) {
            this.backgroundDepth[i] = cached.depth[i];
            this.background[i] = cached.pixels[i];
          }
      }
      this.key = key;
    }
    this.pixels.set(this.background);
    this.depth.set(this.backgroundDepth);
    for (const a of actors) raster(a, this.pixels, this.depth);
    this.ctx.putImageData(this.image, 0, 0);
  }
  dispose(): void {
    this.cache = new WeakMap();
  }
}
