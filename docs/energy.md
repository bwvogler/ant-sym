# Where the fungus's energy to grow comes from

*Research + design (not built, `ja-a2no`, PRD §91). The question: the game's mycelium makes mass from no source, a logistic curve that settles at a capacity. What does a fungus like this actually grow on, and what should the game's fungus grow on? Searched 2026-11-25 through Europe PMC, PubMed, Crossref and Semantic Scholar; every DOI below was checked against Crossref. **FT** is full text read; **ABS** is abstract only, so its numbers are **unverified**; **NR** is not read (cited from another paper or from memory). Europe PMC returned 502 for part of the session, so some papers could only be read as abstracts.*

## TL;DR

- **Outside a host it mostly waits.** Bulk-soil *Metarhizium* fell from 10⁵ to 10³ propagules per gram over months and stayed at 10⁵ only near roots; no source measured free mycelium in bulk soil (§1). So a mycelium that grows across bare ground from nothing has no support.
- **Its carbon comes from living roots and from cadavers.** Plant carbon reached the fungus on roots over one to three weeks, and more when an insect was present; the carbon in soil is scarce (§2). A dead insect is the one rich resource, and a finite, small one (§5).
- **Nutrient releases germination, and then competitors matter.** Conidia germinated 8, 28, 85 and 100 % at 0, 0.01, 0.1 and 1 mg/mL of root exudate (§3).
- **Growth from carbon is a yield below one, and starvation recycles.** About 0.3 to 0.7 of the carbon taken up becomes mycelium; outgrowth depends on the share of a resource used; a large resource holds the mycelium; old hyphae are recycled under starvation (§4).
- **Not found:** a measured hyphal growth rate or mycelial mass for *Metarhizium* or *Beauveria* in soil or litter; the conidia or biomass one ant cadaver yields; any ant-specific evidence that growth in a host is nutrient-limited. Any growth number in the game is **design**.
- **The game today** gives mass from no source (`Evolution.grow`), and a corpse adds one lump (§6). Owner, 2026-11-25: the fungus should be hungry, with growth that must come from a source (§7).

## 1. Outside a host it mostly waits as spores

- *Metarhizium anisopliae* (a marked strain) fell from 10⁵ propagules per gram (0–2 cm) to 10³ per gram over several months in bulk soil; near cabbage roots it stayed at 10⁵. The counts are propagules (colonies grown on plates), not mycelium. The authors say it "may not just persist in the soil in a dormant state" but measured no mycelium (Hu & St. Leger 2002, *Appl Environ Microbiol* 68:6383, **FT**).
- "The ability of *Metarhizium* … to survive in bulk soil in the absence of a suitable host remains widely unknown." A theory paper proposes "sleeper" strains (mostly spores, waiting for a host) and "creeper" strains (mostly mycelium, moving through soil). The creeper is a model, not a measurement (Angelone et al. 2018, *Insects* 9:104, **FT**).
- Soil loads are typically 10² to 10⁴ propagules per gram (cited from Jaronski by Chertkova et al. 2023, **NR** for Jaronski).

**In the game:** a mycelium on bare ground with nothing to eat is not what the biology shows. It would stop, or wait.

## 2. Its carbon comes from roots and cadavers

- *M. robertsii* fixes no CO₂ in soil. Plants given ¹³CO₂ passed ¹³C into the fungus's trehalose and chitin on roots over 7, 14 and 21 days, more when a wax-moth larva was present. The paper gives relative intensities only, no biomass or flux, and says easily used carbon is scarce in soil (Behie et al. 2017, *Nat Commun* 8:14245, **FT**). Greenhouse microcosms, one species.
- Sucrose and raffinose sugars in root exudate support growth; mutants without the sugar transporter grew poorly in exudate and were less rhizosphere competent, and the transporter was expressed near roots "but not in surrounding bulk soil" (Fang & St. Leger 2010, *Plant Physiol* 154:1549, **FT**). An extracellular invertase lets *M. robertsii* grow on sucrose and root exudate; a scarab specialist without it is not rhizosphere competent (Liao et al. 2013, *PLoS ONE* 8:e78118, **FT** for the abstract and introduction).
- Nitrogen moves the other way: ¹⁵N from injected insects reached bean and switchgrass through *Metarhizium* (Behie, Zelisko & Bidochka 2012, *Science* 336:1576, **ABS**; the abstract gives no percentage).
- A strain with rhizosphere competence outlived one without in grassland soil (Liao et al. 2014, *Appl Microbiol Biotechnol* 98:7089, **NR**, cited by St. Leger & Wang 2020).

