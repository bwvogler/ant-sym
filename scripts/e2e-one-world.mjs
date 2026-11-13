#!/usr/bin/env node
// The one-world page's guard (docs/one-world.md §6, U5.2): Chromium drives the page through the views linked. By hand,
// like the bench: `npm run e2e` (not part of `npm test`, which has no browser). It uses the `playwright` already on the
// machine (no install, no dependency) and starts the dev server on a free port with no Jev key, so it spends nothing.
//
// Usage: npm run e2e   (E2E_SHOTS=<dir> saves screenshots; no other options)
//
//  1. a one-world game, seed fixed (Start: the page plays one world only): it opens above;
//  2. above, below, above mid-game: each view keeps its own camera;
//  3. a click on the line above shows below at that column; a click on the strip below shows above at P(s);
//  4. an ant followed through a hole carries the camera across: the view switches and centres on it (the ant is the one a
//     rehearsal on a copy of the game, through the dev hook, says comes up next: no waiting on chance);
//  5. the queen's pen: a flight forced by the dev hook (fly) opens it above; a click on the view below founds nothing; a
//     click outside her flight is refused, and a click inside founds her colony where the preview (Game.settleAt) said;
//     "Let her fly", by the keyboard, sends the next one on her own flight; and with the hook's flight gone, a queen who
//     flies while Jev can't read words opens no pen.
//  6. the Fungus panel's tooltips (ui/Tip.tsx): a hover opens one, Escape closes it, Tab onto a next-level button opens that button's,
//     and on a touch page a tap opens one, a second tap or a tap elsewhere closes it.
//  7. the first game's tutorial (ja-7x4, PRD §61), in a fresh browser: Start runs it, paused at 1× on the landing; the first
//     host pauses the game and is followed, and its card hides to a strip and comes back; the watch runs at 4×, Faster at 8×;
//     Skip ends it at 4×, playing; a reload offers plain Start.
//  8. the desert ant (ja-rf5): chosen on the start screen, which then offers plain Start (no tutorial: it is the generic ant's); its
//     game is the desert ant's, plays 20 s of game time at 4× and lays no food or home trail on the plane; a reload still offers
//     the generic ant's tutorial. Its field guide leaves out the trail entries (ja-rf5.11).
// Steps 1–6 start without the tutorial (each context is a fresh browser, where Start would run it).
// No fixed waits before a camera is read: each is polled until it holds still or is where it should be.
// Screenshots (deviceScaleFactor 1) go to E2E_SHOTS (a directory) when set: the linked switch and the pen's preview.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { helpAndExit } from "./lib/usage.mjs";
helpAndExit(import.meta.url);

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "e2e-one-world: can't resolve 'playwright'. This guard uses a copy already installed on the machine (on NODE_PATH or in a parent node_modules); install it there, it is not a dependency of this repo.",
  );
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
  return {
    x: hw * 2 >= W ? m.x0 + W / 2 : Math.max(m.x0 + hw, Math.min(m.x0 + W - hw, tx)),
    y: hh * 2 >= H ? H / 2 : Math.max(hh, Math.min(H - hh, ty)),
    zoom: z,
  };
}
const expectCam = (page, layer, tx, ty, zoom) =>
  page.evaluate(([layer, tx, ty, zoom]) => window.__clampCam(layer, tx, ty, zoom), [layer, tx, ty, zoom]);
const sameCam = (a, b) => near(a.x, b.x, 1e-6) && near(a.y, b.y, 1e-6) && near(a.zoom, b.zoom, 1e-6);

