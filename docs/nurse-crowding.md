# Nurse crowding: what limits how many young workers pile onto the brood

*Research note for `ja-k4k.15.6` (the brood-odour climb's crowd limit, PRD §77.3). Written 2026-11-22, against code at `2b1c0ab`. One research pass through Europe PMC, E-utilities and Crossref. Full text was read where PMC served it (Europe PMC's `fullTextXML` mostly timed out, so E-utilities `db=pmc` stood in). Aguilar 2018, Mersch 2013, Robinson 2009 and Sendova-Franks 1995 were abstract-only or not reached, so their numbers are marked **unverified**.*

**What the game does today.** With `broodClimb` on, a young ant (band 0) in a chamber climbs the brood odour (`brood-odour.md`, PRD §77.2). On `game1` seed 1 at rate 1 the young gather at the foot of a small brood chamber with no limit: 65 ants within 6 units of (−14, 56) at 300 s, 198 at 400 s, 337 at 500 s (all bands). About 210 of them hold food, old outbound foragers caught in the crowd. Brood falls to 2 (main: 11) and the larder to 448 (main: 865). Rate 2 and the queen's x,y do not do this on that seed. The ants occupy cells without limit: a chamber of a few cells holds hundreds.

**The question:** do real nurses sense crowding at the brood and leave it, and what bounds how many sit there?

## Nurses keep to a zone round the brood, slower and turning sharply inside it

- ***Lasius niger, Leptothorax acervorum, Temnothorax nylanderi*:** of 12,559 tracked workers, in the ants one spatial module "closely followed the border of the brood pile ('nurse' module)", with forager, peripheral and intermediate modules around it. Workers moved slower, were more inactive and turned more sharply inside their own module, and faster with less turning outside it (Richardson et al. 2022, *Nat Commun*, full text). The mechanism is zone fidelity by locomotion, not density: no crowding cue was tested. The figure of 71–80% of workers assigned to a module across species is **unverified** as to its definition.
- ***Leptothorax unifasciatus*:** brood in concentric rings with workers keeping to zones round them (Sendova-Franks & Franks 1995, *Anim Behav*; **from memory; not fetched**, no abstract reached).
- **Limits:** in *Temnothorax albipennis*, which ants tended new brood was not predicted by age, corpulence, spatial location or past activity (Robinson et al. 2009, *Proc R Soc B*, abstract only, **unverified**).

**In the game:** a young ant near the brood is slower and turns about, not a ring that grows. Today the young ant's climb has no stopping point at the peak but the brood itself.

## Encounter rate is a sensed cue that ants act on, but for foragers and for nest space, not for nurses

- ***Pogonomyrmex barbatus*, foragers:** the rate at which outgoing foragers meet returning ones inside the nest tracks the return rate. A forager left 3–8 s after a substantial rise in interactions with returners, and foragers available to leave fell when returns stopped for over 4–5 min (Pinter-Wollman et al. 2013, *Anim Behav*, full text). Contacts carrying forager cuticular hydrocarbon with seed odour drive the decision (Greene et al. 2013, *PLoS ONE*, full text; the contacts-per-time threshold was not extracted, **unverified**).
- ***Camponotus fellah*, digging:** space per ant is the cue: area per ant settled at 11.1 ± 1 and 11.6 ± 1.15 cm² in maturation runs, the target falling with age, and the basal rate was 2.2 ± 0.43 cm²/ant/day (Rajendran et al. 2026, *eLife*, full text). It drives digging, not leaving brood.
- ***T. rugatulus*:** restricted nest space raised colony metabolic rate by 14.2% against large uncrowded nests (Cao & Dornhaus 2008, *Biol Lett*, abstract). A cost of crowding, with no dispersal response shown.

**In the game:** the sense exists already. `col.friends` counts the colony's own ants per cell (felt by contact); the sense table has it as "Encounter rate: local crowding", and the digging gate and the nurses' feeding already read it (`around(col.friends, …)`). It is a read of what the ant touches.

