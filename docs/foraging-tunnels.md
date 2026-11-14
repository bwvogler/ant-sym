# Foraging tunnels: ants that dig to reach food, and what tells them where

*Research note for bead `ja-p0k` (PRD §68). Written 2026-11-14, against code at `158d4b5`. Read in full: Tschinkel 2011 (PMC, about 60 % verbatim, the rest as a summary, marked) and Ni et al. 2025 (PMC, in full). Not reached (network allowlist or paywall): Markin, O'Neal & Dillier 1975 (JSTOR), Bernklau et al. 2005 (OUP), the termite tunnelling papers and the leaf-cutting ant CO₂ digging paper; their numbers come from citing papers or search abstracts and are marked **unverified**.*

In the side view about three quarters of the map's food lies in buried pockets (20,760 of 27,840 on seed 1, PRD §41). Over an hour, one colony of 600 on the app's map takes about 560 of it on seed 1 and none on seed 2 (`scripts/lab/economy-bench.mjs 1|2 3600 600 1 900`, main at `158d4b5`), while the ground's piles fall from about 4,400 to 2,600. Only middle-aged ants dig, and a nest with room digs 15 % as often (`ROOMY_DIG`, gated by `crowded()`, a colony-wide count). So tunnels are dug for room and stop where the nest stops needing it. Food is sensed only through open ground (ja-juiu, ja-uvhw), so a pocket a few cells into the soil is invisible. The question: **do ants dig to reach food, and if so, what tells a digger which way?**

## Fire ants keep a standing network of foraging tunnels under their territory, not tunnels dug toward food

- *Solenopsis invicta* colonies dig foraging tunnels that run out from the mound just under the surface. Tschinkel cast the tunnels of three colonies in zinc: "Tunnels were mostly 1 to 3 cm below the ground surface, with openings to the surface at intervals"; "All casts had openings to the surface at intervals of 50 to 100 cm"; the longest tunnel in one cast was "over 15 m". Tunnel cross-section falls with distance from the nest. Sources: Tschinkel 2011 (*J Insect Sci* 11:26), Results, Figure 17 (read in full).
- The tunnels were first mapped by Markin, O'Neal & Dillier (1975), with molten lead (as reported by Tschinkel 2011). A later paper cites Markin for tunnels "3–10 cm deep" with openings to the ground (Ni et al. 2025, *Insects* 16:835, Discussion); that conflicts with Tschinkel's 1–3 cm. **Unverified** (Markin not read). A review figure of "more than 50 m" of tunnels per colony appears only in search results. **Unverified.**
- The tunnels hold waiting workers, not searching ones. "About one-third of the recruits wait near openings in the foraging tunnels"; scouts search on the surface and recruit from the nearest opening, so bait collection did not slow with distance from the nest up to 13 m (Tschinkel 2011, abstract and Figure 13). Foragers "lack route-faithfulness": one marked at one point was recaptured anywhere in the territory a day later (abstract).
- Nothing shows the tunnels are dug *toward* food, or grow with hunger or season. Neither paper tests it. In Ni et al. 2025 (58 nests), foraging-tunnel length correlated with soil type (ρ = −0.339, p = 0.009: longer in loam or sandy loam), not with nest size (ρ = −0.049), and only weakly with vegetation cover (ρ = 0.242, p = 0.068).
- Tschinkel reportedly argues tunnel geometry "is not likely to be a directional cue" (from the part of the paper read only as a summary). **Unverified.**

**In the game:** a colony's way to the soil's food is a **network**: tunnels running out from the nest under the ground, dug whether or not the nest needs room, with food found when a tunnel opens into it (contact, and the open-ground sensing already built). The cue that starts a forager digging outward is **design**: the papers show the network exists and is used for waiting and walking, not what makes a worker extend it. The sensed candidates already in the table are the ant's own unsuccessful search (fatigue, [tiredness](tiredness.md)) and hunger felt by touch (trophallaxis row, ja-xu6.1). Fire ants dig shallow; the game's pockets lie at least 4 rows down, centred at least 10, so a network only 1–3 rows deep would pass over them. Depth is **design**.

## Termites tunnel to find food; whether a gradient through the soil steers them is disputed

- Subterranean termites (*Reticulitermes*, *Coptotermes*) find wood by tunnelling; their networks are described statistically (fractal, branching) rather than as aimed. **Unverified** (search abstracts only: Campora & Grace 2001; the fractal-analysis papers).
- For *Coptotermes formosanus*, Hedlund & Henderson (1999) found food size changed tunnel volume and length, but Campora & Grace (2001) found food presence did not change where tunnels went. **Unverified** (abstracts).
- *Reticulitermes grassei* in 2-D sand arenas: tunnels "were not discernibly orientated" toward the food, which the authors read as wood volatiles not being the guide. **Unverified** (abstract).
- Three *Reticulitermes* species were drawn to CO₂ at 5–50 mmol/mol in laboratory bioassays, and in soil chambers more termites foraged where CO₂-releasing formulations lay; in the field, CO₂ bait stations drew *R. tibialis* away from fence posts. Bernklau, Fromm, Judd & Bjostad 2005 (*J Econ Entomol* 98:476). **Unverified** (abstract and press summary; whether termites *tunnel toward* CO₂ through soil, and over what distance, was not found).
- Leaf-cutting ants use CO₂ as a spatial cue when choosing where to dig fungus chambers; soil transport rose with CO₂ up to 7 % and fell at 11%. **Unverified** (a search abstract; authors and year not retrieved).

**In the game:** a gradient through the soil from buried food is the only biology that would *steer* a dig at a pocket, and it is from termites, disputed, and nowhere shown for ants foraging. It would be a **new sense** ("food odour through soil", **design** for ants): a short-range version of the food plume ([desert-ant](desert-ant.md), `plume.ts`), spreading through soil instead of open air, read by a digger at its face to choose which way to dig. It is the second option below, behind the network, and needs the owner's call.

