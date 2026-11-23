import { useEffect, useRef, useState } from "react";
import type { Game } from "../colony/index.ts";
import { clock, clockTicks } from "./clock.ts";
import { ESCAPE_LAYER, useEscape } from "./escape.ts";
import { History, niceMax, perColony } from "./history.ts";
import HistoryChart from "./HistoryChart.tsx";
import { Icon } from "./kit.tsx";
import { Debug, FungusNumbers, JevCard, JournalCard, Lab as Levers, type LabProps, World } from "./LabCards.tsx";
import { closeLab, type LabTab, type LabTarget, openLab, useLab } from "./labStore.ts";
import { colonyName } from "./names.ts";
import PolicyTab, { type PolicyProps } from "./PolicyTab.tsx";
import { useGameRead, useSimTick } from "./session.ts";

// Lab mode's workbench (PRD §69.7, ja-mvo9.4): the map shares the screen with it (the page gives the map the top and
// this the bottom). Tabs for what the game does not need while it is played: the history charts, the world, Jev, the
// levers, the numbers, the journal; and a step control, to take the game a tick or a second at a time while paused.
// The key l, the palette or Settings toggle it; it replaced the Details screen. Its tab lives in the Lab store
// (labStore.ts), so a "?" on the policy anywhere opens the Policy tab at its section (PRD §69.8).

const TABS: [LabTab, string][] = [
  ["history", "History"],
  ["policy", "Policy"],
  ["world", "World"],
  ["jev", "Jev"],
  ["levers", "Levers"],
  ["numbers", "Numbers"],
  ["journal", "Journal"],
];

/** Colony k's line colour in the charts: a fixed slot per colony (never by rank), the validated --series palette. */
const seriesColor = (k: number) => `var(--series-${(k % 6) + 1})`;
/** The Lab as it opens, by l, the palette or Settings. */
const HISTORY: LabTarget = { tab: "history" };
const pct = (v: number) => `${Math.round(100 * v)}%`;
const whole = (v: number) => String(Math.round(v));

