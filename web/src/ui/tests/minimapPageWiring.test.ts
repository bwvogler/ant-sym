import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The page wiring of the endless minimap's drag freeze (E5.3b, ja-qpv.4.7; review of #430, S1). The freeze itself is held by the rig, pointer and
// minimap tests, which call those directly; these three lines are React, which no test here renders, and the e2e plays no endless game yet, so a source-
// level guard holds that none was deleted: without `miniWin` the picture follows the camera again while the pointer maths stays frozen (picture and pointer
// disagree), and without the two handlers a lost pointer capture or a blur leaves the freeze on until the next pointer-up. Replace with a rendered test
// when the page has one (the E6 switch's endless e2e).

const UI = new URL("../", import.meta.url).pathname;
const field = readFileSync(`${UI}ColonyField.tsx`, "utf8");
const frame = readFileSync(`${UI}useFieldFrame.ts`, "utf8");

test("the page hands the frame the rig's frozen minimap window every frame", () => {
  assert.match(
    frame,
    /Object\.assign\(fctx,\s*\{[^}]*miniWin:\s*rig\.frozenMini\(\)/,
    "useFieldFrame sets fctx.miniWin from rig.frozenMini()",
  );
});

test("the field ends a minimap drag when the pointer capture is lost or the canvas loses focus", () => {
  assert.match(field, /onLostPointerCapture=\{\(\)\s*=>\s*ptr\.dropMini\(ptrHost\(\)\)\}/, "onLostPointerCapture calls ptr.dropMini");
  assert.match(field, /onBlur=\{\(\)\s*=>\s*ptr\.dropMini\(ptrHost\(\)\)\}/, "onBlur calls ptr.dropMini");
});
