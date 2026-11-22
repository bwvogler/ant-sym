#!/usr/bin/env node
// The page on the devices it is played on (owner, 2026-11-16): a Pixel 6 XL (Android, Chrome), Chrome on a desktop, and
// Safari on an iPad, each opened as that device (scripts/lib/devices.mjs): its viewport, pixel ratio, touch and user agent;
// the phone and the iPad both ways up. By hand, like `npm run e2e`: `npm run e2e:devices [-- pixel-6-xl desktop-chrome ipad-safari]`
// (no names: all three). It starts the dev server with no Jev key, so it spends nothing, and uses the Playwright already on
// the machine. Where WebKit is not installed (here, Chromium only) the iPad runs on Chromium at the iPad's size with its
// touch and user agent, and the report says "emulated": layout and touch at that size, not Safari's own behaviour.
//
// What it checks on each, once a game is running: the page does not scroll sideways; the map fills the screen; the rail is
// a left column from 640 px wide and a bottom bar under it; a touch device's rail buttons are at least 40 px; every drawer
// and the Codex open inside the screen; Lab mode opens with its charts inside the screen and the map still showing above;
// the whole rail is on the screen; a notice shows on the screen, counts repeats (×2), and "Bell only" takes it off the field; a chosen dark theme applies. It lists every failure
// before it exits 1, and saves a screenshot of each state with E2E_SHOTS=<dir> (otherwise in the temp folder).
// Usage: npm run e2e:devices [-- pixel-6-xl desktop-chrome ipad-safari]   (E2E_SHOTS=<dir> saves the screenshots there)
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { helpAndExit } from "./lib/usage.mjs";
import { startDevServer } from "./lib/devServer.mjs";
import { FIXTURES, FIXTURE_NAMES, openFixture, TURNS } from "./lib/devices.mjs";
helpAndExit(import.meta.url);

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  console.error(
    "e2e-devices: can't resolve 'playwright'. It uses a copy already installed on the machine; it is not a dependency of this repo.",
  );
  process.exit(2);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
for (const w of wanted) {
  if (!FIXTURES[w]) {
    console.error(`e2e-devices: no device "${w}" (have: ${FIXTURE_NAMES.join(", ")})`);
    process.exit(2);
  }
}
const names = wanted.length ? wanted : FIXTURE_NAMES;
const SHOTS = process.env.E2E_SHOTS ?? join(tmpdir(), `e2e-devices-${process.pid}`);
mkdirSync(SHOTS, { recursive: true });
const SEED = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** What each failed: device, orientation, what. */
const failures = [];
let checks = 0;
/** The fixtures that ran emulated (WebKit not launched): said again at the end, where a tailed log ends. */
const emulatedRuns = [];

