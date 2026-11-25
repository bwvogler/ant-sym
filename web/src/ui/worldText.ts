import { isEndless, type Game } from "../colony/index.ts";

// What the Lab's World card says the world is (PRD §66 E6): a bounded map has a size, an endless plane has none (its ground is made as ants reach it), so the
// card must not quote the plane's nominal box. Pure, so a node test reads it.

/** The sentence the World card opens with. */
export function worldSummary(game: Game): string {
  const map = game.map;
  const food = map.foodTotal.toLocaleString();
  const tail =
    "Above and below (v) are two views of one game. The queen lays eggs while there is food; larvae fed by nurses become new ants.";
  if (isEndless(map)) {
    const lines = game.world.lines.length;
    return (
      `One world with no edge: the surface seen from above, made from the seed as ants reach it (${map.rock.count} ${map.rock.count === 1 ? "chunk" : "chunks"} so far${map.foodTotal > 0 ? `, with ${food} units of food in them` : ""}), ` +
      `and the ground under each line through the holes, unrolled below it, where the nests are dug (${lines} ${lines === 1 ? "line" : "lines"} now). ` +
      `Colonies the fungus is far from sleep, and wild colonies wake when it comes near. ${tail}`
    );
  }
  const { size } = map;
  return (
    `One world: the surface, ${size.w}×${size.h} cells seen from above (rock, ground and ${food} units of food), ` +
    `and the ground under the line through the holes, ${game.world.curtain.size.w}×${game.world.curtain.size.h} cells unrolled below it, where the nests are dug. ${tail}`
  );
}
