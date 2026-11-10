#!/usr/bin/env node
// The one-world page's guard (docs/one-world.md §6, U5.2): Chromium drives the page through the views linked. By hand,
// like the bench: `npm run e2e` (not part of `npm test`, which has no browser). It uses the `playwright` already on the
// machine (no install, no dependency) and starts the dev server on a free port with no Jev key, so it spends nothing.
//
//  1. a one-world game, seed fixed (Start, then Details → Ground → one world): it opens above;
//  2. above, below, above mid-game: each view keeps its own camera;
//  3. a click on the line above shows below at that column; a click on the strip below shows above at P(s);
//  4. an ant followed through a hole (the dev hook's follow) carries the camera across: the view switches and centres on it;
//  5. the queen's pen: a flight forced by the dev hook (fly) opens it above; a click outside her flight is refused, and a
//     click inside founds her colony where the preview (Game.settleAt) said.
// Screenshots (deviceScaleFactor 1) go to E2E_SHOTS (a directory) when set: the linked switch and the pen's preview.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("e2e-one-world: can't resolve 'playwright'. This guard uses a copy already installed on the machine (on NODE_PATH or in a parent node_modules); install it there, it is not a dependency of this repo.");
  process.exit(2);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const SEED = 3;
const SHOTS = process.env.E2E_SHOTS ?? null;
const t0 = Date.now();

