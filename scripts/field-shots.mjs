#!/usr/bin/env node
// The map's pixel guard (ja-fnd.6.3, docs/refactor.md S5.3): renders fixed scenes of the one world's canvas in Chromium and hashes each one, so a
// change that should not move a pixel (splitting ColonyField into layers) can be shown not to. By hand, not part of `npm test` (it needs a browser:
// it uses the `playwright` already on the machine, and starts the dev server with no Jev key, so it spends nothing).
//
// Usage: node scripts/field-shots.mjs record <dir>   render every scene and write <dir>/hashes.json and one PNG a scene (the baseline)
//        node scripts/field-shots.mjs check <dir>    render again, compare with <dir>/hashes.json; a scene that differs is saved as <dir>/<scene>.now.png
//        --scenes a,b    check only these scenes (a name that is not a scene is an error; `record` always renders them all)
//        --any-browser   check a baseline recorded on another Chromium (its pixels may differ for that reason alone)
//        --list          print the scene names and exit
// The workflow for a pure move: `record` on main before the slice (current main: the baseline is of that code), `check` after it; the same code
// must `check` clean (the scenes are built to be deterministic: a fresh game of seed 3 stepped a fixed number of ticks with the page paused, the
// camera let to settle, the canvas read as pixels). Hashes depend on the browser and its fonts, so a baseline belongs to the machine and the
// Chromium it was recorded on (hashes.json says which; `check` refuses another one); keep <dir> outside the repo and never commit one.
// In CI: a PR with the `pixel-guard` label runs .github/workflows/pixels.yml, which does both on one runner (record on the merge base with this
// script, check on the head) and names the scenes that differ; that is the proof a refactor PR cites instead of a run by hand.
//
// What a scene shows is in SCENES below: the generic ant's world above and below (each nest zoomed, so the minimap shows; a followed ant on each
// layer; the queen's pen; chamber labels), the desert ant's day (noon, dusk, night), the dark scheme, a grown fungus (cords, stalks, knots, spores
// on the curtain: the `grown` page), and a world with a third colony and an aphid clump (the line's bend, ants on the strip, a clump: the `built`
// page). The last two are set up through the dev hook and the game itself. The `marks` page: the builder's tools by the real pointer (sugar, crumbs, rock, a crayon line, an aphid tap), a pinned specimen
// and a moved ant's trace (its start ring: the page is paused, so the ant never walks and no run, loops or end dot are drawn); the `phone` page: 390 px wide, touch. The `built` page ends with the theme flipped after the first frame and the pointer resting in the queen's pen, and the `retina` page is the same world at two device pixels to a CSS pixel: what ColonyField reads each frame from the page. A scene whose mouse stroke does not land stops the run (never a record of a lost stroke). The `ants` page: every kind of ant at once (markAnts: odour bands, light and heavy infection, three qualities of food, soil, a corpse, brood), as strokes and as sprites (the scenes hold the stroke and sprite paths, the dots and the cargo the sheets draw; what is drawn only while a sheet is not ready, the grey cross for a carried corpse and the nest sheet's corpse and brood sprites, is held by ui/tests/ants.test.ts). Not covered yet, to add with the slice that moves that layer: a specimen on an underground ant, the no-entry paint (a pheromone channel, drawn only with smell vision on). (The trace's run and dotted loops and the followed ring at a low zoom are `marks-trace-walk` and `marks-followed-far`.) (The lens card is DOM, and
// draw() paints no lens marks.) Known to hide from every scene: a corpse's stalk level on its ground sprite (the ground layer ignores it), and
// stalks of the plane drawn on the curtain (they fall off screen at the zoom of the scenes), and the same for the plane's other marks (a specimen's
// ring, a moved ant's trace) drawn on the curtain.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const SEED = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error(`field-shots: ${msg}`);
  process.exit(2);
};

async function ticks(page, n) {
  await page.evaluate((n) => window.jevAnts.step(n), n);
}

/** Step the game to game time `t` (seconds) if it is not there: one fixed step is 1/30 s. */
async function toTime(page, t) {
  const now = await page.evaluate(() => window.jevAnts.game.time);
  if (t > now) await ticks(page, Math.round((t - now) * 30));
}

async function view(page, which) {
  await page.getByRole("button", { name: which, exact: true }).click();
  await page.waitForFunction((w) => window.jevAnts.view() === w, which);
}

