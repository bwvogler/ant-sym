# Raids: scouts find the rival, a trail brings the fighters

Research note for behaviour MR 5.2 (bead `ja-tu3`, PRD §49). What the game did before:
- A raiding colony's fighters steered straight at the rival hole's coordinates (`raidTarget`). No ant senses those.
- A straight line sticks behind rock (`ja-jwy`).

The paper hosts (link.springer.com, pmc.ncbi.nlm.nih.gov, groups.csail.mit.edu) were outside this session's network allowlist. Every claim below was read in a search summary, not in the paper, and is **unverified**, as in `activation.md` and `combat.md`. Where a number could not be found, the note says so.

## Scouts find the target first

**Polyergus (slave-making ants):**
- **Scouting is needed.** Removing all scouts of *P. breviceps* over 19 days left raids on only 2 of 11 days (Topoff, Bodini, Sherman & Goodloe 1987, *Psyche* 94:261). Another trial, 3 days with scouts removed, saw none. The two counts were not consistent between summaries. **Unverified.**
- **How scouts search.** A linear run, then a random search inside a limited sector. **Unverified.**
- **They go home and recruit.** A scout that finds a host nest returns and recruits workers milling at its own entrance, by jerky running and probably pheromone. A dense swarm forms, moves slowly, then forms a column and speeds up (AntWiki summary of Le Moli et al. 2001, Talbot 1967). **Unverified.**
- **Whether raiders follow a scent trail is disputed.** Talbot argued they do. Others report that removing the scouts for several days, or digging up the ground ahead of the column, did not stop a raid, and that the way home uses sight as well as scent. A hybrid fits: a trail plus what the ant sees. **Unverified.**
- **Raids fail often.** Some raiders set out alone, apparently on an old trail, and meet hostility at the target. No rates were found.

**Temnothorax slave-makers** (*Protomognathus americanus*; Pohl & Foitzik 2013, *Insectes Soc.*): more active scouts found hosts sooner, and host aggression to scouts rose with colony size. A scout recruits by head-butting nestmates. **Unverified.**

**Not found:** how many scouts, the delay from scouting to the raid, how many raiders go, and how many are called back.

## At a border, an encounter recruits

- **Honeypot ants** (*Myrmecocystus*; Hölldobler & Lumsden 1980, *Science*, citation from memory): tournaments of up to hundreds of ants are mobilised by alarm recruitment plus an orientation trail. When one side is much stronger, the tournament ends fast and the weaker colony is raided. **Unverified.**
- **Weaver ants** (*Oecophylla*; Hölldobler & Wilson 1977, *Science* 195): a worker that meets alien marks grows more aggressive and recruits nestmates at a higher rate. On meeting enemies, workers gather nestmates with a sternal-gland attractant; under prolonged stress, more are called by a rectal-gland trail. **Unverified.**
- **Not found:** whether recruitment depends on the number of enemies met (*Pogonomyrmex*, *Linepithema*).

## What was not reached

- Whether rival colonies of one species follow each other's trails.
- How a scout senses a rival nest itself: its entrance, its footprints.
- When a raid is called off.

## For the model

