# Nest spacing: how far apart colonies sit, and how far a founding queen flies

*Part of the [research notes](README.md) behind the [vision](vision.md).*

*Research note, 2026-11-08, bead `ja-lp4.7` (one world, epic `ja-lp4`). Built in U4a (`ja-lp4.4.1`, 2026-11-10) under the code's names: `FLIGHT_2D` and `FOUND_RADIUS` in `game.ts`, `HOLE_GAP_2D` and `CLEARANCE` in `transect.ts` ([one-world §4](one-world.md#4-what-changes-in-the-colony-code), "U4a as built"). One world lands a founding queen at the nearest point her flight's radius allows under the founding rule, and fails the flight when there is none ([one-world §3](one-world.md#3-the-line-and-where-a-new-nest-may-go), [new-queens §3](new-queens.md#3-the-flight-and-founding)). That radius was left open, and the line's two gaps (`HOLE_GAP_2D` and `CLEARANCE`, 12 cells each, in U1's `transect.ts`) had no check against real spacing. The searches were made on 2026-11-08. This session's network allowlist blocked the full texts (core.ac.uk, nature.com and pmc.ncbi.nlm.nih.gov all failed), so every figure comes from search excerpts of abstracts, author PDFs or citing pages. Figures read from an abstract or a citing page are marked **unverified**, and anything that is the game's own invention is marked **design**.*

## TL;DR

- **Mature nests of one species sit about 9–14 m apart** in the harvester ants, and they are spaced more evenly than chance (overdispersed). Call that one *neighbour gap*, U. The game's U is its starting `nestGap`, 140 cells, so 1 m ≈ 10–15 cells.
- **Foragers reach about 1–2 U.** Neighbours' foraging areas meet, and colonies meet at their edges.
- **The spacing is made by deaths, not by where queens land.** Queens land at random. Young colonies near large old ones die. In the red harvester ant a new colony needs about 8 m (0.6–0.9 U) to its nearest neighbour to do well.
- **Founding queens fly far: at least 5 U.** Genetic estimates put a harvester queen's dispersal at about 65 m and a wood ant's at about 60 m. Fire-ant queens land within 2 km.
- **For the game** (§4, all **design**): a queen flies `FLIGHT_2D` = 140 cells (1 U) from her natal hole, and her landing may move up to `FOUND_RADIUS` = 140 cells (1 U; owner, 2026-11-08, after the measurement in §4). `HOLE_GAP_2D` = 16 (raised from 12 by the owner, 2026-11-09, so founded nests' royal chambers never merge: `ja-tjo`) and `CLEARANCE` = 12: both are geometry, far below real spacing, and real spacing should come from contact, not from a gap rule.

## 1. How far apart mature nests are

- **Red harvester ant** (*Pogonomyrmex barbatus*), the New Mexico site: about 300 colonies a year on about 10 ha (Sundaram, Steiner & Gordon 2022, **unverified**). That is 30 colonies a hectare. Randomly placed points at that density would have a mean nearest neighbour of 0.5/√density ≈ 9 m (our arithmetic, the Clark–Evans expectation). The same paper gives about 8 m to the nearest colony in the dense late 1990s (**unverified**: garbled excerpt).
- **Western harvester ant** (*P. occidentalis*): colonies are "highly overdispersed", and mortality is related to nearest-neighbour distance even after allowing for small colonies dying more (Wiernasz & Cole 1995, as cited; **unverified**). A review gives their spacing as about 9–18 m (**unverified**). In Arizona at peak density, 37 nests/ha, nearest neighbours were 10.6–13.6 m apart, and nests covered 1.87 % of the ground (Uhey et al. 2025, repository record, **unverified**). That puts each cleared disc near 5 m², a radius of about 1.3 m (our arithmetic).
- **Desert seed harvesters** (*Veromessor pergandei*, *P. californicus*): intraspecifically overdispersed by a random-placement test, and the mean nearest-neighbour distance rose with diet overlap (Ryti & Case 1984, 1986; abstracts, **unverified**).
- **Fire ant** (*Solenopsis invicta*): monogyne mounds run at about 50–150 per hectare, polygyne at several hundred (Vinson 1997 as cited, **unverified**). The random-placement expectation at 50–150/ha is 4–7 m. Incipient nests are clumped; mature colonies are often regularly spaced (Adams & Tschinkel 1995, *Oecologia*, as summarised; **unverified**).
- **Black garden ant** (*Lasius niger*): 4–16 nests per 100 m² in one Ukrainian grassland, 18 on average and up to 108 in a Central European survey (**unverified**). That is about 1–2.5 m between nests by random expectation: a smaller ant, closer packed.

**In the game:** the starting nests are 140 cells apart (`DEFAULT_WORLD.nestGap`). Read that as one neighbour gap, U ≈ 9–14 m, so 1 m ≈ 10–15 cells. The side view's 340 columns do not carry over: in one world a curtain column is one hex step along the line.

## 2. Where new colonies survive

- **Queens land at random; neighbours decide who lives.** Newly mated *P. barbatus* queens disperse at random, with no evidence they assess the neighbourhood (Gordon 2024, **unverified**). A young colony's chance depends on the age and nearness of its neighbours. One founded close to a large old colony is unlikely to see the next year.
- **The distance.** A new colony was more likely to survive the farther its nearest neighbour was. On average it needed about 8 m, the same as an earlier finding at the site (Sundaram et al. 2022; Gordon 2024; **unverified**). The proposed reason: a large neighbour's foragers overrun the new nest and keep its foragers in.
- **Who meets whom.** About 250 colonies of known age were mapped for six years. One-year-old colonies lay near two- and three-year-olds, not near large ones. Encounters fell with distance between nests, colonies met their large (5+ years) neighbours most, and fights were brief and rarely hurt anyone. The authors suggest that competing for food matters more than fighting (Gordon & Kulig 1996, abstract).
- **Desert ants.** Of 338 foundresses of two species, queens founded away from every established colony. Young *V. pergandei* colonies far from established conspecifics were more active, and the effect was specific to their own species (Ryti & Case 1988, abstract).
- **Fire ants.** Incipient colonies raid each other's brood; the nearer the nests, the more they raid (Adams & Tschinkel 1995, abstract). Mature colonies attack founding queens (Jerome et al., as cited there; **unverified**).

**In the game:** none of this is a rule. A young colony near a stranger lives or dies by the contact response, raids and food ([combat](combat.md)); its mother does not raid it, as it is kin (PRD §50.8). Biology's survival line, about 0.6–0.9 U (80–125 cells), is a target for an assay, not a gap to enforce (§4).

## 3. How far a founding queen flies

- **Red harvester ant.** From the genotypes of 130 queens among about 300 colonies, dispersal was estimated at 65.3 m (95 % CI 51–79.4 m) (Suni & Gordon 2010, author PDF excerpt, **unverified**). The Gordon lab's research page gives "about 150 m", and a later monograph about 70 m (**unverified**). The authors note indirect genetic methods may underestimate dispersal.
- **Western harvester ant.** Colony density across 50 ha falls off with distance from one hilltop where mating swarms form, and density is set mainly by where foundress queens disperse (Cole & Wiernasz 2002, abstract). Two swarms lay about 1,400 m apart, and recruitment varied on about a 1.5 km scale (Billick, Cole & Wiernasz 2004, **unverified**). Queens are reported to fly no more than about 800 m (Wikipedia, *secondary*).
- **Narrow-headed ant** (*Formica exsecta*): parentage traced with markers gave a median dispersal of about 60 m for queens and 140 m for males (Vitikainen, Haag-Liautard & Sundström 2015, repository abstract).
- **Fire ant.** Over 99 % of queens in a flight landed within 2 km of their origin (Markin et al. 1971, as cited; **unverified**). A flight-energetics model limits a queen to under 5 km in still air (Vogt, Appel & West 2000, abstract). Polygyne queens that flew low had not dispersed more than a few hundred metres, by their genotypes (**unverified**).
- **After landing, a queen walks.** Honeypot-ant queens pick a nest site on foot after the flight, with straight runs broken by area-restricted search (Schooley & Bestelmeyer 2000). The walking distances were in a table not read.
- **Not found:** a queen dispersal distance for *Lasius niger*, and nest spacing for *Messor*.

**In the game:** real queens fly at least 5 U (harvester: 65 m ÷ 9–14 m ≈ 5–7 U; fire ant: hundreds of U). The default plane is 512 × 368 cells, about 3.7 × 2.6 U, so a real flight leaves the map. The game must compress it (§4). **Design:** the compression.

## 4. The numbers for the game

Divide each real distance by the local neighbour gap U, then multiply by the game's U, 140 cells.

| What | Real | ÷ U | Cells (× 140) |
|---|---|---|---|
| Mature nearest neighbours | 9–14 m | 1 | 140 (`nestGap`) |
| Foragers, *P. barbatus* | up to 15–20 m (Gordon 2024, **unverified**) | 1.1–2.2 | 150–310 |
| Foragers, *P. occidentalis* | most within 7 m, at most 11–14 m (Crist & MacMahon 1992, abstract; others as cited) | 0.5–0.7, at most 0.8–1.3 | 70–100, at most 110–185 |
| Least distance a new *P. barbatus* colony does well | ~8 m | 0.6–0.9 | 80–125 |
| Cleared disc radius, *P. occidentalis* | ~1.3 m (derived) | ~0.1 | ~13 (the game clears 7: nest r 3 + 4) |
| Queen dispersal, harvester (genetic) | 65 m (51–79) | 4.6–7.2 | 650–1,000 |
| Queen dispersal, fire ant | > 99 % within 2 km | ~290–490 | off any map |

**Proposals (all design):**
1. **`FLIGHT_2D` = 140 cells (1 U).** She flies this far from her natal hole, in a direction drawn from the game's seeded random stream, so a game replays. Real flights are 5 U or more, but the plane holds only 3.7 U, and from a middle nest the edge is under 2 U away. 1 U is the least that carries her past the 0.6–0.9 U where young colonies die beside mature ones. Random direction is what Gordon reports: queens do not choose a neighbourhood.
2. **`FOUND_RADIUS` = 140 cells (1 U); decided by the owner, 2026-11-08 (`ja-lp4.10`).** `nearestValid` may move her landing this far: a round radius, as the crow flies. It stands for her walk after landing, which real queens make (Schooley & Bestelmeyer) though its length was not read. Proposed at 70 (½ U), but measured: flight 140 with a 70-cell radius failed 51% of flights from end nests and 55% from interior ones; with 140, 6% and 28% (`scripts/flight-failure.mjs`, 300 seeds on the default plane). At 70 half of all flights fail wherever the nest is, mostly at the small plane's edges, so failure says nothing; at 140 end nests almost always land and interior ones fail about one time in four, which shows the line growing from its ends. Real foundresses die mostly after landing, of neighbours and raids, which the game has as contact: a geometric failure should be the rare case. **Revisit with the endless world (`ja-qpv`):** without edges, a smaller radius may fail mainly from interior nests; rerun the script then.
3. **`HOLE_GAP_2D` = 16** (owner, 2026-11-09; was 12, `ja-tjo`). At 12, two founded nests' royal chambers could share cells: a founding shaft slants 3 columns to a random side and its royal chamber is a disc of radius 4.5, so holes 12 apart along the curtain merged chambers in 15 of 80 pairs on one world's default curtains (seeds 1–20; `ja-tjo` counted 25 of 80 on side worlds). At 16 none do (16 − 2 × 3 > 2 × 4.5), as the side view's `HOLE_GAP` 16 already keeps (PRD §50.21). It is 0.11 U, about 1.4 m: still under one real cleared-disc diameter (~0.2 U) and far under the 0.6–0.9 U survival line, so it rules out only holes whose nests would merge. Real spacing is made by mortality (§2), and incipient nests are clumped (Adams & Tschinkel 1995). Raising it to 80–125 would script by geometry what contact should do, which is the kind of rule the vision counts as a gap. Rerun at 16 (`scripts/flight-failure.mjs`, 300 seeds), flight 140: radius 70 fails 51 % from end nests and 55 % from interior ones, radius 140 7 % and 28 %, radius 210 1 % and 7 % (at 12: 51/55, 6/28, 1/7).
4. **`CLEARANCE` = 12: keep.** It keeps the curtain from passing under itself. No biology bears on it directly. At 0.086 U it bites only on foundings within about 1 m of the line, which real ones would rarely survive anyway.
5. **`nestGap` = 140 stays the unit.** The check is the ratio of forager reach to it: real foragers reach 1–2 U, so neighbours' foragers should overlap past the midline (70 cells). The game's food sits at least 24 cells (0.17 U) from a nest (`OPEN_WORLD.foodMinDist`); how far its foragers reach has not been measured (open question 1).

## Play

- **See:** a gyne leaves the hole and flies 1 U; a new hole opens beyond an end of the line, or the game says the flight failed and why ("no room beyond the line's ends within her flight"). Daughters land well away from their mother, not on her doorstep.
- **Choose:** nothing new for the player or Jev. The flight is a local rule. The player's choice stays upstream, in the levers that get a queen reared ([new-queens §4](new-queens.md#4-where-the-fungus-comes-in)).
- **Counterplay and progression:** a daughter that lands near a stranger must survive its foragers and raids, as real young colonies must. Failed flights from interior nests make the line's ends the places that spread.
- **Cost:** none to Jev. It is geometry: one `nearestValid` search over a 70-cell disc per flight, once. No situation, legend or question changes.
- **Risks:** too many failed flights (the queen is the game's middle, chapters 5–6), measured as the share failing from end and interior nests on seeds 1–20. Landings off the plane: `FLIGHT_2D` from a nest near the edge leaves the map, and `nearestValid` must pull her back or fail. The compression: a daughter 1 U away competes with her mother for food, where a real one 5 U away would not; kin are never raided, so she survives a neighbour a stranger might not.
- **Owner decisions needed:** none. The radius is 140 (proposal 2; owner, 2026-11-08), to be looked at again with the endless world (`ja-qpv`).

## Open questions

1. **How far do the game's foragers reach?** Measure the 95th-percentile distance of foragers from their hole on the plane once U3 lands. Target 1–2 U (140–280 cells), from the table.
2. **Does contact reproduce the survival line?** An assay: found colonies at set distances from a stranger's mature hole and record which survive. Biology's line is ~0.6–0.9 U (80–125 cells).
3. **The game's cleared disc is half the real ratio** (7 cells against ~13). Matters for the mound on the plane (U3), not for founding.
4. **The queen's walk after landing.** Schooley & Bestelmeyer's table would set `FOUND_RADIUS` from data. So would full texts of Ryti & Case 1986 and Gordon & Kulig 1996, blocked here.
5. **How far a nest's tunnels spread sideways**, which is what `CLEARANCE` protects underground. Not researched.

## Sources

**Spacing and overdispersion**
- Gordon D. M. & Kulig A. W. (1996). Founding, foraging, and fighting: colony size and the spatial distribution of harvester ant nests. *Ecology* 77: 2393–2409. [doi:10.2307/2265741](https://esajournals.onlinelibrary.wiley.com/doi/10.2307/2265741) (abstract via search)
- Sundaram M., Steiner E. & Gordon D. M. (2022). Rainfall, neighbors, and foraging: the dynamics of a population of red harvester ant colonies 1988–2019. *Ecol. Monogr.* 92: e1503. [doi:10.1002/ecm.1503](https://esajournals.onlinelibrary.wiley.com/doi/10.1002/ecm.1503) · [Stanford PDF](https://web.stanford.edu/~dmgordon/articles/doi/10.1002_ecm.1503/EcologicalMonographs2022.pdf) (search excerpts only)
- Gordon D. M. (2024). The life history of harvester ant colonies. *Phil. Trans. R. Soc. B* 379: 20230332. [royalsocietypublishing.org](https://royalsocietypublishing.org/rstb/article/379/1916/20230332/109616/The-life-history-of-harvester-ant-coloniesThe-life) · [AntWiki PDF](https://antwiki.org/w/images/a/ab/Gordon,_D.M._(2024)_The_life_history_of_harvester_ant_colonies._Philosophical_Transactions_of_the_Royal_Society_(10.1098@rstb.2023.0332).pdf) (search excerpts only)
- Wiernasz D. C. & Cole B. J. (1995). Spatial distribution of *Pogonomyrmex occidentalis*: recruitment, mortality and overdispersion. *J. Anim. Ecol.* 64: 519–527. doi:10.2307/5654. Reached only as cited. **unverified**
- Uhey D. A. et al. (2025). Colony densities and spatial patterns of harvester ants (*Pogonomyrmex occidentalis* and *P. rugosus*). *Environ. Entomol.* 54: 764–772. [doi:10.1093/ee/nvaf044](https://academic.oup.com/ee/article/54/4/764/8167674) · [NAU record](https://experts.nau.edu/en/publications/colony-densities-and-spatial-patterns-of-harvester-ants-pogonomyr-2/) (abstract and record)
- Ryti R. T. & Case T. J. (1984). *Oecologia* 62: 401–404 (overdispersion and diet overlap in three desert ants). Search summary only. **unverified**
- Ryti R. T. & Case T. J. (1986). Overdispersion of ant colonies: a test of hypotheses. *Oecologia* 69: 446–453. [doi:10.1007/BF00377067](https://link.springer.com/doi/10.1007/BF00377067) (abstract opening)
- Fire-ant mound densities (Vinson 1997, as cited): [Morisawa, *Solenopsis invicta* species summary](https://www.invasive.org/gist/moredocs/solinv01.pdf) *(secondary)*
- *Lasius niger* nest densities: [Zoodiversity (Ukraine)](https://ojs.akademperiodyka.org.ua/index.php/Zoodiversity/article/download/502/241) (search excerpt; the Central European survey reached only as cited there). **unverified**

**Where new colonies survive**
- Ryti R. T. & Case T. J. (1988). The regeneration niche of desert ants: effects of established colonies. *Oecologia* 75: 303–306. [doi:10.1007/BF00378614](https://link.springer.com/article/10.1007/BF00378614) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/28310851/) (abstract)
- Adams E. S. & Tschinkel W. R. (1995). Effects of foundress number on brood raids and queen survival in the fire ant *Solenopsis invicta*. *Behav. Ecol. Sociobiol.* 37: 233–242. [FSU PDF](https://www.bio.fsu.edu/~tschink/publications/1995-7.pdf) (abstract via search)
- Adams E. S. & Tschinkel W. R. (1995). The spatial study of incipient fire-ant colonies, *Oecologia* 102: 156–163 (clumped incipient nests, regular mature ones). Reached only as described in a search summary; title not read. **unverified**

**Foraging range**
- Crist T. O. & MacMahon J. A. (1992). Harvester ant foraging and shrub-steppe seeds: interactions of seed resources and seed use. *Ecology* 73: 1768–1779. doi:10.2307/1940028 (abstract via search; the 2–7 m and 7–12 m zones from a citing paper, **unverified**)
- *P. occidentalis* maximum foraging distances of 11.0 and 14.3 m (Rogers 1974; Usnick 2000): reached only as cited. **unverified**
- *P. barbatus* forays up to ~20 m: see [ant-communication §2](ant-communication.md#2-distance-and-time-scales) and [tiredness](tiredness.md)

**Queen dispersal**
- Suni S. S. & Gordon D. M. (2010). Fine-scale genetic structure and dispersal distance in the harvester ant *Pogonomyrmex barbatus*. *Heredity* 104: 168–173. [doi:10.1038/hdy.2009.124](https://www.nature.com/articles/hdy2009124) · [author PDF](https://web.stanford.edu/~dmgordon/articles/other/heredity-104/Suni_Gordon2009.pdf) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/19773807/) (search excerpts only). "About 150 m": [Gordon Lab research page](https://web.stanford.edu/~dmgordon/old2/research.html) *(secondary)*
- Cole B. J. & Wiernasz D. C. (2002). Recruitment limitation and population density in the harvester ant, *Pogonomyrmex occidentalis*. *Ecology* 83: 1433–1442. [doi:10.1890/0012-9658(2002)083[1433:RLAPDI]2.0.CO;2](https://esajournals.onlinelibrary.wiley.com/doi/10.1890/0012-9658(2002)083%5B1433:RLAPDI%5D2.0.CO;2) · [author PDF](http://nsmn1.uh.edu/bcole/pogo/bcdwecology.pdf) (abstract via search)
- Billick I., Cole B. J. & Wiernasz D. C. (2004). Scale of recruitment limitation in the western harvester ant. *Ann. Entomol. Soc. Am.* 97: 738–742. [academic.oup.com](https://academic.oup.com/aesa/article/97/4/738/9617) (fragmentary abstract, **unverified**)
- *Pogonomyrmex occidentalis*. [Wikipedia](https://en.wikipedia.org/wiki/Pogonomyrmex_occidentalis) *(secondary)*
- Vitikainen E. I. K., Haag-Liautard C. & Sundström L. (2015). Natal dispersal, mating patterns, and inbreeding in the ant *Formica exsecta*. *Am. Nat.* [Exeter repository](https://ore.exeter.ac.uk/repository/handle/10871/19242) (abstract)
- Markin G. P. et al. (1971). Fire-ant mating flights (*Florida Entomologist*). Reached only as cited. **unverified**
- Vogt J. T., Appel A. G. & West M. S. (2000). Flight energetics and dispersal capability of the fire ant, *Solenopsis invicta* Buren. *J. Insect Physiol.* [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0022191099001584) (abstract via search)
- Unusual behavior of polygyne fire ant queens on nuptial flights. *J. Insect Behav.* [link.springer.com](https://link.springer.com/article/10.1023/A:1007770404496) (search summary only, **unverified**)
- Schooley R. L. & Bestelmeyer B. T. (2000). Movements during colony founding by queens of the honeypot ant (*Myrmecocystus mimicus*). *Am. Midl. Nat.* [Jornada PDF](https://archive.jornada.nmsu.edu/files/bibliography/JRN00306.pdf) (search excerpts; distances not read)