// The dev server: Vite on a free port, the Jev key left out of its environment (no run can start, nothing is spent).
const port = await freePort();
const env = { ...process.env };
delete env.JEV_API_KEY;
const vite = spawn(
  process.execPath,
  [join(WEB, "node_modules/vite/bin/vite.js"), "--port", String(port), "--host", "127.0.0.1", "--strictPort"],
  { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"] },
);
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
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
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
  // The seed chooses the colony the fungus lands by (PRD §65): seed 3 of two colonies lands by the second, Amber.
  check(
    /hole of the Amber colony/.test((await page.getByRole("dialog", { name: "Start" }).textContent()) ?? ""),
    "the start screen names the seed's colony (Amber)",
  );
  await page.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => page.evaluate(() => !!window.jevAnts?.game.world && window.jevAnts.game.landed !== null), "the one-world game, landed");
  check((await page.evaluate(() => window.jevAnts.game.landed.colony)) === 1, "and the fungus lands there");
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
  };
  // No fixed waits before a camera is read: the field's box takes the view's shape a frame or two after a switch, and
  // the camera is clamped to it as it is drawn. A camera is read once it has held still (and the canvas with it) for a
  // few polls, or once it is where it should be, worked out afresh from the canvas each poll.
  /** View v's camera once it and the canvas have held still for three polls. */
  const steadyCam = async (v) => {
    let last = "";
    let same = 0;
    return until(
      async () => {
        const now = await page.evaluate((v) => {
          const cv = document.querySelector("canvas");
          return { cam: window.jevAnts.camera(v), w: cv.width, h: cv.height };
        }, v);
        const key = JSON.stringify(now);
        same = key === last ? same + 1 : 0;
        last = key;
        return same >= 2 && now.cam ? now.cam : null;
      },
      `the ${v} camera to hold still`,
      5000,
      60,
    );
  };
  /** Poll until view v's camera is where `expected()` says (worked out afresh each poll), or fail saying where it was. */
  const camAt = async (v, expected, what) => {
    let got = null;
    let want = null;
    const ok = await until(
      async () => {
        want = await expected();
        got = await cam(v);
        return got && sameCam(got, want);
      },
      what,
      5000,
      60,
    ).catch(() => false);
    const f = (c) => (c ? `${c.x.toFixed(1)}, ${c.y.toFixed(1)} ×${c.zoom.toFixed(2)}` : "none");
    check(ok, `${what} (${f(got)}${ok ? "" : `; expected ${f(want)}`})`);
    return got;
  };
  /** Poll until the field's label (its aria-label) says `re`. */
  const labelSays = (re, what) =>
    until(async () => re.test((await canvas.getAttribute("aria-label")) ?? ""), what, 3000).then(() => check(true, what));
  await keys("Equal", "Equal", "Equal", "ArrowLeft", "ArrowUp");
  const above = await steadyCam("above");
  await page.getByRole("button", { name: "below", exact: true }).click();
  await until(async () => (await view()) === "below", "below");
  await labelSays(/click the ground strip/, "the field's label is the side view's");
  await steadyCam("below");
  await keys("Equal", "Equal", "Equal", "Equal", "ArrowRight", "ArrowDown", "ArrowDown");
  const below = await steadyCam("below");
  check(below.x !== above.x || below.zoom !== above.zoom, "below has a camera of its own");
  await page.getByRole("button", { name: "above", exact: true }).click();
  await until(async () => (await view()) === "above", "above again");
  await camAt("above", () => above, "above kept its camera");
  await page.keyboard.press("v");
  await until(async () => (await view()) === "below", "below by the key v");
  await camAt("below", () => below, "below kept its camera");
  await page.getByRole("button", { name: "above", exact: true }).click();
  await until(async () => (await view()) === "above", "above");

  // ——— 3. Linked clicks ———
  console.log("3. linked clicks");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await keys("Digit0"); // the whole plane: the line in view
  const whole = await steadyCam("above");
  // Zoomed in on the middle of the line (a wheel there), so a spot on it clear of the ants' pick reach is easy to find.
  const mid = await page.evaluate((c) => {
    const line = window.jevAnts.game.world.line;
    const cv = document.querySelector("canvas");
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const i = Math.round((line.sHole[0] + line.sHole[1]) / 2) - line.sMin;
    const cx = line.cells[2 * i];
    const cy = line.cells[2 * i + 1];
    const wx = cx + 0.5 + 0.5 * (cy & 1);
    const wy = (cy + 0.5) * (Math.sqrt(3) / 2);
    return {
      sx: r.left + ((wx - c.x) * c.zoom + cv.width / 2) / k,
      sy: r.top + ((wy - c.y) * c.zoom + cv.height / 2) / k,
    };
  }, whole);
  await page.mouse.move(mid.sx, mid.sy);
  await page.mouse.wheel(0, -400);
  await page.mouse.wheel(0, -400);
  await steadyCam("above");
  // Where on screen (CSS px) world (x, y) of a view lies, and whether an ant of that layer is under it (a click would follow it).
  const spot = await page.evaluate(() => {
    const { game } = window.jevAnts;
    const w = game.world;
    const line = w.line;
    const c = window.jevAnts.camera("above");
    const cv = document.querySelector("canvas");
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const reach = (14 * 1.2 * k) / c.zoom; // the field's pick reach (14 CSS px), and a margin
    const R = Math.sqrt(3) / 2;
    const clear = (wx, wy, layer) => {
      let d = Infinity;
      for (const col of game.colonies)
        for (let i = 0; i < col.n; i++)
          if (col.alive[i] && col.layer[i] === layer) d = Math.min(d, Math.hypot(col.x[i] - wx, col.y[i] - wy));
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
  // Where the side view should look: the strip at s, clamped to the curtain in the box it is drawn in (camera.ts clamp).
  // The strip at s (centreX(s, STRIP): row 40 is even), at least the link's zoom (8 a cell at deviceScaleFactor 1).
  const atS = await camAt(
    "below",
    () => expectCam(page, "below", spot.s + 0.5, 40.5 * (Math.sqrt(3) / 2), Math.max(spot.zoom, 8)),
    `below centres on the strip at s = ${spot.s}`,
  );
  await steadyCam("below");
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
  await camAt(
    "above",
    () => expectCam(page, "above", up.x, up.y, atS.zoom),
    `above centres on P(${up.s}) (${up.x.toFixed(1)}, ${up.y.toFixed(1)}), at the side view's zoom`,
  );

  // ——— 4. An ant followed through a hole carries the camera across ———
  console.log("4. follow an ant through a hole");
  // No waiting on chance: with the page paused, the dev hook rehearses on a copy of the game which curtain ant comes up
  // next (no sooner than LEAD steps on) and on which fixed step (rehearse.ts: a save reloads bit-exact), steps the game
  // itself to LEAD steps before that, and the guard follows that ant from below while the page steps the game one fixed
  // step a frame: it must come up on the very step rehearsed.
  const LEAD = 20;
  await page.getByRole("button", { name: "below", exact: true }).click();
  await until(async () => (await view()) === "below", "below");
  check((await page.getByRole("button", { name: "Play", exact: true }).count()) === 1, "the game is paused");
  check(
    (await page.getByRole("button", { name: "Carry across" }).count()) === 0,
    "no Carry across toggle: a followed ant always carries the camera",
  );
  let next = null;
  for (let n = 0; n < 4 && !next; n++) {
    const r0 = Date.now();
    next = await page.evaluate((lead) => window.jevAnts.nextCrossing(20, lead), LEAD);
    console.log(
      `  ..  rehearsal ${n + 1}: ${next ? `colony ${next.k}'s ant ${next.i} comes up on step ${next.ticks}` : "none within 20 s"} (${Date.now() - r0} ms)`,
    );
    if (!next) await page.evaluate(() => window.jevAnts.step(300)); // ten seconds on, and again
  }
  check(next !== null, "a rehearsal found a curtain ant that comes up");
  const lead = LEAD; // the rehearsal's crossing is LEAD steps on at the least
  await page.evaluate((n) => window.jevAnts.step(n), next.ticks - lead);
  check(
    await page.evaluate(
      ({ k, i, gen }) =>
        window.jevAnts.game.colonies[k].gen[i] === gen && window.jevAnts.game.colonies[k].layer[i] === 1 && window.jevAnts.follow(k, i),
      next,
    ),
    "the ant, still below, is followed",
  );
  // Each frame the page records the ant, the view and the top view's camera; after fifteen frames seen from below (the
  // field has taken the follow) it steps the game one fixed step a frame, LEAD and forty more.
  await page.evaluate(
    ({ k, i, steps }) => {
      const trail = (window.__trail = []);
      let stepped = 0;
      const loop = () => {
        if (window.__trail !== trail) return;
        const col = window.jevAnts.game.colonies[k];
        trail.push({
          stepped,
          layer: col.layer[i],
          alive: col.alive[i],
          view: window.jevAnts.view(),
          cam: window.jevAnts.camera("above"),
          x: col.x[i],
          y: col.y[i],
        });
        if (trail.length > 15 && stepped < steps) {
          window.jevAnts.step(1);
          stepped++;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    { k: next.k, i: next.i, steps: lead + 40 },
  );
  const carried = await until(
    () =>
      page.evaluate(() => {
        const t = window.__trail;
        const up = t.findIndex((f) => f.layer === 0);
        if (up < 0) return t.length > 0 && t[t.length - 1].stepped >= 60 ? { never: true } : null;
        // On the ant: where the camera centred on it is (clamped at the plane's edges), give or take a frame's step.
        const onAnt = (f) => {
          const e = window.__clampCam("above", f.x, f.y, f.cam.zoom);
          return Math.abs(f.cam.x - e.x) <= 1.5 && Math.abs(f.cam.y - e.y) <= 1.5;
        };
        const on = t.slice(up).find((f) => f.layer === 0 && f.view === "above" && f.cam && onAnt(f));
        if (on)
          return {
            below: t.slice(0, up).filter((f) => f.layer === 1 && f.view === "below").length,
            up: t[up],
            on,
          };
        // Up for 2 s of frames and the view never on it: the carry failed.
        return t.length - up > 120 ? { stuck: t.slice(up, up + 4).concat(t.slice(-2)) } : null;
      }),
    "the followed ant's crossing",
    20_000,
    50,
  );
  await page.evaluate(() => (window.__trail = null));
  if (carried.never) throw new Error("the rehearsed ant never came up: the game did not play what its copy played");
  if (carried.stuck) throw new Error(`the followed ant came up, but the view did not come with it: ${JSON.stringify(carried.stuck)}`);
  check(
    carried.up.stepped === lead && carried.below >= 15,
    `the followed ant went up through a hole on the step rehearsed (${carried.up.stepped} of ${lead}), seen from below`,
  );
  check(
    true,
    `the view came above with it, the camera on the ant (${carried.on.cam.x.toFixed(1)}, ${carried.on.cam.y.toFixed(1)}) ~ (${carried.on.x.toFixed(1)}, ${carried.on.y.toFixed(1)}), zoom kept ×${carried.on.cam.zoom.toFixed(2)}`,
  );

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
  const circle = await page.evaluate(() => {
    const m = window.jevAnts.game.colonies[0];
    const h = m.holeCells[m.params.nest];
    return {
      x: h.px + 0.5 + 0.5 * (h.py & 1),
      y: (h.py + 0.5) * (Math.sqrt(3) / 2),
    };
  });
  check((await page.getByRole("button", { name: "Stop following" }).count()) === 0, "the pen ends a follow");
  // The circle's centre, clamped to the plane in the box as it is now (at the zoom the pen chose to fit the circle).
  await camAt(
    "above",
    async () => expectCam(page, "above", circle.x, circle.y, (await cam("above")).zoom),
    "the top view looks at her flight's circle round Ink's hole",
  );

  // The pen takes clicks on the top view only: a click below, while it is open, founds nothing and refuses nothing.
  await page.getByRole("button", { name: "below", exact: true }).click();
  await until(async () => (await view()) === "below", "below, with the pen open");
  await steadyCam("below");
  const deep = await page.evaluate(() => {
    const { game } = window.jevAnts;
    const c = window.jevAnts.camera("below");
    const cv = document.querySelector("canvas");
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const R = Math.sqrt(3) / 2;
    let best = null;
    for (let sy = r.top + 60; sy < r.bottom - 30; sy += 12)
      for (let sx = r.left + 30; sx < r.right - 200; sx += 12) {
        const wx = c.x + ((sx - r.left) * k - cv.width / 2) / c.zoom;
        const wy = c.y + ((sy - r.top) * k - cv.height / 2) / c.zoom;
        if (wy < (41 + 6) * R) continue; // underground, well below the strip (a click on the strip or the sky links)
        let d = Infinity;
        for (const col of game.colonies)
          for (let i = 0; i < col.n; i++) if (col.alive[i] && col.layer[i] === 1) d = Math.min(d, Math.hypot(col.x[i] - wx, col.y[i] - wy));
        if (!best || d > best.d) best = { sx, sy, d };
      }
    return best;
  });
  check(deep !== null, "a spot underground, clear of ants");
  await page.mouse.click(deep.sx, deep.sy);
  await sleep(600); // nothing should happen: give it time to
  check(
    (await page.evaluate(() => window.jevAnts.game.colonies.length)) === before &&
      (await card.count()) === 1 &&
      (await page.getByText("She can't fly that far").count()) === 0,
    "a click on the view below founds nothing while the pen is open",
  );
  await page.getByRole("button", { name: "above", exact: true }).click();
  await until(async () => (await view()) === "above", "above again, with the pen open");
  await steadyCam("above");
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
    const screen = (wx, wy) => ({
      sx: r.left + ((wx - c.x) * c.zoom + cv.width / 2) / k,
      sy: r.top + ((wy - c.y) * c.zoom + cv.height / 2) / k,
    });
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
  check(
    (await page.evaluate(() => window.jevAnts.game.colonies.length)) === before,
    "a click outside her flight is refused, and founds nothing",
  );
  await page.mouse.move(pts.outside.sx, pts.outside.sy);
  await sleep(300);
  await shot("pen-outside");
  await page.mouse.click(pts.inside.sx, pts.inside.sy);
  await until(() => page.evaluate((n) => window.jevAnts.game.colonies.length > n, before), "her colony", 3000);
  const founded = await page.evaluate(() => {
    const g = window.jevAnts.game;
    return g.founded[g.founded.length - 1].spot;
  });
  check(
    founded.cell.x === pts.inside.cell.x && founded.cell.y === pts.inside.cell.y && founded.end === pts.inside.end,
    `a click inside founds her colony where the preview said (${founded.cell.x}, ${founded.cell.y}, ${founded.end})`,
  );
  await page.getByText("is founded, on your words").first().waitFor({ timeout: 3000 });
  check((await card.count()) === 0, "the pen is closed");
  check((await page.getByRole("button", { name: "Pause", exact: true }).count()) === 1, "the game plays on");

  // "Let her fly", by the keyboard alone: her own flight (Game.landing), on the pen's words.
  const before2 = await page.evaluate(() => window.jevAnts.game.colonies.length);
  await page.evaluate(() => window.jevAnts.fly(0));
  await card.waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Let her fly" }).focus();
  await page.keyboard.press("Enter");
  const flew = await until(
    () =>
      page.evaluate((n) => {
        if (window.jevAnts.game.colonies.length > n) return "founded";
        return /was lost/.test(document.querySelector("[role=status]")?.textContent ?? "") ? "lost" : null;
      }, before2),
    "her own flight",
    3000,
  );
  check(
    (await card.count()) === 0 && (await page.getByRole("button", { name: "Pause", exact: true }).count()) === 1,
    `"Let her fly" by the keyboard sends her on her own flight (${flew}), and the game plays on`,
  );

  // The dev hook's pen was for its flight alone: a queen flown now, with Jev unable to read words, opens no pen.
  await page.evaluate(() => {
    const g = window.jevAnts.game;
    const m = g.colonies[0];
    g.revealed[0] = true;
    g.flights.push({
      mother: 0,
      x: m.nest.x,
      y: m.nest.y,
      load: 1,
      strain: g.fungus.evolution?.strain ?? 0,
      at: g.time,
      food: 24,
    });
  });
  await until(
    () =>
      page.evaluate(
        () =>
          /can't read new words now|was lost/.test(document.querySelector("[role=status]")?.textContent ?? "") &&
          window.jevAnts.game.flights.length === 0,
      ),
    "her founding on her mother's words",
    5000,
  );
  check((await card.count()) === 0, "without the dev hook's fly, the pen stays shut while Jev can't read words");

  // ——— 6. The Fungus panel's tooltips: a mouse hovers, a keyboard tabs, a finger taps (ui/Tip.tsx) ———
  console.log("6. the Fungus panel's tooltips");
  const tips = (p) => p.getByRole("tooltip").count();
  const firstUpgrade = (p) => p.getByLabel("upgrades").locator("li").first();
  const nameOf = (p) => firstUpgrade(p).locator("[tabindex='0']").first();
  await nameOf(page).hover();
  await until(async () => (await tips(page)) === 1, "a hover opens an upgrade's tooltip", 3000, 50);
  await page.keyboard.press("Escape");
  check((await tips(page)) === 0, "Escape closes a tooltip");
  await page.mouse.move(2, 2);
  // Give the fungus mutations to keep (a disabled button takes no focus), and wait for the panel to show them.
  await page.evaluate(() => {
    const e = window.jevAnts.game.fungus.evolution;
    if (e) e.growth += 100;
  });
  const buy = firstUpgrade(page).getByRole("button");
  await until(() => buy.isEnabled(), "the next-level button, once mutations are to keep", 5000, 100);
  await nameOf(page).focus();
  await page.keyboard.press("Tab"); // from the name onto its next-level button: a keyboard focus opens that button's tooltip
  await until(async () => (await tips(page)) === 1, "Tab onto the next-level button opens its tooltip", 3000, 50);
  check(
    /^Infectivity: fair for \d+ mutations?/.test(await page.getByRole("tooltip").innerText()),
    "the next-level tooltip (not the name's) says what it costs",
  );
  await page.keyboard.press("Escape");
  check((await tips(page)) === 0, "Escape closes it");
  // A finger: a tap opens, a second tap or a tap elsewhere closes, and a tap inside the bubble leaves it open.
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const tpage = await touch.newPage();
  tpage.on("pageerror", (e) => errors.push(String(e)));
  await tpage.goto(url);
  await tpage.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(
    () => tpage.evaluate(() => !!window.jevAnts?.game.world && window.jevAnts.game.landed !== null),
    "the touch page's game, landed",
  );
  const tname = nameOf(tpage);
  await tname.tap();
  await until(async () => (await tips(tpage)) === 1, "a tap opens an upgrade's tooltip", 3000, 50);
  await tname.tap();
  await until(async () => (await tips(tpage)) === 0, "a second tap closes it", 3000, 50);
  await tname.tap();
  await until(async () => (await tips(tpage)) === 1, "a tap opens it again", 3000, 50);
  await tpage.touchscreen.tap(20, 20);
  await until(async () => (await tips(tpage)) === 0, "a tap elsewhere closes it", 3000, 50);
  await touch.close();

  // ——— 7. The first game's tutorial ———
  console.log("7. the tutorial");
  const tctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const tu = await tctx.newPage();
  await tu.addInitScript(`window.__clampCam = ${clampCam.toString()};`);
  tu.on("pageerror", (e) => errors.push(String(e)));
  await tu.goto(url);
  await tu.getByLabel("world seed").fill(String(SEED));
  await tu.getByRole("button", { name: "Start the tutorial", exact: true }).click();
  const tcard = tu.getByRole("dialog", { name: "tutorial" });
  const bar = (name) => tu.getByRole("group", { name: "speed" }).getByRole("button", { name, exact: true });
  const paused = async () => (await tu.getByRole("button", { name: "Play", exact: true }).count()) === 1;
  await until(async () => /You are a fungus/.test((await tcard.textContent()) ?? ""), "the tutorial's first card");
  check(await paused(), "the landing card waits, paused");
  // What the field shows of scent is what hosts sensed (PRD §65): before any host, nothing, even at the landing.
  check(
    (await tu.evaluate(() => window.jevAnts.sensed("above", window.jevAnts.game.landed.x, window.jevAnts.game.landed.y))) === 0,
    "before any host, no scent shows at the landing",
  );
  check((await bar("1×").getAttribute("aria-pressed")) === "true", "at 1×");
  await tcard.getByRole("button", { name: "Let it play", exact: true }).click();
  await until(async () => /carries you/.test((await tcard.textContent()) ?? ""), "the first host", 60_000);
  check(await paused(), "the first host pauses the game");
  check((await tu.getByRole("region", { name: "followed ant" }).count()) === 1, "and is followed");
  check((await tu.evaluate(() => document.documentElement.dataset.tutorial)) === "load", "its card is highlighted");
  const hostNo = Number(((await tu.getByRole("region", { name: "followed ant" }).textContent()) ?? "").match(/Ant #(\d+)/)?.[1] ?? -1);
  const hostSensed = await tu.evaluate((i) => {
    const g = window.jevAnts.game;
    const c = g.colonies[g.landed.colony];
    return window.jevAnts.sensed(c.layer[i] === 0 ? "above" : "below", c.x[i], c.y[i]);
  }, hostNo);
  check(hostSensed > 0.9, `around the first host, its scent shows (${hostSensed.toFixed(2)})`);
  // Hide: the card shrinks to a strip so the map shows (on a phone the card covers most of it); the step's button still
  // works from the strip, and the next step opens a full card again.
  const cardHeight = async () => (await tcard.boundingBox())?.height ?? 0;
  const full = await cardHeight();
  await tcard.getByRole("button", { name: "Hide the tutorial card" }).click();
  const strip = await cardHeight();
  check(
    (await tcard.getByText("You never steer it").count()) === 0 && strip < full / 2,
    `Hide shrinks the card to a strip (${full} → ${strip} px)`,
  );
  await tcard.getByRole("button", { name: "Show the tutorial card" }).click();
  check((await tcard.getByText("You never steer it").count()) === 1, "Show brings the card back");
  await tcard.getByRole("button", { name: "Hide the tutorial card" }).click();
  await tcard.getByRole("button", { name: "Follow it", exact: true }).click(); // the step's button, from the strip
  await until(async () => /groom it/.test((await tcard.textContent()) ?? ""), "the watch card");
  check((await tcard.getByText("Ants lick each other clean").count()) === 1, "the next step shows its card in full again");
  await sleep(300);
  check(
    (await tu.getByRole("region", { name: "followed ant" }).count()) === 1,
    "Follow it keeps the host followed (centring the view shown no longer drops it)",
  );
  // The field follows it too, not only the card: the camera of the view showing it sits on the host, or as near as the
  // map's edge lets it (camera.ts clamp: a host by a hole at the edge, as Amber's on seed 3), on any seed (PR #93 review N1).
  const off = await tu.evaluate((i) => {
    const g = window.jevAnts.game;
    const c = g.colonies[g.landed.colony];
    const v = window.jevAnts.view();
    if ((c.layer[i] === 0) !== (v === "above")) return null;
    const cam = window.jevAnts.camera(v);
    if (!cam) return null;
    const e = window.__clampCam(v, c.x[i], c.y[i], cam.zoom);
    return Math.hypot(cam.x - e.x, cam.y - e.y);
  }, hostNo);
  check(
    off !== null && off < 1,
    `the camera sits on the host, as near as the map's edge allows (${off === null ? "not in view" : off.toFixed(2)} away)`,
  );
  check(!(await paused()), "watching, the game plays");
  check((await bar("4×").getAttribute("aria-pressed")) === "true", "the watch runs at 4×");
  await tcard.getByRole("button", { name: "Faster", exact: true }).click();
  await until(async () => (await bar("8×").getAttribute("aria-pressed")) === "true", "Faster runs at 8×");
  // Most first hosts go below before they are clean (17 of 20 seeds, PRD §61.2): the camera goes with it.
  const wentBelow = await until(
    () =>
      tu.evaluate(
        (i) =>
          window.jevAnts.game.colonies[window.jevAnts.game.landed.colony].layer[i] !== 0 ||
          !/groom it/.test(document.querySelector('[aria-label="tutorial"]')?.textContent ?? ""),
        hostNo,
      ),
    "the host below, or the watch over",
    40_000,
    100,
  ).then(() => tu.evaluate((i) => window.jevAnts.game.colonies[window.jevAnts.game.landed.colony].layer[i] !== 0, hostNo));
  if (wentBelow) {
    await until(async () => (await tu.evaluate(() => window.jevAnts.view())) === "below", "the view follows the host below", 3000, 50);
    check(true, "the host went below, and the view followed it");
  } else console.log("  --  the host did not go below before the watch ended: the view-follows-below check was not exercised");
  await tcard.getByRole("button", { name: "Skip tutorial", exact: true }).click();
  await until(async () => (await tcard.count()) === 0, "Skip ends the tutorial");
  check(!(await paused()) && (await bar("4×").getAttribute("aria-pressed")) === "true", "playing at 4× after Skip");
  await tu.reload();
  await until(async () => (await tu.getByRole("button", { name: "Start", exact: true }).count()) === 1, "after a reload, plain Start");
  await tctx.close();

  // ——— 8. The desert ant (ja-rf5) ———
  console.log("8. the desert ant");
  const dctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const dp = await dctx.newPage();
  dp.on("pageerror", (e) => errors.push(String(e)));
  await dp.goto(url);
  await dp.getByRole("combobox", { name: "species" }).selectOption("desert");
  check(
    (await dp.getByRole("button", { name: "Start without the tutorial", exact: true }).count()) === 0,
    "no tutorial for the desert ant",
  );
  await dp.getByRole("button", { name: "Start", exact: true }).click();
  await until(
    () => dp.evaluate(() => window.jevAnts?.game.params.species.id === "desert" && window.jevAnts.game.landed !== null),
    "a desert game, landed",
  );
  await until(() => dp.evaluate(() => (window.jevAnts?.game.time ?? 0) > 20), "it plays 20 s of game time", 30_000, 250);
  check(
    await dp.evaluate(() => window.jevAnts.game.colonies.every((c) => !c.layers[0].ph.live("food") && !c.layers[0].ph.live("home"))),
    "no food or home trail on the plane",
  );
  await dp.getByRole("button", { name: "Learn", exact: true }).click();
  const learn = dp.getByRole("dialog", { name: "Learn" });
  await learn.getByRole("heading", { name: "Strangers and battles" }).waitFor({ timeout: 5_000 });
  check(
    (await learn.getByRole("heading", { name: "Food trail", exact: true }).count()) === 0 &&
      (await learn.getByText("lays no trails of some kinds").count()) === 1,
    "the field guide leaves out the trail entries, and says so",
  );
  await dp.reload();
  await dp
    .getByRole("button", { name: "Start the tutorial", exact: true })
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  check(
    (await dp.getByRole("button", { name: "Start the tutorial", exact: true }).count()) === 1,
    "a desert game leaves the generic ant's tutorial unplayed",
  );
  await dctx.close();
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
  console.log(`e2e-one-world: all passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await stop();
  process.exit(0);
} catch (e) {
  console.error(
    `e2e-one-world: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${e instanceof Error ? e.message : e}${errors.length ? `\npage errors: ${errors.join("\n")}` : ""}`,
  );
  await stop();
  process.exit(1);
}
