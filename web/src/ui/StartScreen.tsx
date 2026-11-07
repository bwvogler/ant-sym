import { useState } from "react";
import { colonyName } from "./names.ts";
import { LANDING_COLONY } from "./useColony.ts";
import { describe, type SaveRecord } from "./saves.ts";

// The fungus game's first screen (ja-lo8.5): what the player is, Start, and Continue the last saved game (ja-lo8.6).
// The field waits behind it, paused.

export default function StartScreen({ seed, onStart, latest, onContinue }: { seed: number; onStart: (seed: number) => void; latest: SaveRecord | null; onContinue: (r: SaveRecord) => void }) {
  const [s, setS] = useState(seed);
  const ink = colonyName(LANDING_COLONY);
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ground/80 px-4 backdrop-blur-sm" role="dialog" aria-label="Start">
      <section className="w-full max-w-lg rounded-xl border border-line bg-panel p-6 shadow-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-fg">You are a fungus</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-fg-2">
          <p>
            Your spores fall by the hole of the <span className="font-medium">{ink}</span> colony. Ants walking out pick you up, and you spread through them by touch.
          </p>
          <p>
            You never decide what an ant does. Inside each ant you live in, you bend what it perceives and what it gives off. Tell the fungus what you want in your <span className="font-medium">aim</span>; Jev turns your words into what the fungus does, situation by situation.
          </p>
          <p>The colonies' own minds are closed to you, until you reach a queen.</p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <span>World</span>
            <input className="w-24 rounded-md border border-line bg-paper px-2 py-1 font-mono text-fg outline-none focus:border-accent" type="number" min={1} value={s} onChange={(e) => setS(Math.max(1, Math.floor(Number(e.target.value) || 1)))} aria-label="world seed" />
          </label>
          <button type="button" className="rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised" onClick={() => setS(1 + Math.floor(Math.random() * 99_999))}>
            another
          </button>
          <button type="button" className="ml-auto rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover" onClick={() => onStart(s)} autoFocus={!latest}>
            Start
          </button>
        </div>
        {latest && (
          <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
            <p className="min-w-0 flex-1 text-xs text-fg-3">
              {describe(latest)}
              {latest.chapter ? <span className="block truncate">{latest.chapter}</span> : null}
            </p>
            <button type="button" className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent-soft" onClick={() => onContinue(latest)} autoFocus>
              Continue
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
