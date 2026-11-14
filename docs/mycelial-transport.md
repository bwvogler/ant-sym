# Mycelial transport: mass flows along the hyphae to the tips that grow

*Research note for epic `ja-tgw9` (PRD §70). Written 2026-11-14, against code at `cbe033d`. Only pmc.ncbi.nlm.nih.gov was reachable in the session; arxiv.org, core.ac.uk, orca.cardiff.ac.uk, microbiologyresearch.org, davidmoore.org.uk and www.ncbi.nlm.nih.gov failed DNS. So "full text" means a PMC article read in full, and every number taken from an abstract, a snippet or a citing paper is marked **unverified**.*

The game today: the mycelium's mass is one number (`Evolution.mass`). It grows on the fungus's patch by the hole, and corpses add to it. `Fungus.#growHyphae` turns whatever is not already in hypha into one budget, which every tip on both maps shares equally (`hyphae.ts` `stepRound`). A tip on a piece the ants have cut off is fed as if it touched the patch, and a tip 40 cells out is fed as well as one beside it. Cords (`ja-2bw.8`) therefore change nothing about feeding. Owner, 2026-11-14: "I don't think they should all share mass. That seems broken." The owner chose to have mass flow along the hyphae. This note answers: how does a mycelium get mass from where it feeds to the tips that grow, how fast, and what do cords, loops and cuts do to that?

## Tips are sinks: growth draws mass toward them

- **Growth itself makes flow.** In *Phanerochaete velutina* cord networks, volume added at the tips must flow from wherever water and food are taken up, because the cytoplasm cannot be compressed: "growth induces mass flows across the mycelium". In the authors' uniform model each tip is a sink, and the pressure gradients needed are "very modest". Diffusion and local uptake "may be sufficient to sustain short-range local growth", but long distances need bulk flow. The model takes the inoculum, the original food, as the only source (Heaton et al. 2010, full text).
- **Flow in a hypha scales with the tips it feeds.** In *Neurospora crassa* the mean flow of nuclei "was always toward the colony edge", driven by pressure, not motor proteins. Flow in a hypha is proportional to the number of tips it feeds, and reversing the osmotic gradient reversed it for 3–5 min (Roper et al. 2013, full text).
- **Contrary evidence: flow also runs away from tips, and pulses.**
  - In *Coprinopsis cinerea*, a glucose analogue moved long distances only in a subset of specialised hyphae. Its direction alternated, toward and away from the tips, about every 3 h (Schmieder et al. 2019, **unverified**: abstract).
  - Label moved in opposite directions in different regions at the same time in *Pleurotus*, *Schizophyllum* and *Coprinus* (Olsson & Gray 1998, **unverified**).
  - Flow toward the margin pulsed with an 11–12 h period in *P. velutina* (Tlalka et al. 2002, **unverified**).

**In the game:** a tip is where mass is used, so mass moves from where it enters toward the tips. At a branch, the mass divides by the tips each side feeds: the same "tips fed" count `Hyphae.thicken` already uses to make cords. Back-flow and pulsing are left out (**design**: a net flow toward the tips is the average the papers agree on).

## Mass enters where the fungus feeds

- In Heaton et al.'s model the inoculum is the source (Heaton et al. 2010, full text).
- A *Serpula lacrymans* network that met a fresh wood block drew label "from throughout the mycelium" **into** the new block. The response began about 100 h after first contact. By 390 h the label had almost gone from two of the cords, and after 6 weeks the new wood held about 3× the label of the original inoculum (Tlalka, Fricker & Watkinson 2008, full text). That is a new resource acting as a sink first, not a source.
- In the field, ³²P added to an inoculum reached the margins of cord systems up to 75 cm away within 5 days (Wells & Boddy 1995, **unverified**). Wood baits colonised first were the main sinks early on; later, P flowed out of them to newer baits (Wells et al. 1998, **unverified**).
- *Metarhizium robertsii* moved insect nitrogen into plant roots through soil (Behie, Zelisko & Bidochka 2012, **unverified**: abstract). Infected *Galleria* behind a 30 µm mesh fed hyphae that grew through soil to roots (Behie et al. 2017, full text; no distances or speeds).
- **Contrary evidence for long runs from a cadaver:** after 14 months in soil, *Beauveria bassiana* had grown out of pecan-weevil cadavers to colonies up to 8.55 cm across, while ***M. anisopliae* stayed confined to the cadaver and its soil cell** (Gottwald & Tedders 1984, **unverified**: abstract).

