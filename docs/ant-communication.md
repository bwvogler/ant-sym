# Ant communication: what the biology says, and what it means for the colony game

*Research note, 2026-10-31. Sources are primary papers and reviews found by web search. Most full texts could not be opened from the research session, so every number below comes from an abstract or a citing paper. Anything not confirmed is marked **unverified**. Game numbers come from `web/src/colony/` at commit `b50cfde`.*

## TL;DR

| Question | Biology | Game today | Verdict |
|---|---|---|---|
| How many channels? | A colony uses **10–20 signal types**, mostly chemical (*S. invicta*: 13). Foraging alone uses **≥3 trail pheromones** in Pharaoh's ant. One species can run **5 recruitment systems** from a few glands. | 3 chemical fields per colony (food, home, alarm) + enemy sight | Plausible. Room for 1–2 more, chosen carefully. |
| Trail lifetime | **Minutes to days.** Short-lived recruitment trails last minutes. Long-lived "route memory" trails last hours to days. | Food t½ 12 s, home 35 s | Like a short-lived recruitment trail. The long-lived memory layer is missing. |
| Alarm | Volatile, reach of a few cm, fades fast. **Meaning depends on concentration**: faint attracts, strong triggers attack or digging. | t½ 2.8 s, reach ~5 cells. Every mode but *fight* flees it. | Range is right. The graded meaning is missing. |
| Rival colonies | Recognised **on contact** by cuticular hydrocarbons. Rivals **do read each other's marks**: foreign territory marks raise aggression, and fighting on your own scent gives an edge. | Each colony's fields are invisible to the other. Enemies are seen only within 2 cells. | The biggest gap, and the richest one for the game. |
| Combat law | Lanchester's **square law was rejected** in fire ants (strength grows about linearly with group size). Terrain changes the law: complex ground favours strong soldiers over big armies. | Hazard ∝ enemies ÷ allies in the 3×3 cells around the ant | Fine as it is. Rock could modulate it. |
| Distance scale | Foraging ranges of **~20 m** (harvester ants) to **>100 m** (desert ants), i.e. thousands of body lengths. | 160×100 cells; at 1 cell ≈ 1 body length, that is about 0.6 × 0.4 m | The map is a zoomed-in patch. Keep the *ratios* (below), not the absolute sizes. |

## 1. How many channels?

**Whole repertoire.** Hölldobler & Wilson (*The Ants*, ch. 7) estimate that "the typical ant colony operates with somewhere between 10 and 20 kinds of signals, and most of these are chemical". The fire ant *Solenopsis invicta* has 13 identified signals. Britannica's comparison puts social insects at 10–20 signals, against 5–6 for the simplest non-social animals and 30–40 for social vertebrates.

**Foraging alone uses several.**
- Pharaoh's ant (*Monomorium pharaonis*) has at least three trail pheromones (Robinson et al. 2008):
  - a long-lasting attractive one, still detectable after days without use;
  - a short-lived attractive one (≈ 20 min, per a *Current Biology* primer);
  - a short-lived **repellent "no entry"** signal laid on unrewarding branches (Robinson et al. 2005, *Nature*). It was the first negative trail pheromone found. Ants change course about 15 body lengths before the fork.
- The same primer notes that five (and maybe more) signals seem to be needed for foraging, and that nobody yet knows why.

**One species, five recruitment systems.** The African weaver ant *Oecophylla longinoda* (Hölldobler & Wilson 1978) recruits nestmates:
1. to new food: rectal-gland odour trail;
2. to new terrain: rectal-gland trail;
3. to a new nest site (emigration);
4. against intruders nearby: sternal-gland attractant;
5. against intruders far away: trail.

Four of the five reuse the same trail, told apart by tactile display and context. The authors call this **signal economy**: few molecules, many meanings. That suits a game that keeps channels few and lets the *situation* set their meaning.

**Glands and receivers.**
- About 115 exocrine glands are described across ants (Billen & Wang 2025). That is a count for the whole family; a single species has far fewer.
- Ants have some of the largest insect odorant-receptor repertoires: more than 300 genes in several genomes. About a third belong to the "9-exon" subfamily, which detects cuticular hydrocarbons.
- In the clonal raider ant, females have 288 glomeruli in the antennal-lobe cluster for that subfamily; males have 15. Ants can *receive* far more than they *send*, and most of that receiving power goes to telling friend from foe.

