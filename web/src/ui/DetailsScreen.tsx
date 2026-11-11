import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SITUATIONS, DOCTRINES, LETHAL, LEVERS, NEST_ONLY, upgradeFor, MET, type Game, DEFAULT_RECOGNITION } from "../colony/index.ts";
import { USD_PER_INPUT_TOKEN } from "../../shared/jev.ts";
import Help from "./Help.tsx";
import { colonyName, colonyTone } from "./names.ts";
import { seg } from "./styles.ts";
import { MAX_SPEED, type ColonyControls, type ColonyStats, type SideStats } from "./useColony.ts";
import { TOKENS_PER_SITUATION, type useColonyJev } from "./useColonyJev.ts";
import { Bar, NEAR_CAP, Slider } from "./widgets.tsx";
import { AUTOSAVE, describe, readable, SLOTS, type SaveRecord } from "./saves.ts";

// The Details screen (ja-lo8.2): everything the game does not need on its main screen. The colonies' numbers, Jev's
// spend and caches, the unity and infection figures, the world's settings, and the lab: the fungus's menu and each
// colony's doctrine (the spore brush and strain picker went in ja-260), for experiments rather than play. Opened from the top bar; Escape closes it.

type Jev = ReturnType<typeof useColonyJev>;

interface Props {
  open: boolean;
  onClose: () => void;
  game: Game;
  controls: ColonyControls;
  update: (patch: Partial<ColonyControls>) => void;
  stats: ColonyStats | null;
  fps: number;
  restart: () => void;
  newWorld: () => void;
  jev: Jev;
  saves: { list: SaveRecord[]; save: (slot: number) => Promise<void> };
  onLoad: (r: SaveRecord) => void;
}

const usd = (v: number) => `$${v.toFixed(4)}`;
const h2 = "flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-3";

export default function DetailsScreen(props: Props) {
  const { open, onClose } = props;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // The Learn drawer opens over this screen: its Escape is its own.
      if (document.querySelector('[role="dialog"][aria-label="Learn"]')) return;
      const a = document.activeElement;
      if (a instanceof HTMLElement && panel.current?.contains(a)) a.blur(); // commits a doctrine being typed (onBlur)
      onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={panel} tabIndex={-1} role="dialog" aria-label="Details" className="fixed inset-0 z-30 flex flex-col bg-ground outline-none">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-3">
        <h2 className="font-semibold text-fg">Details</h2>
        <p className="hidden text-sm text-fg-3 sm:block">the numbers behind the game, and the lab</p>
        <button
          type="button"
          className="ml-auto rounded-md border border-line px-3 py-1.5 text-sm text-fg-2 hover:bg-raised"
          onClick={onClose}
          aria-label="Close Details"
        >
          Back to the game
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-4 px-4 py-4 lg:grid-cols-2">
          <Colonies {...props} />
          <JevCard {...props} />
          <FungusNumbers {...props} />
          <World {...props} />
          <SavedGames {...props} />
          <Lab {...props} />
          <Debug {...props} />
        </div>
      </div>
    </div>
  );
}

function Card({ label, title, children, wide = false }: { label: string; title: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section
      className={`min-w-0 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-fg-2 ${wide ? "lg:col-span-2" : ""}`}
      aria-label={label}
    >
      <h3 className={h2}>{title}</h3>
      {children}
    </section>
  );
}