export default function LabBench(
  props: LabProps & {
    history: History;
    /** step the game n ticks of 1/30 s (useColony.step) */
    step: (n: number) => void;
    /** what the Policy tab reads */
    policy: PolicyProps;
  },
) {
  const { history, step, controls, update, journal, game } = props;
  const target = useLab() ?? HISTORY;
  const tab = target.tab === "journal" && !journal ? "history" : target.tab;
  const setTab = (t: LabTab) => openLab({ tab: t });
  const body = useRef<HTMLDivElement>(null);
  // The target the Lab opened with: opening it by l, the palette or Settings takes no focus, so Space still plays and
  // pauses (review of #237, S1). A "?" is the other way in, and it focuses its section.
  const opened = useRef(target);
  // A target section (a "?" on the policy) is scrolled to once its tab has rendered, and takes the keyboard's focus, so a
  // "?" pressed by key lands where it opened (review of #237, S1); a tab of its own starts at the top.
  useEffect(() => {
    const el = target.id ? document.getElementById(`lab-${target.id}`) : null;
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.querySelector("summary")?.focus({ preventScroll: true });
    } else {
      body.current?.scrollTo({ top: 0 });
      // A button that swapped the tab under it (the Policy tab's "the Levers tab") leaves focus nowhere: the tab takes
      // it, so the keyboard stays in the Lab (review of #237, N2).
      if (target !== opened.current && document.activeElement === document.body)
        document.querySelector<HTMLElement>('[aria-label="lab tabs"] [aria-selected="true"]')?.focus({ preventScroll: true });
    }
  }, [target]);
  // However the Lab closes (Escape, ×, l, the palette), a focus left nowhere goes to the map, so its keys work at once
  // (review of #237, N4; as the Drawer gives focus back).
  useEffect(
    () => () => {
      if (document.activeElement === document.body || document.activeElement === null)
        document.querySelector<HTMLElement>("main canvas")?.focus({ preventScroll: true });
    },
    [],
  );
  // A step changes nothing React holds: count them, so the time and the buttons read the game after each.
  const [, setSteps] = useState(0);
  // A queen in flight waits for the page to found her (the pen), as play does.
  const flying = useGameRead(() => game.flights.length > 0);
  const tabs = TABS.filter(([t]) => t !== "journal" || journal);
  // Escape, with focus in the Lab, closes it (the owner, D1 on #237): only for a key pressed with focus in it (else the claim passes, to a
  // drawer or the builder), and one Escape, one thing, so not when a chart's crosshair took it (it settles the event) or a tooltip or the Codex
  // is open above (escape.ts). The map takes the focus back (the effect above).
  const section = useRef<HTMLElement>(null);
  useEscape(
    ESCAPE_LAYER.lab,
    (e) => {
      if (!section.current?.contains(e.target as Node)) return false;
      closeLab();
      return true;
    },
    true,
    "below",
  );
  return (
    <section
      ref={section}
      aria-label="lab"
      className="absolute inset-x-0 bottom-0 z-10 flex h-[42dvh] flex-col border-t border-line bg-ground"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
        <h2 className="font-semibold text-fg max-sm:order-1">Lab</h2>
        <div className="flex overflow-x-auto rounded-md border border-line text-[13px] max-sm:order-3" role="tablist" aria-label="lab tabs">
          {tabs.map(([t, name]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`px-2.5 py-1 ${tab === t ? "bg-accent text-accent-ink" : "text-fg-2 hover:bg-raised"}`}
              onClick={() => setTab(t)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs max-sm:order-4 max-sm:ml-0" role="group" aria-label="step">
          <button
            type="button"
            className="rounded-md border border-line px-2 py-1 text-fg-2 hover:bg-raised"
            onClick={() => update({ playing: !controls.playing })}
          >
            {controls.playing ? "Pause" : "Play"}
          </button>
          {(
            [
              [1, "Step a tick", "One tick: 1/30 s of game time"],
              [30, "Step a second", "30 ticks: one second of game time"],
            ] as const
          ).map(([n, label, tip]) => (
            <button
              key={n}
              type="button"
              className="rounded-md border border-line px-2 py-1 text-fg-2 hover:bg-raised disabled:opacity-40"
              disabled={controls.playing || flying}
              title={controls.playing ? "Pause first" : flying ? "Found her first" : tip}
              onClick={() => {
                step(n);
                setSteps((k) => k + 1);
              }}
            >
              {label}
            </button>
          ))}
          <span
            className="font-mono text-fg-3 tabular-nums"
            aria-label="game time"
            title="Game time: minutes and seconds, then the tick within the second (of 30)"
          >
            <GameTime game={game} />
          </span>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg max-sm:order-2 max-sm:ml-auto"
          onClick={closeLab}
          aria-label="Close the Lab"
          title="Close the Lab (l)"
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <div
        ref={body}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-fg-2"
        role="tabpanel"
        aria-label={TABS.find(([t]) => t === tab)?.[1]}
      >
        {tab === "history" && <HistoryTab history={history} />}
        {tab === "policy" && (
          <div className="max-w-3xl">
            <PolicyTab {...props.policy} focus={target.id} ping={target} />
          </div>
        )}
        {tab !== "history" && tab !== "policy" && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            {tab === "world" && <World {...props} />}
            {tab === "jev" && <JevCard />}
            {tab === "levers" && <Levers {...props} />}
            {tab === "numbers" && (
              <>
                <FungusNumbers />
                <Debug />
              </>
            )}
            {tab === "journal" && journal && <JournalCard journal={journal} />}
          </div>
        )}
      </div>
    </section>
  );
}

/** The history: four charts sharing game time, and the same numbers as a table. Read once a second. */
function HistoryTab({ history }: { history: History }) {
  useSimTick(1000);
  const xs = history.samples;
  if (xs.length < 2) return <p className="text-xs text-fg-3">The charts start once the game has run a couple of seconds.</p>;
  const colonies = Math.max(...xs.map((s) => s.living.length));
  const per = (pick: (s: (typeof xs)[number]) => number[]) =>
    Array.from({ length: colonies }, (_, k) => ({ name: colonyName(k), color: seriesColor(k), values: perColony(xs, pick, k) }));
  const living = per((s) => s.living);
  const infected = per((s) => s.infected);
  // The table: about a dozen rows, evenly spaced, and the last.
  const stride = Math.max(1, Math.ceil(xs.length / 12));
  const rows = xs.filter((_, i) => i % stride === 0 || i === xs.length - 1);
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 lg:grid-cols-2">
        <HistoryChart
          title="Infected: share of each colony's living ants"
          samples={xs}
          series={infected}
          yMax={Math.min(
            1,
            niceMax(
              infected.flatMap((s) => s.values),
              0.1,
            ),
          )}
          format={pct}
        />
        <HistoryChart
          title="Living ants"
          samples={xs}
          series={living}
          yMax={niceMax(
            living.flatMap((s) => s.values),
            10,
          )}
          format={whole}
        />
        <HistoryChart
          title="The odours apart: 1 at the start, 0 when they smell alike"
          samples={xs}
          series={[{ name: "gap", color: seriesColor(0), values: xs.map((s) => s.gap) }]}
          yMax={niceMax(
            xs.map((s) => s.gap),
            1,
          )}
          format={(v) => v.toFixed(2)}
        />
        <HistoryChart
          title="Mutations to keep"
          samples={xs}
          series={[{ name: "mutations", color: seriesColor(0), values: xs.map((s) => s.mutations) }]}
          yMax={niceMax(
            xs.map((s) => s.mutations),
            10,
          )}
          format={whole}
        />
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-fg-3 hover:text-fg-2">As a table</summary>
        <div
          className="mt-2 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent"
          tabIndex={0}
          role="region"
          aria-label="history table"
        >
          <table className="font-mono tabular-nums">
            <thead className="text-fg-3">
              <tr>
                <th className="pr-3 text-left font-normal">time</th>
                {Array.from({ length: colonies }, (_, k) => (
                  <th key={`i${k}`} className="pr-3 text-right font-normal">
                    {colonyName(k)} infected
                  </th>
                ))}
                {Array.from({ length: colonies }, (_, k) => (
                  <th key={`l${k}`} className="pr-3 text-right font-normal">
                    {colonyName(k)} living
                  </th>
                ))}
                <th className="pr-3 text-right font-normal">gap</th>
                <th className="text-right font-normal">mutations</th>
              </tr>
            </thead>
            <tbody className="text-fg-2">
              {rows.map((s) => (
                <tr key={s.t}>
                  <td className="pr-3">{clock(s.t)}</td>
                  {Array.from({ length: colonies }, (_, k) => (
                    <td key={`i${k}`} className="pr-3 text-right">
                      {k < s.infected.length ? pct(s.infected[k]!) : "—"}
                    </td>
                  ))}
                  {Array.from({ length: colonies }, (_, k) => (
                    <td key={`l${k}`} className="pr-3 text-right">
                      {s.living[k] ?? "—"}
                    </td>
                  ))}
                  <td className="pr-3 text-right">{s.gap.toFixed(2)}</td>
                  <td className="text-right">{s.mutations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** The game's time in minutes, seconds and the tick within the second: read from the game itself (the stats' clock is to the tenth), and drawn on each stats tick. */
function GameTime({ game }: { game: Game }) {
  return <>{useGameRead(() => clockTicks(game.time))}</>;
}
