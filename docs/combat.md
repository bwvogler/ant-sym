# Combat: meeting a stranger, graded alarm, and terrain

Research note for behaviour MR 4 (bead `ja-902`, PRD §46). What the game did before MR 4:
- An ant with a stranger nearby always fights (`localPolicy`: `enemy: near` → fight).
- A fight's hazard is enemies ÷ allies over a cell and its six neighbours, however cramped the ground.
- Alarm only repels; fighters climb it.
- Only an ant counted in a fight lays alarm.

The paper sites (pnas.org, europepmc.org) were outside this session's network allowlist, so numbers come from abstracts and press summaries and are marked **unverified**, as in `tiredness.md` and `trails.md`.

## Terrain: narrow ground favours the stronger side, not the bigger

- **Lymbery, Webber & Didham 2023** (*PNAS* 120:e2217973120) tested Lanchester's prediction: open ground favours numbers, complex ground favours stronger individuals.
  - They pitted 20 Australian meat ants against up to 200 Argentine ants, in featureless arenas and in the same arenas with narrow wooden strips glued to the floor.
  - Fewer meat ants died in the complex arenas.
  - Simulations with video-game armies showed the same thing: on complex terrain a few strong units held off many weak ones.
  - Mechanism: clutter limits how many attackers can reach a defender at once, so the larger army can't bring its numbers to bear.
  - Sources: CSIRO and phys.org press releases. **Unverified:** arena geometry, effect sizes and the law fitted.
- `ant-communication.md` §4 item 5 drew the same game rule from this: cap how many enemies count at once by the open cells around the ant.
- §4 also says to keep the local, roughly linear hazard: it matches fire-ant data better than a square law.

**For the model:** in `battle.ts`, the enemies and allies an ant faces are capped by the open cells around it. In a 2-cell pass only the front ranks engage, so a defending line holds against a larger force. The pass assay (A6) should then favour the defenders, which today it doesn't (exchange 0.95 in the pass against 0.94 in the open).

## Graded alarm: a little draws, a lot repels or enrages

- ***Atta texana*** (Moser et al. 1968): workers were drawn to the alarm pheromone 4-methyl-3-heptanone at low concentrations, and alarmed at about ten times that. In the field, low concentrations attract and alarm, high ones repel and alarm. **Unverified.**
- **The clonal raider ant** (*Ooceraea biroi*; Lopes et al. 2022, bioRxiv 2022.12.04.518909): attracted to the source of alarm at low concentrations, repulsed at high. One component repels at once; another first attracts, then sends the ants away.
- ***Pogonomyrmex badius***: alarm responses of high and low intensity are described (AntWiki, "Alarm communication"). No thresholds were found.
- **Active space** (Bossert & Wilson 1963): a puff of alarm spreads and fades in seconds over a few centimetres. The game's alarm field (t½ 2.8 s, ~5 cells) already matches (`ant-communication.md` §2).
- **Who lays alarm.** In *Pheidole*, minors that meet an enemy recruit majors (`ant-communication.md` §4 item 4). Meeting an enemy, not only fighting one, raises alarm.

**For the model:**
- Faint alarm draws an idle ant toward it; strong alarm repels non-fighters and draws fighters.
- `Touch` gains the alarm level, and `alarmGain` may be negative (a pull).
- An ant that meets a stranger lays alarm, not only one counted in a fight.

## Meeting a stranger: fight, flee, or drop and run

- **At food, the one that didn't start it retreats.** In field encounters between the Argentine ant and native species at baits, the ant that did not initiate an encounter usually retreated, in every species studied. How often a species was aggressive did not predict who won. Behaviour mattered about as much as numbers. Sources: Human & Gordon 1996, as summarised in a review (PMC7767331). **Unverified.**
- **Numbers and recruitment win baits.** The Argentine ant's success against native species comes with numerical dominance, aggression and fast recruitment. A strong native dominant suppressed its exploring and foraging (same review).
- **Dropping food and fleeing:** this session found no source that describes a laden forager dropping its load to flee. It stays a **design choice**, kept because MR 2 left "drop and run" for MR 4, and `#putDown` already conserves food.

**For the model:**
- An ant that meets strangers senses the odds by contact: nestmates against strangers around it, as outnumbered, even or outnumbering.
- A new `contact` response chooses fight, flee, or drop and run.
- Locally:
  - fighters (fight mode, raids, a defence near home) fight;
  - a forager that isn't outnumbering flees, heading away and raising alarm;
  - a carrier facing a fight it can't win drops its load and runs.
- This replaces "enemy near → fight" for everyone. It is the sensed fix for the top-down game's midfield battles (bead `ja-hgq`), where two colonies' foragers fought wherever their trails crossed.

## Sources

- Lymbery, Webber & Didham 2023, "Complex battlefields favor strong soldiers over large armies in social animal warfare", *PNAS* 120:e2217973120: https://www.csiro.au/en/news/all/articles/2023/august/ant-warfare *(press release)* · https://phys.org/news/2023-08-ant-wars-native-species-invasive.pdf *(press)* · https://researchportal.murdoch.edu.au/esploro/outputs/journalArticle/Complex-battlefields-favor-strong-soldiers-over/991005601870307891 *(index page)*
- Lopes et al. 2022, "The alarm pheromone and alarm response of the clonal raider ant", bioRxiv 2022.12.04.518909: https://www.biorxiv.org/content/10.1101/2022.12.04.518909.full.pdf
- Moser et al. 1968, *Atta texana* alarm pheromone, as summarised in AntWiki: https://antwiki.org/wiki/Alarm_Communication *(secondary)*
- Human & Gordon 1996 and later work on Argentine ant encounters at baits, reviewed in PMC7767331: https://pmc.ncbi.nlm.nih.gov/articles/PMC7767331
- Bossert & Wilson 1963, the active space of pheromones: via `ant-communication.md` §2 and AntWiki *(secondary)*
