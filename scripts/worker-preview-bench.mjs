// Start the opt-in preview twice with the same seed and bundled policies.
// Usage: node scripts/worker-preview-bench.mjs [cpu-throttle=4] [seconds=8] [preview-url]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startDevServer } from "./lib/devServer.mjs";

const [throttleArg = "4", secondsArg = "8", previewUrl] = process.argv.slice(2);
const cpuThrottle = Number(throttleArg);
const seconds = Number(secondsArg);
assert.ok(Number.isFinite(cpuThrottle) && cpuThrottle >= 1, "CPU throttle must be at least 1");
assert.ok(Number.isFinite(seconds) && seconds > 0, "duration must be positive");
const { chromium } = createRequire(import.meta.url)("playwright");
const server = previewUrl ? { url: previewUrl, stop: () => {} } : await startDevServer();
try {
  const browser = await chromium.launch();
  try {
    for (const mode of ["main", "worker"]) {
      const page = await browser.newPage({
        viewport: { width: 412, height: 816 },
        deviceScaleFactor: 3.5,
        isMobile: true,
        hasTouch: true,
      });
      try {
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
        const url = new URL(server.url);
        url.searchParams.set("worker-preview", mode);
        await page.goto(url.href);
        const play = page.getByRole("button", { name: "Play", exact: true });
        await play.tap();
        await page.waitForFunction(() => Number(document.querySelector("canvas").dataset.simTime) >= 1);
        const result = await page.evaluate(
          (duration) =>
            new Promise((resolve) => {
              const canvas = document.querySelector("canvas");
              const start = performance.now();
              const simStart = Number(canvas.dataset.simTime);
              let last = start;
              const gaps = [];
              function measure(now) {
                gaps.push(now - last);
                last = now;
                const elapsed = now - start;
                if (elapsed < duration) requestAnimationFrame(measure);
                else {
                  gaps.sort((a, b) => a - b);
                  resolve({
                    pace: (Number(canvas.dataset.simTime) - simStart) / (elapsed / 1000),
                    framesPerSecond: gaps.length / (elapsed / 1000),
                    p95FrameMs: gaps[Math.ceil(gaps.length * 0.95) - 1],
                  });
                }
              }
              requestAnimationFrame(measure);
            }),
          seconds * 1000,
        );
        const canvas = page.locator("canvas");
        await page.getByRole("button", { name: "Show above", exact: true }).tap();
        await page.getByRole("button", { name: "Show below", exact: true }).waitFor();
        await page.getByRole("button", { name: "Pause", exact: true }).tap();
        await page.waitForFunction(() => document.querySelector("canvas").dataset.playing === "false");
        const pausedAt = await canvas.getAttribute("data-sim-time");
        await page.waitForTimeout(300);
        assert.equal(await canvas.getAttribute("data-sim-time"), pausedAt, "pause holds the clock");
        await play.tap();
        await page.waitForFunction((time) => Number(document.querySelector("canvas").dataset.simTime) > Number(time), pausedAt);
        const bounds = await canvas.boundingBox();
        assert.ok(bounds);
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + 60, y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        assert.ok(Number(await canvas.getAttribute("data-pan-x")) > 0, "touch drag pans the camera");
        assert.deepEqual(errors, [], "no browser errors");
        console.log(
          `${mode} (${cpuThrottle}× CPU throttle): ${result.pace.toFixed(2)}× pace, ${result.framesPerSecond.toFixed(1)} FPS, ${result.p95FrameMs.toFixed(1)} ms p95 frame gap. Pan, view, pause and resume passed.`,
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  server.stop();
}