/** Press the chamber labels toggle in the Go to menu (it is a toggle: `on` says which side to leave it). */
async function chamberLabels(page, on) {
  await page.getByRole("button", { name: /^Go to/ }).click();
  const toggle = page.getByRole("button", { name: /Chamber labels/ });
  if ((await toggle.getAttribute("aria-pressed")) !== String(on)) await toggle.click();
  await page.getByRole("button", { name: /^Go to/ }).click(); // closes the menu: it is DOM, but a menu open over the field is not the scene
}

/** The ant `k` can follow on layer `layer` (0 the plane, 1 the curtain): follows it, or says there is none. */
async function followOn(page, k, layer) {
  const ok = await page.evaluate(
    ([k, layer]) => {
      const c = window.jevAnts.game.colonies[k];
      for (let i = 0; i < c.n; i++) if (c.alive[i] && c.layer[i] === layer) return window.jevAnts.follow(k, i);
      return false;
    },
    [k, layer],
  );
  if (!ok) throw new Error(`no ant of colony ${k} on layer ${layer} to follow`);
}

/**
 * A fungus that has had time to grow (the game itself, through the dev hook): Mycelium bought twice at once, then 120 s on, so the hyphae have
 * cords; then Stalks and Knots at level 2, six corpses buried along the hyphae, and 30 s more, so stalks stand on them and starved tips have
 * hardened into knots. The module is the dev server's colony index (the page's own instance).
 */
const growFungus = (page) =>
  page.evaluate(async () => {
    // through the colony index, as every module outside colony/ must (CLAUDE.md); the dev server serves the page's own instances
    const { pathTo, hyphaCell: keyCell } = await import("/src/colony/index.ts");
    const J = window.jevAnts;
    const f = J.game.fungus;
    const e = f.evolution;
    e.growth = 1e7;
    const keep = (id) => pathTo(e.save().levels, id).every((x) => f.upgrade(x));
    keep("mycelium");
    keep("mycelium");
    J.step(6000);
    keep("stalks");
    keep("stalks");
    keep("knots");
    keep("knots");
    const keys = [...f.hyphaeOn(0).parent.keys()].filter((k) => !f.hyphaeOn(0).cords.has(k));
    const stride = Math.floor(keys.length / 6);
    for (let i = 0, n = 0; i < keys.length && n < 6; i += stride, n++) {
      const [x, y] = keyCell(keys[i]);
      J.game.colonies[0].onBury({ x, y, held: -1, died: J.game.time, load: 0.5, strain: e.strain }, 0);
    }
    J.step(900);
    // spores on the curtain, round the second nest's hole (the game puts them there only once an ant has walked through)
    const sp = f.sporesOn(1).spores;
    const e1 = J.game.colonies[1].layers[1].nest;
    const [ex, ey] = [Math.round(e1.entrance?.x ?? e1.x), Math.round(e1.entrance?.y ?? e1.y)];
    for (let dy = 1; dy <= 6; dy++) for (let dx = -8; dx <= 8; dx++) sp.set(ex + dx, ey + dy, 2);
    const h = f.hyphaeOn(0);
    if (!f.stalksOn(0).length || !h.knots.size || !h.cords.size)
      throw new Error(
        `the fungus has no stalks, knots or cords to draw (${f.stalksOn(0).length}, ${h.knots.size}, ${h.cords.size}; mycelium ${e.level("mycelium")}, ${h.parent.size} cells)`,
      );
  });

/**
 * A third colony beyond the line's far end (so the line has a bend, which the side view marks and labels), the builder's aphid clump on the
 * plane near the first nest, and time for ants to find it. The game itself, through the dev hook.
 */
const buildWorld = (page) =>
  page.evaluate(() => {
    const J = window.jevAnts;
    const g = J.game;
    J.step(1200);
    const r = g.tryFoundBeyond("end");
    if (!r.ok) throw new Error(`no third colony: ${r.reason}`);
    const h = g.colonies[0].holeCells[g.colonies[0].params.nest];
    const cells = [];
    for (let dy = 3; dy <= 5; dy++) for (let dx = 2; dx <= 4; dx++) cells.push(h.px + dx, h.py + dy);
    g.aphids.push({ layer: 0, cells, start: 3 * (cells.length / 2), eaten: 0, age: 100, owed: 0 });
    J.step(300);
    if (g.colonies.length < 3 || !g.aphids.length) throw new Error("the world was not built");
  });

