// A one world on the endless plane whose start nests are far from the origin (PRD §66 E6.0.2, `ja-qpv.8`): the colonies the endless world's
// edges must serve are not near (0, 0). The nests are two wild sites of the plane found round (x, y), so the ground there is the plane's own
// and each hole joins open ground that walks out.
import { generateEndlessPlane, type EndlessMap } from "../endlessMap.ts";
import { Game, gameRng, type ColonySpec } from "../game.ts";
import { oneWorldOnLines, type OneWorld } from "../oneWorld.ts";

/** Two sites at least `gap` apart, nearest (x, y), as nests of an endless map: their plane holes. */
export function farNests(
  plane: EndlessMap,
  x: number,
  y: number,
  gap = 150,
): [{ x: number; y: number; r: number }, { x: number; y: number; r: number }] {
  for (let d = 400; d <= 3200; d += 400) {
    const sites = plane.plane
      .sitesIn(x - d, y - d, x + d, y + d)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    for (let i = 0; i < sites.length; i++)
      for (let j = i + 1; j < sites.length; j++)
        if (Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.y - sites[j]!.y) >= gap)
          return [
            { x: sites[i]!.x, y: sites[i]!.y, r: 3 },
            { x: sites[j]!.x, y: sites[j]!.y, r: 3 },
          ];
  }
  throw new Error(`no two wild sites near ${x},${y}`);
}

/** The endless plane of `seed` with its two nests moved to the sites round (x, y), and a one world over it: one line of two holes. */
export function farWorld(seed: number, x: number, y: number): { world: OneWorld; plane: EndlessMap } {
  const plane = generateEndlessPlane(seed);
  const nests = farNests(plane, x, y);
  plane.nests = nests;
  plane.nest = nests[0];
  return { world: oneWorldOnLines(seed, plane, [[0, 1]]), plane };
}

/** A game of two small colonies on that world. */
export function farGame(seed: number, x: number, y: number, ants = 60): { game: Game; plane: EndlessMap; world: OneWorld } {
  const { world, plane } = farWorld(seed, x, y);
  const specs: ColonySpec[] = [{ antCount: ants }, { antCount: ants }];
  return { game: new Game(world, {}, gameRng(seed), specs), plane, world };
}
