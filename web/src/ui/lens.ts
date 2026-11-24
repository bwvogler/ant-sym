import {
  AIR,
  CELL,
  cellOf,
  isCurtainLayer,
  mapOfLayer,
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
  type OneWorld,
  type WorldMap,
} from "../colony/index.ts";
import { type FogState, LIVE, REMEMBERED, UNKNOWN } from "./fog/knowledge.ts";
import { SNAP } from "./fog/sources.ts";
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
  /** the view: one world's above (the plane) or below (the curtain) */
  view: "above" | "below";
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
  /** the colonies the game has frozen (only when some are): what the lens says of their ants, hole and chambers carries it (ja-qpv.4.5) */
  asleep?: ReadonlySet<number>;
  /** under the fog of war: unknown (never sensed), remembered or live; absent without it (docs/fog-of-war.md §5.2) */
  fog?: FogState;
  /** under the fog, how many sim seconds ago a remembered place was last sensed */
  age?: number;
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
  /** one world's plane and curtain */
  world: OneWorld;
}

/**
 * The colony whose hole is at (a, b) on layer `lv` (the plane cell, or the curtain's column and row), or -1. A colony's own hole is `holeCells[params.nest]`
 * (its line's holes, indexed as its line's nests are), and a curtain's columns are its line's: only a colony at home on `lv` has its hole there.
 */
export function holeOwner(colonies: readonly Colony[], lv: number, a: number, b: number): number {
  for (let k = 0; k < colonies.length; k++) {
    const col = colonies[k]!;
    const h = col.holeCells[col.params.nest];
    if (h && (lv === PLANE ? h.px === a && h.py === b : col.home === lv && h.col === a && h.row === b)) return k;
  }
  return -1;
}

/**
 * The colony that owns chamber `owner` (`Chamber.colony`: a nest's index among its curtain's) of `map`, or -1: the colony of that nest whose
 * curtain `map` is, since each line's curtain numbers its nests from 0.
 */
export function chamberOwner(colonies: readonly Colony[], map: WorldMap, owner: number): number {
  return colonies.findIndex((col) => col.params.nest === owner && (col.layers?.[col.home]?.map ?? map) === map);
}

/**
 * What the field shows at world (x, y) of layer `lv` (one world's PLANE or CURTAIN). `trails`:
 * which trails the field draws now (Settings).
 */