/**
 * Every kind of ant the field draws, in view at once (the game itself, through the dev hook; the page is paused, so nothing moves after): each
 * alive ant takes an odour from five bands (the strokes and sprites are tinted by band) and one of nine kinds by its place in the colony: bare,
 * lightly infected (the faint spore dot), heavily infected (the full dot), carrying food of three qualities (plain, sweet, crumb), carrying soil, carrying a corpse,
 * carrying brood. Where each kind lands on screen depends on where the ants have walked (600 steps first).
 */
const markAnts = (page) =>
  page.evaluate(() => {
    const g = window.jevAnts.game;
    for (const c of g.colonies) {
      const alive = [];
      for (let i = 0; i < c.n; i++) if (c.alive[i]) alive.push(i);
      let brood = 0;
      alive.forEach((i, n) => {
        c.odour[i] = [0, 0.15, 0.4, 0.65, 0.9][n % 5];
        const kind = n % 9;
        if (kind === 1) c.load[i] = 0.3;
        else if (kind === 2) c.load[i] = 1;
        else if (kind === 3) ((c.carrying[i] = 1), (c.quality[i] = 1));
        else if (kind === 4) ((c.carrying[i] = 1), (c.quality[i] = 2));
        else if (kind === 5) c.pellet[i] = 1;
        else if (kind === 6) {
          c.pellet[i] = 1;
          c.corpse[i] = 1;
          c.corpses.push({ x: c.x[i], y: c.y[i], held: i, died: g.time - 5, load: 0, strain: 0 });
        } else if (kind === 8) ((c.carrying[i] = 1), (c.quality[i] = 0.5));
        else if (kind === 7 && brood < c.brood.items.length) {
          c.broodHeld[i] = 1;
          c.brood.items[brood++].held = i;
        }
      });
    }
  });

/** The canvas pixel (CSS px, as the mouse takes it) of colony `k`'s ant nearest the middle of the canvas on layer `layer`, or a thrown error. */
async function antScreen(page, k, layer) {
  const at = await page.evaluate(
    async ([k, layer]) => {
      const { centreX, centreY } = await import("/src/colony/index.ts");
      const J = window.jevAnts;
      const c = J.game.colonies[k];
      const cam = J.camera(layer === 0 ? "above" : "below");
      const r = document.querySelector("canvas").getBoundingClientRect();
      let best = null;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.layer[i] !== layer) continue;
        const sx = (centreX(c.x[i], c.y[i]) - cam.x) * cam.zoom + r.width / 2;
        const sy = (centreY(c.y[i]) - cam.y) * cam.zoom + r.height / 2;
        const d = Math.hypot(sx - r.width / 2, sy - r.height / 2);
        if (sx > 120 && sx < r.width - 120 && sy > 140 && sy < r.height - 140 && (!best || d < best.d)) best = { i, sx, sy, d };
      }
      return best;
    },
    [k, layer],
  );
  if (!at) throw new Error(`no ant of colony ${k} on layer ${layer} in view`);
  return at;
}

/** What the builder's tools and the tweezers change, as one string: the plane's food and terrain, the crayon lines, the aphid clumps, the ants' places. */
const stateNow = (page) =>
  page.evaluate(() => {
    const g = window.jevAnts.game;
    const plane = g.world.plane;
    let terrain = 0;
    for (let y = 0; y < plane.size.h; y++) for (let x = 0; x < plane.size.w; x++) terrain += plane.rock.get(x, y) * (1 + ((x * 7 + y) % 5));
    let ants = 0;
    for (const c of g.colonies) for (let i = 0; i < c.n; i++) ants += c.x[i] + c.y[i];
    return `${plane.foodLeft}|${terrain}|${g.crayons.length}|${g.aphids.length}|${ants}`;
  });

/**
 * Do something with the mouse and prove it landed: the game's state (stateNow) must change within two seconds. A pointer-down that arrives before the field uses
 * the tool just taken does nothing (the page says the tool is pressed, yet the stroke is lost: seen in review, one run in three on one scene),
 * and a scene hashed after a lost stroke would silently stop covering that tool. A lost stroke changed nothing, so it is tried once more; if it
 * is lost again the run stops, so a record never keeps such a scene.
 */
async function landed(page, what, act) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await stateNow(page);
    await act();
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      if ((await stateNow(page)) !== before) return;
    }
  }
  throw new Error(`${what}: the mouse did nothing (the game's state did not change after two tries)`);
}

