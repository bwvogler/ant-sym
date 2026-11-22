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
/** One colony the game starts with: data only, saved with the game's params. */
interface ColonySpec {
  antCount: number;
  /** which of the world's start nests (default: its position in the list) */
  nest?: number;
  /** its nest odour (default: spread from 0 to 1 over the list, as 0 and 1 are for two) */
  odour?: number;
  /** its own colony params over the species' */
  colony?: Partial<ColonyParams>;
}
/** How one colony plays: code, so never saved. Keyed by colony index. */
interface Brain { policy?: Policy; responses?: Responses }

GameParams.colonies?: ColonySpec[];            // replaces antCount, rivalAnts, rival
new Game(world, params, rng, brains?: Brain[]) // replaces Sides
```

- A game with no `colonies` is one colony of `antCount`; the pair is `[{antCount}, {antCount: rivalAnts}]`. After the migration `antCount`, `rivalAnts` and `rival` are gone from `GameParams`, and `Game` keeps the one number the founders need (`maxAnts`, now `max` over the specs' `antCount`).
- The constructor loops over the specs in order. Each `new Colony(...)` draws from `rng` as today, in the same order, so a two-colony game is bit-exact.
- More specs than the world has start nests is an error (a founding makes the third colony).
- `Game.player` and `Game.rival` go: `game.colonies[k]`. `player` stays as a thin alias for `colonies[0]` only if a caller still wants "the first colony" (the page's "Ink"), named for that (`Game.first`).
- Doctrines are already keyed by colony index; "keyed by colony and species" waits on a per-colony species (below).

## Stages

Each is a PR, goldens bit-exact, reviewed by a fresh reviewer, and the order keeps the tree green.

1. **A. The spec list, beside the pair.** `GameParams.colonies?` and `Game(world, params, rng, brains?)` are added; the constructor builds from the list, and an adapter derives the list from the legacy fields (`antCount`, `rivalAnts`, `rival`, `Sides`) when `colonies` is absent. No caller changes. A unit test builds the same game both ways and compares `save()`.
2. **B. Callers move, by area**, each a PR: the page and its saves (`useColony.ts`, `LabCards.tsx`, `ColonyApp.tsx`), the assay harness and the assays, the scripts, then the tests by tier (unit, int, soak, slow, golden). The golden scenarios keep their games; only their construction changes.
3. **C. The pair goes.** `Sides`, `rivalAnts`, `rival`, the adapter and the `rival` getter are deleted, `SAVE_VERSION` is bumped for the changed `params` (said in the PR), and the doc line in `refactor.md` is struck.

## Not in this

- **A species per colony.** One species per game stays ([species.md](species.md): tier 1 first). Mixed species need per-colony channels, recognition tolerance, lane words and the fungus's menu. It belongs to a later stage, and `ColonySpec` leaves a field's worth of room for it rather than a field.
- **Colonies beyond the start nests.** Founding stays the way a game gets more, and the endless world (`ja-qpv`) is where that changes.

## Decided, and open

- **Open (recommend: as above):** `Game.player`/`Game.rival` go in stage C, with `Game.first` kept only if the page needs a name for colony 0; the alternative keeps both getters for good.
- **Open (recommend: the list):** whether the spec list is saved. The data fields are saved with `params` (so a load rebuilds the same game); the brains are not.
- **Open (recommend: later):** a species per colony.

## Cost and guards

- Jev's $/h does not change: no legend, question or version moves, and the colonies a game starts with are the same ones.
- Guards: every golden bit-exact through A and B; the adapter test in A; a source-scan test in C that no caller names `rivalAnts` or `Sides`.
