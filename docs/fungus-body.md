# The fungus's body and how it adapts

*Research + design (built: `ja-lo8.12`, `web/src/colony/evolution.ts`). The question: what the game's fungus should be made of, and what its progress should rest on, so that neither is a currency conjured from nothing. The searches were made on 2026-11-07. The search tool's filter refused three queries (soil persistence in general, spores per cadaver, virulence lost on media and restored by passage), and full texts on PubMed Central and eLife could not be opened from the session. So the claims below rest on abstracts, repository records and press summaries, and their figures are marked **unverified** where only a summary gave them.*

## TL;DR

- **The fungus can live off the host.** *Metarhizium* is rhizosphere-competent and persists in soil for months to more than a year; as a root endophyte it trades insect nitrogen to plants. So a mycelium at the landing that grows on the ground without an ant is grounded (§1).
- **Spores cost the mycelium: design, not found.** No source found ties conidia to mycelial mass at a rate. The game pays spores out of the mycelium's mass so that nothing is conjured; the rate is design (§2).
- **It adapts in its hosts.** *Metarhizium* passed through groups of grooming ants for ten cycles evolved more spores and less of the cue groomers detect (§3).
- **Adaptation speeds up far less than replication.** In experimental evolution, a hundredfold more mutation supply bought far less than a hundredfold faster adaptation (§3).
- **In the game, with some licence (owner):** mutations come at a fixed share of all new fungus, on the ground and in ants, so a fast-growing fungus mutates fast; the player chooses which to keep, and each level of an upgrade asks more mutations than the last, standing in for diminishing returns and for selection.
- **Grooming is triggered by sensing the pathogen** (fungal ergosterol on an ant; changed cuticular hydrocarbons on infected brood), and queens end up with lower loads. Whether ant queens get more groomers than workers was not found (§4). The game's larger cap for a queen is a stop-gap, tracked as a vision gap (`ja-k4k.12`).

## 1. Growth without a host

- *Metarhizium anisopliae* tagged with GFP kept growing in the rhizosphere of field cabbage: it is **rhizosphere-competent** (Hu & St. Leger 2002).
- As an endophyte, *M. robertsii* moved insect-derived nitrogen into bean and switchgrass, 28 % and 32 % of their nitrogen after two weeks in microcosms (Behie et al. 2012). The authors note that how common this is in the field is unknown.
- After field application, *Metarhizium* persisted for months to over a year, varying by strain and formulation: up to 12 months in Brazilian strawberry soil and rhizosphere, over 250 days for *M. brunneum*, the whole 66-week follow-up for *M. acridum* in Mexico (with its soil titre rising to about 4× and ending near half the start), and above background in Austrian maize only with yearly reapplication. **Unverified:** these figures come from search summaries, not the papers.