/** A stroke with the mouse, in canvas pixels, in a few steps (a tool of the builder's tray acts along it). */
const stroke = (page, from, to) =>
  landed(page, "a stroke", async () => {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    for (let t = 1; t <= 6; t++) await page.mouse.move(from[0] + ((to[0] - from[0]) * t) / 6, from[1] + ((to[1] - from[1]) * t) / 6);
    await page.mouse.up();
  });

const tap = (page, at) => landed(page, "a tap", () => page.mouse.click(at[0], at[1]));

/** Take a tray tool (its exact accessible name) and wait until the tray says it is the one in hand: a stroke before that would not be the tool's. */
async function tool(page, name) {
  const button = page.getByRole("button", { name, exact: true });
  await button.click();
  await page.waitForFunction((el) => el.getAttribute("aria-pressed") === "true", await button.elementHandle());
}

/** Turn the mouse wheel over the middle of the canvas (deltaY < 0 zooms in), and let the camera settle. */
async function zoomWheel(page, deltaY) {
  const r = await page.evaluate(() => document.querySelector("canvas").getBoundingClientRect().toJSON());
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.wheel(0, deltaY);
}

/** Game time of the desert day's phases, from the species' own numbers (colony/heat.ts dayPhase): sunrise 0, noon (1 - night) / 2, sunset 1 - night. */
const dayAt = (page, phase) =>
  page.evaluate((phase) => {
    const p = window.jevAnts.game.colonies[0].params;
    const t = phase * p.heatDay - p.heatStart;
    return t < 0 ? t + p.heatDay : t;
  }, phase);

/**
 * The scenes, in the order they are rendered: each colour scheme and species has a page of its own, and a scene continues from the one before on
 * its page. `run` leaves the page as it should be drawn; `after`, when given, puts back what the scene changed (it runs once the pixels are read).
 */
