import { useEffect, useRef, useState, type ReactNode } from "react";
import { type Colony, type Game } from "../colony/index.ts";
import { UNLOCK } from "./codex.ts";
import { ESCAPE_LAYER, useEscape } from "./escape.ts";
import { docUrl, guideFor, guideNote, NOTES, type GuideEntry } from "./guide.ts";
import Help from "./Help.tsx";
import { closeLearn, openLearn, useLearn, type LearnTab } from "./learn.ts";
import { colonyName, colonyTone } from "./names.ts";
import { nestView, ROLE_TEXT, type NestView } from "./nest.ts";
import { css, ROLE_RGB } from "./palette.ts";
import Segmented from "./Segmented.tsx";
import { forgetSeen, markViewed, setShowAll, useCodex } from "./useCodex.ts";
import { useSimTick } from "./session.ts";

// The Codex drawer: what the player is looking at, and why. Two tabs: the field guide (each thing on screen, what real
// ants do, how the game models it, with the research notes it comes from) and the nest (its chambers, as only the player
// can see them). Opened from the rail, or from a "?" anywhere (ui/learn.ts). The policy, once its third tab, is Lab mode's
// Policy tab (PolicyTab.tsx, PRD §69.8).

interface Props {
  colonies: readonly Colony[];
  /** the game: its species (which guide entries apply) and its colonies' nests */
  game: Game;
}

const TABS: [Exclude<LearnTab, "policy">, string][] = [
  ["guide", "Field guide"],
  ["nest", "Nest"],
];

const h3 = "text-xs font-medium uppercase tracking-wide text-fg-3";
const card = "rounded-lg border border-line bg-panel p-3";

export default function LearnDrawer(props: Props) {
  const target = useLearn();
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const open = target !== null;

  // Opening moves focus into the drawer; Escape closes it. An Escape the field already handled (it unfollows an ant)
  // is the field's alone (review: one key did both). A doctrine or aim being typed is committed first: its onBlur
  // would not run once the textarea unmounts, leaving Jev on the old words while both panels show the new.
  useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true });
  }, [open]);
  useEscape(
    ESCAPE_LAYER.codex,
    () => {
      const a = document.activeElement;
      if (a instanceof HTMLElement && panel.current?.contains(a)) a.blur();
      closeLearn();
      return true;
    },
    open,
    "below",
  );
  // A target entry is scrolled to once its tab has rendered.
  useEffect(() => {
    if (!target) return;
    const el = target.id ? document.getElementById(`learn-${target.id}`) : null;
    if (el) el.scrollIntoView({ block: "start" });
    else body.current?.scrollTo({ top: 0 });
  }, [target]);

  if (!target) return null;
  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-label="Codex"
      className="panel-in fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-ground shadow-2xl outline-none sm:w-[30rem]"
    >
      <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-3">
        <h2 className="font-semibold text-fg">Codex</h2>
        <Segmented
          role="tablist"
          className="ml-2 text-sm"
          options={TABS.map(([t, name]) => ({ key: t, label: name, on: target.tab === t, onPick: () => openLearn({ tab: t }) }))}
        />
        <button
          type="button"
          className="ml-auto rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised"
          onClick={closeLearn}
          aria-label="Close the Codex"
        >
          Close
        </button>
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-fg-2">
        {target.tab === "guide" && <GuideTab focus={target.id} game={props.game} />}
        {target.tab === "nest" && <NestTab {...props} focus={target.id} />}
      </div>
    </div>
  );
}

// ——— field guide ———

