// The Mutations drawer's upgrades as a tech tree (ja-52ui, PRD §80). Wide: tiers left to right, one box for each level you
// can keep, a row for each upgrade, curves from a level to what it leads on to (owner 2026-11-16). A phone keeps the list:
// the level an upgrade is at and its next level's button, or what that level still needs. The price is not on the boxes: it
// is one price, and the drawer's header shows it beside the mutations in hand.

import { useLayoutEffect, useRef, useState } from "react";
import { LETHAL_LEVERS, UPGRADES, canKeep, unmet, upgrade, type Upgrade } from "../colony/index.ts";
import Tip from "./Tip.tsx";
import { NextBody, UpgradeBody } from "./UpgradeTips.tsx";
import { needText } from "./upgradeText.ts";
import { BRANCHES, TIER_COUNT, tierOf } from "./upgradeBranches.ts";

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

/** A line to draw: from the level (`from`) to the level it leads on to (`to`). */
const links = UPGRADES.flatMap((u) =>
  u.steps.slice(1).flatMap((_, j) => {
    const k = j + 1;
    const from: [string, number][] = (u.needs[j] ?? []).map((n) => [n.id, n.level]);
    if (k > 1) from.push([u.id, k - 1]);
    return from.map(([id, level]) => ({ id, level, toId: u.id, toLevel: k }));
  }),
);

/** The upgrades: a tree when `wide`, else a list. */
export default function UpgradeTree({ levels, mutations, evolve, idle, wide }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<{ d: string; met: boolean }[]>([]);
  // The boxes move only when a level changes, not on every stats update (a fresh `levels` object each time).
  const levelsKey = UPGRADES.map((u) => levels[u.id] ?? 0).join();
  useLayoutEffect(() => {
    const el = box.current;
    if (!wide || !el) return setEdges([]);
    const kept = levelsKey.split(",").map(Number);
    const measure = () => {
      const o = el.getBoundingClientRect();
      const at = (id: string, level: number) => el.querySelector<HTMLElement>(`[data-level="${id}:${level}"]`)?.getBoundingClientRect();
      const out: { d: string; met: boolean }[] = [];
      for (const l of links) {
        const a = at(l.id, l.level);
        const b = at(l.toId, l.toLevel);
        if (!a || !b) continue;
        const x1 = a.right - o.left;
        const x2 = b.left - o.left;
        const y1 = a.top + a.height / 2 - o.top;
        const y2 = b.top + b.height / 2 - o.top;
        const xm = (x1 + x2) / 2;
        out.push({
          d: y1 === y2 ? `M${x1},${y1} H${x2}` : `M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2}`,
          met: kept[UPGRADES.findIndex((x) => x.id === l.id)]! >= l.level,
        });
      }
      setEdges(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide, levelsKey]);

  /** One level of an upgrade, as a box in the tree. */
  const node = (u: Upgrade, k: number) => {
    const level = levels[u.id] ?? 0;
    const missing = unmet(levels, u.id);
    const next = k === level + 1;
    const buyable = next && missing.length === 0;
    const look =
      k <= level
        ? "border-spore/40 text-fg shadow-[inset_0_0_0_99px_color-mix(in_oklab,var(--spore)_14%,transparent)]"
        : buyable
          ? "border-accent text-fg hover:bg-raised"
          : `border-dashed border-line ${next ? "text-fg-2" : "text-fg-3"}`;
    const box = `relative block w-full rounded-md border bg-panel px-1.5 py-1 text-left ${look}`;
    const body = (
      <>
        <span className={`block text-[10px] leading-tight ${nameClass(u)}`}>{u.name}</span>
        <span className="block text-[11px] leading-tight break-words">{u.steps[k]}</span>
        {idle(u) && <span className="block text-[9px] leading-tight text-fg-3">not on the menu</span>}
      </>
    );
    return buyable ? (
      <Tip tip={<NextBody u={u} levels={levels} />} className="block" dotted={false} tapToOpen={false} tabStop={false}>
        <button
          type="button"
          data-level={`${u.id}:${k}`}
          className={`${box} disabled:pointer-events-none disabled:opacity-50`}
          disabled={!canKeep(levels, mutations, u.id)}
          onClick={() => evolve(u.id)}
        >
          {body}
        </button>
      </Tip>
    ) : (
      <Tip tip={next ? <NextBody u={u} levels={levels} /> : <UpgradeBody u={u} level={level} />} className="block" dotted={false}>
        <span data-level={`${u.id}:${k}`} className={box}>
          {body}
        </span>
      </Tip>
    );
  };

  /** A phone's row for an upgrade: its name and level, and its next level's button or what it needs. */
  const row = (u: Upgrade) => {
    const level = levels[u.id] ?? 0;
    const missing = unmet(levels, u.id);
    return (
      <li key={u.id} className="flex items-center justify-between gap-2 text-xs">
        <Tip tip={<UpgradeBody u={u} level={level} />} className="min-w-0 truncate">
          <span className={nameClass(u)}>{u.name}</span>
          <span className="text-fg-3"> {u.steps[level]}</span>
          {idle(u) && <span className="text-fg-3"> (not on the menu)</span>}
        </Tip>
        {level >= u.steps.length - 1 ? (
          <span className="shrink-0 text-fg-3">at its most</span>
        ) : missing.length ? (
          <Tip tip={<NextBody u={u} levels={levels} />} className="shrink-0 text-right text-fg-3" tapToOpen>
            needs {missing.map(needText).join(", ")}
          </Tip>
        ) : (
          <Tip tip={<NextBody u={u} levels={levels} />} className="shrink-0" dotted={false} tapToOpen={false} tabStop={false}>
            <button
              type="button"
              className="rounded-md border border-accent bg-panel px-2 py-0.5 text-fg hover:bg-raised disabled:pointer-events-none disabled:opacity-40"
              disabled={!canKeep(levels, mutations, u.id)}
              onClick={() => evolve(u.id)}
            >
              {u.steps[level + 1]}
            </button>
          </Tip>
        )}
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
      <div className={`flex flex-col ${wide ? "gap-3" : "gap-1"}`} aria-label="upgrades">
        {BRANCHES.map((b) => (
          <section key={b.name} aria-label={b.name}>
            {wide && <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{b.name}</h3>}
            {wide ? (
              <ul className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: `repeat(${TIER_COUNT}, minmax(0, 1fr))` }}>
                {b.ids.flatMap((id, r) => {
                  const u = upgrade(id);
                  return u.steps.slice(1).map((_, j) => (
                    <li key={`${id}:${j + 1}`} style={{ gridColumn: tierOf(id, j + 1) + 1, gridRow: r + 1 }}>
                      {node(u, j + 1)}
                    </li>
                  ));
                })}
              </ul>
            ) : (
              <ul className="flex flex-col gap-1">{b.ids.map((id) => row(upgrade(id)))}</ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
