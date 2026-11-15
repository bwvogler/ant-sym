// The Mutations drawer's upgrades as a tree (ja-52ui, PRD §78): branches of upgrades, each a row of its levels, and a
// line from each level another needs to the level that needs it. At phone width the same rows fall back to the list:
// the level it is at and the next one's button, or what that level still needs.

import { useLayoutEffect, useRef, useState } from "react";
import { LETHAL_LEVERS, UPGRADES, canKeep, nextCost, unmet, type Upgrade } from "../colony/index.ts";
import Tip from "./Tip.tsx";
import { NextBody, UpgradeBody } from "./UpgradeTips.tsx";
import { needText } from "./upgradeText.ts";
import { BRANCHES } from "./upgradeBranches.ts";

function nameClass(u: Upgrade): string {
  return u.kind === "spread" ? "text-spore" : u.levers?.every((id) => LETHAL_LEVERS.has(id)) ? "text-err" : "text-accent";
}

interface Props {
  levels: Readonly<Record<string, number>>;
  mutations: number;
  evolve: (id: string) => boolean;
  /** an upgrade whose levers are all lethal and off the menu: keeping it would do nothing yet */
  idle: (u: Upgrade) => boolean;
  wide: boolean;
}

/** The upgrades: a tree when `wide`, else a list. One `li` per upgrade, its name first and its one button (the next level) after. */
export default function UpgradeTree({ levels, mutations, evolve, idle, wide }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<{ d: string; met: boolean }[]>([]);
  // Lines from each needed level to the level that needs it, measured off the drawn chips.
  // The chips move only when a level changes, not on every stats update (a fresh `levels` object each time).
  const levelsKey = UPGRADES.map((u) => levels[u.id] ?? 0).join();
  useLayoutEffect(() => {
    const el = box.current;
    if (!wide || !el) return setEdges([]);
    const kept = levelsKey.split(",").map(Number);
    const measure = () => {
      const o = el.getBoundingClientRect();
      const at = (id: string, level: number) => el.querySelector<HTMLElement>(`[data-level="${id}:${level}"]`)?.getBoundingClientRect();
      // Each line leaves the needed level's right side, runs down its own lane right of every chip, and enters the level
      // that needs it from the right: lanes in order of length, so short ones sit nearest the chips.
      const pairs: { a: DOMRect; b: DOMRect; met: boolean }[] = [];
      let right = 0;
      for (const c of el.querySelectorAll<HTMLElement>("[data-level]")) right = Math.max(right, c.getBoundingClientRect().right - o.left);
      for (const u of UPGRADES)
        u.needs.forEach((ns, k) => {
          for (const n of ns) {
            const a = at(n.id, n.level);
            const b = at(u.id, k + 1);
            if (a && b) pairs.push({ a, b, met: kept[UPGRADES.findIndex((x) => x.id === n.id)]! >= n.level });
          }
        });
      pairs.sort((p, q) => Math.abs(p.a.top - p.b.top) - Math.abs(q.a.top - q.b.top));
      const out = pairs.map(({ a, b, met }, i) => {
        const lane = right + 10 + 6 * i;
        const y1 = a.top + a.height / 2 - o.top;
        const y2 = b.top + b.height / 2 - o.top;
        return { d: `M${a.right - o.left},${y1} H${lane} V${y2} H${b.right - o.left}`, met };
      });
      setEdges(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide, levelsKey]);

  const row = (u: Upgrade) => {
    const level = levels[u.id] ?? 0;
    const cost = nextCost(levels, u.id);
    const missing = unmet(levels, u.id);
    const next = (
      <Tip tip={<NextBody u={u} levels={levels} />} className="shrink-0" dotted={false} tapToOpen={false} tabStop={false}>
        <button
          type="button"
          data-level={wide ? `${u.id}:${level + 1}` : undefined}
          className={`rounded-md border bg-panel px-2 py-0.5 text-fg hover:bg-raised disabled:pointer-events-none disabled:opacity-40 ${missing.length ? "border-dashed border-line" : "border-accent"}`}
          disabled={!canKeep(levels, mutations, u.id)}
          onClick={() => evolve(u.id)}
        >
          {u.steps[level + 1]} · {cost?.toLocaleString()}
        </button>
      </Tip>
    );
    const name = (
      <Tip tip={<UpgradeBody u={u} level={level} />} className="min-w-0 truncate">
        <span className={nameClass(u)}>{u.name}</span>
        {!wide && <span className="text-fg-3"> {u.steps[level]}</span>}
        {idle(u) && <span className="text-fg-3"> (not on the menu)</span>}
      </Tip>
    );
    if (!wide)
      return (
        <li key={u.id} className="flex items-center justify-between gap-2 text-xs">
          {name}
          {cost === null ? (
            <span className="shrink-0 text-fg-3">at its most</span>
          ) : missing.length ? (
            <Tip tip={<NextBody u={u} levels={levels} />} className="shrink-0 text-right text-fg-3" tapToOpen>
              needs {missing.map(needText).join(", ")}
            </Tip>
          ) : (
            next
          )}
        </li>
      );
    return (
      <li key={u.id} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-[11px]">
        {name}
        <span className="relative flex flex-wrap items-center gap-1">
          {u.steps.map((s, k) =>
            k === level + 1 ? (
              <span key={s}>{next}</span>
            ) : (
              <span
                key={s}
                data-level={`${u.id}:${k}`}
                className={`rounded-md border px-1.5 py-0.5 ${k <= level ? "border-spore/40 bg-panel text-fg shadow-[inset_0_0_0_99px_color-mix(in_oklab,var(--spore)_10%,transparent)]" : "border-dashed border-line bg-panel text-fg-3"}`}
              >
                {s}
              </span>
            ),
          )}
        </span>
      </li>
    );
  };

  return (
    <div ref={box} className="relative mt-2">
      {wide && (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
          {edges.map((e, i) => (
            <path
              key={i}
              d={e.d}
              fill="none"
              className={e.met ? "stroke-spore/60" : "stroke-fg-3/50"}
              strokeWidth={1}
              strokeDasharray={e.met ? undefined : "3 3"}
            />
          ))}
        </svg>
      )}
      <div className={`flex flex-col ${wide ? "gap-2" : "gap-1"}`} aria-label="upgrades">
        {BRANCHES.map((b) => (
          <section key={b.name} aria-label={b.name}>
            {wide && <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{b.name}</h3>}
            <ul className={`flex flex-col ${wide ? "gap-3" : "gap-1"}`}>{b.ids.map((id) => row(UPGRADES.find((u) => u.id === id)!))}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
