import { SITUATIONS } from "./colony/colony.ts";
import { DEFAULT_RECOGNITION } from "./colony/recognition.ts";
import { DOCTRINES } from "./colony/colonyBrain.ts";
import { USD_PER_INPUT_TOKEN } from "../shared/jev.ts";
import { useCallback, useMemo, useState } from "react";
import AntCard from "./ui/AntCard.tsx";
import ColonyField from "./ui/ColonyField.tsx";
import type { Followed } from "./ui/follow.ts";
import Nav from "./ui/Nav.tsx";
import { Bar, Slider } from "./ui/Panel.tsx";
import { seg } from "./ui/styles.ts";
import { STRAINS, useColony, type Brush, type Ground, type SideStats } from "./ui/useColony.ts";
import { colonyName, colonyTone } from "./ui/names.ts";
import { TOKENS_PER_FUNGAL_SITUATION, TOKENS_PER_SITUATION, useColonyJev } from "./ui/useColonyJev.ts";
import { AIMS } from "./colony/fungusBrain.ts";
import { INTERVENTIONS, LETHAL } from "./colony/fungus.ts";

// The colony page: a procedural world, two rival colonies (Ink and Amber,
// named for how they are drawn), and the fungus: the player, and nobody's
// side (docs/fungus-policy.md). The fungus paints scent (lure, alarm),
// inoculates ants of either colony (spores), and shapes its own policy (the
// menu, the rule's settings, its aim). Each colony has a doctrine, its nature:
// a scenario setting, not the player's lever. With Jev on, every ant's mode
// and every colony's stance are Jev's answers for their situation under that
// colony's doctrine, and the fungus's interventions under the aim, each asked
// once per situation and cached. The fungus's goal is one colony (unified);
// a colony that falls is its loss.

const usd = (v: number) => `$${v.toFixed(4)}`;

