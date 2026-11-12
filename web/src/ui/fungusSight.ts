// What the field shows of the fungus beyond its spores (ja-vyu), pure so `node --test` covers it: how strongly a
// colony's trails show, by how far the fungus is into that colony. A picture only: no ant senses it. (The mycelium is
// drawn from its hyphae, colony/hyphae.ts, since ja-2bw.3.)

/** A colony with any host shows its trails at least this strongly; every ant a host, fully. */
export const TRAIL_FLOOR = 0.25;

/**
 * How strongly colony trails show, 0…1, from its census: nothing while no ant carries the fungus, then from TRAIL_FLOOR
 * at the first host up to 1 when every living ant does. You are the fungus: you see the trails your hosts walk.
 */
export function trailSight(infected: number, living: number): number {
  if (infected <= 0 || living <= 0) return 0;
  return TRAIL_FLOOR + (1 - TRAIL_FLOOR) * Math.min(1, infected / living);
}