**In the game:** mass enters at the patch's root cells (what `Evolution.grow` adds each step) and at a colonised corpse's cell (`CORPSE.mass`, today added to the global mass). A knot's store stays its own, as today. A corpse is a source from the moment it is colonised. The delay before a new food source pays out (Tlalka et al. 2008) and its first role as a sink are left out (**design**). The game's corpses are short-lived, and the owner's corpse rules (`ja-2bw.7`) already decide what a corpse gives.

## Cords carry mass 10–100× faster than thin hyphae

- **Cords:**
  - In *S. lacrymans*, a non-metabolised amino-acid tracer advanced "along cords… with a velocity of up to 13 mm h⁻¹". It was spread through the whole 22 × 22 cm mycelium 1–2 h after loading, and concentrated at the growing margins by 12 h (Tlalka et al. 2008, full text).
  - In *P. velutina* cords: up to 50 mm/h, 23 mm/h on average (Tlalka et al. 2002, **unverified**).
  - Rhizomorphs of *Pisolithus* and *Thelephora*: 1–3 cm/h (**unverified**, snippet; primary paper not identified).
- **Thin hyphae:**
  - In *N. crassa*, tips grow at about 0.3 µm/s. The leading hyphae carry flow of up to 5 µm/s, about 20× the tip speed, and nuclei travel up to 10 mm in 1 h (mean about 3 mm/h), more than 3× the colony's growth rate (Roper et al. 2013, full text).
  - In *P. velutina*, a network of tubular vacuoles moves solutes by diffusion over mm to cm (Darrah et al. 2006, full text).
  - Olsson & Jennings (1991, **unverified**: title and record) argue for diffusion as the mechanism in three moulds. That is counter-evidence to bulk flow everywhere.
- ***Metarhizium* and *Beauveria* are not known to form cords.** No translocation speed was found for either. A cord rule for this fungus is borrowed from wood-decay basidiomycetes, as the cords themselves already are (`docs/hyphal-growth.md` §7).

**In the game:** mass moves a fixed number of cells a round along thin hypha, and many more along a cord.
- Thin hypha moves it `FLOW_THIN` = 3 cells a round. Roper et al. 2013 found nuclei travelling more than 3× the colony's growth, and a tip grows at most one cell a round, so a thin hypha always outruns its own tip.
- A cord moves it `FLOW_CORD` = 30 cells a round: 10× thin, at the low end of the 10–100× the papers give, so a cord never makes a tip's supply instant.
- Both numbers are **design**, set from those ratios and tuned against P1.

## Loops feed the edge

- *N. crassa* that cannot fuse (Δso) showed "much lower δ15N levels in the midzone and colony margins". "The majority of the tracer was concentrated around the original inoculum plugs", although the mutant grows at "near-wild-type maximal growth rates": the defect is transport, not growth. A strain that fuses half as often matched the wild type on even medium. With a 4 cm sucrose patch, a "significant fraction" of label stayed in the colony's interior (Simonin et al. 2012, full text).
- Without fusion, flow is confined to a few leading hyphae, each feeding up to 20 tips, and transport costs rise about 20-fold (Roper et al. 2013, full text).

**In the game:** a fused pair (`Hyphae.fusions`) is an extra edge mass can take. A loop gives the tips beyond it a shorter or a second way to the source. This is fusion's effect again (`ja-2bw.20`): since PRD §63.10 a cut loses only the dug cell, so a loop no longer keeps a cut-off part alive, and fusing only ended the tip. The growth lane's fuse criterion can say this once it is built.

## A tip grows from what is near it; a cut-off piece lives on its own store

- Colony radial growth equals the width of a peripheral zone behind the tips times the specific growth rate. Zone widths ranged from 423 to 8660 µm across species, and did not change with time or temperature, though they did with glucose (Trinci 1971, **unverified**).
- **Contrary evidence:** laser-cut single *Aspergillus niger* hyphae kept growing at an unchanged 87–104 µm/h on their apical compartment alone (about 354 µm). 58–91 % of wild-type hyphae kept growing after a cut, though they were watched for only 45 min (Tegelaar & Wösten 2017, full text).
- How long a severed piece of mycelium keeps growing on its own reserves: **not found**.

**In the game:** each hypha cell holds a load of mass in transit. A tip steps only on the load in its own cell (`HYPHA_MASS` a step), and its `supply` is *ample* while that load would pay for `AMPLE_STEPS` steps. A piece the ants cut off keeps the load in its cells and grows on it until it is spent. After that its tips starve, and they harden into knots if the fungus has bought them (`ja-2bw.9`), until a fusion or a corpse feeds the piece again. The "lives on" decision (§63.10) stands; the piece now lives on its own store.

## What was not found

