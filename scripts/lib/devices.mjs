// The devices the page is checked on (owner, 2026-11-16): an Android phone (a Pixel 6 XL, Playwright's "Pixel 6 Pro": the
// same 6.7 in. screen), Chrome on a desktop, and Safari on an iPad. A fixture names a device as Playwright describes it
// (viewport, pixel ratio, touch, user agent), and says which engine it is: the iPad's is WebKit. Playwright's registry is
// the one source for the numbers, so they stay what a real device reports; this file adds only the names, what we want
// from each, and the fallback below. Used by scripts/e2e-devices.mjs, and open to any script that wants a device.
//
// WebKit is a separate download. Where it is not installed (the cloud machine has Chromium only), a WebKit fixture runs
// on Chromium with the device's viewport, touch and user agent, and says so (`emulated`): that checks the layout and the
// touch paths at that size, not Safari's own behaviour. `npx playwright install webkit` on a machine that may makes it real.

/** @typedef {{ label: string, playwright: string, engine: "chromium" | "webkit", viewport?: { width: number, height: number }, touch: boolean }} Fixture */

/** @type {Record<string, Fixture>} */
export const FIXTURES = {
  "pixel-6-xl": { label: "Android: Pixel 6 XL, Chrome", playwright: "Pixel 6 Pro", engine: "chromium", touch: true },
  "desktop-chrome": {
    label: "Chrome on a desktop",
    playwright: "Desktop Chrome",
    engine: "chromium",
    // Playwright's desktop is 1280 x 720; a laptop or monitor is taller.
    viewport: { width: 1440, height: 900 },
    touch: false,
  },
  "ipad-safari": { label: "Safari on an iPad", playwright: "iPad Pro 11", engine: "webkit", touch: true },
};

export const FIXTURE_NAMES = Object.keys(FIXTURES);

/** The fixtures that turn: a phone and a tablet are held either way. */
export const TURNS = (name) => FIXTURES[name]?.touch === true;

/**
 * The options to open a browser context as the fixture's device: Playwright's descriptor (its landscape one when asked),
 * the fixture's own viewport where it sets one, and a pixel ratio of 1 unless `sharp` (a screenshot a person looks at).
 * `devices` is Playwright's registry (`require("playwright").devices`).
 */
export function contextOptions(name, devices, { landscape = false, sharp = false } = {}) {
  const f = FIXTURES[name];
  if (!f) throw new Error(`no device fixture "${name}" (have: ${FIXTURE_NAMES.join(", ")})`);
  const key = landscape ? `${f.playwright} landscape` : f.playwright;
  const d = devices[key];
  if (!d) throw new Error(`Playwright has no device "${key}" (fixture ${name})`);
  const { defaultBrowserType: _engine, ...rest } = d;
  return {
    ...rest,
    ...(f.viewport && !landscape ? { viewport: f.viewport } : {}),
    deviceScaleFactor: sharp ? (d.deviceScaleFactor ?? 1) : 1,
  };
}

/**
 * Launch the fixture's browser and open a context as its device. Returns { browser, context, emulated }: `emulated` is
 * true where the fixture is WebKit and only Chromium was there (see the top of this file).
 * `playwright` is the module (`require("playwright")`).
 */
export async function openFixture(name, playwright, opts = {}) {
  const f = FIXTURES[name];
  if (!f) throw new Error(`no device fixture "${name}" (have: ${FIXTURE_NAMES.join(", ")})`);
  let browser = null;
  let emulated = false;
  if (f.engine === "webkit") {
    try {
      browser = await playwright.webkit.launch();
    } catch {
      emulated = true;
    }
  }
  browser ??= await playwright.chromium.launch();
  const context = await browser.newContext(contextOptions(name, playwright.devices, opts));
  return { browser, context, emulated };
}