export function probe(g: LensWorld, sensed: SensedMap, lv: number, x: number, y: number, trails = { food: true, home: true }): LensProbe {
  const map = mapOfLayer(g.world, lv);
  cellOf(x, y);
  const gx = CELL[0];
  const gy = CELL[1];
  const fog = sensed.knowledge;
  const fs: FogState = fog ? fog.state(lv, gx, gy) : LIVE;
  const hole0 = holeOwner(g.colonies, lv, gx, gy);
  if (fs === UNKNOWN)
    // Nothing of a place never sensed: not its ground, food, scent or what lies in it (its hole is the nest's structure: shown once sensed).
    return {
      view: isCurtainLayer(lv) ? "below" : "above",
      ground: "open",
      food: 0,
      mound: 0,
      spores: false,
      hypha: false,
      sight: 0,
      alarm: 0,
      foodTrail: 0,
      homeTrail: 0,
      hole: -1,
      chamber: null,
      fog: UNKNOWN,
    };
  // A remembered place is what was last sensed there, not what is there now.
  const remembered = fs === REMEMBERED && fog;
  const r = remembered ? (fog.snapshot(lv, SNAP.rock, gx, gy) ?? 0) : rockAt(map, gx, gy);
  const sight = sensed.sight(lv, gx, gy);
  let alarm = 0;
  let foodTrail = 0;
  let homeTrail = 0;
  if (sight > 0)
    for (const c of g.colonies) {
      const ph = c.layers[lv]?.ph;
      if (!ph) continue;
      alarm = Math.max(alarm, sight * Math.min(1, ph.fields.alarm.get(gx, gy) / ALARM_FULL));
      if (trails.food) foodTrail = Math.max(foodTrail, sight * Math.min(1, ph.fields.food.get(gx, gy) / FOOD_FULL));
      if (trails.home) homeTrail = Math.max(homeTrail, sight * Math.min(1, ph.fields.home.get(gx, gy) / HOME_FULL));
    }
  const spores = g.fungus.sporesOn(lv)?.spores ?? g.fungus.spores;
  const hole = hole0;
  let chamber: LensProbe["chamber"] = null;
  const id = map.chambers?.at(gx, gy) ?? -1;
  const ch = id >= 0 ? map.chambers!.list[id] : undefined;
  if (ch) {
    const k = chamberOwner(g.colonies, map, ch.colony);
    // A remembered chamber's role and what lies in it are live numbers: only that it is a chamber is still true.
    if (k >= 0) chamber = remembered ? { k, role: "none", brood: 0, food: 0 } : { k, role: ch.role, brood: ch.brood, food: ch.food };
  }
  return {
    view: isCurtainLayer(lv) ? "below" : "above",
    ground: r === OPEN ? "open" : r === SOIL ? "soil" : r === AIR ? "air" : "rock",
    food: remembered ? (fog.snapshot(lv, SNAP.food, gx, gy) ?? 0) : map.food.get(gx, gy),
    mound: remembered ? (fog.snapshot(lv, SNAP.spoil, gx, gy) ?? 0) : (map.spoil?.get(gx, gy) ?? 0),
    spores: spores.get(gx, gy) >= SPORE_SHOWN,
    hypha: g.fungus.hyphaeOn(lv)?.has(gx, gy) ?? false,
    sight,
    alarm,
    foodTrail,
    homeTrail,
    hole,
    chamber,
    ...(sensed.asleep.size ? { asleep: sensed.asleep } : {}),
    ...(fog ? { fog: fs, age: remembered ? Math.max(0, sensed.now - fog.lastSeen(lv, gx, gy)) : 0 } : {}),
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
export const ROLE_ENTRY: Record<Role, string> = {
  royal: "queen",
  brood: "brood",
  store: "chambers",
  reception: "chambers",
  midden: "midden",
  none: "chambers",
};

/** What the lens adds of a colony the game has frozen (owner, 2026-11-24: the page says it is asleep). */
const ASLEEP_SAYS = "asleep: the game has paused it while the fungus is elsewhere";

const strength = (v: number) => (v >= 0.66 ? "strong" : v >= 0.33 ? "fair" : "faint");

/** What the lens says of a point and the ant there (if any): the ant first, then the place, top to bottom as drawn. */
export function lensLines(p: LensProbe, ant: LensAnt | null): LensLine[] {
  const out: LensLine[] = [];
  if (p.fog === UNKNOWN)
    return [
      { what: "Unexplored", says: "your hosts and your body have not sensed this ground: nothing is known of it", entry: "fungus-senses" },
    ];
  if (ant) {
    const bits = [
      ant.mode,
      ...(ant.carrying ? ["carrying food"] : []),
      ant.infected ? "a host of yours" : "not infected",
      ...(p.asleep?.has(ant.k) ? ["asleep"] : []),
    ];
    out.push({ what: `Ant #${ant.i} of ${colonyName(ant.k)}`, says: bits.join(" · "), entry: ant.infected ? "fungus" : "jobs" });
  }
  if (p.hole >= 0)
    out.push({
      what: `${colonyName(p.hole)}'s hole`,
      says:
        (p.view === "below"
          ? "where the nest's shaft meets the ground: the way up"
          : "the way into the nest: the line through the holes shows below") + (p.asleep?.has(p.hole) ? ` · ${ASLEEP_SAYS}` : ""),
      entry: "one-world",
    });
  if (p.chamber) {
    const c = p.chamber;
    const lying = [...(c.brood > 0 ? [`${Math.round(c.brood)} brood`] : []), ...(c.food > 0 ? [`${Math.round(c.food)} food`] : [])];
    if (p.fog === REMEMBERED)
      // Its use and what lies in it are live: only that it is a chamber of that colony is still known.
      out.push({
        what: `A chamber of ${colonyName(c.k)}`,
        says: `what it is used for, and what lies in it, is not known now: nobody senses it${p.asleep?.has(c.k) ? ` · ${ASLEEP_SAYS}` : ""}`,
        entry: "chambers",
      });
    else
      out.push({
        what: `${ROLE_NAME[c.role]} of ${colonyName(c.k)}`,
        says: `${ROLE_TEXT[c.role]}${lying.length ? ` · ${lying.join(", ")}` : ""}${p.asleep?.has(c.k) ? ` · ${ASLEEP_SAYS}` : ""}`,
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
  if (p.fog === REMEMBERED)
    out.push({
      what: "Last seen",
      says: `${Math.round(p.age ?? 0)} s ago: nobody senses it now, so this is how it was`,
      entry: "fungus-senses",
    });
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
