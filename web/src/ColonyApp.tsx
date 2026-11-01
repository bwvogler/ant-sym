import { SITUATIONS } from "./colony/colony.ts";
import ColonyField from "./ui/ColonyField.tsx";
import Nav from "./ui/Nav.tsx";
import { Bar, Slider } from "./ui/Panel.tsx";
import { seg } from "./ui/styles.ts";
import { useColony } from "./ui/useColony.ts";

// The colony page: a procedural world the ants forage on their own. Every
// ant's behaviour mode comes from the local rule, so this page never calls
// Jev and costs nothing; the panel counts the mode choices and the distinct
// situations they were made in, which is what a cached Jev policy would pay for.

export default function ColonyApp() {
  const { colony, controls, update, stats, fps, onFrame, restart, newWorld } = useColony();
  const { size } = colony.map;
  const share = stats && stats.foodTotal > 0 ? stats.stored / stats.foodTotal : 0;
  return (
    <main className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Jev Ants</h1>
          <Nav page="colony" />
        </div>
        <p className="text-sm text-fg-3">a colony that forages on its own: trails, not orders</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="relative" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
            <ColonyField colony={colony} onFrame={onFrame} showFoodTrail={controls.showFoodTrail} showHomeTrail={controls.showHomeTrail} />
          </div>
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
              <Stat label="mode choices / s" value={stats ? Math.round(stats.choicesPerSecond).toLocaleString() : "—"} />
              <Stat label="situations seen" value={stats ? `${stats.situationsSeen} / ${SITUATIONS}` : "—"} />
              <Stat label="jev spend" value="$0.0000" />
            </div>
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
              {size.w}×{size.h} cells of rock, ground and {stats ? stats.foodTotal.toLocaleString() : "—"} units of food around one nest.
            </p>
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
            <h2 className="text-xs font-medium uppercase tracking-wide text-fg-3">Brain</h2>
            <p className="mt-2">
              Each ant explores, follows a food trail or goes home. The <span className="text-fg">local rule</span> picks the mode, and only when an ant's situation changes: it found food, a trail appeared or faded, it has been out too long.
            </p>
            <p className="mt-2 text-fg-3">No Jev here yet. Those choices fall into at most {SITUATIONS} situations, so a cached Jev policy would ask at most that many questions.</p>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-fg-3">{label}</span>
      <span className="font-mono text-sm tabular-nums text-fg">{value}</span>
    </div>
  );
}
