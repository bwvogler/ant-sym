# Hyphal traffic: fungal tips orient to host signals and to touch; nothing shows an insect-killing fungus leaning toward where its host walks

*Research note for bead `ja-ob97` (epic `ja-ogph`, PRD §88; the owner's idea is `ja-ob97`). Written 2026-11-23, against code at `dcc99cb`. The papers were searched through Europe PMC and read through PubMed E-utilities: **only abstracts were read** (no full text), so no figure from them is used; entries marked **unverified** below were seen as a title in a search result only. Publisher pages were not tried. The question was put by the owner on 2026-11-22: tips should have a sense of traffic they can bias toward.*

Today a hyphal tip senses nothing about the ants. Its situation has five fields (`ahead`: its own hypha, soil, open or rock; `exposed`; `supply`; `run`; `resource`: a colonised corpse beside it), and when it turns with both sides free it alternates by `h.steps % 2` (`sideFor`, `hyphae.ts`), so growth ignores where the colonies walk. It matters since #280 (the landing roots six tips): the six plane tips share the body's mass with flow on, and the curtain gets 4 hyphae cells at 150 s against 21 with three tips (the F2 soak test, loosened by the owner's decision); in the progression comparison (flow on, seeds 1–20) the median quarter improved, 196 s against 202.5 s, but seed 6 was 38 % slower (250 s to 346 s). The question this note answers: **does real hyphal growth lean toward hosts or toward where hosts pass, by what cue, and what could a game rule honestly borrow from that?**

## Hyphal tips re-orient to environmental cues, by gradients and by touch

- Hypha orientation is a distinct regulatory mechanism from tip extension: a fungus re-orients tip growth in response to cues, including gradients of effectors, to ramify a colony, penetrate hosts and form mating structures; mutants can grow normally yet wander or lose tropic responses (Brand & Gow 2009, abstract read; no numbers used). Sources: Brand & Gow 2009 (*Curr Opin Microbiol* 12:350–357).
- Contact is a cue of its own: thigmotropism (growth guided by physical features), thigmo-differentiation (invasion structures induced by topography) and thigmonasty (contact with motile prey rapidly triggers capture, as in nematode-trapping fungi); how a walled cell senses contact is not known (Almeida & Brand 2017, abstract read). A mechanosensitive ion channel is required for nematode predation in nematode-trapping fungi (Zhang et al. 2026, **unverified**: title only). Sources: Almeida & Brand 2017 (*Microbiol Spectr* 5(2)); Zhang et al. 2026 (*mBio*).

**In the game:** the tips already have two orientation rules from this family, thigmotropism along tunnel walls and negative autotropism (docs/hyphal-growth.md §3). A tropism toward ants would be a third **body-level** orientation rule of the same kind, not a new decision for the policy. That the cue is *contact or a gradient* is supported; which cue, for ants, is **design** (below).

## Soil pathogens grow toward chemical signals of their host, for plants

- "For more than a century, fungal pathogens and symbionts have been known to orient hyphal growth towards chemical stimuli from the host plant": *Fusarium oxysporum* grows toward tomato roots, triggered by the catalytic activity of secreted class III peroxidases, through the cell-integrity MAPK cascade and the pheromone receptor Ste2; growth toward sugars and amino acids runs on a separate MAPK cascade (Turrà et al. 2015, abstract read). Sources: Turrà et al. 2015 (*Nature* 527:521–524).
- The same receptor family is reported to steer other pathogens: *Fusarium circinatum* toward pine root extracts via Ste2 (Ramaswe et al. 2024, **unverified**: title only), and *Colletotrichum graminicola* toward maize diterpenoids via Ste3 (Rudolph et al. 2024, 2025, **unverified**: titles only). Sources: *Pathogens* 13:425; *Front Fungal Biol* 2024; *Mol Plant Pathol* 2025 (listed below).

**In the game:** host-directed growth is documented for fungi and plant hosts, with a concrete cue (a host-released chemical gradient) and an organism-level result (growth toward it). It licenses a **chemical-gradient tropism** as a mechanism. It is no licence for the *target*: these are plant hosts.

## For insect-killing fungi, no directed growth toward insects, or toward their traffic, was found

- Searched in Europe PMC (2026-11-23), no paper found that measured hyphae of *Metarhizium* or *Beauveria* growing toward an insect, its cuticle, its volatiles, its carbon dioxide or its movement: queries "Metarhizium chemotropism hyphae host", "Beauveria bassiana hyphal growth toward insect", "entomopathogenic fungi hyphal orientation host cues soil", "entomopathogenic fungus attraction to insect host chemotaxis hyphae soil", "Metarhizium directed hyphal growth toward insect cuticle OR host volatile", "entomopathogenic fungus hyphae grow toward insect carbon dioxide OR volatile" (the hits were endophyte, mycoparasite or review papers). A query for hyphal chemotropism along a carbon-dioxide gradient found nothing relevant.
- No paper found that shows hyphae sensing a walking animal at a distance (footfall, vibration), as opposed to by contact with the hypha or a trap.

**In the game:** the *target* "toward ants" is **design**: no paper shows an insect-killing fungus doing this. Mark it so in the rule, the Learn text and the PRD. (This is a search of one index, with abstracts only; it is not a proof of absence.)

## What ants do where the fungus is: the traffic does not leave

- *Myrmica rubra* foragers were not deterred by sporulating *Metarhizium brunneum* bodies near a prey patch: both patches were used equally, with no extra mortality from foraging on the contaminated one (Pereira, Willeput & Detrain 2021, abstract read). Sources: *Sci Rep* 11:23573.
- When digging, *M. rubra* workers' overall digging dynamics were not altered by spores in half the sand, but the excavated shape deviated markedly from the isotropic circle of controls: nests are shaped around contaminated substrate (Leclerc, Pinto Silva & Detrain 2018, abstract read). Sources: *R Soc Open Sci* 5:180267.

**In the game:** surface traffic is where hyphae and hosts meet, and it persists over fungus (ants keep walking), so a cue of "ants pass here" is a cue of *contact*. Digging, by contrast, shapes itself around contamination (the colonies' counterplay, already modelled as ants cutting hyphae when they dig, PRD §63.10).

## What was not found

- A measured strength of any tropism toward insect hosts, or toward traffic, in *Metarhizium* or *Beauveria*; so no number to set a bias from.
- Hyphae sensing footfall or vibration at a distance.
- Whether the growth of insect-killing fungi in soil is host-directed at all, or only germination, contact and penetration are (the infection path in the game: spores and contact).

## The mechanic (design; cheapest first)

| Cue (sensed) | Sense row | Response | Local rule | Off | Retires |
|---|---|---|---|---|---|
| **A.** ants within `r` cells of the tip, from the occupancy grids the fungus step already receives (`CountGrid` per colony per layer; they are read there for host contact) | a fungus sense, new: "ants at the tip" ([fungus-policy §11](fungus-policy.md#11-what-the-fungus-senses-inside-an-ant-and-its-levers) is where it belongs) | **steering**: which side a tip takes when it turns with both sides free (`turn`, a slide, a branch's side) | take the side whose cell has more ants within `r`; a tie falls back to today's `h.steps % 2` | bias off: today's choice, bit for bit | nothing scripted; the parity tie-break becomes a cue-driven choice |
| **B.** the same count as a situation field `traffic` (none, some) | same row | the growth lane may answer to it (`left`, `right`, `thicken`, `rest`) | the local rule as A | field absent: today's 96 situations | none |
| **C.** a decaying footfall memory per layer (ants' standing counts accumulated with a half-life) | same row | as A | as A, on the memory | off | none |

- **A applies where the lane answers `turn`, to branch sides and to slides; not to explicit `left` or `right` answers**, so the player's aim is not overridden.
- **A is free in Jev tokens** (no new situation field); its tick cost is a few `CountGrid.get` reads per tip step, to measure with `colony-bench.mjs`. **B doubles the growth lane's situations** (96 to 192): the growth lane's last re-ask, 48 to 96, cost about $0.005 for the three aims (PRD §85), so B is of the order of $0.01 to re-ask, an owner-approved paid run, then cached. **C** adds a field per layer: memory and tick cost to measure.
- **Recommendation: A first**, with `r` and the strength as **design** parameters (no paper gives them). B and C only if A shows the cue does work and the lane should be able to choose it.
- **Assays and targets.** There is no literature number to reproduce (see above), so the targets are **design** and the gate is "does no harm": (T1) an ablation, bias on against off, over seeds 1–10 then 11–20: the share of hyphae cells within 3 cells of a cell an ant stood on in the last 60 s (a new probe), higher with the bias; (T2) P1 with flow on and the shipped growth answers: no seed more than 10 % slower to a quarter and the worst seed not worse (`progression.yml`); (T3) no cliff: no seed more than 25 % faster to a quarter, a **design** bound; (T4) reported, not gated: the F2 curtain count at 150 s (21 with three landing tips, 4 with six) and flowers per game (14 in 7 of 20 games).

## Play

- **See:** hyphae on the surface lean toward the ants' paths and the hole instead of fanning out evenly; at 4× it shows as threads that follow a trail for some cells. The Learn text must say the lean is a guess ("no one has shown an insect-killing fungus doing this"), and the Codex entry should call it design.
- **Choose:** none directly, it is groundwork: the lean is a body rule, as thigmotropism is. It makes the fungus's aim matter in one place: a tip that answers `turn` now turns somewhere informed.
- **Counterplay and progression:** colonies still cut hyphae when they dig, groom hosts and remove corpses; surface foragers keep walking over fungus (Pereira et al. 2021), so the lean steers hyphae toward contact. The risk to the slope is a cliff: hyphae reaching ant traffic sooner could bring the quarter forward on some seeds.
- **Cost:** option A, none in Jev tokens and a measured tick cost; cached games still spend nothing. B would re-ask the growth lane once (about $0.01, owner-approved).
- **Risks:** a cliff (T3: the fastest seed's quarter against its baseline); an invisible effect (the lean is subtle: T1's share of hyphae near traffic must rise visibly, and a screenshot pair should show it); a free power-up (an ablation must show cost-free gain only where the fungus has already grown); the bias fighting thigmotropism along tunnel walls (check on the curtain, F2).
- **Owner decisions needed:** body rule or lane (A or B); whether rivals' traffic counts and whether the fungus's own infected hosts do; the layers it applies to; and whether to go ahead at all given that the biology is **design**.

## Open questions

- **For the owner:** pursue A as a body tropism, with the lean flagged as design? Which traffic counts (all ants, the host colony's, infected ants)? The strength and radius (no paper gives them: tune by assays).
- **To research next:** full texts for the *Fusarium* and *Colletotrichum* tropism papers (what exactly the signal and the response are, and the response's strength); whether any *Metarhizium* or *Beauveria* paper shows host- or insect-directed hyphal growth in soil or on cuticle (the search here was one index, abstracts only); and the ant-nest soil literature for where insect-killing fungi are actually found (not fetched).
- **To measure:** the tick cost of A on seeds 1–10; whether the F2 curtain count and seed 6 move at all with the bias (a hypothesis that the lean helps the descent, **unverified**).

## Sources

- Brand A, Gow NAR (2009). Mechanisms of hypha orientation of fungi. *Curr Opin Microbiol* 12:350–357. [doi:10.1016/j.mib.2009.05.007](https://doi.org/10.1016/j.mib.2009.05.007) · [PMC2728830](https://pmc.ncbi.nlm.nih.gov/articles/PMC2728830/) (abstract read)
- Almeida MC, Brand AC (2017). Thigmo responses: the fungal sense of touch. *Microbiol Spectr* 5(2). [doi:10.1128/microbiolspec.funk-0040-2016](https://doi.org/10.1128/microbiolspec.funk-0040-2016) · [PMC11687469](https://pmc.ncbi.nlm.nih.gov/articles/PMC11687469/) (abstract read)
- Turrà D, El Ghalid M, Rossi F, Di Pietro A (2015). Fungal pathogen uses sex pheromone receptor for chemotropic sensing of host plant signals. *Nature* 527:521–524. [doi:10.1038/nature15516](https://doi.org/10.1038/nature15516) (abstract read)
- Pereira H, Willeput R, Detrain C (2021). A fungus infected environment does not alter the behaviour of foraging ants. *Sci Rep* 11:23573. [doi:10.1038/s41598-021-02817-8](https://doi.org/10.1038/s41598-021-02817-8) · [PMC8651729](https://pmc.ncbi.nlm.nih.gov/articles/PMC8651729/) (abstract read)
- Leclerc JB, Pinto Silva J, Detrain C (2018). Impact of soil contamination on the growth and shape of ant nests. *R Soc Open Sci* 5:180267. [doi:10.1098/rsos.180267](https://doi.org/10.1098/rsos.180267) · [PMC6083733](https://pmc.ncbi.nlm.nih.gov/articles/PMC6083733/) (abstract read)
- Ramaswe JB, Steenkamp ET, De Vos L, et al. (2024). Sex pheromone receptor Ste2 orchestrates chemotropic growth towards pine root extracts in the pitch canker pathogen. *Pathogens* 13:425. [doi:10.3390/pathogens13050425](https://doi.org/10.3390/pathogens13050425) · [PMC11124031](https://pmc.ncbi.nlm.nih.gov/articles/PMC11124031/) (**unverified**: title only)
- Rudolph AY, Schunke C, Nordzieke DE (2024). Conserved perception of host and non-host signals via the a-pheromone receptor Ste3 in *Colletotrichum graminicola*. *Front Fungal Biol*. [doi:10.3389/ffunb.2024.1454633](https://doi.org/10.3389/ffunb.2024.1454633) · [PMC11491335](https://pmc.ncbi.nlm.nih.gov/articles/PMC11491335/) (**unverified**: title only)
- Rudolph AY, Schunke C, Sasse C, et al. (2025). Maize diterpenoid sensing via the Ste3 a-pheromone receptor guides oval conidia of *Colletotrichum graminicola*. *Mol Plant Pathol*. [doi:10.1111/mpp.70155](https://doi.org/10.1111/mpp.70155) · [PMC12445352](https://pmc.ncbi.nlm.nih.gov/articles/PMC12445352/) (**unverified**: title only)
- Zhang L, Zhu J, Kang J, et al. (2026). A mechanosensitive ion channel is required for nematode predation in nematode-trapping fungi. *mBio*. [doi:10.1128/mbio.00788-26](https://doi.org/10.1128/mbio.00788-26) · [PMC13463886](https://pmc.ncbi.nlm.nih.gov/articles/PMC13463886/) (**unverified**: title only)
