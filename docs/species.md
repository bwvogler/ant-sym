# Species: what one is in this code, and how to add one

*Design note for `ja-fnd.5.3` (S4.3, [refactor.md](refactor.md), PRD §62). Written 2026-11-12 against code at `d9db43a`, from three read-only surveys of the colony, the game and the page. It is a refactor design, not a mechanic: what a species' biology is lives in its own note ([desert-ant.md](desert-ant.md)). Line numbers are into `web/src/colony/` unless a path says otherwise and will drift; the symbols will not.*

The game has one kind of ant. There is no species concept: `grep species` finds only prose in the Learn guide, and the fungus has no host range. The class `Colony` *is* the ant. This note says what a second species would have to touch today, sorts it by how deep it goes, and proposes the cheapest descriptor that carries the desert ant now and does not block a termite or an army ant later.

## What is true today

- **Channels.** `Channel = food | home | alarm | noEntry | raid | marks` is one module-wide list (`pheromone.ts:26-34`). Each colony owns its own `Pheromones` per layer (`colony.ts:894`, `:911`); nothing is shared by default. A "foreign" trail is a wired reference to another colony's field (`Game.#aimAt`, `game.ts:752-763`), read only on the `food` channel. A channel nobody lays is nearly free in time (its awake set is empty: an early return at `pheromone.ts:196`) and costs only a few empty structures.
- **Sensors.** Three antennae, each reading three channels into a 9-slot buffer: food, home, alarm (`#sense`, `colony.ts:1870`, `:4947-4964`). `raid`, `noEntry` and the marks are read apart. The policy's `foodTrail`, `homeTrail` and `alarm` come from that buffer.
- **The tick.** `Colony.tick()` is about 1,230 lines inside a 6,875-line class (`colony.ts:4895-6128`): sensing, stance, carry, the policy ask, the contact response, then one `if/else` chain of per-mode steering (about 330 lines for `RETURN` alone), body physics, nest life, fatigue. `Mode` is four constants (`EXPLORE..FIGHT = 0..3`, `colony.ts:124-127`) compared in about 60 places; there is no per-mode dispatch.
- **Situations and lanes.** The mode lane's `Situation` is a fixed seven-field schema (`vocab.ts`), 3,888 situations; the legends Jev reads name trails and nests; the lane registry (`lanes.ts`, merged in #92–#102) is global, not per species.
- **Per-ant state.** `ANT_FIELDS` (`ants.ts`) is one table of about 150 arrays allocated for every colony. About 100 are generic-ant specific (route memory, digging, wall following, nest, brood, hunger); the fungus reads another group (`load`, `strain`, `resist`, `expr`, the gains).
- **Parameters.** `ColonyParams` (`colony.ts:222`) carries speed, sensors, patience, deposit rates, per-channel overrides, odour, tolerance. Physiology constants (`LIFESPAN`, the hunger constants in `hunger.ts`) are module constants. `Game` sets parameters for colony 0 (`nest: 0, odour: 0`) and, if `rival`, colony 1.
- **The game is two colonies.** `Sides` is literally `colony`/`rival`; `Game.player` is `colonies[0]` and `Game.rival` is `colonies[1]`; `oneWorld.ts` throws on more than two nests; unity assumes one shared odour axis; the page names and colours colonies by index (`ui/names.ts`, `ColonyField.tsx`); Jev doctrines are a `string[]` by colony index. `Game.addColony` already supports more (founding), and `MAX_COLONIES` caps it.
- **The nest is the ant's.** Queen, brood, chambers, roles, mound and digging live in `Colony`. On the plane a colony already runs without a queen or chambers: the nest is a disc round the hole and "the larder becomes ants directly" (`colony.ts:699`, `:903-917`).
- **The fungus** reads age bands (`TASKS[c.band(i)]`), the queen as a host, grooming, burying (`onBury`), place and odour touch. It is one `Fungus` for every colony. No host range.
- **The save** has no species id; `SAVE_VERSION = 9` is checked strictly, and the owner has said no compatibility is needed while nobody plays (`bd memories no-backward-compat`).
- **Goldens and the random stream.** One seeded `rng` is shared by the game and every colony. Every living ant draws once a tick for steering noise (`colony.ts:5210`); many branches draw conditionally. A change that adds, drops or reorders a draw on the generic path breaks the golden masters; a species that draws only in its own code path does not.

## Three tiers of difference

What a species can differ in, by how deep the change goes:

1. **Parameters and words (data).** `ColonyParams` overrides, the local rule set (`Responses`: what it lays, how it reacts), which field feeds a sensor, the Jev words for each lane (legend, criteria, brain version), names and Learn text, the fungus's view of the host. The tick does not change.
2. **Structure the colony allocates.** Which channels exist, which groups of per-ant arrays, which fields the `Situation` has. The tick reads them through guards.
3. **Behaviour code.** The set of modes and how each steers, the nest kind. Today this means a different tick body, which does not exist as a seam: the generic ant's body is not separable from `Colony`.

## What the desert ant needs, by tier

From [desert-ant.md](desert-ant.md) and the decisions in PRD §60:

