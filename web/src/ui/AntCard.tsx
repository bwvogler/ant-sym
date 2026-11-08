import { useEffect, useState } from "react";
import { MODES, TRAILS, type Colony, type Mode, type Situation } from "../colony/colony.ts";
import { INFECTED, STRAINS, type Fungus } from "../colony/fungus.ts";
import { pulled } from "../colony/levers.ts";
import { UPGRADES } from "../colony/evolution.ts";
import { decodeFungal, type FungalSituation } from "../colony/fungalPolicy.ts";
import { followedColony, sideIndex, type Followed } from "./follow.ts";
import { colonyName, colonyTone } from "./names.ts";
import Help from "./Help.tsx";
import { openLearn, type LearnTarget } from "./learn.ts";
import type { DecidedBy } from "./colonyJev.ts";

// The followed ant, up close: what it is doing, the situation it was in
// when it last chose, and who made the choice: Jev's cached answer for
// that situation under the doctrine, the local rule while Jev has not
// answered yet, or the local rule. If the fungus is in it, what the fungus
// runs there and how it bends the ant's senses: the situation shown is the
// one the ant perceives. Read from the colony's arrays four times a second;
// the field keeps the camera on the ant.

interface Props {
  followed: Followed;
  colonies: readonly Colony[];
  fungus: Fungus;
  /** who decided, for an ant of colony k */
  explain: (s: Situation, k: number) => { mode: Mode; by: DecidedBy };
  explainFungus: (s: FungalSituation) => { answer: string; by: DecidedBy };
  onClose: () => void;
}

const BY: Record<DecidedBy, string> = { jev: "Jev's cached answer under its colony's doctrine", stale: "Jev's answer under its earlier doctrine, while the new one is asked", waiting: "the local rule, while Jev is asked", local: "the local rule" };

export default function AntCard({ followed, colonies, fungus, explain, explainFungus, onClose }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const col = followedColony(colonies, followed);
  const i = followed.i;
  if (!col) return null;
  const mode = MODES[col.mode[i] as number] as Mode;
  const carrying = col.carrying[i] === 1;
  const since = col.since[i] as number;
  // Tiredness is the ant's fatigue (seconds of unsuccessful search, less rest), not its time out (review of #36).
  const fatigue = col.fatigue[i] as number;
  const q = col.lastQuestion(i);
  const k = sideIndex(followed);
  const decided = q && !carrying ? explain(q, k) : null;
  return (
    <section className="rounded-lg border border-accent/40 bg-panel px-4 py-3 text-sm" aria-label="followed ant">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-medium text-fg">
          Ant #{i} <span className={colonyTone(k)}>· the {colonyName(k)} colony</span>
        </h2>
        <span className="font-mono text-xs text-fg-2">
          {mode}
          {carrying ? " · carrying food" : ""} · out {since.toFixed(0)} s · fatigue {fatigue.toFixed(0)} / {col.params.patience} s · at ({(col.x[i] as number).toFixed(0)}, {(col.y[i] as number).toFixed(0)})
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
          {chips(q).map(([k, v, to]) => (
            <button key={k} type="button" className="rounded bg-raised px-1.5 py-0.5 font-mono text-fg-2 hover:text-accent hover:underline" onClick={() => openLearn(to)} title={`Learn: ${k}`}>
              {k} {v}
            </button>
          ))}
          <span className="text-fg-3">→</span>
          <span className={`rounded bg-accent-soft px-1.5 py-0.5 font-mono text-accent ${decided?.by === "stale" ? "opacity-50" : ""}`} title={decided?.by === "stale" ? "stale: the answer under the earlier words, until Jev answers the new ones" : undefined}>
            {mode}
          </span>
          <span className="text-fg-3">{decided ? `by ${BY[decided.by]}` : ""}</span>
          <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => openLearn({ tab: "policy", id: "mode" })}>
            why?
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-fg-3">Not asked yet.</p>
      )}
      <Fungal col={col} i={i} fungus={fungus} explain={explainFungus} />
    </section>
  );
}

/** What the fungus is doing to ant i: what it senses there, and the levers it pulls (fungus-policy §11). */
const FUNGUS_BY: Record<DecidedBy, string> = { jev: "Jev's cached answer under your aim", stale: "Jev's answer under your earlier aim, while the new one is asked", waiting: "the strain's default, while Jev is asked", local: "the strain's default" };