export default function ColonyApp() {
  const { game, colony, controls, update, stats, fps, onFrame, restart, newWorld, paint } = useColony();
  const jev = useColonyJev(game.colonies, game.fungus, controls.menu);
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
          <div className="relative" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
            <ColonyField
              colony={colony}
              rival={game.rival}
              fungus={game.fungus}
              onFrame={onFrame}
              showFoodTrail={controls.showFoodTrail}
              showHomeTrail={controls.showHomeTrail}
              onPaint={controls.brush === "none" ? null : paint}
              followed={followed}
              onFollow={setFollowed}
            />
          </div>
          {followed ? (
            <AntCard followed={followed} colony={colony} rival={game.rival} explain={jev.explain} explainFungus={jev.explainFungus} onClose={() => setFollowed(null)} />
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
              <dl className="mt-3 grid grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-x-4 gap-y-1 border-t border-line pt-3 font-mono text-xs text-fg-2">
                <dt className="text-fg-3" />
                {["ants", "food home", "lost", "born", "dug", "stance"].map((h) => (
                  <dt key={h} className="text-[11px] uppercase tracking-wide text-fg-3">
                    {h}
                  </dt>
                ))}
                {stats.sides.map((s, k) => (
                  <SideRow key={k} name={colonyName(k)} tone={colonyTone(k)} s={s} />
                ))}
              </dl>
            )}
            {stats && stats.outcome !== "playing" && (
              <p className={`mt-3 rounded-md px-3 py-1.5 text-sm ${stats.outcome === "fallen" ? "bg-err-soft text-err" : "bg-accent-soft text-accent"}`}>
                {stats.outcome === "fallen" ? fallenText(stats.fallen) : "One colony: the two nests smell alike and nobody has died fighting for a minute. The fungus has unified them."}
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
                <button type="button" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover" onClick={jev.start} title="Jev picks every colony's ant modes and stances under that colony's doctrine, and what the fungus does under your aim: each once per situation, cached">
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
              <Stat label="answers cached" value={`${jev.state.cached} · ${jev.state.stancesCached} stances · ${jev.state.fungusCached} fungus`} />
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
              {size.w}×{size.h} cells of {controls.ground === "underground" ? "soil to dig, rock, a few chambers" : "rock, ground"} and {stats ? stats.foodTotal.toLocaleString() : "—"} units of food. Every 4 food stored is a new ant.
            </p>
            <div className="mt-2 flex items-center justify-between text-sm text-fg-2">
              <span>Ground</span>
              <div className="flex overflow-hidden rounded-md border border-line text-sm">
                {(["underground", "open"] as Ground[]).map((g) => (
                  <button key={g} type="button" className={seg(controls.ground === g)} onClick={() => update({ ground: g })} title={g === "underground" ? "Mostly soil: ants dig tunnels to food and carry the soil home to a mound" : "The open surface: rock and walkable ground"}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-2 flex items-center justify-between text-sm text-fg-2">
              <span>Two colonies</span>
              <input type="checkbox" checked={controls.rival} onChange={(e) => update({ rival: e.target.checked })} />
            </label>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <Slider label="Ants per colony" value={controls.antCount} min={100} max={2000} step={50} format={(v) => String(v)} onChange={(v) => update({ antCount: v })} />
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
                {(["none", "lure", "alarm", "spores"] as Brush[]).map((b) => (
                  <button key={b} type="button" className={seg(controls.brush === b)} onClick={() => update({ brush: b })} title={BRUSH_TITLES[b]}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-fg-3">{controls.brush === "none" ? "Pick a brush, then drag on the field. Painting is free." : "Drag on the field to paint. Free."}</p>
            {controls.brush === "spores" && (
              <>
                <div className="mt-3 flex items-center justify-between">
                  <span>Strain</span>
                  <div className="flex overflow-hidden rounded-md border border-line text-sm">
                    {STRAINS.map((st, k) => (
                      <button key={st.id} type="button" className={seg(controls.strain === k)} onClick={() => update({ strain: k })} title={st.blurb}>
                        {st.name}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-xs text-fg-3">{STRAINS[controls.strain]?.name}: {STRAINS[controls.strain]?.blurb}.</p>
              </>
            )}
            {stats && (
              <dl className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-0.5 font-mono text-xs" aria-label="infection">
                <dt />
                <dt className="text-right text-[11px] uppercase tracking-wide text-fg-3">infected</dt>
                <dt className="text-right text-[11px] uppercase tracking-wide text-fg-3">resistance</dt>
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
                  <span>Unity</span>
                  <span className="font-mono text-sm tabular-nums text-fg">{Math.round(100 * stats.unity.score)}%</span>
                </div>
                <Bar value={stats.unity.score} />
                <p className="mt-1 font-mono text-xs text-fg-3">
                  nests {stats.unity.gap.toFixed(2)} apart in odour · {stats.unity.deathsPerMinute.toFixed(0)} fight deaths/min · quiet {Math.min(999, Math.floor(stats.unity.quiet))} s · {Math.round(100 * stats.unity.mixing)}% mixed
                </p>
                <p className="mt-1 text-xs text-fg-3">One colony when the nests smell alike (within {TOLERANCE}) and nobody has died fighting for a minute. Ants are coloured by odour.</p>
              </div>
            )}

            <div className="mt-4" aria-label="fungus policy">
              <span>What the fungus may do</span>
              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                {INTERVENTIONS.map((v) => {
                  const on = controls.menu.includes(v.id);
                  const lethal = LETHAL.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={on}
                      className={`rounded-md border px-2 py-0.5 font-mono ${on ? (lethal ? "border-err bg-err-soft text-err" : "border-accent bg-accent-soft text-accent") : "border-line text-fg-3 hover:bg-raised"}`}
                      title={`${v.blurb}${lethal ? ". Only strains that allow it (Bloom) can run it." : ""}`}
                      onClick={() => update({ menu: on ? controls.menu.filter((id) => id !== v.id) : [...controls.menu, v.id] })}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
              <label className="mt-2 flex items-center justify-between text-xs text-fg-2">
                <span>Hide groomed hosts (dormant shows a quarter)</span>
                <input type="checkbox" checked={controls.hide} onChange={(e) => update({ hide: e.target.checked })} />
              </label>
              <label className="mt-1 flex items-center justify-between text-xs text-fg-2">
                <span>Cull high-load hosts fighting strangers</span>
                <input type="checkbox" checked={controls.cull} onChange={(e) => update({ cull: e.target.checked })} />
              </label>
              <p className="mt-1 text-xs text-fg-3">
                {running ? "Jev picks what the fungus does in each host, under your aim, from what that host's strain allows and the menu has on." : "The local rule: each strain does what it was bred for (Lockpick soothes, Bloom shares, Garden blends), within the menu and the settings above."}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span>Aim</span>
                <div className="flex overflow-hidden rounded-md border border-line text-sm">
                  {AIMS.map((a) => (
                    <button key={a.id} type="button" className={seg(jev.aim.id === a.id)} onClick={() => jev.setAim({ id: a.id, text: a.text })}>
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="mt-2 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
                rows={3}
                value={jev.aim.text}
                onChange={(e) => jev.draftAim({ id: "custom", text: e.target.value })}
                onBlur={(e) => jev.setAim({ id: jev.aim.id, text: e.target.value })}
                aria-label="aim"
              />
              <p className="mt-1 text-xs text-fg-3">The fungus's goal, in your words: Jev reads it (never the ants). ≈ {TOKENS_PER_FUNGAL_SITUATION} tokens per fungal situation asked.</p>
            </div>

          </section>

          <section className="rounded-lg border border-line bg-panel p-4 text-sm text-fg-2" aria-label="colonies">
            <h2 className="text-xs font-medium uppercase tracking-wide text-fg-3">Colonies</h2>
            <p className="mt-1 text-xs text-fg-3">Each colony's nature: the doctrine its ants follow when Jev is on. Not yours to steer: you are the fungus. A scenario setting.</p>
            {jev.doctrines.slice(0, stats ? stats.sides.length : 1).map((d, k) => (
              <div key={k} className="mt-3">
                <div className="flex items-center justify-between">
                  <span className={colonyTone(k)}>{colonyName(k)}</span>
                  <div className="flex overflow-hidden rounded-md border border-line text-sm">
                    {DOCTRINES.map((p) => (
                      <button key={p.id} type="button" className={seg(d.id === p.id)} onClick={() => jev.setDoctrine(k, { id: p.id, text: p.text })}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  className="mt-2 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
                  rows={3}
                  value={d.text}
                  onChange={(e) => jev.draftDoctrine(k, { id: "custom", text: e.target.value })}
                  onBlur={(e) => jev.setDoctrine(k, { id: d.id, text: e.target.value })}
                  aria-label={`${colonyName(k)} doctrine`}
                />
              </div>
            ))}
            <p className="mt-1 text-xs text-fg-3">
              A new doctrine re-asks the situations a colony meets: about {stats ? stats.situationsSeen : "—"} so far, ≈ {retune.toLocaleString()} tokens ≈ {usd(retune * USD_PER_INPUT_TOKEN)}. Colonies with the same doctrine share every answer; one used before is free.
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
      <dd className="tabular-nums">{s.dug.toLocaleString()}</dd>
      <dd>{s.stance}</dd>
    </>
  );
}

/** A colony is gone: the fungus's loss, whichever colony it was. */
function fallenText(k: number): string {
  return `The ${colonyName(k)} colony is gone: no ants left and no food to raise more. There is no one left to unite it with. Restart or try a new world.`;
}

const TOLERANCE = DEFAULT_RECOGNITION.tolerance;

const BRUSH_TITLES: Record<Brush, string> = {
  none: "Stop painting",
  lure: "Paint food scent: ants follow it",
  alarm: "Paint alarm: ants shy away; a doctrine can send them home",
  spores: "Inoculate: spores on the ground and a dose of the strain into the ants there, of either colony",
};

function Infection({ name, tone, s }: { name: string; tone: string; s: SideStats }) {
  return (
    <>
      <dt className={tone}>{name}</dt>
      <dd className="text-right tabular-nums text-spore">{Math.round(100 * s.infected)}%</dd>
      <dd className="text-right tabular-nums text-fg-2">{s.resist.toFixed(2)}</dd>
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