| Needs | Tier | How, with what exists |
|---|---|---|
| No trails, no alarm | 1 | A `Responses` whose `trail`, `alarmGain`, `raiseAlarm` and `noEntry` lay nothing. The unlaid channels cost almost nothing. |
| Food odour in the air (a radial gradient from each food item) | 1 | A world-laid field read by the existing food sensor, so `follow` climbs it: the policy sees `foodTrail` as the odour level. The sense-table row stays "food odour", distinct from a trail. |
| Path integration, search loops, route memory | 0 | Already there (`#integrate`, `#searchOn`; route memory is `ja-lp4.16`). |
| Heat as a limit on being out | 1 | Heat raises the existing `fatigue` rate outside, so a hot ant is `tired` and goes home to rest; no new mode. A `hot` situation value is a tier-2 step only if Jev must be able to see it. |
| The invitation (speed passed on by contact) | 1 | The existing `leave` response over `returns`, with the paper's thresholds; a per-ant speed state is one new array (tier 2, only for this species). |
| No corpse removal, one small nest, about 200 workers | 1 | Host properties and `ColonyParams` (`maxAnts`, no undertaking); the plane's disc nest already exists. |
| Its own Jev words (the generic legend says "food scent is laid by ants carrying food home", false for it) | 1 | A per-species variant of each lane's legend, criteria and brain version, so its answers are cached under its own contexts and the generic ant's stay as they are. |

So **the desert ant is tier 1 plus one or two tier-2 arrays.** It needs no new mode and no tick split. What it does need is the species to be a thing the `Game` and the lanes know about.

## The descriptor, at tier 1

A sketch, not a contract; names will change.

```ts
interface Species {
  id: string; name: string;
  /** physiology and sizes: overrides of DEFAULT_COLONY (speed, patience, maxAnts, deposit rates, per-channel params) */
  params: Partial<ColonyParams>;
  /** the local rule set: what it lays, how it answers contact, leaving, alarm */
  responses: Responses;
  /** the Jev words of each lane it has: legend, criteria, version (the functions stay the lane registry's) */
  lanes: Partial<Record<LaneName, LaneWords>>;
  /** what the existing sensors read: the trail channel (the generic ant) or a world field (food odour) */
  senses: { food: "trail" | "odour" };
  /** what the fungus sees of a host of this species */
  host: { undertakes: boolean; queen: boolean };
  /** names and Learn text */
  words: { colonyNames: string[]; learn: string };
}
export const GENERIC_ANT: Species = { /* today's defaults, bit-exact */ };
```

`GameParams.species` picks one for the game (default `GENERIC_ANT`); `Colony` takes its parameters and responses from it. The lane registry's rows gain "words by species": `contextOf(words, variant)` becomes species-aware, so the desert ant's mode lane has its own legend and `desert-colony-v1-…` contexts, its own precache bundles and its own cost line.

## Order of work (each step keeps the generic ant's goldens bit-exact)

1. **`Species` and `GENERIC_ANT`.** The type, the generic ant as a species whose fields equal today's defaults; `Colony` reads its params and responses from it; `GameParams.species`. No behaviour change.
2. **Lane words by species.** The registry rows take a species; the generic ant's legends, contexts and precache stay byte-identical (the pins in `schema.test.ts` and `precache.test.ts` hold); a test species gets its own.
3. **The save carries the species.** `GameSettings.species`, `SAVE_VERSION` 10 (no migration).
4. **Fungus host properties** (`undertakes`, `queen`) read from the species instead of assumed.
5. **The test species**: in a test file, with different params, responses and legend, plays a short game; nothing outside `species/` and its own lane edited. This is the stage's acceptance, now with the desert ant as the real consumer.
6. Then **the desert ant** (`ja-rf5`): its row, its odour field, heat in fatigue, the invitation.

Later, when a species needs it (a termite mound, an army ant's bivouac): tier 2 (optional channels, per-species ant-array groups, guarded reads) and tier 3 (the generic ant's body extracted verbatim as a strategy, the tick pipeline `ja-fnd.4.4`, the nest-kind interface `ja-fnd.5.5`). Doing them before a species needs them is the over-engineering the lane registry's reviews warned about.

## Decisions

Made here (the owner can overturn):
- **Tier 1 first.** The desert ant ships as data plus a little tier 2, not as a new tick.
- **The tick split waits for a species that needs it** (different modes or nest kind: termites, army ants).
- **Species words and contexts are separate from the generic ant's**, so shipped Jev answers and cached answers for the generic ant never move.
- **No migration** for saves (`SAVE_VERSION` bump), per the owner's standing rule.

For the owner, with what it costs (asked in the session; recorded in PRD §62 once answered):
1. **One species per game, or mixed worlds?** One species per game (a "desert" scenario: its own map, both colonies desert ants) needs only `GameParams.species`; unity, odour, the page's names and colours, chapters and Jev doctrines stay as they are. Mixed worlds (an ant colony and a desert-ant colony on one map, the ladder's parabiosis) need `Game` over a list of colony specs instead of `player`/`rival`, per-colony species in `GameSettings`, an odour axis per species pair, `foreign` trail reading across different channel sets (a guard on the missing channel), more than two nests in one world, per-colony names and colours, and chapters that do not assume a queen. That is a stage of its own (`ja-fnd.5.4`).

## Risks

- **Random draws.** A species draws only inside its own code path; the generic path's draws, and the order of colonies' ticks, do not change. A mixed-species game has its own goldens.
- **Jev words cost money.** Each species lane is a new legend and a new precache: a live check (`colony-live`, owner's say) and `--import` to ship. The generic ant's are untouched.
- **The page is generic-ant prose** (Learn, the start card, chapters): a species' words are a content task of their own (`ja-fnd.6.6`).
