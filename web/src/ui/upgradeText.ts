// What each thing a mutation buys means, in words, for the Fungus panel's tooltips. Built from the upgrade table
// (colony/evolution.ts UPGRADES) and the lever table (colony/levers.ts LEVERS), so a level's numbers and a lever's name
// can't drift from what the game does; only the "why it matters" lines are written here. `ui/tests/upgradeText.test.ts`
// fails when an upgrade, a level or a lever has no explanation.
import { KNOT, LEVERS, STALK, type Lever, type Trait, type Upgrade } from "../colony/index.ts";

/** One level of an upgrade: its name, and what it means (the numbers are the table's). */
export interface LevelText {
  step: string;
  line: string;
}

export interface UpgradeTip {
  name: string;
  kind: "spread" | "reach";
  /** the upgrade table's one-line account */
  what: string;
  /** why it matters for play */
  why: string;
  levels: LevelText[];
  /** reach upgrades: the levers it widens, with what each does to a host */
  levers: { id: string; name: string; blurb: string; words: readonly string[]; lethal: boolean }[];
  /** reach upgrades: what reach means (the table's, in words) */
  reachNote?: string;
}

/** The "why it matters" line of each upgrade: what it changes for the player's fungus. */
const WHY: Record<string, string> = {
  infectivity:
    "The Garden strain you land with starts too weak to take hold: it passes on more slowly than four grooming nestmates take it off a visible host. This is the first thing that lets a nest carry it.",
  persistence:
    "A host that clears it slowly keeps it longer, so it stays infectious longer and nestmates have more time to catch it from a host before it is gone. Grooming still takes it off at the same rate.",
  mycelium:
    "The fungus on the ground by the hole is where spores and mutations come from. A thicker patch holds more mass, so it grows faster and can pay for more spores; every bit it grows is a chance to mutate, so a bigger one also earns mutations faster.",
  knots:
    "Ants digging their nest cut the hyphae in their way. A knot is the fungus's answer: where a hypha runs short of mass it hardens into a knot that digging can't cut. Underground it keeps a little of the hypha's mass as spores for the ants that dig into it; on the surface it holds that mass as a reserve. Later it sprouts a new thread (on the surface giving its reserve back).",
  stalks:
    "Ants carry their dead out of the nest, and a host that dies outside lies there. Once the fungus has colonised such a corpse, a stalk lifts its spores so they fall over a ring round it instead of one spot: more passing foragers each pick up a little. A corpse in the nest never gets one.",
  fruiting:
    "Spores lie on the ground for foragers to walk through. A denser fruiting body puts out more of them, but they are paid for out of the mycelium's mass, so the patch settles smaller.",
  evasion:
    "Grooming visible nestmates leaves an ant resistant (immune priming), so a colony that has been grooming the fungus gets harder to infect. Evasion lets it slip past part of that resistance. It matters once colonies have primed, not at the start.",
  stealth:
    "Your aim decides whether hosts hide the fungus from groomers; this decides how well they can. A better-hidden host is groomed less, so it keeps the fungus longer.",
  senses:
    "Widens how far a host's sense of food, rival trails, home, alarm, floor marks and time out can be turned up or down. Jev is asked for the full range either way; this sets how much of its answer takes effect.",
  recognition:
    "Widens how far it can change who a host takes for a stranger. Between colonies this is how odours move toward each other, which is what the \u201cone colony\u201d bar needs.",
  trails:
    "Widens how far it can change what a host lays on the ground: its trail, trail leaked to rivals, and alarm in a fight. This is how a host's scent can pull other colonies' ants along.",
  royal:
    "Widens how far it can change the queen's royal mark: what she lays, and what nurses perceive of it. Only where there is a nest. It is the route to new queens.",
  weapon:
    "Lethal, and off until you turn it on. Two keys: putting it on the menu is your permission, and this upgrade is the fungus's power to use it. Without both a host runs as is, so no power comes free.",
  crown:
    "Lethal, and off until you turn it on. Two keys: putting it on the menu is your permission, and this upgrade is the fungus's power to use it. Without both a host runs as is. Only where there is a nest.",
};

const pct = (x: number): string => `${+(x * 100).toFixed(1)} %`;

