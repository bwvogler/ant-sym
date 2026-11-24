import { useRef, useState } from "react";
import type { Colony } from "../colony/index.ts";
import type { Knowledge } from "./fog/knowledge.ts";
import type { Followed } from "./follow.ts";
import { Icon } from "./kit.tsx";
import { colonyTone } from "./names.ts";
import { sameAnt, type Specimen, specimenRow } from "./specimens.ts";
import { useSimTick } from "./session.ts";

// The specimens in the inspector (PRD §69.5): the pinned ants side by side, read about three times a second, each a row to follow
// it by. The notebook's look, as the Codex: specimen labels in a serif, the numbers in mono. Its header folds it to one line
// (owner, review of #218, D2): on a phone it starts folded while nothing is followed, so it doesn't sit over the map.

export default function Specimens({
  list,
  colonies,
  followed,
  onFollow,
  onUnpin,
  fog = null,
}: {
  list: readonly Specimen[];
  colonies: readonly Colony[];
  followed: Followed | null;
  onFollow: (f: Followed) => void;
  onUnpin: (f: Followed) => void;
  /** under the fog of war: a specimen out of every observer's sight shows only who it is */
  fog?: Knowledge | null;
}) {
  const phone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
  const [folded, setFolded] = useState(() => !followed && phone());
  // On a phone the list folds when the follow ends, so it doesn't sit over the map with nothing followed (D2): set as the
  // follow changes, during render, not in an effect.
  const following = followed !== null;
  const [wasFollowing, setWasFollowing] = useState(following);
  if (following !== wasFollowing) {
    setWasFollowing(following);
    if (!following && phone()) setFolded(true);
  }
  const head = useRef<HTMLButtonElement>(null);
  useSimTick(250);
  return (
    <section className="mb-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm" aria-label="specimens">
      <h2>
        <button
          ref={head}
          type="button"
          className="flex w-full items-baseline gap-2 text-left font-serif text-[15px] text-fg"
          aria-expanded={!folded}
          onClick={() => setFolded((v) => !v)}
        >
          Specimens{folded && <span className="font-mono text-xs text-fg-3">: {list.length}</span>}
          <span aria-hidden className="ml-auto text-xs text-fg-3">
            {folded ? "▸" : "▾"}
          </span>
        </button>
      </h2>
      <ul className="mt-1 flex flex-col gap-0.5" hidden={folded}>
        {list.map((f) => {
          const r = specimenRow(colonies, f, fog);
          if (!r) return null;
          const on = followed !== null && sameAnt(followed, f);
          return (
            <li key={`${f.k}-${f.i}-${f.gen}`} className={`flex items-center gap-1 rounded-md ${on ? "bg-accent-soft" : ""}`}>
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left hover:bg-raised"
                onClick={() => onFollow(f)}
                aria-current={on ? "true" : undefined}
                title={on ? "Followed now" : "Follow this specimen"}
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-serif text-[13px] text-fg">{r.label}</span>
                  <span className={`font-mono text-xs ${colonyTone(f.k)}`}>{r.who}</span>
                  <span
                    className={`ml-auto font-mono text-xs tabular-nums ${r.host ? "text-spore" : "text-fg-3"}`}
                    title="the fungus in it: a host from the line on"
                  >
                    {r.lost ? "out of sight" : r.host ? "host" : `fungus ${Math.round(100 * r.load)}%`}
                  </span>
                </span>
                {!r.lost && (
                  <span className="block font-mono text-[11px] text-fg-2">
                    {r.mode}
                    {r.carrying ? " · carrying food" : ""} · {r.below ? "below" : "above"} · fatigue {r.fatigue.toFixed(0)} / {r.patience} s
                  </span>
                )}
              </button>
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg"
                onClick={() => {
                  onUnpin(f);
                  head.current?.focus(); // the row goes with its button: focus to the list's header, not lost (review of #218)
                }}
                aria-label={`Unpin ${r.label}`}
              >
                <Icon name="close" className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