const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll fn until it returns truthy, or fail with `what` after `ms`. */
async function until(fn, what, ms = 10_000, every = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out (${ms} ms) waiting for ${what}`);
    await sleep(every);
  }
}

function check(ok, what) {
  if (!ok) throw new Error(what);
  console.log(`  ok  ${what}`);
}

const near = (a, b, eps) => Math.abs(a - b) <= eps;

/**
 * Where a view's camera looks when asked to centre on world (tx, ty) at `zoom`: clamped to its map in the box it is
 * drawn in now (camera.ts clamp, hex.ts extent), in the page.
 */
function clampCam(layer, tx, ty, zoom) {
  const w = window.jevAnts.game.world;
  const m = layer === "above" ? w.plane : w.curtain;
  const cv = document.querySelector("canvas");
  const R = Math.sqrt(3) / 2;
  const W = m.size.w + 0.5;
  const H = m.size.h * R + (1 / Math.sqrt(3) - R / 2);
  const z = Math.max(Math.min(cv.width / W, cv.height / H), Math.min(28, zoom));
  const hw = cv.width / z / 2;
  const hh = cv.height / z / 2;
  return { x: hw * 2 >= W ? m.x0 + W / 2 : Math.max(m.x0 + hw, Math.min(m.x0 + W - hw, tx)), y: hh * 2 >= H ? H / 2 : Math.max(hh, Math.min(H - hh, ty)), zoom: z };
}
const expectCam = (page, layer, tx, ty, zoom) => page.evaluate(([layer, tx, ty, zoom]) => window.__clampCam(layer, tx, ty, zoom), [layer, tx, ty, zoom]);
const sameCam = (a, b) => near(a.x, b.x, 1e-6) && near(a.y, b.y, 1e-6) && near(a.zoom, b.zoom, 1e-6);

// The dev server: Vite on a free port, the Jev key left out of its environment (no run can start, nothing is spent).
const port = await freePort();
const env = { ...process.env };
delete env.JEV_API_KEY;
const vite = spawn(process.execPath, [join(WEB, "node_modules/vite/bin/vite.js"), "--port", String(port), "--host", "127.0.0.1", "--strictPort"], { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"] });
let viteLog = "";
vite.stdout.on("data", (d) => (viteLog += d));
vite.stderr.on("data", (d) => (viteLog += d));
const url = `http://127.0.0.1:${port}/`;
let browser = null;
/** Errors the page threw (a frame that throws stops the page's loop): said with any failure. */
const errors = [];
const stop = async () => {
  await browser?.close().catch(() => {});
  vite.kill("SIGTERM");
};
process.on("SIGINT", () => void stop().then(() => process.exit(130)));

try {
  await until(
    async () => {
      if (vite.exitCode !== null) throw new Error(`vite exited (${vite.exitCode}):\n${viteLog}`);
      return fetch(url)
        .then((r) => r.ok)
        .catch(() => false);
    },
    "the dev server",
    60_000,
    250,
  );
  console.log(`dev server on ${url} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(`window.__clampCam = ${clampCam.toString()};`);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `u52-${name}.png`) });
  };

  // ——— 1. A one-world game, seed fixed: it opens above ———
  console.log("1. a one-world game");
  await page.getByLabel("world seed").fill(String(SEED));
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "one world", exact: true }).click();
  await page.getByRole("button", { name: "Close Details" }).click();
  await until(() => page.evaluate(() => !!window.jevAnts?.game.world && window.jevAnts.game.landed !== null), "the one-world game, landed");
  check((await page.evaluate(() => window.jevAnts.view())) === "above", "a one-world game opens above");
  check((await page.getByRole("button", { name: "above", exact: true }).getAttribute("aria-pressed")) === "true", "the switch shows above");
  const canvas = page.locator("canvas").first();
  check(/click the line to look below/.test((await canvas.getAttribute("aria-label")) ?? ""), "the field's label is the top view's");
  await sleep(1500); // mid-game

  // ——— 2. Above, below, above: each view keeps its camera ———
  console.log("2. each view keeps its camera");
  const cam = (v) => page.evaluate((v) => window.jevAnts.camera(v), v);
  const view = () => page.evaluate(() => window.jevAnts.view());
  const keys = async (...ks) => {
    await canvas.focus();
    for (const k of ks) await page.keyboard.press(k);
    await sleep(120);
  };
  await keys("Equal", "Equal", "Equal", "ArrowLeft", "ArrowUp");
  const above = await cam("above");
  await page.getByRole("button", { name: "below", exact: true }).click();
  await until(async () => (await view()) === "below", "below");
  await sleep(200);
  check(/click the ground strip/.test((await canvas.getAttribute("aria-label")) ?? ""), "the field's label is the side view's");
  await keys("Equal", "Equal", "Equal", "Equal", "ArrowRight", "ArrowDown", "ArrowDown");
  const below = await cam("below");
  check(below && above && (below.x !== above.x || below.zoom !== above.zoom), "below has a camera of its own");
  await page.getByRole("button", { name: "above", exact: true }).click();
  await until(async () => (await view()) === "above", "above again");
  await sleep(200);
  const above2 = await cam("above");
  check(near(above2.x, above.x, 1e-6) && near(above2.y, above.y, 1e-6) && near(above2.zoom, above.zoom, 1e-6), `above kept its camera (${above.x.toFixed(1)}, ${above.y.toFixed(1)} ×${above.zoom.toFixed(2)})`);
  await page.keyboard.press("v");
  await until(async () => (await view()) === "below", "below by the key v");
  await sleep(200);
  const below2 = await cam("below");
  check(near(below2.x, below.x, 1e-6) && near(below2.y, below.y, 1e-6) && near(below2.zoom, below.zoom, 1e-6), `below kept its camera (${below.x.toFixed(1)}, ${below.y.toFixed(1)} ×${below.zoom.toFixed(2)})`);
  await page.getByRole("button", { name: "above", exact: true }).click();
  await until(async () => (await view()) === "above", "above");

  // ——— 3. Linked clicks ———
  console.log("3. linked clicks");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await keys("Digit0"); // the whole plane: the line in view
  await sleep(200);
  // Where on screen (CSS px) world (x, y) of a view lies, and whether an ant of that layer is under it (a click would follow it).
  const spot = await page.evaluate(() => {
    const { game } = window.jevAnts;
    const w = game.world;
    const line = w.line;
    const c = window.jevAnts.camera("above");
    const cv = document.querySelector("canvas");
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const reach = (14 * 1.5 * k) / c.zoom;
    const R = Math.sqrt(3) / 2;
    const clear = (wx, wy, layer) => {
      let d = Infinity;
      for (const col of game.colonies) for (let i = 0; i < col.n; i++) if (col.alive[i] && col.layer[i] === layer) d = Math.min(d, Math.hypot(col.x[i] - wx, col.y[i] - wy));
      return d;
    };
    // The spot on the line farthest from any plane ant (beyond the field's pick reach, so the click is no follow).
    let best = null;
    for (let s = line.sMin + 4; s <= line.sMax - 4; s++) {
      const i = s - line.sMin;
      const cx = line.cells[2 * i];
      const cy = line.cells[2 * i + 1];
      const wx = cx + 0.5 + 0.5 * (cy & 1);
      const wy = (cy + 0.5) * R;
      const sx = r.left + ((wx - c.x) * c.zoom + cv.width / 2) / k;
      const sy = r.top + ((wy - c.y) * c.zoom + cv.height / 2) / k;
      if (sx < r.left + 30 || sx > r.right - 30 || sy < r.top + 50 || sy > r.bottom - 30) continue;
      const room = clear(wx, wy, 0);
      if (room > reach && (!best || room > best.room)) best = { s, sx, sy, zoom: c.zoom, room };
    }
    if (best) return best;
    return null;
  });
  check(spot !== null, "a spot on the line with no ant on it");
  await shot("link-above");
  await page.mouse.click(spot.sx, spot.sy);
  await until(async () => (await view()) === "below", "below after a click on the line");
  await sleep(250);
  // Where the side view should look: the strip at s, clamped to the curtain in the box it is drawn in (camera.ts clamp).
  // The strip at s (centreX(s, STRIP): row 40 is even), at least the link's zoom (8 a cell at deviceScaleFactor 1).
  const expectBelow = await expectCam(page, "below", spot.s + 0.5, 40.5 * (Math.sqrt(3) / 2), Math.max(spot.zoom, 8));
  const atS = await cam("below");
  check(sameCam(atS, expectBelow), `below centres on the strip at s = ${spot.s} (${atS.x.toFixed(1)}, ${atS.y.toFixed(1)} ×${atS.zoom.toFixed(2)})`);
  await shot("link-below");
  // Back up: a click on the sky over the strip, a few columns along.
  const up = await page.evaluate(() => {
    const { game } = window.jevAnts;
    const line = game.world.line;
    const c = window.jevAnts.camera("below");
    const cv = document.querySelector("canvas");
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const R = Math.sqrt(3) / 2;
    for (let d = 8; d < 40; d++) {
      const s = Math.round(c.x) + d;
      if (s > line.sMax) break;
      const wx = s + 0.5;
      const wy = (30 + 0.5) * R; // row 30: the sky
      const sx = r.left + ((wx - c.x) * c.zoom + cv.width / 2) / k;
      const sy = r.top + ((wy - c.y) * c.zoom + cv.height / 2) / k;
      if (sx < r.left + 30 || sx > r.right - 30 || sy < r.top + 50 || sy > r.bottom - 30) continue;
      const i = s - line.sMin;
      const px = line.cells[2 * i];
      const py = line.cells[2 * i + 1];
      return { s, sx, sy, x: px + 0.5 + 0.5 * (py & 1), y: (py + 0.5) * R };
    }
    return null;
  });
  check(up !== null, "a spot on the sky over the strip");
  await page.mouse.click(up.sx, up.sy);
  await until(async () => (await view()) === "above", "above after a click on the strip");
  await sleep(250);
  const atP = await cam("above");
  check(sameCam(atP, await expectCam(page, "above", up.x, up.y, atS.zoom)), `above centres on P(${up.s}) (${up.x.toFixed(1)}, ${up.y.toFixed(1)}), at the side view's zoom`);

  // ——— 4. An ant followed through a hole carries the camera across ———
  console.log("4. follow an ant through a hole");
  await page.getByRole("button", { name: "below", exact: true }).click();
  await until(async () => (await view()) === "below", "below");
  await page.getByRole("button", { name: "4×", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  check((await page.getByRole("button", { name: "Carry across" }).getAttribute("aria-pressed")) === "true", "carry across is on by default");
  // Each frame, the page records the followed ant (its layer and place), the view and the top view's camera: the guard
  // reads the frame where the ant is up and the view has come with it (an ant can step back down within a poll).
  let carried = null;
  for (let tries = 0; tries < 12 && !carried; tries++) {
    // Each try from the side view (an ant given up may have carried the camera up and back).
    if ((await view()) !== "below") {
      await page.getByRole("button", { name: "below", exact: true }).click();
      await until(async () => (await view()) === "below", "below");
    }
    // A curtain ant near its hole, by the dev hook; then the game runs until it comes up (or it is given up).
    const picked = await page.evaluate((tries) => {
      const { game } = window.jevAnts;
      const R = Math.sqrt(3) / 2;
      let best = null;
      game.colonies.forEach((col, k) => {
        const hc = col.holeCells[col.params.nest];
        if (!hc) return;
        const hx = hc.col + 0.5 + 0.5 * (hc.row & 1);
        const hy = (hc.row + 0.5) * R;
        for (let i = 0; i < col.n; i++) {
          if (!col.alive[i] || col.layer[i] !== 1) continue;
          const d = Math.hypot(col.x[i] - hx, col.y[i] - hy) + ((i * 7919 + tries * 104729) % 97) / 40; // a different ant each try
          if (!best || d < best.d) best = { k, i, d };
        }
      });
      if (!best || !window.jevAnts.follow(best.k, best.i)) return null;
      const trail = (window.__trail = []);
      const loop = () => {
        if (window.__trail !== trail) return;
        const col = window.jevAnts.game.colonies[best.k];
        trail.push({ layer: col.layer[best.i], alive: col.alive[best.i], view: window.jevAnts.view(), cam: window.jevAnts.camera("above"), x: col.x[best.i], y: col.y[best.i] });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return best;
    }, tries);
    if (!picked) continue;
    carried = await until(
      () =>
        page.evaluate(() => {
          const t = window.__trail;
          if (t.some((f) => !f.alive)) return "dead";
          const up = t.findIndex((f) => f.layer === 0);
          if (up < 0) return null;
          // Seen from below before it came up (else the view came up some other way: an ant given up before, try again).
          // (a dozen frames, so the field had taken the follow: an ant that comes up before it has is no crossing it saw).
          if (t.slice(0, up).filter((f) => f.layer === 1 && f.view === "below").length < 12) return "retry";
          // On the ant: where the camera centred on it is (clamped at the plane's edges), give or take a frame's step
          // (this loop may run before the page draws in a frame).
          const onAnt = (f) => {
            const e = window.__clampCam("above", f.x, f.y, f.cam.zoom);
            return Math.abs(f.cam.x - e.x) <= 1.5 && Math.abs(f.cam.y - e.y) <= 1.5;
          };
          const on = t.slice(up).find((f) => f.layer === 0 && f.view === "above" && f.cam && onAnt(f));
          if (on) return { first: t[0], up: t[up], on, frames: t.length };
          // Up for 2 s and the view never on it: the carry failed (what the frames held, to say so).
          return t.length - up > 120 ? { stuck: t.slice(up, up + 4).concat(t.slice(-2)) } : null;
        }),
      "the followed ant's crossing",
      8000,
      50,
    ).catch(() => null);
    if (carried?.stuck) throw new Error(`the followed ant came up, but the view did not come with it: ${JSON.stringify(carried.stuck)}`);
    if (carried === "dead" || carried === "retry") carried = null;
  }
  await page.evaluate(() => (window.__trail = null));
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  check(carried !== null, "a followed ant went up through a hole, from the side view");
  check(true, `the view came above with it, the camera on the ant (${carried.on.cam.x.toFixed(1)}, ${carried.on.cam.y.toFixed(1)}) ~ (${carried.on.x.toFixed(1)}, ${carried.on.y.toFixed(1)}), zoom kept ×${carried.on.cam.zoom.toFixed(2)}`);

  // ——— 5. The queen's pen: a click on the top view ———
  console.log("5. the queen's pen");
  await page.getByRole("button", { name: "below", exact: true }).click(); // the pen must bring the top view back
  await until(async () => (await view()) === "below", "below");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const before = await page.evaluate(() => window.jevAnts.game.colonies.length);
  await page.evaluate(() => window.jevAnts.fly(0));
  const card = page.getByRole("region", { name: "The queen's pen" });
  await card.waitFor({ timeout: 5000 });
  check(/Click where she flies \(within 140 of Ink's hole\)/.test(await card.innerText()), "the pen says where to click");
  await until(async () => (await view()) === "above", "the pen shows the top view", 3000);
  check((await page.getByRole("button", { name: "Play", exact: true }).count()) === 1, "the game waits for her");
  await sleep(300);
  const circle = await page.evaluate(() => {
    const m = window.jevAnts.game.colonies[0];
    const h = m.holeCells[m.params.nest];
    return { x: h.px + 0.5 + 0.5 * (h.py & 1), y: (h.py + 0.5) * (Math.sqrt(3) / 2) };
  });
  const penCam = await cam("above");
  check((await page.getByRole("button", { name: "Stop following" }).count()) === 0, "the pen ends a follow");
  const penAt = await expectCam(page, "above", circle.x, circle.y, penCam.zoom);
  check(sameCam(penCam, penAt), `the top view looks at her flight's circle round Ink's hole (${penCam.x.toFixed(1)}, ${penCam.y.toFixed(1)} ×${penCam.zoom.toFixed(2)}; expected ${penAt.x.toFixed(1)}, ${penAt.y.toFixed(1)})`);
  // A point inside her flight where she would settle (Game.settleAt), and one outside it; both on screen.
  const pts = await page.evaluate(() => {
    const { game } = window.jevAnts;
    const m = game.colonies[0];
    const h = m.holeCells[m.params.nest];
    const R = Math.sqrt(3) / 2;
    const cx = h.px + 0.5 + 0.5 * (h.py & 1);
    const cy = (h.py + 0.5) * R;
    const c = window.jevAnts.camera("above");
    const cv = document.querySelector("canvas");
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const screen = (wx, wy) => ({ sx: r.left + ((wx - c.x) * c.zoom + cv.width / 2) / k, sy: r.top + ((wy - c.y) * c.zoom + cv.height / 2) / k });
    const onScreen = ({ sx, sy }) => sx > r.left + 30 && sx < r.right - 30 && sy > r.top + 50 && sy < r.bottom - 30;
    let inside = null;
    let outside = null;
    for (let a = 0; a < 2 * Math.PI && !(inside && outside); a += Math.PI / 12) {
      const pi = { x: cx + 110 * Math.cos(a), y: cy + 110 * Math.sin(a) };
      const si = screen(pi.x, pi.y);
      if (!inside && onScreen(si)) {
        const s = game.settleAt(pi);
        if (s.ok) inside = { ...pi, ...si, cell: s.cell, end: s.end };
      }
      const po = { x: cx + 165 * Math.cos(a), y: cy + 165 * Math.sin(a) };
      const so = screen(po.x, po.y);
      if (!outside && onScreen(so)) outside = { ...po, ...so };
    }
    return { inside, outside };
  });
  check(pts.inside !== null && pts.outside !== null, "a spot inside her flight where she would settle, and one outside it, on screen");
  await page.mouse.move(pts.inside.sx, pts.inside.sy);
  await sleep(400);
  await shot("pen");
  await page.mouse.click(pts.outside.sx, pts.outside.sy);
  await page.getByText("She can't fly that far").first().waitFor({ timeout: 3000 });
  check((await page.evaluate(() => window.jevAnts.game.colonies.length)) === before, "a click outside her flight is refused, and founds nothing");
  await page.mouse.move(pts.outside.sx, pts.outside.sy);
  await sleep(300);
  await shot("pen-outside");
  await page.mouse.click(pts.inside.sx, pts.inside.sy);
  await until(() => page.evaluate((n) => window.jevAnts.game.colonies.length > n, before), "her colony", 3000);
  const founded = await page.evaluate(() => {
    const g = window.jevAnts.game;
    return g.founded[g.founded.length - 1].spot;
  });
  check(founded.cell.x === pts.inside.cell.x && founded.cell.y === pts.inside.cell.y && founded.end === pts.inside.end, `a click inside founds her colony where the preview said (${founded.cell.x}, ${founded.cell.y}, ${founded.end})`);
  await page.getByText("is founded, on your words").first().waitFor({ timeout: 3000 });
  check((await card.count()) === 0, "the pen is closed");
  check((await page.getByRole("button", { name: "Pause", exact: true }).count()) === 1, "the game plays on");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
  console.log(`e2e-one-world: all passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await stop();
  process.exit(0);
} catch (e) {
  console.error(`e2e-one-world: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${e instanceof Error ? e.message : e}${errors.length ? `\npage errors: ${errors.join("\n")}` : ""}`);
  await stop();
  process.exit(1);
}
