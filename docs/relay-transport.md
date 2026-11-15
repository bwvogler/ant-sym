# Relay in stages: food reaches the brood by short carries, not one ant's whole trip

*Research note for `ja-ukac` (fixes `ja-rvli`; PRD §79). Written 2026-11-15, against code at `08571f0`. Read in full: Tschinkel, Rink & Kwapich 2015 (Europe PMC full text; figures not seen), Greenwald, Segre & Feinerman 2015 (read for `larval-feeding.md`). Read as an abstract only, so its numbers are **unverified**: Pielström & Roces 2013. Known only as cited by Tschinkel et al.: Howard & Tschinkel 1976 (necrophoric piles).*

The question: how does a colony get stored food to its brood when the store is far away, and who does the carrying?

In the game today, one ant carries one food unit from a stocked chamber the whole way to a chamber chosen from a colony-wide table of unmet need (`port`, `portView`, `wanted` in `nestWork.ts`; a gap row in `docs/vision.md`). A trace on the economy test's world 3, nudge 1, with task reversion on (PRD §74), 2,000–2,700 s:
- **Delivery works.** 201 porters started, 198 put their food down where it was wanted (126 at brood chambers, 75 at the royal chamber), and the median trip took 30 s.
- **Starting is the limit.** 17 carries began a minute, against the 25–58 a minute the larvae were owed (PRD §75). A carry starts only when an idle ant is within two cells of a stocked store or reception. The store is a tunnel's dead end, about 15 columns from the brood; in `ja-rvli`'s traces ~130 ants felt need and were outside, in tunnels or in the royal chamber; none was counted in a store.
- **Nothing leads a hungry ant there.** The store's floor mark inside the royal chamber was 0.000, and slowing its fade or steering fetchers by it collapsed colonies (PRD §50.18, `ja-4rfr`).

## Carrying is split into short legs by different workers

- *Pogonomyrmex badius* (Florida harvester ant): foragers drop seeds only in the uppermost chambers and are never found below about 12 cm. "a separate group of workers rapidly transports them downward in increments detectable as a 'wave' of seeds", ending in seed chambers 20–80 cm down. In colony 6, seeds collected 15 minutes earlier were in the uppermost chamber and those from an hour earlier were partly in three deeper chambers; across colonies, seeds from a day earlier were mostly deeper, and from two days earlier deeper still. Foragers were under half the ants in the top 20 cm, so the carriers are another set of workers, "possibly the same workers that relay sand upward". The authors call the whole thing "task-partitioning in a series-parallel organization of work… in which each worker usually completes only part of a multi-step process" (Tschinkel, Rink & Kwapich 2015, read in full).
- Sand goes up the same way: pink sand dug at the bottom reached the surface through "a sequential chain of transport, deposition, and re-transport" (same paper, direct evidence).
- *Atta vollenweideri* (leaf-cutter, laboratory, soil pellets, not food): pellets were "transported sequentially over 2 m", by up to 12 workers in three functional groups: excavators, "several short-distance carriers that dropped the collected pellets after a few centimetres", and long-distance last carriers who reached the final site. The share of long-distance carriers rose from 18 % to 45 % in the first five hours (Pielström & Roces 2013, abstract only; **unverified**).
- Liquid food spreads from foragers through the colony by trophallaxis in a hierarchical network with no closed loops; some inner workers relay it on (Greenwald et al. 2015; `larval-feeding.md`).

**In the game:** a load travels as several short carries by different ants, so no single ant has to know where the store or the brood is, or walk the whole way. The cue for each ant is local: a load lying where it walks, and the brood odour (`brood-odour.md`, built, off). Legs and loads are **design** numbers.

## A pile, not a signal, tells a carrier where to put a load down

- Tschinkel et al.'s account of how seeds end up deep is a **hypothesis, not a finding**: seeds "act as stigmergic cues for seed-bearing transporters to drop their seeds", as necrophoric workers drop theirs on piles of dead workers (Howard & Tschinkel 1976, as cited; **unverified**). "Individual pellets or seeds may stimulate carrying, but piles of each may stimulate deposition, with considerable leakage along the way."
- Pellets that pile up between legs also steer where excavators start digging (Pielström & Roces 2013, abstract; **unverified**).
- Which way a carrier heads is not measured. Seeds go down, which is toward the seed chambers; the paper does not say what tells a carrier "down".

**In the game:** a carrier drops its load after a short leg, or on meeting a pile of loads. An idle worker that touches a lying load picks it up with some chance. The direction is the brood odour's gradient (design: the paper gives none; the game's underground ants already sense gravity and brood, `nest-and-home.md`).

## What was not found

- How larvae are fed from the seed chambers in harvester ants: the paper follows seeds to the seed chambers and stops. The store-to-brood leg is the one the game needs, and no source read here covers it.
- How many ants carry a food load, how long a leg is, or what share of workers do it. The 2 m and 12 workers are for soil pellets of a leaf-cutter in a laboratory.
- Whether carriers pick a lying load up on touch, or look for it. The hypothesis above is untested.
- A rate for seed transport. The paper reports only which chambers seeds had reached after 15 minutes, an hour and a day, in a few colonies, not how many seeds moved or how fast an ant carries.