**In the game:** where the fungus lands it takes root: a mycelium by the hole whose mass grows logistically to what its patch can hold (`BODY.growth`, the *Mycelium* upgrade's capacity). The rates are design: the literature gives persistence over months, not growth per second at ant scale.

## 2. What spores cost

- **Not found.** No source in this search gives conidia per cadaver or ties sporulation to mycelial mass or nutrients at a rate.
- The only indirect result is §3's: lines passed through ant groups evolved higher spore production.

**In the game (design):** the mycelium puts out spores onto its patch at a share of its mass a second (the *Fruiting body* upgrade), and every spore is paid out of that mass. So the patch settles where growth meets sporulation; a thicker fruiting body gives more spores from a smaller mycelium.

## 3. Adapting to hosts

- *Metarhizium* was passed through Argentine ants for **ten infection cycles**. Lines passed through **grooming groups** made more spores than lines passed through single ants, and became harder to detect: they carried much less ergosterol, and ants groomed them less ("Pathogen evasion of social immunity", *Nat Ecol Evol* 2023; Cremer lab, ISTA). **Unverified:** the details come from a press summary; the author list was not confirmed.
- In *E. coli*, varying population size and mutation rate about a hundredfold each sped adaptation far less than proportionally; above the lowest mutation rate it barely changed, which the authors put down to clonal interference (de Visser et al. 1999). This is bacterial, but it argues against "more replication, proportionally faster adaptation".
- Virulence lost on artificial media and restored by passage through hosts: **not found** (the query was refused).

**In the game** (PRD §50.13–14): every bit of new fungus is a chance to mutate, so **mutations** come at a fixed share of its growth (`MUTATION`): the mycelium growing on the ground, and load passing on contact in hosts, where the source keeps its load (`Evolution.replicate`, `Evolution.grow`). Spores an ant picks up are fungus moved, not made, so they count once, when the mycelium grew them. That counts growth on the substrate too, against the passage result above, which ties adaptation to hosts: a licence taken for the game's sake, since a mutation can arise in any replication; what it is selected for is the game's choosing. The player decides which mutations to keep, and each level of an upgrade costs more than the one before, standing in for selection and for the diminishing returns above. The upgrades themselves follow the evolved traits loosely: *Stealth* (less shown to groomers) and *Fruiting body* (more spores) are what the passage lines evolved; *Infectivity*, *Persistence* and *Immune evasion* are design.

## 4. Grooming and the queen

- Intense allogrooming of exposed *Lasius neglectus* passed spores on and gave nestmates low-level infections that upregulated their immune genes (Konrad et al. 2012).
- Groomers add formic acid from their poison gland, which inhibits spores on brood and in their mouths (Tragust et al. 2013).
- After pathogen exposure, *Lasius niger* changed their contact network to slow transmission, and the queen ended with a lower pathogen load (Stroeymeyt et al. 2018).
- Workers found infected pupae by the pupae's own chemical sickness cues during incubation (Pull et al. 2018). **Unverified:** the cue compounds and the effect of washing off cuticular hydrocarbons come from a secondary summary.
- Ants groom more, and target the most infectious nestmates, when they sense high spore load, and groom less for a while after being groomed (Casillas-Pérez et al. 2023). How they sense load is unknown; fungal ergosterol triggers intense grooming (*Nat Ecol Evol* 2023, §3).
- Mixed: exposed ants groomed themselves more and others less (Theis et al. 2015); *Myrmica rubra* detect diseased nestmates but may not single them out (Leclerc & Detrain 2016).
- Queens: workers form a retinue around a stationary queen, and *Solenopsis invicta* queen extracts attract workers; stationary *Myrmica rubra* queens were groomed by "a few workers". **Not found:** attendant counts for ant queens, or evidence that queens get more groomers than workers. Whether recognising a nestmate is a prerequisite for grooming it: **not found**.

**In the game:** grooming is still scripted (every nestmate within reach, by colony, up to a cap), and the queen's larger cap (`queenGroomers`) is a stop-gap with no source behind its number. Making grooming a sensed response (the pathogen cue, recognition by odour, the retinue drawn by queen pheromone) is `ja-k4k.12`, a row in the [vision gap table](vision.md#where-the-code-is-today).

## Play

Built: PRD §50.12–14.
- **See:** spores drawn on the ground by the hole, where foragers keep walking through them. The Fungus panel shows the mycelium, the fungus in ants, mutations a minute and each upgrade's next level; a notice says when there is one to keep. A followed host's card shows a held lever as what it runs, "(wants …)". The Learn entry is "The fungus's body, and its mutations" (`guide.ts`, `evolution`).
- **Choose:** which mutations to keep. The body (Infectivity, Persistence, Mycelium, Fruiting body, Immune evasion) or reach (Stealth, Senses, Recognition, Trails, Royal), each a group of levers. By 20 minutes about half of everything is kept, so the order matters (§50.13). It is the slope every lever sits on, not a lever itself.
- **Counterplay and progression:** groomers take more off a visible host than the weak strain passes on (four, a queen eight in the evolving game; still scripted, `ja-k4k.12`). Primed hosts resist, which Immune evasion answers. The slope: a first choice 12–21 s after the landing, a quarter of the colony at 156–241 s, the queen at 182–314 s; keeping nothing, never in 15 minutes (§50.14). The spore brush was removed because it skipped all of this (§50.15).
- **Cost:** none. No request changed, reach acts after the answer, and an upgrade re-asks nothing (§50.12–14). The fungus lane stays at about 708 real tokens per situation (§50.9).
- **Risks:** a cliff at the breakthrough, the choice that tips transmission over grooming (§50.12); watch the worst seed's time to a quarter in `scripts/progression.mjs`. Runaway after it: once the nest is held, the colony's resistance climbs to 0.7–0.9, yet the fungus keeps 100 % on every seed (§50.12). A free lever: crown and the odour weapon are held to no reach, so they act at full strength from the first second (`ja-lo8.16`).
- **Owner decisions needed:** whether a colony should claw back once the nest is held, and whether Lockpick and Bloom come back as something the game unlocks (both `ja-lo8.10`, §50.12, §50.15); how the lethal levers are reached (`ja-lo8.16`).

## Sources

- Hu G, St. Leger RJ (2002). Field studies using a recombinant mycoinsecticide (*Metarhizium anisopliae*) reveal that it is rhizosphere competent. *Appl Environ Microbiol* 68(12):6383–6387. DOI not confirmed: [PubMed search](https://pubmed.ncbi.nlm.nih.gov/?term=Hu+St+Leger+2002+Metarhizium+rhizosphere+competent)
- Behie SW, Zelisko PM, Bidochka MJ (2012). Endophytic insect-parasitic fungi translocate nitrogen directly from insects to plants. *Science* 336:1576–1577. [doi:10.1126/science.1222289](https://doi.org/10.1126/science.1222289)
- Persistence in the field (summaries; per-study DOIs not confirmed): [PubMed 36836343](https://pubmed.ncbi.nlm.nih.gov/36836343/); [Agroscope publication 48242](https://ira.agroscope.ch/en-US/publication/48242); [Maynooth review, 2016](https://mural.maynoothuniversity.ie/id/eprint/10004/1/RA-Persistence-2016.pdf)
- Pathogen evasion of social immunity (2023). *Nature Ecology & Evolution*. [doi:10.1038/s41559-023-01981-6](https://doi.org/10.1038/s41559-023-01981-6); summary *(secondary)*: [phys.org, 2023](https://phys.org/news/2023-02-natural-sneaky-germs-ants.html)
- de Visser JAGM, Zeyl C, Gerrish PJ, Blanchard JL, Lenski RE (1999). Diminishing returns from mutation supply rates in asexual populations. *Science* 283:404–406. DOI not confirmed: [PubMed search](https://pubmed.ncbi.nlm.nih.gov/?term=de+Visser+1999+diminishing+returns+mutation+supply)
- Konrad M, Vyleta ML, Theis FJ et al. (2012). Social transfer of pathogenic fungus promotes active immunisation in ant colonies. *PLoS Biol* 10(4):e1001300. [doi:10.1371/journal.pbio.1001300](https://doi.org/10.1371/journal.pbio.1001300)
- Tragust S, Mitteregger B, Barone V, Konrad M, Ugelvig LV, Cremer S (2013). Ants disinfect fungus-exposed brood by oral uptake and spread of their poison. *Curr Biol* 23:76–82. [doi:10.1016/j.cub.2012.11.034](https://doi.org/10.1016/j.cub.2012.11.034)
- Stroeymeyt N, Grasse AV, Crespi A, Mersch DP, Cremer S, Keller L (2018). Social network plasticity decreases disease transmission in a eusocial insect. *Science* 362:941–945. [EPFL record](https://infoscience.epfl.ch/handle/20.500.14299/151636)
- Pull CD, Ugelvig LV, Wiesenhofer F et al. (2018). Destructive disinfection of infected brood prevents systemic disease spread in ant colonies. *eLife* 7:e32073. [doi:10.7554/eLife.32073](https://doi.org/10.7554/eLife.32073)
- Casillas-Pérez B, Bodová K, Grasse AV, Tkačik G, Cremer S (2023). Dynamic pathogen detection and social feedback shape collective hygiene in ants. *Nat Commun*. [doi:10.1038/s41467-023-38947-y](https://doi.org/10.1038/s41467-023-38947-y)
- Theis FJ, Ugelvig LV, Marr C, Cremer S (2015). Opposing effects of allogrooming on disease transmission in ant societies. *Phil Trans R Soc B*. [ISTA record](https://research-explorer.ista.ac.at/record/1830)
- Leclerc JB, Detrain C (2016). Ants detect but do not discriminate diseased workers within their nest. *Sci Nat*. [ULB repository PDF](https://dipot.ulb.ac.be/dspace/bitstream/2013/234774/3/20LeclercDetrain2016SciNat.pdf)
- Queen retinue (attraction; exact papers not confirmed): [Springer, BF02765376](https://link.springer.com/article/10.1007/BF02765376); [Pherobase L30342](https://pherobase.com/literature/data/details/L/30342); *Myrmica rubra* queens: [Springer, BF02223689](https://link.springer.com/content/pdf/10.1007%2FBF02223689.pdf)
