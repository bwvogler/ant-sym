import { WorkerSprites } from "./workerSprites.ts";
import { CadaverSprites } from "./cadaverSprites.ts";
import { FungalMapSprites } from "./fungalStructures.ts";
import { drawMapArtReview, MAP_REVIEW_SIZE } from "./mapArtReview.ts";
import { cadaverArtFixture } from "./inspectionArtFixture.ts";
import { InspectionScene } from "./InspectionScene.ts";
import { dragOrbit, type InspectionOrbit } from "./inspectionOrbit.ts";
import type { DecayStage } from "./cadaverVisual.ts";
const canvas = document.querySelector("canvas")!,
  layer = document.querySelector<HTMLSelectElement>('[aria-label="Inspection layer"]')!,
  stage = document.querySelector<HTMLSelectElement>('[aria-label="Cadaver decay stage"]')!,
  stalk = document.querySelector<HTMLSelectElement>('[aria-label="Stalk"]')!;
const scene = await InspectionScene.create(canvas, "surface");
let patch = cadaverArtFixture(),
  drag: { id: number; x: number; y: number; orbit: InspectionOrbit } | null = null;
const draw = () => scene.draw(patch, { scents: false, markers: false });
for (const select of [layer, stage, stalk])
  select.addEventListener("change", () => {
    patch = cadaverArtFixture(layer.value === "below", Number(stage.value) as DecayStage, Number(stalk.value));
    draw();
  });
document.querySelector("#map")!.addEventListener("click", () => {
  scene.reset();
  draw();
});
document.querySelector("#angle")!.addEventListener("click", () => {
  scene.angle();
  draw();
});
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, orbit: { ...scene.orbit } };
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  scene.orbit = dragOrbit(drag.orbit, e.clientX - drag.x, e.clientY - drag.y);
  draw();
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(name, () => {
    drag = null;
  });
document.querySelector("#status")!.textContent =
  `${scene.accelerated ? "WebGL" : "Software 3D"} · brown knobbly cushions, curved stems attached to the cadaver thorax · decay uses simulation time`;
draw();

const mapCanvas = document.querySelector<HTMLCanvasElement>("#map-scale")!,
  background = document.querySelector<HTMLSelectElement>('[aria-label="Map calibration background"]')!;
const workers = new WorkerSprites(),
  cadavers = new CadaverSprites(),
  fungal = new FungalMapSprites();
const drawMap = () => {
  const dpr = window.devicePixelRatio || 1;
  mapCanvas.width = Math.round(MAP_REVIEW_SIZE[0] * dpr);
  mapCanvas.height = Math.round(MAP_REVIEW_SIZE[1] * dpr);
  drawMapArtReview(
    mapCanvas.getContext("2d")!,
    { worker: (lod, dark) => workers.get(lod, [171, 118, 29], dark), cadaver: (lod) => cadavers.get(lod) },
    fungal,
    dpr,
    background.value === "dark",
  );
  document.querySelector("#map-status")!.textContent =
    workers.ready("tiny") && workers.ready("walk") && cadavers.get("tiny") && cadavers.get("walk")
      ? "Map sprites loaded · fixed world scale"
      : "Loading map sprites…";
};
workers.load(drawMap);
cadavers.load(drawMap);
background.addEventListener("change", drawMap);
window.addEventListener("resize", drawMap);
drawMap();
window.addEventListener("pagehide", () => {
  workers.dispose();
  cadavers.dispose();
});