## What was not found

- No measurement of ants digging toward buried food, or of ants detecting food through soil at any distance.
- No measurement of what makes a worker start or extend a foraging tunnel (hunger, failed search, season, colony size).
- No depth distribution of fire-ant foraging tunnels beyond "1–3 cm" (casts) and the cited "3–10 cm".
- Full text of Markin et al. 1975, Bernklau et al. 2005, Campora & Grace 2001, Hedlund & Henderson 1999 (out of reach this session).

## The mechanic

Cheapest first. Each is a setting whose 0 is main bit for bit; all are steering or body rules, no new situation field, so **no Jev cost**.

1. **Foraging tunnels (the network).** A forager whose search outside has failed (fatigue past patience, sensed), or that feels the colony's hunger (felt need ≥ its threshold, sensed), digs on at a tunnel's dead end in its own nest instead of turning back, whatever the nest's room: it is exempt from the `ROOMY_DIG` damping and from the middle-aged-only rule for that dig. It digs outward and level or slightly down (gravity is sensed), away from the nest (its home vector, sensed). Food is found by contact: once a tunnel opens a pocket, the open-ground food sensing (ja-juiu), trails and STORE_AFTER take it home. Local rule: the above, under a new setting. Retires nothing; adds no global read (it does not use `crowded()`).
2. **Food smelt through a little soil (design, owner's call).** Buried food gives off an odour that spreads a few cells through soil (a soil plume, range about 3 cells, fading faster than in air), read only by a digger at its face: it digs toward the stronger side. A new row in the sense table, marked design.
3. **Only if 1 and 2 leave the pockets untouched:** deeper or more frequent nest digging. Not proposed now.

**Assay P1 (lands first, no behaviour change):** food taken from below ground over 3,600 s, one colony of 600 on the app's map, seeds 1–10, plus the guards that must not worsen: food home, workers alive at 3,600 s, cells dug and spoil out (a digging runaway would show there), ms per tick. Target: **design** (no literature number): a measurable share of the buried food home within the hour (baseline 2.7 % on seed 1, 0 % on seed 2), chosen by the worst seed and confirmed on 11–20.

## Play

- **What the player sees:** when the ground's piles thin out, the nest grows arms: tunnels running out under the ground, and pockets emptied as they open. Today the side view's tunnels are only the nest; with this, the colony visibly reaches for food. The Learn drawer can say why: foragers who come home empty-handed, or feel the colony hungry, dig.
- **Choices it makes matter:** the fungus's hyphae grow along tunnels (PRD §63.9, ja-2bw.15), so a foraging network is a road for the fungus toward pockets and toward other colonies; and food in the soil keeps a colony alive in long games, which is what the player's fungus lives on. A colony's digging is its nature, not a new lever for the player.
- **Progression:** colonies start on the ground's piles as now; the network only starts when foraging fails, so the early game is unchanged and long games no longer depend only on regrowth.
- **Cost:** none in Jev (steering and body rules). CPU: more dug cells (the map's layers grow), measured by P1's ms per tick.
- **Risks to play:** a runaway (every tired forager digging, the mound swelling, ticks slowing), tunnels meeting the rival's and opening an underground front (ja-war's fights moved underground), or colonies so fed they reach their cap and raid sooner (ja-ccej's mechanism). P1's guards and the side-view game assay (fight losses) would show each.

## Open questions

- Owner: build option 1 alone first, or 1 and 2 together? Option 2 admits a new, design-only sense.
- Owner: who digs foraging tunnels: the old foragers (in fire ants, "as recruits age, they become scouts searching for food on the surface", Tschinkel 2011), or the middle-aged diggers when hungry?
- How deep and how far: a network level with the pockets' depth, or sloping down? Measured by P1 per setting.
- Whether two colonies' networks meeting needs its own handling (ja-war).

## Sources

- Tschinkel WR (2011). The organization of foraging in the fire ant, *Solenopsis invicta*. *J Insect Sci* 11:26. [doi:10.1673/031.011.0126](https://doi.org/10.1673/031.011.0126), [PMC3391925](https://pmc.ncbi.nlm.nih.gov/articles/PMC3391925/)
- Ni M, Lu J, Yang X, Zheng Y, Wang Y, Jiang M (2025). Underground inter-nest tunnels of red imported fire ants, *Solenopsis invicta*: physical features and associations with colony and environmental factors. *Insects* 16(8):835. [doi:10.3390/insects16080835](https://doi.org/10.3390/insects16080835), [PMC12387039](https://pmc.ncbi.nlm.nih.gov/articles/PMC12387039/)
- Markin GP, O'Neal J, Dillier J (1975). Foraging tunnels of the red imported fire ant, *Solenopsis invicta*. *J Kans Entomol Soc* 48:83–89. [JSTOR 25082717](https://www.jstor.org/stable/25082717) (not read)
- Bernklau EJ, Fromm EA, Judd TM, Bjostad LB (2005). Attraction of subterranean termites (Isoptera) to carbon dioxide. *J Econ Entomol* 98(2):476–484. [doi:10.1093/jee/98.2.476](https://doi.org/10.1093/jee/98.2.476) (abstract only)
- Campora CE, Grace JK (2001). Tunnel orientation and search pattern sequence of the Formosan subterranean termite. *J Econ Entomol* 94:1193–1199. (from memory; not fetched: the finding is from a search abstract, the title and pages are recalled)
- Hedlund JC, Henderson G (1999). Effect of available food size on search tunnel formation by the Formosan subterranean termite. *J Econ Entomol* 92:610–616. (from memory; not fetched: the finding is from a citing abstract, the title and pages are recalled)