**Non-chemical channels**, all short range:
- **Stridulation** (leafcutters, *Atta*). Substrate vibration recruits nestmates to cutting sites, draws diggers, and may first have evolved to rescue buried nestmates (Markl 1973). Recruits orient by the arrival-time difference between their legs.
- **Antennal contact as a rate signal** (harvester ants; Gordon; Prabhakar, Dektar & Gordon 2012). How often outgoing foragers meet foragers returning with food sets how many leave. Returns arrive roughly as a Poisson process. The colony regulates foraging **with no spatial information at all**, like TCP flow control.
- **Trophallaxis.** Mouth-to-mouth fluid carries hydrocarbons, proteins, microRNAs and juvenile hormone (LeBoeuf et al. 2016, *eLife*). It is a private channel that shapes larval development.
- **Tandem running** (*Temnothorax*). A leader walks slowly and waits for the follower: the first accepted case of teaching in animals (Franks & Richardson 2006). Once a quorum of ants is at the new site, recruiters switch to carrying nestmates, about 3× faster (Pratt et al. 2002).

**For the game:** three chemical channels per colony is well within biology. Players can read about 5 at most, and each one added to the situation multiplies the Jev question space (§5). Add channels to **steering**, which is free, before adding them to the **situation**, which is paid.

## 2. Distance and time scales

### What the literature gives

| Thing | Value | Source |
|---|---|---|
| Harvester ant foraging trails | radiate **up to ~20 m**. Foragers return to within ~0.5 m of the last site. | Gordon; Beverly et al. 2009 |
| Desert ant (*Cataglyphis*) forays | **>100 m**, steered by path integration (step counting + sky compass). Error grows with distance. | Wehner lab |
| Desert ant top speed | **~0.4 m/s ≈ 40 body lengths/s** | stepping-kinematics study |
| Pharaoh's ant short-lived trail | **half-life a few minutes to ~25 min, depending on surface** (paper is faster than plastic). Reports differ: 3/9 min and 8/25 min on paper/plastic. | Jeanson et al. 2003 |
| Pharaoh's ant long-lived trail | **days** | Robinson et al. 2008 |
| *Lasius niger* trail | a weak trail becomes undetectable after **~47 min**. Strong trails last **8–24 h**. | Beckers et al. 1993; Evison et al. 2008 (via citing papers) |
| Fire ant artificial trail | **3.5–7 min** on glass, **up to 20 min** on paper | Wilson 1962 |
| Fire ant trail active space | a vapour cloud of **≤ ~1 cm** radius over the trail | *Current Biology* review |
| Alarm pheromone | volatile, short fade. Exact radius and time figures (Bossert & Wilson 1963) are **unverified**. | — |
| Trail fork angle | **~60°** forks give a lost ant the most reliable way home (*polarity*) | Jackson, Holcombe & Ratnieks 2004 |
| *Lasius niger* body length | 3–5 mm | — |

### What the game uses

Calculated from `pheromone.ts` and `colony.ts`. Evaporation is a per-second rate *k*, so t½ = ln 2 / *k*. Diffusion relaxes each cell toward its 4-neighbour mean at rate *d*, which works out to a diffusivity of *D* = *d*/4 cells²/s. The RMS spread over one mean lifetime is √(4·D/k).

| Channel | evaporation | t½ | spread over a lifetime |
|---|---|---|---|
| food | 0.06 /s | **11.6 s** | ~2.2 cells |
| home | 0.02 /s | **34.7 s** | ~3.9 cells |
| alarm | 0.25 /s | **2.8 s** | ~1.8 cells, plus 3-cell sensor reach ≈ **5 cells** |

Speed is 7 cells/s. Food patches sit at least a quarter of the map from each nest, so a one-way trip is about 6–17 s in a straight line, longer with wandering.

### Reading it as ratios

Absolute sizes don't transfer. At 1 cell ≈ 1 body length, the map is about 0.6 × 0.4 m: one corner of a harvester ant's foraging range. Ratios do transfer:

1. **Trail half-life ÷ round trip.**
   - Game food trail: ≈ 0.5–1×.
   - Real short-lived recruitment trails: of the same order (fire ant trails fade in minutes, about as long as a trip).
   - Real long-lived trails: ≫ 10×.
   - So the game has a good *recruitment* trail and no *memory* trail. That is why a depleted patch's trail disappears quickly, and why the code needed the *tired* rule to break ant mills: there is no "no entry" signal to do that job.
