import {
  AIR,
  CELL,
  cellOf,
  CURTAIN,
  type Colony,
  type Fungus,
  INFECTED,
  MODES,
  OPEN,
  PLANE,
  type Role,
  rockAt,
  SOIL,
  SPORE_SHOWN,
  type WorldMap,
  type Transect,
} from "../colony/index.ts";
import type { SensedMap } from "./fungusSight.ts";
import { colonyName } from "./names.ts";
import { ROLE_TEXT } from "./nest.ts";

// The lens (PRD §69.3, ja-mvo9.2): what is under the pointer, in words, each with the guide entry that explains it. Pure:
// `probe` reads the game at one point, `lensLines` says it, and `node --test` covers both. The field draws, the page
// shows the card. It says only what the field shows there: scent where a host sensed it lately, as the field washes it
// in (the thresholds below are the field's), so the lens never tells the player more than the map does.

/** Scent the field washes in at full strength (ColonyField.paintChunk): alarm, the food trail, the home trail. */
export const ALARM_FULL = 6;
export const FOOD_FULL = 4;
export const HOME_FULL = 12;
/** The weakest wash the field draws: alarm, and either trail. */
export const ALARM_SHOWN = 0.03;
export const TRAIL_SHOWN = 0.02;

/** What is at one point of the shown view, as the field shows it. */
export interface LensProbe {
  /** the view: one world's above (the plane) or below (the curtain); "map" on a game of one map */
  view: "above" | "below" | "map";
  ground: "rock" | "soil" | "air" | "open";
  /** food lying here */
  food: number;
  /** the mound's height here (one world's plane) */
  mound: number;
  /** the fungus's spores, shown */
  spores: boolean;
  /** a hypha of the fungus's mycelium in this cell */
  hypha: boolean;
  /** how freshly a host sensed this cell, 0 (not lately) to 1: what the field's scent is shown at */
  sight: number;
  /** the scent as the field washes it (0 to 1, after `sight`), the strongest colony's of each */
  alarm: number;
  foodTrail: number;
  homeTrail: number;
  /** the colony whose hole this is, or −1 */
  hole: number;
  /** the chamber here: its colony (an index into the game's colonies), role, and what lies in it */
  chamber: { k: number; role: Role; brood: number; food: number } | null;
}

/** The ant under the pointer. */
export interface LensAnt {
  k: number;
  i: number;
  mode: string;
  carrying: boolean;
  infected: boolean;
}

/** One thing the lens says: what it is, a few words on it, and the guide entry that explains it (null: none). */
export interface LensLine {
  what: string;
  says: string;
  entry: string | null;
}

/** The ant at slot i of colony k, as the lens says it. */
export function lensAnt(colonies: readonly Colony[], k: number, i: number): LensAnt | null {
  const c = colonies[k];
  if (!c || !c.alive[i]) return null;
  return { k, i, mode: MODES[c.mode[i]!] ?? "?", carrying: c.carrying[i] === 1, infected: c.load[i]! >= INFECTED };
}

/** The game, as `probe` reads it. */
export interface LensWorld {
  colonies: readonly Colony[];
  fungus: Fungus;
  /** one world's plane and curtain, or null on a game of one map */
  world: { plane: WorldMap; curtain: WorldMap; line?: Transect } | null;
}

/**
 * What the field shows at world (x, y) of layer `lv` (one world's PLANE or CURTAIN; −1: a game of one map). `trails`:
 * which trails the field draws now (Settings).
 */
export function probe(g: LensWorld, sensed: SensedMap, lv: number, x: number, y: number, trails = { food: true, home: true }): LensProbe {
  const map = g.world ? (lv === CURTAIN ? g.world.curtain : g.world.plane) : (g.colonies[0]!.map as WorldMap);
  cellOf(x, y);
  const gx = CELL[0];
  const gy = CELL[1];
  const r = rockAt(map, gx, gy);
  const sight = sensed.sight(lv < 0 ? 0 : lv, gx, gy);
  let alarm = 0;
  let foodTrail = 0;
  let homeTrail = 0;
  if (sight > 0)
    for (const c of g.colonies) {
      const ph = lv < 0 ? c.ph : c.layers[lv]?.ph;
      if (!ph) continue;
      alarm = Math.max(alarm, sight * Math.min(1, ph.fields.alarm.get(gx, gy) / ALARM_FULL));
      if (trails.food) foodTrail = Math.max(foodTrail, sight * Math.min(1, ph.fields.food.get(gx, gy) / FOOD_FULL));
      if (trails.home) homeTrail = Math.max(homeTrail, sight * Math.min(1, ph.fields.home.get(gx, gy) / HOME_FULL));
    }
  const spores = lv < 0 ? g.fungus.spores : (g.fungus.sporesOn(lv)?.spores ?? g.fungus.spores);
  const holeOwner = g.world ? (g.colonies[0]?.holeCells ?? []) : [];
  let hole = -1;
  for (let k = 0; k < holeOwner.length && hole < 0; k++) {
    const h = holeOwner[k]!;
    if (lv === PLANE ? h.px === gx && h.py === gy : h.col === gx && h.row === gy) hole = k;
  }
  let chamber: LensProbe["chamber"] = null;
  const id = map.chambers?.at(gx, gy) ?? -1;
  const ch = id >= 0 ? map.chambers!.list[id] : undefined;
  if (ch) {
    const k = g.colonies.findIndex((c) => c.params.nest === ch.colony);
    if (k >= 0) chamber = { k, role: ch.role, brood: ch.brood, food: ch.food };
  }
  return {
    view: g.world ? (lv === CURTAIN ? "below" : "above") : "map",
    ground: r === OPEN ? "open" : r === SOIL ? "soil" : r === AIR ? "air" : "rock",
    food: map.food.get(gx, gy),
    mound: map.spoil?.get(gx, gy) ?? 0,
    spores: spores.get(gx, gy) >= SPORE_SHOWN,
    hypha: g.fungus.hyphaeOn(lv < 0 ? 0 : lv)?.has(gx, gy) ?? false,
    sight,
    alarm,
    foodTrail,
    homeTrail,
    hole,
    chamber,
  };
}