## Ants slow down rather than disperse when it is dense; they are bodies

- ***Atta cephalotes*:** speed falls with concentration like a fluid, and flow peaks at a high concentration with speeds well below free flow (Burd et al. 2002, *Am Nat*, abstract, **unverified**).
- ***Linepithema humile*:** on a bridge, flow showed no decline even at 80% occupancy; ants slowed and avoided time-consuming interactions at high density (Poissonnier et al. 2019, *eLife*, full text).
- ***L. niger*:** at high crowding a second trail formed before flow dropped (Dussutour et al. 2004, *Nature*, full text via arXiv).
- ***Solenopsis invicta*, tunnels:** individual idleness reduced clogs, and selective retreat shortened clog dissolution (Aguilar et al. 2018, *Science*, abstract only, **unverified**: no idle-fraction numbers).

**In the game:** the simulation lets any number of ants stand in a cell, which no real ant can. Real crowding is bounded by bodies and floor area first, and the sensed responses above (slow, turn about, retreat) act at the edge of that bound. A limit in the model stands in for that bound.

## Counter-evidence and cautions

- Brood piles with a nurse module hugging them are normal (Richardson et al. 2022).
- Crowding or partitioning did not change brood rearing in lab *S. invicta* nests; field chambers hold about 200 individuals, half workers and half brood (Cassill, Tschinkel & Vinson 2002, *Insectes Soc*, abstract, **unverified**).
- Ants tolerate very high density on trails (Burd 2002; Poissonnier 2019).
- Dussutour 2004 is a two-branch bridge, not a tunnel, and Dussutour 2005 is on wall-following: neither is tunnel congestion.

## What was not found

- A primary source showing nurses sense local density at the brood and leave it. **The crowd limit below is design.**
- A measured number of nurses per larva or per brood chamber.
- Open full text of Robinson 2009, Sendova-Franks 1995, Pratt 2005, Mersch 2013 and Aguilar 2018.
- A tunnel-congestion paper by Dussutour.
- Larval begging in ants by Schultner; Cassill & Tschinkel's work matching nurse numbers to brood demand beyond the 1995 and 2000 titles.

## The mechanic

| Cue (sensed) | Sense row | Response | Local rule | Off | Retires |
|---|---|---|---|---|---|
| nestmates in and round its own cell (`col.friends`, contact) | Encounter rate: local crowding (exists) | steering, a young ant climbing the brood odour | the climb's gain falls as the nestmates round it rise past a threshold; a crowded young ant wanders instead | `broodCrowd` 0: no limit (the climb as built, bit for bit) | the jam, not a cheat |

1. **The rule.** `broodCrowd` is the count of nestmates round the ant (its cell and the six round it, as `around`) above which it stops climbing; the gain falls linearly from 1 at `broodCrowd / 2` to 0 at `broodCrowd`. 0 = off. A crowded young ant uses the searching branch (noise only), so it spreads and rejoins the odour from outside, as the zoned nurses turn about at their module's edge.
2. **What it leaves alone:** the odour field, the fetch branch, the nurses' brood carrying, the feeding rate (which already reads `friends`).
3. **Cost.** Steering only: one grid read per young ant in a chamber. No new situation field, so no Jev cost.

**For the model:** a young ant has no head count. It feels the bodies against it, and a packed chamber leaves it nowhere to step.

## Play

- **See:** the youngest ants sit on the brood in a heap of a few cells' worth, not in a plug that fills the chamber mouth and the corridor behind it. Foragers carrying food reach the stores instead of standing in a jam; the Learn "Nurses" entry can say that nurses crowd the brood but bodies limit how many.
- **Choose:** nothing new. This keeps the brood-odour climb from becoming a trap; it is part of removing a cheat.
- **Counterplay and progression:** unchanged. The fungus has no lever on it.
- **Cost:** no Jev cost; a cached game spends nothing.
- **Risks:**
  - Too low a threshold drives the young off the brood and the nurse-zone margin falls back to main's (8/20, −0.38): measured by the `nurseZone` assay.
  - It fixes seed 1 but jams recur elsewhere at another rate: measured by `game1` over seeds 1–20, `maxHeld` and `maxPorting`.
  - The economy shifts: `larvae` over 20 seeds and `economy.test`.