**In the game:** growth has three real sources. A cadaver (§5), a living plant root (the game has no plants), and a partner's carbon (the lichen's alga, `lichen.md` §3). A bare patch of soil is not a source.

## 3. Nutrient releases germination, and then competition decides

- In root exudate as the only food, *M. robertsii* conidia germinated 8, 28, 85 and 100 % in 20 h at 0, 0.01, 0.1 and 1 mg/mL. About 0.03 mg/mL is the concentration within millimetres of a root (Wenzel 2001, **NR**) (Fang & St. Leger 2010, Table I, **FT**).
- Soil fungistasis tracked soil bacteria (mainly *Bacillus* and *Streptomyces*): kitchen-garden soils were more fungistatic than conventional fields (Chertkova et al. 2023, *Microorganisms* 11:943, **FT**). The same paper cites Borisov (**NR**) for chitin, glucose, peptone or yeast extract added to soil releasing germination and reducing infection by *Beauveria*, because the germinated conidia then die or are outcompeted.

**Contradicts or limits:** adding carbon does not simply make the fungus grow. Where it germinates with no host or root nearby, it loses.

## 4. What a mycelium does with carbon

No source found gives a yield or a growth rate for an insect-pathogenic fungus in soil. The stand-ins are *Aspergillus*, cord-forming wood decayers (*Phanerochaete velutina*) and ectomycorrhizal mycelium, and they are marked as stand-ins.

- **Yield.** *A. niger* on glucose, unlimited growth: 0.68 carbon moles of biomass per carbon mole of glucose, so about a third is respired (Lameiras et al. 2018, *Bioprocess Biosyst Eng* 41:157, **FT**); on arabinose 0.47. Soil microbial communities do worse: the recommended carbon-use efficiency is about 0.3, falling as nutrients run short (Sinsabaugh et al. 2013, *Ecol Lett* 16:930, **ABS**).
- **Outgrowth follows the share of a resource used, not the absolute carbon.** *P. velutina* on 0.5, 1 and 2 cm³ pine blocks: in soil the small block lost 20 % of its mass against about 12 % for the larger, and put out the most hyphae; the slope of coverage on percent mass lost was the same for all sizes (Fukasawa & Kaga 2020, *Sci Rep* 10:21936, **FT**).
- **A big resource holds the mycelium.** With 16 and 36 cm³ baits the inoculum rarely regrew when moved to fresh soil, and mycelium on soil not joined to the bait often died back (Fukasawa, Savoury & Boddy 2020, *ISME J* 14:380, **FT**; the dieback is from supplementary figures not read).
- **A new resource polarises growth.** *P. velutina* given cellulose grew toward it, "often at the expense of growth elsewhere" (Tlalka et al. 2008, *Fungal Genet Biol* 45:1111, **ABS**).
- **Starvation recycles old hyphae.** *A. nidulans* under carbon starvation stops making spores; autolysis is regulated, dead hyphae can be kept so survivors absorb material from them, and one use is nutrients for sporulation when nothing else is available (Emri et al. 2004, *Folia Microbiol* 49:277; Emri et al. 2008, *Appl Biochem Biotechnol* 151:211; both **ABS**).
- **Reserves run out.** Wood-block inocula held 98 days without new resource had 3 of 10 and 4 of 10 (two species) regrow only from the new bait; baited at day 14, all regrew. The authors read this as exhaustion; it is not a measured carbon budget (Fukasawa & Kaga 2021, *J Fungi* 7:654, **FT**).
- **A standing mycelium is a small pool with fast turnover.** ECM mycelium on pine: 50 to 112 kg/ha standing, turnover 1 to 7 a year (Hagenbo et al. 2017, *New Phytol* 214:424, **ABS**). Not a saprotroph.