function Colonies({ stats }: Props) {
  const share = stats && stats.foodTotal > 0 ? stats.stored / stats.foodTotal : 0;
  return (
    <Card label="colony stats" title="Colonies" wide>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[10rem]">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-fg tabular-nums">{stats ? stats.stored.toLocaleString() : "0"}</span>
            <span className="text-xs text-fg-3">food home of {stats ? stats.foodTotal.toLocaleString() : "—"}</span>
          </div>
          <Bar value={share} />
        </div>
        <Stat label="exploring" value={stats ? String(stats.counts.explore) : "—"} />
        <Stat label="following" value={stats ? String(stats.counts.follow) : "—"} />
        <Stat label="going home" value={stats ? String(stats.counts.return) : "—"} />
        <Stat label="fighting" value={stats ? String(stats.counts.fight) : "—"} />
        <Stat label="mode choices / s" value={stats ? Math.round(stats.choicesPerSecond).toLocaleString() : "—"} />
        <Stat label="situations seen" value={stats ? `${stats.situationsSeen} / ${SITUATIONS.toLocaleString()}` : "—"} />
      </div>
      {stats && (
        // One line per cell: on a phone the table scrolls sideways in its card rather than wrapping "963 / 871 / 1" over three lines.
        <div className="mt-3 overflow-x-auto border-t border-line pt-3">
          <dl className="grid w-max min-w-full grid-cols-[repeat(8,auto)] gap-x-4 gap-y-1 font-mono text-xs whitespace-nowrap text-fg-2">
            <dt className="text-fg-3" />
            {["ants", "food home", "lost", "born", "queen · brood", "dug / mound / filled", "stance"].map((h) => (
              <dt key={h} className="text-[11px] tracking-wide text-fg-3 uppercase">
                {h}
              </dt>
            ))}
            {stats.sides.map((s, k) => (
              <SideRow key={k} name={colonyName(k)} tone={colonyTone(k)} s={s} />
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}

function JevCard({ jev }: Props) {
  const running = jev.state.phase === "running";
  const run = jev.state.run;
  const choices = jev.state.hits + jev.state.misses;
  const perHour = run && run.elapsedSeconds > 5 ? (run.usd / run.elapsedSeconds) * 3600 : null;
  /** today's spend against the server's overall budget (PR #42 review S8) */
  const budget = jev.budget;
  return (
    <Card
      label="colony jev"
      title={
        <>
          Jev <Help to={{ tab: "policy", id: "mode" }} label="how Jev decides" />
        </>
      }
    >
      <p className="mt-1 text-xs text-fg-3">
        Jev answers each situation once, under each colony's doctrine and your aim, and every ant in that situation takes the answer.
        Answers are kept: the page ships some, and Jev is asked only for a situation that has none yet under the words in force, so a game
        that meets only answered situations spends nothing. What Jev costs is capped by a daily budget. When it can't run, the game plays
        the answers it already gave, and no policy can be changed.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        {running ? (
          <button
            type="button"
            className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-raised"
            onClick={jev.stop}
            title="Stop asking Jev: cached answers keep playing, and policies can't be changed until it runs again"
          >
            Stop Jev
          </button>
        ) : (
          <button
            type="button"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            onClick={jev.start}
            disabled={!jev.resumable}
            title={jev.lock ?? undefined}
          >
            Resume Jev
          </button>
        )}
        <div className="min-w-[8rem]" aria-label="today's budget">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-fg tabular-nums">{budget ? usd(budget.spentUsd) : "$0.0000"}</span>
            <span className="text-xs text-fg-3">{budget?.usdPerDay != null ? `of $${budget.usdPerDay.toFixed(2)} today` : "today"}</span>
          </div>
          <Bar value={budget?.usdPerDay ? Math.min(1, budget.spentUsd / budget.usdPerDay) : 0} warnAt={NEAR_CAP} />
          {budget?.remainingUsd != null && <span className="text-xs text-fg-3">{usd(budget.remainingUsd)} left</span>}
        </div>
        <Stat label="this run" value={run ? usd(run.usd) : "—"} />
        <Stat label="avg $ / hour" value={perHour === null ? "—" : `$${perHour.toFixed(3)}`} />
        <Stat label="tokens" value={run ? run.inputTokens.toLocaleString() : "—"} />
        <Stat label="situations asked" value={String(jev.state.asked)} />
        <Stat
          label="answers cached"
          value={`${jev.state.cached} · ${jev.state.stancesCached} stances · ${jev.state.fungusCached} fungus`}
        />
        <Stat label="from cache" value={choices > 0 ? `${Math.round((100 * jev.state.hits) / choices)}%` : "—"} />
        <span className={`ml-auto font-mono text-xs ${running ? "text-accent" : "text-fg-3"}`}>
          {running ? "jev on" : "jev not running · cached answers"}
        </span>
      </div>
      {jev.lock && <p className="mt-3 rounded-md bg-warn-soft px-3 py-1.5 text-xs text-warn">{jev.lock}</p>}
      {jev.state.lastError && (
        <p className="mt-2 truncate rounded-md bg-warn-soft px-3 py-1.5 text-xs text-warn" title={jev.state.lastError}>
          {jev.state.lastError}
        </p>
      )}
    </Card>
  );
}

function FungusNumbers({ stats }: Props) {
  return (
    <Card
      label="fungus numbers"
      title={
        <>
          Infection and unity <Help to={{ tab: "guide", id: "fungus" }} label="the fungus" />
        </>
      }
    >
      {stats && (
        <dl className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-0.5 font-mono text-xs" aria-label="infection">
          <dt />
          <dt className="text-right text-[11px] tracking-wide text-fg-3 uppercase">infected</dt>
          <dt className="text-right text-[11px] tracking-wide text-fg-3 uppercase">resistance</dt>
          {stats.sides.map((s, k) => (
            <Infection key={k} name={colonyName(k)} tone={colonyTone(k)} s={s} />
          ))}
          <dt className="text-fg-3">spores</dt>
          <dd className="col-span-2 text-right text-fg-2">{stats.sporeCells.toLocaleString()} cells</dd>
        </dl>
      )}
      {stats && stats.sides.length > 1 && (
        <div className="mt-3" aria-label="unity">
          <div className="flex items-baseline justify-between">
            <span className="flex items-center gap-1.5">
              Unity <Help to={{ tab: "guide", id: "unity" }} label="one colony" />
            </span>
            <span className="font-mono text-sm text-fg tabular-nums">{Math.round(100 * stats.unity.score)}%</span>
          </div>
          <Bar value={stats.unity.score} />
          <p className="mt-1 font-mono text-xs text-fg-3">
            nests {stats.unity.gap.toFixed(2)} apart in odour · {stats.unity.deathsPerMinute.toFixed(0)} fight deaths/min · quiet{" "}
            {Math.min(999, Math.floor(stats.unity.quiet))} s · {Math.round(100 * stats.unity.mixing)}% mixed · met{" "}
            {(100 * stats.unity.met).toFixed(1)}% (needs {100 * MET}%)
          </p>
          <p className="mt-1 text-xs text-fg-3">
            One colony when the nests smell alike (within {DEFAULT_RECOGNITION.tolerance}), their ants have met (on average over the last
            minute, at least {100 * MET}% of each colony's ants touching another's, smelling alike; once one, it holds until a fight or the
            nests drift apart), and nobody has died fighting for a minute. Ants are coloured by odour.
          </p>
        </div>
      )}
    </Card>
  );
}

function World({ game, controls, update, restart, newWorld }: Props) {
  const { size } = game.map;
  return (
    <Card label="world" title="World">
      <div className="mt-3 flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-fg-2">
          <span>Seed</span>
          <input
            className="w-24 rounded-md border border-line bg-paper px-2 py-1 font-mono text-fg outline-none focus:border-accent"
            type="number"
            min={1}
            value={controls.seed}
            onChange={(e) => update({ seed: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
          />
        </label>
        <button
          type="button"
          className="ml-auto rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-raised"
          onClick={newWorld}
        >
          New world
        </button>
        <button
          type="button"
          className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-raised"
          onClick={restart}
        >
          Restart
        </button>
      </div>
      {game.world && (
        <p className="mt-2 text-xs text-fg-3">
          One world: the surface, {size.w}×{size.h} cells seen from above (rock, ground and {game.map.foodTotal.toLocaleString()} units of
          food), and the ground under the line through the holes, {game.world.curtain.size.w}×{game.world.curtain.size.h} cells unrolled
          below it, where the nests are dug. Above and below (v) are two views of one game. The queen lays eggs while there is food; larvae
          fed by nurses become new ants.
        </p>
      )}
      <label className="mt-2 flex items-center justify-between">
        <span>Two colonies</span>
        <input type="checkbox" checked={controls.rival} onChange={(e) => update({ rival: e.target.checked })} />
      </label>
      <Slider
        label="Ants per colony"
        value={controls.antCount}
        min={100}
        max={2000}
        step={50}
        format={(v) => String(v)}
        onChange={(v) => update({ antCount: v })}
      />
      <Slider
        label="Speed"
        value={controls.speed}
        min={0.25}
        max={MAX_SPEED}
        step={0.25}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(v) => update({ speed: v })}
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          Trails drawn <Help to={{ tab: "guide", id: "food-trail" }} label="trails" />
        </span>
        <div className="flex overflow-hidden rounded-md border border-line text-sm">
          <button
            type="button"
            className={seg(controls.showFoodTrail)}
            onClick={() => update({ showFoodTrail: !controls.showFoodTrail })}
            title="Laid by ants carrying food home: it leads to food"
          >
            to food
          </button>
          <button
            type="button"
            className={seg(controls.showHomeTrail)}
            onClick={() => update({ showHomeTrail: !controls.showHomeTrail })}
            title="Laid by ants walking out: it leads home"
          >
            to home
          </button>
        </div>
      </div>
    </Card>
  );
}

/** For experiments, not play: the fungus's menu, and each colony's doctrine. */
function Lab({ game, controls, update, stats, jev }: Props) {
  const retune = stats ? stats.situationsSeen * TOKENS_PER_SITUATION : 0;
  const [showDoctrines, setShowDoctrines] = useState(false);
  // Why the last lab founding beyond an end founded nothing (one world: no room within the radius), until the next try.
  // Kept with a token for its game: a new game (another world, a restart, a load) shows no note, the last one being about
  // the old line (a token, not the game, so an old game is not kept alive by this state).
  const gameToken = useMemo(() => ({ game: game.map.seed }), [game]);
  const [note, setNote] = useState<{ token: object; text: string | null } | null>(null);
  const foundNote = note && note.token === gameToken ? note.text : null;
  const setFoundNote = (text: string | null) => setNote({ token: gameToken, text });
  const locked = jev.lock !== null;
  return (
    <Card label="lab" title="Lab" wide>
      <p className="mt-1 text-xs text-fg-3">
        For experiments rather than play: in the game the fungus lands by a nest and spreads through its hosts, and a colony's doctrine is
        its nature.
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div aria-label="fungus menu">
          <span className="flex items-center gap-1.5">
            Levers the fungus may pull <Help to={{ tab: "policy", id: "fungus" }} label="the fungus's policy" />
          </span>
          <LeverChips game={game} menu={controls.menu} locked={locked} lock={jev.lock} onChange={(menu) => update({ menu })} />
          <label className="mt-2 flex items-center justify-between text-xs">
            <span>Local rule: groomed hosts hide (show a quarter)</span>
            <input type="checkbox" checked={controls.hide} disabled={locked} onChange={(e) => update({ hide: e.target.checked })} />
          </label>
          <label className="mt-1 flex items-center justify-between text-xs">
            <span>Local rule: cull hosts fighting foreigners</span>
            <input type="checkbox" checked={controls.cull} disabled={locked} onChange={(e) => update({ cull: e.target.checked })} />
          </label>
        </div>
        <div aria-label="colonies">
          <span className="flex items-center gap-1.5">
            Colony doctrines <Help to={{ tab: "policy", id: "mode" }} label="the ants' policy" />
          </span>
          {!showDoctrines ? (
            <button
              type="button"
              className="mt-2 rounded-md border border-dashed border-line px-2 py-1 text-xs text-fg-3 hover:bg-raised"
              onClick={() => setShowDoctrines(true)}
            >
              Show the colonies' doctrines (lab: in the game they stay closed until you reach a queen)
            </button>
          ) : (
            jev.doctrines.slice(0, stats ? stats.sides.length : 1).map((d, k) => (
              <div key={k} className="mt-2">
                <div className="flex items-center justify-between">
                  <span className={colonyTone(k)}>{colonyName(k)}</span>
                  <div className="flex overflow-hidden rounded-md border border-line text-sm">
                    {DOCTRINES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={seg(d.id === p.id)}
                        disabled={locked}
                        onClick={() => jev.setDoctrine(k, { id: p.id, text: p.text })}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  className="mt-1 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-fg outline-none focus:border-accent disabled:opacity-60"
                  rows={3}
                  value={d.text}
                  disabled={locked}
                  onChange={(e) => jev.draftDoctrine(k, { id: "custom", text: e.target.value })}
                  onBlur={(e) => jev.setDoctrine(k, { id: d.id, text: e.target.value })}
                  aria-label={`${colonyName(k)} doctrine`}
                />
              </div>
            ))
          )}
          <p className="mt-1 text-xs text-fg-3">
            A new doctrine re-asks the situations a colony meets: about {stats ? stats.situationsSeen : "—"} so far, ≈{" "}
            {retune.toLocaleString()} tokens ≈ {usd(retune * USD_PER_INPUT_TOKEN)}. One used before is free.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {game.world ? (
          // One world (U4a): a colony may be founded only beyond an end of the line (docs/one-world.md §3).
          (["start", "end"] as const).map((end) => (
            <button
              key={end}
              type="button"
              className="rounded-md border border-line px-2 py-1 hover:bg-raised"
              onClick={() => setFoundNote(foundBeyondEnd(game, end))}
              title="A new colony of 30 ants, kin of the first (its odour), a flight past this end of the line, where the founding rule allows"
            >
              Found beyond {endNest(game, end)}
            </button>
          ))
        ) : (
          <button
            type="button"
            className="rounded-md border border-line px-2 py-1 hover:bg-raised"
            onClick={() => foundBetween(game)}
            title="A new colony of 30 ants, kin of the first (its odour), on the ground a third of the way between the first two nests"
          >
            Found a colony between the nests
          </button>
        )}
        <span className="text-fg-3">{game.colonies.length} colonies. In the game a colony is founded by a new queen (ja-lo8.9).</span>
        {game.world && foundNote && <span className="text-warn">{foundNote}</span>}
      </div>
      {locked && <p className="mt-3 text-xs text-warn">{jev.lock}</p>}
    </Card>
  );
}

/** Saved games: the autosave and the player's slots, each with Load; Save to a slot. */
function SavedGames({ saves, onLoad, controls }: Props) {
  const slots = Array.from({ length: SLOTS }, (_, k) => k);
  return (
    <Card label="saved games" title="Saved games">
      <p className="mt-1 text-xs text-fg-3">
        The game saves itself every minute and when you leave the tab (the autosave). Continue on the start screen opens the newest.
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {slots.map((slot) => {
          const r = saves.list.find((x) => x.slot === slot);
          return (
            <li key={slot} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">
                {r ? describe(r) : slot === AUTOSAVE ? "Autosave · empty" : `Slot ${slot} · empty`}
                {r && !readable(r) ? <span className="text-warn"> · from an older version, can't be loaded</span> : null}
              </span>
              {slot !== AUTOSAVE && (
                <button
                  type="button"
                  className="rounded-md border border-line px-2 py-1 hover:bg-raised disabled:opacity-50"
                  disabled={!controls.started}
                  onClick={() => void saves.save(slot)}
                >
                  Save here
                </button>
              )}
              <button
                type="button"
                className="rounded-md border border-line px-2 py-1 hover:bg-raised disabled:opacity-50"
                disabled={!r || !readable(r)}
                onClick={() => r && readable(r) && onLoad(r)}
              >
                Load
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Debug({ stats, fps }: Props) {
  return (
    <Card label="debug" title="Debug">
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm text-fg-2">
        <dt className="text-fg-3">food left</dt>
        <dd className="text-right">{stats ? Math.round(stats.foodLeft).toLocaleString() : "—"}</dd>
        <dt className="text-fg-3">sim time</dt>
        <dd className="text-right">{stats ? `${stats.time.toFixed(1)}s` : "—"}</dd>
        <dt className="text-fg-3">fps</dt>
        <dd className="text-right">{fps}</dd>
      </dl>
    </Card>
  );
}

function SideRow({ name, tone, s }: { name: string; tone: string; s: SideStats }) {
  return (
    <>
      <dt className={`pr-2 ${tone}`}>{name}</dt>
      <dd className="tabular-nums">
        {s.population} / {s.cap}
      </dd>
      <dd className="tabular-nums">{s.stored.toLocaleString()}</dd>
      <dd className="tabular-nums">{s.losses.toLocaleString()}</dd>
      <dd className="tabular-nums">{s.births.toLocaleString()}</dd>
      <dd
        className={`tabular-nums ${s.queen === "lost" ? "text-err" : ""}`}
        title="the queen, and brood: eggs / larvae / pupae. A colony whose queen is lost is orphaned: no more eggs; its workers age out. Brood killed by the fungus's crown is counted after a †."
      >
        {s.queen === null
          ? "–"
          : `${s.queen === "lost" ? "orphaned" : "queen"} · ${s.brood.join(" / ")}${s.broodKilled ? ` † ${s.broodKilled}` : ""}`}
      </dd>
      <dd
        className="tabular-nums"
        title="soil cells dug / pellets of it brought out to the mound / pellets of it put back into unused space underground: dug = mound + filled, less pellets in jaws or lost with ants that died. After a +: pellets taken off the mound and put back underground, soil the mound count already holds."
      >
        {s.dug.toLocaleString()} / {s.mound.toLocaleString()} / {s.filled.toLocaleString()}
        {s.refilled > 0 ? ` +${s.refilled.toLocaleString()}` : ""}
      </dd>
      <dd>{s.stance}</dd>
    </>
  );
}

function Infection({ name, tone, s }: { name: string; tone: string; s: SideStats }) {
  return (
    <>
      <dt className={tone}>{name}</dt>
      <dd className="text-right text-spore tabular-nums">{Math.round(100 * s.infected)}%</dd>
      <dd className="text-right text-fg-2 tabular-nums">{s.resist.toFixed(2)}</dd>
    </>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] tracking-wide text-fg-3 uppercase">{label}</span>
      <span className="font-mono text-sm text-fg tabular-nums">{value}</span>
    </div>
  );
}

/** One chip per lever, on or off the fungus's menu: perception, emission, and the lethal ones (off to start). */
export function LeverChips({
  game,
  menu,
  locked,
  lock,
  onChange,
}: {
  game: Game;
  menu: readonly string[];
  locked: boolean;
  lock: string | null;
  onChange: (menu: string[]) => void;
}) {
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs">
      {(["perceive", "emit", "lethal"] as const).map((kind) => (
        <div key={kind} className="flex flex-wrap items-center gap-1">
          <span className="w-16 text-fg-3">{kind === "perceive" ? "perceives" : kind === "emit" ? "gives off" : "lethal"}</span>
          {/* the nest's levers (floor marks, crown) only where there is a nest */}
          {LEVERS.filter((v) => v.kind === kind && (game.fungus.hasNest || !NEST_ONLY.has(v.id))).map((v) => {
            const on = menu.includes(v.id);
            const lethal = LETHAL.has(v.id);
            // In the game a lethal lever on the menu does nothing until its upgrade is kept (ja-lo8.16).
            const heldOff = lethal && game.fungus.evolution?.reach()[v.id] === 0;
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                disabled={locked}
                className={`rounded-md border px-2 py-0.5 font-mono disabled:cursor-not-allowed disabled:opacity-60 ${on ? (lethal ? "border-err bg-err-soft text-err" : "border-accent bg-accent-soft text-accent") : "border-line text-fg-3 hover:bg-raised"}`}
                title={
                  locked
                    ? (lock ?? undefined)
                    : heldOff
                      ? `${v.blurb}. Held off until your fungus keeps the ${upgradeFor(v.id)?.name ?? ""} upgrade (Fungus panel).`
                      : v.blurb
                }
                onClick={() => onChange(on ? menu.filter((id) => id !== v.id) : [...menu, v.id])}
              >
                {v.name}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** One world: the name of the colony whose hole is the line's `end` (V₀ or the last), or "the empty hole" when none lives there. */
function endNest(game: Game, end: "start" | "end"): string {
  const holes = game.world!.line.holes;
  const v = end === "start" ? holes[0]! : holes[holes.length - 1]!;
  const k = game.colonies.findIndex((c) => {
    const h = c.holeCells[c.params.nest];
    return h !== undefined && h.px === v.x && h.py === v.y;
  });
  return k >= 0 ? colonyName(k) : "the empty hole";
}

/**
 * One world's lab founding (Game.foundBeyond): no room beyond that end within the radius leaves the game as it was.
 * Returns what the lab says: null when a colony was founded, else why not (the engine's reason, NO_ROOM).
 */
function foundBeyondEnd(game: Game, end: "start" | "end"): string | null {
  const name = endNest(game, end);
  try {
    game.foundBeyond(end);
    return null;
  } catch (e) {
    if (!(e instanceof Error && e.message.includes("no room"))) throw e;
    return `Nothing founded beyond ${name}: ${e.message.replace(/^addColony: /, "")}.`;
  }
}

/** The lab's founding (Game.addColony): 30 ants at the first colony's odour, a third of the way from the first nest to the second. */
function foundBetween(game: Game): void {
  const a = game.colonies[0]?.nest;
  const b = game.colonies[1]?.nest ?? a;
  if (!a || !b) return;
  const ea = a.entrance ?? a;
  const eb = b.entrance ?? b;
  game.addColony({ x: ea.x + (eb.x - ea.x) / 3, y: ea.y, antCount: 30, odour: game.colonies[0]!.nestOdour });
}
