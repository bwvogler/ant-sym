// A new queen's flight on the page (ja-fnd.6.2, docs/refactor.md S5.2): founding her colony, on her mother's words when the pen stays
// shut or on the player's from the pen, and what the page says about it. Plain TypeScript over the Game and the doctrine setter, so
// the rules are tested without React: ColonyApp keeps the hooks, the camera and the toasts, and shows what these return.

import { type Flight, type Game } from "../colony/index.ts";
import { colonyName } from "./names.ts";
import type { ToastTone } from "./toasts.ts";
import type { DoctrineChoice } from "./useColonyJev.ts";

/** What the page says about a founding: a toast's text and tone. */
export interface Notice {
  text: string;
  tone: ToastTone;
}

/** What a founding did: the new colony's index (-1: the queen was lost), what the page says, and whether play resumes (no queen left in the air). */
export interface Founded {
  k: number;
  notice: Notice | null;
  resume: boolean;
}

/** Where a daughter colony's words go as she founds (useColonyJev's foundWith). */
export interface Words {
  foundWith(k: number, d: DoctrineChoice): void;
}

/** Why flight f's queen was lost (k < 0): the map full, the game's reason (Game.lastLoss: one world's founding rule), or no room. */
export function lostNotice(game: Game, f: Flight): Notice {
  const mother = colonyName(f.mother);
  const why = game.lastLoss?.flight === f ? game.lastLoss.reason : null;
  return {
    text:
      game.colonies.length >= game.colonyLimit
        ? `A new queen from ${mother} flew, but the map already holds ${game.colonyLimit} colonies: she was lost.`
        : why
          ? `A new queen from ${mother} was lost: ${why}.`
          : `A new queen from ${mother} found no room to land, and was lost.`,
    tone: "warn",
  };
}

function settled(game: Game, f: Flight, k: number, founded: Notice): Founded {
  return { k, notice: k >= 0 ? founded : lostNotice(game, f), resume: game.flights.length === 0 };
}

/**
 * The pen stays shut (`reason`: penGate's why): she founds at her own landing, on her mother's doctrine (`doctrines`, by colony; the
 * first colony's when hers has none).
 */
export function foundOnMothers(game: Game, words: Words, doctrines: readonly DoctrineChoice[], f: Flight, reason: string): Founded {
  const k = game.found(f);
  if (k >= 0) words.foundWith(k, doctrines[f.mother] ?? doctrines[0]!);
  return settled(game, f, k, { text: `${reason} Her colony is ${colonyName(k)}.`, tone: "info" });
}

/** From the pen: she founds at `at` (where the player clicked, or her own landing) on the player's words `d`. */
export function foundOnWords(game: Game, words: Words, f: Flight, d: DoctrineChoice, at: { x: number; y: number } | null): Founded {
  const k = game.found(f, at);
  if (k >= 0) words.foundWith(k, d);
  return settled(game, f, k, { text: `${colonyName(k)} is founded, on your words.`, tone: "good" });
}
