// Compare real-game rendering and game speed across two local checkouts at a phone-sized Chromium viewport.
// Usage: node scripts/browser-performance.mjs <baseline-web> <candidate-web> [seconds-per-sample=4]
// Requires Playwright with Chromium and installed web dependencies in both checkouts. Uses the keyless dev server for the game metrics.
// PERF_RESULTS optionally names a JSON output file. PERF_SEEDS optionally overrides the comma-separated seeds (default 1,7).
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { startDevServer } from "./lib/devServer.mjs";
import { helpAndExit } from "./lib/usage.mjs";

helpAndExit(import.meta.url);
const [baselinePath, candidatePath, secondsArg = "4"] = process.argv.slice(2);
const seconds = Number(secondsArg);
const seeds = (process.env.PERF_SEEDS ?? "1,7").split(",").map(Number);
assert.ok(baselinePath && candidatePath, "Provide the two web directories");
assert.ok(Number.isFinite(seconds) && seconds >= 2 && seconds <= 30, "Sample duration must be 2–30 seconds");
assert.ok(
  seeds.every((seed) => Number.isSafeInteger(seed) && seed > 0),
  "Seeds must be positive integers",
);
const web = { base: resolve(baselinePath), candidate: resolve(candidatePath) };
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const { defaultBrowserType: _engine, ...phone } = devices["Pixel 6 Pro"];

async function openGame(page, url, seed, worker) {
  const target = new URL(url);
  if (worker !== null) {
    target.searchParams.set("worker", String(worker));
    target.searchParams.set("seed", String(seed));
  }
  await page.goto(target.href);
  if (worker === null) {
    await page.getByLabel("world seed").fill(String(seed));
    await page.getByRole("button", { name: "Start without the tutorial", exact: true }).tap();
  } else {
    await page.getByRole("button", { name: "Play", exact: true }).tap();
  }
  await page.waitForFunction(
    (isTrial) => {
      const time = isTrial
        ? Number(document.querySelector("output[data-sim-time]")?.getAttribute("data-sim-time"))
        : Reflect.get(window, "jevAnts")?.game.time;
      return time >= 2;
    },
    worker !== null,
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
}

async function gesture(cdp, page, zoom) {
  const { width, height } = page.viewportSize();
  const x = width / 2;
  const y = height / 2;
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  if (zoom) {
    await send("touchStart", [
      [x - 40, y],
      [x + 40, y],
    ]);
    await send("touchMove", [
      [x - 70, y],
      [x + 70, y],
    ]);
    await send("touchMove", [
      [x - 95, y],
      [x + 95, y],
    ]);
  } else {
    await send("touchStart", [[x, y]]);
    await send("touchMove", [[x - 40, y + 15]]);
    await send("touchMove", [[x - 80, y + 30]]);
  }
  await send("touchEnd", []);
}

async function sample(page, isTrial) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const read = page.evaluate(
      ({ duration, isTrial }) =>
        new Promise((resolve) => {
          const game = isTrial ? undefined : Reflect.get(window, "jevAnts")?.game;
          const readTime = () => game?.time ?? Number(document.querySelector("output[data-sim-time]")?.getAttribute("data-sim-time"));
          const ticks = [];
          const tick = game?.tick;
          if (game && tick) {
            game.tick = function (step) {
              const start = performance.now();
              tick.call(this, step);
              ticks.push(performance.now() - start);
            };
          }
          const gaps = [];
          let start = -1;
          let last = -1;
          let sim = 0;
          const percentile = (values, q) => {
            values.sort((a, b) => a - b);
            return values[Math.ceil(values.length * q) - 1] ?? null;
          };
          function frame(now) {
            if (start < 0) {
              start = now;
              sim = readTime();
            }
            if (last >= 0) gaps.push(now - last);
            last = now;
            const elapsed = now - start;
            if (elapsed < duration) {
              requestAnimationFrame(frame);
              return;
            }
            if (game && tick) game.tick = tick;
            resolve({
              pace: ((readTime() - sim) * 1000) / elapsed,
              frames: gaps.length,
              frameP95: percentile(gaps, 0.95),
              tickMean: ticks.length ? ticks.reduce((sum, tick) => sum + tick, 0) / ticks.length : null,
              tickP95: percentile(ticks, 0.95),
            });
          }
          requestAnimationFrame(frame);
        }),
      { duration: seconds * 1000, isTrial },
    );
    await page.waitForTimeout(500);
    await gesture(cdp, page, true);
    await page.waitForTimeout(400);
    await gesture(cdp, page, false);
    return await read;
  } finally {
    await cdp.detach();
  }
}

async function scenario(browser, server, revision, seed, worker, view) {
  const page = await browser.newPage(phone);
  try {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openGame(page, server.url, seed, worker);
    if (view === "below") await page.getByRole("button", { name: "below", exact: true }).tap();
    // Let the trial HUD settle after the pause before taking its first timestamp.
    await page.waitForTimeout(1200);
    const paused = await sample(page, worker !== null);
    assert.equal(paused.pace, 0, "The game stayed paused");
    await page.locator("canvas").first().focus();
    await page.keyboard.press("0");
    await page.getByRole("button", { name: "Play", exact: true }).tap();
    await page.waitForTimeout(1200);
    const playing = await sample(page, worker !== null);
    assert.ok(playing.pace > 0, "The game advanced");
    assert.deepEqual(errors, [], "The browser reported no errors");
    return { revision, seed, view, paused, playing };
  } finally {
    await page.close();
  }
}

const results = [];
const browser = await chromium.launch();
const servers = [];
try {
  for (const root of [web.base, web.candidate]) servers.push(await startDevServer(root));
  // Alternate which revision goes first on successive seeds to reduce run-order effects.
  for (let i = 0; i < seeds.length; i++) {
    const view = i % 2 === 0 ? "above" : "below";
    for (const which of i % 2 === 0 ? [0, 1] : [1, 0]) {
      results.push(await scenario(browser, servers[which], which === 0 ? "base" : "PR", seeds[i], null, view));
    }
  }
  if (existsSync(join(web.candidate, "src/experiments/MapTrialPage.tsx"))) {
    for (const worker of [0, 1]) {
      results.push(await scenario(browser, servers[1], worker ? "Worker trial" : "Main-thread trial", seeds[0], worker, "above"));
    }
  }
} finally {
  for (const server of servers) server.stop();
  await browser.close();
}

const format = (n, places = 1) => (n == null ? "—" : n.toFixed(places));
console.log("## Chromium on a Pixel 6 Pro viewport\n");
console.log("Development build, default game settings, 4× target, pinch and pan during each sample. Hosted-runner values vary.\n");
console.log("| Revision | Seed | View | Paused p95 frame ms | 4× p95 frame ms | Actual pace | Tick mean ms | Tick p95 ms |");
console.log("|---|---:|---|---:|---:|---:|---:|---:|");
for (const { revision, seed, view, paused, playing } of results) {
  console.log(
    `| ${revision} | ${seed} | ${view} | ${format(paused.frameP95)} | ${format(playing.frameP95)} | ${format(playing.pace, 2)}× | ${format(playing.tickMean)} | ${format(playing.tickP95)} |`,
  );
}
if (process.env.PERF_RESULTS) writeFileSync(process.env.PERF_RESULTS, JSON.stringify(results, null, 2) + "\n");