2. **Alarm reach ÷ ant spacing.** Real alarm reaches a few centimetres, i.e. a handful of body lengths, so it calls the nearby ants and not the whole colony. The game's ~5 cells is right.
3. **Sensor reach.** Real ants sample with their antennae, about 1 body length ahead, and compare left against right (osmotropotaxis). Removing one antenna makes tracking worse but does not stop it (Draft et al. 2018). The game's 3-cell sensors are long-sighted but a fair abstraction at this map scale.
4. **Speed.** 7 cells/s is about 7 body lengths/s: plausible for a temperate walker, well below *Cataglyphis*' 40. The *Lasius* figure is **unverified**.

## 3. Rival colonies

**Recognition is by contact.** Colony identity is a blend of cuticular hydrocarbons (C20–C40 alkanes, methyl-branched alkanes, alkenes), read by antennation. In *Pogonomyrmex barbatus*, glass blocks coated only with a non-nestmate's hydrocarbons drew aggression. Causality is still debated in some species (fire ants, *Atta*). Range is effectively zero: you know an ant is foreign when you touch it.

**But colonies read each other's ground.**
- **Weaver ants have a colony-specific territorial pheromone** (Hölldobler & Wilson 1977, *PNAS*). Persistent anal spots of rectal fluid are scattered over owned ground. Workers that find **alien** marks become more aversive and aggressive, and recruit more. A colony entering ground soaked in **its own** scent gains an initial advantage in warfare. This was the first true territorial pheromone found in social insects.
- **Garden ants leave colony-specific footprints** (Lenoir et al. 2009; Devigne & Detrain). Passive hydrocarbon traces from the tarsi are colony-specific, but only in the methyl-branched alkanes. Their density falls with distance from the nest, so a mark's strength tells an ant how many nestmates have walked there: a cue, not a deliberate signal. The inner nest walls are *not* colony-specific, which may be why intruders already inside are tolerated.
- **Trail chemicals are often shared, even across species.** Six myrmicine genera use the same trail pheromone. *Lasius niger*, *Camponotus modoc* and *Myrmica rubra* respond to each other's trails when they live together. Colony specificity comes from added hydrocarbons. Whether same-species rivals follow each other's *trails* was **not established** in this pass.

**How fights escalate, and their scale.**
- **Enemy specification** (*Pheidole dentata*; Wilson 1975, 1976). One fire-ant worker is enough to set off the full response: minors lay an alarm trail that brings 10+ majors. The response is graded:
  - as invasions grow, minors lay fewer trails and the fighting moves closer to the nest;
  - at the highest intensity the colony **abandons the nest with its brood**.
- **Tournaments** (*Myrmecocystus mimicus* honeypot ants; Hölldobler 1976, *Science*). Hundreds of ants stage stereotyped display fights instead of real ones. When one colony is clearly stronger, it **raids the weaker one and takes its brood and workers**: the first intraspecific slavery recorded in ants. Bigger colonies win more tournaments.
- **Propaganda pheromones** (slave-maker *Formica subintegra*; Regnier & Wilson 1971). Raiders spray Dufour's-gland acetates, about 700 µg per worker or ~10 % of body weight. The spray works as alarm: it **scatters the defenders and draws in the raiders**. In effect, a chemical weapon written into the enemy's own channel.
- **Nasty neighbours.** Aggression is higher between adjacent colonies. In contests over food, the closer colony often wins because it recruits faster: "recruitment success is tied to combat success" (Champer & Schlenoff 2024).
- **Borders.** *P. barbatus* territories are set by encounters at the far edges of each colony's foraging area, and core areas (trunk trails and nest yards) do not overlap. Argentine-ant supercolonies show no aggression inside one colony across ~6,000 km of southern Europe (Giraud et al. 2002), but sharp, lethal borders between supercolonies (16 contact zones; Thomas et al. 2006). One border near San Diego reportedly cost ≥15 million workers in 6 months (press release; attribution unclear).

**Combat maths.**
- Fire-ant battles **rejected Lanchester's square law**: group fighting ability rose roughly linearly with group size (Plowes & Adams 2005).
- **Terrain matters** (Lymbery, Webber & Didham 2023, *PNAS*). Simulations and real battles (Australian meat ants against invasive Argentine ants) show complex terrain favours small armies of strong soldiers, and open ground favours numbers.
- The game's local enemies ÷ allies hazard is close to the linear-law evidence. Rock is the obvious terrain modifier.

## 4. Implications for the game, cheapest first

Each item says whether it touches the Jev situation (paid) or only steering and mechanics (free). The ant situation today has 1,296 possible values, of which a real game meets a few hundred.

