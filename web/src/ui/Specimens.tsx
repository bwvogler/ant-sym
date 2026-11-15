import { useEffect, useState } from "react";
import type { Colony } from "../colony/index.ts";
import type { Followed } from "./follow.ts";
import { Icon } from "./kit.tsx";
import { colonyTone } from "./names.ts";
import { sameAnt, specimenRow } from "./specimens.ts";

// The specimens in the inspector (PRD §69.5): the pinned ants side by side, read four times a second, each a row to follow
// it by. The notebook's look, as the Codex: specimen labels in a serif, the numbers in mono.

export default function Specimens({
  list,
  colonies,
  followed,
  onFollow,
  onUnpin,
}: {
  list: readonly Followed[];
  colonies: readonly Colony[];
  followed: Followed | null;
  onFollow: (f: Followed) => void;
  onUnpin: (f: Followed) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="mb-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm" aria-label="specimens">
      <h2 className="font-serif text-[15px] text-fg">Specimens</h2>
      <ul className="mt-1 flex flex-col gap-0.5">
        {list.map((f, n) => {
          const r = specimenRow(colonies, f, n);
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
                    {r.host ? "host" : `fungus ${Math.round(100 * r.load)}%`}
                  </span>
                </span>
                <span className="block font-mono text-[11px] text-fg-2">
                  {r.mode}
                  {r.carrying ? " · carrying food" : ""} · {r.below ? "below" : "above"} · fatigue {r.fatigue.toFixed(0)} / {r.patience} s
                </span>
              </button>
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg"
                onClick={() => onUnpin(f)}
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
