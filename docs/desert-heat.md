# Desert heat: the body sets the limit, the sun's height sets the day

*Research note for bead `ja-rf5.5` (the desert ant's heat, PRD §60.5). Written 2026-11-13 against code at `d290294` (heat built as a work in progress on the branch: body heat only). The session's network reached only PubMed Central: Amor et al. 2011, Wehner & Wehner 2011, Cerdá et al. 1998, Christian & Morton 1992, Wehner, Marsh & Wehner 1992 and Ruchty et al. 2010 (J Neurophysiol) were seen only as abstracts in search results, and every number from them is marked **unverified**. Five papers were read in full (PMC).*

The game's desert ant has heat as a body rule (heat.ts, `docs/desert-ant.md` §4): the plane's ground heats over a 10-minute day, an ant's body heats with it while out and cools in the nest, it senses its own heat (`hot`) and dies past its critical heat. Measured with D5 (two days, seeds 1–10), the ant's own heat is not enough: an ant inside the nest is always cool, so it sets out at noon, and on 4 of 10 seeds heat kills 17–30 % of the colony a day (best setting: noon 56 °C, a 30 s body, hot from 45 °C until back under 34 °C). The ants that die are already on their way home. The question: **what does a desert ant sense, at or near the nest, that tells it the day has become too hot to set out?**

## 1. Their heat limit is their body's, and the hottest-adapted forage close to it

- *Cataglyphis* forage close to their critical limits; their lethal temperature was above 50 °C in every species studied (Cerdá, Retana & Cros 1998, *Funct Ecol* 12:45, cited by later papers; **unverified**). Thermophilic species "only leave the nest during the warmest hours" to scavenge heat-killed insects with less competition and predation (de Souza Araujo et al. 2023, *Ecol Evol* 13:e10438, full text, citing Cerdá 1998 and Wehner 1992). Their median lethal temperature after 3 h was 44.8 °C for *C. bombycina* and 46.0 °C for *C. holgerseni* (de Souza Araujo et al. 2023, full text).
- In Doñana, *C. floricola* and *C. tartessica* had the highest optimal foraging temperatures of the community, a mean of 54.4 °C on the ground at baits; *C. tartessica*'s bait occupation rose linearly with the ground's temperature (R² 0.55) over the range recorded, which reached 65 °C in dry scrubland, with no fall-off (Sánchez-García, Cerdá & Angulo 2022, *PLoS ONE* 17:e0267547, full text).
- *Cataglyphis* and *Ocymyrmex* forage in two peaks a day in summer (one, or none, in winter), with afternoon activity highest at a surface 60–63 °C (Wehner & Wehner 2011, *Physiol Entomol* 36:271; **unverified**). Two peaks means a midday dip.
- *Melophorus bagoti* kept going at midday with the soil surface above 70 °C and the air at ant height above 50 °C, surviving about 2.5 min without a cooler break (Christian & Morton 1992, *Physiol Zool* 65:885; **unverified**).

**In the game:** the limit stays a body rule (the sense table's own-body row): body heat moving toward the ground's out on the plane, death past the critical heat. The game's desert ant is meant to work near that limit, so some heat deaths are its nature, not a fault. **Design:** every rate (the day's heat curve, how fast a body heats and cools); the papers give windows and limits.

## 2. The sun's height, seen at the entrance, sets when the nest opens and closes

- In *C. floricola* (south-west Spain), ant traffic at the nest entrance was explained better by the sun's elevation than by the ground's temperature, on both seasonal and daily scales. The ground's temperature when the nest opened rose as opening came later in the year, which a fixed temperature threshold would not give; and raising the apparent elevation of the sun over the nest entrance delayed the nest's closing. The authors conclude that light, not temperature, sets the daily rhythm (Amor, Ortega, Cerdá & Boulay 2011, *Ethology* 117:1031; **unverified**: the abstract only; the method of the manipulation, the times, temperatures and sample sizes were not reached).
- The start and stop temperatures of *Cataglyphis* and *Ocymyrmex* foraging shift by day and season, lower in winter and in the morning (Wehner & Wehner 2011; **unverified**): no single temperature threshold, consistent with a cue of light or time of day.
- Against it: *M. bagoti* began its activity only once the soil's mean temperature reached about 56 °C (air about 43.9 °C), which its authors read as avoiding the cool (Christian & Morton 1992; **unverified**). That is a start cue at the cool end, in another genus.

**In the game:** a new sensed field, **`sun`** (low, high): the sun's height, seen from the plane or from the top of the ant's own shaft, where the sky is in view (the sense table's sight). It is not a thermometer: it says how high the sun stands, and the policy learns (or its local rule says) that a high sun means a lethal trip. Deeper in the nest the sky is out of sight and the field reads low, so an ant comes up its shaft, sees a high sun at the top and turns back (the game's "peek"). **Design:** the elevation at which the sun counts as high; tuned on D5.

## 3. Ants have antennal thermoreceptors, but none measured covers desert heat

- *Camponotus rufipes*: the resting activity of the neuron that tracks temperature change was stable at 21–35 °C and ceased below 21 °C and above 38 °C; the neuron that reports absolute temperature works only between about 25 and 32 °C, the range of brood care (Nagel & Kleineidam 2015, *Front Behav Neurosci* 9:240, full text).
- *Atta vollenweideri*: a cold receptor in the sensilla coeloconica detects a 0.005 °C warming, working at ambient 18–30 °C (Ruchty, Roces & Kleineidam 2010, *J Neurophysiol* 104:1249; **unverified**); stimuli in the anatomy study were 15 and 30 °C only (Ruchty et al. 2010, *Front Behav Neurosci*, full text).
- None of these was a desert ant, and nothing found covers 40–60 °C.

**In the game:** no reading of the ground's or the air's temperature at the hole. A thermometer at desert heat is not supported; the ant's own body heat (§1) is the only temperature it senses.

## 4. In harvester ants, conditions outside reach the ants inside through those coming back

- *Pogonomyrmex barbatus*: patrollers go out first, soon after sunrise; their safe return, about one every 10 s, sends the first foragers out; patrollers stay in the entrance chamber from late morning "when it is hot and dry"; a forager's decision to go out again depends on the water it lost on earlier trips (Gordon 2025, *Ecol Evol*, full text, citing Pagliara et al. 2018). Foragers inside the entrance leave only after contacts carrying both forager and seed odour (Greene, Pinter-Wollman & Gordon 2013, *PLoS ONE*, full text).

**In the game:** not used for the desert ant (a harvester ant's mechanism moved to *Cataglyphis* would be design). It stays the generic ant's activation rule (`docs/activation.md`), and a candidate if the sun's cue fails.

## What was not found

- No study of *Cataglyphis* checking conditions at the entrance ("peeking") before setting out.
- No measured surface temperature at which *C. fortis* or *C. bicolor* foragers stop; one unsourced snippet has *C. fortis* starting at about 08:30 solar time and peaking at solar noon (**unverified**, not used).
- No antennal thermoreceptor measured in a desert ant, or at 40–60 °C.
- No study showing desert ants time foraging by neither temperature nor light.

## The mechanic

Cheapest first:
1. **Body heat** (built on the branch, `heat.ts`): ground heat over a day (`heatDay`, 0 = none: the generic ant, goldens bit-exact), body heat toward the ground's on the plane and the nest's inside, felt hot from `heatFelt` until back below `heatCool`, death past `heatDeath` (53.6 °C, *C. bombycina*, Gehring & Wehner 1995 through later papers: a borrowing, unverified). Sensed: the `hot` field (own body).
2. **The sun's height** (this note, §2): a `sun` field (low, high), seen on the plane and at the top of the ant's own shaft; low elsewhere underground. Response: the mode policy (return: stay in, or turn back at the top). Local rule: return when hot, or when the sun is high and its jaws are empty; otherwise as now. "Off": a species without the field (the generic ant), and no day (`heatDay` 0).
- **Cost:** the desert lane goes from 32 situations (mode × tired × hot × enemy) to 64. Its words and version change, so its shipped answers are asked again: about $0.001 (the 16-situation check cost $0.0003); tokens per question from `npm run colony-cost -- --species desert` in the PR. A cached game spends nothing.
- **Assay:** D5 (`experiment.ts`, two days, seeds 1–10 by the worst seed, confirmed on 11–20): out on the plane at noon ≤ 0.75 × at dawn; heat deaths ≤ 16 % of the colony a day (*C. bicolor*'s all-cause forager loss, Schmid-Hempel & Schmid-Hempel 1984, a summary: a borrowing, unverified); food picked up in every 30 s outside the high-sun window (a midday dip is the biology, §1; a whole day without intake is the cliff).
- **Gaps:** none opened. The sun is read by the ant where it can see the sky; no global read.

## Play

- **See:** the warm wash over the plane deepens toward noon (built); at a high sun the desert colony's foragers thin out on the plane and gather at the top of the shaft, then pour out as the sun falls: two foraging peaks a day, with a lull between. The Learn drawer's desert-ant entry (`ja-rf5.8`) says why: the sun's height, and the ant's own heat.
- **Choose:** nothing new for the player now: the fungus's levers on this host are host odour and contact at an invitation (`ja-rf5.7`), not heat (owner, desert-ant.md Open questions 4). A later lever could blind the host to the sky (a host that can't see the sun's height sets out at noon and cooks): it would reach the fungus through a sense, not a script. Not built; the owner's call.
- **Progression:** a weak start is kept: a game opens at dawn (cool), the colony grows through the first morning. The noon lull is a slope (the sun's height rises and falls), not a cliff, if intake keeps running at the edges of the window.
- **Cost:** about $0.001 once for the shipped answers; a cached game spends nothing.
- **Worse to play:** a colony that stays in all day (a high threshold), seen as a long run of 30-s bins with no intake (D5's cliff check); or a colony that still cooks at noon (D5's deaths). Both measured.

## Open questions

- **Owner (decided 2026-11-13):** a day cycle; a sensed field, re-asking Jev; heat kills; the cue at the hole is the sun's height, not the ground's heat (this note §2–3).
- **To measure:** the sun's threshold (design), and whether intake keeps running outside the high-sun window.
- **To read:** Amor et al. 2011 in full (or Amor's 2011 thesis, its chapter on nest opening and closing) for the manipulation and the times; Wehner & Wehner 2011 for the start and stop temperatures.

## Sources

- Amor F, Ortega P, Cerdá X, Boulay R (2011). Solar elevation triggers foraging activity in a thermophilic ant. *Ethology* 117:1031–1039. [doi:10.1111/j.1439-0310.2011.01955.x](https://doi.org/10.1111/j.1439-0310.2011.01955.x) (abstract only)
- Wehner R, Wehner S (2011). Parallel evolution of thermophilia: daily and seasonal foraging patterns of heat-adapted desert ants: *Cataglyphis* and *Ocymyrmex* species. *Physiol Entomol* 36:271–281. [doi:10.1111/j.1365-3032.2011.00795.x](https://doi.org/10.1111/j.1365-3032.2011.00795.x) (abstract only)
- Christian KA, Morton SR (1992). Extreme thermophilia in a Central Australian ant, *Melophorus bagoti*. *Physiol Zool* 65:885–905. [doi:10.1086/physzool.65.5.30158548](https://doi.org/10.1086/physzool.65.5.30158548) (abstract only)
- Cerdá X, Retana J, Cros S (1998). Critical thermal limits in Mediterranean ant species: trade-off between mortality risk and foraging performance. *Funct Ecol* 12:45–55. [doi:10.1046/j.1365-2435.1998.00160.x](https://doi.org/10.1046/j.1365-2435.1998.00160.x) (through citing papers)
- de Souza Araujo N, Perez R, Willot Q et al. (2023). Facing lethal temperatures: heat-shock response in desert and temperate ants. *Ecol Evol* 13:e10438. [PMC10500329](https://pmc.ncbi.nlm.nih.gov/articles/PMC10500329/) (full text)
- Sánchez-García D, Cerdá X, Angulo E (2022). Temperature or competition: which has more influence on Mediterranean ant communities? *PLoS ONE* 17:e0267547. [doi:10.1371/journal.pone.0267547](https://doi.org/10.1371/journal.pone.0267547), [PMC9053807](https://pmc.ncbi.nlm.nih.gov/articles/PMC9053807/) (full text)
- Nagel M, Kleineidam CJ (2015). Two cold-sensitive neurons within one sensillum code for different parameters of the thermal environment in the ant *Camponotus rufipes*. *Front Behav Neurosci* 9:240. [doi:10.3389/fnbeh.2015.00240](https://doi.org/10.3389/fnbeh.2015.00240), [PMC4558426](https://pmc.ncbi.nlm.nih.gov/articles/PMC4558426/) (full text)
- Ruchty M, Roces F, Kleineidam CJ (2010). Detection of minute temperature transients by thermosensitive neurons in ants. *J Neurophysiol* 104:1249–1256. [doi:10.1152/jn.00390.2010](https://doi.org/10.1152/jn.00390.2010) (abstract only)
- Ruchty M, Helmchen F, Wehner R, Kleineidam CJ (2010). Representation of thermal information in the antennal lobe of leaf-cutting ants. *Front Behav Neurosci* 4:174. [doi:10.3389/fnbeh.2010.00174](https://doi.org/10.3389/fnbeh.2010.00174), [PMC2991144](https://pmc.ncbi.nlm.nih.gov/articles/PMC2991144/) (full text)
- Gordon DM (2025). Nest entrance architecture and the regulation of foraging activity in desert harvester ants. *Ecol Evol* 15:e72122. [doi:10.1002/ece3.72122](https://doi.org/10.1002/ece3.72122), [PMC12413562](https://pmc.ncbi.nlm.nih.gov/articles/PMC12413562/) (full text)
- Greene MJ, Pinter-Wollman N, Gordon DM (2013). Interactions with combined chemical cues inform harvester ant foragers' decisions to leave the nest in search of food. *PLoS ONE* 8:e52219. [doi:10.1371/journal.pone.0052219](https://doi.org/10.1371/journal.pone.0052219), [PMC3540075](https://pmc.ncbi.nlm.nih.gov/articles/PMC3540075/) (full text)