/** What a spread trait's value means, in words. */
const SPREAD: Record<Trait, (v: number) => string> = {
  transmission: (v) => `spreads between touching ants at up to ${pct(v)} a second, scaled by how many of the ants around carry it`,
  decay: (v) =>
    v === 0
      ? "a host never clears it on its own: only grooming takes it off"
      : `a host clears ${pct(v)} of its load a second on its own (half of it in about ${Math.round(Math.LN2 / v)} s), on top of grooming`,
  capacity: (v) => `its patch holds up to ${v} units of mycelium`,
  spores: (v) => `${pct(v)} of the mycelium's mass becomes spores on the ground each second`,
  knots: (v) =>
    v === 0
      ? "starved hyphae stay as they are, and digging cuts them"
      : `a tip that rests short of mass for ${KNOT.rounds[v]} steps hardens into a knot that digging can't cut; it fruits its store onto a tunnel it touches and sprouts again after ${KNOT.sprout[v]} s`,
  stalks: (v) =>
    v === 0
      ? "a colonised corpse puts its spores out on its own cell"
      : `a colonised corpse outside grows a stalk after ${STALK.delay[v]} s and spreads its spores over the open cells within ${STALK.radius[v]} of it`,
  evasion: (v) =>
    v === 0 ? "grooming-built resistance counts in full against it" : `slips past ${pct(v)} of the resistance grooming builds`,
};

/** What a reach level means. Reach 0 holds a lever at "as is"; the top reach is the lever's whole scale. */
function reachLine(u: Upgrade, k: number): string {
  const r = u.reach?.[k] ?? 0;
  const top = Math.max(...(u.reach ?? [0]));
  if (top === 1) return r === 0 ? "a host runs as is, whatever Jev answers" : "Jev's answer takes effect";
  if (r === 0) return "these levers are held at as is, whatever Jev answers";
  if (r === top) return "Jev's answer takes effect at any level";
  return "a bigger answer is held back to within one step of as is";
}

/** What an upgrade's levels each mean. Index 0 is where the fungus starts. */
export function levelTexts(u: Upgrade): LevelText[] {
  return u.steps.map((step, k) => ({
    step,
    line: u.kind === "spread" && u.trait && u.values ? SPREAD[u.trait](u.values[k] as number) : reachLine(u, k),
  }));
}

/** The tooltip for an upgrade: what it is, why it matters, each level, and for reach the levers it frees. */
export function upgradeTip(u: Upgrade): UpgradeTip {
  const levers: Lever[] = (u.levers ?? []).map((id) => LEVERS.find((l) => l.id === id)).filter((l): l is Lever => !!l);
  return {
    name: u.name,
    kind: u.kind,
    what: u.blurb,
    why: WHY[u.id] ?? "",
    levels: levelTexts(u),
    levers: levers.map((l) => ({ id: l.id, name: l.name, blurb: l.blurb, words: l.words, lethal: l.kind === "lethal" })),
    reachNote:
      u.kind === "reach"
        ? "Jev is still asked every lever on its full scale and its answers are cached that way; reach only limits where they take effect, so keeping it costs no tokens."
        : undefined,
  };
}

export const UPGRADE_IDS_WITH_WHY: readonly string[] = Object.keys(WHY);

/** The tooltip for the next level of an upgrade: what you get for the mutations. */
export function nextLevelTip(u: Upgrade, level: number): { step: string; line: string; cost: number } | null {
  const cost = u.costs[level];
  const next = levelTexts(u)[level + 1];
  return cost === undefined || !next ? null : { step: next.step, line: next.line, cost };
}

/** Tooltips for the panel's two top figures. */
export const MUTATION_TIP =
  "A mutation is one change the fungus can keep. Every bit of new fungus (its mycelium growing on the ground, and load passing from ant to ant) is a chance to mutate, so the faster it grows, the faster they come. You choose which upgrade gets them, and each level asks more than the one before. In real fungi mutations are random and selection keeps what works; here you do the keeping. The figure after is how many a minute it is making now.";
export const BODY_TIP =
  "Mycelium: the fungus growing on the ground by the hole, which puts out spores. In ants: the fungus carried by hosts, in all. Both are in units of fungus; the mycelium's mass is capped by the Mycelium upgrade.";