- **Owner decisions needed:** the crowd response as **design**, since no source shows nurses leaving a crowd (listed below).

## Open questions

- Whether to accept a design limit with no direct source for nurses leaving a crowd (owner), or to bound the heap physically (one ant per cell), a bigger change to movement.
- The threshold and the width of its fall: tuned against `nurseZone` and `game1`, not measured.
- Whether the same jam appears in other settings (rate 0.3 had 42 porting on one seed: `ja-097s`-like).
- Full texts of Robinson 2009 and Sendova-Franks 1995.

## Sources

- Richardson TO, Stroeymeyt N et al. (2022). Two simple movement mechanisms for spatial division of labour in social insects. *Nat Commun* 13:6985. [doi:10.1038/s41467-022-34706-7](https://doi.org/10.1038/s41467-022-34706-7)
- Sendova-Franks AB, Franks NR (1995). Spatial relationships within nests of the ant *Leptothorax unifasciatus* and their implications for the division of labour. *Anim Behav* 50:121–136. [doi:10.1006/anbe.1995.0226](https://doi.org/10.1006/anbe.1995.0226)
- Robinson EJH, Feinerman O, Franks NR (2009). Flexible task allocation and the organization of work in ants. *Proc R Soc B* 276:4373–4380. [doi:10.1098/rspb.2009.1244](https://doi.org/10.1098/rspb.2009.1244)
- Pinter-Wollman N, Bala A, Merrell A, Queirolo J, Stumpe MC, Holmes S, Gordon DM (2013). Harvester ants use interactions to regulate forager activation and availability. *Anim Behav* 86:197–207. [PMC3767282](https://pmc.ncbi.nlm.nih.gov/articles/PMC3767282/)
- Greene MJ, Pinter-Wollman N, Gordon DM (2013). Interactions with combined chemical cues inform harvester ant foragers' decisions to leave the nest in search of food. *PLoS ONE* 8:e52219. [PMC3540075](https://pmc.ncbi.nlm.nih.gov/articles/PMC3540075/)
- Rajendran, Weinberger et al. (2026). Colony demographics shape nest construction in *Camponotus fellah* ants. *eLife*. [doi:10.7554/elife.100706](https://doi.org/10.7554/elife.100706)
- Cao TT, Dornhaus A (2008). Ants under crowded conditions consume more energy. *Biol Lett* 4:613–615. [doi:10.1098/rsbl.2008.0381](https://doi.org/10.1098/rsbl.2008.0381)
- Burd M, Archer D, Aranwela N, Stradling DJ (2002). Traffic dynamics of the leaf-cutting ant, *Atta cephalotes*. *Am Nat* 159:283–293. [doi:10.1086/338541](https://doi.org/10.1086/338541)
- Poissonnier L-A, Motsch S, Gautrais J, Buhl J, Dussutour A (2019). Experimental investigation of ant traffic under crowded conditions. *eLife* 8:e48945. [doi:10.7554/eLife.48945](https://doi.org/10.7554/eLife.48945)
- Dussutour A, Fourcassié V, Helbing D, Deneubourg J-L (2004). Optimal traffic organization in ants under crowded conditions. *Nature* 428:70–73. [doi:10.1038/nature02345](https://doi.org/10.1038/nature02345)
- Aguilar J et al. (2018). Collective clog control: optimizing traffic flow in confined biological and robophysical excavation. *Science* 361:672–677. [doi:10.1126/science.aan3891](https://doi.org/10.1126/science.aan3891)
- Cassill DL, Tschinkel WR, Vinson SB (2002). Nest complexity, group size and brood rearing in the fire ant, *Solenopsis invicta*. *Insectes Soc* 49:158–163. [doi:10.1007/s00040-002-8296-9](https://doi.org/10.1007/s00040-002-8296-9)
