---
name: watching-a-game
description: "Shows what happens in a jev-ants game as events: births, deaths and their cause, mode and stance changes with the situation the policy was asked, the queen, infections, Jev batches. Use whenever you or the user need to know why an ant, colony or the fungus did something, what a game or an assay run actually did, to debug or inspect behaviour, to add logging, or when someone says logs, trace, journal, 'what happened' or 'why did it'. Offline and free. Not for tuning a number (npm run exp's metrics) or live Jev checks (colony-live)."
---

# Watching a game

The game journal (`web/src/colony/journal.ts`, ja-8tb) is a read-only observer: after each tick it compares the game with what it saw before and writes one event per change. It draws no random numbers and writes no game state, so a watched game is the game unwatched (`tests/unit/journal.test.ts` holds that). Off unless asked.

## Pick the way in

| You are | Use |
|---|---|
| running assays or a whole game offline | `npm run exp -- game --seeds 1 --seconds 240 --log <spec>`: one `.txt` (a line an event, `  182.3s  c0 #523  death  killed`: to `grep`) and one `.jsonl` (the same events with exact `t` and a `data` object: for `jq`) per run in `experiments/out/journal/<assay>-<n>-seed<s>.jsonl` |
| watching the page | `?log=<spec>` on the URL: events go to the browser console at the debug level (DevTools "Verbose"), and a Journal card in Details shows the newest 200 |
| in a test or script | `const j = new Journal(spec); … j.observe(game)` after each tick; `j.events`, `j.subscribe(fn)`; `journalProbe(j)` in `experiment.ts` makes it a probe |

`node scripts/experiment.mjs --help` (any `scripts/*.mjs` takes `--help`) prints its usage.

## The spec

Comma-separated words, in any order. A word it doesn't know throws and lists the valid ones.

- **Levels** (each includes the one before): `summary` = colony, queen, stance, jev; `detail` = summary + birth, death, infection, dig; `verbose` = detail + `mode` (every mode change, with the situation).
- **Categories** (name them instead, or add to a level): `colony queen stance jev birth death mode infection dig` (`dig`: an old forager's foraging dig, begun and ended with food or time up, with its depth; forageDig, ja-16rp).
- **Filters:** `colony=<k>`, `ant=<i>` (the ant's slot; an event also carries its `gen`, since a slot is reused). Either alone means everything about it.

## Recipe: why did ant #i do that?

1. `--log detail` to see who died, of what (`killed`, `died of old age`, `starved`) and who was infected, with their slots and times.
2. `--log verbose,colony=<k>,ant=<i>` for that ant: each `mode` event reads `explore → return  (tired, food faint, …)` and its `data.situation` is the exact `Situation` its policy was asked, so a surprising choice can be replayed against the policy (`localPolicy`, or a cache with `--policy cache:<file>`).
3. Check the timing against `summary`'s stance and queen events for its colony.

## Volume

`verbose` on the 1200-ant `game` is on the order of a thousand events a second (hundreds of MB over 10 sim-minutes; measured in PR #95). Start at `summary` or `detail`; add `mode` only with `ant=` or `colony=`. Watching costs a few percent of tick time (PR #95) and nothing when off. `exp --log` streams to the files; the page keeps the newest 2000.

## Changing it

A new kind of event is a category in `JOURNAL_CATEGORIES`, written from `Journal.observe` by diffing public state (never by hooking into the colony's code: that is how a watcher changes the game), with a test in `tests/unit/journal.test.ts` that is mutation-checked. Events from outside the colony (the page's Jev lanes) use `journal.note`. Keep the colony free of `console.*`.
