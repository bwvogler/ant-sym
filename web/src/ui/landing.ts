import type { Game } from "../colony/index.ts";

// Where the fungus lands (PRD §65), pure so the tutorial machine and the tests can use it without React.

/**
 * The colony the fungus lands by: chosen by the world's seed among the colonies it starts with, so no colony is the
 * player's (owner, 2026-11-13; PRD §65). One colony: that one.
 */
export function landingColony(seed: number, colonies: number): number {
  return colonies > 1 ? seed % colonies : 0;
}
/** Where `game`'s fungus lands (or landed). */
export const landingOf = (game: Game): number => game.landed?.colony ?? landingColony(game.map.seed, game.colonies.length);
