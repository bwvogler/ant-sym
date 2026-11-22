// The page's dev server for a script that drives a browser: Vite on a free port, with no Jev key in its environment (so
// nothing a script does can spend), and a `stop` that ends it. scripts/e2e-devices.mjs uses it; scripts/e2e-one-world.mjs
// starts its own the same way.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web");

const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

/** Start the dev server and wait until it answers. Returns { url, stop }. */
export async function startDevServer() {
  const port = await freePort();
  const env = { ...process.env };
  delete env.JEV_API_KEY;
  const vite = spawn(
    process.execPath,
    [join(WEB, "node_modules/vite/bin/vite.js"), "--port", String(port), "--host", "127.0.0.1", "--strictPort"],
    {
      cwd: WEB,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  vite.stdout.on("data", (d) => (log += d));
  vite.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}/`;
  const end = Date.now() + 60_000;
  for (;;) {
    if (vite.exitCode !== null) throw new Error(`vite exited (${vite.exitCode}):\n${log}`);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > end) {
      vite.kill("SIGTERM");
      throw new Error(`vite did not answer in 60 s:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, stop: () => void vite.kill("SIGTERM") };
}
