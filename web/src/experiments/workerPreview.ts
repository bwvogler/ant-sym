import { buildTrial, ANT_STRIDE, SNAPSHOT_MS, TrialClock, type TrialCommand, type TrialFrame, type TrialMessage } from "./workerTrial.ts";

type TrialMode = "main" | "worker";

export async function mountWorkerPreview(root: HTMLElement, mode: TrialMode): Promise<void> {
  root.innerHTML = `
    <main class="flex h-dvh flex-col bg-stone-950 text-stone-100">
      <header class="flex flex-wrap items-center gap-3 p-3">
        <h1 class="font-semibold">Simulation preview</h1>
        <a class="underline" href="?worker-preview=main">Main thread</a>
        <a class="underline" href="?worker-preview=worker">Web Worker</a>
        <button class="rounded border px-3 py-2 disabled:opacity-50" data-action="play" disabled>Play</button>
        <button class="rounded border px-3 py-2" data-action="view">Show above</button>
        <output aria-live="off">Loading</output>
      </header>
      <canvas class="min-h-0 w-full flex-1 touch-none bg-stone-900" aria-label="Ant positions. Drag to pan."></canvas>
    </main>`;
  const canvas = root.querySelector("canvas")!;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas 2D is unavailable");
  const play = root.querySelector<HTMLButtonElement>('[data-action="play"]')!;
  const toggleView = root.querySelector<HTMLButtonElement>('[data-action="view"]')!;
  const status = root.querySelector("output")!;
  const clock = new TrialClock();
  let latest: TrialFrame | undefined;
  let playing = false;
  let above = false;
  let panX = 0;
  let panY = 0;
  let pointer: { id: number; x: number; y: number } | undefined;
  let lastSnapshot = -Infinity;
  let local: Awaited<ReturnType<typeof buildTrial>> | undefined;
  let worker: Worker | undefined;
  let request = 0;

  function receive(frame: TrialFrame): void {
    latest = frame;
    play.disabled = false;
    canvas.dataset.simTime = String(frame.time);
    canvas.dataset.playing = String(frame.playing);
    status.value = `${mode === "worker" ? "Web Worker" : "Main thread"} · 4× target · ${frame.time.toFixed(1)} s simulated`;
  }

  function draw(now: number): void {
    if (local && playing && !document.hidden) {
      clock.pump(now, local.tick);
      if (now - lastSnapshot >= SNAPSHOT_MS) {
        receive(local.frame(true));
        lastSnapshot = now;
      }
    }
    if (latest) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx!.clearRect(0, 0, w, h);
      const centre = above ? latest.above : latest.below;
      const zoom = (above ? 4 : 11) * dpr;
      const { ants } = latest;
      for (let i = 0; i < ants.length; i += ANT_STRIDE) {
        if (ants[i + 2] !== centre.layer) continue;
        const x = w / 2 + (ants[i]! - centre.x) * zoom + panX * dpr;
        const y = h / 2 + (ants[i + 1]! - centre.y) * zoom + panY * dpr;
        ctx!.fillStyle = ants[i + 4] ? "#9ce087" : ants[i + 3] === 0 ? "#e4b275" : "#9bc8ee";
        ctx!.fillRect(x, y, 3 * dpr, 3 * dpr);
      }
    }
    request = requestAnimationFrame(draw);
  }

  function syncPlaying(): void {
    const active = playing && !document.hidden;
    clock.reset(performance.now());
    if (local) receive(local.frame(active));
    worker?.postMessage({ type: "play", playing: active } satisfies TrialCommand);
  }

  function fail(message: string): void {
    play.disabled = true;
    status.value = message;
    cancelAnimationFrame(request);
    worker?.terminate();
  }

  play.onclick = () => {
    playing = !playing;
    play.textContent = playing ? "Pause" : "Play";
    syncPlaying();
  };
  toggleView.onclick = () => {
    above = !above;
    panX = panY = 0;
    canvas.dataset.panX = "0";
    toggleView.textContent = above ? "Show below" : "Show above";
  };
  canvas.onpointerdown = (e) => {
    if (pointer) return;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (pointer?.id !== e.pointerId) return;
    panX += e.clientX - pointer.x;
    panY += e.clientY - pointer.y;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.dataset.panX = String(panX);
  };
  canvas.onlostpointercapture = (e) => {
    if (e.pointerId === pointer?.id) pointer = undefined;
  };
  document.addEventListener("visibilitychange", syncPlaying);

  try {
    if (mode === "worker") {
      worker = new Worker(new URL("./workerTrialEntry.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<TrialMessage>) => {
        if (data.type === "frame") receive(data);
        else fail(data.message);
      };
      worker.onerror = (event) => fail(event.message || "The worker could not start");
    } else {
      local = await buildTrial();
      receive(local.frame(false));
    }
    draw(performance.now());
  } catch (error) {
    fail(String(error));
  }
}
