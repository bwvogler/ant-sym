import { buildGame } from "./useColony.ts";
import { SensedMap } from "./fungusSight.ts";
import { inspectViewport } from "./inspectionPatch.ts";
import { InspectionScene } from "./InspectionScene.ts";
import { CURTAIN, PLANE, centreX, centreY } from "../colony/index.ts";

const game = buildGame({ species: "generic", seed: 3, antCount: 50, rival: false, generation: 0 }),
  sensed = new SensedMap(),
  canvas = document.querySelector("canvas")!,
  layer = document.querySelector<HTMLSelectElement>('[aria-label="Field layer"]')!,
  scents = document.querySelector<HTMLInputElement>("#scents")!,
  markers = document.querySelector<HTMLInputElement>("#markers")!,
  play = document.querySelector<HTMLButtonElement>("#play")!,
  status = document.querySelector("#status")!,
  scene = await InspectionScene.create(canvas, "below");
let x = 0,
  y = 0,
  zoom = 60,
  playing = false,
  frame = 0,
  lastTime = 0;
const home = () => {
  const col = game.colonies[0],
    hole = col.holeCells[0];
  x = layer.value === "below" ? col.nest.x : centreX(hole.px, hole.py);
  y = layer.value === "below" ? col.nest.y : centreY(hole.py);
};
const draw = () => {
  const patch = inspectViewport(game, sensed, layer.value === "below" ? CURTAIN : PLANE, x, y, canvas.width / zoom, canvas.height / zoom, {
    food: true,
    home: true,
  });
  scene.setViewport({
    width: canvas.width,
    height: canvas.height,
    pixelsPerWorld: zoom,
    x: x - centreX(...patch.selected.cell),
    y: y - centreY(patch.selected.cell[1]),
  });
  scene.draw(patch, { scents: scents.checked, markers: markers.checked });
  canvas.dataset.renderer = scene.accelerated ? "webgl" : "software";
  canvas.dataset.cells = String(patch.cells.length);
  canvas.dataset.zoom = String(zoom);
  const terrain = scene.terrainStats;
  canvas.dataset.terrainRebuilt = String(terrain.rebuilt);
  canvas.dataset.terrainCached = String(terrain.cached);
  status.textContent = `${scene.accelerated ? "WebGL" : "Software 3D"} · ${patch.cells.length} cells including edge overscan · ${patch.cells.reduce((n, c) => n + c.state.ants.length, 0)} workers in region · zoom ${(zoom / 60).toFixed(2)}× · ${terrain.active} terrain chunks (${terrain.rebuilt} rebuilt, ${terrain.cached} cached) · ${playing ? "running" : "paused"}`;
};
const setZoom = (next: number, offsetX = 0, offsetY = 0) => {
  next = Math.max(48, Math.min(180, next));
  x += offsetX / zoom - offsetX / next;
  y += offsetY / zoom - offsetY / next;
  zoom = next;
  draw();
};
document.querySelector("#in")!.addEventListener("click", () => setZoom(zoom * 1.25));
document.querySelector("#out")!.addEventListener("click", () => setZoom(zoom / 1.25));
document.querySelector("#home")!.addEventListener("click", () => {
  home();
  draw();
});
for (const input of [scents, markers]) input.addEventListener("change", draw);
layer.addEventListener("change", () => {
  home();
  scene.reset();
  draw();
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    setZoom(
      zoom * Math.exp(-e.deltaY * 0.002),
      ((e.clientX - rect.left - rect.width / 2) * canvas.width) / rect.width,
      ((e.clientY - rect.top - rect.height / 2) * canvas.height) / rect.height,
    );
  },
  { passive: false },
);
let drag: { id: number; x: number; y: number; worldX: number; worldY: number; scaleX: number; scaleY: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  if (drag || e.button !== 0) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const rect = canvas.getBoundingClientRect();
  drag = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    worldX: x,
    worldY: y,
    scaleX: canvas.width / rect.width / zoom,
    scaleY: canvas.height / rect.height / zoom,
  };
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  x = drag.worldX - (e.clientX - drag.x) * drag.scaleX;
  y = drag.worldY - (e.clientY - drag.y) * drag.scaleY;
  draw();
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(event, () => {
    drag = null;
  });
canvas.addEventListener("keydown", (e) => {
  if (e.key === "+" || e.key === "=") setZoom(zoom * 1.25);
  else if (e.key === "-") setZoom(zoom / 1.25);
  else if (e.key === "Home") {
    home();
    draw();
  } else {
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-0.5, 0],
      ArrowRight: [0.5, 0],
      ArrowUp: [0, -0.5],
      ArrowDown: [0, 0.5],
    };
    if (!movement[e.key]) return;
    x += movement[e.key][0];
    y += movement[e.key][1];
    draw();
  }
  e.preventDefault();
});
const tick = (time: number) => {
  if (!playing) return;
  if (lastTime) game.tick(Math.min(0.1, (time - lastTime) / 1000));
  lastTime = time;
  draw();
  frame = requestAnimationFrame(tick);
};
play.addEventListener("click", () => {
  playing = !playing;
  play.textContent = playing ? "Pause simulation" : "Run simulation";
  lastTime = 0;
  if (playing) frame = requestAnimationFrame(tick);
  else {
    cancelAnimationFrame(frame);
    draw();
  }
});
window.addEventListener("pagehide", () => {
  playing = false;
  cancelAnimationFrame(frame);
  scene.dispose();
});
home();
draw();
