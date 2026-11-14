import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  type Colony,
  HOMES,
  MODES,
  STANCES,
  TRAILS,
  type Situation,
  DOCTRINES,
  MODE_CRITERIA,
  RESPONSE_LEGEND,
  responseQuestion,
  RESPONSE_HOOKS,
  AROUSALS,
  CARRYING,
  decodeFungal,
  FUNGAL_PLACES,
  TASKS,
  TOUCHES,
  type FungalSituation,
  INFECTED,
  LEVERS,
  decodeLevels,
  pulled,
  PRESETS,
  askedIn,
  type Game,
  upgradeFor,
  type LaneWords,
} from "../colony/index.ts";
import { LeverChips } from "./DetailsScreen.tsx";
import { USD_PER_INPUT_TOKEN } from "../../shared/jev.ts";
import { followedColony, sideIndex, type Followed } from "./follow.ts";
import { docUrl, guideFor, guideNote, NOTES, type GuideEntry } from "./guide.ts";
import Help from "./Help.tsx";
import { closeLearn, openLearn, useLearn, type LearnTab } from "./learn.ts";
import { colonyName, colonyTone } from "./names.ts";
import { nestView, ROLE_TEXT, type NestView } from "./nest.ts";
import { css, ROLE_RGB } from "./palette.ts";
import {
  byRows,
  LOCAL_FUNGUS_RULES,
  LOCAL_MODE_OTHERWISE,
  LOCAL_MODE_RULES,
  LOCAL_MODE_STRANGERS,
  LOCAL_RESPONSE_RULES,
  localModeOtherwise,
} from "./policyText.ts";
import { PER_REQUEST, requestFor, SAMPLE_FUNGAL, SAMPLE_SITUATION, tokensPerQuestion, type Sample } from "./prompt.ts";
import { seg } from "./styles.ts";
import type { DoctrineChoice } from "./useColonyJev.ts";

// The Learn drawer: what the player is looking at, and why. Three tabs: the
// field guide (each thing on screen, what real ants do, how the game models
// it, with the research notes it comes from), the policy (each colony's
// doctrine and the fungus's aim, editable, then how each decides and what Jev
// is sent), and the nest (its chambers, as only the player can see them). Opened from the header, or from a "?" anywhere (ui/learn.ts).

interface Props {
  colonies: readonly Colony[];
  followed: Followed | null;
  /** each colony's doctrine (read here: a colony's nature, ja-lo8.2) and the fungus's aim: the same state as the main screen's (useColonyJev) */
  doctrines: DoctrineChoice[];
  aim: DoctrineChoice;
  /** why no policy can change now (policyLock), or null: the aim and the menu are disabled while it is set */
  lock: string | null;
  /** the game (its map, for which levers apply) */
  game: Game;
  /** the fungus's answers so far (ColonyJev.fungusAnswers): the table behind "show the table" */
  fungusAnswers: () => { key: string; answer: string; stale: boolean }[];
  /** the fungus's menu and the local rule's settings (useColony controls) */
  menu: readonly string[];
  setMenu: (menu: string[]) => void;
  hide: boolean;
  cull: boolean;
  setRule: (r: { hide?: boolean; cull?: boolean }) => void;
  /** what re-asking under a new doctrine costs now, in words (the side panel's line) */
  retune: string;
  /** the Pages build: no server, so Jev never runs here */
  demo: boolean;
}

