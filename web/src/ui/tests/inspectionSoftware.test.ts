import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { InspectionSoftware } from "../inspectionSoftware.ts";
test("software geometry uses depth, clears moving instances and invalidates cached terrain after orbit", () => {
  let pixels = new Uint8ClampedArray();
  let frames = 0;
  const ctx = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (im: ImageData) => {
      pixels = im.data.slice();
      frames++;
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
  for (let i = 0; i < 20; i++) {
    ant.instanceMatrix.needsUpdate = true;
    ant.instanceColor!.needsUpdate = true;
    renderer.render(scene, camera);
  }
  assert.equal(frames, 1, "unchanged frames skip rasterization even when instance buffers were uploaded again");
  ant.setColorAt(0, new T.Color(0, 0, 1));
  renderer.render(scene, camera);
  assert.deepEqual(pixel(), [0, 0, 255, 255], "a changed abdomen colour invalidates the cached frame");
  ant.setMatrixAt(0, new T.Matrix4().makeTranslation(3, 0, 1));
  renderer.render(scene, camera);
  assert.deepEqual(pixel(), [255, 0, 0, 255]);
  (ground.geometry.getAttribute("color") as T.BufferAttribute).setXYZ(0, 1, 1, 0);
  ground.geometry.getAttribute("color").needsUpdate = true;
  renderer.render(scene, camera);
  assert.deepEqual(pixel(), [255, 255, 0, 255], "changed static geometry invalidates the cached background");
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

test("software inspection keeps every instance through movement, count changes and visibility changes", () => {
  let pixels = new Uint8ClampedArray();
  const renderer = new InspectionSoftware({
      width: 64,
      height: 64,
      getContext: () => ({
        createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: (im: ImageData) => {
          pixels = im.data.slice();
        },
      }),
    } as unknown as HTMLCanvasElement),
    scene = new T.Scene(),
    camera = new T.OrthographicCamera(-4, 4, 4, -4, 0.1, 20),
    geometry = new T.BufferGeometry();
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  geometry.setAttribute("position", new T.Float32BufferAttribute([-0.3, -0.3, 0, 0.3, -0.3, 0, 0, 0.3, 0], 3));
  const material = new T.MeshBasicMaterial(),
    ants = new T.InstancedMesh(geometry, material, 64),
    matrix = (i: number) => new T.Matrix4().makeTranslation(-3.5 + (i % 8), -3.5 + Math.floor(i / 8), 0),
    pixel = (i: number) => [
      ...pixels.slice(
        ((60 - 8 * Math.floor(i / 8)) * 64 + 4 + 8 * (i % 8)) * 4,
        ((60 - 8 * Math.floor(i / 8)) * 64 + 4 + 8 * (i % 8)) * 4 + 4,
      ),
    ];
  for (let i = 0; i < 64; i++) {
    ants.setMatrixAt(i, matrix(i));
    ants.setColorAt(i, new T.Color(i % 2 ? 0xff0000 : 0x00ff00));
  }
  scene.add(ants);
  renderer.render(scene, camera);
  for (let i = 0; i < 64; i++) assert.deepEqual(pixel(i), i % 2 ? [255, 0, 0, 255] : [0, 255, 0, 255]);
  ants.setMatrixAt(32, new T.Matrix4().makeTranslation(100, 0, 0));
  renderer.render(scene, camera);
  assert.deepEqual(pixel(32), [0, 0, 0, 0], "moving out clears the old position");
  assert.deepEqual(pixel(63), [255, 0, 0, 255], "the final instance is still present");
  ants.setMatrixAt(32, matrix(32));
  ants.count = 32;
  renderer.render(scene, camera);
  assert.deepEqual(pixel(31), [255, 0, 0, 255]);
  assert.deepEqual(pixel(63), [0, 0, 0, 0]);
  ants.count = 64;
  renderer.render(scene, camera);
  assert.deepEqual(pixel(32), [0, 255, 0, 255]);
  assert.deepEqual(pixel(63), [255, 0, 0, 255]);
  ants.visible = false;
  renderer.render(scene, camera);
  assert.equal(
    pixels.some((v) => v !== 0),
    false,
  );
  ants.visible = true;
  renderer.render(scene, camera);
  assert.deepEqual(pixel(63), [255, 0, 0, 255]);
  renderer.dispose();
  ants.dispose();
  geometry.dispose();
  material.dispose();
});
