import { useEffect, useState } from "react";
import { MODES, type Colony, type Mode, type Situation } from "../colony/colony.ts";
import { INFECTED, INTERVENTIONS, STRAINS } from "../colony/fungus.ts";
import { followedColony, type Followed } from "./follow.ts";

// The followed ant, up close: what it is doing, the situation it was in
// when it last chose, and who made the choice: Jev's cached answer for
// that situation under the doctrine, the local rule while Jev has not
// answered yet, or the local rule. If the fungus is in it, what the fungus
// runs there and how it bends the ant's senses: the situation shown is the
// one the ant perceives. Read from the colony's arrays four times a second;
// the field keeps the camera on the ant.

interface Props {
  followed: Followed;
  colony: Colony;
  rival: Colony | null;
  explain: (s: Situation) => { mode: Mode; by: "jev" | "waiting" | "local" };
  onClose: () => void;
}

const BY = { jev: "Jev's cached answer", waiting: "the local rule, while Jev is asked", local: "the local rule" } as const;

export default function AntCard({ followed, colony, rival, explain, onClose }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const col = followedColony(colony, rival, followed);
  const i = followed.i;
  if (!col) return null;
  const mode = MODES[col.mode[i] as number] as Mode;
  const carrying = col.carrying[i] === 1;
  const since = col.since[i] as number;
  const q = col.lastQuestion(i);
  const decided = followed.side === "you" && q && !carrying ? explain(q) : null;
  return (
    <section className="rounded-lg border border-accent/40 bg-panel px-4 py-3 text-sm" aria-label="followed ant">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-medium text-fg">
          Ant #{i} <span className={followed.side === "you" ? "text-fg-3" : "text-warn"}>· {followed.side === "you" ? "your colony" : "the rival's"}</span>
        </h2>
        <span className="font-mono text-xs text-fg-2">
          {mode}
          {carrying ? " · carrying food" : ""} · out {since.toFixed(0)} s · at ({(col.x[i] as number).toFixed(0)}, {(col.y[i] as number).toFixed(0)})
        </span>
        <button type="button" className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs text-fg-2 hover:bg-raised" onClick={onClose}>
          Stop following
        </button>
      </div>
      {carrying ? (
        <p className="mt-2 text-xs text-fg-3">Carrying food home: a mechanic, not a choice. It is asked again once it puts the food down.</p>
      ) : q ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-fg-3">last asked:</span>
          {chips(q).map(([k, v]) => (
            <span key={k} className="rounded bg-raised px-1.5 py-0.5 font-mono text-fg-2">
              {k} {v}
            </span>
          ))}
          <span className="text-fg-3">→</span>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-accent">{mode}</span>
          <span className="text-fg-3">{decided ? `by ${BY[decided.by]}` : followed.side === "rival" ? "by the local rule (the rival never asks Jev)" : ""}</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-fg-3">Not asked yet.</p>
      )}
      <Fungal col={col} i={i} />
    </section>
  );
}

/** What the fungus is doing to ant i: strain, load, the intervention it runs, and each sense it bends. */
function Fungal({ col, i }: { col: Colony; i: number }) {
  const load = col.load[i] as number;
  const resist = col.resist[i] as number;
  if (load < INFECTED) return resist >= 0.05 ? <p className="mt-2 text-xs text-fg-3">Clean · resistance {resist.toFixed(2)} from grooming infected nestmates.</p> : null;
  const strain = STRAINS[col.strain[i] as number];
  const run = INTERVENTIONS[col.expr[i] as number];
  const bent = perceives(col, i);
  return (
    <p className="mt-2 text-xs text-fg-2">
      <span className="text-spore">
        {strain?.name ?? "fungus"} {Math.round(100 * load)}%
      </span>
      {resist >= 0.05 ? ` · resistance ${resist.toFixed(2)}` : ""} · odour {(col.odour[i] as number).toFixed(2)} (its nest {col.nestOdour.toFixed(2)}) · runs <span className="font-mono">{run?.name ?? "?"}</span>
      {bent.length ? <span className="text-fg-3"> — it perceives {bent.join(", ")}. The situation above is what it perceives; its own policy chose.</span> : <span className="text-fg-3"> — its senses are as they are.</span>}
    </p>
  );
}

/** The senses the fungus bends in ant i, in words. */
function perceives(col: Colony, i: number): string[] {
  const out: string[] = [];
  const gain = (name: string, v: number) => {
    if (Math.abs(v - 1) >= 0.05) out.push(`${name} ×${v.toFixed(2)}`);
  };
  gain("food scent", col.gainFood[i] as number);
  gain("home scent", col.gainHome[i] as number);
  gain("alarm", col.gainAlarm[i] as number);
  const foreign = col.foreignFood[i] as number;
  if (foreign >= 0.05) out.push(`the rival's food trail as its own ×${foreign.toFixed(2)}`);
  const clock = col.clock[i] as number;
  if (Math.abs(clock - 1) >= 0.05) out.push(`its time out ×${(1 / clock).toFixed(2)}`);
  const wider = (col.tolerance[i] as number) - col.params.tolerance;
  if (wider >= 0.02) out.push(`strangers only past ${(col.tolerance[i] as number).toFixed(2)} of odour (not ${col.params.tolerance.toFixed(2)})`);
  const calm = col.calm[i] as number;
  if (calm >= 0.05) out.push(`and gives off a calming cue (${calm.toFixed(2)})`);
  const mask = col.mask[i] as number;
  if (mask >= 0.02) out.push(`and carries ${Math.round(100 * mask)}% of the fungus's own odour`);
  const lay = col.layGain[i] as number;
  if (Math.abs(lay - 1) >= 0.05) out.push(`and lays its trail ×${lay.toFixed(2)}`);
  const leak = col.crossLay[i] as number;
  if (leak >= 0.05) out.push(`and leaks ${Math.round(100 * leak)}% of its food trail to the rival`);
  const quiet = col.quiet[i] as number;
  if (quiet >= 0.05) out.push(`and fights raising ${Math.round(100 * (1 - quiet))}% of the alarm`);
  return out;
}

function chips(s: Situation): [string, string][] {
  return [
    ["mode", s.mode],
    [s.tired ? "tired" : "fresh", ""],
    ["food", s.foodTrail],
    ["home", s.homeTrail],
    ["alarm", s.alarm],
    ["enemy", s.enemy],
    ["stance", s.stance],
  ];
}