// A new scene goes on another page, or before the labels scene: the labels scene must stay last on its page (the canvas-state leak below).
const SCENES = [
  { name: "above-start", page: "light", run: (p) => ticks(p, 300) },
  { name: "above-later", page: "light", run: (p) => ticks(p, 2700) },
  { name: "above-nest0", page: "light", run: (p) => p.evaluate(() => window.jevAnts.goNest(0)) },
  { name: "above-nest1", page: "light", run: (p) => p.evaluate(() => window.jevAnts.goNest(1)) },
  { name: "below", page: "light", run: (p) => view(p, "below") },
  { name: "below-nest0", page: "light", run: (p) => p.evaluate(() => window.jevAnts.goNest(0)) },
  { name: "below-nest1", page: "light", run: (p) => p.evaluate(() => window.jevAnts.goNest(1)) },
  { name: "below-followed", page: "light", run: (p) => followOn(p, 0, 1) },
  {
    name: "above-followed",
    page: "light",
    run: async (p) => {
      await view(p, "above");
      await followOn(p, 1, 0);
    },
  },
  { name: "above-pen", page: "light", run: (p) => p.evaluate(() => window.jevAnts.fly(0)) },
  // Last on its page, and put back after: once chamber labels have been on, the canvas keeps the label block's lineJoin and lineWidth for every
  // later stroke (ColonyField sets them and never resets them), so a scene after this one would show that leak. lineCap is the most widespread leak: it is
  // never reset either, and resetting it at the start of a frame changed 6 of the first 8 scenes.
  {
    name: "below-nest1-labels",
    page: "light",
    run: async (p) => {
      await view(p, "below");
      await p.evaluate(() => window.jevAnts.goNest(1));
      await chamberLabels(p, true);
    },
    after: (p) => chamberLabels(p, false),
  },
  { name: "dark-above", page: "dark", run: (p) => ticks(p, 1200) },
  { name: "dark-above-nest0", page: "dark", run: (p) => p.evaluate(() => window.jevAnts.goNest(0)) },
  { name: "dark-below", page: "dark", run: (p) => view(p, "below") },
  { name: "dark-below-nest1", page: "dark", run: (p) => p.evaluate(() => window.jevAnts.goNest(1)) },
  // A grown fungus (cords, stalks, knots, spores below): the dark of neither page, a fresh light game
  {
    name: "grown-above",
    page: "grown",
    run: async (p) => {
      await growFungus(p);
      await p.evaluate(() => window.jevAnts.goNest(1));
    },
  },
  // the whole curtain first (a stalk or a plane cell read on the wrong layer would land somewhere on it), then the second nest zoomed
  { name: "grown-below-wide", page: "grown", run: (p) => view(p, "below") },
  { name: "grown-below", page: "grown", run: (p) => p.evaluate(() => window.jevAnts.goNest(1)) },
  // One game, in this order: a smoke scene of the plane's trails (the curtain's are in grown-below), then the third colony and the aphid clump
  // are added (built-aphids), then the same world below (the bend, ants on the strip)
  { name: "built-trails", page: "built", run: (p) => ticks(p, 1500).then(() => p.evaluate(() => window.jevAnts.goNest(0))) },
  {
    name: "built-aphids",
    page: "built",
    run: async (p) => {
      await buildWorld(p);
      await p.evaluate(() => window.jevAnts.goNest(0));
    },
  },
  { name: "built-bend", page: "built", run: (p) => view(p, "below") },
  { name: "built-strip", page: "built", run: (p) => p.evaluate(() => window.jevAnts.goNest(1)) },
  // What the field reads each frame from the page rather than from the game: the theme (flipped after the first frame, as Settings does) and the
  // pointer over the queen's pen (the settle preview under it). A layer drawing with a stale one shows here.
  {
    name: "built-theme-flip",
    page: "built",
    run: async (p) => {
      await view(p, "above");
      await p.evaluate(() => {
        window.jevAnts.goNest(0);
        document.documentElement.dataset.theme = "dark";
      });
      await sleep(500);
    },
    after: (p) => p.evaluate(() => document.documentElement.removeAttribute("data-theme")),
  },
  {
    name: "built-pen-hover",
    page: "built",
    run: async (p) => {
      await p.evaluate(() => window.jevAnts.fly(0));
      await sleep(500);
      await p.mouse.move(760, 540);
      await sleep(200);
    },
  },
  // The marks of a player: a pinned specimen (a dashed ring and its label), the builder's strokes and clump, and an ant the tweezers moved
  // (its start ring: the page is paused). The builder works by the real pointer on the real canvas, the page paused.
  {
    name: "marks-specimen",
    page: "marks",
    run: async (p) => {
      await ticks(p, 900);
      await p.evaluate(() => window.jevAnts.goNest(0));
      await sleep(1500);
      const { i } = await antScreen(p, 0, 0);
      await p.evaluate((i) => window.jevAnts.follow(0, i), i);
      await p.getByRole("button", { name: "Pin as a specimen" }).click();
      await p.getByRole("button", { name: "Stop following" }).click();
    },
  },
  {
    name: "marks-builder",
    page: "marks",
    run: async (p) => {
      await p.getByRole("button", { name: "Builder", exact: true }).click();
      const c = [640, 450];
      await tool(p, "Sugar");
      await stroke(p, [c[0] - 200, c[1] - 120], [c[0] - 120, c[1] - 160]);
      await tool(p, "Crumbs");
      await stroke(p, [c[0] + 20, c[1] - 200], [c[0] + 90, c[1] - 220]);
      await tool(p, "Rock");
      await stroke(p, [c[0] + 100, c[1] - 140], [c[0] + 220, c[1] - 100]);
      await tool(p, "Trail crayon, Ink");
      await stroke(p, [c[0] - 220, c[1] + 120], [c[0] + 60, c[1] + 160]);
      await tool(p, "Aphids");
      await tap(p, [c[0] + 160, c[1] + 120]);
      await tool(p, "Move");
    },
  },
  {
    name: "marks-trace",
    page: "marks",
    run: async (p) => {
      await tool(p, "Tweezers: pick up an ant");
      const { sx, sy } = await antScreen(p, 0, 0);
      await stroke(p, [sx, sy], [sx + 140, sy - 110]);
      await tool(p, "Move");
    },
  },
  // The moved ant then walks: a trace is recorded a point a drawn frame, so the page steps ten ticks and lets a frame draw, six times (the trace's solid
  // run and, once its vector is out, its dotted search loops: the scene above holds only the start ring).
  {
    name: "marks-trace-walk",
    page: "walk",
    run: async (p) => {
      await tool(p, "Tweezers: pick up an ant");
      const { sx, sy } = await antScreen(p, 0, 0);
      await stroke(p, [sx, sy], [sx + 140, sy - 110]);
      await tool(p, "Move");
      for (let k = 0; k < 6; k++) {
        await ticks(p, 10);
        await sleep(150);
      }
    },
  },
  // The followed ant's ring at a low zoom, where its radius is the 9 device px floor (the scenes' zoom makes zoom * 1.6 win).
  {
    name: "marks-followed-far",
    page: "marks",
    run: async (p) => {
      await followOn(p, 0, 0);
      await zoomWheel(p, 1500);
    },
  },
  // A phone-sized page (390 x 844, touch): the field's size and the page's narrow layout
  { name: "phone-above", page: "phone", run: (p) => ticks(p, 900).then(() => p.evaluate(() => window.jevAnts.goNest(0))) },
  { name: "phone-below", page: "phone", run: (p) => view(p, "below") },
  // The same at two device pixels to a CSS pixel: the lines, dashes, labels and dots scale with it
  { name: "retina-above", page: "retina", run: (p) => ticks(p, 900).then(() => p.evaluate(() => window.jevAnts.goNest(0))) },
  { name: "retina-below", page: "retina", run: (p) => view(p, "below") },
  // Every kind of ant (markAnts), above, and below at the whole curtain (strokes), at a nest, and zoomed in with the wheel (sprites)
  {
    name: "ants-above",
    page: "ants",
    run: (p) =>
      ticks(p, 600)
        .then(() => markAnts(p))
        .then(() => p.evaluate(() => window.jevAnts.goNest(0))),
  },
  { name: "ants-below-wide", page: "ants", run: (p) => view(p, "below") },
  { name: "ants-below-nest0", page: "ants", run: (p) => p.evaluate(() => window.jevAnts.goNest(0)) },
  { name: "ants-below-near", page: "ants", run: (p) => zoomWheel(p, -900) },
  { name: "desert-noon", page: "desert", run: async (p) => toTime(p, await dayAt(p, 1 / 3)) },
  { name: "desert-dusk", page: "desert", run: async (p) => toTime(p, await dayAt(p, 0.62)) },
  { name: "desert-night", page: "desert", run: async (p) => toTime(p, await dayAt(p, 0.84)) },
];

