import { SITUATIONS } from "./colony/colony.ts";
import { worldExtent } from "./colony/world.ts";
import { DOCTRINES } from "./colony/colonyBrain.ts";
import { USD_PER_INPUT_TOKEN } from "../shared/jev.ts";
import { useCallback, useMemo, useState } from "react";
import AntCard from "./ui/AntCard.tsx";
import ColonyField from "./ui/ColonyField.tsx";
import type { Followed } from "./ui/follow.ts";
import Nav from "./ui/Nav.tsx";
import { Bar, Slider } from "./ui/Panel.tsx";
import { seg } from "./ui/styles.ts";
import { RIVAL_BY_DEFAULT, useColony, type Brush, type Ground, type SideStats } from "./ui/useColony.ts";
import { TOKENS_PER_SITUATION, useColonyJev } from "./ui/useColonyJev.ts";

// The colony page: a procedural world, your colony and a rival's, and the
// fungus (you) that steers yours. The fungus paints scent (free: lure and
// alarm brushes) and sets the colony's doctrine; with Jev on, each ant's
// mode and the colony's stance are Jev's answers for their situation under
// that doctrine, asked once per situation and cached, so the spend follows
// new situations and retunes, not ants or time. The rival plays the local
// rule. Food makes ants; fights kill them; a colony with neither is beaten.

const usd = (v: number) => `$${v.toFixed(4)}`;

