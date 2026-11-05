import { useEffect, useRef, useState, type ReactNode } from "react";
import { MODES, TRAILS, HOMES, STANCES, type Colony, type Situation } from "../colony/colony.ts";
import { MODE_CRITERIA, RESPONSE_LEGEND, STANCE_CRITERIA, responseQuestion, RESPONSE_HOOKS } from "../colony/colonyBrain.ts";
import { CONTACTS, decodeFungal, GROUNDS, LOADS, type FungalSituation } from "../colony/fungalPolicy.ts";
import { INFECTED, INTERVENTIONS, STRAINS } from "../colony/fungus.ts";
import { USD_PER_INPUT_TOKEN } from "../../shared/jev.ts";
import { DEFAULT_LEGENDS, type LaneName } from "./colonyJev.ts";
import { followedColony, sideIndex, type Followed } from "./follow.ts";
import { docUrl, GUIDE, NOTES, type GuideEntry } from "./guide.ts";
import Help from "./Help.tsx";
import { closeLearn, openLearn, useLearn, type LearnTab } from "./learn.ts";
import { colonyName, colonyTone } from "./names.ts";
import { nestView, ROLE_TEXT, type NestView } from "./nest.ts";
import { css, ROLE_RGB } from "./palette.ts";
import { byRows, LOCAL_FUNGUS_RULES, LOCAL_MODE_OTHERWISE, LOCAL_MODE_RULES, LOCAL_RESPONSE_RULES, LOCAL_STANCE_OTHERWISE, LOCAL_STANCE_RULES, localModeOtherwise } from "./policyText.ts";
import { PER_REQUEST, requestFor, SAMPLE_FUNGAL, SAMPLE_SITUATION, SAMPLE_STANCE, tokensPerQuestion, usdPerThousand, type Sample } from "./prompt.ts";
import { seg } from "./styles.ts";
import type { DoctrineChoice } from "./useColonyJev.ts";

// The Learn drawer: what the player is looking at, and why. Three tabs: the
// field guide (each thing on screen, what real ants do, how the game models
// it, with the research notes it comes from), the policy (how a choice is
// made, the local rules, the exact request Jev is sent, and the legend, which
// the player may rewrite), and the nest (its chambers, as only the player can
// see them). Opened from the header, or from a "?" anywhere (ui/learn.ts).

interface Props {
  colonies: readonly Colony[];
  followed: Followed | null;
  legends: Record<LaneName, string>;
  setLegend: (lane: LaneName, text: string | null) => void;
  doctrines: DoctrineChoice[];
  aim: DoctrineChoice;
  /** whether Jev is running (an applied legend is re-asked at once) */
  running: boolean;
  /** the Pages build: no server, so Jev never runs here */
  demo: boolean;
  /** the map has a nest to look into (the side view) */
  sideView: boolean;
  onSideView: () => void;
  menu: readonly string[];
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

  // Opening moves focus into the drawer; Escape closes it.
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLearn();
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
            <button key={t} type="button" role="tab" aria-selected={target.tab === t} className={seg(target.tab === t)} onClick={() => openLearn({ tab: t })}>
              {name}
            </button>
          ))}
        </div>
        <button type="button" className="ml-auto rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised" onClick={closeLearn} aria-label="Close Learn">
          Close
        </button>
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-fg-2">
        {target.tab === "guide" && <GuideTab focus={target.id} />}
        {target.tab === "policy" && <PolicyTab {...props} focus={target.id} />}
        {target.tab === "nest" && <NestTab {...props} focus={target.id} />}
      </div>
    </div>
  );
}

// ——— field guide ———

