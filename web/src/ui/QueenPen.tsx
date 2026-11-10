import { useEffect, useState } from "react";
import { DOCTRINES } from "../colony/colonyBrain.ts";
import { FLIGHT } from "../colony/game.ts";
import type { Flight } from "../colony/royal.ts";
import type { DoctrineChoice } from "./useColonyJev.ts";

// The queen's pen (ja-lo8.9): a new queen has flown with the fungus in her, from a colony whose queen it reached. The
// game waits while the player writes her doctrine (her mother's to start with, a free rewrite: the only time a colony's
// words change) and picks where she lands. Her colony plays the local rule until Jev's answers to the new words come
// (ja-lo8.15); her mother's colony keeps its own words.
//
// In one world (U5.2, owner 2026-11-10) she lands where the player clicks on the top view: the pen is a card beside the
// field, not over it, with no landing controls; the field draws her flight's circle and, under the pointer, where she
// would settle (ColonyField's pen), and the click founds her colony on the words written here (`place.onWords`).

export interface Landing {
  /** east (1) or west (−1) of her mother's hole */
  side: 1 | -1;
  /** columns from it */
  distance: number;
}

/** One world's pen: she flies where the player clicks, within `radius` of her mother's hole; the words as they stand go to `onWords`. */
export interface PenPlace {
  radius: number;
  onWords: (d: DoctrineChoice) => void;
}

export default function QueenPen({ flight, mother, daughter, doctrine, onFound, place }: { flight: Flight; mother: string; daughter: string; doctrine: DoctrineChoice; onFound: (d: DoctrineChoice, at: Landing) => void; place?: PenPlace }) {
  const [text, setText] = useState(doctrine.text);
  const [id, setId] = useState(doctrine.id);
  const [side, setSide] = useState<1 | -1>(1);
  const [distance, setDistance] = useState(FLIGHT.land);
  const pick = (d: DoctrineChoice) => {
    setText(d.text);
    setId(d.id);
  };
  const words = text.trim();
  const onWords = place?.onWords;
  useEffect(() => {
    onWords?.({ id, text: words });
  }, [onWords, id, words]);
  const presets = (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="presets">
      {DOCTRINES.map((d) => (
        <button key={d.id} type="button" className={`rounded-md border px-2 py-1 text-xs ${id === d.id && text === d.text ? "border-accent text-accent" : "border-line text-fg-2 hover:bg-raised"}`} onClick={() => pick({ id: d.id, text: d.text })}>
          {d.name}
        </button>
      ))}
      <button type="button" className="rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised" onClick={() => pick(doctrine)}>
        her mother's
      </button>
    </div>
  );
  const editor = (height: string) => (
    <textarea
      className={`mt-2 ${height} w-full resize-none rounded-md border border-line bg-paper p-2 text-sm text-fg outline-none focus:border-accent`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setId(DOCTRINES.find((d) => d.text === e.target.value)?.id ?? "custom");
      }}
      aria-label="her doctrine"
    />
  );
  if (place)
    return (
      <section className="rounded-lg border border-accent/60 bg-panel p-4 text-sm shadow-lg" role="region" aria-label="The queen's pen">
        <h2 className="text-base font-semibold tracking-tight text-fg">A new queen, with you in her</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-2">
          She has flown from <span className="font-medium">{mother}</span>, carrying you (load {Math.round(flight.load * 100)} %). Write the doctrine her colony, <span className="font-medium">{daughter}</span>, will live by: the only time a
          colony's words change.
        </p>
        {presets}
        {editor("h-24")}
        <p className="mt-2 font-medium text-accent">
          Click where she flies (within {place.radius} of {mother}'s hole).
        </p>
        <p className="mt-1 text-xs text-fg-3">The top view shows her flight's circle and, under the pointer, where she would dig her hole (the nearest spot beyond an end of the line the founding rule allows) or why she can't.{words ? "" : " Write her words first."}</p>
      </section>
    );
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ground/80 px-4 backdrop-blur-sm" role="dialog" aria-label="The queen's pen">
      <section className="w-full max-w-xl rounded-xl border border-line bg-panel p-6 shadow-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-fg">A new queen, with you in her</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          She has flown from <span className="font-medium">{mother}</span>, carrying you (load {Math.round(flight.load * 100)} %). Write the doctrine her colony, <span className="font-medium">{daughter}</span>, will live by. This is
          the only time a colony's words change: {mother} keeps its own.
        </p>
        {presets}
        {editor("h-32")}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-fg-2">
          <span>She lands</span>
          <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="side">
            {([-1, 1] as const).map((s) => (
              <button key={s} type="button" className={`px-2 py-1 text-xs ${side === s ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised"}`} onClick={() => setSide(s)} aria-pressed={side === s}>
                {s < 0 ? "west" : "east"}
              </button>
            ))}
          </div>
          <input type="range" min={16} max={FLIGHT.radius} value={distance} onChange={(e) => setDistance(Number(e.target.value))} aria-label="distance" />
          <span className="font-mono tabular-nums">{distance} cells</span>
          <span className="text-xs text-fg-3">from {mother}'s hole (the nearest free spot there)</span>
        </div>
        <p className="mt-3 text-xs text-fg-3">Her colony plays the ants' own rule until Jev has answered the new words, and its odour drifts from her mother's: unless you hold them together, they will come to fight.</p>
        <div className="mt-4 flex justify-end">
          <button type="button" className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-50" disabled={!words} onClick={() => onFound({ id, text: words }, { side, distance })} autoFocus>
            Found her colony
          </button>
        </div>
      </section>
    </div>
  );
}
