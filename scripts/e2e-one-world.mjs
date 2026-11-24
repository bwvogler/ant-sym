#!/usr/bin/env node
// The one-world page's guard (docs/one-world.md §6, U5.2): Chromium drives the page through the views linked. By hand,
// like the bench: `npm run e2e` (not part of `npm test`, which has no browser). It uses the `playwright` already on the
// machine (no install, no dependency) and starts the dev server on a free port with no Jev key, so it spends nothing.
//
// Usage: npm run e2e   (E2E_SHOTS=<dir> saves screenshots, E2E_TRACE=<dir> Playwright traces; no other options)
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
//  6. the Mutations drawer's tooltips (ui/Tip.tsx): a hover opens one, Escape closes it, Tab onto a next-level button opens that button's,
//     and on a touch page a tap opens one, a second tap or a tap elsewhere closes it.
//  7. the first game's tutorial (ja-7x4, PRD §61), in a fresh browser: Start runs it, paused at 1× on the landing; the first
//     host pauses the game and is followed, and its card hides to a strip and comes back; the watch runs at 4×, Faster at 8×;
//     Skip ends it at 4×, playing; a reload offers plain Start.
//  8. the desert ant (ja-rf5): chosen on the start screen, which then offers plain Start (no tutorial: it is the generic ant's); its
//     game is the desert ant's, plays 20 s of game time at 4× and lays no food or home trail on the plane; a reload still offers
//     the generic ant's tutorial. Its field guide leaves out the trail entries (ja-rf5.11).
//  9. the aim bar's keys (PRD §69.2), on a page told a key is set (every other API call left unanswered: nothing spent):
//     Shift+Enter a new line, Enter commits, Escape lets go.
//  10. the palette, the keys, the shortcuts sheet and the lens (PRD §69.3): Ctrl+K, the speeds and Space, ?, Escape one thing
//     at a time, the lens over a hole, pinned, on the other view, and the lens button on a 360 px phone.
//  11. the builder (ja-kjj8.3), at 390 and 768 px: the tray in the tab bar's place, buttons >= 64 px, sugar by a tap, a
//     rock wall and a crayon line by drags, one undo for a drag, a no-entry sign, an ant carried by the tweezers, Move pans,
//     dig below, Done; saved, reloaded, the wall kept.
//  12. the Codex (ja-mvo9.3), paused at the landing: a first host opens Jobs by age with one notice and a badge; the new
//     mark, Read it anyway, Show every entry, the palette, a reload, starting afresh.
//  13. specimens (PRD §69.5), paused: pin from the ant panel, follow from the list (the camera to its view), unpin (focus
//     to the header), a fourth replaces the oldest and takes its number, a fifth's notice names the kept number it frees, a
//     specimen that dies leaves with a notice and the rest keep theirs, the list stays with nothing followed and folds to one
//     line; a new game has none; on a 390 px phone the list folds once nothing is followed.
//  14. notices (PRD §69.6), at 390 px by real touch: the bell at the top right; a small drag slides a toast back, a swipe
//     takes it away, a hold outlives its time; the bell counts it, lists it, clears the count, hides the field's toasts;
//     Escape closes the list and not a drawer under it; a tap outside closes it; while building, toasts sit above the tray.
//  15. Lab mode (PRD §69.7): l opens it under the map, which shares the screen; the history's charts, their crosshair (by
//     pointer and by arrow keys) and table; a notice above it; the step control a tick and a second at a time while
//     paused (off while playing); each tab; the aim's "?" opens the Policy tab at its section (§69.8), and the Codex
//     keeps only the guide and the nest; l closes it.
//  16. Polish (PRD §69.9): Appearance (set, kept across a reload, the palette, System clears it), a drawer's motion and its
//     absence under reduced motion, and on a phone an open sheet not covered by a notice (it waits in the bell).
// Steps 1–6 start without the tutorial (each context is a fresh browser, where Start would run it).
// No fixed waits before a camera is read: each is polled until it holds still or is where it should be.
// Screenshots (deviceScaleFactor 1) go to E2E_SHOTS (a directory) when set: the linked switch and the pen's preview.
// On a failure every open page is shot (to E2E_SHOTS, or a temp folder the failure names), and with E2E_TRACE set each open
// context's Playwright trace is saved there (`npx playwright show-trace <file>`). In GitHub Actions the failure is also one
// ::error line naming the step and the last check that passed (.github/workflows/e2e.yml, ja-w7ef.8).

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
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
const TRACE = process.env.E2E_TRACE ?? null;
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

/**
 * Waits until no notice is on the page. A running game raises its own ("New in the field guide: ...", the sugar found), each
 * for 7 s, and the field keeps only the last three: a check that raises notices of its own must pause the game and let those
 * go first, or they push its own out (ja-cila: steps 14 and 17 failed on slow runners, the trace showing the test's notice
 * gone from the field under two of the game's).
 */
const noNotices = async (page, what) => {
  const none = () => page.evaluate(() => document.querySelectorAll('[role="status"] button').length === 0);
  // Empty twice, 700 ms apart: a cue the game raises in the moments after a pause (its stats refresh 150 ms after, the field-guide
  // check runs every 500 ms) has had time to land before the first notice of the check does (ja-7jvz).
  await until(
    async () => {
      if (!(await none())) return false;
      await sleep(700);
      return none();
    },
    what,
    15_000,
    100,
  );
};

/** The step running and the last check that passed: named with a failure. */
let step = "starting";
let lastOk = null;
function section(name) {
  step = name;
  console.log(name);
}

function check(ok, what) {
  if (!ok) throw new Error(what);
  lastOk = what;
  console.log(`  ok  ${what}`);
}

const near = (a, b, eps) => Math.abs(a - b) <= eps;

/** Whether screen point (sx, sy) is open map: the canvas, not the HUD, the rail, a drawer or the inspector over it (PRD §69). */
function onField(sx, sy) {
  return document.elementFromPoint(sx, sy) === document.querySelector("canvas");
}

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

