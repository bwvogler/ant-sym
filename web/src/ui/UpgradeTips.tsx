import type { Upgrade } from "../colony/index.ts";
import { nextLevelTip, upgradeTip } from "./upgradeText.ts";

/** The tooltip body for an upgrade: what it is, why it matters, each level (the current one marked), and the levers a reach upgrade widens. */
export function UpgradeBody({ u, level }: { u: Upgrade; level: number }) {
  const t = upgradeTip(u);
  return (
    <span className="flex flex-col gap-1.5">
      <span>
        <span className="font-semibold">{t.name}</span>{" "}
        <span className="text-fg-3">({t.kind === "spread" ? "its body" : "its reach"})</span>
        <span className="block text-fg-2">{t.what}.</span>
      </span>
      <span className="block">{t.why}</span>
      <span className="block">
        {t.levels.map((l, k) => (
          <span key={l.step} className={`block ${k === level ? "font-semibold text-spore" : "text-fg-2"}`}>
            {k === level ? "now: " : k < level ? "had: " : "next: "}
            {l.step}: {l.line}
            {k > level && u.costs[k - 1] !== undefined ? ` (${u.costs[k - 1]!.toLocaleString()} mutations)` : ""}
          </span>
        ))}
      </span>
      {t.levers.length > 0 && (
        <span className="block">
          <span className="block text-fg-3">Levers it widens:</span>
          {t.levers.map((l) => (
            <span key={l.id} className="block">
              <span className={l.lethal ? "text-err" : "text-accent"}>{l.name}</span>
              <span className="text-fg-2">: {l.blurb}.</span>
            </span>
          ))}
        </span>
      )}
      {t.reachNote && <span className="block text-fg-3">{t.reachNote}</span>}
    </span>
  );
}

/** The tooltip body for the button that buys the next level. */
export function NextBody({ u, level }: { u: Upgrade; level: number }) {
  const n = nextLevelTip(u, level);
  if (!n) return null;
  return (
    <span className="flex flex-col gap-1">
      <span>
        <span className="font-semibold">
          {u.name}: {n.step}
        </span>{" "}
        for {n.cost.toLocaleString()} mutation{n.cost === 1 ? "" : "s"}
      </span>
      <span className="block text-fg-2">{n.line}.</span>
      <span className="block text-fg-3">{u.blurb}.</span>
    </span>
  );
}
