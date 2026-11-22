# The game's colonies as a list (design, `ja-fnd.5.4.2`)

Design note, 2026-11-22. Stage S4 item 4 of [refactor.md](refactor.md): `Game` takes a list of colony specs instead of a fixed player and rival. Nothing is built yet. It is the last piece of S4 that changes code with a design in it (`ja-fnd.5.5`, the nest-kind interface, is separate), and the endless world's prerequisite ([endless-world.md](endless-world.md), `ja-qpv`).

## Where it stands

- `new Game(world, params, rng, sides)` builds colony 0 from `params.antCount` and `sides.colony`/`policy`/`responses`, and, when `params.rival` is set and the world has a second start nest, colony 1 from `params.rivalAnts` and `sides.rival`/`rivalPolicy`/`rivalResponses` (`game.ts:347-388`). Colony 0 has nest 0 and odour 0; colony 1 has nest 1 and odour 1.
- After construction a game already has N colonies: `addColony` founds more (`MAX_COLONIES` = 6, `Game.founded`), and the fights, raid aiming, `unified`, `fallen` and the doctrines work over `colonies`. Only the build is a pair.
- `Game.player` is `colonies[0]` and `Game.rival` is `colonies[1] ?? null`. Outside the tests there are about 113 mentions of `.rival`, `.player`, `rivalAnts`, `rivalPolicy`, `rivalResponses` or `Sides`, mostly in the assays (`experiment.ts` 40, `oneAssays.ts` 20, `harness.ts`, `builderAssays.ts`, `desertAssays.ts`), the page (`ColonyApp.tsx`, `useColony.ts`, `LabCards.tsx`) and the scripts; the tests have about 344.
- The world gives two start nests (`nestCount` 2); a third colony in a game comes from a founding, never from the constructor.
- The saved game keeps `params` (without the species), every colony's state, `founded` and the rest. Policies and responses are code, so they are not saved. Doctrines are the page's, indexed by colony (`doctrines[k]`).

## The shape

```ts
/** One colony the game starts with. Runtime only: a game is rebuilt from its settings (Game.load pours state into a game built afresh), so nothing here is saved. */
interface ColonySpec {
  antCount: number; // 0 stays buildable (rivalAnts: 0 is used by a soak test)
  nest?: number; // which of the world's start nests (default: its position in the list)
  odour?: number; // its nest odour (default below)
  colony?: Partial<ColonyParams>; // today's Sides.colony / Sides.rival
  policy?: Policy; // today's Sides.policy / rivalPolicy
  responses?: Responses; // today's Sides.responses / rivalResponses
}

new Game(world, params, rng, colonies?: ColonySpec[]) // replaces the Sides argument
```

- **The default is a pair, as today.** `DEFAULT_GAME` has `rival: true, rivalAnts: 800`, and the page's default is a pair too. With `colonies` omitted the constructor builds `DEFAULT_COLONIES`, the pair `[{antCount: params.antCount}, {antCount: 800}]`. Solo is an explicit one-spec list (about 25 assay and fixture sites say `rival: false` today).
- **The clamp, for the adapter; the error, for an explicit list.** Today `rival: true` on a one-nest world silently builds one colony (`game.ts:376`, `home.nests.length > 1`), and `oneWorld.test.ts` and `SMALL_SIDE` rely on it. The adapter and `DEFAULT_COLONIES` keep that clamp. An explicit list with more specs than the world has start nests is an error (a founding makes any further colony).
- **Precedence**, lowest first: the constructor's defaults (`nest` = position, `odour` below, `tolerance`, the species' params), the spec's `nest` and `odour`, then `colony` overrides. Today colony 0 lets `Sides.colony` override its `nest` and `odour`, while colony 1's `nest` is forced to 1 after its override and its odour can still be overridden (`neglectusAssays.ts:244` sets both colonies' odours that way). The adapter keeps colony 1's forced nest; an explicit list has no such rule.
- **Odour default:** one colony 0; two colonies 0 and 1 exactly; N ≥ 2 colonies `k / (N − 1)`.
- **The founders' cap** stays `1.5 × max(f.antCount, colony 0's antCount)` (`game.ts:625`). `Game` keeps `specs[0].antCount` for it. Changing it to the largest spec is a behaviour change (it would raise a founder's cap whenever the rival is larger), not part of this migration.
- The constructor loops over the specs in order, building each `Colony`, then the per-colony `#ownSituation` check (it draws nothing), so a two-colony game draws the same stream as today.
- `Game.player` and `Game.rival` go: `game.colonies[k]`.

