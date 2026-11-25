# Foci: a new base at a new resource is a trait the fungus gets, not something every web does

*Research note for epic `ja-icc4` (PRD §91, design, 2026-11-25). Written against code at `f3fcfb4f`. Searches ran through Europe PMC and PubMed from a cloud session; every DOI under Sources was checked against Crossref. Full text was read for Fukasawa et al. 2020, Fukasawa & Kaga 2020, Fricker et al. 2017, Aguilar-Trigueros et al. 2022, Fredericksen et al. 2017 and Angelone et al. 2018; everything else was read as an abstract or a listing and is marked **unverified**. The 2021 timing paper and Boddy's 1999 review were not read.*

**What the game does today.** Wherever hyphae fill a cell and its six neighbours, that middle cell becomes a patch: a new base with room to grow and spores, at no cost (`Fungus.#settle`, PRD §85; patch under the middle cell only since #416). Every web does it from the first minute. Measured (PRD §85): it moves no infection time, but on a dense web (seed 5) it closes 42 flowers and grows 6 times the hyphae of main (`ja-27w1`). **The question.** Is making a new base at a new resource something every mycelium does, or a trait some have, so that the game can ask the player to buy it?

## Cord-formers grow out from a colonised resource, and it is a decision with a size threshold

- *Phanerochaete velutina* and *Hypholoma fasciculare*, given baits (wood blocks, cones, twigs, leaves) on soil, ramified over and inside the bait, let the non-connecting mycelium regress, thickened the connecting cords, and put out "polarized outgrowth from the baits"; baits became sources for renewed outgrowth, and removing colonised baits delayed or rerouted spread. Dowson, Springham, Rayner & Boddy 1989. **Unverified** (abstract only).
- A measured threshold, in volume: inocula of 0.5–4 cm³ and baits of 0.5–36 cm³ (six sizes: 0.5, 1, 2, 4, 16 and 36); the largest baits are where the old inoculum seldom regrew and its unconnected mycelium often died back; 67 % of inocula regrew after the bait was colonised and the inoculum moved; the bait volume that sharply changed how often the mycelium regrew was "somewhere between 4 and 16 cm³ regardless of the inoculum volume", which the authors read as the mycelium migrating completely to a bait big enough; regrowth came more often from the side that had faced the bait; the threshold "must be larger in the field". Fukasawa, Savoury & Boddy 2020 (full text).
- Outgrowth rose with the fraction of the wood used up, not the absolute carbon taken: the smallest blocks gave the most. Fukasawa & Kaga 2020 (full text).

**In the game:** a closed flower stands for "the hyphae have colonised a resource and a new base is worth making". The size of a flower (a cell and its six) is **design**: no paper measures a hyphal-density rule, and the nearest measured threshold is a bait volume in cm³. The papers are what make "a new focus at a resource" biology, as `fungus-unlocks.md` §2 already said; they do not make any one flower size biology.

## Outgrowth pattern is a species trait that has evolved

- Fungi differ in whether they extend as mycelium from a food source to find new resources ("non-resource-unit-restricted") or stay inside it ("resource-unit-restricted"), and "a wide variety of patterns of mycelial outgrowth from organic resources has evolved", from slow dense "phalanx" foragers (*Hypholoma*) through faster sparser ones (*P. velutina*) to *Armillaria*. Fricker, Heaton et al. 2017 (full text).
- Soil ascomycete and zygomycete networks of microscopic hyphae (*Fusarium*, *Alternaria*, *Mucor* and others) and basidiomycete cord networks (*Resinicium*, *Phanerochaete*, *Phallus*) sit along a connectivity gradient with trade-offs between construction cost and robustness: diffuse networks forage too. Aguilar-Trigueros et al. 2022 (full text).

**In the game:** a fungus with this ability and one without is a real difference between species, so "the fungus gets it" is an honest abstraction in the same way Knots (microsclerotia) and Lichen are. **Design:** no paper read gives a gene-level mechanism for gaining or losing cords or rhizomorphs (searched; the *Armillaria* genome papers and Nagy et al. 2017 were not readable), so the unlock stands on species variation, not on a known evolutionary step.

## The game's fungus is not known to do it

- *Metarhizium* strains range from "sleepers" (mostly conidia) to "creepers" (mostly mycelium; "hyphae move through the soil until a host insect or plant is encountered"); both were seen on mummified cadavers. Angelone et al. 2018 (full text; a theoretical model, with no cords or anastomosis in it).
- *Metarhizium* has "varying degrees of saprotrophic, endophytic, and insect pathogenic" nutrition and rhizosphere competence (Stone & Bidochka 2020; St Leger 2008; **unverified**, abstracts), and its lineage shifts between saprotroph, symbiont and pathogen (St Leger, Sheng & Hafer 2026, **unverified**).
- In ants dead of *Ophiocordyceps unilateralis* s.l., hyphal bodies are linked by short tubes (about 1 µm) that the authors call conidial anastomosis tubes, forming networks in the muscle: the only entomopathogen anastomosis found. Fredericksen et al. 2017 (full text).

**In the game:** nothing read shows *Metarhizium*, *Beauveria* or *Pandora* forming cords or a new focus on a cadaver or in soil, so a fungus that starts without it is the cautious reading: **foci off at the start, bought later**. Which fungus the game's fungus "is" stays loose (it is a generic entomopathogen), so this is **design** resting on the species-variation finding, not a claim that *Metarhizium* does it.

## Why after Knots

Knots are microsclerotia: a hypha short of mass hardens into a resting body that sprouts again. **Design (owner, 2026-11-25):** a fungus that can sit out starvation can then afford to spread to a new base, so Foci needs Knots 1 (which itself needs Mycelium 1). No paper orders the two.

## What was not found

- *Metarhizium*, *Beauveria* or *Pandora* with cords, rhizomorphs, synnemata, hyphal fusion or anastomosis on a cadaver or in soil: none. Not a positive result that they do not.
- A measured hyphal-density or cell-count rule for a new focus: none. A cm³ bait threshold is the nearest.
- A gene-level account of gaining or losing cord formation: none read.
- Transitions between cord-forming and non-cord-forming states: none.
- Not searched by name or not fetched: Boddy 1999 (*Mycologia* 91:13), Cooke & Rayner 1984, Dowson, Rayner & Boddy 1986, Lindahl & Olsson 2004 (abstract only), Fukasawa & Kaga 2021.

## The mechanic

**One upgrade, one level (owner, 2026-11-25), in the fungus's own pool, after Knots.** Copy the shape of Lichen (`evolution.ts`, `id: "lichen"`):

- `id: "foci"`, `kind: "spread"`, name "Foci", `steps: ["none", "new bases"]`, `needs: [[{ id: "knots", level: 1 }]]`, `trait: "foci"`, `values: [0, 1]`; added to `FREE_UPGRADES` (the free pool pays for it, from growth on the ground and corpses) and to the "Mycelium and spores" branch of the drawer.
- **Cue and response:** the cue is the same (a closed flower of hyphae, the fungus's own body, nothing an ant senses); the response is the gate: `Fungus.#settle` reads `evolution.level("foci")`; at 0 it empties the grown-cell lists and does nothing; at 1 it is today's rule.
- **Off setting:** a fungus param `fociGate`, on by default since 2026-11-25 (arm E, PRD §91: no flower forms with the assay's order and every time equals the ungated game's); off, flowers form as before.
- **Unaffected:** the landing patch and an infected queen's one-tile patch (`Fungus.root`) are not flowers. Patches already formed stay: an old save with flower patches keeps them (they are in `base`) and forms no new ones until Foci is kept (owner, 2026-11-25).
- **Price:** the free pool's rising price, `round(1.5^kept)` over its own kept levels (§80): Foci after Mycelium 1 and Knots 1 would cost about 2 mutations (estimate; the build measures it).
- **Retires:** no gap-table row (a fungus mechanic, not an ant choice). Adds no sense and no scripted read.
- **Cost (Jev):** none. No situation field, legend or question changes; the mutation menu is the player's, not a lane.
- **The assay:** the progression assay's default buy order (`DEFAULT_ORDER` in `scripts/lab/progression.mjs`) buys neither Knots nor Lichen, so under the gate it forms no flower: P1's T1–T4 would be measured with no flowers (they were unmoved by flowers, PRD §85) and the patch columns would read 0. The assay needs a second arm with an order that buys Knots and Foci, to see what the gate costs and when flowers start.

## Play

- **See:** the Mutations drawer gains a Foci node after Knots; once kept, purple flower patches start appearing where hyphae close a web (they do not before). The Learn drawer text says what it does and what it needs: a line in `upgradeText.ts` (the why and the level text) like the other free-pool upgrades.
- **Choose:** a real trade in the free pool: Foci against Fruiting, Stalks, Lichen and a second Mycelium level, from the same rising price. A fungus that wants bases at resources buys it; one that wants spores or rock does not.
- **Progression:** flowers moved no infection time (PRD §85), so gating them cannot create a cliff in P1; what moves is mass, capacity and spores in dense webs, which the second assay arm measures. No change to counterplay.
- **Cost:** none for Jev; a cached game still spends nothing.
- **Risks:** (1) an invisible effect: the buy changes nothing until a web closes a flower, so the drawer text must say so; (2) a dead feature: if the usual path is never to buy it, flowers vanish from most games (check the buy order the assay and the page use); (3) the seed-5 runaway moves to "after Foci is bought", bounded by the price only, so it is not closed (`ja-27w1` stays open until it is measured with the gate); (4) saves: patches already formed stay, and a flower that closes while gated is never re-seen after the buy (its middle stays a plain hypha; the web makes patches wherever it grows next: PRD §91).

## Open questions

- **Decided (owner, 2026-11-25), with the measurement in PRD §91:** an old save loses the ability to form flowers until it buys Foci (patches already formed stay); the default buy order reaches Knots and Foci (measured: it costs progression on 9 seeds early or up to +35 % on 2 seeds late, so `DEFAULT_ORDER` is unchanged and the call is back with the owner); the seed-5 runaway is accepted as "bounded by the price once Foci is bought" (`ja-27w1` stays open until it is measured with the gate).
- To measure: P1 (T1–T4) on seeds 1–20 with the gate and a buy order that reaches Foci; flowers per game and when the first forms; whether the seed-5 web still runs away after the buy; the price of Foci in mutations.
- Not now: Fukasawa's finding that outgrowth rises with the fraction of the resource used is a possible later lever (a flower that forms only after its cells are used up); it is not part of this change.

## Sources

- Dowson CG, Springham P, Rayner ADM, Boddy L (1989). Resource relationships of foraging mycelial systems of *Phanerochaete velutina* and *Hypholoma fasciculare* in soil. *New Phytol*. **Unverified** (abstract only). [doi:10.1111/j.1469-8137.1989.tb00713.x](https://doi.org/10.1111/j.1469-8137.1989.tb00713.x)
- Fukasawa Y, Savoury M, Boddy L (2020). Ecological memory and relocation decisions in fungal mycelial networks: responses to quantity and location of new resources. *ISME J*. [doi:10.1038/s41396-019-0536-3](https://doi.org/10.1038/s41396-019-0536-3)
- Fukasawa Y, Kaga K (2020). Effects of wood resource size and decomposition on hyphal outgrowth of a cord-forming basidiomycete. *Sci Rep*. [doi:10.1038/s41598-020-79058-8](https://doi.org/10.1038/s41598-020-79058-8)
- Fricker MD, Heaton LLM, Jones NS, Boddy L (2017). The mycelium as a network. *Microbiol Spectr*. [doi:10.1128/microbiolspec.funk-0033-2017](https://doi.org/10.1128/microbiolspec.funk-0033-2017)
- Aguilar-Trigueros CA, Boddy L, Fricker MD et al. (2022). Network traits predict ecological strategies in fungi. *ISME Commun*. [doi:10.1038/s43705-021-00085-1](https://doi.org/10.1038/s43705-021-00085-1)
- Fredericksen MA et al. (2017). Three-dimensional visualization and a deep-learning model reveal complex fungal parasite networks in behaviorally manipulated ants. *PNAS*. [doi:10.1073/pnas.1711673114](https://doi.org/10.1073/pnas.1711673114)
- Angelone S, Bidochka MJ et al. (2018). "Sleepers" and "Creepers": a theoretical study of colony polymorphisms in the fungus *Metarhizium robertsii*. *Insects*. [doi:10.3390/insects9030104](https://doi.org/10.3390/insects9030104)
- Stone EL, Bidochka MJ (2020). The multifunctional lifestyles of *Metarhizium*: evolution and applications. *Appl Microbiol Biotechnol*. **Unverified** (abstract only). [doi:10.1007/s00253-020-10968-3](https://doi.org/10.1007/s00253-020-10968-3)
- St Leger RJ (2008). Studies on adaptations of *Metarhizium anisopliae* to life in the soil. *J Invertebr Pathol*. **Unverified** (abstract only). [doi:10.1016/j.jip.2008.01.007](https://doi.org/10.1016/j.jip.2008.01.007)
- St Leger RJ, Sheng H, Hafer L (2026). Lifestyle plasticity and the shared hypocrealean toolkit across *Fusarium*, *Metarhizium*, and *Trichoderma*. *Microbiol Mol Biol Rev*. **Unverified** (abstract only). [doi:10.1128/mmbr.00116-25](https://doi.org/10.1128/mmbr.00116-25)