1. **"No entry" mark on empty food (free, steering only).** An ant that reaches a food trail's end and finds the food gone lays a short-lived repellent: Pharaoh's ants do this. It is a biological fix for ant mills, and it may make the *tired* rule less load-bearing. It could share the alarm field or be a 4th channel used only by sensors.
2. **A long-lived route-memory layer (free).** A second, slow food channel (t½ ≥ 10× round trip) that only strong, repeated traffic builds. Established routes then survive a lull, the way *Lasius* and Pharaoh's trails do. The situation keeps reading the max of the two, so the key doesn't change.
3. **Territory = footprints, readable by both colonies (free to cheap).** Make the *home* field the colony's passive footprint (it already is, in effect: laid by outbound ants and densest near the nest), and let each colony read the other's. Then:
   - in `battle.ts`, fighting on your own footprint lowers the hazard a little (the weaver-ant "own scent" edge) — free;
   - foreign footprint counts toward the existing `enemy: near` situation (zero new situations), or becomes its own binary dimension (×2 situations, 2,592 in all).
4. **Graded alarm (cheap).** Faint alarm attracts and strong alarm triggers attack (*Pogonomyrmex*), instead of everything but *fight* fleeing. The situation already has none / faint / strong, so this is a steering change plus legend wording, with no new situations. Ants that *meet* an enemy should lay alarm too, not only ants that fight (*Pheidole* minors recruiting majors).
5. **Terrain-dependent combat (free).** In `battle.ts`, cap how many enemies count at once by the open cells around the ant. Narrow passes then favour defenders, as in Lymbery et al. 2023.
6. **Rate-based foraging regulation (free, nest level).** Let the outgoing forager rate track how often foragers come home with food (Gordon). It suits the strategist's coarse view and needs no map.
7. **Propaganda brush (free, player tool).** Let the fungus paint alarm into the *rival's* field. That is the slave-maker's trick, and it shows off the per-colony fields.
8. **Tournaments before raids (later).** A display phase where two fronts compare headcounts, and the clearly weaker side retreats or is raided. It is a natural strategist question for Jev ("who is stronger here?"). Its cost is one stance-lane question per encounter.

**Keep as is.**
- **Three chemical channels per colony.** That matches the low end of real foraging repertoires.
- **Alarm range and fade.** The ratios match biology.
- **Enemy detection by proximity.** It matches contact recognition.
- **The local, roughly linear combat hazard.** It matches the fire-ant data better than a square law would.

## 5. Cost note

No schema change here. If a later change adds a binary situation dimension (item 3, second form), the ant question space doubles to 2,592. From the MR 4 measurements, war situations met per doctrine would rise from ~460 toward ~900 at ~440 tokens each: still about $0.02 per doctrine, but measure it with `npm run colony-cost` before and after.

## Sources

