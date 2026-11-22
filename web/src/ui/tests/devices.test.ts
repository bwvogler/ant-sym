import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// The device fixtures (scripts/lib/devices.mjs, owner 2026-11-16): a Pixel 6 XL, Chrome on a desktop, Safari on an iPad.
// The numbers come from Playwright's own registry, so these tests hold what we add: the names, the engines, the turns.

const lib = (await import(new URL("../../../../scripts/lib/devices.mjs", import.meta.url).href)) as {
  FIXTURES: Record<
    string,
    { label: string; playwright: string; engine: string; touch: boolean; viewport?: { width: number; height: number } }
  >;
  FIXTURE_NAMES: string[];
  TURNS: (name: string) => boolean;
  contextOptions: (
    name: string,
    devices: Record<string, Record<string, unknown>>,
    o?: { landscape?: boolean; sharp?: boolean },
  ) => {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    defaultBrowserType?: string;
  };
};

/** A stand-in for Playwright's registry, with the shape of its entries. */
const devices = {
  "Pixel 6 Pro": {
    viewport: { width: 412, height: 816 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium",
  },
  "Pixel 6 Pro landscape": {
    viewport: { width: 840, height: 360 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "chromium",
  },
  "Desktop Chrome": {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    defaultBrowserType: "chromium",
  },
  "iPad Pro 11": {
    viewport: { width: 834, height: 1194 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "webkit",
  },
  "iPad Pro 11 landscape": {
    viewport: { width: 1194, height: 834 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: "webkit",
  },
};

test("the three devices: an Android phone, Chrome on a desktop, Safari on an iPad (WebKit)", () => {
  assert.deepEqual(lib.FIXTURE_NAMES, ["pixel-6-xl", "desktop-chrome", "ipad-safari"]);
  assert.deepEqual(
    lib.FIXTURE_NAMES.map((n) => lib.FIXTURES[n]!.engine),
    ["chromium", "chromium", "webkit"],
    "only the iPad is WebKit",
  );
  assert.equal(lib.FIXTURES["pixel-6-xl"]!.playwright, "Pixel 6 Pro", "Playwright's name for the 6 XL's screen");
});

test("a phone and an iPad turn, a desktop does not", () => {
  assert.deepEqual(
    lib.FIXTURE_NAMES.map((n) => lib.TURNS(n)),
    [true, false, true],
  );
});

test("a fixture's options: Playwright's device, its landscape one when asked, the desktop's own size, a pixel ratio of 1 unless sharp", () => {
  const phone = lib.contextOptions("pixel-6-xl", devices);
  assert.deepEqual([phone.viewport, phone.deviceScaleFactor, phone.isMobile, phone.hasTouch], [{ width: 412, height: 816 }, 1, true, true]);
  assert.equal(phone.defaultBrowserType, undefined, "the engine is the fixture's, not the context's");
  assert.deepEqual(lib.contextOptions("pixel-6-xl", devices, { landscape: true }).viewport, { width: 840, height: 360 });
  assert.equal(lib.contextOptions("pixel-6-xl", devices, { sharp: true }).deviceScaleFactor, 3.5);
  assert.deepEqual(lib.contextOptions("ipad-safari", devices, { landscape: true }).viewport, { width: 1194, height: 834 });
  const desk = lib.contextOptions("desktop-chrome", devices);
  assert.deepEqual(
    [desk.viewport, desk.hasTouch],
    [{ width: 1440, height: 900 }, false],
    "a laptop or monitor, taller than Playwright's 1280 × 720",
  );
  assert.throws(() => lib.contextOptions("galaxy-fold", devices), /no device fixture "galaxy-fold"/);
  assert.throws(() => lib.contextOptions("pixel-6-xl", {}), /Playwright has no device "Pixel 6 Pro"/);
});

test("every fixture names a device Playwright has, landscape too where it turns (where Playwright resolves here)", (t) => {
  let playwright: { devices: Record<string, unknown> };
  try {
    playwright = createRequire(import.meta.url)("playwright");
  } catch {
    return t.skip("Playwright is not installed here");
  }
  for (const n of lib.FIXTURE_NAMES) {
    const f = lib.FIXTURES[n]!;
    assert.ok(playwright.devices[f.playwright], `${n}: Playwright has "${f.playwright}"`);
    if (lib.TURNS(n)) assert.ok(playwright.devices[`${f.playwright} landscape`], `${n}: and its landscape`);
  }
});