function Fungal({ col, i, fungus, explain }: { col: Colony; i: number; fungus: Fungus; explain: Props["explainFungus"] }) {
  const load = col.load[i] as number;
  const resist = col.resist[i] as number;
  if (load < INFECTED) return resist >= 0.05 ? <p className="mt-2 text-xs text-fg-3">Clean · resistance {resist.toFixed(2)} from grooming infected nestmates.</p> : null;
  const s = col.strain[i] as number;
  const strain = STRAINS[s];
  const code = col.fungal[i] as number;
  const sensed = code >= 0 ? decodeFungal(code) : null;
  const decided = sensed ? explain(sensed) : null;
  const wanted = decided ? fungus.resolve(decided.answer, s) : {};
  const levers = decided ? pulled(wanted, fungus.menu) : [];
  // What the host runs: Jev's levels held to the fungus's reach (ja-lo8.12).
  const held = fungus.held(wanted, s);
  const stale = decided?.by === "stale";
  return (
    <>
      {sensed && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-fg-3">the fungus senses:</span>
          <Help to={{ tab: "policy", id: "fungus" }} label="what the fungus senses" />
          {(
            [
              ["arousal", sensed.arousal],
              ["touch", sensed.touch],
              ["place", sensed.place],
              ["task", sensed.task],
              ["carrying", sensed.carrying],
              [sensed.groomed ? "groomed" : "unseen", ""],
            ] as const
          ).map(([k, v]) => (
            <span key={k} className="rounded bg-raised px-1.5 py-0.5 font-mono text-fg-2">
              {k} {v}
            </span>
          ))}
        </div>
      )}
      {decided && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-fg-3">and pulls:</span>
          {levers.length === 0 && <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-fg-3">nothing</span>}
          {levers.map(({ lever, level }) => {
            const runs = held[lever.id] ?? level;
            const by = runs === level ? null : UPGRADES.find((u) => u.levers?.includes(lever.id));
            return (
              <span
                key={lever.id}
                className={`rounded bg-raised px-1.5 py-0.5 font-mono ${lever.kind === "perceive" ? "text-spore" : lever.kind === "lethal" ? "text-err" : "text-accent"} ${stale ? "opacity-50" : ""}`}
                title={`${lever.kind === "perceive" ? "what it perceives" : lever.kind === "lethal" ? "lethal" : "what it gives off"}: ${lever.blurb}${by ? `. Its policy wants ${lever.words[level]}; your fungus reaches ${lever.words[runs]}: keep ${by.name} to go further.` : ""}`}
              >
                {lever.name}: {lever.words[runs]}
                {by && <span className="text-fg-3"> (wants {lever.words[level]})</span>}
              </span>
            );
          })}
          <span className="text-fg-3">by {FUNGUS_BY[decided.by]}</span>
          <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => openLearn({ tab: "policy", id: "fungus" })}>
            why?
          </button>
        </div>
      )}
      <p className="mt-1.5 text-xs text-fg-3">
        <span className="text-spore">
          {strain?.name ?? "fungus"} {Math.round(100 * load)}%
        </span>
        {resist >= 0.05 ? ` · resistance ${resist.toFixed(2)}` : ""} · odour {(col.odour[i] as number).toFixed(2)} (its nest {col.nestOdour.toFixed(2)}). The ant's situation above is what it perceives; its own policy chose.
      </p>
    </>
  );
}

/** The situation's fields, each with where the Learn drawer explains it. */
function chips(s: Situation): [string, string, LearnTarget][] {
  const underground = !(TRAILS as readonly string[]).includes(s.homeTrail);
  return [
    ["mode", s.mode, { tab: "policy", id: "mode" }],
    [s.tired ? "tired" : "fresh", "", { tab: "guide", id: "fatigue" }],
    ["food", s.foodTrail, { tab: "guide", id: "food-trail" }],
    ["home", s.homeTrail, { tab: "guide", id: underground ? "inside" : "home-trail" }],
    ["alarm", s.alarm, { tab: "guide", id: "alarm" }],
    ["enemy", s.enemy, { tab: "guide", id: "strangers" }],
    ["stance", s.stance, { tab: "policy", id: "stance" }],
  ];
}