- **A finder is an ant that meets strangers.** The game already has that sense (`enemy` contact, `docs/ant-communication.md` §3). It stands for meeting the rival's workers at its border or entrance. A rival-nest odour is not built: it was not found in the sources, and a sense needs sources first.
- **It goes home and lays a trail.** The trail is a recruitment trail of its own, a fifth channel (`raid`), as `noEntry` was a fourth. Laid more strongly after more strangers met (graded, as weaver ants' recruitment is).
- **Fighters follow the trail, as foragers follow food.** The trail runs over ground a scout walked, so it goes round rock. Walking to coordinates goes.
- **A raid stance is a bias, not an order** (`activation.md`: a threshold on a stimulus). An ant acts on it only once recruited: it smelt a scout's trail, or it went out as a scout at `raidScout`. The rest carry on foraging.
- **Sight is kept in the model by the side view's tunnel walk** and by the contact response near a fight. The top-down raider has no sight of its own beyond the scent.
- **Left out:** raiders as a column, tandem running, head-butting, the colony's call-off. Each is a later slice.

## How a raid ends

- **By abandonment, ant by ant.** After raiders reach a *Polyergus* host nest they mill about for a few minutes, then an incohesive retreat starts, and more and more workers join the return as it goes. They find their way home by sight and by the chemical trail scouts and raiders laid on the way out. (Wikipedia and navajonature summaries of the *Psyche* literature.) **Unverified.**
- **Nothing found says an order ends a raid.** Army-ant raids run in bouts, relaunched 12–17 times in one agent-based model, and no cause for a bout ending was found. **Unverified.**
- **Trails fade without reinforcement,** so recruitment lasts only while finds continue. A starving forager lays trail more readily (*Lasius niger*, *J. Exp. Biol.* 209:4224). Not specific to raids. **Unverified.**
- **A stronger side ends a tournament fast:** the weaker retreats or is raided (honeypot ants). **Unverified.**
- **The nearest measured give-up** is the harvester forager's: it waits about 3 minutes with no forager returning, and goes deeper after about 8 (`activation.md`, Gordon 2025).
- **Not found:** the trigger that ends a raid, a number for raider patience, and whether the retreat spreads by contact.

**For the model:** nothing ends a raid by decision. A raid lives while a scout's trail does; an ant that has been out and is home with no trail under it goes back to foraging, and a scout that finds nothing tires and comes home (the existing fatigue). A call-off that spreads by contact with raiders coming home empty has one summary line behind it, and is left out.

## Past the trail's end

Added for `ja-sf1`. As above, every claim was read in a search summary, not the paper, and is **unverified**.

- **A scout's search is a run, then a search in a sector** (Topoff et al. 1987, above). A trail that ends where strangers were met says "this way", not "here".
- **Mass recruiters keep a trail alive by re-laying it.** *Solenopsis* foragers lay the trail from the Dufour gland through the sting, and it draws workers out and orients them (Wilson 1962, *Animal Behaviour* 10). In a group-raiding ponerine, travel along the raid route got faster over time, apparently as raiders laid more on it (Hölldobler et al. 1996). *Polyergus* raiders use Dufour-gland recruitment signals (a 2005 study of *P. rufescens*; reviewed in Visicchio et al. 2001, not reached), and a review says raids are more than trail following, but odour trails play a part.
- **Not found:** whether *Polyergus* raiders re-lay the column's trail, how fast it fades, or what raiders do where it ends.

**For the model:**
- A finder lays the trail from where it met strangers, which in A11 is about 25 cells short of their nest (the nests are 80 apart). Climbing it, the recruits stopped at its strongest point, its end, and milled there.
- Now a raider facing along the trail with nothing ahead as strong as underfoot is past the end, and searches on as a scout does: out, away from home, without turning back up the trail (`raidOnward`). If it meets strangers there with no trail under it, it is a finder, and lays a longer trail home.
- **Tried and dropped: raiders re-laying the trail** on their way home from strangers. It made the trail at the nest four times as strong and recruited no more ants and reached no further (A11 gain 1.19 against 1.24). Recruiting was never short: 81 % of the colony was recruited.

## Sources

- Topoff, Bodini, Sherman & Goodloe 1987, "The role of scouting in slave raids by *Polyergus breviceps*", *Psyche* 94:261–270: https://groups.csail.mit.edu/mac/projects/psyche/94/94-261.html *(search summary only)*
- Le Moli et al. 2001 (*P. rufescens*) and Talbot 1967 (*P. lucidus*), as summarised in https://antwiki.org/wiki/Polyergus *(secondary)*
- Pohl & Foitzik 2013, *Insectes Sociaux*, doi 10.1007/s00040-013-0293-7 *(search summary only)*
- Hölldobler & Lumsden 1980, "Territorial strategies in ants", *Science* *(from memory)*; https://rd.springer.com/content/pdf/10.1007%2FBF00299887.pdf *(search summary only)*
- Hölldobler & Wilson 1977, "Weaver ants: social establishment and maintenance of territory", *Science* 195: https://pherobase.com/literature/data/details/M/41416 *(index page)*
- Wikipedia "Polyergus breviceps" and navajonature.org, *Polyergus breviceps* *(secondary; search summaries)*; the *Psyche* 94 issue (biodiversitylibrary.org/part/183861)
- A 2018 agent-based army-ant raid model: "Directional raids by army ants as an adaption to patchily distributed food" *(search summary only)*
- *Lasius niger* trail laying and starvation: *J. Exp. Biol.* 209:4224, "Starvation drives a threshold triggering communication" *(search summary only)*
- Wilson 1962, "Chemical communication among workers of the fire ant *Solenopsis saevissima* (Fr. Smith)", parts 1 (the organization of mass-foraging) and 2 (an information analysis of the odour trail), *Animal Behaviour* 10 *(search summary only)*; a later fire-ant trail-pheromone paper citing it: https://core.ac.uk/download/17214254.pdf *(search summary only)*
- Hölldobler et al. 1996, a group-raiding ponerine's raid route: https://www2.ib.unicamp.br/profs/pso/PDFS/Holldobler_et_al_1996.pdf *(search summary only)*
- *Polyergus rufescens* Dufour-gland recruitment (2005) and the review of raid organisation, as summarised in https://www.zobodat.at/pdf/MyrmeNews_018_0033-0049.pdf and Lenoir et al. 2011, *Chemoecology* *(search summaries only)*
