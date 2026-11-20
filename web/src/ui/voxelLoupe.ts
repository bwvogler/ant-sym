type V = [number, number, number];
interface LoupeFace {
  points: V[];
  normal: V;
  colour: string;
}
const sides: [V, V[]][] = [
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

/** Solid voxel ring, inset glass, and a stepped handle; faces inside the mesh are discarded once. */
export function buildVoxelLoupe(): LoupeFace[] {
  const voxels = new Map<string, { p: V; colour: string }>();
  const put = (x: number, y: number, z: number, colour: string) => voxels.set(`${x},${y},${z}`, { p: [x, y, z], colour });
  for (let x = -7; x <= 7; x++)
    for (let z = -7; z <= 7; z++) {
      const r = Math.hypot(x, z);
      if (r <= 6.6 && r >= 4.5) for (let y = -1; y <= 1; y++) put(x, y, z, "#69C8A4");
      else if (r < 4.5) put(x, 0, z, (x + z) % 4 === 0 ? "#E1FFF3" : "#9CCFCB");
    }
  for (let t = 0; t < 8; t++)
    for (let a = 0; a < 3; a++) for (let y = -1; y <= 1; y++) put(4 + t, y, -4 - t - a, t > 4 ? "#416B58" : "#8CBA81");
  const faces: LoupeFace[] = [];
  for (const {
    p: [x, y, z],
    colour,
  } of voxels.values())
    for (const [normal, corners] of sides) {
      if (voxels.has(`${x + normal[0]},${y + normal[1]},${z + normal[2]}`)) continue;
      faces.push({ normal, colour, points: corners.map(([a, b, c]): V => [x + a - 0.5, y + b - 0.5, z + c - 0.5]) });
    }
  return faces;
}
const mesh = buildVoxelLoupe();
const eye: V = [0.246, -0.88, 0.4336];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Rotate the actual cubical geometry about its vertical axis, then shade and project exposed faces. */
export function drawVoxelLoupe(ctx: CanvasRenderingContext2D, x: number, y: number, dpr: number, seconds: number): void {
  const angle = seconds * 0.75 - 0.35,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const rotate = ([a, b, z]: V): V => [a * c - b * s, a * s + b * c, z];
  const faces = mesh
    .map((face) => ({ ...face, normal: rotate(face.normal), points: face.points.map(rotate) }))
    .filter((face) => dot(face.normal, eye) > 0)
    .map((face) => ({ ...face, depth: face.points.reduce((sum, p) => sum + dot(p, eye), 0) / 4 }))
    .sort((a, b) => a.depth - b.depth);
  for (const face of faces) {
    const shade = 0.65 + 0.35 * Math.max(0, dot(face.normal, [-0.4, -0.6, 0.8]));
    ctx.fillStyle = `rgb(${[1, 3, 5].map((i) => Math.round(parseInt(face.colour.slice(i, i + 2), 16) * shade)).join(",")})`;
    ctx.beginPath();
    face.points.forEach(([a, b, z], i) => {
      const px = Math.round(x + (a + 0.28 * b) * dpr),
        py = Math.round(y + (0.12 * a - 0.4 * b - 0.88 * z) * dpr);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }
}