/** A screenshot of every page still open, and with E2E_TRACE each open context's trace: where a failure left the game. */
async function saveFailure() {
  if (!browser) return;
  const dir = SHOTS ?? join(tmpdir(), `e2e-one-world-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  for (const [i, c] of browser.contexts().entries()) {
    for (const [j, p] of c.pages().entries()) {
      const path = join(dir, `failed-${i + 1}-${j + 1}.png`);
      await p.screenshot({ path, timeout: 5000 }).then(
        () => console.error(`  saved ${path} (${p.url()})`),
        (err) => console.error(`  no screenshot of ${p.url()}: ${err}`),
      );
    }
    if (TRACE) {
      mkdirSync(TRACE, { recursive: true });
      const path = join(TRACE, `failed-${i + 1}.zip`);
      await c.tracing.stop({ path }).then(
        () => console.error(`  saved ${path}`),
        (err) => console.error(`  no trace of context ${i + 1}: ${err}`),
      );
    }
  }
}

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
  if (TRACE) {
    // Every context records a trace from its start; a failure saves those still open (the catch below).
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (options) => {
      const c = await newContext(options);
      await c.tracing.start({ screenshots: true, snapshots: true });
      return c;
    };
  }
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.addInitScript(`window.__clampCam = ${clampCam.toString()};`);
  await page.addInitScript(`window.__onField = ${onField.toString()};`);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `u52-${name}.png`) });
  };

  // ——— 1. A one-world game, seed fixed: it opens above ———
  section("1. a one-world game");
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
  check((await page.getByLabel("sun", { exact: true }).count()) === 0, "a generic game has no sun in the HUD (it has no day)");
  const canvas = page.locator("canvas").first();
  check(/click the line to look below/.test((await canvas.getAttribute("aria-label")) ?? ""), "the field's label is the top view's");
  await sleep(1500); // mid-game

  // ——— 2. Above, below, above: each view keeps its camera ———
  section("2. each view keeps its camera");
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
  section("3. linked clicks");
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
      if (sx < r.left + 30 || sx > r.right - 30 || sy < r.top + 50 || sy > r.bottom - 30 || !window.__onField(sx, sy)) continue;
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
      if (sx < r.left + 30 || sx > r.right - 30 || sy < r.top + 50 || sy > r.bottom - 30 || !window.__onField(sx, sy)) continue;
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
  section("4. follow an ant through a hole");
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
        // The view switch is a React update and can land a frame or two after the ant does (the full-screen page, PRD §69);
        // an ant that pops up for a single step and drops back is still carried if the top view came, centred where it
        // surfaced, within a few frames.
        const on =
          t.slice(up).find((f) => f.layer === 0 && f.view === "above" && f.cam && onAnt(f)) ??
          t.slice(up, up + 4).find((f) => f.view === "above" && f.cam && onAnt({ ...f, x: t[up].x, y: t[up].y }));
        if (on)
          return {
            below: t.slice(0, up).filter((f) => f.layer === 1 && f.view === "below").length,
            up: t[up],
            on,
            // where the camera was judged against: the ant then, or where it surfaced (a one-step pop-up)
            at: on.layer === 0 ? { x: on.x, y: on.y } : { x: t[up].x, y: t[up].y },
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
    `the view came above with it, the camera on the ant (${carried.on.cam.x.toFixed(1)}, ${carried.on.cam.y.toFixed(1)}) ~ (${carried.at.x.toFixed(1)}, ${carried.at.y.toFixed(1)}), zoom kept ×${carried.on.cam.zoom.toFixed(2)}`,
  );
  // Carrying the camera keeps the follow, even for an ant that pops up a hole and straight back (centreOn keepFollow).
  check(
    await page.evaluate(({ k, i }) => {
      const s = window.jevAnts.followed();
      return s !== null && s.k === k && s.i === i;
    }, next),
    "the ant is still followed after the crossing",
  );

  // ——— 5. The queen's pen: a click on the top view ———
  section("5. the queen's pen");
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
        if (!window.__onField(sx, sy)) continue;
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
    const onScreen = ({ sx, sy }) =>
      sx > r.left + 30 && sx < r.right - 30 && sy > r.top + 50 && sy < r.bottom - 30 && window.__onField(sx, sy);
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
  await sleep(300); // only for the screenshot to catch the preview following the mouse: no check depends on it
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

  // ——— 5b. The aim bar (PRD §69.2): on a wide screen the aim is a bar under the map, and only there ———
  section("5b. the aim bar");
  {
    const aims = page.getByRole("textbox", { name: "aim", exact: true });
    const shown = () => aims.evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length);
    check((await shown()) === 1, `one aim on screen at 1280 px (${await shown()})`);
    // The fungus drawer open: still only the bar's (the drawer's copy is for narrower screens), and the drawer says
    // why the aim is locked, the reason the bar keeps in its "locked" tooltip.
    const fungusTab = page.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "The fungus", exact: true });
    await fungusTab.click();
    await page.waitForTimeout(150);
    check((await shown()) === 1, `one aim on screen at 1280 px with The fungus drawer open (${await shown()})`);
    const locked = await aims.evaluateAll((els) => els.some((e) => e.offsetParent !== null && e.disabled));
    if (locked) check(await page.getByText("The aim is locked:").isVisible(), "the drawer says why the aim is locked");
    await fungusTab.click();
    await page.waitForTimeout(150);
    const bar = await page
      .getByLabel("fungus aim")
      .filter({ has: page.getByRole("group", { name: "aim presets" }) })
      .boundingBox();
    const cv = await page.locator("canvas").first().boundingBox();
    check(bar !== null && cv !== null && bar.y + bar.height > cv.height - 70, "the aim bar sits along the map's bottom");
    // With an ant followed, the ant panel stops above the bar, the bar opened to four rows included (owner, review of
    // #189: D1 b): the bar keeps its full width and the panel scrolls.
    await page.evaluate(() => window.jevAnts.follow(0, 0) || window.jevAnts.follow(0, 1) || window.jevAnts.follow(0, 2));
    await page.getByRole("region", { name: "followed ant" }).waitFor();
    // Opened if it can be (a locked aim can't take focus: then the three rows it would add, 13 px at 1.375, are counted).
    if (!(await aims.evaluateAll((els) => els.some((e) => e.offsetParent !== null && e.disabled)))) await aims.first().focus();
    const gap = await page.evaluate(() => {
      const panel = document.querySelector('[aria-label="followed ant"]')?.closest(".overflow-y-auto");
      const bars = [...document.querySelectorAll('[aria-label="fungus aim"]')].filter((e) => e.offsetParent !== null);
      if (!panel || bars.length !== 1) return null;
      const b = bars[0].getBoundingClientRect();
      // Its max-height is relative to the stage (calc and %), so resolve it in px with a probe beside it.
      const probe = document.createElement("div");
      probe.style.cssText = `position:absolute;height:${getComputedStyle(panel).maxHeight}`;
      panel.parentElement.appendChild(probe);
      const longest = probe.getBoundingClientRect().height;
      probe.remove();
      return {
        panelBottom: Math.round(panel.getBoundingClientRect().top + longest) /* at its longest */,
        barTop: Math.round(b.top - (b.height < 60 ? 3 * 18 : 0)),
      };
    });
    check(gap !== null && gap.panelBottom < gap.barTop, `the ant panel, at its longest, stops above the aim bar (${JSON.stringify(gap)})`);
    await page.locator("canvas").first().focus();
    if (await page.evaluate(() => window.jevAnts.followed() !== null)) await page.keyboard.press("Escape");
  }

  // ——— 6. The Mutations drawer's tooltips: a mouse hovers, a keyboard tabs, a finger taps (ui/Tip.tsx) ———
  section("6. the Mutations drawer's tooltips");
  const tips = (p) => p.getByRole("tooltip").count();
  const firstUpgrade = (p) => p.getByLabel("upgrades").locator("li").first(); // Infectivity: fair, a root of the tree
  const nameOf = (p) => firstUpgrade(p).locator("[tabindex='0']").first(); // on a phone's list: the upgrade's name
  // The upgrades live in the Mutations drawer (PRD §69): the rail opens it, and the button shows it pressed.
  const mutations = (p) => p.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Mutations", exact: true });
  await mutations(page).click();
  check((await mutations(page).getAttribute("aria-pressed")) === "true", "the rail opens the Mutations drawer");
  await firstUpgrade(page).hover();
  await until(async () => (await tips(page)) === 1, "a hover opens a level's tooltip", 3000, 50);
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
  await buy.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab"); // onto the level's button from the keyboard: a keyboard focus opens its tooltip
  await until(async () => (await tips(page)) === 1, "Tab onto a level's button opens its tooltip", 3000, 50);
  check(
    /^Infectivity: fair for \d+ mutations?/.test(await page.getByRole("tooltip").innerText()),
    "the level's tooltip says what it gives and costs",
  );
  check(/next \d+/.test(await page.getByLabel("evolution").innerText()), "the next price is by the mutations in hand, not on the levels");
  await page.keyboard.press("Escape");
  check((await tips(page)) === 0, "Escape closes it");
  // Escape closes one thing at a time (review of #182, S1 and S7): with an ant followed and the map focused, the first
  // drops the ant and leaves the drawer; the second, with nothing followed, closes the drawer.
  await page.mouse.move(2, 2);
  if ((await mutations(page).getAttribute("aria-pressed")) !== "true") await mutations(page).click(); // open, if a step above closed it
  await page.evaluate(() => window.jevAnts.follow(0, 0) || window.jevAnts.follow(0, 1) || window.jevAnts.follow(0, 2));
  await page.locator("canvas").first().focus();
  await page.keyboard.press("Escape");
  check(
    (await page.evaluate(() => window.jevAnts.followed())) === null && (await mutations(page).getAttribute("aria-pressed")) === "true",
    "the first Escape drops the followed ant and leaves the drawer open",
  );
  await page.keyboard.press("Escape");
  check((await mutations(page).getAttribute("aria-pressed")) === "false", "the second closes the drawer");
  // With Go to open and an ant followed, Escape closes the menu only and keeps the follow (review of #182, S8): Go to's
  // capture listener takes the key first, and the map leaves an Escape already taken.
  await page.evaluate(() => window.jevAnts.follow(0, 0) || window.jevAnts.follow(0, 1) || window.jevAnts.follow(0, 2));
  await page.getByRole("button", { name: "Go to ▾" }).click();
  await page.locator("canvas").first().focus();
  check(
    (await page.evaluate(() => window.jevAnts.followed())) !== null && (await page.getByRole("group", { name: "go to" }).count()) === 1,
    "an ant followed, Go to open",
  );
  await page.keyboard.press("Escape");
  check(
    (await page.getByRole("group", { name: "go to" }).count()) === 0 && (await page.evaluate(() => window.jevAnts.followed())) !== null,
    "with Go to open, Escape closes the menu and keeps the ant followed",
  );
  await page.keyboard.press("Escape"); // and drops the follow, before the touch context
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
  // The aim on a phone: no bar; it is in The fungus drawer.
  check(
    !(await tpage.getByRole("textbox", { name: "aim", exact: true }).isVisible()),
    "on a phone there is no aim bar while the drawers are shut",
  );
  await tpage.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "The fungus", exact: true }).tap();
  const inDrawer = await tpage.evaluate(() =>
    [...document.querySelectorAll('textarea[aria-label="aim"]')].map(
      (t) => `${t.closest("section")?.getAttribute("aria-label") ?? "-"}:${t.offsetParent !== null}`,
    ),
  );
  check(inDrawer.includes("the fungus:true") && inDrawer.length === 2, `it is in The fungus drawer instead (${inDrawer.join(", ")})`);
  await tpage.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "The fungus", exact: true }).tap();
  // A phone (PRD §69): the map fills the screen, the rail is a tab bar along the bottom, and a drawer opens as a sheet
  // above it.
  const phone = await tpage.evaluate(() => {
    const cv = document.querySelector("canvas").getBoundingClientRect();
    const nav = document.querySelector('nav[aria-label="panels"]').getBoundingClientRect();
    return { w: innerWidth, h: innerHeight, cv: { w: cv.width, h: cv.height }, navTop: nav.top, navBottom: nav.bottom };
  });
  check(phone.cv.w === phone.w && phone.cv.h === phone.h, `on a phone the map fills the screen (${phone.cv.w}×${phone.cv.h})`);
  check(phone.navBottom > phone.h - 20 && phone.navTop > phone.h / 2, "and the drawers' tabs run along its bottom");
  await mutations(tpage).tap();
  const sheet = await tpage.getByRole("region", { name: "mutations" }).boundingBox();
  check(sheet !== null && sheet.y + sheet.height <= phone.navTop + 1, "a drawer opens as a sheet above the tabs");
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
  section("7. the tutorial");
  const tctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const tu = await tctx.newPage();
  await tu.addInitScript(`window.__clampCam = ${clampCam.toString()};`);
  // Draw frames so far (ja-jheh): the field reads a crossing in a draw frame, so the follow check counts the frames it was owed.
  await tu.addInitScript(() => {
    window.__frames = 0;
    const tick = () => {
      window.__frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  tu.on("pageerror", (e) => errors.push(String(e)));
  await tu.goto(url);
  await tu.getByLabel("world seed").fill(String(SEED));
  await tu.getByRole("button", { name: "Start the tutorial", exact: true }).click();
  const tcard = tu.getByRole("dialog", { name: "tutorial" });
  const bar = (name) => tu.getByRole("group", { name: "speed" }).getByRole("button", { name, exact: true });
  const paused = async () => (await tu.getByRole("button", { name: "Play", exact: true }).count()) === 1;
  await until(async () => /You are a fungus/.test((await tcard.textContent()) ?? ""), "the tutorial's first card");
  check(await paused(), "the landing card waits, paused");
  // From lg the card stops above the aim bar, opened to four lines, as the toasts do (review of #189, S5).
  {
    const card = await tcard.boundingBox();
    const aimBar = await tu
      .getByLabel("fungus aim")
      .filter({ has: tu.getByRole("group", { name: "aim presets" }) })
      .boundingBox();
    const opened = aimBar && aimBar.y - (aimBar.height < 60 ? 3 * 18 : 0);
    check(
      card !== null && opened !== null && card.y + card.height < opened,
      `the tutorial card stops above the aim bar (${card && Math.round(card.y + card.height)} < ${opened && Math.round(opened)})`,
    );
  }
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
  // A check that something did not happen (the follow dropped) has no condition to poll for: it gets a short settle.
  await sleep(300);
  check(
    (await tu.getByRole("region", { name: "followed ant" }).count()) === 1,
    "Follow it keeps the host followed (centring the view shown no longer drops it)",
  );
  // The field follows it too, not only the card: the camera of the view showing it sits on the host, or as near as the
  // map's edge lets it (camera.ts clamp: a host by a hole at the edge, as Amber's on seed 3), on any seed (PR #93 review N1).
  const hostOff = () =>
    tu.evaluate((i) => {
      const g = window.jevAnts.game;
      const c = g.colonies[g.landed.colony];
      const v = window.jevAnts.view();
      if ((c.layer[i] === 0) !== (v === "above")) return null;
      const cam = window.jevAnts.camera(v);
      if (!cam) return null;
      const e = window.__clampCam(v, c.x[i], c.y[i], cam.zoom);
      return Math.hypot(cam.x - e.x, cam.y - e.y);
    }, hostNo);
  // A followed ant's camera is set to the ant in every draw frame, with no easing (ColonyField.tsx), so the fixed 300 ms that
  // stood here lost a race against the first frames after the step switch on a loaded machine (ja-w7ef.14): poll until the
  // camera is on the host. The check reads the poll's last value: a second read could land a frame later, host moved on.
  let off = null;
  await until(
    async () => {
      off = await hostOff();
      return off !== null && off < 1;
    },
    "the camera on the host",
    5000,
    50,
  ).catch(() => {});
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
    // The field judges a crossing from the layer in each draw frame (ui/field/prelude.ts), so a host below for less than a frame
    // leaves the view where it was, and on a loaded runner a frame can take more than a second: in the failing run (ja-jheh) each
    // 50 ms poll took 0.4 s, the host was below at two reads 0.4 s apart and no frame saw it. The view owes the follow only once
    // three frames were drawn with the host below; a dip shorter than that proves nothing and is said so, not failed.
    const FRAMES_OWED = 3;
    const sample = () =>
      tu.evaluate(
        (i) => [window.jevAnts.view(), window.jevAnts.game.colonies[window.jevAnts.game.landed.colony].layer[i] !== 0, window.__frames],
        hostNo,
      );
    let [view, below, frames] = await sample();
    let framesBelow = 0;
    const end = Date.now() + 8000;
    while (view !== "below" && framesBelow < FRAMES_OWED && Date.now() < end) {
      await sleep(50);
      const [v2, b2, f2] = await sample();
      if (below && b2) framesBelow += f2 - frames; // the frames of an interval that began and ended with the host below
      [view, below, frames] = [v2, b2, f2];
    }
    if (view === "below") check(true, "the host went below, and the view followed it");
    else if (framesBelow >= FRAMES_OWED)
      check(false, `the host was below for ${framesBelow} drawn frames and the view did not follow it (still ${view})`);
    else console.log(`  --  the host was below for ${framesBelow} drawn frames only: the view-follows-below check was not exercised`);
  } else console.log("  --  the host did not go below before the watch ended: the view-follows-below check was not exercised");
  await tcard.getByRole("button", { name: "Skip tutorial", exact: true }).click();
  await until(async () => (await tcard.count()) === 0, "Skip ends the tutorial");
  check(!(await paused()) && (await bar("4×").getAttribute("aria-pressed")) === "true", "playing at 4× after Skip");
  await tu.reload();
  await until(async () => (await tu.getByRole("button", { name: "Start", exact: true }).count()) === 1, "after a reload, plain Start");
  await tctx.close();

  // ——— 8. The desert ant (ja-rf5) ———
  section("8. the desert ant");
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
  // The world's settings are Lab mode's World tab now (Settings → Lab mode; PRD §69.6).
  await dp.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Settings", exact: true }).click();
  await dp.getByRole("button", { name: "Lab mode", exact: true }).click();
  const det = dp.getByRole("region", { name: "lab" });
  await det.getByRole("tab", { name: "World" }).click();
  await det.getByText("Trails drawn").waitFor({ timeout: 5_000 });
  check(
    (await det.getByRole("button", { name: "Codex: trails" }).count()) === 0,
    "the Lab's World: no link to the trail entries it lacks (review of #144, S1)",
  );
  await det.getByRole("button", { name: "Close the Lab" }).click();
  await dp.getByRole("button", { name: "Codex", exact: true }).click();
  const learn = dp.getByRole("dialog", { name: "Codex" });
  await learn.getByRole("heading", { name: "Strangers and battles" }).waitFor({ timeout: 5_000 });
  check(
    (await learn.getByRole("heading", { name: "Food trail", exact: true }).count()) === 0 &&
      (await learn.getByText("lays no trails of some kinds").count()) === 1,
    "the field guide leaves out the trail entries, and says so",
  );
  check(
    (await learn.getByRole("heading", { name: "Desert ants", exact: true }).count()) === 1,
    "and has the desert ant's own entry (ja-rf5.8)",
  );
  check(
    /^sun (high|low|down) · \d+ °C/.test(((await dp.getByLabel("sun", { exact: true }).textContent()) ?? "").trim()),
    "the HUD shows the sun as the desert ants see it, and the ground's heat",
  );
  // On a phone the chip is short (owner, review of #194 D1).
  await dp.setViewportSize({ width: 390, height: 844 });
  check(
    /^(high|low|down) · \d+°$/.test(((await dp.getByLabel("sun, short", { exact: true }).textContent()) ?? "").trim()) &&
      (await dp.getByLabel("sun, short", { exact: true }).isVisible()),
    "on a phone the HUD shows the sun short",
  );
  await dp.setViewportSize({ width: 1280, height: 900 });
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

  // ——— 9. The aim bar's keys with Jev readable (review of #189, N7) ———
  // The dev server here has no key, so elsewhere the aim is locked and can't take focus. This page is told a key is
  // set, and every other API call is left unanswered: nothing reaches Jev and nothing is spent, and the page's own start
  // stays on the wire, which keeps the aim open (a failed start would lock it, policyLock.ts).
  section("9. the aim bar's keys");
  const kctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await kctx.route("**/api/health", (r) => r.fulfill({ json: { ok: true, hasKey: true } }));
  await kctx.route(/\/api\/(?!health)/, () => {}); // never answered
  const kp = await kctx.newPage();
  kp.on("pageerror", (e) => errors.push(String(e)));
  await kp.goto(url);
  await kp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  const field = kp.getByRole("textbox", { name: "aim", exact: true }).locator("visible=true");
  await until(() => field.isEnabled(), "the aim unlocked with a key", 10_000, 100);
  const focused = () => field.evaluate((e) => document.activeElement === e);
  await field.focus();
  await field.evaluate((e) => e.setSelectionRange(e.value.length, e.value.length)); // the end of the words, not of a wrapped line
  const typed = await field.inputValue();
  await kp.keyboard.type(" Spread");
  await kp.keyboard.press("Shift+Enter");
  const kept = (await focused()) && (await field.inputValue()) === `${typed} Spread\n`;
  check(kept, `Shift+Enter is a new line, the field kept${kept ? "" : ` (${JSON.stringify(await field.inputValue())})`}`);
  await kp.keyboard.type("now");
  await kp.keyboard.press("Enter");
  check(!(await focused()) && (await field.inputValue()) === `${typed} Spread\nnow`, "Enter commits: the field let go, no new line");
  await field.focus();
  await kp.keyboard.press("Escape");
  check(!(await focused()), "Escape gives the keys back to the map");
  await kctx.close();

  // ——— 10. The palette, the page's keys, the shortcuts sheet and the lens (PRD §69.3) ———
  section("10. the palette, the keys and the lens");
  const lctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const lp = await lctx.newPage();
  lp.on("pageerror", (e) => errors.push(String(e)));
  await lp.goto(url);
  await lp.getByLabel("world seed").fill(String(SEED));
  await lp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => lp.evaluate(() => !!window.jevAnts?.game.world && window.jevAnts.game.landed !== null), "a game for the palette");
  const rail = (name) => lp.getByRole("navigation", { name: "panels" }).getByRole("button", { name, exact: true });
  const pal = lp.getByRole("dialog", { name: "command palette" });
  const speedOn = (v) =>
    lp
      .getByRole("group", { name: "speed" })
      .getByRole("button", { name: `${v}×`, exact: true })
      .getAttribute("aria-pressed");
  await lp.locator("canvas").first().focus();
  // ⌘K / Ctrl+K: type part of a name, Enter runs the first.
  await lp.keyboard.press("Control+k");
  await pal.waitFor({ timeout: 3000 });
  check(
    await lp.getByRole("combobox", { name: "command" }).evaluate((e) => document.activeElement === e),
    "Ctrl+K opens the palette, its field focused",
  );
  await lp.keyboard.type("mutat");
  check(/^Mutations/.test((await pal.getByRole("option", { selected: true }).textContent()) ?? ""), "typing “mutat” puts Mutations first");
  await lp.keyboard.press("Enter");
  check(
    (await pal.count()) === 0 && (await rail("Mutations").getAttribute("aria-pressed")) === "true",
    "Enter runs it: the Mutations drawer",
  );
  // Escape closes the palette first and leaves the drawer under it.
  await lp.keyboard.press("Control+k");
  await pal.waitFor({ timeout: 3000 });
  await lp.keyboard.press("Escape");
  check(
    (await pal.count()) === 0 && (await rail("Mutations").getAttribute("aria-pressed")) === "true",
    "Escape closes the palette, not the drawer",
  );
  await lp.keyboard.press("Escape"); // and then the drawer
  // The arrows wrap, and the chosen command stays in sight (review of #196, S3): ↑ from the first is the last.
  await lp.keyboard.press("Control+k");
  await pal.waitFor({ timeout: 3000 });
  await lp.keyboard.press("ArrowUp");
  await lp.waitForTimeout(100);
  const inSight = await pal.evaluate((d) => {
    const box = d.querySelector('[role="listbox"]').getBoundingClientRect();
    const o = d.querySelector('[role="option"][aria-selected="true"]').getBoundingClientRect();
    return o.top >= box.top - 1 && o.bottom <= box.bottom + 1;
  });
  check(inSight, "↑ from the first command chooses the last, and scrolls it into sight");
  await lp.keyboard.press("Escape");
  // The keys: speeds, Space, the sheet.
  await lp.locator("canvas").first().focus();
  await lp.keyboard.press("1");
  check((await speedOn(1)) === "true", "the key 1: 1×");
  const playing = () => lp.getByRole("button", { name: "Pause", exact: true }).count();
  const was = await playing();
  await lp.keyboard.press(" ");
  check((await playing()) !== was, "Space plays or pauses");
  await lp.keyboard.press(" ");
  // Space on a focused button presses that button, not play (review of #196, S5).
  const playedBefore = await playing();
  await lp.getByRole("group", { name: "speed" }).getByRole("button", { name: "2×", exact: true }).focus();
  await lp.keyboard.press(" ");
  check((await speedOn(2)) === "true" && (await playing()) === playedBefore, "Space on the focused 2× button: 2×, and play as it was");
  await lp.locator("canvas").first().focus();
  await lp.keyboard.press("3");
  check((await speedOn(4)) === "true", "the key 3: 4×");
  await lp.keyboard.press("?");
  const sheetD = lp.getByRole("dialog", { name: "keyboard shortcuts" });
  await sheetD.waitFor({ timeout: 3000 });
  check(/command palette/.test((await sheetD.textContent()) ?? ""), "? opens the shortcuts sheet");
  await lp.keyboard.press("1");
  check((await speedOn(4)) === "true", "the game's keys wait while the sheet is open");
  await lp.keyboard.press("Escape");
  check((await sheetD.count()) === 0, "Escape closes it");
  // The lens: i turns it on; over Ink's hole it says so; a click pins it and follows nothing; "more" opens the guide.
  await lp.keyboard.press("i");
  const lensBtn = lp.getByRole("button", { name: "Lens: say what is under the pointer (i)" });
  check((await lensBtn.getAttribute("aria-pressed")) === "true", "i turns the lens on");
  await lp.evaluate(() => window.jevAnts.goNest(0));
  await lp.waitForTimeout(200);
  const hole = await lp.evaluate(() => {
    const g = window.jevAnts.game;
    const n = g.colonies[0].layers[0].nest;
    const c = window.jevAnts.camera("above");
    const cv = document.querySelector("canvas");
    const k = cv.getBoundingClientRect().width / cv.width;
    return { x: ((n.x - c.x) * c.zoom + cv.width / 2) * k, y: ((n.y - c.y) * c.zoom + cv.height / 2) * k };
  });
  await lp.mouse.move(hole.x, hole.y);
  const lensCard = lp.getByRole("region", { name: "lens" });
  await until(async () => (await lensCard.count()) === 1, "the lens card under the pointer", 3000, 50);
  const said = (await lensCard.textContent()) ?? "";
  check(/Ink's hole/.test(said), `over Ink's hole it says so${/Ink's hole/.test(said) ? "" : ` (${said.slice(0, 120)})`}`);
  await lp.mouse.click(hole.x, hole.y);
  await lensCard.getByRole("button", { name: "Close the lens card" }).waitFor({ timeout: 2000 });
  check((await lp.evaluate(() => window.jevAnts.followed())) === null, "a click with the lens on pins the card and follows nothing");
  await lp.mouse.move(hole.x + 300, hole.y + 200);
  check(/Ink's hole/.test((await lensCard.textContent()) ?? ""), "pinned, it stays while the pointer wanders");
  // The non-modal inspector keeps the map available and never changes its hex size.
  const inspectButton = lensCard.getByRole("button", { name: "Inspect cell", exact: true });
  const inspection = lp.getByRole("complementary", { name: /^Cell / });
  const beforeInspectionCamera = await lp.evaluate(() => window.jevAnts.camera("above"));
  await inspectButton.click();
  await inspection.waitFor({ timeout: 3000 });
  check(
    await inspection.evaluate((d) => !d.hasAttribute("aria-modal") && d.contains(document.activeElement)),
    "inspection focuses a non-modal side panel",
  );
  const inspectionCanvas = inspection.locator("canvas");
  await until(() => inspectionCanvas.evaluate((cv) => cv.dataset.assetsReady === "true"), "the inspection renderer is ready", 5000, 50);
  const inspectionShot = await inspectionCanvas.screenshot();
  check(
    await lp.evaluate(async (base64) => {
      const image = new Image();
      image.src = "data:image/png;base64," + base64;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 4; i < data.length; i += 4) if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) return true;
      return false;
    }, inspectionShot.toString("base64")),
    "the inspection canvas paints visible detail",
  );
  check((await inspection.getByRole("status").count()) === 0, "the inspection renderer loads without the fixed atlas");
  if ((await inspectionCanvas.getAttribute("data-renderer")) === "webgl") {
    check(
      await inspectionCanvas.evaluate((cv) => {
        const lose = cv.getContext("webgl2")?.getExtension("WEBGL_lose_context");
        lose?.loseContext();
        return !!lose;
      }),
      "the test can simulate WebGL context loss",
    );
    await until(
      () => inspectionCanvas.evaluate((cv) => cv.dataset.renderer === "software" && cv.dataset.assetsReady === "true"),
      "inspection recovers on a software canvas after WebGL context loss",
      5000,
      50,
    );
  }
  const scentOverlay = inspection.getByRole("checkbox", { name: "Scents", exact: true });
  await scentOverlay.uncheck();
  check(!(await scentOverlay.isChecked()), "inspection scents can be hidden");
  await scentOverlay.check();
  const locationOverlay = inspection.getByRole("checkbox", { name: "Location markers", exact: true });
  await locationOverlay.uncheck();
  check(!(await locationOverlay.isChecked()), "inspection location markers can be hidden independently");
  await locationOverlay.check();
  await lp.keyboard.press("2");
  check((await speedOn(2)) === "true", "game speed shortcuts remain available while inspection is open");
  await lp.keyboard.press("3");
  await lp.keyboard.press("Escape");
  await inspection.waitFor({ state: "detached", timeout: 2000 });
  check(
    (await lensCard.getByRole("button", { name: "Close the lens card" }).count()) === 1,
    "Escape closes inspection and keeps the pinned lens",
  );
  check(await inspectButton.evaluate((button) => document.activeElement === button), "inspection returns focus to its opening button");
  const afterInspectionCamera = await lp.evaluate(() => window.jevAnts.camera("above"));
  check(
    JSON.stringify(afterInspectionCamera) === JSON.stringify(beforeInspectionCamera),
    "opening inspection leaves the map camera and hex size unchanged",
  );
  await inspectButton.click();
  await inspection.getByRole("button", { name: "Close inspection", exact: true }).click();
  await inspection.waitFor({ state: "detached", timeout: 2000 });
  await lensCard.getByRole("button", { name: "More on ink's hole" }).click();
  await lp.getByRole("dialog", { name: "Codex" }).waitFor({ timeout: 3000 });
  check((await lensCard.count()) === 0, "“more” opens the guide, and the card goes");
  await lp.keyboard.press("Escape");
  await lp.mouse.click(hole.x, hole.y);
  await lensCard.getByRole("button", { name: "Close the lens card" }).waitFor({ timeout: 2000 });
  await lp.keyboard.press("Escape");
  // Closing a pinned card leaves the pointer's card, if it is over the map: count the pinned one (its × says so).
  const pinnedCards = () => lensCard.getByRole("button", { name: "Close the lens card" }).count();
  check((await pinnedCards()) === 0 && (await lensCard.count()) === 1, "Escape closes a pinned card, and the pointer's card is back");
  // One Escape closes one thing (review of #196, S1): a pinned card over the Go to menu, then the menu; and the palette
  // over the menu, then the menu.
  const goBtn = lp.getByRole("button", { name: "Go to ▾" });
  const goMenu = lp.getByRole("group", { name: "go to" });
  await lp.mouse.click(hole.x, hole.y);
  await lensCard.getByRole("button", { name: "Close the lens card" }).waitFor({ timeout: 2000 });
  await goBtn.click();
  await lp.keyboard.press("Escape");
  check((await pinnedCards()) === 0 && (await goMenu.count()) === 1, "a pinned card and Go to: the first Escape closes the card only");
  await lp.keyboard.press("Escape");
  check((await goMenu.count()) === 0, "and the second the menu");
  await goBtn.click();
  await lp.keyboard.press("Control+k");
  await pal.waitFor({ timeout: 3000 });
  await lp.keyboard.press("Escape");
  check((await pal.count()) === 0 && (await goMenu.count()) === 1, "the palette over Go to: the first Escape closes the palette only");
  await lp.keyboard.press("Escape");
  // A card pinned on the other view is hidden and doesn't take Escape (review of #196, S2): it waits for its view.
  await rail("Mutations").click();
  await lp.mouse.click(hole.x, hole.y);
  await lensCard.getByRole("button", { name: "Close the lens card" }).waitFor({ timeout: 2000 });
  await lp.locator("canvas").first().focus();
  await lp.keyboard.press("v");
  await lp.waitForTimeout(100);
  check((await lensCard.count()) === 0, "pinned above, it hides below");
  await lp.keyboard.press("Escape");
  check((await rail("Mutations").getAttribute("aria-pressed")) === "false", "below, Escape closes the drawer, not the hidden card");
  // Below, the lens still follows the pointer while that card waits above (review of #196, S6).
  for (const dx of [0, 40, 80]) await lp.mouse.move(640 + dx, 450);
  await until(async () => (await lensCard.count()) === 1, "a hover card below while a card waits pinned above", 2000, 50);
  check((await lensCard.getByRole("button", { name: "Close the lens card" }).count()) === 0, "below, the pointer's card (not pinned)");
  await lp.keyboard.press("v");
  await lensCard.getByRole("button", { name: "Close the lens card" }).waitFor({ timeout: 2000 });
  check(/Ink's hole/.test((await lensCard.textContent()) ?? ""), "above again, the pinned card is back");
  await lp.keyboard.press("Escape");
  await lp.keyboard.press("v");
  await lp.mouse.click(720, 450);
  await lensCard.getByRole("button", { name: "Inspect cell", exact: true }).click();
  await inspection.waitFor({ timeout: 3000 });
  check(
    (await inspection.locator("canvas").getAttribute("aria-label"))?.startsWith("Seven-cell below inspection"),
    "below opens the dedicated seven-cell cutaway",
  );
  await until(() => inspection.locator("canvas").evaluate((cv) => cv.dataset.assetsReady === "true"), "the below atlas loads", 5000, 50);
  check((await inspection.getByRole("status").count()) === 0, "the below atlas loads without fallback");
  await lp.keyboard.press("Escape");
  await inspection.waitFor({ state: "detached", timeout: 2000 });
  await lp.keyboard.press("Escape");
  await lp.keyboard.press("v");
  // A command run from the palette closes a pinned card, which would stay over what it opens (review of #196, N4, N8).
  await lp.mouse.click(hole.x, hole.y);
  await lensCard.getByRole("button", { name: "Close the lens card" }).waitFor({ timeout: 2000 });
  await lp.keyboard.press("Control+k");
  await pal.waitFor({ timeout: 3000 });
  await lp.keyboard.type("lab mode");
  await lp.keyboard.press("Enter");
  await lp.getByRole("region", { name: "lab" }).waitFor({ timeout: 3000 });
  check((await lensCard.count()) === 0, "a palette command (Lab mode) closes the pinned card");
  await lp.getByRole("button", { name: "Close the Lab" }).click();
  // The lens off and on again starts afresh: no old pinned card (N8).
  await lp.mouse.click(hole.x, hole.y);
  await lensCard.getByRole("button", { name: "Close the lens card" }).waitFor({ timeout: 2000 });
  await lp.locator("canvas").first().focus();
  await lp.keyboard.press("i");
  await lp.keyboard.press("i");
  await lp.waitForTimeout(100);
  check((await lensCard.count()) === 0, "i twice: the pinned card is gone");
  await lp.keyboard.press("i");
  await lp.mouse.move(hole.x + 2, hole.y + 2);
  await lp.waitForTimeout(100);
  check((await lensCard.count()) === 0 && (await lensBtn.getAttribute("aria-pressed")) === "false", "i again: the lens off, no card");
  // The close-map renderer owns a detached canvas, separate from the inspector's visible canvas.
  await lp.evaluate(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, options) {
      const context = getContext.call(this, kind, options);
      if (kind === "webgl2" && context && !this.isConnected) {
        window.loseCloseMapContext = () => {
          const extension = context.getExtension("WEBGL_lose_context");
          extension?.loseContext();
          return !!extension;
        };
        HTMLCanvasElement.prototype.getContext = getContext;
      }
      return context;
    };
  });
  const closeMap = lp.locator("canvas").first();
  await closeMap.evaluate((cv) => {
    const { left, top, width, height } = cv.getBoundingClientRect();
    cv.dispatchEvent(new WheelEvent("wheel", { deltaY: -10000, clientX: left + width / 2, clientY: top + height / 2 }));
  });
  const tiltButton = lp.getByRole("button", { name: /^Tilt close map/ });
  await tiltButton.waitFor({ timeout: 5000 });
  await until(() => closeMap.evaluate((cv) => cv.dataset.voxelAlpha === "1.000"), "close map reaches full voxel detail", 10000, 50);
  await tiltButton.press("ArrowUp");
  await lp.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if ((await closeMap.getAttribute("data-map-renderer")) === "voxel-webgl") {
    check(await lp.evaluate(() => window.loseCloseMapContext?.()), "the test can simulate tilted map context loss");
    await until(
      () => closeMap.evaluate((cv) => cv.dataset.mapRenderer === "voxel-software" && cv.dataset.voxelAlpha === "1.000"),
      "the tilted map recovers on a software canvas",
      10000,
      50,
    );
  }
  await lctx.close();
  // The lens button fits the phone's HUD from 360 px wide (review of #196, S4), with the page's own font and with a wide
  // fallback: a player without Inter gets the system's (DejaVu Sans is the widest this runner has: the bar read 357 px
  // of 360 on the page of #233 before the HUD was trimmed; ja-9xc1).
  let plainRight = 0; // the bar's right edge in the page's own font: the wide pass must come out wider, or it measured nothing new
  for (const font of [null, "DejaVu Sans"]) {
    const nctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const np = await nctx.newPage();
    np.on("pageerror", (e) => errors.push(String(e)));
    if (font)
      await np.addInitScript((f) => {
        document.addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style");
          s.textContent = `*{font-family:"${f}",sans-serif !important}`;
          document.head.appendChild(s);
        });
      }, font);
    await np.goto(url);
    await np.getByRole("button", { name: "Start without the tutorial", exact: true }).tap();
    const lb = await np.getByRole("button", { name: "Lens: say what is under the pointer (i)" }).boundingBox();
    const hudBar = await np.getByLabel("game bar").boundingBox();
    check(
      lb !== null && lb.x + lb.width <= 360 - 8 && hudBar.x + hudBar.width <= 360 - 8,
      `at 360 px${font ? ` in ${font}` : ""} the lens button is whole, the bar inside the gutter (${lb && Math.round(lb.x + lb.width)}, ${hudBar && Math.round(hudBar.x + hudBar.width)})`,
    );
    const barRight = hudBar.x + hudBar.width;
    if (!font) plainRight = barRight;
    else {
      // The forced font took effect and is installed (review of #289, S1): the style landed on the bar, and the same bar
      // ends further right than in the page's own font (a missing font falls back to it and would read the same).
      const ff = await np.getByLabel("game bar").evaluate((el) => getComputedStyle(el).fontFamily);
      check(
        ff.includes(font) && barRight > plainRight + 1,
        `the bar was measured in ${font} (font-family ${ff}; right edge ${Math.round(barRight)} against ${Math.round(plainRight)} in the page's font)`,
      );
    }
    await nctx.close();
  }

  // ——— 11. The builder (docs/builder.md, PRD §73, ja-kjj8.3): on a phone and a tablet ———
  // A shovel on the tab bar opens a tray of picture tools in its place: a tap places, a drag paints, Move pans, undo takes
  // a whole drag back, below digs the curtain; the builds go into the game, so a save and a reload keep them.
  for (const [w, h] of [
    [390, 844],
    [768, 1024],
  ]) {
    section(`11. the builder at ${w} px`);
    const bctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const bp = await bctx.newPage();
    bp.on("pageerror", (e) => errors.push(String(e)));
    await bp.goto(url);
    await bp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
    await until(() => bp.evaluate(() => !!window.jevAnts?.game.world && window.jevAnts.game.landed !== null), "the builder page's game");
    await bp.getByRole("button", { name: "Pause", exact: true }).tap();
    await bp.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Builder", exact: true }).tap();
    const trayBox = await bp.getByRole("navigation", { name: "builder tools" }).boundingBox();
    check(trayBox !== null && trayBox.y + trayBox.height > h - 4, "the tray sits on the screen's bottom edge");
    check(!(await bp.getByRole("navigation", { name: "panels" }).isVisible()), "in place of the tab bar");
    const sizes = await bp.$$eval('[aria-label="builder tools"] button', (bs) =>
      bs.map((b) => Math.round(b.getBoundingClientRect().width)),
    );
    check(Math.min(...sizes) >= 64, `every tray button is at least 64 px (${Math.min(...sizes)})`);
    check((await bp.evaluate(() => document.documentElement.scrollWidth)) === w, "no sideways scroll");
    const fieldBox = await bp.locator("canvas").first().boundingBox();
    const mx = fieldBox.x + fieldBox.width / 2;
    // The whole map shows at first, centred in the field (it is wider than tall): strokes go about its middle.
    const my = fieldBox.y + fieldBox.height / 2 - 20;
    const g = (expr) => bp.evaluate(expr);
    /** Pick a tray button; a tool is in hand once the field shows its cursor and a frame has passed (a finger takes longer). */
    const tool = async (name) => {
      await bp.getByRole("navigation", { name: "builder tools" }).getByRole("button", { name, exact: true }).tap();
      if (["Undo", "Done building", "Move"].includes(name)) return;
      await until(
        () => bp.evaluate(() => document.querySelector("canvas").classList.contains("cursor-crosshair")),
        `${name} in hand`,
        3000,
        20,
      );
      await bp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    /** A drag with one pointer (Playwright's touchscreen only taps: the mouse makes the same pointer events). */
    const drag = async (x0, y0, x1, y1) => {
      await bp.mouse.move(x0, y0);
      await bp.mouse.down();
      await bp.mouse.move(x1, y1, { steps: 12 });
      await bp.mouse.up();
    };
    const food0 = await g(() => window.jevAnts.game.layers[0].foodLeft);
    await tool("Sugar");
    // Taps along a row: one of them lands on open ground (a tap on rock puts nothing down).
    for (let k = -3; k <= 3; k++) await bp.touchscreen.tap(mx + 30 * k, my);
    check((await g(() => window.jevAnts.view())) === "above", "taps that build follow no ant and switch no view");
    check((await g(() => window.jevAnts.game.layers[0].foodLeft)) > food0, "a tap with sugar puts food down");
    // Aphids (PRD §78): a tap puts a clump down on open ground, and its honeydew comes as the game steps on.
    await tool("Aphids");
    for (let k = -3; k <= 3; k++) await bp.touchscreen.tap(mx + 30 * k, my + 20);
    const clumps = await g(() => window.jevAnts.game.aphids.length);
    check(clumps >= 1, `a tap with aphids puts a clump down (${clumps})`);
    const walls0 = await g(() => window.jevAnts.game.layers[0].filled);
    await tool("Rock");
    await drag(mx - 90, my - 50, mx + 90, my - 50);
    const walls1 = await g(() => window.jevAnts.game.layers[0].filled);
    check(walls1 > walls0 + 5, `a drag with rock builds a wall (${walls1 - walls0} cells)`);
    await tool("Trail crayon, Amber");
    await drag(mx - 90, my + 40, mx + 90, my + 40);
    const lines = await g(() => window.jevAnts.game.crayons.length);
    check(lines === 1, `a crayon drag draws one line (${lines})`);
    await tool("Undo");
    check((await g(() => window.jevAnts.game.crayons.length)) === 0, "one undo takes the whole crayon drag back");
    // The no-entry sign (PRD §73.3): every colony's "no entry" wakes under the stroke.
    await tool("No entry sign");
    await drag(mx - 90, my + 40, mx + 90, my + 40);
    check(
      await g(() => window.jevAnts.game.colonies.every((c) => c.layers[0].ph.live("noEntry"))),
      "a no-entry drag lays every colony's sign",
    );
    await tool("Undo");
    // The tweezers (PRD §73.3): a drag from an ant on the top view carries it, and its belief of home with it.
    await tool("Tweezers: pick up an ant");
    // The game is paused at its start: step it on until an ant is out on the surface, in view.
    const antInView = () =>
      bp.evaluate(() => {
        const cv = document.querySelector("canvas");
        const cam = window.jevAnts.camera("above");
        const k = cv.clientWidth / cv.width;
        // The builder opens on the colony the fungus landed by.
        const kk = window.jevAnts.game.landed?.colony ?? 0;
        const c = window.jevAnts.game.colonies[kk];
        let best = null;
        for (let i = 0; i < c.n; i++) {
          if (!c.alive[i] || c.layer[i] !== 0) continue;
          const sx = ((c.x[i] - cam.x) * cam.zoom + cv.width / 2) * k;
          const sy = ((c.y[i] - cam.y) * cam.zoom + cv.height / 2) * k;
          const d = Math.hypot(sx - cv.clientWidth / 2, sy - cv.clientHeight * 0.4);
          if (!(sx > 40 && sx < cv.clientWidth - 40 && sy > 160 && sy < cv.clientHeight * 0.6) || (best && d >= best.d)) continue;
          // Only an ant the press reaches: a notice floats over the map as a button that takes the press, and it does so just
          // when this check runs (an ant has found the sugar a few game seconds in): the drag then lands on the toast and the ant
          // stays put (ja-w7ef.24: 4 of 40 fresh pages, each with a toast at the press point; every other page had the canvas).
          // The two-finger check presses 50 px below it too, with the second finger: that point needs the canvas as well.
          if (document.elementFromPoint(sx, sy) !== cv || document.elementFromPoint(sx, sy + 50) !== cv) continue;
          // The tweezers lift the nearest live ant of any colony within PICK_PX (14 CSS px, ColonyField's pick): with another
          // ant within twice that, the drag can lift that one and leave this one where it was (run 43721564508; review of
          // #233, S3). Only an ant alone there.
          const crowded = window.jevAnts.game.colonies.some((o, ok) => {
            for (let j = 0; j < o.n; j++) {
              if ((ok === kk && j === i) || !o.alive[j] || o.layer[j] !== 0) continue;
              const ox = ((o.x[j] - cam.x) * cam.zoom + cv.width / 2) * k;
              const oy = ((o.y[j] - cam.y) * cam.zoom + cv.height / 2) * k;
              if (Math.hypot(ox - sx, oy - sy) < 28) return true;
            }
            return false;
          });
          if (crowded) continue;
          // Dropped 80 px to one side, on open ground (the tweezers refuse rock): that side, if either.
          const map = window.jevAnts.game.layers[0];
          const open = (wx, wy) => {
            const cy = Math.round(wy / (Math.sqrt(3) / 2));
            const cx = Math.round(wx - (cy & 1) / 2);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.rock.get(cx + dx, cy + dy) !== 0) return false;
            return true;
          };
          const dw = 80 / k / cam.zoom;
          const side = open(c.x[i] + dw, c.y[i]) && sx + 80 < cv.clientWidth - 10 ? 1 : open(c.x[i] - dw, c.y[i]) && sx - 80 > 10 ? -1 : 0;
          if (side) best = { k: kk, i, sx, sy, d, x: c.x[i], side };
        }
        return best;
      });
    let ant = await antInView();
    for (let k = 0; k < 40 && !ant; k++) {
      await bp.evaluate(() => window.jevAnts.step(30));
      ant = await antInView();
    }
    check(ant !== null, "an ant on the top view to pick up");
    await drag(ant.sx, ant.sy, ant.sx + 80 * ant.side, ant.sy);
    const after = await bp.evaluate(
      ([k, i]) => [window.jevAnts.game.colonies[k].x[i], window.jevAnts.game.colonies[k].carriedX[i]],
      [ant.k, ant.i],
    );
    check(
      Math.abs(after[0] - ant.x) > 2 && Math.abs(after[1]) > 2,
      `the tweezers carry the ant, and its belief of home with it (colony ${ant.k} ant ${ant.i}: x ${ant.x.toFixed(1)} → ${after[0].toFixed(1)}, belief carried ${after[1].toFixed(1)})`,
    );
    // Its way home is drawn from where it was set down (ja-cwjp): step the game a frame at a time until the trace has a
    // few points (the field records one a frame, once the ant has walked on).
    let trace = null;
    for (let k = 0; k < 60 && !(trace && trace.points >= 3); k++) {
      await bp.evaluate(() => window.jevAnts.step(3));
      await bp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      trace = await bp.evaluate(([k, i]) => window.jevAnts.traces().find((t) => t.k === k && t.i === i) ?? null, [ant.k, ant.i]);
    }
    check(trace !== null && (trace.points >= 3 || trace.end !== null), `the moved ant's way home is drawn (${JSON.stringify(trace)})`);
    // The same with real fingers (CDP touch). A finger with the tweezers waits to see whether a second joins it: a tap lifts nothing, one
    // finger drags the ant (one undo carries it back), and a second finger down with the first moves nothing but the map.
    // The page gets a finger's moves one a frame: let each gesture finish before the next step.
    const settle = () =>
      bp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100)))));
    const bcdp = await bctx.newCDPSession(bp);
    const touches = (pts, type) => bcdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const antX = (a) => bp.evaluate(([k, i]) => window.jevAnts.game.colonies[k].x[i], [a.k, a.i]);
    const nextAnt = async () => {
      let a = await antInView();
      for (let k = 0; k < 40 && !a; k++) {
        await bp.evaluate(() => window.jevAnts.step(30));
        a = await antInView();
      }
      return a;
    };
    let ta = await nextAnt();
    await touches([[ta.sx, ta.sy]], "touchStart");
    await touches([], "touchEnd");
    await settle();
    check(Math.abs((await antX(ta)) - ta.x) < 0.01, "a tap with the tweezers on an ant lifts nothing");
    ta = await nextAnt();
    await touches(
      [
        [ta.sx, ta.sy],
        [ta.sx, ta.sy + 50],
      ],
      "touchStart",
    );
    for (let k = 1; k <= 6; k++) {
      await touches(
        [
          [ta.sx + 10 * k * ta.side, ta.sy],
          [ta.sx + 10 * k * ta.side, ta.sy + 50],
        ],
        "touchMove",
      );
      await sleep(16);
    }
    await touches([], "touchEnd");
    await settle();
    check(Math.abs((await antX(ta)) - ta.x) < 0.01, "two fingers down on the tweezers' ant move the map, not the ant");
    ta = await nextAnt();
    await touches([[ta.sx, ta.sy]], "touchStart");
    for (let k = 1; k <= 8; k++) {
      await touches([[ta.sx + 10 * k * ta.side, ta.sy]], "touchMove");
      await sleep(16);
    }
    await touches([], "touchEnd");
    await settle();
    check(Math.abs((await antX(ta)) - ta.x) > 2, "one finger with the tweezers carries the ant");
    await tool("Undo");
    await settle();
    check(Math.abs((await antX(ta)) - ta.x) < 0.01, "and one undo carries it back");
    const cam0 = await g(() => window.jevAnts.camera("above"));
    await tool("Move");
    await until(
      () => bp.evaluate(() => !document.querySelector("canvas").classList.contains("cursor-crosshair")),
      "Move in hand",
      3000,
      20,
    );
    await bp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await drag(mx, my, mx - 80, my - 40);
    const cam1 = await g(() => window.jevAnts.camera("above"));
    check(cam0 && cam1 && (cam0.x !== cam1.x || cam0.y !== cam1.y), "Move pans the map with one finger");
    check((await g(() => window.jevAnts.game.layers[0].filled)) === walls1, "and builds nothing");
    // Two fingers with a brush in hand still pan and zoom, and build nothing: a finger waits to see whether a second joins it.
    await tool("Sugar");
    const foodHeld = await g(() => window.jevAnts.game.layers[0].foodLeft);
    const camA = await g(() => window.jevAnts.camera("above"));
    await touches(
      [
        [mx - 20, my],
        [mx + 20, my],
      ],
      "touchStart",
    );
    for (let k = 1; k <= 8; k++) {
      const d = 20 + 6 * k;
      await touches(
        [
          [mx - d, my],
          [mx + d, my],
        ],
        "touchMove",
      );
      await sleep(16);
    }
    await touches([], "touchEnd");
    await settle();
    const camB = await g(() => window.jevAnts.camera("above"));
    check(
      camB.zoom > camA.zoom * 1.2,
      `two fingers spreading zoom the map with sugar in hand (${camA.zoom.toFixed(1)} → ${camB.zoom.toFixed(1)})`,
    );
    await touches(
      [
        [mx - 20, my],
        [mx + 20, my],
      ],
      "touchStart",
    );
    for (let k = 1; k <= 8; k++) {
      await touches(
        [
          [mx - 20 + 8 * k, my + 4 * k],
          [mx + 20 + 8 * k, my + 4 * k],
        ],
        "touchMove",
      );
      await sleep(16);
    }
    await touches([], "touchEnd");
    await settle();
    const camC = await g(() => window.jevAnts.camera("above"));
    check(Math.hypot(camC.x - camB.x, camC.y - camB.y) > 0.5, "two fingers moving together pan it");
    check((await g(() => window.jevAnts.game.layers[0].foodLeft)) === foodHeld, "and neither gesture put any sugar down");
    // One finger still builds: a drag with the crayon draws one line, from where the finger landed.
    await tool("Trail crayon, Amber");
    const lines0 = await g(() => window.jevAnts.game.crayons.length);
    await touches([[mx - 60, my + 60]], "touchStart");
    for (let k = 1; k <= 8; k++) {
      await touches([[mx - 60 + 15 * k, my + 60]], "touchMove");
      await sleep(16);
    }
    await touches([], "touchEnd");
    await settle();
    check((await g(() => window.jevAnts.game.crayons.length)) === lines0 + 1, "one finger dragging with the crayon still draws a line");
    await bp.getByRole("button", { name: "below", exact: true }).tap();
    const dug0 = await g(() => window.jevAnts.game.layers[1].dug);
    await tool("Dig");
    await drag(mx - 60, my + 60, mx + 60, my + 90);
    check((await g(() => window.jevAnts.game.layers[1].dug)) > dug0, "below, a drag with dig opens the soil");
    await tool("Done building");
    check(await bp.getByRole("navigation", { name: "panels" }).isVisible(), "Done building gives the tab bar back");
    // Save to a slot, reload, Continue: the wall is still there.
    await bp.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Saved games", exact: true }).tap();
    await bp.getByRole("button", { name: "Save here" }).first().tap();
    await until(async () => (await bp.getByText(/^Slot 1 · empty/).count()) === 0, "the save", 5000, 100);
    const walls2 = await g(() => window.jevAnts.game.layers[0].filled);
    await bp.reload();
    await bp.getByRole("button", { name: "Continue" }).first().click();
    await until(() => bp.evaluate(() => !!window.jevAnts?.game.world), "the game continued");
    check((await g(() => window.jevAnts.game.layers[0].filled)) === walls2, "a saved game keeps the builds");
    await bctx.close();
  }

  // ——— 12. The Codex (PRD §69.4): guide entries open as the game first shows what each is about ———
  section("12. the Codex");
  const cctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const cp = await cctx.newPage();
  cp.on("pageerror", (e) => errors.push(String(e)));
  await cp.goto(url);
  await cp.getByLabel("world seed").fill(String(SEED));
  await cp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => cp.evaluate(() => window.jevAnts?.game.landed !== null), "a game for the Codex");
  // Paused once the spores land: the game's own first host (~3 s) would race the checks below (review of #206, S4).
  await cp.getByRole("button", { name: "Pause", exact: true }).click();
  const learnBtn = cp.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Codex", exact: true });
  const guide = cp.getByRole("dialog", { name: "Codex" });
  const locked = (title) => guide.getByRole("region", { name: `${title}, not yet seen` });
  await learnBtn.click();
  await guide.waitFor({ timeout: 3000 });
  check((await locked("Jobs by age").count()) === 1, "a new notebook: Jobs by age is not yet seen");
  check(
    (await locked("The fungus").count()) === 0 && (await guide.getByRole("heading", { name: "The fungus", exact: true }).count()) === 1,
    "the fungus's own entry is open from the start",
  );
  await guide.getByRole("button", { name: "Close the Codex" }).click();
  // The first host: Jobs by age opens, with a notice and the rail's badge.
  await cp.evaluate(() => {
    const c = window.jevAnts.game.colonies[0];
    c.load[c.alive.indexOf(1)] = 1;
  });
  await until(
    async () => (await cp.getByText(/^New in the field guide: .*Jobs by age/).count()) === 1,
    "one notice of what opened",
    3000,
    50,
  );
  await until(
    async () => /new in the field guide/.test((await learnBtn.getAttribute("title")) ?? ""),
    "the rail's Codex carries a badge",
    2000,
    50,
  );
  check(true, "the rail's Codex carries a badge");
  // A first host opens Jobs by age with the entries for where it stands: one notice names them together (review of #206,
  // S3). A cue that shows half a second later gets its own notice, so count the names in the one that has Jobs by age.
  const jobsNotice =
    (await cp
      .getByText(/^New in the field guide: .*Jobs by age/)
      .first()
      .textContent()) ?? "";
  check(/ and /.test(jobsNotice), `one notice for everything that opened together (${jobsNotice.slice(0, 90)})`);
  await learnBtn.click();
  await guide.waitFor({ timeout: 3000 });
  check((await locked("Jobs by age").count()) === 0, "Jobs by age is open now");
  check(
    (await guide.getByRole("region", { name: "Jobs by age, not yet seen" }).count()) === 0 &&
      (await guide.locator("#learn-jobs").getByText("new", { exact: true }).count()) === 1,
    "and marked new (N6)",
  );
  check(!/new in the field guide/.test((await learnBtn.getAttribute("title")) ?? ""), "looked at: the badge goes");
  // Read it anyway, and show every entry.
  await locked("Alarm").getByRole("button", { name: "Read it anyway" }).click();
  check((await locked("Alarm").count()) === 0, "Read it anyway opens one entry");
  check((await locked("Tiredness and rest").count()) === 1, "and only that one");
  await guide.getByLabel("Show every entry").check();
  check((await guide.getByRole("region", { name: /not yet seen$/ }).count()) === 0, "Show every entry opens them all");
  await guide.getByLabel("Show every entry").uncheck();
  await guide.getByRole("button", { name: "Close the Codex" }).click();
  // A link straight to an entry opens it, seen or not.
  await cp.locator("canvas").first().focus();
  await cp.keyboard.press("Control+k");
  await cp.keyboard.type("codex tiredness");
  await cp.keyboard.press("Enter");
  await guide.waitFor({ timeout: 3000 });
  check((await locked("Tiredness and rest").count()) === 0, "the palette's Codex: Tiredness and rest opens it though not yet seen");
  await guide.getByRole("button", { name: "Close the Codex" }).click();
  // The notebook outlives the page.
  await cp.reload();
  await cp.getByRole("button", { name: "Start", exact: true }).click();
  await learnBtn.click();
  await guide.waitFor({ timeout: 3000 });
  check(
    (await locked("Jobs by age").count()) === 0 && (await locked("Tiredness and rest").count()) === 1,
    "after a reload: Jobs by age still seen, Tiredness and rest not",
  );
  // Show every entry outlives the page too (N6).
  await guide.getByLabel("Show every entry").check();
  await cp.reload();
  await cp.getByRole("button", { name: "Start", exact: true }).click();
  await learnBtn.click();
  await guide.waitFor({ timeout: 3000 });
  check(
    (await guide.getByLabel("Show every entry").isChecked()) && (await locked("Tiredness and rest").count()) === 0,
    "Show every entry, kept after a reload",
  );
  await guide.getByLabel("Show every entry").uncheck();
  // Starting afresh locks what was seen, and keeps it locked through this game though a host is there now (N3, N6).
  await cp.evaluate(() => {
    const c = window.jevAnts.game.colonies[0];
    c.load[c.alive.indexOf(1)] = 1;
  });
  await until(async () => (await locked("Jobs by age").count()) === 0, "a host: Jobs by age open", 3000, 50);
  await guide.getByRole("button", { name: /^Start the notebook afresh/ }).click();
  check((await locked("Jobs by age").count()) === 1, "started afresh: Jobs by age is locked again");
  await cp.waitForTimeout(1200);
  check((await locked("Jobs by age").count()) === 1, "and stays locked through this game, though a host is there");
  check((await cp.evaluate(() => localStorage.getItem("jev-ants:codex-seen"))) === "[]", "and the notebook kept is empty too (S5)");
  await cctx.close();

  // ——— 13. Specimens (PRD §69.5): pin ants from the ant panel, compare and follow them from the inspector ———
  section("13. specimens");
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const sp = await sctx.newPage();
  sp.on("pageerror", (e) => errors.push(String(e)));
  await sp.goto(url);
  await sp.getByLabel("world seed").fill(String(SEED));
  await sp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => sp.evaluate(() => window.jevAnts?.game.landed !== null), "a game for the specimens");
  await sp.getByRole("button", { name: "Pause", exact: true }).click(); // no ant dies or is born under the checks
  const list = sp.getByRole("region", { name: "specimens" });
  const pinBtn = sp.getByRole("button", { name: /^(Pin as a specimen|Pinned)$/ });
  const ants = await sp.evaluate(() => {
    const c = window.jevAnts.game.colonies[0];
    const out = [];
    for (let i = 0; i < c.n && out.length < 5; i++) if (c.alive[i]) out.push(i);
    return out;
  });
  const followAnt = (i) => sp.evaluate((i) => window.jevAnts.follow(0, i), i);
  await followAnt(ants[0]);
  await pinBtn.click();
  check(
    (await list.getByText("No. 1").count()) === 1 && (await pinBtn.getAttribute("aria-pressed")) === "true",
    "pinned: No. 1, the button says so",
  );
  await followAnt(ants[1]);
  await pinBtn.click();
  check((await list.getByText("No. 2").count()) === 1, "a second: No. 2");
  await list.getByRole("button", { name: new RegExp(`^No\\. 1 #${ants[0]} `) }).click();
  check((await sp.evaluate(() => window.jevAnts.followed()?.i)) === ants[0], "a row follows its specimen");
  // Which view that is depends on where the ant stood when the game was paused (a slower runner has run fewer ticks), so read its layer.
  const its = (await sp.evaluate((i) => window.jevAnts.game.colonies[0].layer[i], ants[0])) === 1 ? "below" : "above";
  check((await sp.evaluate(() => window.jevAnts.view())) === its, `and takes the camera to its view (it is ${its}) (review of #218, S2)`);
  await list.getByRole("button", { name: "Unpin No. 2" }).click();
  check((await list.getByText("No. 2").count()) === 0, "unpinned");
  check(await list.evaluate((el) => document.activeElement === el.querySelector("h2 button")), "focus goes to the list's header, not lost");
  // Numbers are kept (owner, review of #218, D1): ants[1] takes No. 2 again (the lowest free), ants[2] No. 3; the fourth,
  // ants[3], replaces the oldest (ants[0]) and takes its No. 1; nothing else is renumbered.
  for (const i of ants.slice(1, 4)) {
    await followAnt(i);
    await pinBtn.click();
  }
  await until(
    async () => (await sp.getByText(new RegExp(`^Three specimens at most: No\\. 1, ant #${ants[0]} of Ink, is unpinned`)).count()) === 1,
    "the notice of a fourth",
    2000,
    50,
  );
  const labelOf = (i) => list.getByRole("button", { name: new RegExp(`^No\\. \\d #${i} `) }).evaluate((b) => b.textContent.slice(0, 5));
  check(
    (await list.getByRole("listitem").count()) === 3 &&
      (await labelOf(ants[1])) === "No. 2" &&
      (await labelOf(ants[2])) === "No. 3" &&
      (await labelOf(ants[3])) === "No. 1",
    "a fourth replaces the oldest and takes its number; the others keep theirs",
  );
  // A fifth replaces the oldest left, ants[1]: the notice names its kept number, No. 2, not its place in the list (S3).
  await followAnt(ants[4]);
  await pinBtn.click();
  await until(
    async () => (await sp.getByText(new RegExp(`^Three specimens at most: No\\. 2, ant #${ants[1]} of Ink, is unpinned`)).count()) === 1,
    "the notice of a fifth names the number it frees",
    2000,
    50,
  );
  // A specimen that dies leaves, with a notice naming it; the rest keep their numbers; with nothing followed the list stays.
  await sp.getByRole("button", { name: "Stop following" }).click();
  await sp.evaluate((i) => (window.jevAnts.game.colonies[0].alive[i] = 0), ants[2]);
  await until(
    async () => (await sp.getByText(new RegExp(`^No\\. 3, ant #${ants[2]} of Ink, has died`)).count()) === 1,
    "the notice of a specimen's death",
    3000,
    50,
  );
  check(
    (await list.getByRole("listitem").count()) === 2 &&
      (await list.getByText("No. 3").count()) === 0 &&
      (await labelOf(ants[4])) === "No. 2",
    "it leaves the list, the rest keep their numbers, and the list stays with nothing followed",
  );
  // The header folds the list to one line and back (owner, D2).
  const header = list.getByRole("button", { name: /^Specimens/ });
  await header.click();
  check(
    (await header.getAttribute("aria-expanded")) === "false" &&
      (await list.getByRole("listitem").count()) === 0 &&
      /: 2/.test(await header.innerText()),
    "folded: one line, its count",
  );
  await header.click();
  check((await list.getByRole("listitem").count()) === 2, "and open again");
  // A new game starts with none (S2).
  await sp.keyboard.press("Control+k");
  await sp.keyboard.type("Lab mode");
  await sp.keyboard.press("Enter");
  await sp.getByRole("region", { name: "lab" }).getByRole("tab", { name: "World" }).click();
  await sp.getByRole("button", { name: "Restart", exact: true }).click();
  await until(async () => (await list.count()) === 0, "a new game starts with no specimens", 3000, 50);
  check(true, "a new game starts with no specimens");
  await sctx.close();
  // On a phone the list folds when the follow ends (D2).
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const pp = await pctx.newPage();
  pp.on("pageerror", (e) => errors.push(String(e)));
  await pp.goto(url);
  await pp.getByRole("button", { name: "Start without the tutorial", exact: true }).tap();
  await until(() => pp.evaluate(() => window.jevAnts?.game.landed !== null), "a phone game for the specimens");
  await pp.getByRole("button", { name: "Pause", exact: true }).tap();
  await pp.evaluate(() => window.jevAnts.follow(0, window.jevAnts.game.colonies[0].alive.indexOf(1)));
  await pp.getByRole("button", { name: "Pin as a specimen" }).tap();
  const plist = pp.getByRole("region", { name: "specimens" });
  check((await plist.getByRole("listitem").count()) === 1, "on a phone, open while an ant is followed");
  await pp.getByRole("button", { name: "Stop following" }).tap();
  await until(async () => (await plist.getByRole("listitem").count()) === 0, "on a phone, folded once nothing is followed", 2000, 50);
  check((await plist.count()) === 1, "on a phone, folded to one line once nothing is followed");
  await pctx.close();

  // ——— 14. Notices (PRD §69.6): swipe a toast away; the bell at the top right keeps it ———
  // A real finger (CDP touch events, review of #219 S2): the mouse would not show a browser taking the drag as a pan.
  section("14. notices");
  const nctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const np2 = await nctx2.newPage();
  np2.on("pageerror", (e) => errors.push(String(e)));
  await np2.goto(url);
  await np2.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => np2.evaluate(() => !!window.jevAnts?.game.world), "the notices page's game");
  await np2.getByRole("button", { name: "Pause", exact: true }).tap();
  await noNotices(np2, "the game's own notices to go before the checks raise theirs");
  const cdp = await nctx2.newCDPSession(np2);
  /** One finger down at the first point, held `holdMs`, moved through the rest, lifted. */
  const finger = async (pts, holdMs = 0) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
    if (holdMs) await sleep(holdMs);
    for (const [x, y] of pts.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const bell = np2.getByRole("button", { name: "Notices", exact: true });
  const bellBox = await bell.boundingBox();
  check(bellBox !== null && bellBox.x + bellBox.width > 390 - 24 && bellBox.y < 140, "the bell sits at the top right");
  const raise = async (text) => {
    await np2.evaluate((t) => window.jevAnts.notify(t, "good"), text);
    const t = np2.getByRole("button", { name: `${text} (dismiss)` });
    await until(() => t.isVisible(), `"${text}" shows`, 3000, 50);
    const b = await t.boundingBox();
    return { t, x: b.x + 20, y: b.y + b.height / 2 };
  };
  const a = await raise("A notice to swipe away.");
  await finger([
    [a.x, a.y],
    [a.x + 5, a.y],
    [a.x + 12, a.y],
  ]);
  await sleep(300); // a check that the notice was not taken away: no condition to poll for, a short settle
  check(await a.t.isVisible(), "a small drag slides it back");
  const shown = await np2.evaluate(() => document.querySelectorAll('[role="status"] button').length);
  await finger([
    [a.x, a.y],
    [a.x + 40, a.y],
    [a.x + 90, a.y],
    [a.x + 160, a.y],
  ]);
  await until(async () => (await a.t.count()) === 0, "a finger's swipe sideways takes it away", 10_000, 50);
  check((await np2.evaluate(() => document.querySelectorAll('[role="status"] button').length)) === shown - 1, "and only it");
  // A notice held past its time stays, and lifting the hold leaves it (review of #219, N1).
  const h = await raise("A notice to hold.");
  await finger([[h.x, h.y]], 7000 + 1000);
  await sleep(300); // likewise: that it stayed
  check(await h.t.isVisible(), "a notice held outlives its 7 s, and lifting the hold leaves it");
  check(/new/.test((await bell.getAttribute("title")) ?? ""), "the bell counts what is new");
  // Escape closes the list and not the drawer under it; the field's toasts hide while the list is open.
  await mutations(np2).tap();
  await bell.tap();
  const noticeList = np2.getByRole("region", { name: "notices" });
  check((await bell.getAttribute("aria-expanded")) === "true", "the bell says the list is open");
  check((await noticeList.getByText("A notice to swipe away.").count()) === 1, "the bell's list keeps the swiped notice");
  check(!/new/.test((await bell.getAttribute("title")) ?? ""), "opening the list clears the count");
  check((await np2.locator('[role="status"] button').count()) === 0, "the field's notices hide while the list is open");
  await np2.keyboard.press("Escape");
  check((await noticeList.count()) === 0, "Escape closes the list");
  check((await np2.locator('[role="status"] button').count()) === 0, "and what it showed doesn't come back onto the field");
  check(await np2.getByRole("region", { name: "mutations" }).isVisible(), "and leaves the drawer under it open");
  await np2.keyboard.press("Escape");
  // A tap outside the list closes it.
  await bell.tap();
  check((await noticeList.count()) === 1, "the list opens again");
  await np2.touchscreen.tap(20, 600);
  await until(async () => (await noticeList.count()) === 0, "a tap outside closes the list", 3000, 50);
  // While building, the notices sit between the HUD and the tray.
  await np2.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Builder", exact: true }).tap();
  const tray = await np2.getByRole("navigation", { name: "builder tools" }).boundingBox();
  const b2 = await raise("A notice while building.");
  const tb2 = await b2.t.boundingBox();
  check(tb2.y > 100 && tb2.y + tb2.height < tray.y, `while building, a notice sits under the HUD, above the tray (${Math.round(tb2.y)})`);
  await nctx2.close();

  // ——— 15. Lab mode (PRD §69.7): a workbench under the map; history charts, a step control, the game's numbers ———
  section("15. Lab mode");
  const bctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const lbp = await bctx2.newPage();
  lbp.on("pageerror", (e) => errors.push(String(e)));
  await lbp.goto(url);
  await lbp.getByLabel("world seed").fill(String(SEED));
  await lbp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => lbp.evaluate(() => (window.jevAnts?.game.time ?? 0) > 4), "a game a few seconds in, for the Lab", 20_000, 100);
  const canvasH = () =>
    lbp
      .locator("canvas")
      .first()
      .evaluate((c) => c.getBoundingClientRect().height);
  const fullH = await canvasH();
  await lbp.locator("canvas").first().focus();
  await lbp.keyboard.press("l");
  const bench = lbp.getByRole("region", { name: "lab" });
  await bench.waitFor({ timeout: 3000 });
  await until(async () => (await canvasH()) < fullH * 0.7, "the map shares the screen with the Lab", 3000, 50);
  check(true, `the map shares the screen with the Lab (${Math.round(fullH)} → ${Math.round(await canvasH())} px)`);
  // The history: four charts, one line a colony where it is per colony, and a readout under the pointer.
  const livingFig = bench.getByRole("figure", { name: "Living ants", exact: true });
  await livingFig.waitFor({ timeout: 3000 });
  check((await bench.getByRole("figure").count()) === 4, "four history charts");
  check((await livingFig.locator("svg path").count()) === 2, "a line for each colony");
  const livingBox = await livingFig.locator("svg").boundingBox();
  await lbp.mouse.move(livingBox.x + livingBox.width * 0.5, livingBox.y + livingBox.height * 0.5);
  check(/Ink[\s\S]*Amber/.test((await livingFig.getByRole("status").textContent()) ?? ""), "the crosshair reads out every line");
  await lbp.mouse.move(livingBox.x + livingBox.width * 0.5, livingBox.y - 40);
  // The keyboard reads the chart too: focused, the arrow keys move the crosshair back from now.
  await livingFig.locator("svg").focus();
  await lbp.keyboard.press("ArrowLeft");
  check(/Ink[\s\S]*Amber/.test((await livingFig.getByRole("status").textContent()) ?? ""), "the arrow keys read a chart out too");
  await lbp.keyboard.press("Escape");
  check((await livingFig.getByRole("status").count()) === 0, "and Escape puts the crosshair away");
  await bench.getByText("As a table").click();
  const tableRows = bench.locator("table tbody tr");
  check(
    (await tableRows.count()) >= 2 && /^0:00/.test((await tableRows.first().locator("td").first().textContent()) ?? ""),
    "and the same numbers as a table, from the start",
  );
  // A notice clears the workbench rather than covering it.
  await lbp.evaluate(() => window.jevAnts.notify("A notice in Lab mode.", "good"));
  const labNote = lbp.getByRole("button", { name: "A notice in Lab mode. (dismiss)" });
  await until(() => labNote.isVisible(), "a notice shows in Lab mode", 3000, 50);
  const [noteBox, benchBox] = [await labNote.boundingBox(), await bench.boundingBox()];
  check(
    noteBox.y + noteBox.height <= benchBox.y,
    `a notice sits above the workbench (${Math.round(noteBox.y + noteBox.height)} ≤ ${Math.round(benchBox.y)})`,
  );
  // The step control: off while playing; paused, a tick is 1/30 s and a second is 30 ticks.
  const stepTick = bench.getByRole("button", { name: "Step a tick" });
  check(await stepTick.isDisabled(), "the steps wait while the game plays");
  await bench.getByRole("group", { name: "step" }).getByRole("button", { name: "Pause" }).click();
  const time0 = await lbp.evaluate(() => window.jevAnts.game.time);
  await stepTick.click();
  const time1 = await lbp.evaluate(() => window.jevAnts.game.time);
  await bench.getByRole("button", { name: "Step a second" }).click();
  const time2 = await lbp.evaluate(() => window.jevAnts.game.time);
  check(
    Math.abs(time1 - time0 - 1 / 30) < 1e-6 && Math.abs(time2 - time1 - 1) < 1e-6,
    `a tick and a second (${(time1 - time0).toFixed(4)}, ${(time2 - time1).toFixed(4)})`,
  );
  // Each tab shows its cards.
  for (const [tab, card] of [
    ["World", "world"],
    ["Jev", "colony jev"],
    ["Levers", "levers"],
    ["Numbers", "debug"],
  ]) {
    await bench.getByRole("tab", { name: tab }).click();
    check((await bench.getByRole("region", { name: card }).count()) === 1, `the ${tab} tab`);
  }
  // The policy is the Lab's Policy tab (PRD §69.8): a "?" on the policy opens it at its section, and the Codex has none.
  await lbp.getByRole("button", { name: "Lab: how the fungus decides" }).first().click();
  check(
    (await bench.getByRole("tab", { name: "Policy" }).getAttribute("aria-selected")) === "true" &&
      (await bench.locator("details#lab-fungus").evaluate((d) => d.open)),
    "the aim's “?” opens the Lab's Policy tab at the fungus's section",
  );
  check(
    await lbp.evaluate(() => document.activeElement?.closest("details")?.id === "lab-fungus"),
    "and the keyboard's focus lands in that section",
  );
  // Escape, with focus in the Lab, closes it and gives the map the focus (owner, D1 on #237); then l opens it again.
  await lbp.keyboard.press("Escape");
  await until(() => bench.count().then((n) => n === 0), "Escape in the Lab closes it", 3000, 50);
  check(await lbp.evaluate(() => document.activeElement?.tagName === "CANVAS"), "Escape in the Lab closes it, and the map has the focus");
  await lbp.keyboard.press("l");
  await bench.waitFor({ timeout: 3000 });
  await lbp.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Codex", exact: true }).click();
  const codexTabs = lbp.getByRole("dialog", { name: "Codex" }).getByRole("tab");
  check(
    JSON.stringify(await codexTabs.allTextContents()) === JSON.stringify(["Field guide", "Nest"]),
    "the Codex keeps the field guide and the nest",
  );
  // Policy's pointer to the moved controls opens the Levers tab and leaves the keyboard on it (review of #237, N2).
  await lbp.getByRole("button", { name: "Close the Codex" }).click();
  await bench.getByRole("tab", { name: "Policy" }).click();
  await bench.getByRole("button", { name: "The menu and the two settings: the Levers tab" }).focus();
  await lbp.keyboard.press("Enter");
  check(
    await lbp.evaluate(() => document.activeElement?.getAttribute("role") === "tab" && document.activeElement.textContent === "Levers"),
    "Policy's “the Levers tab” opens it and leaves the focus on its tab",
  );
  await lbp.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Codex", exact: true }).click();
  await lbp.getByRole("dialog", { name: "Codex" }).waitFor({ timeout: 3000 });
  // One Escape, one thing: with the Codex open over it, Escape in the Lab closes the Codex and leaves the Lab.
  await bench.getByRole("tab", { name: "World" }).focus();
  await lbp.keyboard.press("Escape");
  await until(
    () =>
      lbp
        .getByRole("dialog", { name: "Codex" })
        .count()
        .then((n) => n === 0),
    "Escape closes the Codex first",
    3000,
    50,
  );
  check((await bench.count()) === 1, "with the Codex over the Lab, Escape closes the Codex and leaves the Lab");
  // The Lab's ×, by key, gives the map the focus as Escape does.
  await bench.getByRole("button", { name: "Close the Lab" }).focus();
  await lbp.keyboard.press("Enter");
  await until(() => bench.count().then((n) => n === 0), "the × closes the Lab", 3000, 50);
  check(await lbp.evaluate(() => document.activeElement?.tagName === "CANVAS"), "the Lab's × gives the map the focus");
  await lbp.keyboard.press("l");
  await bench.waitFor({ timeout: 3000 });
  // Opening the Lab takes no focus: from nowhere (as after Start), l then Space still works (the step control paused the
  // game above, so here Space plays it; review of #237, S1).
  await lbp.keyboard.press("l");
  await until(() => bench.count().then((n) => n === 0), "l closes the Lab", 3000, 50);
  await lbp.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await lbp.keyboard.press("l");
  await bench.waitFor({ timeout: 3000 });
  check(
    await lbp.evaluate(() => document.activeElement?.getAttribute("role") !== "tab"),
    "opening the Lab from nowhere leaves its tabs unfocused",
  );
  const runs = async () => {
    const a = await lbp.evaluate(() => window.jevAnts.game.time);
    await lbp.waitForTimeout(300);
    return (await lbp.evaluate(() => window.jevAnts.game.time)) !== a;
  };
  const ranBefore = await runs();
  await lbp.keyboard.press(" ");
  await lbp.waitForTimeout(100);
  check((await runs()) !== ranBefore, "and Space plays or pauses the game");
  await lbp.locator("canvas").first().focus();
  await lbp.keyboard.press("l");
  await until(
    async () => (await bench.count()) === 0 && (await canvasH()) > fullH * 0.95,
    "l closes the Lab and gives the map back",
    3000,
    50,
  );
  check(true, "l closes the Lab and gives the map back the screen");
  await bctx2.close();

  // ——— 16. Polish (PRD §69.9): appearance, motion, notices on a phone ———
  section("16. polish");
  const plctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
  const plp = await plctx.newPage();
  plp.on("pageerror", (e) => errors.push(String(e)));
  await plp.goto(url);
  await plp.getByLabel("world seed").fill(String(SEED));
  await plp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => plp.evaluate(() => !!window.jevAnts?.game.world), "a game for the polish checks", 20_000, 100);
  const theme = () => plp.evaluate(() => [document.documentElement.dataset.theme ?? null, localStorage.getItem("jevants.theme")]);
  const paper = () => plp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--paper").trim());
  const lightPaper = await paper();
  const pnav = plp.getByRole("navigation", { name: "panels" });
  await pnav.getByRole("button", { name: "Settings", exact: true }).click();
  check(
    (await plp.getByRole("group", { name: "appearance" }).getByRole("button", { name: "System" }).getAttribute("aria-pressed")) === "true",
    "Settings → Appearance starts on System",
  );
  // Motion: a drawer arrives with its animation, from the rail's side.
  check(
    (await plp.getByRole("region", { name: "settings" }).evaluate((e) => getComputedStyle(e).animationName)) === "panel-in",
    "a drawer fades in (opacity only: nothing moves under a tap)",
  );
  await plp.getByRole("group", { name: "appearance" }).getByRole("button", { name: "Dark" }).click();
  const darkPaper = await paper();
  check(JSON.stringify(await theme()) === JSON.stringify(["dark", "dark"]), "Dark: data-theme on the page, and kept");
  check(darkPaper !== lightPaper, `and the page is dark on a light system (${lightPaper} → ${darkPaper})`);
  await plp.reload();
  check((await theme())[0] === "dark", "a reload keeps it, before the first paint");
  await plp
    .getByRole("button", { name: "Start without the tutorial", exact: true })
    .click({ timeout: 2000 })
    .catch(() => {});
  await plp.keyboard.press("Control+k");
  await plp.keyboard.type("Appearance: light");
  await plp.keyboard.press("Enter");
  await until(async () => (await theme())[0] === "light", "the palette sets Light", 3000, 50);
  check((await paper()) === lightPaper, "the palette: Appearance: light, and the page is light again");
  await plp.keyboard.press("Control+k");
  await plp.keyboard.type("Appearance: system");
  await plp.keyboard.press("Enter");
  await until(async () => (await theme())[0] === null, "the palette sets System", 3000, 50);
  check(JSON.stringify(await theme()) === JSON.stringify([null, null]), "System: no data-theme, nothing kept");
  await plctx.close();
  // Reduced motion: no animation on a drawer.
  const rctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  rp.on("pageerror", (e) => errors.push(String(e)));
  await rp.goto(url);
  await rp.getByLabel("world seed").fill(String(SEED));
  await rp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => rp.evaluate(() => !!window.jevAnts?.game.world), "a game for the reduced-motion check", 20_000, 100);
  await rp.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Settings", exact: true }).click();
  check(
    (await rp.getByRole("region", { name: "settings" }).evaluate((e) => getComputedStyle(e).animationName)) === "none",
    "with reduced motion a drawer just appears",
  );
  await rctx.close();
  // A phone: an open sheet takes the screen, so a notice waits in the bell; closed, it shows.
  const hctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const hp = await hctx.newPage();
  hp.on("pageerror", (e) => errors.push(String(e)));
  await hp.goto(url);
  await hp.getByLabel("world seed").fill(String(SEED));
  await hp.getByRole("button", { name: "Start without the tutorial", exact: true }).tap();
  await until(() => hp.evaluate(() => !!window.jevAnts?.game.world), "a game for the phone checks", 20_000, 100);
  await hp.getByRole("button", { name: "Pause", exact: true }).tap();
  await noNotices(hp, "the game's own notices to go before the checks raise theirs");
  await hp.getByRole("navigation", { name: "panels" }).getByRole("button", { name: "Colonies", exact: true }).tap();
  await hp
    .getByRole("region", { name: "colonies" })
    .waitFor({ timeout: 3000 })
    .catch(() => {});
  await hp.evaluate(() => window.jevAnts.notify("A notice behind a sheet.", "good"));
  await hp.waitForTimeout(300);
  // Unseen but still announced: the live region is cut to a pixel (sr-only), not removed from the page.
  const hiddenRegion = hp.locator('[role="status"][aria-live="polite"]').filter({ hasText: "A notice behind a sheet." });
  const hiddenBox = await hiddenRegion.boundingBox();
  check(
    hiddenBox !== null && hiddenBox.width <= 2 && hiddenBox.height <= 2,
    "on a phone an open sheet is not covered: the notice is cut to a pixel, still in the page for a screen reader, and waits in the bell",
  );
  await hp
    .getByRole("button", { name: /^Close/ })
    .first()
    .tap();
  await hp.evaluate(() => window.jevAnts.notify("A notice over the map.", "info"));
  await until(
    () => hp.getByRole("button", { name: "A notice over the map. (dismiss)" }).isVisible(),
    "with no sheet open, the notice shows",
    3000,
    50,
  );
  await hctx.close();
  // ——— 17. Fewer notices (PRD §69.10): repeats count up; "Important only" and "Bell only" thin the field ———
  section("17. fewer notices");
  const fctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const fp = await fctx.newPage();
  fp.on("pageerror", (e) => errors.push(String(e)));
  await fp.goto(url);
  await fp.getByLabel("world seed").fill(String(SEED));
  await fp.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
  await until(() => fp.evaluate(() => !!window.jevAnts?.game.world), "a game for the notices checks", 20_000, 100);
  await fp.getByRole("button", { name: "Pause", exact: true }).click();
  await noNotices(fp, "the game's own notices to go before the checks raise theirs");
  const raiseF = (text, tone = "info") => fp.evaluate(([t, o]) => window.jevAnts.notify(t, o), [text, tone]);
  const floats = async (text) => {
    const b = await fp.getByRole("button", { name: new RegExp(text.replace(/[.]/g, "\\.")) }).boundingBox();
    return b !== null && b.width > 4;
  };
  await raiseF("An ant found your sugar!", "good");
  await raiseF("An ant found your sugar!", "good");
  await raiseF("An ant found your sugar!", "good");
  const sugar = fp.getByRole("button", { name: /An ant found your sugar!/ });
  await until(() => sugar.isVisible(), "the notice", 3000, 50);
  check(
    (await fp.getByRole("button", { name: /An ant found your sugar!/ }).count()) === 1 &&
      /3 times/.test((await sugar.getAttribute("aria-label")) ?? ""),
    "the same notice three times is one toast, counted (×3)",
  );
  const bellF = fp.getByRole("button", { name: "Notices", exact: true });
  await bellF.click();
  check(((await fp.getByRole("region", { name: "notices" }).textContent()) ?? "").includes("×3"), "and one line in the bell, counted");
  const levelF = fp.getByRole("group", { name: "notices over the map" });
  await levelF.getByRole("button", { name: "Important only" }).click();
  await bellF.click();
  await raiseF("A passing remark.", "info");
  await raiseF("Jev stopped, for a test.", "warn");
  await fp.waitForTimeout(300);
  check(
    !(await floats("A passing remark.")) && (await floats("Jev stopped, for a test.")),
    "Important only: the warning floats over the map, the remark does not",
  );
  await bellF.click();
  await levelF.getByRole("button", { name: "Bell only" }).click();
  await bellF.click();
  await raiseF("Another warning, for a test.", "warn");
  await fp.waitForTimeout(300);
  check(!(await floats("Another warning, for a test.")), "Bell only: not even a warning floats over the map");
  check(
    (await fp.locator('[role="status"] button').filter({ hasText: "Another warning" }).count()) === 1,
    "but it is still in the page for a screen reader",
  );
  await fp.reload();
  check((await fp.evaluate(() => localStorage.getItem("jevants.notices"))) === "bell", "the choice is kept across a reload");
  await fctx.close();
  // ——— 18. The fog of war (docs/fog-of-war.md, F3.6, `?fog=1`) ———
  section("18. the fog of war");
  // Two pages of one seed stepped the same by the hook: the sim is deterministic, so what differs is the page.
  const fogPage = async (query) => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(`${url}${query}`);
    await p.getByLabel("world seed").fill(String(SEED));
    await p.getByRole("button", { name: "Start without the tutorial", exact: true }).click();
    await until(() => p.evaluate(() => !!window.jevAnts?.game.world), "a game for the fog checks", 20_000, 100);
    await p.getByRole("button", { name: "Pause", exact: true }).click();
    return { c, p };
  };
  const { c: gctx, p: gp } = await fogPage("?fog=1");
  // The first infected ant of any colony: where it is, on which view.
  const findHost = () =>
    gp.evaluate(() => {
      const g = window.jevAnts.game;
      for (const c of g.colonies)
        for (let i = 0; i < c.n; i++) if (c.alive[i] && c.load[i] >= 0.05 && (c.layer[i] ?? 0) === 0) return { x: c.x[i], y: c.y[i] };
      return null;
    });
  let host = null;
  for (let round = 0; round < 30 && !host; round++) {
    await gp.evaluate(() => window.jevAnts.step(100));
    host = await findHost();
  }
  check(host !== null, "a host is found on the plane");
  const stateAt = (x, y) => gp.evaluate(([a, b]) => window.jevAnts.fogState("above", a, b), [x, y]);
  check((await stateAt(host.x, host.y)) === 2, "the cell under a host is live");
  check((await stateAt(0.5, 0.5)) === 0, "a cell nothing has sensed is unknown");
  // It walks away (or dies): its old cell turns remembered, never unknown again.
  let away = false;
  for (let round = 0; round < 200 && !away; round++) {
    await gp.evaluate(() => window.jevAnts.step(30));
    away = (await stateAt(host.x, host.y)) === 1;
  }
  check(away, "once the host has walked away its cell is remembered, not live");
  await gp.evaluate(() => window.jevAnts.step(300));
  check((await stateAt(host.x, host.y)) !== 0, "and stays explored");
  check((await stateAt(0.5, 0.5)) === 0, "while the ground no host has been near is still unknown");
  await gp.waitForTimeout(500);
  const nofog = await fogPage("");
  check((await nofog.p.evaluate(() => window.jevAnts.fogState("above", 5, 5))) === null, "without ?fog=1 the page has no fog");
  // The frame time: the same game, the same steps, zoomed in to hexagons, paused (so a frame is drawing alone). The fog may cost a little, not a phone's frame rate (PR #408).
  const frames = async (p) => {
    await p.mouse.move(640, 450);
    for (let i = 0; i < 6; i++) await p.mouse.wheel(0, -300);
    await p.waitForTimeout(500);
    return p.evaluate(
      () =>
        new Promise((done) => {
          const ds = [];
          let last = performance.now();
          const t = () => {
            const n = performance.now();
            ds.push(n - last);
            last = n;
            if (ds.length < 90) requestAnimationFrame(t);
            else done(ds.sort((a, b) => a - b)[ds.length >> 1]);
          };
          requestAnimationFrame(t);
        }),
    );
  };
  const simTime = await gp.evaluate(() => window.jevAnts.game.time);
  await nofog.p.evaluate((n) => window.jevAnts.step(n), Math.round(simTime * 30)); // REHEARSE_DT is 1/30
  const fogMs = await frames(gp);
  const baseMs = await frames(nofog.p);
  console.log(`  frame time, paused and zoomed in: fog ${fogMs.toFixed(1)} ms, no fog ${baseMs.toFixed(1)} ms`);
  check(fogMs <= Math.max(baseMs * 1.6, baseMs + 12), "the fog's frame time is within noise of the game without it");
  await gctx.close();
  await nofog.c.close();
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
  console.log(`e2e-one-world: all passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await stop();
  process.exit(0);
} catch (e) {
  const why = `${e instanceof Error ? e.message : e}${errors.length ? `\npage errors: ${errors.join("\n")}` : ""}`;
  console.error(`e2e-one-world: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s in "${step}": ${why}`);
  if (process.env.GITHUB_ACTIONS === "true") {
    const line = `in "${step}", after "${lastOk ?? "no check"}": ${why}`.replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
    console.log(`::error title=e2e-one-world failed::${line}`);
  }
  await saveFailure().catch((err) => console.error(`e2e-one-world: could not save the failure's pages: ${err}`));
  await stop();
  process.exit(1);
}
