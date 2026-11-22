import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { IMAGE_ICONS, iconUrl } from "../iconUrl.ts";
import { EXTRA_PICTURE, PICTURE, FULL, isPalm, LITTLE, PALM_PX, TRAY_PX, trayItems } from "../build.ts";

// The builder's tray, pure (docs/builder.md, PRD §73, ja-kjj8.3, ja-kjj8.5).

test("the full tray: every tool, a crayon per colony named for it, Move first", () => {
  const items = trayItems(false, ["Ink", "Amber"]);
  assert.equal(items[0]?.tool, "move");
  assert.deepEqual(
    items.map((it) => it.key),
    ["move", "tweezers", "dig", "dirt", "rock", "sugar", "crumb", "aphids", "crayon-0", "crayon-1", "noEntry", "rain"],
  );
  assert.equal(items.find((it) => it.key === "crayon-1")?.label, "Trail crayon, Amber");
  assert.equal(items.find((it) => it.key === "crayon-1")?.colony, 1);
  for (const it of items) assert.ok(it.picture.length > 0 && it.label.length > 0, it.key);
});

test("every tray picture and menu icon is a shipped file, under the app's base path", () => {
  const dir = new URL("../../../public/ui-icons/", import.meta.url);
  const pictures = [...new Set([...Object.values(PICTURE), ...Object.values(EXTRA_PICTURE)])];
  for (const name of pictures) assert.ok(existsSync(new URL(`builder/${name}.png`, dir)), name);
  for (const name of IMAGE_ICONS) assert.ok(existsSync(new URL(`menu/${name}.png`, dir)), name);
  assert.equal(iconUrl("builder", "dig", "/"), "/ui-icons/builder/dig.png");
  assert.equal(iconUrl("menu", "saves", "/ant-sym/pr-preview/pr-7"), "/ant-sym/pr-preview/pr-7/ui-icons/menu/saves.png");
});

test("no aphids for a species that takes no honeydew (docs/aphids.md)", () => {
  assert.ok(trayItems(false, ["Ink"]).some((it) => it.tool === "aphids"));
  assert.ok(!trayItems(false, ["Ink"], true, false).some((it) => it.tool === "aphids"));
});

test("each view offers only the tools that work there: no Dirt above (no soil: it would place rock), no aphids below", () => {
  const keys = (view?: "above" | "below") => trayItems(false, ["Ink"], true, true, view).map((it) => it.tool);
  assert.ok(keys().includes("dirt") && keys().includes("aphids"));
  assert.ok(!keys("above").includes("dirt") && keys("above").includes("rock") && keys("above").includes("aphids"));
  assert.ok(!keys("below").includes("aphids") && keys("below").includes("dirt") && keys("below").includes("rock"));
});

test("the little-hands tray: Move, Sugar, Dig and Rain only, and bigger", () => {
  assert.deepEqual(
    trayItems(true, ["Ink", "Amber"]).map((it) => it.tool),
    ["move", "sugar", "dig", "rain"],
  );
  assert.deepEqual(LITTLE, ["move", "sugar", "dig", "rain"]);
  assert.ok(TRAY_PX.little > TRAY_PX.full && TRAY_PX.full >= 64);
  assert.ok(LITTLE.every((t) => FULL.includes(t)));
});

test("at most four crayons; no crayon and no no-entry sign for a species with no food trail", () => {
  assert.equal(trayItems(false, ["a", "b", "c", "d", "e", "f"]).filter((it) => it.tool === "crayon").length, 4);
  assert.equal(trayItems(false, ["Ink", "Amber"], false).filter((it) => it.tool === "crayon").length, 0);
  assert.equal(trayItems(false, ["Ink", "Amber"], false).filter((it) => it.tool === "noEntry").length, 0, "nor a no-entry sign");
});

test("a palm is a touch wider or taller than a fingertip; a mouse or pen never is", () => {
  assert.equal(isPalm({ pointerType: "touch", width: 12, height: 14 }), false);
  assert.equal(isPalm({ pointerType: "touch", width: PALM_PX + 1, height: 20 }), true);
  assert.equal(isPalm({ pointerType: "mouse", width: 200, height: 200 }), false);
});