- Hölldobler & Wilson, *The Ants*, ch. 7 (AntWiki excerpt): https://www.antwiki.org/wiki/The_Ants_Chapter_7
- Communication in ants (*Current Biology* primer): https://www.cell.com/current-biology/fulltext/S0960-9822(06)01834-3
- Britannica, animal communication (repertoire sizes): https://www.britannica.com/science/animal-communication
- Czaczkes, Grüter & Ratnieks 2015, Trail pheromones: an integrative view (*Annu Rev Entomol* 60:581): https://www.annualreviews.org/content/journals/10.1146/annurev-ento-010814-020627
- Robinson et al. 2005, "No entry" signal in ant foraging (*Nature* 438:442): https://sro.sussex.ac.uk/id/eprint/22787/ · ScienceNews summary: https://sciencenews.org/?p=275
- Robinson et al. 2008, Decay rates of attractive and repellent pheromones (*Insectes Sociaux*): https://link.springer.com/article/10.1007/s00040-008-0994-5
- Jeanson et al. 2003, Pheromone trail decay rates on different substrates (*Physiol Entomol*): https://resjournals.onlinelibrary.wiley.com/doi/10.1046/j.1365-3032.2003.00332.x
- *Lasius niger* trail persistence (citing Beckers 1993, Evison 2008): https://pmc.ncbi.nlm.nih.gov/articles/PMC4204274/ · https://link.springer.com/article/10.1007/s00040-024-00995-y
- Wilson 1962, Fire ant odour trail, information analysis (*Anim Behav*): https://www.sciencedirect.com/science/article/abs/pii/0003347262901422
- Morgan 2009, Trail pheromones of ants (*Physiol Entomol*): https://resjournals.onlinelibrary.wiley.com/doi/10.1111/j.1365-3032.2008.00658.x
- Jackson, Holcombe & Ratnieks 2004, Trail geometry gives polarity (*Nature* 432:907): https://www.nature.com/articles/nature03105
- Hölldobler & Wilson 1978, Multiple recruitment systems of *Oecophylla longinoda*: https://link.springer.com/article/10.1007/BF00300045
- Hölldobler & Wilson 1977, Colony-specific territorial pheromone (*PNAS*): https://pmc.ncbi.nlm.nih.gov/articles/PMC431076
- Hölldobler & Wilson 1977, Weaver ants: territory (*Science*): https://www.science.org/doi/10.1126/science.841318
- Billen & Wang 2025, ant exocrine glands: https://dictionnaire-amoureux-des-fourmis.fr/Noms%20propres/B/Billen%20Johan/Johan-Billen.htm
- Ant odorant receptors and glomeruli (clonal raider ant): https://pmc.ncbi.nlm.nih.gov/articles/PMC5150400 · https://pmc.ncbi.nlm.nih.gov/articles/PMC8383895
- Wilson & Bossert, *Pogonomyrmex* alarm concentrations (via review): https://www.sciencedirect.com/topics/agricultural-and-biological-sciences/alarm-pheromone
- *Atta* stridulation: https://entomobrasilis.org/index.php/ebras/article/download/ebrasilis.v11i2.732/479 · https://link.springer.com/doi/10.1007/BF00174133
- Prabhakar, Dektar & Gordon 2012, Foraging regulation without spatial information (*PLoS Comput Biol*): https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1002670
- Gordon, harvester ant foraging range and territories: https://core.ac.uk/download/61761527.pdf · https://link.springer.com/doi/10.1007/BF00299951
- LeBoeuf et al. 2016, Oral transfer in social insects (*eLife*): https://elifesciences.org/articles/20375v1
- Tandem running and quorum: https://pmc.ncbi.nlm.nih.gov/articles/PMC2039849 · https://www.bristol.ac.uk/news/2016/july/ants.html
- *Cataglyphis* path integration and foraging distance: https://www.imls.uzh.ch/static/CMS_publications/wehner/literatur/pdf05/wehner20058.pdf
- Desert ant speed (stepping patterns, *J Exp Biol*): https://cob.silverchair.com/jeb/article-pdf/192/1/107/2854414/jexbio_192_1_107.pdf
- Draft et al. 2018, Carpenter ant antennal sampling: https://www.biorxiv.org/content/10.1101/327379v1
- Harvester ant hydrocarbons in nestmate recognition: https://link.springer.com/article/10.1023/A:1005529224856
- Lenoir et al. 2009, *Lasius niger* hydrocarbons, cuticle to home-range marking (*J Chem Ecol*): https://www.doi.org/10.1007/S10886-009-9669-6
- Ants sense and follow trail pheromones of community members: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6921000/
- Wilson 1975/1976, *Pheidole dentata* enemy specification: https://keyapa.com/pheidole/2024/05/29/pheidole-dentata-coping-with-fire-ants/
- Hölldobler 1976, Tournaments and slavery in a desert ant (*Science*): https://www.science.org/doi/10.1126/science.192.4242.912
- Regnier & Wilson 1971, Propaganda in slave-maker ants (*Science*): https://link.springer.com/article/10.1007/BF01012348
- Champer & Schlenoff 2024, Battles between ants: a review: https://pmc.ncbi.nlm.nih.gov/articles/PMC11195475/ · https://entomologytoday.org/2024/07/19/ant-battles-strategies-tactics-toxic-sprays-armor-overwhelming-numbers-more/
- Plowes & Adams 2005, Lanchester's square law in fire ants (*Proc R Soc B*): https://digitalcommons.lib.uconn.edu/dissertations/AAI3325625 · Adams & Mesterton-Gibbons 2003: https://math.fsu.edu/~mesterto/NewCourses/MAP5932/2016/PDF/PDF03/Adams2003bFightsAmongSocialAnimals.pdf
- Lymbery, Webber & Didham 2023, Complex battlefields favor strong soldiers (*PNAS*): https://www.pnas.org/doi/10.1073/pnas.2217973120
- Giraud, Pedersen & Keller 2002, Argentine ant supercolonies (*PNAS*): https://pmc.ncbi.nlm.nih.gov/articles/PMC122904/
- Thomas et al. 2006, supercolony borders in California: https://www.sciencedaily.com/releases/2006/12/061201110024.htm · https://www.eurekalert.org/news-releases/481928