async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out (${ms} ms) waiting for ${what}`);
    await sleep(100);
  }
}

const server = await startDevServer();
process.on("SIGINT", () => (server.stop(), process.exit(130)));

try {
  for (const name of names) {
    const f = FIXTURES[name];
    for (const landscape of TURNS(name) ? [false, true] : [false]) {
      const label = `${f.label}${TURNS(name) ? (landscape ? ", landscape" : ", portrait") : ""}`;
      const { browser, context, emulated } = await openFixture(name, playwright, { landscape, sharp: true });
      if (emulated) emulatedRuns.push(name);
      console.log(
        `\n${label}${emulated ? "  (emulated: WebKit could not be launched here, so this is Chromium at the iPad's size, touch and user agent)" : ""}`,
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const check = (ok, what) => {
        checks++;
        if (!ok) failures.push(`${label}: ${what}`);
        console.log(`  ${ok ? "ok  " : "FAIL"}${ok ? "" : " "}${what}`);
      };
      const shot = (what) =>
        page.screenshot({ path: join(SHOTS, `${name}-${landscape ? "landscape" : "portrait"}-${what}.png`) }).catch(() => {});
      const press = (loc) => (f.touch ? loc.tap() : loc.click());
      const vp = page.viewportSize();
      const rect = (sel) =>
        page.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        }, sel);
      const within = (r) => r && r.left >= -1 && r.top >= -1 && r.right <= vp.width + 1 && r.bottom <= vp.height + 1;

      try {
        await page.goto(server.url);
        await page.getByLabel("world seed").fill(String(SEED));
        await press(page.getByRole("button", { name: "Start without the tutorial", exact: true }));
        await until(() => page.evaluate(() => (window.jevAnts?.game.time ?? 0) > 2), "a game a couple of seconds in", 30_000);
        await page.waitForTimeout(300);

        check(
          await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
          `the page does not scroll sideways (${vp.width} × ${vp.height})`,
        );
        const cv = await rect("canvas");
        check(
          cv && cv.width >= vp.width - 1 && cv.height >= vp.height - 1,
          `the map fills the screen (${Math.round(cv?.width)} × ${Math.round(cv?.height)})`,
        );
        const nav = page.getByRole("navigation", { name: "panels" });
        const navBox = await nav.boundingBox();
        const bottomBar = vp.width < 640;
        check(
          bottomBar
            ? navBox.y + navBox.height > vp.height - 110 && navBox.width > vp.width * 0.6
            : navBox.x + navBox.width < 120 && navBox.height < vp.height,
          bottomBar ? "the rail is a bar along the bottom (under 640 px wide)" : "the rail is a column at the left (640 px wide and up)",
        );
        check(
          navBox.y >= -1 && navBox.y + navBox.height <= vp.height + 1,
          "the whole rail is on the screen (a short screen: it scrolls inside)",
        );
        if (f.touch) {
          const small = await nav
            .getByRole("button")
            .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width < 40 || e.getBoundingClientRect().height < 40).length);
          check(small === 0, "every rail button is at least 40 px each way, for a finger");
        }
        await shot("play");

        // The voxel inspector is non-modal: a right panel at tablet/desktop widths and a sheet on a narrow phone.
        const lens = page.getByRole("button", { name: "Lens: say what is under the pointer (i)", exact: true });
        await press(lens);
        for (const view of ["above", "below"]) {
          await press(page.getByRole("button", { name: view, exact: true }));
          const x = vp.width * 0.3,
            y = Math.max(150, vp.height * 0.3);
          if (f.touch) await page.touchscreen.tap(x, y);
          else await page.mouse.click(x, y);
          await press(page.getByRole("button", { name: "Inspect cell", exact: true }));
          const inspection = page.locator('aside[aria-label="Cell inspection"]');
          await until(
            () =>
              inspection
                .locator("canvas")
                .getAttribute("data-assets-ready")
                .then((v) => v === "true"),
            `${view} inspection assets`,
          );
          const panel = await rect('aside[aria-label="Cell inspection"]');
          check(within(panel), `${view} inspection fits inside the viewport`);
          check(
            vp.width < 640 ? panel.width > vp.width * 0.9 && panel.top > vp.height * 0.2 : panel.left > vp.width * 0.45,
            `${view} inspection uses ${vp.width < 640 ? "a bottom sheet" : "a side panel"}`,
          );
          check((await inspection.getAttribute("aria-modal")) === null, `${view} inspection leaves the map available`);
          check(
            await inspection
              .getByRole("button", { name: "Close inspection", exact: true })
              .evaluate((e) => e.getBoundingClientRect().height >= 44),
            `${view} inspection close target is at least 44 px`,
          );
          check(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${view} inspection adds no horizontal page overflow`,
          );
          await shot(`inspection-${view}`);
          await press(inspection.getByRole("button", { name: "Close inspection", exact: true }));
          await press(page.getByRole("button", { name: "Close the lens card", exact: true }));
        }
        await press(lens);
        await press(page.getByRole("button", { name: "above", exact: true }));

        // Every drawer, one at a time, inside the screen.
        const count = await nav.getByRole("button").count();
        for (let i = 0; i < count; i++) {
          const btn = nav.getByRole("button").nth(i);
          const title = ((await btn.getAttribute("aria-label")) ?? "").split(",")[0];
          if (title === "Builder") continue;
          await press(btn);
          await page.waitForTimeout(300);
          const box = await rect('main section.panel-in, [role="dialog"][aria-label="Codex"]');
          check(within(box), `${title} opens inside the screen`);
          if (title === "Colonies") await shot("drawer");
          if (title === "Codex") await press(page.getByRole("button", { name: "Close the Codex" }));
        }
        // Settings (the last drawer) is open: dark, then Lab mode.
        if (!(await page.getByRole("region", { name: "settings" }).isVisible()))
          await press(nav.getByRole("button", { name: "Settings", exact: true }));
        await press(page.getByRole("group", { name: "appearance" }).getByRole("button", { name: "Dark" }));
        check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "Dark applies to the page");
        await press(page.getByRole("button", { name: "Lab mode", exact: true }));
        const lab = page.getByRole("region", { name: "lab" });
        await lab.waitFor({ timeout: 4000 });
        await page.waitForTimeout(1500);
        const labBox = await lab.boundingBox();
        const cvLab = await rect("canvas");
        check(
          within({ left: labBox.x, top: labBox.y, right: labBox.x + labBox.width, bottom: labBox.y + labBox.height }),
          "Lab mode sits inside the screen",
        );
        check(
          cvLab.height < vp.height * 0.75 && cvLab.height > 120,
          `and the map still shows above it (${Math.round(cvLab.height)} of ${vp.height} px)`,
        );
        const charts = await lab
          .getByRole("figure")
          .evaluateAll((els) => els.map((e) => e.querySelector("svg")?.getBoundingClientRect()).filter(Boolean));
        check(charts.length === 4 && charts.every((r) => r.right <= vp.width + 1 && r.left >= -1), "its four charts fit across the screen");
        check(
          await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
          "and the page still does not scroll sideways",
        );
        await shot("lab");

        // A notice shows on the screen, counts up when repeated, and "Bell only" takes it off the field.
        await page.evaluate(() => {
          window.jevAnts.notify("A notice on the device.", "info");
          window.jevAnts.notify("A notice on the device.", "info");
        });
        const toast = page.getByRole("button", { name: /A notice on the device\./ });
        await until(() => toast.isVisible(), "the notice", 4000);
        const tb = await toast.boundingBox();
        check(
          tb && tb.x >= 0 && tb.x + tb.width <= vp.width + 1 && tb.y >= 0 && tb.y + tb.height <= vp.height + 1,
          "a notice shows inside the screen",
        );
        check(/2 times/.test((await toast.getAttribute("aria-label")) ?? ""), "raised twice, it counts up (×2) rather than stacking");
        await shot("notice");
        await press(page.getByRole("button", { name: "Notices", exact: true }));
        await press(page.getByRole("group", { name: "notices over the map" }).getByRole("button", { name: "Bell only" }));
        await press(page.getByRole("button", { name: "Notices", exact: true })); // close the list
        await page.evaluate(() => window.jevAnts.notify("A quiet one.", "info"));
        await page.waitForTimeout(300);
        const quiet = await page.getByRole("button", { name: /A quiet one\./ }).boundingBox();
        check(
          quiet !== null && quiet.width <= 2 && quiet.height <= 2,
          "Bell only: a notice no longer floats over the map (it waits in the bell)",
        );
        check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
      } catch (e) {
        failures.push(`${label}: ${e instanceof Error ? e.message : e}`);
        console.log(`  FAIL ${e instanceof Error ? e.message : e}`);
        await shot("failed");
      }
      await browser.close();
    }
  }
} finally {
  server.stop();
}

console.log(`\n${checks} checks, ${failures.length} failed. Screenshots: ${SHOTS}`);
if (emulatedRuns.length)
  console.log(
    `Emulated, not Safari's own engine (WebKit could not be launched here): ${[...new Set(emulatedRuns)].join(", ")}. Layout and touch only.`,
  );
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
process.exit(0);
