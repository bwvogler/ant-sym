# The nest kind: what it has to own, and the order to get there

Design note, 2026-11-23 (`ja-fnd.5.5`, S4.5 of [refactor.md](refactor.md)). A plan, not a research note. It says what "the nest" is in the code today, where the code treats the queen and the nest as one thing, what the species waiting on a nest-kind interface need of it, and the slices. [species.md](species.md) puts the nest kind in tier 3 and warns against building tier 3 before a species needs it; this note keeps to that: the first slice names a concept and changes no behaviour, the interface itself waits for its first consumer.

## What the nest is today

One implementation: the **dug curtain**. A colony has, per layer (`Colony.layers[l].nest`): a nest disc (`x`, `y`, `r`) and, on the curtain, an `entrance` (the hole on the ground line). On the curtain the map carries the **chambers** (`map.chambers`: a list with a role each: royal, brood, store, reception, midden), which the ants dig and the colony feeds (`foodTo`, `chamberGoal`, `feedHome`). The mound is the plane's spoil (`soilOut`, `moundRadius`; the UI draws it). The **queen** lies on the royal chamber's floor (`Colony.queen`, made in the constructor only `if (this.entrance && map.chambers)`).

## The conflation

`queen !== null` is read as two different things:

| Meaning | Reads | Examples |
|---|---|---|
| **A. The colony has a nest to live in** (chambers, brood, stores, workers zoned by age): "a curtain colony; a bare one on a field has none" | about 30, in `colony.ts` (`band`, `digs`, `outbound`, `staysIn`, `forageDigs`, `reverts`, `spare`, `step`'s `body` and `nestLife` gates, the constructor's age spread), `arrive.ts` (the nurse, the go-down rule, the forage dig), `body.ts` (`feedHome`, lifespan, the crop and reversion switches), `tunnel.ts` (fetch, brood walks), `decide.ts`, `homing.ts`, `deliveryAction.ts`, `recognition.ts` | `if (this.queen) body(this, dt)`; `digs(i) { return !this.queen \|\| ... }` |
| **B. The queen herself** (alive, her cell, her load, her signal) | about 24, in `steer.ts` (her position, `queen?.alive`), `builder.ts`, `body.ts` (her feeding), `fungus.ts` (her infection), `nestWork.ts` (the royal chamber's growth), `game.ts` (flights, founding, the revealed host), `journal.ts`, `experiment.ts`, `Colony.killQueen` and `orphaned` | `c.queen.load >= INFECTED`; `killQueen()` |

(Counts are from reading each of the 54 non-test reads in `web/src/colony/` (the UI adds about 28 more), not from a tool: a line can be both.) The two coincide for the generic ant, which is why nothing is wrong today. They stop coinciding at once for the species that wait on this:

| Species (bead) | What it needs the nest kind to own | Breaks which meaning |
|---|---|---|
| *L. neglectus*, Pharaoh (`ja-e668.6`, `ja-8fd.1`) | several queens (`queens[]`), one colony with several nests, budding on foot | B: no single `queen`; A: "the nest" is a set |
| Army ant (`ja-ehuv.3`, [army-ant.md](army-ant.md)) | a bivouac: no dug cells, home is the cluster, and it moves | A without chambers; a queen with no royal chamber |
| Leafcutter (`ja-vq14.4`) | a chamber role whose stock is leaves (the garden), fed from | A: a new role in the chamber list |
| Termite (`ja-328h.3`) | a royal pair, neotenics, a mound | B (a pair), A (a mound that is the nest) |

## The interface, and why it waits

What a nest kind would own, from the above: where home is (per layer, and as a set for several nests); the chambers or whatever stands in for them, and the roles food and brood are carried to; whether the colony has a nest life at all (meaning A); the queens (meaning B), their count and cells; how the nest grows (digging, a mound, a bivouac moving); and how it is drawn (the UI's `drawNest` stage is already the per-kind drawer: [field-split.md](field-split.md)). Its shape depends on what the second kind needs, and no second kind is built: the bivouac and the several-nest colony ask for different things (a moving home against a set of homes). So the interface is not drawn here. What is certain, and needs no second kind, is that **A and B are two questions**.

## Slices

1. **`ja-fnd.5.5.1`: name meaning A** (built in this note's PR). `Colony.housed` (`queen !== null`: the colony lives in a nest with chambers, brood and zoned workers) replaces the A reads; the B reads stay on `queen`. No behaviour change: the same boolean, so every golden is bit-exact. After it, `queen` can become `queens[]` (`ja-8fd.1`) without touching the ~30 gates, and a nest with no queen in it (a bivouac) can say `housed` without one once the three places that still assume `housed` ⇒ a queen are done: `nestWork.ts` `nestLife` (`col.queen!`, reached only under `if (this.housed)`), `steer.ts` (`col.queen!` behind `broodClimb > 0 || col.queen?.alive`, safe as written) and `game.ts` `beaten` (its outer gate is meaning A, its inner `c.queen` read is B and needs the narrowing, so it stays on `queen`; not in the count above). `housed.test.ts` pins the invariant today, so the first queenless nest breaks a test and not `nestLife`.
2. **`ja-fnd.5.5.2`: the queen's reads behind methods.** B reads go through what they ask (`queenAlive()`, the royal cell, `queenLoad()`), so one queen or several is one place. Bit-exact. Waits on `ja-8fd.1`'s design (does a colony ask "is any queen alive" or "is the colony orphaned"?).
3. **The interface**, with its first consumer: `ja-e668.6` (several nests) or the first of the army ant and leafcutter to be built. Its slice list is filed then, from what that consumer needs. Until then the dug curtain stays the one implementation, in `Colony`.

Each slice is colony code: goldens bit-exact, the slow guards (the `slow-guards` label) before merge, a Jev cost of none (no legend, question or version changes).

## Decisions

- **Is the queen part of the nest kind or a species trait?** The nest kind (the bead's note from species step 4, [species.md](species.md)): a colony without a nest has no queen to speak of, and several queens are a property of the nest. Slice 2 puts her reads behind the colony, where the nest kind will take them.
- **Build the interface now?** No: slice 1 now (it is cheap, safe and both `ja-8fd.1` and `ja-e668.6` need it), the interface with its first consumer. This is [species.md](species.md)'s own rule for tier 3.
