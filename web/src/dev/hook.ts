// The dev hook (ja-fnd.6.2, docs/refactor.md S5.2): the game and the page's views on `window.jevAnts`, for the Playwright guard
// (scripts/e2e-one-world.mjs). Dev builds only: ColonyApp installs it behind `import.meta.env.DEV`, so it is not in the Pages build.
//   follow(k, i) follows an ant; view() and camera(view) read where each view looks; fly(mother) sends a new queen from that colony
//   with the fungus in her and opens her pen, Jev or not. With the game paused, nextCrossing(maxSeconds, minTicks) rehearses on a
//   copy which curtain ant comes up next, and on which fixed step (rehearse.ts), and step(n) takes the game itself n of those steps:
//   the guard follows that ant through its hole for certain.
// Keyless only: the copy shares the game's policies, so with JEV_API_KEY set a miss in the copy would ask Jev (a run, real spend,
// skewed hit counts). npm run e2e starts Vite without the key (PR #65 review N6).
// It reads the page through the handles in DevDeps and holds no state of its own; ui/tests/devHook.test.ts pins what the guard calls.

import { CELL, cellOf, CURTAIN, FOUNDING_RESERVE, PLANE, type Game } from "../colony/index.ts";
import type { Followed } from "../ui/follow.ts";
import type { SensedMap } from "../ui/fungusSight.ts";
import { nextCrossing, REHEARSE_DT } from "../ui/rehearse.ts";
import type { GameSettings } from "../ui/saves.ts";
import type { ToastTone } from "../ui/toasts.ts";
import type { AntTraces } from "../ui/trace.ts";
import { buildGame, type View } from "../ui/useColony.ts";

/** What the page hands the hook: its game, its settings (a rehearsal builds a copy of the game from them), and handles on its state. */
export interface DevDeps {
  game: Game;
  settings: GameSettings;
  /** raise a notice (ColonyApp's pushToast) */
  notify(text: string, tone?: ToastTone): void;
  traces: AntTraces;
  /** the view shown when the hook was installed (ColonyApp installs it again when the view changes) */
  view: View;
  /** the followed ant, read when the guard asks */
  followed: { readonly current: Followed | null };
  setFollowed(f: Followed | null): void;
  sensed: SensedMap;
  /** the map's camera and nest centring (ColonyField's FieldApi), once it is drawn */
  field: { readonly current: { camera(view: number): unknown; goNest(k: number): void } | null };
  /** open the queen's pen without Jev (ColonyApp's devPen) */
  openPen(): void;
}

/** The hook as the guard sees it. */
export function devHook(d: DevDeps) {
  const { game } = d;
  const layerOf = (v: View) => (v === "above" ? PLANE : CURTAIN);
  return {
    game,
    notify: (text: string, tone?: ToastTone) => d.notify(text, tone),
    /** each moved ant's way home as drawn (ja-cwjp): its colony and slot, how many points, and how it ended */
    traces: () => d.traces.traces.map((t) => ({ k: t.colony, i: t.i, points: t.xs.length, end: t.end })),
    follow: (k: number, i: number) => {
      const c = game.colonies[k];
      if (!c || !c.alive[i]) return false;
      d.setFollowed({ k, i, gen: c.gen[i] as number });
      return true;
    },
    view: () => d.view,
    followed: () => d.followed.current,
    sensed: (v: View, x: number, y: number) => {
      cellOf(x, y);
      return d.sensed.sight(layerOf(v), CELL[0], CELL[1]);
    },
    nextCrossing: (maxSeconds = 20, minTicks = 1) => nextCrossing(game, buildGame(d.settings), maxSeconds, minTicks),
    step: (n = 1) => {
      for (let t = 0; t < n; t++) {
        game.tick(REHEARSE_DT);
        d.sensed.stampGame(game); // the page's step subscribers do not run here
      }
    },
    camera: (v: View) => d.field.current?.camera(layerOf(v)) ?? null,
    goNest: (k: number) => d.field.current?.goNest(k),
    fly: (mother = 0) => {
      const m = game.colonies[mother];
      if (!m) return false;
      d.openPen();
      game.revealed[mother] = true;
      game.flights.push({
        mother,
        x: m.nest.x,
        y: m.nest.y,
        load: 1,
        strain: game.fungus.evolution?.strain ?? 0,
        at: game.time,
        food: FOUNDING_RESERVE,
      });
      return true;
    },
  };
}

/** Put the hook on window (dev builds only: the caller checks). */
export function installDevHook(d: DevDeps): void {
  (window as unknown as { jevAnts?: unknown }).jevAnts = devHook(d);
}
