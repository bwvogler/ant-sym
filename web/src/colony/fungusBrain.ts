import type { JevAnswer, JevRequest } from "../../shared/jev.ts";
import { hash } from "../sim/policyCache.ts";
import type { FungalSituation } from "./fungalPolicy.ts";
import { INTERVENTIONS, STRAINS } from "./fungus.ts";

// The fungus's Jev lane, pure (ja-t4d.5). Its own lane, its own cache, its own
// words: the player's aim for the fungus. Never in an ant's request: Jev, as
// the fungus, chooses what the fungus does to a host; the host's choices stay
// with its colony's policy. One question per fungal situation (never per host
// or per step), a choice among only what that host's strain allows and the
// player's menu has on, so the answer is always something the fungus can do.

/** Bump when the fungal situation, the legend or the question change: old cached answers no longer apply. */
export const FUNGUS_BRAIN_VERSION = 1;

export const FUNGUS_LEGEND =
  "You are a fungus living inside the ants of two rival colonies. You never decide what an ant does: each ant chooses for itself from what it senses. You choose what you do to the ant you are in, which changes what it senses, what it gives off and how others see it. Each key in `hosts` is one ant you live in, as you sense it from inside. strain is which of your strains it carries. load is how much of you is in it: low, mid or high. host is what the ant is doing: explore, follow (a food trail), return (home) or fight. ground is whose home scent is where it stands: home (its own colony's), border, or foreign (the other colony's). contact is who touches it: none, kin (ants that smell like it) or strangers (ants that smell different, whom ants fight). groomed means its nestmates are grooming you off it right now. colonies is how far apart the two colonies smell: apart, close, or one (unified: they smell alike and have stopped fighting). aim is what you want: follow it.";

/** The cache key for a fungal situation. */
export function fungalKey(s: FungalSituation): string {
  return `${s.strain}|${s.load}|${s.host}|${s.ground}|${s.contact}|${s.groomed ? "groomed" : "unseen"}|${s.colonies}`;
}

/** What a host of this strain may be given: what the strain allows and the menu has on, in the table's order. */
export function offeredFor(strainId: string, menu: ReadonlySet<string>): string[] {
  const strain = STRAINS.find((s) => s.id === strainId);
  return strain ? strain.allows.filter((id) => menu.has(id)) : [];
}

export function interventionQuestion(id: string, offered: readonly string[]): JevRequest["questions"] {
  const criteria: Record<string, string> = {};
  for (const k of offered) {
    const v = INTERVENTIONS.find((x) => x.id === k);
    if (v) criteria[k] = `${v.name}: ${v.blurb}`;
  }
  return { [`${id}_do`]: { type: "choice", instructions: `Going by the aim, what should you do to host \`${id}\`?`, criteria } };
}

/** One request for many fungal situations: one shared state (legend, aim, hosts), one choice each among what its host may be given. */
export function packFungusRequest(items: { id: string; situation: FungalSituation }[], aim: string, menu: ReadonlySet<string>): JevRequest {
  const hosts: Record<string, FungalSituation> = {};
  const questions: JevRequest["questions"] = {};
  for (const it of items) {
    hosts[it.id] = { ...it.situation };
    Object.assign(questions, interventionQuestion(it.id, offeredFor(it.situation.strain, menu)));
  }
  return { state: { legend: FUNGUS_LEGEND, aim, hosts }, questions };
}

/** An intervention from a reply, or null when it is missing or not one that host could be given (not cached; the local rule covers it). */
export function readIntervention(answers: Record<string, JevAnswer>, id: string, situation: FungalSituation, menu: ReadonlySet<string>): string | null {
  const a = answers[`${id}_do`];
  if (!a || a.type !== "choice") return null;
  return offeredFor(situation.strain, menu).includes(a.choice) ? a.choice : null;
}

/** What a cached answer was asked under: a different aim, menu, legend or question wording is a different cache. */
export function fungusContext(aim: string, menu: ReadonlySet<string>): string {
  const on = [...menu].sort().join(",");
  return `fungus-v${FUNGUS_BRAIN_VERSION}-${hash(FUNGUS_LEGEND + JSON.stringify(interventionQuestion("h0", ["x"])) + on + "\u0000" + aim.trim())}`;
}

/** Aims to start from: the player's words for what the fungus wants. */
export const AIMS: { id: string; name: string; text: string }[] = [
  { id: "unite", name: "Unite", text: "Make the two colonies one: bring them to smell alike, and stop them fighting. Never kill a host." },
  { id: "spread", name: "Spread", text: "Live in as many ants of both colonies as you can, unseen: avoid being groomed off." },
  { id: "peace", name: "Peace", text: "Stop the fighting first: calm every meeting between the colonies. Unite them later." },
];
