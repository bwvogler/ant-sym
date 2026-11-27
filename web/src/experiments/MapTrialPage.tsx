import { useCallback, useEffect, useRef, useState } from "react";
import { CURTAIN, PLANE, type Game } from "../colony/index.ts";
import ColonyField, { type FieldApi } from "../ui/ColonyField.tsx";
import { antsFromUrl } from "../ui/playbackOptions.ts";
import Segmented from "../ui/Segmented.tsx";
import UpgradeTree from "../ui/UpgradeTree.tsx";
import { fogFromUrl, loadFog, saveFog, sensedFor } from "../ui/fog/sources.ts";
import type { Followed } from "../ui/follow.ts";
import { BROWSER_ENV } from "../ui/gameLoop.ts";
import { buildGame, GAME_SPEED, MAX_SPEED } from "../ui/useColony.ts";
import { trialSettings } from "./workerTrial.ts";
import { openMapTrial, type MapTrialAction, type MapTrialProgress } from "./mapTrialRuntime.ts";
import { receiveMapFrame, type MapTrialCommand, type MapTrialReply } from "./mapTrialState.ts";

type MapView = { game: Game; sensed: ReturnType<typeof sensedFor> };
const SPEEDS = [1, 2, 4, MAX_SPEED];
const FLOAT = "rounded-lg border border-line bg-ground px-2 py-1 text-sm shadow-sm";