**In the game (design numbers, from stand-ins):** carbon becomes mass at a yield below one (0.3 to 0.7, **design**, lower for poor substrate). Starved hyphae fade and their mass returns to the body (the web's `regress` already does this). A patch with little to take up should explore more than one with a lot.

## 5. A dead ant is a small, finite resource

- **Output is small and nearly flat with dose.** *Metarhizium* on *Acromyrmex echinatior*: sporulating cadavers made only about twice the spores across the whole dose range; the gain per spore applied fell (slope 0.8 against a proportional 1.0), which the authors read as competition for a finite host; some killed ants never sporulated; sporulation was complete in 10 days (Hughes et al. 2004, *BMC Evol Biol* 4:45, **FT**; relative counts only, the absolute counts are in figures not extracted). The "finite pool" reading is theirs, fitted to the data, not a measured nutrient budget.
- **The timeline is short.** *Metarhizium*: blastospores in the host for 1–2 days, a saprophytic phase, outgrowth 1–3 days after death releasing "millions" of conidia (stated in Pull et al. 2018, *eLife* 7:e32073, **FT** for the claim; the originals are **NR**). *Ophiocordyceps*: hyphae 2–3 days after death, then a stalk (Hughes et al. 2011, *BMC Ecol* 11:13, **FT**).
- **Ants erase it.** *Lasius neglectus* groups cut the share of exposed pupae that later sporulated by 65 % in one day and 95 % in five; with no ants 88 % were infected (Pull et al. 2018, **FT**). *Myrmica rubra* with free removal cleared all corpses from the nest in 4 days (Diez et al. 2014, *Biol Lett* 10:20140306, **FT**; not fungus-killed corpses).
- **The fungus takes a slice of a living host.** *Ophiocordyceps* tissue was a median 10 % (4–38 %) of muscle-plus-fungus volume in manipulated *Camponotus castaneus*, against 2 % for *Beauveria* in the same ant; different stages, so not a clean comparison (Fredericksen et al. 2017, *PNAS* 114:12590, **FT**). Many cadavers never fruit: 0 to 33 % by host species in the field (Lin et al. 2020, *Sci Rep* 10:6428, **FT**).
- **Host size shifts the strategy** in caterpillars and flies, not ants: a fast-sporulating strain won in large hosts; a slow one with long foraging hyphae, able to grow on sparse nutrients, kept pace in small hosts (Sheng & St. Leger 2024, *PLoS Pathog* 20:e1012639, **FT**).
- **Body composition.** Adult *Lasius neoniger* workers have C:N 5.0 and larvae 7.2 (Gutiérrez et al. 2020, *Ecol Evol* 10:7901, **FT**); dry mass and lipid are in figures not extracted.

**In the game:** a cadaver is a finite lump of carbon, a few hyphal cells' worth, that the fungus draws down as it grows, while the ants may bury or carry it away. Today the game already has the ants' side (cadaver removal); it lacks the fungus's finite draw.

## 6. What the game does today

`web/src/colony/evolution.ts`, `fungus.ts`, `hyphae.ts`:

- **Free growth.** `Evolution.grow` adds `0.03 × mass × (1 − mass / (capacity × patches))` a second (capacity 30, 60 or 120 per patch by the Mycelium level). No food, light or host feeds it. It also adds that mass to `growth` and `ground`, so it is what the free pool's mutations come from.
- **Corpses.** A colonised corpse calls `feed(CORPSE.mass = 1)` once (mass, growth and ground all +1) and puts out 12 spores' worth of spores at a rate. It does not draw down; it is not finite in the fungus's mass.
- **Hosts.** Fungus made in ants adds to `growth` only (the ants' pool), never to mass.
- **Spending.** A hypha cell takes `HYPHA_MASS = 0.25`; spores cost mass; cuts and digging lose it; the web's `regress` frees it.
- **Mutations** are `ANTS_START + 0.25 × growth`, in two pools (`ground` pays the free pool).
- **The measured split** (`progression.mjs --split`, seeds 1–20, 900 s, default order, no lichen, run 45531246163; main as of 2026-11-25): growth made on the ground (the free term, `Evolution.grow`), median **667** (630 to 5,009); in corpses (`feed`), median **36.5** (1 to 115); in hosts, median **42,951** (22,985 to 51,475), which counts toward the ants' pool and never becomes mass. Of the mass the fungus makes, the free term is about **95 %** and corpses about 5 %. Quarter of hosts: worst 333 s (seed 6), median 171 s.

**What the numbers say for the design:** a hungry fungus needs an earned income of the order of 600 mass a game to build what it builds today, and corpses give about 36. So the earned income cannot be the corpses alone: the ground (litter), light and a start reserve have to carry about nineteen twentieths of it, or the fungus grows far less than it does now.

**Why it is a problem:** every P1 number (PRD §63.4) rests on this free term. A fungus that grows from nothing cannot be hungry, and nothing it eats needs finding.

## 7. The mechanic

Owner (2026-11-25): **make the free term earn its place.** The fungus is hungry, and growth must come from somewhere the player can find. The sources the biology supports are the cadaver (§5), the partner's carbon (a lichen's alga; also, if the game gets plants, a root), and at most a small trickle from litter. Three ways to build it, with what the evidence says for and against each:

- **A. Litter and substrate as map content.** The ground holds an amount of usable carbon, rich in patches (a hash of seed and cell, as the alga films are), that hyphae draw down where they lie, at a yield of about 0.5. Corpses and lichen are extra sources on top. *For:* growth must reach a source; a patch is used up (Fukasawa & Kaga 2021) and a small, quickly depleted patch drives more exploring (Fukasawa & Kaga 2020), which a tip policy could use. *Against:* the biology gives no soil carbon per area for this fungus (**not found**), and bulk soil is mostly dormant spores (§1), so rich litter patches are a design choice, not a finding. It needs a new map layer, a sense for the tips (the growth lane's `resource` value, +48 situations), saves, and the endless plane.
- **B. A small constant trickle per hypha cell, depleting.** Every hypha cell takes a little, from a depleting local pool. *For:* simple; stays bounded. *Against:* no biology behind a uniform trickle; it keeps the fungus half fed from nothing, which is the thing the owner asked to retire.
- **C. Capacity from the sources held.** Keep the logistic curve but make its capacity the sum of what the fungus holds: corpses colonised, lichen cells, a small start reserve; the Mycelium level scales it. *For:* the smallest change, and the cap, not the rate, is where the biology bites (a mycelium is a small standing pool with fast turnover, Hagenbo 2017). *Against:* growth still starts from nothing at the logistic rate; the fungus is limited, not hungry for a place to go; and corpses are few.

**Recommendation (for the owner to overrule): A for the substrate, with corpses and lichen as the rich sources.** It is the only one in which a tip's choice matters, which the policy over sensed cues needs. The cost is the largest, so the order is: assays first (the split, a starvation probe), then the litter layer behind a setting whose off is main bit for bit, then corpses made finite, then light as carbon (L2 changes shape: it feeds mass, not mutations alone). Each milestone is a PR with P1 measured against a baseline the owner chooses (§ Open questions).

**What this retires:** the free logistic term, the Mycelium level's "capacity" meaning (it becomes how much a patch can hold, or how fast it takes up), and L2's mutations-only light income.

**Off:** the setting off is main bit for bit.

## Play

- **What the player sees:** litter, where the ground is rich, as a faint tint the fungus's reach has uncovered (under the fog rule, PRD §89); a corpse as a lump that shrinks as hyphae draw it down; lichen cells as light income. A fungus that has run out of food stops, fades at its ends, and shows it.
- **The choice it gives:** where to grow. The aim and the growth policy steer tips toward the ground's richness; the Mycelium level changes how fast a patch takes up; the Lichen level turns light into a source that can be built.
- **Progression:** the fungus starts with a reserve and a rich landing patch (the start is a slope, not a cliff), and the early game is carried by the first corpses, as it is now.
- **The cost:** none in Jev if the tip's cue is steering; a `resource` value in the growth lane's situation is +48 situations and a token bill, to measure before it is chosen.
- **What could make it worse:** a fungus that starves in the open before it finds anything (P1 gets far slower, the game feels dead); a hunger that only the seeds with rich ground at the landing survive (a worst seed far worse than today's); invisible litter (the player cannot tell why it stopped). The assays and a worst-seed gate against a rebased baseline would show the first two.

## Open questions

Owner decisions:

1. **The litter model:** A (map content), B (a trickle) or C (a capacity from sources held)? My recommendation is A.
2. **How hungry:** how much of today's mass may come from the ground itself? Today it is about 95 % (§6). The more earned, the more the ground and the lichen must hold, and the more P1 moves. A hunger that moves the worst seed much past today's would need P1 rebased.
3. **P1's baseline:** P1 (PRD §63.4) is "no seed more than 10 % slower with hyphae than without". With growth earned, "without" must be defined again, or P1 is judged against today's main as a new rule, by the worst seed.
4. **Where the litter is:** on the plane (topsoil), the curtain, or both; and whether a plant root, which the biology supports, should exist.
5. **L2 (PR #425):** hold it until this settles, or merge it as it is (light as mutations only) and change it later.

Still to measure: where today's growth is made (`--split` on seeds 1–20); what a corpse gives against the hyphae its mass pays for; how fast a hungry fungus finds a source on each seed; the late earning rate against the baseline. Still to read: Heaton, Jones & Fricker 2016 (*Am Nat* 187:E27, mycelium energetics); Boddy 1999 and Wells, Harris & Boddy 1999 (cord dependence on carbon); Trinci 1969 and 1974 (extension against substrate); anything giving hyphal growth or yield for *Metarhizium* or *Beauveria* in soil; litter carbon per area.

## What was not found

- A measured hyphal extension rate or mycelial mass for *Metarhizium* or *Beauveria* in soil or litter; only propagule counts.
- Conidia, or biomass, per ant cadaver; dry mass, lipid or protein of an ant cadaver (they are in figures of papers read but not extracted).
- Whether a cadaver supports outgrowth into the surrounding soil; whether growth in a living host is nutrient-limited in ants (only an inference from Hughes 2004, and a moth study of bacteria competing for amino acids, abstract only).
- A starvation threshold for knots or sclerotia; a distance or time a tip can run on stored or translocated carbon alone; litter carbon per area tied to supportable mycelium.

## Sources

- Hu G, St. Leger RJ (2002). *Appl Environ Microbiol* 68:6383. [doi:10.1128/AEM.68.12.6383-6387.2002](https://doi.org/10.1128/AEM.68.12.6383-6387.2002) (FT)
- Angelone S, Pina-Torres C, Padilla-Guerrero IE, Bidochka MJ (2018). *Insects* 9:104. [doi:10.3390/insects9030104](https://doi.org/10.3390/insects9030104) (FT)
- Behie SW, Moreira CC, Sementchoukova I, Barelli L, Zelisko PM, Bidochka MJ (2017). *Nat Commun* 8:14245. [doi:10.1038/ncomms14245](https://doi.org/10.1038/ncomms14245) (FT)
- Behie SW, Zelisko PM, Bidochka MJ (2012). *Science* 336:1576. [doi:10.1126/science.1222289](https://doi.org/10.1126/science.1222289) (ABS)
- Fang W, St. Leger RJ (2010). *Plant Physiol* 154:1549. [doi:10.1104/pp.110.163014](https://doi.org/10.1104/pp.110.163014) (FT)
- Liao X, O'Brien TR, Fang W, St. Leger RJ (2013). *PLoS ONE* 8:e78118. [doi:10.1371/journal.pone.0078118](https://doi.org/10.1371/journal.pone.0078118) (FT, abstract and introduction)
- Liao X et al. (2014). *Appl Microbiol Biotechnol* 98:7089. [doi:10.1007/s00253-014-5788-2](https://doi.org/10.1007/s00253-014-5788-2) (NR)
- Chertkova EA, Kabilov MR, Yaroslavtseva ON et al. (2023). *Microorganisms* 11:943. [doi:10.3390/microorganisms11040943](https://doi.org/10.3390/microorganisms11040943) (FT)
- St. Leger RJ, Wang JB (2020). *Open Biol* 10:200307. [doi:10.1098/rsob.200307](https://doi.org/10.1098/rsob.200307) (FT, a review)
- Lameiras F, Ras C, ten Pierick A, Heijnen JJ, van Gulik WM (2018). *Bioprocess Biosyst Eng* 41:157. [doi:10.1007/s00449-017-1854-3](https://doi.org/10.1007/s00449-017-1854-3) (FT)
- Sinsabaugh RL, Manzoni S, Moorhead DL, Richter A (2013). *Ecol Lett* 16:930. [doi:10.1111/ele.12113](https://doi.org/10.1111/ele.12113) (ABS)
- Fukasawa Y, Kaga K (2020). *Sci Rep* 10:21936. [doi:10.1038/s41598-020-79058-8](https://doi.org/10.1038/s41598-020-79058-8) (FT)
- Fukasawa Y, Savoury M, Boddy L (2020). *ISME J* 14:380. [doi:10.1038/s41396-019-0536-3](https://doi.org/10.1038/s41396-019-0536-3) (FT)
- Fukasawa Y, Kaga K (2021). *J Fungi* 7:654. [doi:10.3390/jof7080654](https://doi.org/10.3390/jof7080654) (FT)
- Tlalka M, Bebber DP, Darrah PR, Watkinson SC, Fricker MD (2008). *Fungal Genet Biol* 45:1111. [doi:10.1016/j.fgb.2008.03.015](https://doi.org/10.1016/j.fgb.2008.03.015) (ABS)
- Emri T et al. (2004). *Folia Microbiol* 49:277. [doi:10.1007/BF02931043](https://doi.org/10.1007/BF02931043) (ABS); Emri T, Molnár Z, Szilágyi M, Pócsi I (2008). *Appl Biochem Biotechnol* 151:211. [doi:10.1007/s12010-008-8174-7](https://doi.org/10.1007/s12010-008-8174-7) (ABS)
- Hagenbo A et al. (2017). *New Phytol* 214:424. [doi:10.1111/nph.14379](https://doi.org/10.1111/nph.14379) (ABS)
- Hughes WOH, Petersen KS, Ugelvig LV et al. (2004). *BMC Evol Biol* 4:45. [doi:10.1186/1471-2148-4-45](https://doi.org/10.1186/1471-2148-4-45) (FT)
- Pull CD, Ugelvig LV, Wiesenhofer F et al. (2018). *eLife* 7:e32073. [doi:10.7554/elife.32073](https://doi.org/10.7554/elife.32073) (FT)
- Diez L, Lejeune P, Detrain C (2014). *Biol Lett* 10:20140306. [doi:10.1098/rsbl.2014.0306](https://doi.org/10.1098/rsbl.2014.0306) (FT)
- Hughes DP, Andersen SB, Hywel-Jones NL, Himaman W, Billen J, Boomsma JJ (2011). *BMC Ecol* 11:13. [doi:10.1186/1472-6785-11-13](https://doi.org/10.1186/1472-6785-11-13) (FT)
- Fredericksen MA et al. (2017). *PNAS* 114:12590. [doi:10.1073/pnas.1711673114](https://doi.org/10.1073/pnas.1711673114) (FT)
- Lin WJ, Lee YI, Liu SL, Lin CC, Chung TY, Chou JY (2020). *Sci Rep* 10:6428. [doi:10.1038/s41598-020-63400-1](https://doi.org/10.1038/s41598-020-63400-1) (FT)
- Sheng H, St. Leger RJ (2024). *PLoS Pathog* 20:e1012639. [doi:10.1371/journal.ppat.1012639](https://doi.org/10.1371/journal.ppat.1012639) (FT)
- Gutiérrez Y, Phung T, Mumma H, Ambrose-Winters L, Scherber C, Smith CR (2020). *Ecol Evol* 10:7901. [doi:10.1002/ece3.6520](https://doi.org/10.1002/ece3.6520) (FT)
- Not read, named above: Jaronski 2007 (book chapter); Wenzel 2001; Borisov (via Chertkova 2023); Heaton, Jones & Fricker 2016, *Am Nat* 187:E27, [doi:10.1086/684392](https://doi.org/10.1086/684392); Boddy 1999, *Mycologia* 91:13, [doi:10.1080/00275514.1999.12060990](https://doi.org/10.1080/00275514.1999.12060990); Wells, Harris & Boddy 1999, *New Phytol* 142:325, [doi:10.1046/j.1469-8137.1999.00397.x](https://doi.org/10.1046/j.1469-8137.1999.00397.x).