function GuideTab({ focus }: { focus?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-3">
        What you see on the field, what real ants do, and how the game models it. Each claim comes from a research note in the repository, linked under <em>Sources</em>.
      </p>
      {GUIDE.map((e) => (
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

type PolicyLane = LaneName | "responses";
const LANES: [PolicyLane, string][] = [
  ["mode", "Ants"],
  ["stance", "Strategist"],
  ["fungus", "Fungus"],
  ["responses", "Responses"],
];

function PolicyTab(props: Props & { focus?: string }) {
  const first = (LANES.find(([l]) => l === props.focus)?.[0] ?? "mode") as PolicyLane;
  const [lane, setLane] = useState<PolicyLane>(first);
  // A "?" that targets another lane switches to it (adjusting state while rendering, as React advises over an effect).
  const [was, setWas] = useState(first);
  if (was !== first) {
    setWas(first);
    setLane(first);
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-snug">
        Every ant chooses for itself from what it senses: there are no orders. When Jev is on, it is asked one question per <em>situation</em> (a combination of what an ant senses, not one per ant), many situations to a request, and the answer is cached
        under the colony's doctrine; every ant in that situation then takes it. With Jev off, or while a question is on its way, the <em>local rule</em> decides.
      </p>
      <div className="flex overflow-hidden rounded-md border border-line text-sm" role="tablist" aria-label="policy lane">
        {LANES.map(([l, name]) => (
          <button key={l} type="button" role="tab" aria-selected={lane === l} className={`${seg(lane === l)} flex-1`} onClick={() => setLane(l)}>
            {name}
          </button>
        ))}
      </div>
      {lane === "mode" && <ModeLane {...props} />}
      {lane === "stance" && <StanceLane {...props} />}
      {lane === "fungus" && <FungusLane {...props} />}
      {lane === "responses" && <ResponsesLane />}
    </div>
  );
}

function Senses({ rows, note }: { rows: [string, string, string][]; note?: ReactNode }) {
  return (
    <section className={card}>
      <h3 className={h3}>What it senses</h3>
      <dl className="mt-2 flex flex-col gap-1 text-[13px]">
        {rows.map(([k, values, what]) => (
          <div key={k} className="grid grid-cols-[6rem_1fr] gap-2">
            <dt className="font-mono text-xs text-fg">{k}</dt>
            <dd>
              {what} <span className="font-mono text-xs text-fg-3">{values}</span>
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-2 text-xs text-fg-3">{note}</p>}
    </section>
  );
}

function Choices({ items }: { items: [string, string][] }) {
  return (
    <section className={card}>
      <h3 className={h3}>What it may choose</h3>
      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
        {items.map(([k, text]) => (
          <li key={k}>
            <span className="font-mono text-xs text-accent">{k}</span> — {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RuleTable({ rows, otherwise, live }: { rows: { when: string; then: string }[]; otherwise: string; live?: number }) {
  return (
    <section className={card}>
      <h3 className={h3}>The local rule</h3>
      <p className="mt-1 text-xs text-fg-3">Free, and the baseline Jev is measured against. Read top to bottom: the first line that holds decides.</p>
      <ol className="mt-2 flex flex-col gap-1 text-[13px]">
        {rows.map((r, k) => (
          <li key={k} className={`grid grid-cols-[1fr_auto] gap-2 rounded px-1 ${live === k ? "bg-accent-soft" : ""}`}>
            <span>{r.when}</span>
            <span className="font-mono text-xs text-accent">→ {r.then}</span>
          </li>
        ))}
        <li className={`rounded px-1 text-fg-3 ${live === rows.length ? "bg-accent-soft" : ""}`}>{otherwise}</li>
      </ol>
    </section>
  );
}

/** The followed ant, if it is alive and was asked: its colony index and its last situation. */
function followedSituation(colonies: readonly Colony[], f: Followed | null): { k: number; i: number; col: Colony; s: Situation | null } | null {
  if (!f || !colonies[0]) return null;
  const col = followedColony(colonies[0], colonies[1] ?? null, f);
  return col ? { k: sideIndex(f), i: f.i, col, s: col.lastQuestion(f.i) } : null;
}

function ModeLane(props: Props) {
  const fol = followedSituation(props.colonies, props.followed);
  const s = fol?.s ?? SAMPLE_SITUATION;
  const k = fol?.k ?? 0;
  const live = LOCAL_MODE_RULES.findIndex((r) => r.test(s));
  return (
    <>
      <Senses
        rows={[
          ["mode", MODES.join(" · "), "what it is doing now"],
          ["tired", "true · false", "it searched long outside without finding food"],
          ["foodTrail", TRAILS.join(" · "), "food scent just ahead"],
          ["homeTrail", HOMES.join(" · "), "home scent ahead on the ground; underground, the chamber it stands in"],
          ["alarm", TRAILS.join(" · "), "alarm scent just ahead"],
          ["enemy", "none · near", "an ant of the other colony within two steps"],
          ["stance", STANCES.join(" · "), "what the colony as a whole is doing"],
        ]}
        note={
          <>
            Stance is the one field no ant senses: the colony's strategist broadcasts it (a vision gap, <a className="underline" href={docUrl("vision", "where-the-code-is-today")} target="_blank" rel="noreferrer">ja-k4k.6</a>). An ant carrying something is not asked: it answers its load's responses instead.
          </>
        }
      />
      <Choices items={MODES.map((m) => [m, MODE_CRITERIA[m].replace(/^\w+: /, "")])} />
      <RuleTable rows={LOCAL_MODE_RULES} otherwise={LOCAL_MODE_OTHERWISE} live={live >= 0 ? live : LOCAL_MODE_RULES.length} />
      <p className="-mt-1 text-xs text-fg-3">
        Highlighted: the line that decides {fol?.s ? `ant #${fol.i}'s last situation` : "the sample situation below"} ({byRows(LOCAL_MODE_RULES, localModeOtherwise, s)}).
      </p>
      <Prompt
        lane="mode"
        props={props}
        words={props.doctrines[k]?.text ?? ""}
        wordsName={`${colonyName(k)}'s doctrine`}
        sample={{ lane: "mode", situation: s }}
        about={fol?.s ? `ant #${fol.i} of the ${colonyName(fol.k)} colony, as last asked` : fol ? `ant #${fol.i} has not been asked yet (it carries something); a sample situation` : "a sample situation (follow an ant to see its own)"}
      />
    </>
  );
}

function StanceLane(props: Props) {
  const live = LOCAL_STANCE_RULES.findIndex((r) => r.test(SAMPLE_STANCE));
  return (
    <>
      <Senses
        rows={[
          ["stance", STANCES.join(" · "), "what the colony is doing now"],
          ["ants", "few · some · many", "living ants against how many it can feed"],
          ["losses", "none · some · heavy", "ants lost lately"],
          ["enemyNearNest", "true · false", "rival ants close to home"],
          ["foodLeft", "plenty · some · scarce", "food left on the whole map"],
          ["larder", "low · full", "food stored beyond what new ants need"],
        ]}
        note="The strategist is not an ant: it reads colony and map totals no ant could sense. Replacing it with alarm, encounter rates and scouts' trails is an open vision gap (ja-k4k.6)."
      />
      <Choices items={STANCES.map((m) => [m, STANCE_CRITERIA[m].replace(/^\w+: /, "")])} />
      <RuleTable rows={LOCAL_STANCE_RULES} otherwise={`Otherwise: ${LOCAL_STANCE_OTHERWISE}.`} live={live >= 0 ? live : LOCAL_STANCE_RULES.length} />
      <Prompt lane="stance" props={props} words={props.doctrines[0]?.text ?? ""} wordsName={`${colonyName(0)}'s doctrine`} sample={{ lane: "stance", situation: SAMPLE_STANCE }} about="a sample view" />
    </>
  );
}

function FungusLane(props: Props) {
  const fol = followedSituation(props.colonies, props.followed);
  let sensed: FungalSituation | null = null;
  if (fol && (fol.col.load[fol.i] as number) >= INFECTED) {
    const strain = STRAINS[fol.col.strain[fol.i] as number];
    const code = fol.col.fungal[fol.i] as number;
    if (strain && code >= 0) sensed = decodeFungal(code, strain.id);
  }
  const s = sensed ?? SAMPLE_FUNGAL;
  return (
    <>
      <Senses
        rows={[
          ["strain", STRAINS.map((x) => x.id).join(" · "), "which strain the host carries"],
          ["load", LOADS.join(" · "), "how much of the fungus is in it"],
          ["host", MODES.join(" · "), "what the ant is doing"],
          ["ground", GROUNDS.join(" · "), "where it stands"],
          ["contact", CONTACTS.join(" · "), "who touches it"],
          ["groomed", "true · false", "enough nestmates around to groom the fungus off"],
        ]}
        note="The fungus never chooses for the ant: it chooses what it does to the ant it is in, which bends what that ant senses and gives off. The ant's own policy still decides."
      />
      <Choices items={INTERVENTIONS.filter((v) => props.menu.includes(v.id)).map((v) => [v.name, v.blurb])} />
      <section className={card}>
        <h3 className={h3}>The local rule</h3>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4 text-[13px]">
          {LOCAL_FUNGUS_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>
      <Prompt
        lane="fungus"
        props={props}
        words={props.aim.text}
        wordsName="your aim"
        sample={{ lane: "fungus", situation: s, menu: new Set(props.menu) }}
        about={sensed && fol ? `what the fungus senses in ant #${fol.i}` : "a sample host (follow an infected ant to see its own)"}
      />
    </>
  );
}

function ResponsesLane() {
  return (
    <>
      <p className="rounded-md bg-raised px-3 py-2 text-xs">
        On this page the ant's small responses are decided by the local rule: Jev is not asked them here. <span className="font-mono">scripts/colony-live.mjs</span> asks them offline, against this legend and these questions.
      </p>
      <section className={card}>
        <h3 className={h3}>The local rule</h3>
        <dl className="mt-2 flex flex-col gap-1 text-[13px]">
          {LOCAL_RESPONSE_RULES.map(([hook, rule]) => (
            <div key={hook} className="grid grid-cols-[3.5rem_1fr] gap-2">
              <dt className="font-mono text-xs text-accent">{hook}</dt>
              <dd>{rule}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={card}>
        <h3 className={h3}>The questions</h3>
        <ul className="mt-2 flex flex-col gap-2 text-[13px]">
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
      </section>
      <section className={card}>
        <h3 className={h3}>The legend (read only)</h3>
        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-snug">{RESPONSE_LEGEND}</p>
      </section>
    </>
  );
}

/** The prompt a lane sends: its legend (editable), the words it is asked under, and the exact request for one situation, with what a question costs. */
function Prompt({ lane, props, words, wordsName, sample, about }: { lane: LaneName; props: Props; words: string; wordsName: string; sample: Sample; about: string }) {
  const applied = props.legends[lane];
  const [draft, setDraft] = useState(applied);
  // Applied or reset: the box shows what is now in use.
  const [was, setWas] = useState(applied);
  if (was !== applied) {
    setWas(applied);
    setDraft(applied);
  }
  const edited = applied !== DEFAULT_LEGENDS[lane];
  const dirty = draft !== applied;
  const tokens = tokensPerQuestion(lane, words, draft.trim() === "" ? DEFAULT_LEGENDS[lane] : draft);
  const base = tokensPerQuestion(lane, words, DEFAULT_LEGENDS[lane]);
  const request = requestFor(sample, words, applied);
  const delta = base > 0 ? Math.round((100 * (tokens - base)) / base) : 0;
  return (
    <section className={card} id={`learn-prompt-${lane}`}>
      <div className="flex items-center gap-2">
        <h3 className={h3}>What Jev is told</h3>
        {edited && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn">edited</span>}
      </div>
      <p className="mt-1 text-xs text-fg-3">
        Each request carries this legend, then {wordsName}, then the situations, each with its question. The legend is yours to rewrite: an edited legend is a new question, with its own cache. Going back to the default reuses every answer
        it already has.
      </p>
      <label className="mt-2 block text-xs text-fg-3" htmlFor={`legend-${lane}`}>
        Legend
      </label>
      <textarea
        id={`legend-${lane}`}
        className="mt-1 w-full resize-y rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-xs leading-snug text-fg outline-none focus:border-accent"
        rows={8}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50" disabled={!dirty} onClick={() => props.setLegend(lane, draft)}>
          Apply
        </button>
        <button type="button" className="rounded-md border border-line-strong px-3 py-1 text-xs text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50" disabled={!edited && !dirty} onClick={() => props.setLegend(lane, null)}>
          Reset to default
        </button>
        <span className="font-mono text-xs text-fg-2">
          ≈ {tokens} tokens a question, {PER_REQUEST} to a request{delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta}% on the default's ${base})` : ""} · ${usdPerThousand(tokens).toFixed(4)} per 1,000 questions
        </span>
      </div>
      <p className="mt-1 text-xs text-fg-3">
        {props.demo
          ? "This build has no server, so Jev never runs here: an edit changes the request below. Run the app locally with a key to let Jev answer it."
          : props.running
            ? "Jev is on: applying re-asks the situations the colonies meet, at the cost above."
            : "Applied edits are used when you start Jev."}{" "}
        Tokens cost ${(USD_PER_INPUT_TOKEN * 1e6).toFixed(3)} per million.
      </p>
      <p className="mt-3 text-xs text-fg-3">{wordsName[0]!.toUpperCase() + wordsName.slice(1)} (edit it in the side panel):</p>
      <p className="mt-1 rounded-md bg-raised px-2 py-1 text-xs">{words || "—"}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-accent">The exact request for {about}</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-raised p-2 font-mono text-[11px] leading-snug text-fg-2">{JSON.stringify(request, null, 2)}</pre>
      </details>
    </section>
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
        This is the whole nest as you see it, read from the game's chamber table. An ant sees none of it: underground it senses only the role of the chamber it stands in, from its floor's smell.{" "}
        <a className="underline" href={docUrl("vision", "what-an-ant-can-sense")} target="_blank" rel="noreferrer">
          What an ant can sense
        </a>
      </p>
      {!props.sideView || views.every((v) => v === null) ? (
        <section className={card}>
          <p className="text-[13px]">
            The map seen from above has no nest to look into: each colony's nest is a disc around its hole. In the side view the ants dig shafts and chambers below the ground line, and the queen lays there.
          </p>
          <button type="button" className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:bg-accent-hover" onClick={props.onSideView}>
            Switch to the side view
          </button>
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
                  <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-line" style={{ background: css(ROLE_RGB[r]!) }} aria-hidden />
                  <span className="font-mono text-xs text-fg">{r}</span>
                  <span>{ROLE_TEXT[r]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-fg-3">
              A new chamber's role comes from its depth against the queen's (reception above, store below, brood otherwise): still a script, not something ants decide from what they sense (
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
        queen {v.queen === "alive" ? "alive" : v.queen === "dead" ? "dead (orphaned)" : "—"} · brood {v.brood.join(" / ")} (eggs / larvae / pupae) · {v.inside} inside, {v.outside} out · {v.midden} on the midden
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-fg-3">
            <tr>
              <th className="py-1 pr-2 font-medium">chamber</th>
              <th className="py-1 pr-2 text-right font-medium" title="rows below the ground line">depth</th>
              <th className="py-1 pr-2 text-right font-medium" title="cells (floor cells)">size</th>
              <th className="py-1 pr-2 text-right font-medium">ants</th>
              <th className="py-1 pr-2 text-right font-medium">brood</th>
              <th className="py-1 text-right font-medium">food</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums text-fg-2">
            {v.chambers.map((c) => {
              const id = `chamber-${k}-${c.id}`;
              return (
                <tr key={c.id} id={`learn-${id}`} className={`scroll-mt-2 border-t border-line ${focus === id ? "bg-accent-soft" : ""}`}>
                  <td className="py-1 pr-2">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: c.role in ROLE_RGB ? css(ROLE_RGB[c.role]!) : "var(--mound)" }} aria-hidden />
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
