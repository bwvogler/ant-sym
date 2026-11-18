#!/usr/bin/env node
// The map's pixel guard (ja-fnd.6.3, docs/refactor.md S5.3): renders fixed scenes of the one world's canvas in Chromium and hashes each one, so a
// change that should not move a pixel (splitting ColonyField into layers) can be shown not to. By hand, not part of `npm test` (it needs a browser:
// it uses the `playwright` already on the machine, and starts the dev server with no Jev key, so it spends nothing).
//
// Usage: node scripts/field-shots.mjs record <dir>   render every scene and write <dir>/hashes.json and one PNG a scene (the baseline)
//        node scripts/field-shots.mjs check <dir>    render again, compare with <dir>/hashes.json; a scene that differs is saved as <dir>/<scene>.now.png
//        --scenes a,b    only these scenes (names are in hashes.json; `record` without it renders them all)
//        --list          print the scene names and exit
// The workflow for a pure move: `record` on main before the slice, `check` after it; the same code must `check` clean (the scenes are built to
// be deterministic: a fresh game of seed 3 stepped a fixed number of ticks with the page paused, the camera let to settle, the canvas read as
// pixels). Hashes depend on the browser and its fonts, so a baseline belongs to the machine and the Chromium it was recorded on (hashes.json says
// which); never commit one.
//
// What a scene shows is in SCENES below. Not covered yet, to add when a slice moves that layer: the builder's marks (sugar, walls, the aphids
// clump, a moved ant's trace), a pinned specimen, the lens card's canvas marks, a phone-sized page.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { helpAndExit } from "./lib/usage.mjs";
import { startDevServer } from "./lib/devServer.mjs";
helpAndExit(import.meta.url);

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "field-shots: can't resolve 'playwright' (it uses a copy already installed on the machine, as scripts/e2e-one-world.mjs does).",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const mode = args[0];
const dirArg = args[1];
const only = args.includes("--scenes") ? new Set(args[args.indexOf("--scenes") + 1].split(",")) : null;
const SEED = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The scenes, in the order they are rendered (one page per colour scheme, each scene continuing from the last). `run` leaves the page as it should be drawn. */
const SCENES = [
  { name: "above-start", scheme: "light", run: async (p) => ticks(p, 300) },
  { name: "above-later", scheme: "light", run: async (p) => ticks(p, 2700) },
  { name: "above-nest0", scheme: "light", run: async (p) => p.evaluate(() => window.jevAnts.goNest(0)) },
  { name: "above-nest1", scheme: "light", run: async (p) => p.evaluate(() => window.jevAnts.goNest(1)) },
  { name: "below", scheme: "light", run: async (p) => view(p, "below") },
  { name: "below-nest0", scheme: "light", run: async (p) => p.evaluate(() => window.jevAnts.goNest(0)) },
  { name: "below-nest1", scheme: "light", run: async (p) => p.evaluate(() => window.jevAnts.goNest(1)) },
  {
    name: "below-followed",
    scheme: "light",
    run: async (p) => {
      const ok = await p.evaluate(() => {
        const c = window.jevAnts.game.colonies[0];
        for (let i = 0; i < c.n; i++) if (c.alive[i] && c.layer[i] === 1) return window.jevAnts.follow(0, i);
        return false;
      });
      if (!ok) throw new Error("no ant below to follow");
    },
  },
  {
    name: "above-followed",
    scheme: "light",
    run: async (p) => {
      await view(p, "above");
      const ok = await p.evaluate(() => {
        const c = window.jevAnts.game.colonies[1];
        for (let i = 0; i < c.n; i++) if (c.alive[i] && c.layer[i] === 0) return window.jevAnts.follow(1, i);
        return false;
      });
      if (!ok) throw new Error("no ant above to follow");
    },
  },
  { name: "above-pen", scheme: "light", run: async (p) => p.evaluate(() => window.jevAnts.fly(0)) },
  { name: "dark-above", scheme: "dark", run: async (p) => ticks(p, 1200) },
  { name: "dark-above-nest0", scheme: "dark", run: async (p) => p.evaluate(() => window.jevAnts.goNest(0)) },
  { name: "dark-below", scheme: "dark", run: async (p) => view(p, "below") },
  { name: "dark-below-nest1", scheme: "dark", run: async (p) => p.evaluate(() => window.jevAnts.goNest(1)) },
];

async function ticks(page, n) {
  await page.evaluate((n) => window.jevAnts.step(n), n);
}

