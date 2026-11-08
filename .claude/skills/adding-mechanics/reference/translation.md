# Translation: from biology to a mechanic this game can run

The game's rule (`docs/vision.md`, CLAUDE.md): **every choice an ant makes comes out of one policy over what that ant can sense.** The fungus works through the ants' senses and never decides for an ant. A mechanic is a translation of a biological finding into that shape, at a cost the game can pay.

## Contents
- Questions to answer
- Choice or body?
- Cue, response, local rule
- Cost: steering versus situation
- Measuring it
- Worked example

## Questions to answer

For each finding the mechanic rests on, write down:
1. **The cue.** What does the individual sense? Which row of vision.md's sense table is it? If none: stop and research the sense first (CLAUDE.md: "A sense not in the table needs a research note with primary sources first").
2. **The response.** What does it do: a mode, a response hook (`web/src/colony/responses.ts`: get, carry, drop, trail, trailRate, alarmGain, raiseAlarm…), steering, a new action?
3. **The local rule.** The deterministic rule that stands in for Jev offline, and its parameters with values from the note (marked design where invented).
4. **Off.** The setting under which the game behaves exactly as main does (bit-exact golden masters). Every behaviour change so far landed behind one.
5. **What it retires.** Which scripted rule or global read goes away (a gap-table row in vision.md, a `ja-k4k` child), or which new one it would add (then don't, or file the gap).
6. **The target.** The literature number the colony should reproduce, and the assay that measures it.

## Choice or body?

- **Body** may stay a mechanic: ageing, egg laying, hunger, death, pheromone decay, a queen's output, a fungus's growth.
- **Choice** must come from the policy: where to walk, what to carry, whether to dig, whom to fight, when to leave or rest.
- A rule that reads something no ant could sense (the chamber table, another nest's coordinates, a colony-wide count, the whole map) is a gap even if it makes the colony look right. Steering towards a true goal when stuck counts too.
- For the fungus: it senses only what a fungus in or on a host could (contact chemistry, its load, the substrate; `docs/fungus-policy.md` §11). Most of that is marked design; keep it marked.

## Cue, response, local rule

Write the mechanic as a short table in the note and the PRD:

| Cue (sensed) | Sense row | Response | Local rule | Off | Retires |
|---|---|---|---|---|---|
| contacts with returning food carriers | encounter rate | `leave` | leaky count ≥ threshold | always leave | the arrival rule (`ja-um8`) |

Keep situations small: few values per field, so answers cache per situation (`touchKey`, `Situation`). A field with many values multiplies the question space.

## Cost: steering versus situation

- **Steering is free**: a cue that bends where an ant walks (a gradient, a gain) costs no Jev tokens.
- **A situation field is paid**: it multiplies the questions a lane asks, and each question is ~450–600 input tokens at $0.042/M (`npm run colony-cost`, `node scripts/fungus-cost.mjs`).
- So look for a steering-only route first (`docs/ant-communication.md` "Implications", cheapest first).
- Estimate the new questions per game and $/hour from request size before building, and say it in the PRD; the PR gives the measured figure (CLAUDE.md).
- A cached game must still spend nothing.

## Measuring it

- **Assays** live in `web/src/colony/experiment.ts` (A1–A10, G, G′; baseline in PRD §42). A new behaviour gets an assay with a target from the note *before* the behaviour changes. If today's ants fail it, it goes in `tests/slow/assays.test.ts` as `todo`, naming the bead meant to fix it.
- **Ablation**: the cue on, versus the ant "deaf" to it, shows the cue does the work.
- **Tuning**: one parameter at a time over seeds 1–10, choose by the worst seed, confirm on 11–20.
- **Bench**: say the tick budget (ms) if the mechanic adds per-ant work.

## Worked example (MR 5, activation)

- Biology: harvester-ant foragers leave the nest at a rate set by how often they meet foragers returning with food (Gordon; Pinter-Wollman et al. 2013; Pless et al. 2015). Many workers are inactive at any moment.
- Cue: encounter rate (sense row), as a three-valued `returns` field (none, few, many) on the ant's `Touch`: few values, so answers still cache. Response: the `leave` hook (now, soon, wait) for a forager waiting inside (`responses.ts`). Local rule: a leaky count of contacts with successful returners against a threshold; scouts leave now and then anyway, so a colony with no successful returners still searches.
- Off: a rested forager goes straight out (the old arrival rule).
- Retired: the arrival rule; the strategist's map-wide `foodLeft` became the colony's `intake` rate.
- Target: assay A5, the outgoing rate tracks returns within seconds to minutes.
- Record: `docs/activation.md`, PRD §48 (assays first, then the change, ablation, tuning table, live check, cost per lane).