const ROLE_NAME: Record<Role, string> = {
  royal: "Royal chamber",
  brood: "Brood chamber",
  store: "Store",
  reception: "Reception",
  midden: "Midden",
  none: "Chamber",
};
const ROLE_ENTRY: Record<Role, string> = {
  royal: "queen",
  brood: "brood",
  store: "chambers",
  reception: "chambers",
  midden: "midden",
  none: "chambers",
};

const strength = (v: number) => (v >= 0.66 ? "strong" : v >= 0.33 ? "fair" : "faint");

/** What the lens says of a point and the ant there (if any): the ant first, then the place, top to bottom as drawn. */
export function lensLines(p: LensProbe, ant: LensAnt | null): LensLine[] {
  const out: LensLine[] = [];
  if (ant) {
    const bits = [ant.mode, ...(ant.carrying ? ["carrying food"] : []), ant.infected ? "a host of yours" : "not infected"];
    out.push({ what: `Ant #${ant.i} of ${colonyName(ant.k)}`, says: bits.join(" · "), entry: ant.infected ? "fungus" : "jobs" });
  }
  if (p.hole >= 0)
    out.push({
      what: `${colonyName(p.hole)}'s hole`,
      says:
        p.view === "below"
          ? "where the nest's shaft meets the ground: the way up"
          : "the way into the nest: the line through the holes shows below",
      entry: "one-world",
    });
  if (p.chamber) {
    const c = p.chamber;
    const lying = [...(c.brood > 0 ? [`${Math.round(c.brood)} brood`] : []), ...(c.food > 0 ? [`${Math.round(c.food)} food`] : [])];
    out.push({
      what: `${ROLE_NAME[c.role]} of ${colonyName(c.k)}`,
      says: `${ROLE_TEXT[c.role]}${lying.length ? ` · ${lying.join(", ")}` : ""}`,
      entry: ROLE_ENTRY[c.role],
    });
  }
  if (p.food > 0)
    out.push({ what: "Food", says: `${Math.round(p.food)} here: a forager carries it home a crumb at a time`, entry: "food-quality" });
  if (p.alarm > ALARM_SHOWN)
    out.push({ what: "Alarm", says: `${strength(p.alarm)}: a host smelled it here lately; ants nearby rush to fight`, entry: "alarm" });
  if (p.spores) out.push({ what: "Spores", says: "the fungus's own: an ant that walks here may catch it", entry: "fungus" });
  if (p.hypha) out.push({ what: "Mycelium", says: "the fungus's hyphae, grown through the ground", entry: "evolution" });
  if (p.foodTrail > TRAIL_SHOWN && p.foodTrail >= p.homeTrail)
    out.push({
      what: "Food trail",
      says: `${strength(p.foodTrail)}: laid by ants carrying food home; it leads out to food`,
      entry: "food-trail",
    });
  if (p.homeTrail > TRAIL_SHOWN && p.homeTrail > p.foodTrail)
    out.push({
      what: "Home trail",
      says: `${strength(p.homeTrail)}: laid by ants heading out; it leads back to the nest`,
      entry: "home-trail",
    });
  if (p.mound > 0) out.push({ what: "Mound", says: "soil carried up out of the nest as the ants dig", entry: "midden" });
  out.push(groundLine(p));
  // Scent shows only where a host sensed it lately (PRD §65): say so where the map shows none.
  // Only open ground carries scent: the sky, rock and soil never show any, sensed or not (review of #196, N2).
  if (p.sight === 0 && p.ground === "open")
    out.push({ what: "Unsensed", says: "no host of yours has smelled here lately, so no trail or alarm shows", entry: "fungus-senses" });
  return out;
}

function groundLine(p: LensProbe): LensLine {
  switch (p.ground) {
    case "rock":
      return { what: "Rock", says: "no ant walks or digs through it", entry: null };
    case "soil":
      return { what: "Soil", says: "the ants dig their tunnels and chambers in it", entry: p.view === "above" ? "midden" : "chambers" };
    case "air":
      return { what: "Sky", says: "above the ground", entry: null };
    default:
      return p.view === "below"
        ? { what: "Tunnel", says: "dug out: ants walk here underground", entry: "inside" }
        : { what: "Ground", says: "open ground the ants walk on", entry: null };
  }
}