const TABS: [LearnTab, string][] = [
  ["guide", "Field guide"],
  ["policy", "Policy"],
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
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const a = document.activeElement;
      if (a instanceof HTMLElement && panel.current?.contains(a)) a.blur();
      closeLearn();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
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
      aria-label="Learn"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-ground shadow-2xl outline-none sm:w-[30rem]"
    >
      <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-3">
        <h2 className="font-semibold text-fg">Learn</h2>
        <div className="ml-2 flex overflow-hidden rounded-md border border-line text-sm" role="tablist">
          {TABS.map(([t, name]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={target.tab === t}
              className={seg(target.tab === t)}
              onClick={() => openLearn({ tab: t })}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ml-auto rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised"
          onClick={closeLearn}
          aria-label="Close Learn"
        >
          Close
        </button>
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-fg-2">
        {target.tab === "guide" && <GuideTab focus={target.id} game={props.game} />}
        {target.tab === "policy" && <PolicyTab {...props} focus={target.id} ping={target} />}
        {target.tab === "nest" && <NestTab {...props} focus={target.id} />}
      </div>
    </div>
  );
}

// ——— field guide ———

function GuideTab({ focus, game }: { focus?: string; game: Props["game"] }) {
  // A species that lays no trail of a kind doesn't see the entries about it (owner, ja-rf5.11): its colonies' scent says which it lays.
  const ph = game.player.ph;
  const entries = guideFor((c) => ph.has(c), game.params.species.id);
  const note = guideNote((c) => ph.has(c), game.params.species.name);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-3">
        What you see on the field, what real ants do, and how the game models it. Each claim comes from a research note in the repository,
        linked under <em>Sources</em>.{note && <> {note}</>}
      </p>
      {entries.map((e) => (
        <Entry key={e.id} e={e} hot={focus === e.id} />
      ))}
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
    </div>
  );
}

function Entry({ e, hot }: { e: GuideEntry; hot: boolean }) {
  return (
    <section id={`learn-${e.id}`} className={`${card} scroll-mt-2 ${hot ? "border-accent/60 ring-1 ring-accent/30" : ""}`}>
      <div className="flex items-center gap-2">
        {e.swatch && (
          <span className="flex gap-0.5" aria-hidden>
            {e.swatch.map((c) => (
              <span key={c} className="inline-block h-3 w-3 rounded-sm border border-line" style={{ background: c }} />
            ))}
          </span>
        )}
        <h3 className="font-medium text-fg">{e.title}</h3>
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

// ——— policy ———

/**
 * The Policy tab, flat: the words each colony's ants and the fungus follow, editable here as in the side panel (the
 * same state), then how each decides, one collapsible section each. The legend Jev reads is shown, not edited: the
 * owner's call (PRD §47).
 */
function PolicyTab(props: Props & { focus?: string; ping: object }) {
  const sides = props.colonies.length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-snug">
        Each colony's ants follow its <em>doctrine</em>; the fungus follows your <em>aim</em>. Jev reads these words and answers once per
        situation (what an ant senses, not one ant), and every ant in that situation takes the answer. Its answers are kept, and play even
        when Jev can't run; where it has not answered yet, the local rule decides.
      </p>

      {props.doctrines.slice(0, Math.max(1, sides)).map((d, k) => (
        <section key={k} className="flex flex-col gap-1" aria-label={`${colonyName(k)} doctrine`}>
          <h3 className="font-medium">
            <span className={colonyTone(k)}>{colonyName(k)}</span> <span className="text-fg-2">doctrine</span>{" "}
            {props.game.revealed[k] && (
              <span className="text-xs font-normal text-fg-3">({DOCTRINES.find((p) => p.id === d.id)?.name ?? "custom"})</span>
            )}
          </h3>
          {props.game.revealed[k] ? (
            <p id={`learn-doctrine-${k}`} className="rounded-md border border-line bg-raised px-2 py-1.5 text-[13px] leading-snug text-fg">
              {d.text}
            </p>
          ) : (
            <p
              id={`learn-doctrine-${k}`}
              className="rounded-md border border-dashed border-line px-2 py-1.5 text-[13px] leading-snug text-fg-3"
            >
              Closed to you: reach the {colonyName(k)} colony's queen to read its mind.
            </p>
          )}
        </section>
      ))}
      <p className="-mt-2 text-xs text-fg-3">
        A colony's doctrine is its nature: not yours to rewrite while it lives. The ants' modes are asked under it. {props.retune} Colonies
        with the same doctrine share every answer.
      </p>

      <section className="flex flex-col gap-2" aria-label="the fungus's aim and levers">
        <h3 className="font-medium">
          <span className="text-spore">Fungus</span> <span className="text-fg-2">aim</span>
        </h3>
        {/* One home for the aim (PRD §69.2): the bar under the map, or The fungus drawer on a narrow screen. */}
        <blockquote className="rounded-md border border-line bg-paper px-2 py-1.5 text-[13px] leading-snug text-fg-2" aria-label="your aim">
          {props.aim.text}
        </blockquote>
        <p className="text-xs text-fg-3">Change it in the aim bar under the map (on a narrow screen, in The fungus drawer).</p>
        <div className="text-[13px]">
          <span className="text-fg-2">Levers the fungus may pull</span>
          <LeverChips game={props.game} menu={props.menu} locked={props.lock !== null} lock={props.lock} onChange={props.setMenu} />
        </div>
        <label className="flex items-center justify-between text-xs text-fg-2">
          <span>Local rule: groomed hosts hide (show a quarter)</span>
          <input
            type="checkbox"
            checked={props.hide}
            disabled={props.lock !== null}
            onChange={(e) => props.setRule({ hide: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between text-xs text-fg-2">
          <span>Local rule: cull hosts fighting foreigners</span>
          <input
            type="checkbox"
            checked={props.cull}
            disabled={props.lock !== null}
            onChange={(e) => props.setRule({ cull: e.target.checked })}
          />
        </label>
        <p className="text-xs text-fg-3">
          Jev sets, for each situation the fungus senses in a host, a level for every lever on the menu, under your aim. Where Jev has not
          answered, the strain does what it was bred for, within the menu and the two settings above.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <h3 className={h3}>How each decides</h3>
        <Section id="mode" ping={props.ping} title="How an ant chooses what to do" focus={props.focus}>
          <ModeExplainer {...props} />
        </Section>
        <Section id="fungus" ping={props.ping} title="How the fungus chooses what to do to a host" focus={props.focus}>
          <FungusExplainer {...props} />
        </Section>
        <Section id="sent" ping={props.ping} title="What Jev is sent" focus={props.focus}>
          <SentExplainer {...props} />
        </Section>
        <Section id="responses" ping={props.ping} title="Small responses (local rule only)" focus={props.focus}>
          <ResponsesExplainer />
        </Section>
      </div>
      {props.lock && <p className="text-xs text-warn">{props.lock}</p>}
    </div>
  );
}

/**
 * One collapsible explainer. The reader opens and closes it; a "?" or "why?" aimed at it opens it again, each time it is
 * pressed (`ping` is the drawer's target, a new object per press), and leaves the other sections as the reader left them.
 */
function Section({ id, title, focus, ping, children }: { id: string; title: string; focus?: string; ping: object; children: ReactNode }) {
  const hot = focus === id;
  const [open, setOpen] = useState(hot);
  const [seen, setSeen] = useState(ping);
  if (seen !== ping) {
    setSeen(ping);
    if (hot) setOpen(true);
  }
  return (
    <details
      id={`learn-${id}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={`scroll-mt-2 rounded-lg border bg-panel ${hot ? "border-accent/60" : "border-line"}`}
    >
      <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-fg">{title}</summary>
      <div className="flex flex-col gap-3 border-t border-line px-3 py-3">{children}</div>
    </details>
  );
}

function Senses({ rows, note }: { rows: [string, string, string][]; note?: ReactNode }) {
  return (
    <div>
      <h4 className={h3}>What it senses</h4>
      <dl className="mt-1.5 flex flex-col gap-1 text-[13px]">
        {rows.map(([k, values, what]) => (
          <div key={k} className="grid grid-cols-[6rem_1fr] gap-2">
            <dt className="font-mono text-xs text-fg">{k}</dt>
            <dd>
              {what} <span className="font-mono text-xs text-fg-3">{values}</span>
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-1.5 text-xs text-fg-3">{note}</p>}
    </div>
  );
}

function Choices({ items }: { items: [string, string][] }) {
  return (
    <div>
      <h4 className={h3}>What it may choose</h4>
      <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
        {items.map(([k, text]) => (
          <li key={k}>
            <span className="font-mono text-xs text-accent">{k}</span> — {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleTable({ rows, otherwise, live }: { rows: readonly { when: string; then: string }[]; otherwise: string; live?: number }) {
  return (
    <div>
      <h4 className={h3}>The local rule</h4>
      <p className="mt-0.5 text-xs text-fg-3">
        Free, and the baseline Jev is measured against. Read top to bottom: the first line that holds decides.
      </p>
      <ol className="mt-1.5 flex flex-col gap-1 text-[13px]">
        {rows.map((r, k) => (
          <li key={k} className={`grid grid-cols-[1fr_auto] gap-2 rounded px-1 ${live === k ? "bg-accent-soft" : ""}`}>
            <span>{r.when}</span>
            <span className="font-mono text-xs text-accent">→ {r.then}</span>
          </li>
        ))}
        <li className={`rounded px-1 text-fg-3 ${live === rows.length ? "bg-accent-soft" : ""}`}>{otherwise}</li>
      </ol>
    </div>
  );
}

/** The followed ant, if it is alive and was asked: its colony index and its last situation. */
function followedSituation(
  colonies: readonly Colony[],
  f: Followed | null,
): { k: number; i: number; col: Colony; s: Situation | null } | null {
  if (!f || !colonies[0]) return null;
  const col = followedColony(colonies, f);
  return col ? { k: sideIndex(f), i: f.i, col, s: col.lastQuestion(f.i) } : null;
}

/** What the fungus senses in the followed ant, if it is infected. */
function followedFungal(colonies: readonly Colony[], f: Followed | null): { i: number; s: FungalSituation } | null {
  const fol = followedSituation(colonies, f);
  if (!fol || fol.col.load[fol.i] < INFECTED) return null;
  const code = fol.col.fungal[fol.i];
  return code >= 0 ? { i: fol.i, s: decodeFungal(code) } : null;
}

/** What the generic senses rows say about each mode-lane field, by name: a species' own schema reuses them for the fields it keeps. */
const MODE_SENSES: Record<string, [values: string, about: string]> = {
  mode: [MODES.join(" · "), "what it is doing now"],
  tired: ["true · false", "it searched long outside without finding food"],
  foodTrail: [TRAILS.join(" · "), "food scent just ahead"],
  homeTrail: [HOMES.join(" · "), "home scent ahead on the ground; underground, the chamber it stands in"],
  alarm: [TRAILS.join(" · "), "alarm scent just ahead"],
  enemy: ["none · near", "an ant of the other colony within two steps (strangers it touches are the contact response's to answer)"],
  stance: [STANCES.join(" · "), "the ant's own: defend while it senses a threat near its nest, raid once recruited"],
};

function ModeExplainer(props: Props) {
  const fol = followedSituation(props.colonies, props.followed);
  const s = fol?.s ?? SAMPLE_SITUATION;
  // The game's species (ja-fnd.5.13): its own fields, choices and local rule where it has them; the generic ant's otherwise.
  const species = props.game.params.species;
  const words = species.lanes.mode;
  const rules = species.ruleText
    ? { rows: species.ruleText.rows, otherwise: species.ruleText.otherwise, fn: species.ruleText.otherwiseMode }
    : species.policy
      ? null
      : { rows: LOCAL_MODE_RULES, otherwise: LOCAL_MODE_OTHERWISE, fn: localModeOtherwise };
  const fields = words?.schema ? words.schema.fields.map((f) => String(f.name)) : Object.keys(MODE_SENSES);
  const senses: [string, string, string][] = fields.map((name) => {
    const own = words?.schema?.fields.find((f) => String(f.name) === name);
    const [values, about] = MODE_SENSES[name] ?? ["", "one of its own senses"];
    return [name, own ? own.values.map(String).join(" · ") : values, about];
  });
  const choices = Object.entries(words?.criteria ?? MODE_CRITERIA) as [string, string][];
  // The last question an ant keeps is the generic situation (S1 of #122): a species with fields of its own can't be read from it, so no row is lit.
  const readable = fields.every((f) => f in MODE_SENSES);
  const live = rules && readable ? rules.rows.findIndex((r) => r.test(s)) : -1;
  const generic = rules?.rows === LOCAL_MODE_RULES;
  return (
    <>
      <Senses
        rows={senses}
        note={
          <>
            {fields.includes("stance") ? (
              <>
                Stance is the ant's own, from what it senses (
                <a className="underline" href={docUrl("stance")} target="_blank" rel="noreferrer">
                  docs/stance.md
                </a>
                ).{" "}
              </>
            ) : null}
            An ant carrying something is not asked: it answers its load's responses instead.
          </>
        }
      />
      <Choices items={choices.map(([m, c]) => [m, c.replace(/^\w+: /, "")])} />
      {rules ? (
        <>
          <RuleTable rows={rules.rows} otherwise={rules.otherwise} live={live >= 0 ? live : rules.rows.length} />
          {generic ? <p className="-mt-1 text-xs text-fg-3">{LOCAL_MODE_STRANGERS}</p> : null}
          {readable ? (
            <p className="-mt-1 text-xs text-fg-3">
              Highlighted: the line that decides{" "}
              {fol?.s ? `ant #${fol.i}'s last situation` : "a sample situation (follow an ant to see its own)"}:{" "}
              {byRows(rules.rows, rules.fn, s)}.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-fg-3">
          {species.name} plays a local rule of its own while Jev has no answer; it is not written out here yet.
        </p>
      )}
    </>
  );
}

function FungusExplainer(props: Props) {
  const fungal = followedFungal(props.colonies, props.followed);
  const [table, setTable] = useState(false);
  const menu = new Set(props.menu);
  return (
    <>
      <p className="text-[13px]">
        The fungus never chooses for an ant. Inside each ant it lives in, it <em>senses</em> the ant's body, and sets how hard to pull each
        of its <em>levers</em>: some change what the ant perceives, others what it gives off to other ants. The ant's own policy still
        decides what the ant does, from the world as it now perceives it.
      </p>
      <p className="rounded-md border border-line bg-raised px-2 py-1.5 font-mono text-[11px] leading-snug text-fg-2">
        what the fungus senses in the ant → a level for each lever → what the ant perceives, and what it gives off → the ant's own choice
      </p>
      <Senses
        rows={[
          ["arousal", AROUSALS.join(" · "), "the host's arousal: it smells alarm, or strangers are close (amines rise with fighting)"],
          ["touch", TOUCHES.join(" · "), "who touches its cuticle: a nestmate or an ant of another colony"],
          ["place", FUNGAL_PLACES.join(" · "), "what is underfoot: open ground, a tunnel, a chamber's floor, the queen's mark"],
          ["task", TASKS.join(" · "), "its body's stage of life (juvenile hormone tracks task): nurse, inside worker, forager"],
          ["carrying", CARRYING.join(" · "), "what is in its jaws"],
          ["groomed", "true · false", "its nestmates are grooming the fungus off it"],
        ]}
        note={
          <>
            Most of these are marked design in the research note: no paper shows a fungus reading them.{" "}
            <a
              className="text-accent hover:underline"
              href={docUrl("fungus-policy", "11-what-the-fungus-senses-inside-an-ant-and-its-levers")}
              target="_blank"
              rel="noreferrer"
            >
              fungus-policy §11
            </a>
            {fungal && (
              <>
                {" "}
                · The followed ant's fungus senses:{" "}
                <span className="font-mono">
                  {fungal.s.arousal} · {fungal.s.touch} · {fungal.s.place} · {fungal.s.task} · {fungal.s.carrying}
                  {fungal.s.groomed ? " · groomed" : ""}
                </span>
                .
              </>
            )}
          </>
        }
      />
      <div>
        <h4 className={h3}>Its levers</h4>
        <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
          {LEVERS.filter((v) => menu.has(v.id) || v.kind === "lethal").map((v) => (
            <li key={v.id} className={menu.has(v.id) ? "" : "opacity-60"}>
              <span
                className={`font-mono text-xs ${v.kind === "perceive" ? "text-spore" : v.kind === "lethal" ? "text-err" : "text-accent"}`}
              >
                {v.name}
              </span>{" "}
              <span className="text-xs text-fg-3">
                (
                {v.kind === "perceive"
                  ? "what it perceives"
                  : v.kind === "emit"
                    ? "what it gives off"
                    : menu.has(v.id)
                      ? props.game.fungus.evolution?.reach()[v.id] === 0
                        ? `lethal, on, held off until you keep ${upgradeFor(v.id)?.name ?? "its upgrade"}`
                        : "lethal, on"
                      : "lethal, off"}
                )
              </span>{" "}
              — {v.blurb}. <span className="text-xs text-fg-3">{v.words.join(" · ")}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className={h3}>The local rule</h4>
        <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4 text-[13px]">
          {LOCAL_FUNGUS_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
        <p className="mt-1 text-xs text-fg-3">
          The strains' defaults are presets, named sets of levels:{" "}
          {PRESETS.filter((p) => p.id !== "dormant")
            .map((p) => p.name)
            .join(", ")}
          .
        </p>
      </div>
      <div>
        <button type="button" className="text-xs text-accent underline-offset-2 hover:underline" onClick={() => setTable((t) => !t)}>
          {table ? "Hide the table" : "Show the table: what Jev has answered so far"}
        </button>
        {table && <AnswerTable rows={props.fungusAnswers()} />}
      </div>
    </>
  );
}

/** Jev's answers so far, one row per situation met: the senses, then the levers pulled. Stale rows (an earlier aim's, listed only while Jev can't answer and they play) are dimmed. */
function AnswerTable({ rows }: { rows: { key: string; answer: string; stale: boolean }[] }) {
  if (rows.length === 0) return <p className="mt-1.5 text-xs text-fg-3">Nothing answered yet: rows fill in as hosts meet situations.</p>;
  const sorted = [...rows].sort((a, b) => (a.key < b.key ? -1 : 1));
  return (
    <div className="mt-1.5 flex flex-col gap-1 text-[12px]">
      <p className="text-xs text-fg-3">
        {rows.filter((r) => !r.stale).length} answered under this aim
        {rows.some((r) => r.stale) ? `, ${rows.filter((r) => r.stale).length} dimmed: an earlier aim's, played while Jev can't answer` : ""}
        .
      </p>
      {sorted.map((r) => {
        const senses = r.key.split("|").slice(0, 6);
        const levels = decodeLevels(r.answer, askedIn(r.key));
        const on = levels ? pulled(levels) : [];
        return (
          <div key={r.key} className={`rounded border border-line px-2 py-1 ${r.stale ? "opacity-50" : ""}`}>
            <span className="font-mono text-fg-2">{senses.join(" · ")}</span>
            <span className="text-fg-3"> → </span>
            {on.length === 0 ? (
              <span className="text-fg-3">nothing</span>
            ) : (
              on.map(({ lever, level }) => (
                <span key={lever.id} className="mr-1.5 font-mono text-fg">
                  {lever.name}: {lever.words[level]}
                </span>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The legend Jev reads (fixed), and the exact request for the followed ant, or a sample. */
function SentExplainer(props: Props) {
  const fol = followedSituation(props.colonies, props.followed);
  const fungal = followedFungal(props.colonies, props.followed);
  const k = fol?.k ?? 0;
  // A colony's doctrine is closed until its queen is reached (ja-lo8.7): the request is shown with the words hidden.
  const doctrine = props.game.revealed[k] ? (props.doctrines[k]?.text ?? "") : "(closed: reach this colony's queen)";
  // The game's species asks in its own words, over its own fields (ja-fnd.5.13): a field of its own an ant was not last asked takes its first value.
  const own = props.game.params.species.lanes.mode;
  const modeSituation = own?.schema ? { ...own.schema.decode(0), ...(fol?.s ?? SAMPLE_SITUATION) } : (fol?.s ?? SAMPLE_SITUATION);
  const lanes: { name: string; sample: Sample; words: string; about: string; tokens: number; laneWords?: LaneWords }[] = [
    {
      name: "An ant's mode",
      sample: { lane: "mode", situation: modeSituation },
      words: doctrine,
      laneWords: own,
      about: fol?.s ? `ant #${fol.i}, as last asked` : "a sample situation",
      tokens: tokensPerQuestion("mode", doctrine, own),
    },
    {
      name: "The fungus, in one host",
      sample: { lane: "fungus", situation: fungal?.s ?? SAMPLE_FUNGAL, menu: new Set(props.menu) },
      words: props.aim.text,
      about: fungal ? `ant #${fungal.i}` : "a sample host",
      tokens: tokensPerQuestion("fungus", props.aim.text),
    },
  ];
  return (
    <>
      <p className="text-[13px]">
        Each request carries a fixed legend (what each field means), then the doctrine or aim, then up to {PER_REQUEST} situations, each
        with its question. Only the doctrine and aim are yours to change. Tokens cost ${(USD_PER_INPUT_TOKEN * 1e6).toFixed(3)} per million.
      </p>
      {lanes.map((l) => (
        <details key={l.name} className="rounded-md border border-line">
          <summary className="cursor-pointer px-2 py-1.5 text-xs">
            <span className="font-medium text-fg">{l.name}</span>{" "}
            <span className="text-fg-3">
              · ≈ {l.tokens} tokens a question · for {l.about}
            </span>
          </summary>
          <pre className="max-h-80 overflow-auto border-t border-line bg-raised p-2 font-mono text-[11px] leading-snug break-words whitespace-pre-wrap text-fg-2">
            {JSON.stringify(requestFor(l.sample, l.words, 1, l.laneWords), null, 2)}
          </pre>
        </details>
      ))}
    </>
  );
}

function ResponsesExplainer() {
  return (
    <>
      <p className="text-[13px]">
        On this page an ant's small responses are decided by the local rule: Jev is not asked them here.{" "}
        <span className="font-mono text-xs">scripts/colony-live.mjs</span> asks the questions below offline, against this legend; the alarm
        rule has no question yet.
      </p>
      <dl className="flex flex-col gap-1 text-[13px]">
        {LOCAL_RESPONSE_RULES.map(([hook, rule]) => (
          <div key={hook} className="grid grid-cols-[3.5rem_1fr] gap-2">
            <dt className="font-mono text-xs text-accent">{hook}</dt>
            <dd>{rule}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h4 className={h3}>The questions</h4>
        <ul className="mt-1.5 flex flex-col gap-1.5 text-[13px]">
          {RESPONSE_HOOKS.map((hook) => {
            const q = Object.values(responseQuestion(hook, "a0"))[0]!;
            return (
              <li key={hook}>
                <span className="font-mono text-xs text-accent">{hook}</span> {String(q.instructions).replace("ant `a0`", "the ant")}
                {q.type === "choice" && <span className="text-fg-3"> ({Object.keys(q.criteria).join(" · ")})</span>}
              </li>
            );
          })}
        </ul>
      </div>
      <details className="rounded-md border border-line">
        <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium text-fg">The legend</summary>
        <p className="border-t border-line p-2 text-xs leading-snug whitespace-pre-wrap">{RESPONSE_LEGEND}</p>
      </details>
    </>
  );
}

// ——— nest ———

function NestTab(props: Props & { focus?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
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
      <div className="mt-2 overflow-x-auto">
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
