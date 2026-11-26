import { useCallback, useEffect, useRef, useState } from "react";
import { CURTAIN, PLANE, type Game } from "../colony/index.ts";
import ColonyField, { type FieldApi } from "../ui/ColonyField.tsx";
import Segmented from "../ui/Segmented.tsx";
import { fogFromUrl, sensedFor } from "../ui/fog/sources.ts";
import type { Followed } from "../ui/follow.ts";
import { BROWSER_ENV, MAX_STEP } from "../ui/gameLoop.ts";
import { buildGame, GAME_SPEED, MAX_SPEED } from "../ui/useColony.ts";
import { buildTrialGame, TrialClock, trialSettings } from "./workerTrial.ts";
import { mapTrialBoundary, receiveMapFrame, type MapTrialCommand, type MapTrialReply } from "./mapTrialState.ts";

type MapView = { game: Game; sensed: ReturnType<typeof sensedFor> };
const SPEEDS = [1, 2, 4, MAX_SPEED];
const FLOAT = "rounded-lg border border-line bg-ground px-2 py-1 text-sm shadow-sm";

export default function MapTrialPage({ workerMode }: { workerMode: boolean }) {
  const [view, setView] = useState(PLANE);
  const [followed, setFollowed] = useState<Followed | null>(null);
  const [world, setWorld] = useState<MapView>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(GAME_SPEED);
  const [error, setError] = useState("");
  const [ended, setEnded] = useState("");
  const [stats, setStats] = useState({ time: 0, pace: 0, frameMs: 0 });
  const field = useRef<FieldApi>(null);
  const listeners = useRef(new Set<() => void>());
  const endpoint = useRef<Worker | undefined>(undefined);
  const clock = useRef(new TrialClock());
  const controls = useRef({ playing, speed });
  const [seed] = useState(() => {
    const raw = Number(new URLSearchParams(location.search).get("seed"));
    return Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
  });

  const onFrame = useCallback((fn: () => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  const link = useCallback((layer: number, x: number, y: number) => {
    field.current?.centreOn(layer, x, y, { close: true });
    setView(layer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let worker: Worker | undefined;
    const makeView = (game: Game): MapView => ({ game, sensed: sensedFor(game, fogFromUrl()) });

    async function init(): Promise<void> {
      if (!workerMode) {
        const game = await buildTrialGame(seed);
        if (cancelled) return;
        const initial = makeView(game);
        initial.sensed.stampGame(game);
        setWorld(initial);
        return;
      }
      const mirror = makeView(buildGame(trialSettings(seed)));
      worker = new Worker(new URL("./mapTrialEntry.ts", import.meta.url), { type: "module" });
      endpoint.current = worker;
      worker.onmessage = ({ data }: MessageEvent<MapTrialReply>) => {
        if (data.type !== "frame") {
          setPlaying(false);
          if (data.type === "error") setError(data.message);
          else setEnded(data.message);
          return;
        }
        receiveMapFrame(mirror.game, data);
        mirror.sensed.stampGame(mirror.game);
        setWorld(mirror);
        if (data.end) {
          setPlaying(false);
          setEnded(data.end);
        }
      };
      worker.onerror = (event) => {
        setPlaying(false);
        setError(event.message || "Could not run the simulation worker");
      };
      worker.postMessage({ type: "init", seed } satisfies MapTrialCommand);
    }

    void init().catch((cause: unknown) => {
      if (!cancelled) setError(String(cause));
    });
    return () => {
      cancelled = true;
      worker?.terminate();
      endpoint.current = undefined;
    };
  }, [seed, workerMode]);

  useEffect(() => {
    controls.current = { playing, speed };
    const sync = () => {
      const active = playing && !document.hidden;
      clock.current.speed = speed;
      clock.current.reset(BROWSER_ENV.now());
      endpoint.current?.postMessage({ type: "clock", playing: active, speed } satisfies MapTrialCommand);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [playing, speed]);

  useEffect(() => {
    if (!world) return;
    const { game, sensed } = world;
    let request = 0;
    let wall = BROWSER_ENV.now();
    let last = wall;
    let sim = game.time;
    const gaps: number[] = [];
    clock.current.reset(wall);
    const draw = () => {
      const now = BROWSER_ENV.now();
      if (!workerMode && controls.current.playing && !document.hidden) {
        clock.current.pump(now, () => {
          if (mapTrialBoundary(game)) return;
          game.tick(MAX_STEP);
          sensed.stampGame(game);
        });
        const end = mapTrialBoundary(game);
        if (end) {
          setPlaying(false);
          setEnded(end);
        }
      }
      if (!document.hidden) gaps.push(now - last);
      last = now;
      if (now - wall >= 1000) {
        gaps.sort((a, b) => a - b);
        setStats({
          time: game.time,
          pace: ((game.time - sim) * 1000) / (now - wall),
          frameMs: gaps[Math.ceil(gaps.length * 0.95) - 1] ?? 0,
        });
        gaps.length = 0;
        sim = game.time;
        wall = now;
      }
      for (const render of listeners.current) render();
      request = BROWSER_ENV.request(draw);
    };
    request = BROWSER_ENV.request(draw);
    return () => BROWSER_ENV.cancel(request);
  }, [world, workerMode]);

  const peerUrl = new URL(location.href);
  peerUrl.searchParams.set("worker", workerMode ? "0" : "1");
  return (
    <main className="fixed inset-0 overflow-hidden bg-ground text-fg">
      <div className="absolute inset-0">
        {world && (
          <ColonyField
            colonies={world.game.colonies}
            fungus={world.game.fungus}
            sensed={world.sensed}
            world={world.game.world}
            view={view}
            apiRef={field}
            onFrame={onFrame}
            showFoodTrail
            showHomeTrail={false}
            followed={followed}
            onFollow={setFollowed}
            onLink={link}
            onCross={link}
            toolsAt="top-[8rem] right-2"
          />
        )}
      </div>
      <header className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-wrap gap-1.5">
        <div className={`pointer-events-auto flex flex-wrap items-center gap-2 ${FLOAT}`}>
          <button
            type="button"
            className="min-h-10 rounded border border-line px-2 disabled:opacity-50"
            disabled={!world || Boolean(ended || error)}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <Segmented
            label="Speed"
            options={SPEEDS.map((value) => ({
              key: String(value),
              label: `${value}×`,
              on: speed === value,
              onPick: () => setSpeed(value),
            }))}
          />
          <Segmented
            label="View"
            options={[
              { key: "above", label: "above", on: view === PLANE, onPick: () => setView(PLANE) },
              { key: "below", label: "below", on: view !== PLANE, onPick: () => setView(CURTAIN) },
            ]}
          />
        </div>
        <div className={`pointer-events-auto flex flex-wrap items-center gap-x-2 ${FLOAT}`}>
          <span>
            {workerMode ? "Web Worker" : "Main thread"} · Seed {seed}
          </span>
          <a className="underline" href={peerUrl.href}>
            {workerMode ? "Try main thread" : "Try Web Worker"}
          </a>
          <output data-sim-time={stats.time} data-pace={stats.pace} data-frame-ms={stats.frameMs}>
            {error ||
              ended ||
              (world
                ? `${stats.time.toFixed(1)} s · ${stats.pace.toFixed(2)}× actual · ${stats.frameMs.toFixed(0)} ms p95 frame gap`
                : "Loading world")}
          </output>
        </div>
      </header>
    </main>
  );
}
