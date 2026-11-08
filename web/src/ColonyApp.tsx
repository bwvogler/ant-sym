import { worldExtent } from "./colony/world.ts";
import { USD_PER_INPUT_TOKEN } from "../shared/jev.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AntCard from "./ui/AntCard.tsx";
import ColonyField from "./ui/ColonyField.tsx";
import DetailsScreen from "./ui/DetailsScreen.tsx";
import type { Followed } from "./ui/follow.ts";
import { Bar } from "./ui/widgets.tsx";
import { seg } from "./ui/styles.ts";
import { MAX_SPEED, useColony, type ColonyStats, type EvolutionStats } from "./ui/useColony.ts";
import { UPGRADES, type Upgrade } from "./colony/evolution.ts";
import { LETHAL_LEVERS } from "./colony/levers.ts";
import StartScreen from "./ui/StartScreen.tsx";
import { AUTOSAVE, AUTOSAVE_MS, browserSaves, describe, newestReadable, readable, record, type GameSettings, type PlayerState, type SaveRecord } from "./ui/saves.ts";
import type { Game } from "./colony/game.ts";
import { colonyName, colonyTone } from "./ui/names.ts";
import { isDemo } from "./ui/backend.ts";
import { useBackend } from "./ui/useBackend.ts";
import { TOKENS_PER_FUNGAL_SITUATION, TOKENS_PER_SITUATION, useColonyJev } from "./ui/useColonyJev.ts";
import { AIMS } from "./colony/fungusBrain.ts";
import LearnDrawer from "./ui/LearnDrawer.tsx";
import Help from "./ui/Help.tsx";
import { openLearn } from "./ui/learn.ts";
import Toasts from "./ui/Toasts.tsx";
import { pushToast } from "./ui/toasts.ts";

// The game's main screen (ja-lo8.2): the field, a slim top bar, and the fungus, the player. You shape the fungus's
// policy in words (its aim); Jev reads them and decides what the fungus does in each host it lives in.
// Each colony's doctrine is its nature, out of the player's reach (docs/new-queens.md: it changes only through a new
// queen, ja-lo8.9). Everything else (the colonies' numbers, Jev's spend, the world's settings, the lab tools) is on
// the Details screen.

const usd = (v: number) => `$${v.toFixed(4)}`;

/** The speeds the top bar offers (4× is the game's default; PRD §50); the Details screen's slider has the rest. */
const SPEEDS = [1, 2, 4, MAX_SPEED] as const;