## The mechanic

All of it is body and steering rules: **no new situation field, so no Jev cost.** Cheapest first.

- **M0, the assay (lands first, no behaviour change).** The trace above as a probe on the `larvae` assay (`experiment.ts`): carries started, carries delivered and food owed per minute, and ants within reach of a stocked chamber. Target (`ja-rvli`): no seed above 8 larvae waiting over 120 s, nobody starved; and here, carries started at least the food owed.
- **M1, an ablation, not the mechanic.** The distance from a stocked chamber within which an idle ant can start a carry is today's two cells (`nestWork.ts`, `port`). A setting `portReach` (0 = today) widens it. If a wider reach alone ends `ja-rvli`, relay isn't needed and the owner hears that before M2 is built. If not, M2 is the fix.
- **M2, floor loads (design).**
  - **Cue:** a load lying in the cell an ant stands in (touch), the brood odour gradient, the distance it has walked carrying.
  - **Response:** a porter puts its load on the floor after `LEG` cells, or on touching a pile of two or more. An idle worker standing on a load picks it up with probability `PICK_LOAD` a second and carries it on, climbing the brood odour. In a chamber that holds brood, a carrier puts its load into the chamber's stock, where the nurses already feed from (`nestLife`).
  - **Accounting:** a load is the colony's food (like `inJaws`, `inCrops`): counted in `spare()` and the queen's egg gate.
  - **Off:** `loadLeg` 0 is main bit for bit.
  - **Retires, later:** the chamber table (`wanted`) as the destination of relay carriers; the build strikes or narrows the `ja-k4k.4` gap row when it does.
- **M3, hand-over by contact (an alternative, not recommended first).** A carrier meeting an idle worker passes its load on, like crops' passing (`larval-feeding.md`). No new state and no floor loads. It leaves the pick-up at the store as it is, which is the limit above, so it adds legs but not carries started.

## Play

- **What the player sees:** food moving ant to ant down the tunnels in short hauls, loads lying briefly on tunnel floors, larvae growing on time without a long queue at one store. The Learn drawer can say: "no ant walks a load the whole way; each carries it a short stretch and the next picks it up".
- **Choices it makes matter:** the fungus. Floor loads and hand-offs are contact surfaces; a spore on a load could spread to every ant that carries it. Any fungus lever on loads is later work.
- **Progression:** unchanged early. It matters in long games, with a remote store and many brood.
- **Cost:** none in Jev. CPU: a per-cell count of lying loads, like the per-cell grids of `youngs` and `broods`.
- **Risks to play:**
  - Loads left on the floor and never picked up: food lost to the economy. The guard is food stored, and loads counted as the colony's.
  - A jam, with every idle ant chasing loads and nobody foraging. The guards are food brought home per hour and one-world A5.
  - Invisible: loads are small. A tint on a carrying ant and the Learn entry show them.

## Open questions

- **The owner's calls:**
  - D1: do the M1 ablation first (recommended), or build M2 straight away?
  - D2: M2 (floor loads) rather than M3 (hand-over by contact)?
  - D3: M2's direction cue is the brood odour, built but off (`ja-k4k.15`). Turning it on is its own gate, with its own assays.
- **Still to measure:** whether `portReach` alone ends `ja-rvli`; `LEG` and `PICK_LOAD` (design, no measured values).
- **Still to read:** how harvesters feed larvae from the seed chambers; Pielström & Roces 2013 in full; Howard & Tschinkel 1976.

## Sources

- Tschinkel WR, Rink WJ, Kwapich CL (2015). Sequential subterranean transport of excavated sand and foraged seeds in nests of the harvester ant, *Pogonomyrmex badius*. *PLoS ONE* 10:e0139922. [PMC4624972](https://pmc.ncbi.nlm.nih.gov/articles/PMC4624972/), [doi:10.1371/journal.pone.0139922](https://doi.org/10.1371/journal.pone.0139922)
- Pielström S, Roces F (2013). Sequential soil transport and its influence on the spatial organisation of collective digging in leaf-cutting ants. *PLoS ONE* 8:e57040. [PMC3574050](https://pmc.ncbi.nlm.nih.gov/articles/PMC3574050/), [doi:10.1371/journal.pone.0057040](https://doi.org/10.1371/journal.pone.0057040) (abstract only; **unverified**)
- Greenwald E, Segre E, Feinerman O (2015). Ant trophallactic networks: simultaneous measurement of interaction patterns and food dissemination. *Sci Rep* 5:12496. [PMC4519732](https://pmc.ncbi.nlm.nih.gov/articles/PMC4519732/)
- Howard DR, Tschinkel WR (1976). Aspects of necrophoric behavior in the red imported fire ant, *Solenopsis invicta*. *Behaviour* 56:157–180. (as cited by Tschinkel et al. 2015; not fetched; **unverified**)