## What is saved

Nothing new. `Game.load` does not rebuild colonies: it expects a game built afresh from the same world and settings, checks `saved.colonies.length === this.colonies.length`, pours state into the existing colonies, then overwrites `this.params` from the save. So the spec list is not saved, and the page keeps rebuilding from its own settings (`GameSettings.antCount` and `rival`, `ui/saves.ts`), from which `buildGame` derives the specs. Stages A and B change nothing `save()` writes. Stage C removes `antCount`, `rivalAnts` and `rival` from `GameParams`, which changes the saved `params`, so it bumps `SAVE_VERSION` (14 today) and says so. Colony overrides are never saved, as `Sides.colony` is not today (`encode` drops functions silently, so saving a spec's overrides would lose them without an error).

## Stages

Each is a PR, goldens bit-exact, reviewed by a fresh reviewer.

1. **A. The spec list, beside the pair.** `Game` gets the `colonies` argument next to `Sides`; the constructor builds from a list, deriving it from `Sides`, `rival`, `rivalAnts` and the nest count (with the clamp) when none is given. No caller changes. `params` is written the same either way (the spec list is not in it), so a unit test builds the same game by the pair and by the explicit list and compares `save()` and a few hundred ticks.
2. **B. Callers move, by area**, each a PR, the page keeping its `GameSettings`: the page (`useColony.ts`, `LabCards.tsx`, `ColonyApp.tsx`, `useCodex.ts`, `stats.ts`, `LearnDrawer.tsx`, `ui/saves.ts` reads), the harness and every assay file (`experiment.ts`, `oneAssays.ts`, `builderAssays.ts`, `desertAssays.ts`, `neglectusAssays.ts`, with `experiment.ts:634` and `:877` reading the colonies' counts instead of `params`), `species.ts`, the scripts (`colony-cost`, `precache`, `colony-live`, `colony-bench`, `colony-cost.mjs:192`, the labs), then the tests by tier (unit, int, soak, slow, golden). The golden scenarios keep their games; only their construction changes.
3. **C. The pair goes.** `Sides`, `rivalAnts`, `rival`, the adapter and the getters are deleted; `DEFAULT_COLONIES` is the default; `SAVE_VERSION` is bumped; the line in `refactor.md` is struck. A source-scan test holds that no caller names the old words. The pattern, over `web/src`, `web/server`, `web/worker`, `web/shared` and `scripts`: `\.rival\b|\.player\b|rivalAnts|rivalPolicy|rivalResponses|\bSides\b` (119 hits outside tests and 382 in them on 2026-11-22).

## Built

- **Stage A (`ja-fnd.5.4.2.1`).** `ColonySpec` and `Game`'s fourth argument, `Sides | ColonySpec[]`: an array is the list, anything else is the pair's words, which `pairSpecs` turns into the list (the clamp for a missing second nest, colony 1's forced nest, `antCount`/`rivalAnts`). The constructor builds each colony in list order and runs the per-colony situation check; the founders' cap reads `#firstAnts`, colony 0's start count. An explicit list longer than the start nests throws. `tests/int/gameColonies.test.ts` builds the same game by the pair and by the list and compares `save()` at the start and after 300 ticks, and pins the default pair, the clamp, the throw, precedence and zero ants. Goldens bit-exact; no caller changed.

- **Stage B1 (`ja-fnd.5.4.2.2`, the harness and the assays).** `RunSpec.colonies` is the list; the assays in `experiment.ts`, `oneAssays.ts`, `builderAssays.ts` and `neglectusAssays.ts` name their colonies with it instead of `game: { antCount, rival, rivalAnts }` and `sides`. `withOverrides` maps the command line's `colony` (first colony), `rival` (second), `both` (every one), `policy`, `rivalPolicy` and `responses` onto the list, and refuses `game.antCount`, `game.rival` and `game.rivalAnts` for a spec that lists its colonies. `gameOf(spec)` builds a spec's game (`runGame` uses it). `RunSpec.sides` stays until the tests move. `experiment.ts` reads the rival's count from `colonies[1]`. Held by `tests/soak/assays.test.ts` ("overrides on a listed spec: …": `both`, `rivalPolicy`, the refusal, `gameOf`). Checked by building every assay's game (`ONE_ASSAYS`, seeds 1 and 2, spec and control: 102 games) before and after and comparing a hash of `save()` without its `params`: identical.

- **Stage B2 (`ja-fnd.5.4.2.2`, the page).** `buildGame` passes the settings' ant count and rival box as a list (one colony, or a pair of the same size) and no longer sets `antCount`, `rival` or `rivalAnts` in the game's params. The page reads `game.colonies[0]` where it read `game.player` (`ColonyApp.tsx`, `LabCards.tsx`, `LearnDrawer.tsx`, `useCodex.ts`, `stats.ts`). `GameSettings` and `ui/saves.ts` keep `antCount` and `rival`. Checked: the page's game (rival on and off, two species, two seeds) after 60 ticks hashes the same before and after, `save()` without `params`. The saved `params` now carry the defaults for those three fields, which nothing reads; stage C removes them.

- **Stage B3 (`ja-fnd.5.4.2.2`, the scripts and labs).** `colony-live`, `colony-cost`, `colony-bench`, `precache`, `fungus-cost`, `unity` and the labs `progression`, `dig-spread`, `economy-strand`, `one-world-spike` and `chunk-memory` build their games with a colony list (a pair of equal size, or the lab's one colony) and read `game.colonies[k]` where they read `game.player` and `game.rival`; `field-shots` reads `colonies[0]`; `progression`'s own `rival` field is `rivalFirst`. `experiment.mjs` and `pi-error.mjs` still pass `rivalPolicy` and `rival` as `Overrides` keys: those are the harness's words, which stage C renames with `Overrides`. Checked: `colony-bench --hash` (a hash of the whole game, plain and `--page`) and `colony-cost`'s figures are identical before and after.

- **Stage B4 (`ja-fnd.5.4.2.2`, the unit, ui and int tests).** Every `new Game(...)` in those tiers names its colonies with a list (a codemod over the call's literal `antCount`, `rival`, `rivalAnts` and `Sides` words; `tests/int/gameColonies.test.ts` keeps the pair on purpose, as it is the adapter's test) and reads `game.colonies[k]` where it read `game.player` and `game.rival`. The soak, slow and golden tiers follow, and a sweep with the same pattern (`\.rival\b|\.player\b|rivalAnts|rivalPolicy|rivalResponses|\bSides\b`) takes the tests main gains in the meantime (#281's were swept in this PR).

- **Stage B5 (`ja-fnd.5.4.2.2`, the soak, slow and golden tiers, and `species.ts`).** The last tests name their colonies with a list and read `game.colonies[k]` (64 constructions by the codemod, the four `RunSpec` sites and three spread-params games by hand); `species.ts`'s comment names `ColonySpec.colony`. Goldens bit-exact. What still names the old words after this: `RunSpec.sides` and `Overrides.rival`/`rivalPolicy` (the harness's), the adapter and its test (`gameColonies.test.ts`), `GameParams.antCount/rival/rivalAnts`, `Game.player`/`Game.rival`, and `DEFAULT_GAME`'s pair: stage C.

## Not in this

- **A species per colony.** One species per game stays ([species.md](species.md): tier 1 first). Mixed species need per-colony channels, recognition tolerance, lane words and the fungus's menu. It belongs to a later stage; `ColonySpec` does not reserve a field for it.
- **Colonies beyond the start nests.** Founding stays the way a game gets more, and the endless world (`ja-qpv`) is where that changes.

## Decided, and open

- **Decided by the design (no objection from the review):** the getters go in stage C (`game.colonies[k]`; no `Game.first` unless the page asks for one); a species per colony is later.
- **Open (recommend: save nothing):** whether any of the spec is saved. Saving `{antCount, nest, odour}` would be a small `params` change under stage C's bump and buys nothing while `load` pours into a built game; saving the whole spec risks dropping function values silently.

## Cost and guards

- Jev's $/h does not change: no legend, question or version moves, and the colonies a game starts with are the same ones.
- Guards: every golden bit-exact through A and B; the adapter test in A; a source-scan test in C that no caller names `rivalAnts` or `Sides`.