export default function ColonyApp() {
  const { game, colony, controls, update, stats, fps, onFrame, restart, newWorld, paint } = useColony();
  const jev = useColonyJev(colony);
  // The followed ant belongs to the game it was picked in: a new game has new ants, so nothing is followed.
  // Keyed by a token per game rather than the game itself, so an old game is not kept alive by this state.
  const gameToken = useMemo(() => ({ game: game.map.seed }), [game]);
  const [follow, setFollow] = useState<{ token: object; f: Followed } | null>(null);
  const followed = follow && follow.token === gameToken ? follow.f : null;
  const setFollowed = useCallback((f: Followed | null) => setFollow(f ? { token: gameToken, f } : null), [gameToken]);
  const { size } = colony.map;
  const share = stats && stats.foodTotal > 0 ? stats.stored / stats.foodTotal : 0;
  const running = jev.state.phase === "running";
  const run = jev.state.run;
  const choices = jev.state.hits + jev.state.misses;
  const perHour = run && run.elapsedSeconds > 5 ? (run.usd / run.elapsedSeconds) * 3600 : null;
  const retune = stats ? stats.situationsSeen * TOKENS_PER_SITUATION : 0;
  return (
    <main className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Jev Ants</h1>
          <Nav page="colony" />
        </div>
        <p className="text-sm text-fg-3">two colonies, one map: trails, not orders</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="relative" style={{ aspectRatio: `${worldExtent(colony.map).w} / ${worldExtent(colony.map).h}` }}>
            <ColonyField
              colony={colony}
              rival={game.rival}
              onFrame={onFrame}
              showFoodTrail={controls.showFoodTrail}
              showHomeTrail={controls.showHomeTrail}
              onPaint={controls.brush === "none" ? null : paint}
              followed={followed}
              onFollow={setFollowed}
            />
          </div>
          {followed ? (
            <AntCard followed={followed} colony={colony} rival={game.rival} explain={jev.explain} onClose={() => setFollowed(null)} />
          ) : (
            <p className="-mt-2 text-xs text-fg-3">
              {controls.brush === "none"
                ? "Drag to pan · wheel or pinch to zoom · arrow keys and +/− work too · tap or click an ant to follow it."
                : "Dragging paints with the brush · pinch or wheel to zoom · space+drag or right-drag pans · set the brush to “none” to follow an ant."}
            </p>
          )}
          <section className="rounded-lg border border-line bg-panel px-4 py-3" aria-label="colony stats">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-[10rem]">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tabular-nums text-fg">{stats ? stats.stored.toLocaleString() : "0"}</span>
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
                <dl className="grid w-max min-w-full grid-cols-[repeat(7,auto)] gap-x-4 gap-y-1 whitespace-nowrap font-mono text-xs text-fg-2">
                  <dt className="text-fg-3" />
                  {["ants", "food home", "lost", "born", "dug / mound / filled", "stance"].map((h) => (
                    <dt key={h} className="text-[11px] uppercase tracking-wide text-fg-3">
                      {h}
                    </dt>
                  ))}
                  <SideRow name="you" tone="text-fg" s={stats.you} />
                  {stats.rival && <SideRow name="rival" tone="text-warn" s={stats.rival} />}
                </dl>
              </div>
            )}
            {stats && stats.outcome !== "playing" && (
              <p className={`mt-3 rounded-md px-3 py-1.5 text-sm ${stats.outcome === "won" ? "bg-accent-soft text-accent" : "bg-err-soft text-err"}`}>
                {stats.outcome === "won" ? "The rival colony is gone. Your ants hold the map." : "Your colony is gone: no ants left and no food to raise more. Restart or try a new world."}
              </p>
            )}
          </section>
          <section className="rounded-lg border border-line bg-panel px-4 py-3" aria-label="colony jev">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {running ? (
                <button type="button" className="rounded-md bg-err px-4 py-2 text-sm font-medium text-white hover:opacity-90" onClick={jev.stop}>
                  Stop Jev
                </button>
              ) : (
                <button type="button" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover" onClick={jev.start} title="Jev picks each ant's mode, once per situation under the doctrine">
                  Start Jev
                </button>
              )}
              <div className="min-w-[8rem]">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tabular-nums text-fg">{run ? usd(run.usd) : "$0.0000"}</span>
                  <span className="text-xs text-fg-3">{run ? `of $${run.caps.capUsd.toFixed(2)}` : "this run"}</span>
                </div>
                <Bar value={run && run.caps.capUsd > 0 ? Math.min(1, run.usd / run.caps.capUsd) : 0} />
              </div>
              <Stat label="avg $ / hour" value={perHour === null ? "—" : `$${perHour.toFixed(3)}`} />
              <Stat label="tokens" value={run ? run.inputTokens.toLocaleString() : "—"} />
              <Stat label="situations asked" value={String(jev.state.asked)} />
              <Stat label="answers cached" value={`${jev.state.cached} · ${jev.state.stancesCached} stances`} />
              <Stat label="from cache" value={choices > 0 ? `${Math.round((100 * jev.state.hits) / choices)}%` : "—"} />
              <span className={`ml-auto font-mono text-xs ${running ? "text-accent" : "text-fg-3"}`}>{running ? "jev on" : jev.state.phase === "stopped" ? "stopped · local rule" : "local rule"}</span>
            </div>
            {jev.state.lastError && (
              <p className="mt-3 truncate rounded-md bg-warn-soft px-3 py-1.5 text-xs text-warn" title={jev.state.lastError}>
                {jev.state.lastError}
              </p>
            )}
          </section>
        </div>
        <aside className="flex w-full flex-col gap-5 lg:w-80">
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-fg-3">World</h2>
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
              <button type="button" className="ml-auto rounded-md border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-raised" onClick={newWorld}>
                New world
              </button>
            </div>
            <p className="mt-2 text-xs text-fg-3">
              {size.w}×{size.h} cells {controls.ground === "side" ? "seen from the side: sky, the ground line, soil and stones to dig," : "seen from above: rock, ground"} and {stats ? stats.foodTotal.toLocaleString() : "—"} units of food. Every 4 food stored is a new ant.
            </p>
            <div className="mt-2 flex items-center justify-between text-sm text-fg-2">
              <span>Ground</span>
              <div className="flex overflow-hidden rounded-md border border-line text-sm">
                {(["side", "open"] as Ground[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={seg(controls.ground === g)}
                    onClick={() => update({ ground: g, rival: RIVAL_BY_DEFAULT[g] })}
                    title={g === "side" ? "A cross-section: ants forage on the ground line, dig their nest below it and carry the soil up to a mound" : "The open surface from above: rock and walkable ground"}
                  >
                    {g === "side" ? "side view" : "from above"}
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-2 flex items-center justify-between text-sm text-fg-2">
              <span title={controls.ground === "side" ? "In the side view both colonies forage along one ground line: expect a war" : undefined}>Rival colony</span>
              <input type="checkbox" checked={controls.rival} onChange={(e) => update({ rival: e.target.checked })} />
            </label>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <Slider label="Ants" value={controls.antCount} min={100} max={2000} step={50} format={(v) => String(v)} onChange={(v) => update({ antCount: v })} />
            <Slider label="Speed" value={controls.speed} min={0.25} max={4} step={0.25} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => update({ speed: v })} />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-fg-2">Trails</span>
              <div className="flex overflow-hidden rounded-md border border-line text-sm">
                <button type="button" className={seg(controls.showFoodTrail)} onClick={() => update({ showFoodTrail: !controls.showFoodTrail })} title="Laid by ants carrying food home: it leads to food">
                  to food
                </button>
                <button type="button" className={seg(controls.showHomeTrail)} onClick={() => update({ showHomeTrail: !controls.showHomeTrail })} title="Laid by ants walking out: it leads home">
                  to home
                </button>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover" onClick={() => update({ playing: !controls.playing })}>
                {controls.playing ? "Pause" : "Play"}
              </button>
              <button type="button" className="flex-1 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-fg hover:bg-raised" onClick={restart}>
                Restart
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4 text-sm text-fg-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-fg-3">Fungus</h2>
            <div className="mt-3 flex items-center justify-between">
              <span>Brush</span>
              <div className="flex overflow-hidden rounded-md border border-line text-sm">
                {(["none", "lure", "alarm"] as Brush[]).map((b) => (
                  <button key={b} type="button" className={seg(controls.brush === b)} onClick={() => update({ brush: b })} title={b === "lure" ? "Paint food scent: ants follow it" : b === "alarm" ? "Paint alarm: ants shy away; a doctrine can send them home" : "Stop painting"}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-fg-3">{controls.brush === "none" ? "Pick a brush, then drag on the field. Painting is free." : "Drag on the field to paint. Free."}</p>

            <div className="mt-4 flex items-center justify-between">
              <span>Doctrine</span>
              <div className="flex overflow-hidden rounded-md border border-line text-sm">
                {DOCTRINES.map((d) => (
                  <button key={d.id} type="button" className={seg(jev.doctrine.id === d.id)} onClick={() => jev.setDoctrine({ id: d.id, text: d.text })}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="mt-2 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
              rows={4}
              value={jev.doctrine.text}
              onChange={(e) => jev.draftDoctrine({ id: "custom", text: e.target.value })}
              onBlur={(e) => jev.setDoctrine({ id: jev.doctrine.id, text: e.target.value })}
              aria-label="doctrine"
            />
            <p className="mt-1 text-xs text-fg-3">
              The ants' rules, in your words. A new doctrine re-asks the situations the colony meets: about {stats ? stats.situationsSeen : "—"} so far, ≈ {retune.toLocaleString()} tokens ≈ {usd(retune * USD_PER_INPUT_TOKEN)}. One used before is free.
            </p>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4 font-mono text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-fg-2">
              <dt className="text-fg-3">food left</dt>
              <dd className="text-right">{stats ? Math.round(stats.foodLeft).toLocaleString() : "—"}</dd>
              <dt className="text-fg-3">sim time</dt>
              <dd className="text-right">{stats ? `${stats.time.toFixed(1)}s` : "—"}</dd>
              <dt className="text-fg-3">fps</dt>
              <dd className="text-right">{fps}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </main>
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
      <dd className="tabular-nums" title="soil cells dug / pellets of it on the mound / pellets put back into unused dead ends">
        {s.dug.toLocaleString()} / {s.mound.toLocaleString()} / {s.filled.toLocaleString()}
      </dd>
      <dd>{s.stance}</dd>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-fg-3">{label}</span>
      <span className="font-mono text-sm tabular-nums text-fg">{value}</span>
    </div>
  );
}