/** Each page: the colour scheme it is drawn in and the species (a start-screen choice) its game is. */
const PAGES = {
  light: { scheme: "light", species: null },
  dark: { scheme: "dark", species: null },
  desert: { scheme: "light", species: "desert" },
  grown: { scheme: "light", species: null },
  built: { scheme: "light", species: null },
  marks: { scheme: "light", species: null },
  ants: { scheme: "light", species: null },
  // a page of its own: the tweezers' stroke needs an ant nothing has moved (the marks page's scene before it moved the same one)
  walk: { scheme: "light", species: null },
  retina: { scheme: "light", species: null, scale: 2 },
  // a phone: 390 px wide, touch (the layout and the field's size differ, so the page's own rules for a narrow screen show)
  phone: { scheme: "light", species: null, phone: true },
};

// ——— The command line, checked before anything starts ———
const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const s of SCENES) console.log(s.name);
  process.exit(0);
}
const mode = args[0];
const dirArg = args[1];
if ((mode !== "record" && mode !== "check") || !dirArg || dirArg.startsWith("--")) {
  fail("usage: node scripts/field-shots.mjs record|check <dir> [--scenes a,b] [--any-browser] | --list   (--help for the rest)");
}
const known = new Set(SCENES.map((s) => s.name));
let only = null;
if (args.includes("--scenes")) {
  const value = args[args.indexOf("--scenes") + 1];
  if (mode === "record")
    fail("record always renders every scene (a baseline with some scenes missing would fail every later check): drop --scenes");
  if (!value || value.startsWith("--")) fail("--scenes needs a list: --scenes above-start,below");
  only = new Set(value.split(",").filter(Boolean));
  const unknown = [...only].filter((n) => !known.has(n));
  if (unknown.length) fail(`not a scene: ${unknown.join(", ")}. The scenes are: ${[...known].join(", ")}`);
}
const DIR = resolve(dirArg);
let base = null;
if (mode === "check") {
  if (!existsSync(join(DIR, "hashes.json"))) fail(`no baseline in ${DIR}: run \`record\` first`);
  base = JSON.parse(readFileSync(join(DIR, "hashes.json"), "utf8"));
} else {
  mkdirSync(DIR, { recursive: true });
}

