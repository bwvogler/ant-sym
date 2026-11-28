import { UPGRADES, type Game } from "../colony/index.ts";
import { MAX_STEP } from "../ui/fixedStepClock.ts";
import { browserSimTasks } from "../ui/simTasks.ts";
import { chapterFor, evolutionStats } from "../ui/stats.ts";
import { buildTrialGame, TrialClock } from "./workerTrial.ts";

const POSITION_MS = 1000 / 30;
const GROUND_MS = 250;

export type MapTrialAction = { type: "clock"; playing: boolean; speed: number } | { type: "evolve"; id: string } | { type: "found" };

export function progressOf(game: Game) {
  return { chapter: chapterFor(game), evolution: evolutionStats(game), flights: game.flights.length };
}

export type MapTrialProgress = ReturnType<typeof progressOf>;

/** The same playable simulation and task clock in both locations. The worker alone needs to copy display data. */
export async function openMapTrial(
  seed: number,
  antCount: number,
  frame: (game: Game, progress: MapTrialProgress | undefined, rebuilt: boolean) => void,
  notice: (message: string) => void,
) {
  const { game, bindColonies } = await buildTrialGame(seed, antCount);
  const clock = new TrialClock();
  let playing = false;
  let lastFrame = -Infinity;
  let lastGround = -Infinity;
  let cancel: (() => void) | undefined;

  function publish(now: number, ground: boolean, rebuilt = false): void {
    lastFrame = now;
    if (ground) lastGround = now;
    frame(game, ground ? progressOf(game) : undefined, rebuilt);
  }

  function run(): void {
    cancel = undefined;
    if (!playing || game.flights.length) return;
    const now = performance.now();
    const delay = clock.pump(now, () => {
      game.tick(MAX_STEP);
      return game.flights.length === 0;
    });
    const flight = game.flights.length > 0;
    if (flight || now - lastFrame >= POSITION_MS) publish(now, flight || now - lastGround >= GROUND_MS);
    if (!flight) cancel = browserSimTasks(delay, run);
  }

  function command(action: MapTrialAction): void {
    const now = performance.now();
    if (action.type === "clock") {
      cancel?.();
      cancel = undefined;
      playing = action.playing;
      clock.speed = action.speed;
      clock.reset(now);
      if (!playing) publish(now, true);
      else if (!game.flights.length) cancel = browserSimTasks(0, run);
      return;
    }
    if (action.type === "evolve") {
      if (!UPGRADES.some(({ id }) => id === action.id) || !game.fungus.upgrade(action.id)) {
        notice("That upgrade is currently unavailable.");
      }
      publish(now, true);
      return;
    }
    const flight = game.flights[0];
    if (!flight) return;
    const founded = game.found(flight) >= 0;
    if (founded) bindColonies();
    else notice(game.lastLoss?.reason ?? "The queen could not find a place to settle.");
    publish(now, true, founded);
    if (playing && !game.flights.length) {
      clock.reset(performance.now());
      cancel = browserSimTasks(0, run);
    }
  }

  return {
    game,
    command,
    dispose: () => cancel?.(),
  };
}
