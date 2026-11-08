# Stance: what makes an ant defend or go raiding

Research note for the behaviour MR that removes the broadcast stance on top-down maps (beads `ja-k4k.6`, `ja-d8e`).

**What the game did before.** Every 5 s a colony-level strategist chose one stance (forage, defend or raid) and told every ant. It read colony totals no ant senses:
- food brought home, averaged over 60 s;
- deaths in fights, fading over 30 s;
- a scan of the map for strangers near the nest;
- the colony's size against its cap, and the larder.

Its local rule raided when no food came in, or when the larder was full and the colony large.

The paper hosts were mostly outside this session's network allowlist. As in `raid-recruitment.md`, every claim below was read in a search summary, not the paper, and is **unverified**.

## Defence is an individual's threshold, raised by encounters

- **Pavement ants fight by threshold.**
  - **What raises the threshold:** a worker fights a stranger when recognition cues mismatch and it has met nestmates often lately. In the model, the chance of fighting rises with nestmate density, as judged by the interaction rate (Hoover et al. 2016, *Current Zoology*, an agent-based model; the interaction-rate claim rests on Greene's unpublished data).
  - **Fights escalate:** some fighters recruit more workers from the nest, a positive feedback that grows into colony-wide wars.
  - **What sets the threshold inside the ant:** octopamine and serotonin levels in the brain alter the decision to attack. Past a threshold, a worker is likely to fight (Bubak et al. 2016, *PLoS ONE*).
- **Alarm makes aggression more likely.** One review proposes that the alarm pheromone shifts the receiver's internal state toward attacking intruders. In carpenter ants formic acid, an alarm cue, sharpened nestmate discrimination: it raised both rejection of strangers and acceptance of nestmates.
- **Defence grows closer to home.** In *Pheidole*, a colony's response to invaders is graded, and as the invasion grows the fight moves closer to the nest (`ant-communication.md` §3). High-threshold majors are mobilised only by intense recruitment.
- **Alarm draws at low doses and repels at high** (`combat.md`).

**For the model:** an ant defends while it is on home ground and its own **threat** is past a threshold. Threat is a leaky count that rises while it smells alarm or has strangers in reach, and fades with a half-life of about 20 s, as the ant's count of returning foragers (`met`) does. The fading state stands for the monoamine level, not a stopwatch. What a defender does is unchanged: alarm draws it to fight, it fights strangers rather than flee, and it goes out at once. Only who defends changes: the ants that sense a threat near home, not every ant in the colony.

## Hunger does not make a colony aggressive

- **Argentine ants deprived of sugar became less aggressive and less active,** not more. Deprived of prey, there was no change (Grover et al. 2007). The authors link this to smaller workers with less lipid.
- **Starved and fed colonies showed no difference in aggression** over five weeks (Thomas et al. 2005). Seasonal rises in aggression tracked the brood-to-worker ratio, but changing that ratio did not change aggression.
- **Starved foragers grew more cautious** when competitors were present, limiting their foraging (a 2022 study; search summary).

**For the model:** the old rule, raid when no food comes in, goes. It had no source behind it, and the sources point the other way.

## A crowded colony raids

- **Density raises raiding.** In fire ants (*Solenopsis invicta*), the share of incipient colonies engaged in brood raids went from 0 % at the lowest planting density to 68.5 % at the highest, and clumped colonies raided more than evenly spaced ones at the same mean density (Tschinkel et al. 1995). This is density of colonies, not of workers in a nest.
- **Worker density wins ground.** *Crematogaster mimosae* colonies whose worker density was reduced took over an emptied neighbouring tree half as often as controls or colonies whose density was raised (search summary of a manipulation study). The denser side tends to win boundary disputes, and a much stronger colony ends a tournament fast and raids the weaker one (Hölldobler 1981).
- **Scouts start raids** (*Polyergus*, Topoff et al. 1987; `raid-recruitment.md`). What sends a scout out was not found. One Polish author disputes that scouting starts the raids at all.
- **Not found:**
  - whether a worker's own rate of meeting nestmates at home sends it out to scout for rivals;
  - what sets the timing of slave raids (the *Formica subintegra* hint, raids only once the host's sexuals mature, is another genus).

**For the model:** a waiting ant at home that meets many nestmates (crowded) and few returning with food may go out as a raid scout. This is the fourth answer to the `leave` question, "raid", so the doctrine can raise or forbid it. It stands in for the old "larder full and colony large". (`crowd` counts nestmates in the colony's count grid, not by odour: local, but the same shortcut as grooming in the vision gap table.) The individual rule is a design choice: the sources show crowding and raids together at the colony level, not the worker's cue. Once out, a scout is a raider as before: it finds strangers, lays the raid trail, and the trail recruits (`raid-recruitment.md`).

## Play

Built on top-down maps only (PRD §53). The page starts in the side view, which keeps the colony's strategist (`ja-1a9`).
- **See:**
  - A war party at a nest is met by the ants near it, while foragers far off keep carrying.
  - Raids start small: a few scouts leave a crowded nest, and recruits follow a finder's trail by degrees, not in one wave.
  - The Details side stats show how many ants defend and raid. The Learn drawer's mode senses say stance is the ant's own on open ground. The colony's stance section is now for the side view.
- **Choose:** no new lever. The fungus already reaches the cues:
  - *stranger scent* and *fungal odour* (Recognition) change who counts as a stranger, so who feels threatened;
  - *soothe* quiets alarm, the other half of threat.

  How readily a colony raids is still its doctrine (`leave` answers "raid" under Forage and Warlike, never under Cautious).
- **Counterplay and progression:** wars are smaller and later (G′: half the ants lost against `main`), so colonies live longer and the fungus has more hosts and more time. That slows the cliff where a raid reaches a queen. Recognition reaches one step for 10 mutations and the full range for 1,500 (`evolution.ts`).
- **Cost:**
  - Live checks with every lane: $0.0066 a run top-down; mode about 200 real tokens a question, leave about 400.
  - The top-down stance lane is gone (about $0.024/h for the mode lane, against $0.030 on `main`).
  - A cached game spends nothing.
- **Risks:**
  - **Famine:** under Jev's Cautious answers foragers stay home (food −42 %, `ja-5vx`).
  - **A cliff:** if the trail recruited everyone at once, every raid would be a war, as it was before graded recruitment (G′ about 880 lost against 170). The number to watch is G′'s worst seed (507 ants left, against `main`'s 223).
  - **Invisible effects:** a defender looks like any fighter on the field.
- **Owner decisions needed:**
  - whether defenders should be drawn differently;
  - whether the fungus should get a lever on the threat itself, beyond alarm and recognition.

## Left out

- **The side view** keeps the colony-level strategist until its raids follow trails underground (`ja-1a9`).
- **Brood need** as a raid cue (the slave-makers' motive) is left out: the game's raids take no brood (`ja-gkl`).
- **Colony-wide wars by recruitment from fights:** alarm already draws defenders. A separate fight-recruitment signal is not built.

## Sources

- Hoover, Bubak, Law et al. 2016, "The organization of societal conflicts by pavement ants *Tetramorium caespitum*: an agent-based model of amine-mediated decision making", *Current Zoology*: https://pmc.ncbi.nlm.nih.gov/articles/PMC5829439 *(search summary only)*
- Bubak et al. 2016, "Neuromodulation of nestmate recognition decisions by pavement ants", *PLoS ONE*: https://doaj.org/article/0da5124fdd8049a9876a8111fc391e8e *(search summary only)*
- Rossi, Baracchi et al., formic acid and nestmate recognition in carpenter ants, *American Naturalist*: https://flore.unifi.it/retrieve/e398c37e-bce8-179a-e053-3705fe0a4cff/Rossi%20Baracchi%20et%20al%20AM%20Nat.pdf *(search summary only)*
- Grover, Kay, Monson et al. 2007, "Linking nutrition and behavioural dominance: carbohydrate scarcity limits aggression and activity in Argentine ants", *Proc. R. Soc. B*: https://pmc.ncbi.nlm.nih.gov/articles/PMC2291163 *(search summary only)*
- Thomas, Tsutsui & Holway 2005, "Intraspecific competition influences the symmetry and intensity of aggression in the Argentine ant", *Insectes Sociaux*: https://springerlink.bibliotecabuap.elogim.com/article/10.1007/s00040-004-0782-9 *(search summary only)*
- Tschinkel et al. 1995, fire-ant colony density and brood raiding, *Oecologia*: https://www.bio.fsu.edu/~tschink/publications/1995-4.pdf *(search summary only)*
- *Crematogaster mimosae* worker density and takeover: https://datadryad.org/dataset/doi:10.5061/dryad.b60v7 *(data record; search summary only)*
- Hölldobler 1981, "Foraging and spatiotemporal territories in the honey ant *Myrmecocystus mimicus*", *Behav. Ecol. Sociobiol.*: https://www.Gwern.net/doc/biology/ant/1981-holldobler.pdf *(search summary only)*
- Topoff et al. 1987 and the *Polyergus* raid literature: see `raid-recruitment.md`; the dispute: https://ane.pl/index.php/ane/article/view/407 *(search summary only)*