- Any translocation measurement, hyphal growth rate in soil, or cord in *Metarhizium* or *Beauveria*.
- How far *Metarhizium* grows out of a cadaver. The one datum says it stays at the cadaver (Gottwald & Tedders 1984, **unverified**).
- How long a severed mycelium or cord keeps growing on its own reserves.
- How fast mass leaves a newly captured resource toward distant tips. Tlalka et al. 2008 show mass flowing into a new resource instead.
- Full texts of Trinci 1971, Lew 2005, Schmieder et al. 2019, Tlalka et al. 2002, Olsson & Jennings 1991, Heaton et al. 2012 and Fricker et al. 2017 (the hosts were unreachable).

## The mechanic

| Cue (sensed by the tip) | Sense | Response | Local rule | Off | Retires |
|---|---|---|---|---|---|
| `supply`: the load in the tip's own cell | the fungus's own body (`docs/fungus-policy.md` §11: what a fungus could sense in its own hyphae) | grow, branch, rest… (the growth lane, unchanged) | rest when short | `fungus.flow` off: today's shared budget, bit for bit | the shared budget in `stepRound`; the global read of every map's free mass by every tip |

1. **Loads.** Each hypha cell holds a load, the mass in transit there. Mass enters as a load at sources: the patch's root cells, which take the body's free mass as `Evolution.grow` adds it, and a colonised corpse's cell, which takes `CORPSE.mass`. The body's total `Evolution.mass` is unchanged: it is the hypha cells plus their loads plus the free mass not yet placed. So mutations, spores and capacity read as they do today.
2. **Flow, once a round.** A cell's load moves toward the tips its hypha feeds, divided between its children (and fused partners on the far side) by the tips each feeds, as `thicken` counts them. Each round mass moves up to `FLOW_THIN` cells along thin hypha and `FLOW_CORD` cells along a cord; a fused pair is one more edge. Mass with no tip downstream stays where it is.
3. **Tips.** A tip senses `supply` from its own cell's load (ample at `HYPHA_MASS × AMPLE_STEPS`), and a step pays `HYPHA_MASS` from that load. A branch shares the load between the two tips. Resprouting stumps and sprouting knots pay from their own cell's load (a knot from its store, as today).
4. **Spores** stay paid out of the body's mass as today. They are taken from the patch's loads first, because the patch is where the body fruits (**design**).
5. **Cuts.** A cut cell loses its load with its hypha mass, as `Evolution.lose` loses the cell today. What grew beyond it keeps its loads (the "lives on" rule, §63.10).
6. **Off.** A new setting `fungus.flow`, off by default, plays today's shared budget bit for bit; the golden masters never land a fungus. When it is on, the distance bar built on the way here (`FEED_SPAN`, commit 7aba688, never merged) is removed: flow replaces it.

**The growth lane.** The situation keeps its four fields and 48 situations. What `supply` means changes, from "the mass the mycelium can spare" to "the mass that has reached this tip". So the legend's supply line and the fuse criterion (`ja-2bw.20`: a loop shortens the way mass takes to far tips) are reworded, and `GROWTH_BRAIN_VERSION` goes up. The three preset aims are re-asked: 48 situations × 3 aims at ~770 tokens a situation, about $0.005 at $0.042/M, the owner's call. Until then a lane whose words changed plays the local rule (ja-lo8.15).

**Assays (land first, flow off):**
- **F1, flow reaches tips:** on a hand-built mycelium, a tip 20 thin cells from a fed root first feels *ample* after ⌈20 / `FLOW_THIN`⌉ rounds, and one the same distance behind a cord sooner.
- **F2, conservation:** cells + loads + unplaced equals `Evolution.mass` every round.
- **F3, a cut piece lives on its store:** the piece grows only as much as its loads paid for, then starves.
- **F4, a loop feeds the edge:** on a fused ring, the far tips are fed sooner than on the same tree without the fusion.
- **P1** (PRD §63.4) on seeds 1–10 and 11–20, with flow on, against §63.14's figures.

**Tick cost:** one pass over the hypha cells a round, plus up to `FLOW_CORD` hops along cords. A mycelium is a few hundred cells, so the cost is small; benchmark it in the PR.

## Play

