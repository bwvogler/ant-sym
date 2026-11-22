# Nurse crowding: what limits how many young workers pile onto the brood

*Research note for `ja-k4k.15.6` (the brood-odour climb's crowd limit, built off) and `ja-k4k.15.7` (the fuller crowding rule and its fungus knobs, not built), PRD §77.3. Written 2026-11-22, against code at `dc6d23d`; extended the same day after three further passes (physics, nurse regulation, simulation rules). Full text was read where PMC served it (E-utilities `db=pmc`; Europe PMC's `fullTextXML` mostly timed out). Aguilar 2018, Gravish 2015, Burd 2002, Mersch 2013, Robinson 2009, Sendova-Franks 1995 and the Cassill & Tschinkel papers were abstract-only, snippets or not reached, so their numbers are marked **unverified**. The simulation-rules pass read nothing in full text: its claims are marked from memory.*

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

## How densely real ants pack, and what that says about a cell

- **Fire ant rafts:** planar packing of 34 ± 2 ants/cm² (N = 4 rafts), ant mass 1.3 mg, rafts about 8 mm thick, about 40% of ants in the base layer (Mlot et al. 2011, *PNAS*, full text). At a body length of about 3.5 mm (Gravish et al. 2013) that is roughly 0.24 body-length² per ant (**my conversion**, not the paper's). A voluntary, layered cluster: the extreme upper bound.
- ***Linepithema humile*, bridges:** colonies of 400–25,600 ants, 170 runs, densities up to about 18 ants/cm². Flow rises linearly below about 8 ants/cm², then saturates without declining; it showed no decline even at 80% bridge occupancy, where pedestrians and cars slow above about 40%. Ants avoid entering overcrowded trails, and the two streams intermingle above a critical density (Poissonnier et al. 2019, *eLife*, full text).
- ***Camponotus fellah*, nest area per ant:** about 11 per ant (units not extracted; the paper's brief says cm²), roughly constant across group sizes within an age group; the target area falls linearly with age (y = −0.032·age + 11.22), so older ants accept denser packing; excavation stops when area per ant reaches the target (Rajendran et al. 2026, *eLife*, full text).
- **Not found:** *Temnothorax* chamber densities (Franks; Cao & Dornhaus 2008 reports only a 14.2% higher metabolic rate in restricted nests), *Lasius* nest densities, Foster 2014, Anderson/Theraulaz 2002.

**In the game:** the nest's own sizing, `FLOOR_PER_ANT` 0.1 (colony counts as crowded below 0.1 floor cells an ant, about 10 an ant a cell), is far denser than any resting figure found (about 11 cm² an ant in *C. fellah*; the units differ, so no cell equivalent is claimed) and denser than a body-length cell can hold (about 2–3 ants by footprint, **my estimate**). A hard cap of 6 a cell would need about 1.7 times the chamber floor. Packing depends on body size, surface against 3D cluster, and age: one number cannot stand for it.

## Ants do not push in corridors; they stop, slow, retreat and idle

- ***Solenopsis invicta*, tunnels:** incipient nest tunnels are 1.06 ± 0.23 body lengths wide (L = 3.5 ± 0.5 mm), so a tunnel is one ant wide; ants run at over 9 L/s even there (Gravish et al. 2013, *PNAS*, full text). Jams come from two causes, bodies that cannot interpenetrate and a time delay from antennation (about 0.45 s a stop, quoted in Poissonnier from Gravish 2015); they appear only above a critical density, and their relaxation depends on tunnel diameter (Gravish et al. 2015, *Soft Matter*, abstract only, **unverified**).
- ***S. invicta*, digging in narrow tunnels:** individual idleness reduces how often flow-stopping clogs form, and selective retreat shortens the dissolution of the rare clusters that still form (Aguilar et al. 2018, *Science*, abstract only, **unverified**: no idle fractions read).
- ***L. humile*, bridges:** ants move without overtaking and do not lane-segregate at high density; they slow and avoid time-consuming interactions (Poissonnier et al. 2019).
- **Not found:** direct evidence of bulldozing or climbing over nestmates in nest corridors (ants do walk on each other in rafts and towers); how ants decide to retreat from or wait at a full brood chamber; any priority for food-laden ants.

**In the game:** ants slow and stop; they do not shove. A corridor cell holds about one ant abreast, so capacity belongs to corridors by width, and flow should saturate at a maximum, not collapse. The two cheap local responses with a source are not entering a dense cell and retreating from a cluster.

## Nurse numbers: no cap and no leave-when-fed rule was found

- ***Ooceraea biroi*:** NPF raises and AstA lowers brood-care contact, and their brain levels shift with age and hunger. Twelve-day-old ants spent a mean 0.415 of their time touching larvae against 0.194 for 4-month-olds. Each ant–larva pair shows a stay phase and a short-bout phase. Colonies ran at about 1 worker a larva (a lab ratio). The paper has no satiation or cap result (Paul et al. 2026, *Nature*, full text).
- ***S. invicta*:** colony size (100–10,000 workers) and worker:brood ratio (1:1 to 16:1) did not change nurse density on the brood pile, nor the rate or duration of trophallaxis (Cassill & Tschinkel 1999, *Insectes Soc*, **snippet only, unverified**). Starved larvae were fed in proportion to size; larvae were met hundreds of times an hour and fed only tens of times (Cassill & Tschinkel 1995, abstract, **unverified**): contact is not a hunger signal.
- ***S. invicta*, brood presence reverses age polyethism:** foragers revert to nursing and nurses go foraging; larvae have the strongest effect (Starkey et al. 2023, *Sci Rep*, full text).
- **Response thresholds alone do not explain division of labour** in *O. biroi* mixed colonies (Ulrich et al. 2021, *PLoS Biol*, full text).
- **Not found:** larvae per nurse, the nurse fraction of workers, any "nurses disperse once fed" measurement, any per-pile brood cap.

**In the game:** if the 1999 snippet holds, nurse count follows brood-pile area, not colony size, and a local density cue gives that without a count. A satiated larva is still touched, so the cue to leave is the larva's state (it begs only when hungry: already built), not proximity. Excess young ants are not idle: they can take another task.

## What simulations do (from memory; not fetched)

A map of options only, from a pass that fetched nothing: only the DOIs below were checked.
- **Slowing with density** (Burd 2002, Dussutour 2004, Poissonnier 2019): speed falls and flow holds. No hard exclusion.
- **One agent a cell with probabilistic conflict resolution** (Burstedde et al. 2001, a cellular automaton): O(agents) a tick, but it freezes at bottlenecks without friction.
- **Standard remedies for gridlock:** move agents in random order each tick, keep a speed floor so flow never reaches zero, give a refused ant a random sidestep or wait, size a capacity to the corridor's width.
- **Social-force repulsion** is continuous and stiff at high density: a poor fit for a hex grid.

**In the game:** the options a hex-grid ant can use are slowing (with a floor), refusal with a sidestep, and a behaviour switch on the contact count; the hard cap alone is the likeliest to gridlock. Test any rule at 10 times the colony on a fixed map: the per-cell rule hits first.

## A correction: the digging gate reads a head count

An earlier draft of this plan listed "the nest widens chambers when crowded (already built)" as a colony counter to the crowd rule. That counter is a prohibited read: `Colony.crowded()` (`colony.ts`) compares the colony's whole count underground with its total chamber floor, and gates digs in `tunnel.ts` and `move.ts`. It is a known gap (vision.md "Digging gate", bead `ja-k4k.3.1`, found in the 2026-11-14 audit) and it matters here: it decides when a brood chamber grows, and the crowd on seed 1 formed because that chamber stayed small. **`ja-k4k.15.7` is blocked by `ja-k4k.3.1`**; the soft limit (`ja-k4k.15.6`) is not, because it reads only the ant's own cell count. The sensed replacement named in the bead, the nestmates met within reach, is the same `friends` count the crowd rule reads, so one sense can serve both.

## Fungus knobs on crowding (design; `ja-k4k.15.7`, not built)

The owner asked (2026-11-22) for the fungus to have knobs here, as PR #281's ant actions (`get`, `carry`, `drop`, `trail`, `contact`, `leave`; a draft, not on `main`) give it cues, not commands. The split:
1. **Physics, fixed:** bodies limit a cell; speed falls as it fills, with a floor.
2. **Decisions, the ant's:** press on, wait, yield, sidestep, idle: answers in a response lane, with `broodCrowd`'s rule as the local stand-in. Added answers, no new situation field, a brain-version bump (precache re-shipped).
3. **Fungus knobs:** perception, emission, body, spread (below). No player button.
4. **Colony counters:** retreat and idling; digging only once `ja-k4k.3.1` is done.

| Knob | Class (fungus-policy §4) | Effect | Basis |
|---|---|---|---|
| Crowd-feel gain, ×0–3 | A, perception | down: hosts press into crowds (piles, jams, hot spots); up: they spread out (dilution) | pathogen exposure changes behaviour of exposed ants and nestmates, reinforcing transmission-inhibitory properties of the contact network (Stroeymeyt et al. 2018, *Lasius niger*, abstract read; the nurse/forager segregation is from memory) |
| Yield threshold | A, like A7 | the contact count at which an ant steps back; may fall with age | Aguilar 2018 (abstract); Rajendran 2026 (target area falls with age) |
| Contact pause | D, body | longer antennation stops: more transmission, less throughput | Gravish 2015 (abstract) |
| Idle fraction | D, body | up: fewer clogs; down: jams | Aguilar 2018 (abstract) |
| Gather scent | C, emission | a faint lure drawing hosts to a cell, as A5's graded alarm | **design**; faint alarm attracts in *Pogonomyrmex* (catalogue) |
| Mycelium CO₂ | C, emission | nurses drawn to the mycelium as to brood: the fungus steers where crowds (and brood piles) form | leaf-cutting ants prefer elevated CO₂ to tend brood (Römer et al. 2018, abstract read); **design** that a fungus does it |
| Hyphal narrowing | world | hyphae thickening across a corridor cut its capacity (PR #312's thicken answer) | **design** |

Crowding is where a knob meets spread: S1 is contact transmission, so a crowd is where the fungus spreads fastest. A `plug` answer (a worker blocking a tunnel with its body, as door ants do: **from memory; not fetched**) could also give the colony a defence; raid defence is weak (A13 4/20 under directed combat, PR #281's notes).

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
- A source showing a fungus changing how ants crowd, beyond the pathogen-exposure network changes of Stroeymeyt 2018 (and the odour effects in fungus-policy §4).
- The full texts of Gravish 2015, Aguilar 2018, Burd 2002 and Cassill & Tschinkel 1999.

## The mechanic

**Built, off (`ja-k4k.15.6`, `broodCrowd`, commit `dc6d23d`).** A young ant climbing the brood odour stops climbing and wanders (noise only) when `broodCrowd` or more other nestmates share its cell. The count is `col.friends` at its own cell, less itself. 0 = off, bit for bit; goldens hold. The sense row is the existing "Encounter rate: local crowding" (contact); no new situation field, so no Jev cost. A unit test (`zoning.test.ts`) holds three cases: 6 others in the cell with the limit at 6, no climb; 5 others, still climbs; limit 0, climbs at any count.

| Cue (sensed) | Sense row | Response | Local rule | Off |
|---|---|---|---|---|
| nestmates in its own cell (`col.friends`, contact) | Encounter rate: local crowding (exists) | steering, a young ant climbing the brood odour | stops climbing at `broodCrowd` others, wanders on | `broodCrowd` 0: no limit |

**The soft form of a per-cell cap.** It limits the heap on the brood to about `broodCrowd` ants a cell without refusing any step, so nothing can queue behind a full cell. It does not slow or stop ants anywhere but at the brood climb.

**The fuller rule (`ja-k4k.15.7`, not built):** capacity and slowing by contact count for every ant, a refusal with a sidestep above a limit, moves in random order, then the knobs above. See the two sections before Counter-evidence.

**For the model:** a young ant has no head count. It feels the bodies against it, and a packed cell leaves it nowhere to stand.

## Play

- **See:** the youngest ants sit on the brood in a heap of a few cells' worth, not in a plug that fills the chamber mouth and the corridor behind it. Foragers carrying food reach the stores instead of standing in a jam; the Learn "Nurses" entry can say that nurses crowd the brood but bodies limit how many.
- **Choose:** nothing new. This keeps the brood-odour climb from becoming a trap; it is part of removing a cheat.
- **Counterplay and progression:** unchanged. The fungus has no lever on it.
- **Cost:** no Jev cost; a cached game spends nothing.
- **Risks:**
  - Too low a threshold drives the young off the brood and the nurse-zone margin falls back to main's (8/20, −0.38): measured by the `nurseZone` assay.
  - It fixes seed 1 but jams recur elsewhere at another rate: measured by `game1` over seeds 1–20, `maxHeld` and `maxPorting`. Measured (assays run 45059781592, climb rate 1, channel 0.03/0.5): limit 3 gives game1 13/20 with no seed over 4 held or 2 porting; limit 6 leaves one seed at 52 porting.
  - The economy shifts: `larvae` over 20 seeds and `economy.test`.
- **Owner decisions needed:** the crowd response as **design**, since no source shows nurses leaving a crowd (listed below).

## Open questions

- ~~Whether to accept a design limit with no direct source for nurses leaving a crowd, or to bound the heap physically.~~ Owner, 2026-11-22: build the soft form (`broodCrowd`) for testing. A physical cap was weighed and set aside: the nest is sized for about 10 ants a floor cell, and a refused step needs somewhere to go. The graded rule and the fungus knobs are `ja-k4k.15.7`.
- ~~Whether the knobs sit under the existing reach groups (the player spends mutations to widen how far a group reaches).~~ Owner, 2026-11-22: yes.
- Whether to turn the climb on now with `broodCrowd` 3, or hold until the physics step exists (owner).
- The threshold: 3 beats 6 by the worst seed on seeds 1–20 (not yet confirmed on a second set); tuned against `nurseZone` and `game1`, not measured.
- Whether the same jam appears in other settings (rate 0.3 had 42 porting on one seed: `ja-097s`-like).
- Whether to read the full texts of Stroeymeyt 2018, Gravish 2015, Aguilar 2018, Robinson 2009 and Sendova-Franks 1995 before building on them.

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
- Mlot NJ, Tovey CA, Hu DL (2011). Fire ants self-assemble into waterproof rafts to survive floods. *PNAS* 108:7669–7673. [doi:10.1073/pnas.1016658108](https://doi.org/10.1073/pnas.1016658108)
- Gravish N, Monaenkova D, Goodisman MAD, Goldman DI (2013). Climbing, falling, and jamming during ant locomotion in confined environments. *PNAS* 110:9746–9751. [doi:10.1073/pnas.1302428110](https://doi.org/10.1073/pnas.1302428110)
- Gravish N, Gold G, Zangwill A, Goodisman MAD, Goldman DI (2015). Glass-like dynamics in confined and congested ant traffic. *Soft Matter* 11:6552–6561. [doi:10.1039/c5sm00693g](https://doi.org/10.1039/c5sm00693g)
- Paul, Kay et al. (2026). Ancient feeding-related neuropeptides regulate alloparenting in ants. *Nature* 656:948. [doi:10.1038/s41586-026-10747-6](https://doi.org/10.1038/s41586-026-10747-6)
- Starkey, Tamborindeguy et al. (2023). Family before work: task reversion in workers of the red imported fire ant, *Solenopsis invicta*. *Sci Rep*. [doi:10.1038/s41598-023-29246-z](https://doi.org/10.1038/s41598-023-29246-z)
- Ulrich, Kawakatsu et al. (2021). Response thresholds alone cannot explain empirical patterns of division of labor in social insects. *PLoS Biol* 19:e3001269. [doi:10.1371/journal.pbio.3001269](https://doi.org/10.1371/journal.pbio.3001269)
- Cassill DL, Tschinkel WR (1999). Effects of colony-level attributes on larval feeding in the fire ant, *Solenopsis invicta*. *Insectes Soc* 46:261–266. [doi:10.1007/s000400050144](https://doi.org/10.1007/s000400050144) *(snippet only)*
- Stroeymeyt N, Grasse AV, Crespi A, Mersch DP, Cremer S, Keller L (2018). Social network plasticity decreases disease transmission in a eusocial insect. *Science* 362:941–945. [doi:10.1126/science.aat4793](https://doi.org/10.1126/science.aat4793)
- Römer D, Bollazzi M, Roces F (2018). Carbon dioxide sensing in the social context: leaf-cutting ants prefer elevated CO2 levels to tend their brood. *J Insect Physiol* 108:40–47. [doi:10.1016/j.jinsphys.2018.05.007](https://doi.org/10.1016/j.jinsphys.2018.05.007)
- Burstedde C, Klauck K, Schadschneider A, Zittartz J (2001). Simulation of pedestrian dynamics using a two-dimensional cellular automaton. *Physica A* 295:507–525. [doi:10.1016/s0378-4371(01)00141-8](https://doi.org/10.1016/s0378-4371(01)00141-8)