/** A fresh, paused game of seed 3 at time 0: Start, pause, Restart from the Lab (the game from the seed, not the few frames Start let run). */
async function freshGame(page, url, species) {
  await page.goto(url);
  if (species) {
    await page.getByRole("combobox", { name: "species" }).selectOption(species);
    await page.getByLabel("world seed").fill(String(SEED));
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForFunction((id) => window.jevAnts?.game.params.species.id === id && window.jevAnts.game.landed !== null, species);
  } else {
    await page.getByLabel("world seed").fill(String(SEED));
    await page.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
    await page.waitForFunction(() => !!window.jevAnts?.game.world && window.jevAnts.game.landed !== null);
  }
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
const browserVersion = `chromium ${browser.version()}`;
try {
  if (base && base.browser !== browserVersion && !args.includes("--any-browser")) {
    throw Object.assign(
      new Error(
        `the baseline was recorded on ${base.browser}, this is ${browserVersion}: its pixels may differ for that reason alone (--any-browser to check anyway)`,
      ),
      { usage: true },
    );
  }
  const pages = {};
  for (const [key, { scheme, species, phone, scale }] of Object.entries(PAGES)) {
    if (only && !SCENES.some((s) => s.page === key && only.has(s.name))) continue; // a page no wanted scene is on is not opened
    const ctx = await browser.newContext({
      ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }),
      deviceScaleFactor: scale ?? 1,
      colorScheme: scheme,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await freshGame(page, server.url, species);
    pages[key] = { page, errors };
  }
  for (const s of SCENES) {
    // a scene continues its page from the one before, and a scene not asked for still runs when a later one is (unrecorded), so what a scene
    // shows does not depend on the subset
    if (!pages[s.page]) continue;
    const wanted = !only || only.has(s.name);
    if (!wanted && !SCENES.some((t) => t.page === s.page && only?.has(t.name) && SCENES.indexOf(t) > SCENES.indexOf(s))) continue;
    const { page } = pages[s.page];
    await s.run(page);
    const url = await settled(page);
    if (s.after) await s.after(page);
    if (!wanted) continue;
    const png = Buffer.from(url.split(",")[1], "base64");
    results[s.name] = { hash: createHash("sha256").update(png).digest("hex").slice(0, 16), png };
    process.stdout.write(`  ${s.name}: ${results[s.name].hash}\n`);
  }
  for (const [key, { errors }] of Object.entries(pages)) if (errors.length) throw new Error(`page errors (${key}): ${errors.join("; ")}`);
} catch (e) {
  console.error(`field-shots: ${e instanceof Error ? e.message : e}`);
  process.exitCode = e?.usage ? 2 : 1;
} finally {
  await browser.close();
  server.stop();
}
if (process.exitCode) process.exit(process.exitCode);

if (!Object.keys(results).length) fail("no scene was rendered");
if (mode === "record") {
  const file = { browser: browserVersion, viewport: [1280, 900], seed: SEED, scenes: {} };
  for (const [name, r] of Object.entries(results)) {
    file.scenes[name] = r.hash;
    writeFileSync(join(DIR, `${name}.png`), r.png);
    rmSync(join(DIR, `${name}.now.png`), { force: true });
  }
  writeFileSync(join(DIR, "hashes.json"), JSON.stringify(file, null, 2) + "\n");
  console.log(`field-shots: recorded ${Object.keys(results).length} scenes in ${DIR}`);
} else {
  const differ = [];
  const missing = [];
  for (const [name, r] of Object.entries(results)) {
    const now = join(DIR, `${name}.now.png`);
    if (!(name in base.scenes)) {
      missing.push(name);
      writeFileSync(now, r.png); // a new scene's picture, to look at before it is recorded
    } else if (base.scenes[name] !== r.hash) {
      differ.push(name);
      writeFileSync(now, r.png);
    } else rmSync(now, { force: true }); // a picture of an earlier failure is not this check's
  }
  if (missing.length) console.error(`field-shots: not in the baseline (record it again on this code's main): ${missing.join(", ")}`);
  if (differ.length || missing.length) {
    console.error(
      `field-shots: ${differ.length} of ${Object.keys(results).length} scenes differ: ${differ.join(", ")} (saved as <scene>.now.png beside the baseline)`,
    );
    process.exit(1);
  }
  console.log(`field-shots: all ${Object.keys(results).length} scenes match`);
}
