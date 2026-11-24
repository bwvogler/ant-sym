import { useState, type ReactNode } from "react";
import {
  type Colony,
  type Situation,
  DOCTRINES,
  MODE_CRITERIA,
  RESPONSE_LEGEND,
  responseQuestion,
  RESPONSE_HOOKS,
  decodeFungal,
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
import { USD_PER_INPUT_TOKEN } from "../../shared/jev.ts";
import { followedColony, sideIndex, type Followed } from "./follow.ts";
import { docUrl } from "./guide.ts";
import LeverName from "./LeverName.tsx";
import { LEVER_KIND } from "./leverKinds.ts";
import { colonyName, colonyTone } from "./names.ts";
import {
  byRows,
  FUNGAL_SENSES,
  LOCAL_FUNGUS_RULES,
  LOCAL_MODE_OTHERWISE,
  LOCAL_MODE_RULES,
  LOCAL_MODE_STRANGERS,
  LOCAL_RESPONSE_RULES,
  localModeOtherwise,
  MODE_SENSES,
} from "./policyText.ts";
import { PER_REQUEST, requestFor, SAMPLE_FUNGAL, SAMPLE_SITUATION, tokensPerQuestion, type Sample } from "./prompt.ts";
import { openLab } from "./labStore.ts";
import { useGameRead, useStats } from "./session.ts";
import { sameList, sameRecord, situationsSeenOf } from "./statSelect.ts";
import { useJev, useJevSession } from "./jevContext.tsx";
import { TOKENS_PER_SITUATION, type DoctrineChoice } from "./useColonyJev.ts";

// Lab mode's Policy tab (PRD §69.8, ja-mvo9.4): the words each colony's ants and the fungus follow, then how each decides
// and what Jev is sent. It was the Codex's Policy tab; a "?" aimed at the policy (openLearn({ tab: "policy" })) opens it
// here. The fungus's menu and the local rule's settings have one home, the Levers tab, and the aim one, the aim bar.

export interface PolicyProps {
  colonies: readonly Colony[];
  followed: Followed | null;
  game: Game;
  /** the fungus's menu (useColony controls): which levers the explainer lists */
  menu: readonly string[];
}

/** What the tab reads from the Jev session (jevContext.tsx), each part drawing the tab again only when it changes. */
interface PolicyWords {
  /** each colony's doctrine (read here: a colony's nature, ja-lo8.2) and the fungus's aim */
  doctrines: DoctrineChoice[];
  aim: DoctrineChoice;
  /** why no policy can change now (policyLock), or null */
  lock: string | null;
  /** the fungus's answers so far (ColonyJev.fungusAnswers): the table behind "show the table" */
  fungusAnswers: () => { key: string; answer: string; stale: boolean }[];
}

/** The tab's own and the session's, as the explainers below read them. */
type Words = PolicyProps & PolicyWords;

/** What re-asking under a new doctrine costs now, in words: the situations the colonies have met, at the generic ant's tokens each. */
function Retune() {
  const seen = useStats(situationsSeenOf);
  const tokens = (seen ?? 0) * TOKENS_PER_SITUATION;
  return (
    <>
      A new doctrine re-asks the situations a colony meets: about {seen ?? "—"} so far, ≈ {tokens.toLocaleString()} tokens ≈{" "}
      {`$${(tokens * USD_PER_INPUT_TOKEN).toFixed(4)}`}.
    </>
  );
}

const h3 = "text-xs font-medium uppercase tracking-wide text-fg-3";

/**
 * The Policy tab, flat: the words each colony's ants and the fungus follow, then how each decides, one collapsible section
 * each. The legend Jev reads is shown, not edited: the owner's call (PRD §47). `focus` is a section to open and scroll to;
 * `ping` is a new object each time a "?" aims at one (the Lab's target).
 */
export default function PolicyTab(own: PolicyProps & { focus?: string; ping: object }) {
  const session = useJevSession();
  const doctrines = useJev((s) => s.doctrines) as DoctrineChoice[];
  const aim = useJev((s) => s.aim);
  const lock = useJev((s) => s.lock);
  const props: Words & { focus?: string; ping: object } = { ...own, doctrines, aim, lock, fungusAnswers: session.fungusAnswers };
  const sides = props.colonies.length;
  // A doctrine is closed until its colony's queen is reached: a tick sets that, outside the stats.
  const revealed = useGameRead(() => [...props.game.revealed], sameList);
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
            {revealed[k] && (
              <span className="text-xs font-normal text-fg-3">({DOCTRINES.find((p) => p.id === d.id)?.name ?? "custom"})</span>
            )}
          </h3>
          {revealed[k] ? (
            <p id={`lab-doctrine-${k}`} className="rounded-md border border-line bg-raised px-2 py-1.5 text-[13px] leading-snug text-fg">
              {d.text}
            </p>
          ) : (
            <p
              id={`lab-doctrine-${k}`}
              className="rounded-md border border-dashed border-line px-2 py-1.5 text-[13px] leading-snug text-fg-3"
            >
              Closed to you: reach the {colonyName(k)} colony's queen to read its mind.
            </p>
          )}
        </section>
      ))}
      <p className="-mt-2 text-xs text-fg-3">
        A colony's doctrine is its nature: not yours to rewrite while it lives. The ants' modes are asked under it. <Retune /> Colonies with
        the same doctrine share every answer.
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
        <p className="text-xs text-fg-3">
          Jev sets, for each situation the fungus senses in a host, a level for every lever on the menu, under your aim. Where Jev has not
          answered, the strain does what it was bred for, within the menu and the local rule's two settings.
        </p>
        <button
          type="button"
          className="self-start rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised"
          onClick={() => openLab({ tab: "levers" })}
        >
          The menu and the two settings: the Levers tab
        </button>
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
 * pressed (`ping` is the Lab's target, a new object per press), and leaves the other sections as the reader left them.
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
      id={`lab-${id}`}
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

function ModeExplainer(props: Words) {
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

function FungusExplainer(props: Words) {
  const fungal = followedFungal(props.colonies, props.followed);
  const [table, setTable] = useState(false);
  const menu = new Set(props.menu);
  // What the fungus has kept changes with play, outside the stats.
  const reach = useGameRead(() => props.game.fungus.evolution?.reach() ?? null, sameRecord);
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
        rows={FUNGAL_SENSES}
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
              <LeverName kind={v.kind} className="font-mono text-xs">
                {v.name}
              </LeverName>{" "}
              <span className="text-xs text-fg-3">
                (
                {v.kind !== "lethal"
                  ? LEVER_KIND[v.kind].what
                  : menu.has(v.id)
                    ? reach?.[v.id] === 0
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
function SentExplainer(props: Words) {
  const fol = followedSituation(props.colonies, props.followed);
  const fungal = followedFungal(props.colonies, props.followed);
  const k = fol?.k ?? 0;
  // A colony's doctrine is closed until its queen is reached (ja-lo8.7): the request is shown with the words hidden.
  const open = useGameRead(() => props.game.revealed[k] === true);
  const doctrine = open ? (props.doctrines[k]?.text ?? "") : "(closed: reach this colony's queen)";
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
        Worker actions use cached answers for the colony's doctrine. Ants use the rules below while an answer is missing. Follow an ant to
        see its recent cached action decisions.
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
