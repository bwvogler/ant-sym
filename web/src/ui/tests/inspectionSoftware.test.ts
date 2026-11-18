import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { InspectionSoftware } from "../inspectionSoftware.ts";
test("software geometry uses depth, clears moving instances and invalidates cached terrain after orbit", () => {
  let pixels = new Uint8ClampedArray();
  const ctx = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (im: ImageData) => {
      pixels = im.data.slice();
    },
  };
  const renderer = new InspectionSoftware({ width: 32, height: 32, getContext: () => ctx } as unknown as HTMLCanvasElement),
    scene = new T.Scene(),
    camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  const triangle = (colour: number[]) => {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute([-0.9, -0.9, 0, 0.9, -0.9, 0, 0, 0.9, 0], 3));
    g.setAttribute("color", new T.Float32BufferAttribute([...colour, ...colour, ...colour], 3));
    return g;
  };
  const material = new T.MeshBasicMaterial({ vertexColors: true }),
    ground = new T.Mesh(triangle([1, 0, 0]), material),
    ant = new T.InstancedMesh(triangle([1, 1, 1]), material, 1);
  scene.add(ground, ant);
  ant.setMatrixAt(0, new T.Matrix4().makeTranslation(0, 0, 1));
  ant.setColorAt(0, new T.Color(0, 1, 0));
  const pixel = () => [...pixels.slice((16 * 32 + 16) * 4, (16 * 32 + 16) * 4 + 4)];
  renderer.render(scene, camera);
  assert.deepEqual(pixel(), [0, 255, 0, 255]);
  ant.setMatrixAt(0, new T.Matrix4().makeTranslation(3, 0, 1));
  renderer.render(scene, camera);
  assert.deepEqual(pixel(), [255, 0, 0, 255]);
  camera.position.set(0, 0, -8);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  assert.deepEqual(pixel(), [0, 0, 0, 0]);
  renderer.dispose();
  ground.geometry.dispose();
  ant.geometry.dispose();
  ant.dispose();
  material.dispose();
});
