import { useEffect, useRef, useState, type ReactNode } from "react";
import { MODES, TRAILS, HOMES, STANCES, type Colony, type Situation } from "../colony/colony.ts";
import { DOCTRINES, MODE_CRITERIA, RESPONSE_LEGEND, STANCE_CRITERIA, responseQuestion, RESPONSE_HOOKS } from "../colony/colonyBrain.ts";
import { CONTACTS, decodeFungal, GROUNDS, LOADS, type FungalSituation } from "../colony/fungalPolicy.ts";
import { INFECTED, INTERVENTIONS, LETHAL, NEST_ONLY, STRAINS } from "../colony/fungus.ts";
import { AIMS } from "../colony/fungusBrain.ts";
import { USD_PER_INPUT_TOKEN } from "../../shared/jev.ts";
import { followedColony, sideIndex, type Followed } from "./follow.ts";
import { docUrl, GUIDE, NOTES, type GuideEntry } from "./guide.ts";
import Help from "./Help.tsx";
import { closeLearn, openLearn, useLearn, type LearnTab } from "./learn.ts";
import { colonyName, colonyTone } from "./names.ts";
import { nestView, ROLE_TEXT, type NestView } from "./nest.ts";
import { css, ROLE_RGB } from "./palette.ts";
import { byRows, LOCAL_FUNGUS_RULES, LOCAL_MODE_OTHERWISE, LOCAL_MODE_RULES, LOCAL_MODE_STRANGERS, LOCAL_RESPONSE_RULES, LOCAL_STANCE_OTHERWISE, LOCAL_STANCE_RULES, localModeOtherwise } from "./policyText.ts";
import { PER_REQUEST, requestFor, SAMPLE_FUNGAL, SAMPLE_SITUATION, SAMPLE_STANCE, tokensPerQuestion, type Sample } from "./prompt.ts";
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
  /** each colony's doctrine and the fungus's aim: the same state as the side panel's (useColonyJev) */
  doctrines: DoctrineChoice[];
  setDoctrine: (k: number, d: DoctrineChoice) => void;
  draftDoctrine: (k: number, d: DoctrineChoice) => void;
  aim: DoctrineChoice;
  setAim: (a: DoctrineChoice) => void;
  draftAim: (a: DoctrineChoice) => void;
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
  /** the map has a nest to look into (the side view) */
  sideView: boolean;
  onSideView: () => void;
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
        {target.tab === "policy" && <PolicyTab {...props} focus={target.id} ping={target} />}
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
        Each colony's ants follow its <em>doctrine</em>; the fungus follows your <em>aim</em>. With Jev on, Jev reads these words and answers once per situation (what an ant senses, not one ant), and every ant in that situation takes the answer.
        With Jev off, or while a question is on its way, the local rule decides.
      </p>

      {props.doctrines.slice(0, Math.max(1, sides)).map((d, k) => (
        <section key={k} className="flex flex-col gap-2" aria-label={`${colonyName(k)} doctrine`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">
              <span className={colonyTone(k)}>{colonyName(k)}</span> <span className="text-fg-2">doctrine</span>
            </h3>
            <div className="flex overflow-hidden rounded-md border border-line text-sm">
              {DOCTRINES.map((p) => (
                <button key={p.id} type="button" className={seg(d.id === p.id)} onClick={() => props.setDoctrine(k, { id: p.id, text: p.text })}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <textarea
            id={`learn-doctrine-${k}`}
            className="w-full resize-y rounded-md border border-line bg-paper px-2 py-1.5 text-[13px] leading-snug text-fg outline-none focus:border-accent"
            rows={3}
            value={d.text}
            onChange={(e) => props.draftDoctrine(k, { id: "custom", text: e.target.value })}
            onBlur={(e) => props.setDoctrine(k, { id: d.id, text: e.target.value })}
            aria-label={`${colonyName(k)} doctrine`}
          />
        </section>
      ))}
      <p className="-mt-2 text-xs text-fg-3">
        Both the ants' modes and the colony's stance are asked under the doctrine. {props.retune} Colonies with the same doctrine share every answer; one used before is free.
      </p>

      <section className="flex flex-col gap-2" aria-label="fungus aim">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">
            <span className="text-spore">Fungus</span> <span className="text-fg-2">aim</span>
          </h3>
          <div className="flex overflow-hidden rounded-md border border-line text-sm">
            {AIMS.map((a) => (
              <button key={a.id} type="button" className={seg(props.aim.id === a.id)} onClick={() => props.setAim({ id: a.id, text: a.text })}>
                {a.name}
              </button>
            ))}
          </div>
        </div>
        <textarea
          id="learn-aim"
          className="w-full resize-y rounded-md border border-line bg-paper px-2 py-1.5 text-[13px] leading-snug text-fg outline-none focus:border-accent"
          rows={3}
          value={props.aim.text}
          onChange={(e) => props.draftAim({ id: "custom", text: e.target.value })}
          onBlur={(e) => props.setAim({ id: props.aim.id, text: e.target.value })}
          aria-label="fungus aim"
        />
        <div className="text-[13px]">
          <span className="text-fg-2">What the fungus may do</span>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {INTERVENTIONS.filter((v) => props.sideView || !NEST_ONLY.has(v.id)).map((v) => {
              const on = props.menu.includes(v.id);
              const lethal = LETHAL.has(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={on}
                  className={`rounded-md border px-2 py-0.5 font-mono ${on ? (lethal ? "border-err bg-err-soft text-err" : "border-accent bg-accent-soft text-accent") : "border-line text-fg-3 hover:bg-raised"}`}
                  title={`${v.blurb}${lethal ? ". Only strains that allow it (Bloom) can run it." : ""}`}
                  onClick={() => props.setMenu(on ? props.menu.filter((id) => id !== v.id) : [...props.menu, v.id])}
                >
                  {v.name}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center justify-between text-xs text-fg-2">
          <span>Hide groomed hosts (dormant shows a quarter)</span>
          <input type="checkbox" checked={props.hide} onChange={(e) => props.setRule({ hide: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between text-xs text-fg-2">
          <span>Cull high-load hosts fighting strangers</span>
          <input type="checkbox" checked={props.cull} onChange={(e) => props.setRule({ cull: e.target.checked })} />
        </label>
        <p className="text-xs text-fg-3">
          Jev picks, for each host, one of what its strain allows and the menu has on, under your aim. Without Jev each strain does what it was bred for, within the menu and the two settings above.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <h3 className={h3}>How each decides</h3>
        <Section id="mode" ping={props.ping} title="How an ant chooses what to do" focus={props.focus}>
          <ModeExplainer {...props} />
        </Section>
        <Section id="stance" ping={props.ping} title="How the colony picks its stance" focus={props.focus}>
          <StanceExplainer />
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
      {props.demo && <p className="text-xs text-fg-3">This build has no server, so Jev never runs here: the local rule decides everything, and the words above take effect when you run the app locally with a key.</p>}
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
    <details id={`learn-${id}`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={`scroll-mt-2 rounded-lg border bg-panel ${hot ? "border-accent/60" : "border-line"}`}>
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

function RuleTable({ rows, otherwise, live }: { rows: { when: string; then: string }[]; otherwise: string; live?: number }) {
  return (
    <div>
      <h4 className={h3}>The local rule</h4>
      <p className="mt-0.5 text-xs text-fg-3">Free, and the baseline Jev is measured against. Read top to bottom: the first line that holds decides.</p>
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
function followedSituation(colonies: readonly Colony[], f: Followed | null): { k: number; i: number; col: Colony; s: Situation | null } | null {
  if (!f || !colonies[0]) return null;
  const col = followedColony(colonies[0], colonies[1] ?? null, f);
  return col ? { k: sideIndex(f), i: f.i, col, s: col.lastQuestion(f.i) } : null;
}

/** The menu as the fungus runs it on this map: the nest's interventions only where there is a nest (Fungus.menu drops them). */
function mapMenu(props: Props): string[] {
  return props.menu.filter((id) => props.sideView || !NEST_ONLY.has(id));
}

/** What the fungus senses in the followed ant, if it is infected. */
function followedFungal(colonies: readonly Colony[], f: Followed | null): { i: number; s: FungalSituation } | null {
  const fol = followedSituation(colonies, f);
  if (!fol || (fol.col.load[fol.i] as number) < INFECTED) return null;
  const strain = STRAINS[fol.col.strain[fol.i] as number];
  const code = fol.col.fungal[fol.i] as number;
  return strain && code >= 0 ? { i: fol.i, s: decodeFungal(code, strain.id) } : null;
}

function ModeExplainer(props: Props) {
  const fol = followedSituation(props.colonies, props.followed);
  const s = fol?.s ?? SAMPLE_SITUATION;
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
          ["enemy", "none · near", "an ant of the other colony within two steps (strangers it touches are the contact response's to answer)"],
          ["stance", STANCES.join(" · "), "what the colony as a whole is doing"],
        ]}
        note={
          <>
            Stance is the one field no ant senses: the colony broadcasts it (a vision gap,{" "}
            <a className="underline" href={docUrl("vision", "where-the-code-is-today")} target="_blank" rel="noreferrer">
              ja-k4k.6
            </a>
            ). An ant carrying something is not asked: it answers its load's responses instead.
          </>
        }
      />
      <Choices items={MODES.map((m) => [m, MODE_CRITERIA[m].replace(/^\w+: /, "")])} />
      <RuleTable rows={LOCAL_MODE_RULES} otherwise={LOCAL_MODE_OTHERWISE} live={live >= 0 ? live : LOCAL_MODE_RULES.length} />
      <p className="-mt-1 text-xs text-fg-3">{LOCAL_MODE_STRANGERS}</p>
      <p className="-mt-1 text-xs text-fg-3">
        Highlighted: the line that decides {fol?.s ? `ant #${fol.i}'s last situation` : "a sample situation (follow an ant to see its own)"}: {byRows(LOCAL_MODE_RULES, localModeOtherwise, s)}.
      </p>
    </>
  );
}

function StanceExplainer() {
  return (
    <>
      <Senses
        rows={[
          ["stance", STANCES.join(" · "), "what the colony is doing now"],
          ["ants", "few · some · many", "living ants against how many it can feed"],
          ["losses", "none · some · heavy", "ants lost lately"],
          ["enemyNearNest", "true · false", "rival ants close to home"],
          ["intake", "none · some · plenty", "food its foragers brought home lately, for its size"],
          ["larder", "low · full", "food stored beyond what new ants need"],
        ]}
        note="The strategist is not an ant: it reads colony totals. Its food is the rate foragers bring it home (behaviour MR 5), not what is left on the map; the stance is still broadcast, and raids still aim at the rival's hole by its coordinates (ja-k4k.6, ja-tu3)."
      />
      <Choices items={STANCES.map((m) => [m, STANCE_CRITERIA[m].replace(/^\w+: /, "")])} />
      <RuleTable rows={LOCAL_STANCE_RULES} otherwise={`Otherwise: ${LOCAL_STANCE_OTHERWISE}.`} />
    </>
  );
}

function FungusExplainer(props: Props) {
  return (
    <>
      <p className="text-[13px]">The fungus never chooses for an ant. It chooses what it does to the ant it is in, which bends what that ant senses and gives off; the ant's own policy still decides what the ant does.</p>
      <Senses
        rows={[
          ["strain", STRAINS.map((x) => x.id).join(" · "), "which strain the host carries"],
          ["load", LOADS.join(" · "), "how much of the fungus is in it"],
          ["host", MODES.join(" · "), "what the ant is doing"],
          ["ground", GROUNDS.join(" · "), "where it stands"],
          ["contact", CONTACTS.join(" · "), "who touches it"],
          ["groomed", "true · false", "enough nestmates around to groom the fungus off"],
        ]}
      />
      <Choices items={INTERVENTIONS.filter((v) => mapMenu(props).includes(v.id)).map((v) => [v.name, v.blurb])} />
      <div>
        <h4 className={h3}>The local rule</h4>
        <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4 text-[13px]">
          {LOCAL_FUNGUS_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </div>
    </>
  );
}

/** The legend Jev reads (fixed), and the exact request for the followed ant, or a sample. */
function SentExplainer(props: Props) {
  const fol = followedSituation(props.colonies, props.followed);
  const fungal = followedFungal(props.colonies, props.followed);
  const k = fol?.k ?? 0;
  const doctrine = props.doctrines[k]?.text ?? "";
  const lanes: { name: string; sample: Sample; words: string; about: string; tokens: number }[] = [
    { name: "An ant's mode", sample: { lane: "mode", situation: fol?.s ?? SAMPLE_SITUATION }, words: doctrine, about: fol?.s ? `ant #${fol.i}, as last asked` : "a sample situation", tokens: tokensPerQuestion("mode", doctrine) },
    { name: "The colony's stance", sample: { lane: "stance", situation: SAMPLE_STANCE }, words: doctrine, about: "a sample view", tokens: tokensPerQuestion("stance", doctrine) },
    { name: "The fungus, in one host", sample: { lane: "fungus", situation: fungal?.s ?? SAMPLE_FUNGAL, menu: new Set(mapMenu(props)) }, words: props.aim.text, about: fungal ? `ant #${fungal.i}` : "a sample host", tokens: tokensPerQuestion("fungus", props.aim.text) },
  ];
  return (
    <>
      <p className="text-[13px]">
        Each request carries a fixed legend (what each field means), then the doctrine or aim, then up to {PER_REQUEST} situations, each with its question. Only the doctrine and aim are yours to change. Tokens cost ${(USD_PER_INPUT_TOKEN * 1e6).toFixed(3)} per million.
      </p>
      {lanes.map((l) => (
        <details key={l.name} className="rounded-md border border-line">
          <summary className="cursor-pointer px-2 py-1.5 text-xs">
            <span className="font-medium text-fg">{l.name}</span> <span className="text-fg-3">· ≈ {l.tokens} tokens a question · for {l.about}</span>
          </summary>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-raised p-2 font-mono text-[11px] leading-snug text-fg-2">{JSON.stringify(requestFor(l.sample, l.words), null, 2)}</pre>
        </details>
      ))}
    </>
  );
}

function ResponsesExplainer() {
  return (
    <>
      <p className="text-[13px]">
        On this page an ant's small responses are decided by the local rule: Jev is not asked them here. <span className="font-mono text-xs">scripts/colony-live.mjs</span> asks the questions below offline, against this legend; the alarm rule has no question yet.
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
        <p className="whitespace-pre-wrap border-t border-line p-2 text-xs leading-snug">{RESPONSE_LEGEND}</p>
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