- **See:** hyphae near the patch and along cords look fed, and far thin threads look thin. Draw a cell's load as brightness or a pulse moving out along the hyphae, and add a Learn entry: "Mass flows from where the fungus feeds to its growing tips; cords carry it fast." A front cut off by a tunnel visibly slows and stops.
- **Choose:** *Mycelium*'s third level (*a web*) now matters: cords are what feed a far front. Where the fungus lands, and which corpses it reaches, set where its mass enters. The aim's words steer branching, and branching splits a tip's supply.
- **Counterplay and progression:** ants digging a cord now starve everything beyond it, so tunnels matter more. A weak start stays weak (thin flow only before *a web*), and the slope is the web level. Risk: if thin flow is too slow, spread before *a web* slows. P1 is the guard.
- **Cost:** no new situation field; one re-ask of the growth lane for the reworded legend (about $0.005, owner's call). Cached games spend nothing.
- **Risks:**
  - **A cliff at *a web*.** Measure the time to a quarter of the hosts before and after the level is bought.
  - **Famine.** Tips far out all starving, seen as many tips resting or as knots. Measure tips resting per round.
  - **Invisible.** If loads are not drawn, the player cannot see why a front stopped.
- **Owner decisions needed:**
  - `FLOW_THIN` and `FLOW_CORD`: proposed 3 and 30 cells a round.
  - Whether to re-ask the growth lane (about $0.005).
  - Whether spores come from the patch's loads.
  - How loads are drawn.

## Open questions

- `FLOW_THIN` and `FLOW_CORD`: proposed 3 and 30 (design); tuned against P1.
- Whether a corpse pays in its mass at once (proposed) or over time, like its spores.
- Whether spores take from the patch's loads (proposed) or from all loads evenly.
- Back-flow and pulsing (Schmieder et al. 2019; Tlalka et al. 2002) are left out; revisit if networks look too tidy.
- A severed piece's reserves have no measured lifetime: they last as long as its loads do.

## Sources

- Heaton LLM et al. (2010). Growth-induced mass flows in fungal networks. *Proc R Soc B* 277:3265. [PMC2981926](https://pmc.ncbi.nlm.nih.gov/articles/PMC2981926)
- Roper M et al. (2013). *PNAS* 110:12875 (title from memory: nuclear dynamics in a fungal chimera). [PMC3740868](https://pmc.ncbi.nlm.nih.gov/articles/PMC3740868)
- Tlalka M, Fricker M, Watkinson S (2008). *Appl Environ Microbiol* 74:2700 (long-distance AIB translocation during resource capture by *Serpula lacrymans*). [doi:10.1128/AEM.02765-07](https://doi.org/10.1128/AEM.02765-07) [PMC2394889](https://pmc.ncbi.nlm.nih.gov/articles/PMC2394889)
- Tlalka M et al. (2002). *New Phytol* 153:173. **Unverified** (abstract; title and authors not fetched).
- Darrah PR et al. (2006). *Eukaryot Cell* (title from memory: the vacuole system as a pathway for solute transport). [PMC1489287](https://pmc.ncbi.nlm.nih.gov/articles/PMC1489287)
- Simonin A, Palma-Guerrero J, Fricker M, Glass NL (2012). *Eukaryot Cell* 11:1345 (title from memory: the physiological significance of network organisation in fungi). [PMC3486018](https://pmc.ncbi.nlm.nih.gov/articles/PMC3486018)
- Tegelaar M, Wösten HAB (2017). *Sci Rep* 7:6039 (title from memory: functional distinction of hyphal compartments). [PMC5519613](https://pmc.ncbi.nlm.nih.gov/articles/PMC5519613)
- Behie SW et al. (2017). *Nat Commun* 8:14245 (title from memory: carbon from plant to an insect-pathogenic endophyte). [PMC5253661](https://pmc.ncbi.nlm.nih.gov/articles/PMC5253661)
- Behie SW, Zelisko PM, Bidochka MJ (2012). *Science*. **Unverified** (abstract and press). [doi:10.1126/science.1222289](https://doi.org/10.1126/science.1222289)
- Schmieder SS et al. (2019). *Curr Biol* 29:217. **Unverified** (abstract; title from memory). [doi:10.1016/j.cub.2018.11.058](https://doi.org/10.1016/j.cub.2018.11.058)
- Trinci APJ (1971). *J Gen Microbiol* 67:325. **Unverified** (abstract and citing text; title from memory: the peripheral growth zone and radial growth rate).
- Olsson S, Jennings DH (1991). Evidence for diffusion being the mechanism of translocation in the hyphae of three molds. *Exp Mycol* 15:302. **Unverified** (title and record only).
- Olsson S, Gray SN (1998). *FEMS Microbiol Ecol* 26:109. **Unverified** (abstract; title not fetched).
- Wells JM, Boddy L (1995). *Mycol Res* 99:977. **Unverified** (abstract; title not fetched).
- Wells JM et al. (1998). *New Phytol* 140:283. **Unverified** (abstract; title and authors not fetched).
- Gottwald TR, Tedders WL (1984). *Environ Entomol* 13:557. **Unverified** (abstract; title not fetched).