function GuideTab({ focus, game }: { focus?: string; game: Props["game"] }) {
  // A species that lays no trail of a kind doesn't see the entries about it (owner, ja-rf5.11): its colonies' scent says which it lays.
  const ph = game.colonies[0]!.ph;
  const entries = guideFor((c) => ph.has(c), game.params.species.id);
  const note = guideNote((c) => ph.has(c), game.params.species.name);
  // The Codex (PRD §69.4): an entry opens once its cue has shown; the rest wait, named, with what to look for. A link
  // straight to one (a "?", the lens) opens it anyway, and so does the player's "Read it anyway" or "Show every entry".
  const codex = useCodex();
  const [newOnes] = useState(() => new Set(codex.fresh));
  const [read, setRead] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => markViewed(), [codex.fresh.length]);
  const starts = (id: string) => (UNLOCK[id]?.cue ?? "start") === "start";
  const opened = (id: string) => codex.all || codex.seen.has(id) || starts(id) || focus === id || read.has(id);
  const seenCount = entries.filter((e) => codex.seen.has(e.id) || starts(e.id)).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-3">
        What you see on the field, what real ants do, and how the game models it. Each claim comes from a research note in the repository,
        linked under <em>Sources</em>.{note && <> {note}</>}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3" aria-label="codex">
        <span>
          Seen <span className="font-mono text-fg-2 tabular-nums">{seenCount}</span> of {entries.length}: an entry opens the first time your
          hosts show you what it is about.
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-fg-2">
          <input type="checkbox" checked={codex.all} onChange={(e) => setShowAll(e.target.checked)} />
          Show every entry
        </label>
      </div>
      {entries.map((e, n) =>
        opened(e.id) ? (
          <Entry key={e.id} e={e} n={n + 1} hot={focus === e.id} fresh={newOnes.has(e.id)} />
        ) : (
          <Locked key={e.id} e={e} n={n + 1} hint={UNLOCK[e.id]?.hint ?? ""} onRead={() => setRead((r) => new Set([...r, e.id]))} />
        ),
      )}
      <section className={card} id="learn-notes">
        <h3 className={h3}>The research notes</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {NOTES.map((n) => (
            <li key={n.note}>
              <a className="text-accent underline-offset-2 hover:underline" href={docUrl(n.note)} target="_blank" rel="noreferrer">
                {n.title}
              </a>{" "}
              <span className="text-xs text-fg-3">— {n.covers}</span>
            </li>
          ))}
        </ul>
      </section>
      <button
        type="button"
        className="self-start text-xs text-fg-3 underline-offset-2 hover:text-fg-2 hover:underline"
        onClick={forgetSeen}
      >
        Start the notebook afresh (every entry you have seen locks again, from the next game)
      </button>
    </div>
  );
}

/** The notebook's catalogue number: No. 07. */
const no = (n: number) => `No. ${String(n).padStart(2, "0")}`;

