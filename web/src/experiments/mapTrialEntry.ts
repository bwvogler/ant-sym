import { MAX_STEP } from "../ui/gameLoop.ts";
import { buildTrialGame, TrialClock } from "./workerTrial.ts";
import { MapTrialSnapshots, mapTrialBoundary, type MapTrialCommand, type MapTrialReply } from "./mapTrialState.ts";

const POSITION_MS = 50;
const GROUND_MS = 250;
const clock = new TrialClock();
const snapshots = new MapTrialSnapshots();
const tasks = new MessageChannel();
let queued = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let playing = false;
let game: Awaited<ReturnType<typeof buildTrialGame>> | undefined;
let positionsAt = -Infinity;
let groundAt = -Infinity;

function publish(now: number, includeGround: boolean): void {
  if (!game) return;
  positionsAt = now;
  if (includeGround) groundAt = now;
  const frame = snapshots.frame(game, playing, includeGround);
  const transfer = frame.colonies.flatMap(({ ants }) => ants.map((a) => a.buffer as ArrayBuffer));
  self.postMessage(frame satisfies MapTrialReply, { transfer });
}

function run(): void {
  if (!game || !playing) return;
  const live = game;
  const now = performance.now();
  const delay = clock.pump(now, () => {
    if (!mapTrialBoundary(live)) live.tick(MAX_STEP);
  });
  const end = mapTrialBoundary(live);
  if (end) {
    playing = false;
    if (live.founded.length > 0) self.postMessage({ type: "end", message: end } satisfies MapTrialReply);
    else publish(now, true);
    return;
  }
  if (now - positionsAt >= POSITION_MS) publish(now, now - groundAt >= GROUND_MS);
  if (delay > 0) timer = setTimeout(run, delay);
  else if (!queued) {
    queued = true;
    tasks.port2.postMessage(null);
  }
}

tasks.port1.onmessage = () => {
  queued = false;
  run();
};

self.addEventListener("message", ({ data }: MessageEvent<MapTrialCommand>) => {
  if (data.type === "init") {
    void buildTrialGame(data.seed, data.antCount)
      .then((fresh) => {
        game = fresh;
        publish(performance.now(), true);
      })
      .catch((error: unknown) => self.postMessage({ type: "error", message: String(error) } satisfies MapTrialReply));
    return;
  }
  if (!game || mapTrialBoundary(game)) return;
  clearTimeout(timer);
  playing = data.playing;
  clock.speed = data.speed;
  const now = performance.now();
  clock.reset(now);
  publish(now, !playing);
  if (playing && !queued) run();
});
