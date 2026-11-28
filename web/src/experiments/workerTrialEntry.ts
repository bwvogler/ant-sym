import { buildTrial, SNAPSHOT_MS, TrialClock, type TrialCommand, type TrialMessage } from "./workerTrial.ts";

function send(message: TrialMessage): void {
  self.postMessage(message, { transfer: message.type === "frame" ? [message.ants.buffer] : [] });
}

async function start(): Promise<void> {
  const trial = await buildTrial();
  const clock = new TrialClock();
  let playing = false;
  let lastSnapshot = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tasks = new MessageChannel();
  let queued = false;

  function publish(now: number): void {
    lastSnapshot = now;
    send(trial.frame(playing));
  }

  function run(): void {
    if (!playing) return;
    const now = performance.now();
    const delay = clock.pump(now, trial.tick);
    if (now - lastSnapshot >= SNAPSHOT_MS) publish(now);
    if (delay > 0) {
      timer = setTimeout(run, delay);
    } else if (!queued) {
      // Yield between bursts so control messages can run even when ticks are behind.
      queued = true;
      tasks.port2.postMessage(null);
    }
  }

  tasks.port1.onmessage = () => {
    queued = false;
    run();
  };

  self.addEventListener("message", ({ data }: MessageEvent<TrialCommand>) => {
    if (data.type !== "play" || data.playing === playing) return;
    clearTimeout(timer);
    playing = data.playing;
    const now = performance.now();
    clock.reset(now);
    publish(now);
    // A queued task from before the pause can start the resumed clock.
    if (playing && !queued) run();
  });

  publish(performance.now());
}

void start().catch((error: unknown) => send({ type: "error", message: String(error) }));