/** An entry not yet seen: its name and number, and what to look for. */
function Locked({ e, n, hint, onRead }: { e: GuideEntry; n: number; hint: string; onRead: () => void }) {
  return (
    <section
      id={`learn-${e.id}`}
      className="scroll-mt-2 rounded-lg border border-dashed border-line-strong p-3"
      aria-label={`${e.title}, not yet seen`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-fg-3">{no(n)}</span>
        <h3 className="font-serif text-[15px] text-fg-3">{e.title}</h3>
      </div>
      <p className="mt-1 text-xs text-fg-3">
        Not yet seen. It opens with {hint}.{" "}
        <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={onRead}>
          Read it anyway
        </button>
      </p>
    </section>
  );
}

function Entry({ e, n, hot, fresh }: { e: GuideEntry; n: number; hot: boolean; fresh: boolean }) {
  return (
    <section
      id={`learn-${e.id}`}
      className={`scroll-mt-2 rounded-lg border border-line bg-paper p-3 ${hot ? "border-accent/60 ring-1 ring-accent/30" : ""}`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-fg-3">{no(n)}</span>
        {e.swatch && (
          <span className="flex gap-0.5 self-center" aria-hidden>
            {e.swatch.map((c) => (
              <span key={c} className="inline-block h-3 w-3 rounded-sm border border-line" style={{ background: c }} />
            ))}
          </span>
        )}
        <h3 className="font-serif text-[15px] font-medium text-fg">{e.title}</h3>
        {fresh && <span className="ml-auto rounded-full bg-spore px-1.5 text-[10px] leading-4 text-paper">new</span>}
      </div>
      <dl className="mt-2 flex flex-col gap-1.5 text-[13px] leading-snug">
        <Row k="On screen">{e.onScreen}</Row>
        <Row k="Real ants">{e.realAnts}</Row>
        <Row k="In the game">{e.inGame}</Row>
      </dl>
      {e.scripted && (
        <p className="mt-2 rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">
          Still scripted: it reads {e.scripted.reads}, which no ant can sense.{" "}
          <a className="underline underline-offset-2" href={docUrl("vision", "where-the-code-is-today")} target="_blank" rel="noreferrer">
            Vision gap {e.scripted.bead}
          </a>
        </p>
      )}
      <p className="mt-2 text-xs text-fg-3">
        Sources:{" "}
        {e.sources.map((s, k) => (
          <span key={`${s.note}#${s.anchor}`}>
            {k > 0 && " · "}
            <a className="text-accent underline-offset-2 hover:underline" href={docUrl(s.note, s.anchor)} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <dt className="text-xs text-fg-3">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// ——— nest ———

function NestTab(props: Props & { focus?: string }) {
  useSimTick(500);
  const views = props.colonies.map((c) => nestView(c));
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-md bg-accent-soft px-3 py-2 text-xs text-accent">
        This is the whole nest as you see it, read from the game's chamber table. An ant sees none of it: underground it senses only the
        role of the chamber it stands in, from its floor's smell.{" "}
        <a className="underline" href={docUrl("vision", "what-an-ant-can-sense")} target="_blank" rel="noreferrer">
          What an ant can sense
        </a>
      </p>
      {views.every((v) => v === null) ? (
        <section className={card}>
          <p className="text-[13px]">No nest to look into: no colony has a nest underground.</p>
        </section>
      ) : (
        <>
          <section className={card}>
            <div className="flex items-center gap-2">
              <h3 className={h3}>Chambers by role</h3>
              <Help to={{ tab: "guide", id: "chambers" }} label="chambers" />
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-[13px]">
              {(["royal", "brood", "store", "reception"] as const).map((r) => (
                <li key={r} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-sm border border-line"
                    style={{ background: css(ROLE_RGB[r]!) }}
                    aria-hidden
                  />
                  <span className="font-mono text-xs text-fg">{r}</span>
                  <span>{ROLE_TEXT[r]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-fg-3">
              A new chamber's role comes from its depth against the queen's (reception above, store below, brood otherwise): still a script,
              not something ants decide from what they sense (
              <a className="underline" href={docUrl("vision", "where-the-code-is-today")} target="_blank" rel="noreferrer">
                ja-k4k.3
              </a>
              ). Turn on <span className="font-medium">Labels</span> on the field, then click a chamber to find it here.
            </p>
          </section>
          {views.map((v, k) => (v ? <NestCard key={k} k={k} v={v} focus={props.focus} /> : null))}
        </>
      )}
    </div>
  );
}

function NestCard({ k, v, focus }: { k: number; v: NestView; focus?: string }) {
  return (
    <section className={card}>
      <h3 className="font-medium">
        <span className={colonyTone(k)}>{colonyName(k)}</span> nest
      </h3>
      <p className="mt-1 font-mono text-xs text-fg-2">
        queen {v.queen === "alive" ? "alive" : v.queen === "dead" ? "dead (orphaned)" : "—"} · brood {v.brood.join(" / ")} (eggs / larvae /
        pupae) · {v.inside} inside, {v.outside} out · {v.midden} on the midden
      </p>
      <div
        className="mt-2 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent"
        tabIndex={0}
        role="region"
        aria-label={`${colonyName(k)} chambers table`}
      >
        <table className="w-full min-w-[22rem] text-left text-xs">
          <thead className="text-[11px] tracking-wide text-fg-3 uppercase">
            <tr>
              <th className="py-1 pr-2 font-medium">chamber</th>
              <th className="py-1 pr-2 text-right font-medium" title="rows below the ground line">
                depth
              </th>
              <th className="py-1 pr-2 text-right font-medium" title="cells (floor cells)">
                size
              </th>
              <th className="py-1 pr-2 text-right font-medium">ants</th>
              <th className="py-1 pr-2 text-right font-medium">brood</th>
              <th className="py-1 text-right font-medium">food</th>
            </tr>
          </thead>
          <tbody className="font-mono text-fg-2 tabular-nums">
            {v.chambers.map((c) => {
              const id = `chamber-${k}-${c.id}`;
              return (
                <tr key={c.id} id={`learn-${id}`} className={`scroll-mt-2 border-t border-line ${focus === id ? "bg-accent-soft" : ""}`}>
                  <td className="py-1 pr-2">
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                      style={{ background: c.role in ROLE_RGB ? css(ROLE_RGB[c.role]!) : "var(--mound)" }}
                      aria-hidden
                    />
                    {c.role}
                    {c.queen ? " ♛" : ""}
                  </td>
                  <td className="py-1 pr-2 text-right">{c.depth}</td>
                  <td className="py-1 pr-2 text-right">
                    {c.cells} ({c.floor})
                  </td>
                  <td className="py-1 pr-2 text-right">{c.ants}</td>
                  <td className="py-1 pr-2 text-right">{c.brood}</td>
                  <td className="py-1 text-right">{Math.floor(c.food)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