export default function MapTrialPage({ workerMode }: { workerMode: boolean }) {
  const [view, setView] = useState(() => (new URLSearchParams(location.search).get("view") === "below" ? CURTAIN : PLANE));
  const [followed, setFollowed] = useState<Followed | null>(null);
  const [world, setWorld] = useState<MapView>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(GAME_SPEED);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<MapTrialProgress>();
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [stats, setStats] = useState({ time: 0, pace: 0, frameMs: 0 });
  const field = useRef<FieldApi>(null);
  const telemetry = useRef<HTMLOutputElement>(null);
  const listeners = useRef(new Set<() => void>());
  const endpoint = useRef<(action: MapTrialAction) => void>(undefined);
  const [antCount] = useState(antsFromUrl);
  const [seed] = useState(() => {
    const raw = Number(new URLSearchParams(location.search).get("seed"));
    return Number.isSafeInteger(raw) && raw > 0 ? raw : 17;
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
    let cleanup: (() => void) | undefined;
    const makeView = (game: Game): MapView => ({ game, sensed: sensedFor(game, fogFromUrl()) });
    const display = (mirror: MapView, next?: MapTrialProgress) => {
      mirror.sensed.stampGame(mirror.game);
      if (telemetry.current) telemetry.current.dataset.simTime = String(mirror.game.time);
      setWorld(mirror);
      if (next) setProgress(next);
    };
    const fail = (message: string) => {
      setPlaying(false);
      setError(message);
    };

    async function init(): Promise<void> {
      if (!workerMode) {
        let live: MapView | undefined;
        const runtime = await openMapTrial(
          seed,
          antCount,
          (game, next) => {
            display((live ??= makeView(game)), next);
          },
          setNotice,
        );
        if (cancelled) {
          runtime.dispose();
          return;
        }
        cleanup = runtime.dispose;
        endpoint.current = runtime.command;
        runtime.command({ type: "clock", playing: false, speed: GAME_SPEED });
        return;
      }

      let mirror = makeView(buildGame(trialSettings(seed, antCount)));
      const worker = new Worker(new URL("./mapTrialEntry.ts", import.meta.url), { type: "module" });
      cleanup = () => worker.terminate();
      endpoint.current = (action) => worker.postMessage(action);
      worker.onmessage = ({ data }: MessageEvent<MapTrialReply>) => {
        if (data.type === "error") {
          fail(data.message);
        } else if (data.type === "notice") {
          setNotice(data.message);
        } else if (data.type === "world") {
          try {
            const next = buildGame(trialSettings(seed, antCount));
            next.load(data.state);
            const fog = saveFog(mirror.sensed);
            mirror = makeView(next);
            if (fog) loadFog(mirror.sensed, fog);
            setFollowed(null);
          } catch (cause) {
            worker.terminate();
            fail(String(cause));
          }
        } else if (data.type === "frame") {
          receiveMapFrame(mirror.game, data);
          display(mirror, data.progress);
        }
      };
      worker.onerror = (event) => fail(event.message || "Could not run the simulation worker");
      worker.postMessage({ type: "init", seed, antCount } satisfies MapTrialCommand);
    }

    void init().catch((cause: unknown) => {
      if (!cancelled) fail(String(cause));
    });
    return () => {
      cancelled = true;
      cleanup?.();
      endpoint.current = undefined;
    };
  }, [seed, workerMode, antCount]);

  useEffect(() => {
    const sync = () => endpoint.current?.({ type: "clock", playing: playing && !document.hidden, speed });
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [playing, speed]);

  useEffect(() => {
    if (!world) return;
    const { game } = world;
    let request = 0;
    let wall = BROWSER_ENV.now();
    let last = wall;
    let sim = game.time;
    const gaps: number[] = [];
    const draw = () => {
      const now = BROWSER_ENV.now();
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
  }, [world]);

  function evolve(id: string): boolean {
    setNotice("");
    endpoint.current?.({ type: "evolve", id });
    return Boolean(endpoint.current);
  }

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
            toolsAt="bottom-2 right-2"
          />
        )}
      </div>
      <header className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-wrap gap-1.5">
        <div className={`pointer-events-auto flex flex-wrap items-center gap-2 ${FLOAT}`}>
          <button
            type="button"
            className="min-h-10 rounded border border-line px-2 disabled:opacity-50"
            disabled={!world || Boolean(error) || Boolean(progress?.flights)}
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
            {workerMode ? "Web Worker" : "Main thread"} · Seed {seed} · {antCount} ants per colony
          </span>
          <a className="underline" href={peerUrl.href}>
            {workerMode ? "Try main thread" : "Try Web Worker"}
          </a>
          <output ref={telemetry} data-sim-time="0" data-pace={stats.pace} data-frame-ms={stats.frameMs}>
            {error ||
              (world
                ? `${stats.time.toFixed(1)} s · ${stats.pace.toFixed(2)}× actual · ${stats.frameMs.toFixed(0)} ms p95 frame gap`
                : "Loading world")}
          </output>
        </div>
        {progress && (
          <div className={`pointer-events-auto flex flex-wrap items-center gap-2 ${FLOAT}`}>
            <span role="status">{progress.chapter.goal}</span>
            {progress.evolution && (
              <button
                type="button"
                aria-expanded={evolutionOpen}
                className="min-h-10 rounded border border-line px-2"
                onClick={() => setEvolutionOpen((open) => !open)}
              >
                Evolution · {progress.evolution.mutations}
              </button>
            )}
            {progress.flights > 0 && (
              <button
                type="button"
                className="min-h-10 rounded border border-line px-2"
                onClick={() => endpoint.current?.({ type: "found" })}
              >
                Settle the new queen
              </button>
            )}
            {notice && <span role="alert">{notice}</span>}
          </div>
        )}
        {evolutionOpen && progress?.evolution && (
          <section aria-label="Evolution" className={`pointer-events-auto mt-1 max-h-[50dvh] w-full max-w-md overflow-auto ${FLOAT}`}>
            <p>
              {progress.evolution.pools.ants} mutations from ants · {progress.evolution.pools.free} from the ground
            </p>
            <UpgradeTree
              levels={progress.evolution.levels}
              pools={progress.evolution.pools}
              evolve={evolve}
              idle={() => false}
              wide={false}
            />
          </section>
        )}
      </header>
    </main>
  );
}
