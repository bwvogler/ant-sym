# Tiredness: when a forager gives up, and how it recovers

Research note for bead `ja-q47` (MR 3.1, PRD §44). An ant's `tired` flag is one of the two parts of its `Situation` that come from its own body (docs/vision.md). Until MR 3.1 it was a timer, `since`: seconds since the ant last found food, put a load down, or stood within its hole's radius. Behaviour MR 2 (PRD §43) measured what that gets wrong:
- Underground, nothing reset it, so every inside worker was "tired" within a minute.
- A tired forager that went home stayed tired, so the colony's tired foragers retired inside.
- A fight, or dumping spoil, counted the same as finding food.

This note collects what real foragers do. All numbers come from abstracts or citing papers this session could reach, because the full texts were outside its network allowlist. They are marked **unverified**.

## What ends a foraging trip

- **Search time, not distance.** In the red harvester ant, *Pogonomyrmex barbatus*, a forager travels out quickly (up to about 20 m), searches alone for a seed, and goes straight home once it finds one. The trip's length is set mainly by how long it searched, not how far it went: with more food about, it searches less and comes back sooner.
  - Sources: Beverly et al. 2009 (Behav. Ecol. 20:633); Greene, Pinter-Wollman & Gordon 2013 (PLoS ONE). **Unverified** numbers.
- **Unsuccessful bouts end, and the ant goes home.** In models of *Cataglyphis*-style foraging, an ant that finds nothing returns to the nest and may stay there before its next excursion (Frontiers in Neuroscience 2012, fnins.2012.00102).
- **Search grows, then gives way to home cues.** *Cataglyphis fortis* searching for its nest loops wider the longer it searches (Wehner & Wehner 1986). One conference abstract reports that ants that have searched for a while give up and follow the nest's odour plume even against their path integrator. It is not peer-reviewed. No measured give-up time was found.
- **Food type changes the giving-up time.** In a *Formica* study, foragers left a patch later when the food there was carbohydrate (Behav. Ecol. 19:217). **Unverified**: the exact times were not read.

**For the model:** tiredness should grow with *unsuccessful searching* and be reset by success (finding food). Other work, such as digging or carrying spoil, is not a failed search and shouldn't count. A fight outside the nest does tire: it is time out without food, and going home tired is what ends a raid (review of #36: with fights left out, raids never ended).

## Rest between bouts

- **Foragers wait inside between trips.** Red harvester foragers wait in the entrance chamber. Whether a waiting ant leaves on its next trip depends on how often it meets returning foragers carrying food (brief antennal contacts that read the other ant's cuticular hydrocarbons). So the rate of successful returns sets the rate of departures. Returners going deeper into the nest also bring more waiting ants up into the entrance chamber.
  - Sources: Gordon's lab, e.g. Greene, Pinter-Wollman & Gordon 2013 and Pless et al. 2015 (PLoS ONE). This is MR 5's activation (assay A5); here it says that rest between bouts is real and happens inside.
- **Many workers are inactive at any moment.** Upwards of half a social-insect colony's workers are inactive at any one time. In *Temnothorax rugatulus*, about 25–50 % of marked workers were consistently inactive, depending on how "inactive" is defined. They act as a reserve labour force: removed, they were not replaced within two weeks, while active workers were replaced within a week. Young workers were more inactive.
  - Sources: Charbonneau & Dornhaus 2015; Charbonneau, Sasaki & Dornhaus 2017, PLoS ONE 12:e0184074. **Unverified** percentages.

**For the model:** a tired forager goes home and rests *inside* for a while, then leaves again. Rest is a duration, not an instant: a forager that touches the hole is not rested. Inside workers (nurses, diggers, porters) don't forage, so they never become tired in this sense.

## What MR 3.1 builds from this

- **Tiredness accrues only outside.** A per-ant `fatigue` grows only while the ant is out with empty jaws, exploring, following or fighting, up to twice `patience`. It is reset by finding food.
- **Rest takes time.** While the ant is inside its nest, fatigue falls at a rate, so a full rest takes `restTime` seconds.
- **The clock lever still applies.** The fungus's `clock` scales how fast fatigue grows and how fast it rests.
- **`tired` = fatigue above `patience`.**
- **Left for MR 5:** the encounter-rate trigger for leaving (Gordon), which builds on this rest. That is behaviour MR 5 (`ja-um8`).

## Sources

- Beverly, Gordon et al. 2009, "How site fidelity leads to individual differences in the foraging activity of harvester ants", Behav. Ecol. 20:633–638: https://ideas.repec.org/a/oup/beheco/v20y2009i3p633-638.html *(index page)*
- Greene, Pinter-Wollman & Gordon 2013, PLoS ONE: https://sites.lifesci.ucla.edu/eeb-pinterlab/wp-content/uploads/sites/86/2016/05/Greene-et-al-2013-PLoS-One.pdf
- Pinter-Wollman et al. 2013, PLoS ONE, PMC3540075: https://pmc.ncbi.nlm.nih.gov/articles/PMC3540075
- Pless et al. 2015, PLoS ONE: https://pinterwollmanlab.eeb.ucla.edu/wp-content/uploads/sites/86/2016/05/Pless-et-al-2015-Plos-One.pdf
- Desert ant search, J. Exp. Biol. 209:3545: https://cob.silverchair.com/jeb/article-pdf/209/18/3545/1256157/3545.pdf
- Merkle & Wehner 2009, "How flexible is the systematic search behaviour of desert ants?": https://researchportalplus.anu.edu.au/en/publications/how-flexible-is-the-systematic-search-behaviour-of-desert-ants/
- Foraging models (Frontiers in Neuroscience 2012): https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2012.00102/full
- *Formica* giving-up time, Behav. Ecol. 19:217: https://ideas.repec.org/a/oup/beheco/v19y2008i1p217-222.html *(index page)*
- Charbonneau, Sasaki & Dornhaus 2017, PLoS ONE 12:e0184074, PMC5587300: https://pmc.ncbi.nlm.nih.gov/articles/PMC5587300
- Inactive workers in *Temnothorax* (press summaries of Charbonneau & Dornhaus 2015) *(secondary)*: https://www.smithsonianmag.com/smart-news/despite-their-industrious-rep-some-ants-are-super-lazy-180955841/