async function view(page, which) {
  await page.getByRole("button", { name: which, exact: true }).click();
  await page.waitForFunction((w) => window.jevAnts.view() === w, which);
}

if (args.includes("--list")) {
  for (const s of SCENES) console.log(s.name);
  process.exit(0);
}
if ((mode !== "record" && mode !== "check") || !dirArg) {
  console.error("usage: node scripts/field-shots.mjs record|check <dir> [--scenes a,b] | --list   (--help for the rest)");
  process.exit(2);
}
const DIR = resolve(dirArg);
mkdirSync(DIR, { recursive: true });

/** A fresh, paused game of seed 3 at time 0: Start, pause, Restart from the Lab (the game from the seed, not the few frames Start let run). */
async function freshGame(page, url) {
  await page.goto(url);
  await page.getByLabel("world seed").fill(String(SEED));
  await page.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await page.waitForFunction(() => !!window.jevAnts?.game.world && window.jevAnts.game.landed !== null);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.keyboard.press("l"); // the Lab
  await page.getByRole("tab", { name: /world/i }).click();
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await page.keyboard.press("l");
  await page.waitForFunction(() => window.jevAnts.game.time === 0 && window.jevAnts.game.landed !== null);
  // the loop's own frames must not move the game: the page is paused
  const t0 = await page.evaluate(() => window.jevAnts.game.time);
  await sleep(300);
  if ((await page.evaluate(() => window.jevAnts.game.time)) !== t0) throw new Error("the game moved while paused");
}

/** The canvas's pixels once they have held still for a few frames (the camera eases, the minimap repaints twice a second). */
async function settled(page) {
  const read = () => page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"));
  let last = await read();
  let same = 0;
  for (let i = 0; i < 80 && same < 5; i++) {
    await sleep(100);
    const now = await read();
    same = now === last ? same + 1 : 0;
    last = now;
  }
  if (same < 5) throw new Error("the canvas never held still");
  return last;
}

const server = await startDevServer();
const browser = await chromium.launch();
const results = {};
let browserVersion = "";
try {
  browserVersion = `chromium ${browser.version()}`;
  const contexts = {};
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await freshGame(page, server.url);
    contexts[scheme] = { page, errors };
  }
  for (const s of SCENES) {
    // each scene continues the colour scheme's page from the one before; a --scenes subset still runs the ones it skips, unrecorded, so what a scene shows does not depend on the subset
    const { page } = contexts[s.scheme];
    await s.run(page);
    const url = await settled(page);
    if (only && !only.has(s.name)) continue;
    const png = Buffer.from(url.split(",")[1], "base64");
    results[s.name] = {
      hash: createHash("sha256").update(png).digest("hex").slice(0, 16),
      png,
      size: [png.readUInt32BE(16), png.readUInt32BE(20)],
    };
    process.stdout.write(`  ${s.name}: ${results[s.name].hash}\n`);
  }
  for (const [scheme, { errors }] of Object.entries(contexts))
    if (errors.length) throw new Error(`page errors (${scheme}): ${errors.join("; ")}`);
} finally {
  await browser.close();
  server.stop();
}

if (mode === "record") {
  const file = { browser: browserVersion, viewport: [1280, 900], seed: SEED, scenes: {} };
  for (const [name, r] of Object.entries(results)) {
    file.scenes[name] = r.hash;
    writeFileSync(join(DIR, `${name}.png`), r.png);
  }
  writeFileSync(join(DIR, "hashes.json"), JSON.stringify(file, null, 2) + "\n");
  console.log(`field-shots: recorded ${Object.keys(results).length} scenes in ${DIR}`);
} else {
  const base = JSON.parse(readFileSync(join(DIR, "hashes.json"), "utf8"));
  if (base.browser !== browserVersion)
    console.warn(`field-shots: recorded on ${base.browser}, checking on ${browserVersion}: a difference may be the browser's`);
  const differ = [];
  for (const [name, r] of Object.entries(results)) {
    if (base.scenes[name] !== r.hash) {
      differ.push(name);
      writeFileSync(join(DIR, `${name}.now.png`), r.png);
    }
  }
  const missing = Object.keys(results).filter((n) => !(n in base.scenes));
  if (missing.length) console.error(`field-shots: not in the baseline: ${missing.join(", ")}`);
  if (differ.length || missing.length) {
    console.error(
      `field-shots: ${differ.length} of ${Object.keys(results).length} scenes differ: ${differ.join(", ")} (saved as <scene>.now.png beside the baseline)`,
    );
    process.exit(1);
  }
  console.log(`field-shots: all ${Object.keys(results).length} scenes match`);
}