export default function ColonyApp() {
  const { game, colony, controls, update, stats, fps, onFrame, restart, newWorld, start, loadSave, settings, evolve } = useColony();
  const backend = useBackend();
  const jev = useColonyJev(game.colonies, game.fungus, controls.menu, backend);
  const [details, setDetails] = useState(false);
  const closeDetails = useCallback(() => setDetails(false), []);
  // The followed ant belongs to the game it was picked in: a new game has new ants, so nothing is followed.
  // Keyed by a token per game rather than the game itself, so an old game is not kept alive by this state.
  const gameToken = useMemo(() => ({ game: game.map.seed }), [game]);
  const [follow, setFollow] = useState<{ token: object; f: Followed } | null>(null);
  const followed = follow && follow.token === gameToken ? follow.f : null;
  const setFollowed = useCallback((f: Followed | null) => setFollow(f ? { token: gameToken, f } : null), [gameToken]);
  useNotices(stats, jev.lock, jev.state.phase, controls.menu, controls.ground === "side");
  const games = useSaves(game, settings, { aim: jev.aim, doctrines: jev.doctrines, menu: controls.menu, hide: controls.hide, cull: controls.cull }, stats, controls.started);
  const continueFrom = useCallback(
    (r: SaveRecord) => {
      if (!readable(r)) {
        pushToast(`That save is from another version of the game and can't be loaded: ${describe(r)}.`, "warn");
        return;
      }
      loadSave(r);
      jev.restore(r.player.aim, r.player.doctrines);
      update({ menu: r.player.menu, hide: r.player.hide, cull: r.player.cull });
      pushToast(`Back where you were: ${describe(r)}.`, "good");
    },
    [loadSave, jev, update],
  );
  const retune = stats ? stats.situationsSeen * TOKENS_PER_SITUATION : 0;
  return (
    <main className="mx-auto flex h-full max-w-7xl flex-col gap-3 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Jev Ants</h1>
          <p className="hidden text-sm text-fg-3 sm:block">you are the fungus</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-raised" onClick={() => openLearn({ tab: "guide" })} title="What you are seeing, the policy behind it, and the research it comes from">
            Learn
          </button>
          <button type="button" className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-raised" onClick={() => setDetails(true)} title="The colonies' numbers, Jev's spend, the world's settings and the lab">
            Details
          </button>
        </div>
      </header>
      <LearnDrawer
        colonies={game.colonies}
        followed={followed}
        doctrines={jev.doctrines}
        aim={jev.aim}
        setAim={jev.setAim}
        draftAim={jev.draftAim}
        lock={jev.lock}
        game={game}
        fungusAnswers={jev.fungusAnswers}
        menu={controls.menu}
        setMenu={(menu) => update({ menu })}
        hide={controls.hide}
        cull={controls.cull}
        setRule={(r) => update(r)}
        retune={`A new doctrine re-asks the situations a colony meets: about ${stats ? stats.situationsSeen : "—"} so far, ≈ ${retune.toLocaleString()} tokens ≈ ${usd(retune * USD_PER_INPUT_TOKEN)}.`}
        demo={isDemo(backend)}
        sideView={controls.ground === "side"}
        onSideView={() => update({ ground: "side" })}
      />
      <DetailsScreen open={details} onClose={closeDetails} game={game} controls={controls} update={update} stats={stats} fps={fps} restart={restart} newWorld={newWorld} jev={jev} saves={games} onLoad={(r) => (continueFrom(r), closeDetails())} />
      <Toasts />
      {!controls.started && <StartScreen seed={controls.seed} onStart={start} latest={newestReadable(games.list)} onContinue={continueFrom} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm" aria-label="game bar">
        <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hover" onClick={() => update({ playing: !controls.playing })}>
          {controls.playing ? "Pause" : "Play"}
        </button>
        <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="speed">
          {SPEEDS.map((v) => (
            <button key={v} type="button" className={seg(controls.speed === v)} onClick={() => update({ speed: v })} aria-pressed={controls.speed === v}>
              {v}×
            </button>
          ))}
        </div>
        <span className="font-mono tabular-nums text-fg-2" title="sim time">
          {clock(stats?.time ?? 0)}
        </span>
        {stats && controls.playing && stats.pace > 0 && stats.pace < controls.speed * 0.85 && (
          <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs text-warn" title="This machine can't step the sim that fast: it runs as fast as it can">
            running at {stats.pace.toFixed(1)}×
          </span>
        )}
        <span className="min-w-0 basis-full text-fg-2 sm:basis-0 sm:flex-1 sm:truncate">{goalLine(stats)}</span>
      </div>

      <div className="flex min-h-0 flex-col gap-3 lg:flex-1 lg:flex-row">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
          <div className="relative" style={{ aspectRatio: `${worldExtent(colony.map).w} / ${worldExtent(colony.map).h}` }}>
            <ColonyField
              colonies={game.colonies}
              fungus={game.fungus}
              onFrame={onFrame}
              showFoodTrail={controls.showFoodTrail}
              showHomeTrail={controls.showHomeTrail}
              followed={followed}
              onFollow={setFollowed}
              onChamber={(k, id) => openLearn({ tab: "nest", id: `chamber-${k}-${id}` })}
            />
          </div>
          {followed ? (
            <AntCard followed={followed} colonies={game.colonies} fungus={game.fungus} explain={jev.explain} explainFungus={jev.explainFungus} onClose={() => setFollowed(null)} />
          ) : (
            <p className="text-xs text-fg-3">
              Drag to pan · wheel or pinch to zoom · tap an ant to follow it and see what the fungus does inside it · Learn explains what you see.
            </p>
          )}
        </div>
        <aside className="flex w-full flex-col gap-3 lg:w-80">
          <FungusPanel stats={stats} jev={jev} evolve={evolve} side={controls.ground === "side"} menu={controls.menu} />
        </aside>
      </div>
    </main>
  );
}

/** The fungus: where it is, how far the colonies have come together, and its aim, the player's words. */
function FungusPanel({ stats, jev, evolve, side, menu }: { stats: ColonyStats | null; jev: ReturnType<typeof useColonyJev>; evolve: (id: string) => boolean; side: boolean; menu: readonly string[] }) {
  const locked = jev.lock !== null;
  return (
    <section className="rounded-lg border border-line bg-panel p-4 text-sm text-fg-2" aria-label="fungus">
      <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-3">
        The fungus <Help to={{ tab: "guide", id: "fungus" }} label="the fungus" />
      </h2>
      {stats && (
        <div className="mt-3 flex flex-col gap-2" aria-label="infection">
          {stats.sides.map((s, k) => (
            <div key={k}>
              <div className="flex items-baseline justify-between text-xs">
                <span className={colonyTone(k)}>in the {colonyName(k)} colony</span>
                <span className="font-mono tabular-nums text-spore">{Math.round(100 * s.infected)}%</span>
              </div>
              <Bar value={s.infected} thin />
              {s.queen !== null && (
                <p className="mt-0.5 text-[11px] text-fg-3">
                  {s.queen === "lost" ? "its queen is dead" : s.queenLoad >= 0.05 ? <span className="text-spore">in its queen: {Math.round(100 * s.queenLoad)}%</span> : "its queen is clean"}
                </p>
              )}
            </div>
          ))}
          {stats.sides.length > 1 && (
            <div aria-label="unity">
              <div className="flex items-baseline justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  one colony <Help to={{ tab: "guide", id: "unity" }} label="one colony" />
                </span>
                <span className="font-mono tabular-nums text-fg">{Math.round(100 * stats.unity.score)}%</span>
              </div>
              <Bar value={stats.unity.score} thin />
            </div>
          )}
        </div>
      )}
      {stats?.evolution && <Evolve e={stats.evolution} evolve={evolve} side={side} menu={menu} />}
      <div className="mt-4" aria-label="fungus aim">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            Aim <Help to={{ tab: "policy", id: "fungus" }} label="how the fungus decides" />
          </span>
          <div className="flex overflow-hidden rounded-md border border-line text-sm">
            {AIMS.map((a) => (
              <button key={a.id} type="button" className={seg(jev.aim.id === a.id)} disabled={locked} onClick={() => jev.setAim({ id: a.id, text: a.text })}>
                {a.name}
              </button>
            ))}
          </div>
        </div>
        <textarea
          className="mt-2 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-fg outline-none focus:border-accent disabled:opacity-60"
          rows={4}
          value={jev.aim.text}
          disabled={locked}
          onChange={(e) => jev.draftAim({ id: "custom", text: e.target.value })}
          onBlur={(e) => jev.setAim({ id: jev.aim.id, text: e.target.value })}
          aria-label="aim"
        />
        {locked ? (
          <p className="mt-1 text-xs text-warn">{jev.lock}</p>
        ) : (
          <p className="mt-1 text-xs text-fg-3">What the fungus wants, in your words. Jev reads it and decides what the fungus does inside each ant it lives in: what that ant perceives, and what it gives off. ≈ {TOKENS_PER_FUNGAL_SITUATION} tokens per situation asked.</p>
        )}
      </div>
    </section>
  );
}

/** Sim time as m:ss (h:mm:ss past an hour). */
/**
 * The fungus's body and its mutations (ja-lo8.12): its mycelium and the fungus in its hosts, mutations to keep and how
 * fast they come, and each upgrade's next level. Spread upgrades are the fungus's body; reach upgrades how far its
 * levers may go.
 */
/** A lethal upgrade whose levers are all off the menu: keeping it would free nothing until the player turns one on (ja-lo8.16). */
function idle(u: Upgrade, menu: readonly string[]): boolean {
  return !!u.levers?.every((id) => LETHAL_LEVERS.has(id) && !menu.includes(id));
}

function Evolve({ e, evolve, side, menu }: { e: EvolutionStats; evolve: (id: string) => boolean; side: boolean; menu: readonly string[] }) {
  return (
    <div className="mt-4" aria-label="evolution">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5">
          Body <Help to={{ tab: "guide", id: "evolution" }} label="the fungus's body and mutations" />
        </span>
        <span className="font-mono tabular-nums text-fg-2" title="its mycelium by the hole, and the fungus in its hosts">
          mycelium {e.mass.toFixed(0)} · in ants {e.inHosts.toFixed(0)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between text-xs">
        <span>Mutations</span>
        <span className="font-mono tabular-nums">
          <span className={e.mutations > 0 ? "text-spore" : "text-fg-3"}>{e.mutations.toLocaleString()}</span>
          <span className="text-fg-3"> · +{e.perMinute < 10 ? e.perMinute.toFixed(1) : Math.round(e.perMinute).toLocaleString()}/min</span>
        </span>
      </div>
      <p className="mt-1 text-[11px] text-fg-3">Every bit of new fungus can mutate, so the faster it grows the faster mutations come. You choose which to keep; each level asks more.</p>
      <ul className="mt-2 flex flex-col gap-1" aria-label="upgrades">
        {UPGRADES.filter((u) => side || !u.nest).map((u) => {
          const level = e.levels[u.id] ?? 0;
          const cost = u.costs[level];
          const next = u.steps[level + 1];
          return (
            <li key={u.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate" title={u.blurb}>
                <span className={u.kind === "spread" ? "text-spore" : u.levers?.every((id) => LETHAL_LEVERS.has(id)) ? "text-err" : "text-accent"}>{u.name}</span> <span className="text-fg-3">{u.steps[level]}</span>
                {idle(u, menu) && <span className="text-fg-3"> (not on the menu)</span>}
              </span>
              {cost === undefined ? (
                <span className="shrink-0 text-fg-3">at its most</span>
              ) : (
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={cost > e.mutations}
                  onClick={() => evolve(u.id)}
                  title={`${u.blurb}. Next: ${next}, for ${cost.toLocaleString()} mutation${cost === 1 ? "" : "s"}.`}
                >
                  {next} · {cost.toLocaleString()}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function clock(t: number): string {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The top bar's one line: where the game stands. Goals proper come with the game's chapters (ja-lo8.5). */
function goalLine(stats: ColonyStats | null): string {
  if (!stats) return "";
  if (stats.outcome === "fallen") return `The ${colonyName(stats.fallen)} colony is gone: there is no one left to unite it with.`;
  if (stats.outcome === "unified") return "One colony: the nests smell alike and nobody has died fighting for a minute.";
  const c = stats.chapter;
  return `${c.step < 7 ? `${c.step}. ` : ""}${c.goal}${c.progress > 0 && c.progress < 1 ? ` (${Math.round(100 * c.progress)}%)` : ""}`;
}

/** Notices for what changed: the game's outcome, and Jev's state where it locks the policies. */
function useNotices(stats: ColonyStats | null, lock: string | null, phase: string, menu: readonly string[], side: boolean): void {
  const outcome = stats?.outcome ?? "playing";
  const seenOutcome = useRef(outcome);
  useEffect(() => {
    if (outcome === seenOutcome.current) return;
    seenOutcome.current = outcome;
    if (outcome !== "playing") pushToast(goalLine(stats), outcome === "unified" ? "good" : "warn");
  }, [outcome, stats]);
  // A new chapter is worth a notice.
  const chapter = stats?.chapter.chapter;
  const seenChapter = useRef(chapter);
  useEffect(() => {
    if (chapter === seenChapter.current) return;
    const first = seenChapter.current === undefined;
    seenChapter.current = chapter;
    if (!first && stats && chapter !== "land") pushToast(goalLine(stats), "good");
  }, [chapter, stats]);
  // A mutation it can keep is worth a notice, once each time there was none it could afford (ja-lo8.12).
  // Only upgrades the panel shows, and that would do something now (a lethal lever off the menu would not).
  const affordable = stats?.evolution ? UPGRADES.some((u) => (side || !u.nest) && !idle(u, menu) && (u.costs[stats.evolution!.levels[u.id] ?? 0] ?? Infinity) <= stats.evolution!.mutations) : false;
  const couldAfford = useRef(affordable);
  useEffect(() => {
    if (affordable && !couldAfford.current) pushToast("The fungus has mutations to keep: choose where they go, in the Fungus panel.", "good");
    couldAfford.current = affordable;
  }, [affordable]);
  // Losing Jev mid-game (the cap, a stop) is worth a notice; the lock at page load is in the panel already.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (phase === "running") wasRunning.current = true;
    else if (wasRunning.current && lock) {
      wasRunning.current = false;
      pushToast(lock, "warn");
    }
  }, [phase, lock]);
}

/** What the page knows of saved games, and how to save one now. */
export interface Saves {
  list: SaveRecord[];
  save: (slot: number) => Promise<void>;
}

/**
 * Saved games (ja-lo8.6): the list (newest first), saving to a slot, and the autosave: every AUTOSAVE_MS while a game
 * is under way, and when the tab is hidden (the player may not come back to this tab).
 */
function useSaves(game: Game, settings: GameSettings, player: PlayerState, stats: ColonyStats | null, started: boolean): Saves {
  const store = useMemo(() => browserSaves(), []);
  const [list, setList] = useState<SaveRecord[]>([]);
  const refresh = useCallback(() => void store.list().then(setList).catch(() => setList([])), [store]);
  useEffect(refresh, [refresh]);
  // The latest of everything, for the timer and the hidden-tab handler (they outlive renders).
  const now = useRef({ game, settings, player, stats, started });
  useEffect(() => {
    now.current = { game, settings, player, stats, started };
  });
  const save = useCallback(
    async (slot: number) => {
      const n = now.current;
      if (!n.started) return;
      try {
        await store.put(record(slot, n.settings, n.player, n.game.save(), n.stats?.chapter.goal ?? ""));
        refresh();
      } catch (e) {
        pushToast(`Couldn't save: ${String(e)}`, "warn");
      }
    },
    [store, refresh],
  );
  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => void save(AUTOSAVE), AUTOSAVE_MS);
    const hidden = () => document.visibilityState === "hidden" && void save(AUTOSAVE);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [started, save]);
  return { list, save };
}
