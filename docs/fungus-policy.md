# The fungus policy: brainstorm for a game about unifying ants

*Research and brainstorm note, 2026-11-01, revised the same day. The goal: the player is a fungus that unifies ant colonies. It alters behaviour so that rival colonies **collaborate**, **specialize** and **reorganize**, instead of one wiping out the other. Biology comes from primary papers and reviews found by web search. Most full texts could not be opened, so figures come from abstracts or citing pages, and anything not confirmed is marked **unverified**. Code references are to `web/src/colony/` at commit `e59e298`.*

## TL;DR

- **The fungus never decides for an ant.** Each colony keeps its own policy (the local rule, or Jev under the colony's doctrine), its own cache and its own 1,296 situations. The fungus decides **what it does to the ant**: what the ant perceives, what it gives off, and what happens to its body. The ant then makes its own choice from a **perceived state** the fungus has bent.
- **This is how real manipulators work.** *Rickia wasmannii*, a fungus that spreads through whole *Myrmica* colonies without killing, changes one alkane on the cuticle, and strangers stop being attacked. A leafcutter's fungus garden **feeds the colony's odour**. Argentine-ant supercolonies show what happens when recognition odours stop differing: no aggression across thousands of kilometres. *Ophiocordyceps* blunts foraging and communication, shifts the daily rhythm and, at the end, takes over the jaw muscles. None of them hand the ant a new rule; they change its senses, its smell and its body.
- **The fungus policy chooses among interventions.** Each is a bundle of levers with a biological basis: **perception** (channel gains, recognition tolerance, thresholds, the clock), **emission** (cuticular odour, trail and alarm deposits), **body** (speed, rhythm, summiting) and **spread** (sporulation, visibility). §4 catalogues ~35 levers; §5.2 groups them into a short menu the policy picks from.
- **The player is only the fungus, and shapes the policy — never an ant, never a host's intervention directly.** Five levers (§5.1): the **spore brush** (where the fungus is, and which strain), the **strain** (which interventions and caps exist at all — the home of "other organisms, eventually"), the **aim** (the policy's goal in the player's words), the **menu** (options on/off), and **thresholds** (free tuning of the local rule). The fungus may kill, but only in strains whose traits allow it.
- **Jev's place is the fungus's own lane.** The fungus has its own situation (load, host activity, where the host is, who is near, grooming pressure, how far apart the colonies are) and its own **aim**: the player's words for what the fungus wants. The aim only ever appears in the fungus lane's requests, never in an ant's. Ant requests and caches don't change. An ant in a bent perceived state still lands on one of the 1,296 situations the colony already knows.
- **Counterplay comes from social immunity.** Grooming clears spores, a heavy load gets an ant rejected, and sick ants keep away from the nest. The result is a **stealth against potency** dial.

---

## 1. What "unified" should mean, measurably

Today a game ends at `won` or `lost`: one colony is gone (`game.ts` `outcome`). A unifying fungus needs a different end. It needs a **unity meter** the panel can show, built from things the sim already counts or cheaply could:

| Signal | How to compute | Already there? |
|---|---|---|
| **Peace** | fight deaths per sim-minute, both colonies | deaths are returned by `resolveFights`; not yet logged |
| **Shared ground** | cells where both colonies' home fields are ≥ `FAINT`, ÷ cells where either is | per-colony fields exist; the overlap is a new scan over awake chunks |
| **Recognition** | distance between the two nests' odours (§4.B) | new |
| **Exchange** | food carried into the *other* colony's nest, or into a shared garden | new counter at the drop-off mechanic |
| **Mixing** | share of each colony's ants within the tolerance of the other nest's odour | new, from the odour grid |

**Unified** could be: nest odours within tolerance, and no fight deaths for 60 sim-s. A softer score (0–100 %) is the meter. Losing to war stays possible: if the colonies wipe each other out first, the fungus has lost its hosts.

## 2. Two policies, and the perceived state between them

```
world ── raw sensors ──▶ [ fungus: perception levers ] ──▶ perceived readings ──▶ perceived Situation
                                   ▲                                                    │
                     fungus policy │ picks an intervention                               ▼
                    (own situation,│ per host, cached; its own aim)            ant policy (unchanged:
                                   │                                         local rule or Jev + colony doctrine)
                                   │                                                    │
                                   └── emission, body and spread levers ◀── ant acts ◀──┘ mode
```

- **The ant policy is untouched.** Same `Situation`, same `encode`, same `COLONY_LEGEND`, same doctrine, same cache context (`colonyBrain.ts` `policyContext`). An infected ant is asked exactly what a healthy ant would be asked **if the world looked the way the infected ant perceives it**. It cannot tell it is infected. That is true to *Ophiocordyceps*: infected workers are fed and not attacked by nestmates.
- **The ant steers by its perceived readings too**, not only decides by them. Otherwise an ant that "perceives" a strong trail would decide to follow and then steer along the real, faint one. Steering and the situation must read the same distorted sensors.
- **What the fungus can reach in the perceived Situation, field by field:**

| Situation field | Fungus can bend it? | How | Basis |
|---|---|---|---|
| `foodTrail` | yes | channel gain, reading the rival's trail, noise, threshold | weakened communication (*Ophiocordyceps*); shared trail chemistry across colonies |
| `homeTrail` | yes | channel gain; **home template**: which nest's odour reads as home | nest and colony recognition by odour |
| `alarm` | yes | channel gain; graded response threshold | amine thresholds (octopamine, serotonin) |
| `enemy` | yes | recognition tolerance; the *other* ant's emitted odour | *Rickia* n‑C23; supercolony uniformity |
| `tired` | yes, weaker basis | the clock that counts time out (patience) | *Ophiocordyceps* rhythm loss; the fluke's temperature-gated cycle |
| `stance` | **no** | a colony-wide broadcast in the sim; no biological lever on one ant's reading of it | — |
| `mode` | **no** | the ant's own current behaviour | — |

- **Where the hooks are in code.** All are in the per-ant loop of `Colony.tick`, plus `battle.ts`:

| Hook | Where | Lever kind |
|---|---|---|
| **Sense** | `#sense` (`colony.ts:323`) reads food / home / alarm at three sensors | perception: multiply a channel, add the rival's field, noise, sensor geometry |
| **Classify** | `trailLevel` and `FAINT` / `STRONG` (`colony.ts:415`) | perception: per-ant thresholds |
| **Clock** | `since` against `patience` (`colony.ts:414`) | perception: how time out is felt |
| **Recognise** | enemy grid (`game.ts:66` `#refresh`), `#enemyHeading`, `resolveFights` (`battle.ts:85`) | perception (tolerance) and emission (the ant's own odour) |
| **Lay** | deposit (`colony.ts:462`); fight alarm in `resolveFights` | emission |
| **Move** | speed, wander, rest (`colony.ts:434–476`) | body |
| **Nest** | drop-off and "at nest" (`colony.ts:481`) | perception: the home template decides which nest feels like home |

- **Infection is two more typed arrays** on the ant structure of arrays: `load` (0..1) and `expr`, the intervention the fungus is running in that host (§5). A lever's strength scales with load, so a lightly infected ant is only lightly changed.

## 3. What real parasites do to ants

| Organism | What it does | Evidence | Lever (§4) |
|---|---|---|---|
| ***Rickia wasmannii*** (Laboulbeniales) on *Myrmica scabrinodis* | **Non-lethal**, can infect a whole colony. Infected workers carry more **tricosane (n‑C23)** and are **less aggressive to non-nestmates and to unrelated queens**, making extra queens easier to accept. Synthetic n‑C23 on non-nestmates lowers the aggression they receive. Aggression is lowest when **both** ants are infected. | Csata et al. 2017 ("Lock-picks"); 2023 *Commun Biol* follow-up. One host species. | B1 pacifying odour, B2 infected pairs, B4 tolerance |
| **Argentine ant** supercolonies | Recognition is by cuticular hydrocarbons. Introduced populations form one huge, chemically uniform supercolony with no internal aggression. Proposed causes: a bottleneck cut the diversity of recognition cues; diet-derived hydrocarbons shift profiles and lower aggression. Specific synthetic hydrocarbons can make nestmates attack each other. | Several studies; the genetics-against-diet balance is **contested** | B3 odour blending, B5 diet, B6 odour weapon |
| **Leafcutter fungus garden** (*Acromyrmex*) | Workers tell their own colony's fungus from a foreign one by its chemistry, and reject the foreign one. The fungus picks up colony odour from the brood, and gardens are proposed as an **independent source of recognition cues** in the colony's odour "gestalt". The ants' faecal droplets carry the resident fungus's imprint. | Viana et al. 2001; a 2007 *Acromyrmex* study | W1 shared garden |
| Leafcutter fungus → worker feedback | The garden is thought to signal its condition back to the ants, probably chemically. Ants are slow to drop plants that harm the fungus. | Green & Kooij 2018 commentary: a **hypothesis** | W2 garden scent |
| ***Escovopsis*** (garden parasite) | Minors groom the garden and majors weed it: **caste-specialized defence**. Infected colonies put **more workers on the midden**. *Escovopsis* raises metabolites thought to impede grooming. | *A. octospinosus* and *Atta colombica* studies | S3 grooming suppression; specialization through thresholds (A7) |
| ***Ophiocordyceps*** (zombie-ant fungi) | Infected *Camponotus* **lose their activity rhythm**, forage worse and **communicate less with nestmates**. Nestmates **do not attack or isolate** them; they keep getting fed. Before death, ants climb to a set height and bite a leaf vein, locked on by atrophied jaw muscles. Summiting happens at set times of day; clock hijack is proposed (correlational). | Trinh et al. 2021 ("Getting lost"); Penn State 2018; Hughes et al. 2011 | A1 gains, C1 emission, D2 rhythm, D4 summit, S2 stealth |
| ***Pandora formicae*** (Entomophthorales) on *Formica* | Infected ants die clinging to grass **in the evening, near trails and the nest**. Ants remove sporulating corpses faster than fresh ones. Manipulation is weaker than *Ophiocordyceps*. | KU Copenhagen studies | D3 clock windows, S4 corpses |
| ***Metarhizium*** (generalist) | Exposed *Lasius* foragers **and their nestmates** change behaviour so the contact network resists spread: exposed ants spend more time outside. Grooming passes **low doses** that immunise nestmates. 92 % of *Temnothorax* that died spontaneously had left the nest first. | Stroeymeyt et al. 2018 *Science*; Konrad et al. 2012 *PLoS Biol*; Heinze & Walter 2010 | §6 resistance; A10 clock |
| **Lancet fluke** *Dicrocoelium* (not a fungus) | **Temperature** sets the behaviour: infected ants climb grass when it is cool and let go when it warms, every day. One worm sits in the brain. A thesis reports **tyramine and serotonin 22 % / 17 % lower** in infected brains. | Field and lab studies; the amine figures are from a thesis | D3 condition-gated levers; A4, B4 amines |
| ***Myrmeconema*** (nematode) | The gaster turns **berry red** and is held up. Infected ants are sluggish and forage outside more. | Yanoviak et al. 2008; bird predation not directly seen | D1 pace, S2 visibility |
| **Octopamine / serotonin** (pavement ants) | Raising either makes workers **more likely to attack** non-nestmates; there seems to be a **threshold**. Recent contact with nestmates raises them. | Bubak et al. 2016 *PLoS ONE* | B4 tolerance, A4 alarm gain |
| **Microbiome** | Adding microbes to a harvester ant's cuticle gets it **rejected** by nestmates. In *Acromyrmex*, antibiotic-treated nestmates were more aggressive (preprint). No gut effect on recognition in Argentine ants. | Mixed | S2 visibility → rejection |
| ***Wolbachia*** (bacterium) in Pharaoh ants | Infected colonies grow faster and reproduce earlier ("live fast"). No cost found in the lab. | Preprint; a bacterium, not a fungus | D5 growth (weak basis) |
| **Parabiosis** (*Crematogaster* + *Camponotus*) | Two species share nests and trails. *Camponotus* follows *Crematogaster* trails, but not the reverse. Tolerance is selective, and each keeps its own recognition. | Field and chemical studies | A3 reading the rival's trails: collaboration *without* merging |
| **Pleometrosis** | Unrelated queens found a colony together after the nuptial flight. Usually only one survives the association. | *Lasius niger*, *Pogonomyrmex californicus* | W4 joint nest (later) |
| **Response thresholds** | Each worker does a task when its stimulus passes its own threshold. If doing a task lowers that threshold, specialists emerge. A 2023 model found specialization needs a **cost to switching tasks** as well. | Theraulaz, Bonabeau & Deneubourg 1998; Duarte et al. 2012; arXiv 2308.07122 | A7 thresholds |

**The design reading.** Real manipulators change **what an ant perceives, what it emits and what its body can do**. Only late, terminal summiting is a direct motor takeover, and even that is a body effect, not a new plan. The strongest unifying tool in nature is **recognition chemistry**: pacifying alkanes, a shared fungal odour, uniform supercolony labels.

---

## 4. The levers the fungus can pull

Each lever gives its **hook** (§2), what it pushes (**C**ollaborate / **S**pecialize / **R**eorganize), and a rough **effort**: S (a few lines and a test), M (a new array or grid), L (a new subsystem). All levers are free at run time; only the fungus *choosing* between them can be paid (§5).

### A. Perception: what the host senses

These are multipliers in `#sense` or on the readings just after it. They change the perceived Situation, and so the question the host's own policy answers.

| # | Lever | Basis | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| A1 | **Food-scent gain** ×0–3. Up: the host perceives trails as stronger and piles onto routes. Down: trails fade from its senses and it explores. | *Ophiocordyceps* weakens foraging and communication | `s[slot]` × gain | S | S |
| A2 | **Home-scent gain.** Down: the host leans on path integration and wanders further. Up: it clings to home. | — | `s[slot+3]` × gain | R | S |
| A3 | **Rival-trail reading** with weight *w* (0 = today). The host smells the other colony's food trail as food scent and follows it to the rival's food. *Asymmetric*: only infected hosts read across, like *Camponotus* on *Crematogaster* trails. | Parabiosis; trail chemicals shared across colonies and species (`ant-communication.md` §3) | `#sense` adds `w × foreign.fields.food` (`Game` sets `c.foreign = other.ph`, as it sets `enemies`) | **C** | S–M |
| A4 | **Alarm gain** up (skittish, routed easily) or down (calm). Damped alarm near strangers is the quietest form of pacifying. | Amine thresholds; the fluke lowers serotonin | `s[slot+6]` × gain | C | S |
| A5 | **Graded alarm.** Below a fungus-set level, alarm reads as a lure: hosts gather at a disturbance and meet, rather than scatter. Strong alarm still repels. This is the graded alarm from MR 7 (`ja-2iq`), at a threshold the fungus moves. | *Pogonomyrmex*: faint alarm attracts, strong alarm triggers attack | `avoid` → `climb` below a level | C | S |
| A6 | **Foreign-alarm blindness.** Hosts don't perceive alarm laid in the rival's fights. Needs the rival's alarm to be readable at all first (MR 7). | — | as A3, alarm | C | S |
| A7 | **Response thresholds.** The host's `FAINT` / `STRONG` × factor, per channel. A low food threshold makes a follower that acts on a whiff; a high one makes an explorer. With reinforcement (doing a mode lowers its threshold, plus a switching cost) the colony splits into specialists, and the fungus only seeds the bias. | Theraulaz, Bonabeau & Deneubourg 1998; arXiv 2308.07122 | classify step; per-ant offsets | **S** | S, M with reinforcement |
| A8 | **Sensor geometry.** Narrow (0.2 rad) makes precise haulers; wide (1.2 rad) makes scouts that catch side branches; long reach (3 → 5 cells) detects early. | — | `sensorAngle`, `sensorDistance` per ant | S | S |
| A9 | **Sensory noise.** Readings jitter, so hosts stray off trails and discover side routes. Too much makes ant mills. | "Getting lost" (*Ophiocordyceps*) | `#sense` + noise | S | S |
| A10 | **The host's clock.** Time out feels longer or shorter (`patience` × factor), which moves when `tired` turns on. Long: hosts push into the rival's ground (contact, so spread). Short: hosts stay home. | Rhythm loss (*Ophiocordyceps*); exposed *Lasius* stay out longer. Weaker basis. | `since` against `patience` | R | S |
| A11 | **Home template.** Which nest's odour the host perceives as *home*. As the host's template drifts (B3), the other colony's nest, or a shared garden, starts to read as home in `homeTrail`, path integration and the drop-off. Food then crosses colony lines **because the host thinks it is going home**. | Nest recognition by odour; fungus gardens as an odour source | nest test in `#sense` and drop-off; path-integration target | **C**, R | M |

### B. Recognition: who perceives whom as an enemy

Today an enemy is any ant of another colony within two cells (`#enemyHeading`) or in the 3×3 cells around it (`resolveFights`). That binary is the single thing keeping colonies apart. Recognition has two sides: what the host **emits** (its odour) and what the perceiver **tolerates**. The fungus can work on both.

| # | Lever | Basis | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| B1 | **Pacifying odour** (emission). The host gives off a cue that lowers *others'* aggression to it: other ants weight it × (1 − *p*·load) when counting enemies, for fighting and for `enemy: near`. | *Rickia* n‑C23; synthetic n‑C23 lowers aggression received | the enemy grid weighted by the seen ant's load; `resolveFights` | **C** | S |
| B2 | **Infected pairs.** When perceiver and perceived are both infected, the weight falls further, e.g. × (1 − *p*)². The more of both colonies is infected, the less war. | *Rickia*: infected–infected pairs fought least | an infected-count grid per colony | **C** | M |
| B3 | **Blending odour.** ⭐ Each ant carries an `odour` scalar (player 0, rival 1; with N colonies a hue angle). At its nest it relaxes toward the nest's odour (the gestalt), and the nest drifts toward its ants. The fungus raises how fast a host's odour relaxes toward **the ants it touches**. An ant perceives another as an enemy only when `|odour_i − odour_j| > τ`. Unity is the two nests' odours within τ. Draw ants coloured by odour, and the blending is visible. | Gestalt odour; supercolony uniformity | odour arrays; enemy grids binned by odour (e.g. 8 bins, one `CountGrid` each) | **C**, R | M |
| B4 | **Tolerance** (perception). The fungus widens the host's τ: it perceives fewer ants as strangers. Damping the attack drive (the turn toward enemies, `turnRate × 2`) belongs here too. | Octopamine and serotonin thresholds; the fluke lowers serotonin | τ per ant; fight steering | C | S |
| B5 | **Diet.** Odour drifts toward the food patch the host eats from. Two colonies on one patch converge. The fungus can seed a patch with its own flavour (a world action, W2). | Diet-derived hydrocarbons (Buczkowski et al. 2005; contested) | odour update at pick-up | C | S once B3 exists |
| B6 | **Odour weapon** (emission). A host's odour is pushed *away* from its own nest, so its nestmates perceive it as a stranger. It removes a colony's most warlike ants, at the cost of lives. | Synthetic hydrocarbons make nestmates attack | odour push | R | S once B3 exists |
| B7 | **Masking** (emission). A heavily loaded host smells of the fungus rather than of a colony: its odour moves to a neutral value that both colonies tolerate. It becomes a courier that can cross lines. | Fungal odour in gardens; *Ophiocordyceps* hosts not attacked | odour lerp to neutral | C | S once B3 exists |

**A consequence, not a lever: membership follows recognition.** Once a host's odour sits on the other nest's side of τ and its home template (A11) points there, it is in effect a member of that colony. The sim can make that explicit by moving the ant's slot across `Colony` arrays. That is how a weak colony gets workers instead of being raided (*Rickia* hosts accept strangers and queens). And when the two nests' odours stay within τ for a minute, the colonies can share one alliance id (MR 8 plans alliance ids, `ja-8fd`). Neither step is the fungus deciding anything; both follow from what the ants now perceive.

### C. Emission: what the host lays

| # | Lever | Basis | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| C1 | **Deposit gain** ×0–3. Down: quiet hosts that leave little trail. Up: loud trails, which A3 hosts of the other colony then pick up. | Weakened communication with nestmates (*Ophiocordyceps*) | `p.deposit` × gain | C, S | S |
| C2 | **Cross-laying.** The host's food deposit also lands in the rival's food field: the host leaks where food is to the other colony. | Trail chemicals shared across colonies and species | second `deposit` call on `foreign` | **C** | S |
| C3 | **Silent fights.** A host in a fight lays less alarm (`FightParams.alarm` × (1 − load)). One skirmish stops recruiting forty defenders. | Weakened communication | `resolveFights` | **C** | S |
| C4 | **Truce scent.** A host that meets a stranger without fighting (thanks to B1, B3 or B4) lays a short-lived scent that other hosts perceive as calming (A4 near it). Ceasefire zones spread out from the first peaceful contacts. | Design; no direct biological case | new channel, or negative alarm | C | M |
| C5 | **Mycelium.** Hosts lay the fungus's own network as they walk. Every infected ant, of either colony, perceives it as attractive, so where both colonies travel, shared highways form. | Design: hyphae as infrastructure | new channel in `Pheromones` (cheap with chunked layers) | C, R | M |

### D. Body: what the host can physically do

These levers have direct physical basis. They are not decisions: the host's policy still picks its mode, but the body carries it out differently.

| # | Lever | Basis | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| D1 | **Pace.** `speed` × factor. Sluggish hosts hold ground; fast hosts carry spores far. | *Myrmeconema*; late *Ophiocordyceps* | per-ant speed | — | S |
| D2 | **Rhythm loss.** Random rest bouts: the host stops mid-route. Poorer foraging, and it **falls out of step with a raid**. | *Ophiocordyceps*: loss of activity rhythm | rest timer | C | S |
| D3 | **Clock windows.** Any lever can be gated to a phase of a day clock, e.g. a **dusk truce**: B4 and A4 at full strength for 30 s of every 3 min. It needs MR 10's day/night (`ja-1vg`) or a fungus clock. | *Pandora* in the evening; the fluke by temperature; *Ophiocordyceps* at set times | `load × window(t)` | C | S |
| D4 | **Summit and grip** (terminal). A host near the end climbs (world height is a pure function, `world.ts`), locks on near rock and dies there as a **fixed spore emitter**: a beacon both colonies route past. It costs an ant. | Summit disease; jaw-muscle atrophy (Hughes et al. 2011) | a terminal body state at high load | R | M |
| D5 | **Growth.** A colony grows a little faster (`foodPerAnt` × 0.75) while it is not fighting: peace pays. | *Wolbachia* in Pharaoh ants (preprint); weak basis for a fungus | `foodPerAnt` by recent losses | C | S |

### S. Spread: how the fungus moves and how visible it is

| # | Lever | Basis | Hook | Effort |
|---|---|---|---|---|
| S1 | **Transmission.** Load passes on contact: each tick a host gains `β × Σ load` of the ants in its 3×3 cells, across both colonies. That is the neighbourhood `resolveFights` already scans with block sums. | Spores pass by contact and grooming (Konrad et al. 2012) | `battle.ts` neighbourhood | M |
| S2 | **Visibility.** How much of the load shows. Visible hosts are groomed (cleared) or, past a level, perceived as strangers by their own nestmates. Hidden load spreads unchecked. | Microbe-augmented ants rejected; *Ophiocordyceps* hosts not | grooming and rejection terms | S |
| S3 | **Grooming suppression.** Hosts resist nestmates' grooming. | *Escovopsis* metabolites thought to impede grooming | grooming term | S |
| S4 | **Sporulating corpses.** A dead host leaves a spore cloud for ~30 s, so **fights spread the fungus**: the fungus profits from the first battles, then ends them. Colonies carrying corpses away is the counterplay. | *Pandora*: sporulating corpses, removed faster | at `kill(i)` | S |
| S5 | **Exile.** A heavily loaded host keeps away from the nest (low home gain plus a long clock), so a **mixed frontier population** forms at the border and blends. | Moribund *Temnothorax* leave the nest; exposed *Lasius* stay out | A2 + A10 at high load | S |

### W. The fungus acting on the world, not the host

| # | Lever | Basis | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| W1 | **Shared garden.** ⭐ The fungus grows a garden at a spot between the nests: a nest-like site with its own odour. Hosts whose home template (A11) has drifted toward it deliver food there. It pays food back to both larders in proportion to deliveries, and **pulls everyone who tends it toward one odour** (B3). The leafcutter biology becomes the win mechanic: one fungus, one colony odour. | *Acromyrmex* gardens as a recognition source; faecal imprint | `Nest`-like site in `world.ts`; drop-off; odour pull | **C**, **R** | M–L |
| W2 | **Garden scent and flavoured food.** The garden emits a scent that hosts perceive as food; the fungus can flavour a patch (B5). It steers *what* both colonies gather, not where any one ant goes. | Fungus-to-forager feedback (hypothesis) | per-patch attraction; scent source | C | M |
| W3 | **Spore brush.** The player's hand on the map (§5.1). It inoculates: it raises infection `load` on the ground and on the ants in the stroke, with the **strain** currently loaded. It does **not** pick interventions — the policy does. See §5.1. | — | brush | — | S |
| W4 | **Joint nest** (later). With enough mixed hosts at the garden, a new colony buds there, belonging to neither founder. In MR 10 terms, a daughter colony with two mothers. | Pleometrosis | new `Colony` at the garden | **R** | L |

---

## 5. The fungus policy

**The player is the fungus, and nothing else.** No colony, no side, no ant to command. The player never picks an ant's mode, and never picks a host's intervention directly. The player shapes **the policy** that picks interventions, and places the fungus in space. The policy does the rest, host by host. §5.1 is the set of levers the player has on it; §5.2 is the policy itself.

**What the policy decides.** For each host, which **intervention** the fungus inside it runs. An intervention is a preset bundle of levers from §4, so the choice is a small `choice` question, and the levers' numbers live in code where they can be tuned and tested.

### 5.1 The player's levers on the policy

Five ways to modify the policy, coarse to fine. The player lives here; this is the game's control surface.

1. **The spore brush — where, and which strain.** The fungus has no body on the field except through hosts and the ground, so the brush is the player's one physical act. A stroke raises infection `load` on the ground and on the ants it covers, seeding spread from there; load then passes by contact (S1). It does not choose an intervention — it chooses **where the fungus is** and **which strain** is there. Painting near a border seeds blending where the colonies meet; painting into a nest spreads inside one colony; painting a line between nests lays the first thread of a shared network (C5). It replaces nothing the policy does; it decides what the policy has to work with, and where.
   - *Secondary brushes, later:* grow a garden (W1), lay mycelium (C5), or clear the fungus back out of a region (an undo, and a way to answer a colony's grooming by retreating).

2. **The strain — the fungus's traits (what the policy may do at all).** A strain is the loadout the brush paints: it sets the **action space** the policy chooses from, not the choice. It carries:
   - **which interventions exist** in this strain (a *Rickia*-like strain has no `sporulate` and no lethal levers; a *Cordyceps*-like strain has `summit`);
   - **caps** on each lever: maximum potency, maximum visibility (S2), transmission rate (S1), whether it may kill;
   - a **cost budget**, so a strain that spreads fast and hides well cannot also override hard — the stealth-against-potency dial (§6) is set per strain.
   This is where "other organisms, eventually" lives: a strain is one trait set; a nematode, a fluke, a bacterium or a parabiotic partner is another, with its own levers and its own situation fields. The policy and the engine don't change; the trait set does. The player assembling or unlocking strains is the meta-layer (overlaps MR 13 `ja-azo`, "unlockable fungus powers").

3. **The aim — the policy's goal, in the player's words.** Natural language, the fungus's analogue of a colony's doctrine: *"Unite the two colonies without killing either,"* or *"Thin the warlike ants and fold the rest into one nest."* It rides only in the fungus Jev lane's request state (§5.2), never in an ant's. Changing it re-asks only the fungal situations the game meets, and caches are kept per aim, so an aim used before is free (exactly as colony doctrines work today, `policyContext`).

4. **The intervention menu — turning the policy's options on and off.** Above the strain's hard caps, the player can disable or bias single interventions for a run: forbid every lethal lever for a pacifist game, or weight `blend` so the policy reaches for it first. This edits the policy's action space directly, and is the bridge between a vague aim and exact behaviour. With Jev it enters the aim/legend; with the local rule it is a mask on the rule's output.

5. **The local rule's thresholds — fine tuning without Jev.** The free local fungus rule (§5.2) has a few numbers: how much grooming pressure flips a host to `dormant`, how close a stranger triggers `soothe`, the load at which `summit` is allowed. Sliders on these let a player tune the policy with no spend, and they are the baseline the Jev policy is measured against.

**So: the player paints strains to decide where and what kind; sets an aim and a menu to decide what the policy is trying to do; and tunes thresholds for the free version. The policy turns all of that into one intervention per host per situation.**

### 5.2 The policy itself

**A starting menu** (six interventions):

| Intervention | Levers | When it should help |
|---|---|---|
| **dormant** | none; minimal visibility | stealth: under grooming pressure, or to spread unseen |
| **sporulate** | transmission ↑, visibility ↑, pace ↑ | early: seed both colonies; costs grooming and rejection |
| **soothe** | B1 pacifying odour, B4 tolerance, A4 alarm gain ↓, C3 silent fights | at the front, where strangers meet |
| **blend** | B3 contact blending ↑, B5 diet, A11 template drift, B7 mask at high load | when contact is calm and the colonies are still apart |
| **share** | A3 rival-trail reading, C2 cross-laying, A1 food gain ↑ | foragers on shared ground: shared routes and food |
| **roam** | A9 noise, A10 longer clock, A2 home gain ↓, S5 exile | to push hosts out to the frontier, where the colonies meet |
| **cull** (lethal; strain-gated) | B6 odour weapon, D4 summit | thin a colony's most warlike ants, or raise a spore beacon — costs the host |

`cull` exists only in strains whose traits allow killing (§5.1 lever 2); a *Rickia*-like strain omits it and the policy never offers it. Specialization comes from **where** the fungus runs which intervention, together with the thresholds (A7): a colony whose foragers carry *share* and whose border carries *soothe* sorts itself into haulers and peacekeepers.

**The fungus's own situation.** This is what the fungus in one host can sense. It is coarse, so it caches like the ant situations:

| Field | Values | From |
|---|---|---|
| `load` | low / mid / high | `load` |
| `hostActivity` | explore / follow / return / fight | the host's mode, read as activity, not chosen |
| `ground` | home / border / foreign | own home field against the rival's, at the host |
| `contact` | none / kin / strangers | the odour grid around the host, judged by the host's τ |
| `groomed` | yes / no | load removed by grooming in the last few seconds |
| `apart` | apart / close / one | the unity meter, coarse (game-wide) |

That gives 3 × 4 × 3 × 3 × 2 × 3 = **648** fungal situations, and a run will meet far fewer. The basis for "the fungus senses its host" is that fungal manipulation genes switch on at set disease stages and times of day (*Ophiocordyceps* transcriptomics). The exact cues it reads are **design**.

**Who answers.**
- **A local fungus rule**, free: the default when Jev is off, and the baseline to test against. For example: groomed → dormant; strangers near → soothe; calm contact while apart → blend; foraging on border ground → share; low load at home → sporulate.
- **Jev, cached per fungal situation, under the fungus's aim.** The aim is the player's words for what the fungus wants (e.g. "unite the two colonies without killing either"). It rides only in the fungus lane's state, beside a fungus legend. It never enters an ant request.
- A **colony-level** variant is cheaper still: one intervention per colony every ~10 s from a stance-like view (infection share, unity, deaths, grooming, food left). Coarser, but a sensible first step before the per-host lane.

**How it is scheduled.** Like the ant modes: a host's fungus asks only when its fungal situation changes. It answers synchronously from the cache, or the local fungus rule while the question is queued. Requests are packed, at most 100 situations each, through the same proxy, ledger and caps.

## 6. Making it a game: resistance and failure

**Resistance (counterplay), from social immunity:**
- **Grooming.** Healthy nestmates next to a visible host lower its load and take a small dose themselves. A small dose gives lasting **resistance** (Konrad et al. 2012), so a colony that grooms heavily becomes immune.
- **Rejection.** Past a visible load, nestmates perceive the host as a stranger (the harvester-ant microbiome result). A loud strain gets its hosts killed by their own side.
- **Exile.** Exposed ants keep to the outside (Stroeymeyt et al. 2018). This slows spread into the nest, but it **helps** unification (S5), so the fungus may *want* it.
- **Corpse removal.** Corpses carried off limit S4.

**The dial: stealth against potency.** *dormant* and mild *soothe* (like *Rickia*: no visible load, never rejected) spread everywhere but only nudge. *sporulate* and strong *blend* change a lot but trigger grooming and rejection. The fungus policy's real job is choosing where on that dial each host sits; that is what makes it a policy worth asking Jev about.

**Failure modes to test for:**
1. **Soothe everything → famine.** If nobody defends, a raid by an uninfected faction wins anyway, or both colonies over-forage and starve. Unity should need *both* colonies alive.
2. **Rival-trail reading → ant mills between nests** (A3). Food trails from two nests can form loops. The *tired* rule and MR 7's no-entry mark are the guards; test with the mill check from MR 2.
3. **Odour overshoot.** Blending toward contacts can oscillate, or leave "everyone a stranger" mid-blend. Use one-way relaxation with clamped rates, and test that two equal colonies converge monotonically.
4. **Runaway infection**, and the game is over in a minute. Transmission must fall with resistance; tune it on the headless bench.
5. **Steering against perception.** If any steering path still reads raw sensors, the ant decides by one world and walks in another. A test should pin that steering and the situation see the same distorted readings.

## 7. Cost

| Lane | Situations | Tokens / question | Note |
|---|---|---|---|
| Ant modes | unchanged (1,296) | unchanged (~451) | request state unchanged, so tokens/ant unchanged. Bent perception may reach a few situations the colony rarely meets: measure the ant-situation count with infection on |
| Stances | unchanged | unchanged | — |
| **Fungus, per host** | 648 possible; a run meets far fewer | ~stance-lane size (**estimate**: legend + aim + a 6-field state) | new; one question per fungal situation per aim |
| Fungus, per colony | a few hundred possible views | as above | cheapest first step |

Per CLAUDE.md, the PR that adds the fungus lane must report the measured tokens per question (`npm run colony-cost`, with a fungus stand-in).

## 8. A first slice (proposed "MR: fungus 1")

Five pieces. Each is pure TypeScript in `web/src/colony/`, testable with `node --test`.

1. **Infection and spread** (S1, S2, W3): `load` and `expr` arrays; contact transmission across colonies; grooming and decay; the spore brush.
   - *Test*: a loaded ant among clean ants raises their load; isolated ants don't change; grooming lowers visible load.
2. **The perception layer** (A1–A4, A10). One distortion step between `#sense` and both the situation and steering.
   - *Test*: food gain 0 makes a follower lose a trail; foreign weight > 0 lets a host reach the rival's food along the rival's trail; the host's policy is called with the same `Situation` type and cache key as a healthy ant's.
3. **Recognition** (B1, B3, B4). Pacifying odour, blending odour with a tolerance, a unity meter and a "unified" outcome.
   - *Test*: two colonies sharing contacts converge monotonically, and fights stop once inside τ.
4. **Emission** (C1–C3).
   - *Test*: silent hosts in a skirmish recruit fewer defenders on a fixed seed.
5. **The fungus policy** with the local fungus rule and the six interventions, per colony first. Jev for the fungus lane follows once the local rule plays well.
   - *Test*: the ant request built for an infected host is byte-identical to a healthy ant's in the same perceived situation.

**Defer**: the shared garden and joint nest (W1, W2, W4), membership changes and alliances, reinforced thresholds (A7 with reinforcement), clock windows (D3, after MR 10), summiting (D4), and the per-host Jev fungus lane.

**Status (2026-11-01).** 1a, 1b and 1c are built (PRD §15–17). As built, B3 is a *fungal share* of the host's odour (the fungus's own odour, 0.5, carried home by Garden hosts; B7-style). Contact blending as written above was tried first and moved nothing measurable: contacts with strangers are brief fights, and the nest's gestalt undoes them (PRD §17).

**Overlap with the plan.**
- MR 7 (`ja-2iq`) makes footprints readable across colonies and adds graded alarm. That is the groundwork for A3, A5 and A6, so it should land first.
- MR 8 (`ja-8fd`) brings N colonies and alliance ids.
- MR 13 (`ja-azo`) lists "fungus powers" (propaganda, decoy food, spore wall); W3 and the interventions fit there or replace it.

## 9. Decisions (2026-11-01)

1. **The player is only the fungus.** No colony, no side. Both colonies run their own policies (local rule or Jev under their own doctrine). The player acts solely through §5.1.
2. **Other organisms, eventually.** The fungus is organism #1. A strain is a trait set (§5.1 lever 2), and a later organism — nematode, fluke, bacterium, a parabiotic partner — is another trait set with its own levers and situation fields. The perceived-state architecture (§2) and the two-policy split must stay general enough that adding one touches a trait table, not the engine.
3. **The fungus may kill.** Lethal levers (`cull`: B6 odour weapon, D4 summit) are allowed, but strain-gated: a strain only offers them if its traits permit killing, so a non-lethal game is a strain choice, not a code path.
4. **The policy picks interventions; the player modifies the policy.** Not a brush-per-intervention. The player's levers are the five in §5.1 — brush (where + strain), strain (what's possible), aim (the goal), menu (options on/off), thresholds (free tuning). The policy (local rule or Jev) turns them into one intervention per host.

**Still open:** the win condition — merged colonies (one alliance) versus lasting peace with exchange (§1). Leaning toward the unity meter as a score and "merged + no deaths for 60 s" as the clean ending, with the merge itself a consequence of perception (§4.B), not a fungus action. Revisit alongside MR 10's lifetime world, where nothing ends.

## Sources

- *Rickia wasmannii*, pacifying alkane and lowered aggression: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9935638/ · https://link.springer.com/10.1038/s42003-023-04541-7 · https://www.pubmed.gov/36797462/
- Argentine ants, recognition hydrocarbons and supercolonies: https://bmcbiol.biomedcentral.com/articles/10.1186/1741-7007-7-71 · https://esa.confex.com/esa/2005/techprogram/paper_22074.htm · https://core.ac.uk/download/18156603.pdf · https://www.entm.purdue.edu/ants/pubs/9.pdf
- Leafcutter fungus garden as a source of colony odour: https://locus.ufv.br/items/702e4948-e873-4394-b7f6-f7d19a4759ad · https://test01.ku.dk/:obvius/pureproxy/3974268/da/publications/the-origin-of-the-chemical-profiles-of-fungal-symbionts-and-their · https://www.scielo.br/j/babt/a/ZWkj9KN6n5Nb97vZwR6G9zx/?lang=en
- Fungus-to-ant feedback (Green & Kooij 2018): https://springerlink.bibliotecabuap.elogim.com/doi/10.1007/s00049-018-0260-x · https://www.frontiersin.org/articles/10.3389/fevo.2020.00095/full
- *Escovopsis*, caste-specialized defence and midden workers: https://researchprofiles.ku.dk/da/publications/caste-specialization-in-behavioral-defenses-against-fungus-garden/ · https://www.tara.tcd.ie/items/60e96153-be24-4979-a574-c089e296cb17 · https://pmc.ncbi.nlm.nih.gov/articles/PMC5992151
- *Ophiocordyceps*, foraging, rhythm and clock: https://research-portal.uu.nl/en/publications/getting-lost-the-fungal-hijacking-of-ant-foraging-behaviour-in-sp/ · https://www.sciencedaily.com/releases/2018/03/180313130636.htm · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7341126/ · https://www.nature.com/articles/s41598-023-40065-0.pdf
- *Ophiocordyceps* death grip (Hughes et al. 2011): https://www.biomedcentral.com/1472-6785/11/13
- *Pandora formicae*: https://pmc.ncbi.nlm.nih.gov/articles/PMC5624889 · https://www.antwiki.org/wiki/Summiting_Behaviour
- *Metarhizium* and social immunity: https://www.eurekalert.org/news-releases/778188 · https://journals.plos.org/plosbiology/article/info:doi/10.1371/journal.pbio.1001300 · https://antwiki.org/wiki/Social_Immunity_and_Disease_Resistance · https://discovermagazine.com/planet-earth/terminally-ill-ants-choose-to-die-alone
- Lancet fluke: https://pmc.ncbi.nlm.nih.gov/articles/PMC7084154 · https://www.ulethbridge.ca/node/26288 · https://prism.ucalgary.ca/items/4ed30da6-ecc3-4ef0-957b-619f251b0668
- *Myrmeconema neotropicum*: https://en.wikipedia.org/wiki/Myrmeconema_neotropicum · https://newsarchive.berkeley.edu/news/media/releases/2008/01/16_ants.shtml
- Octopamine, serotonin and aggression (pavement ants): https://pmc.ncbi.nlm.nih.gov/articles/PMC5112987 · https://sicb.org/?p=12108
- Microbiome and nestmate recognition: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4741111/ · https://www.biorxiv.org/content/10.1101/335521.full.pdf
- *Wolbachia* in Pharaoh ants (preprint): https://www.biorxiv.org/content/10.1101/2023.01.31.526493.full.pdf
- Parabiosis: https://link.springer.com/doi/10.1007/s00040-007-0914-0 · https://escholarship.org/uc/item/7c26m5s9 · https://pmc.ncbi.nlm.nih.gov/articles/PMC3579830
- Pleometrosis: https://pmc.ncbi.nlm.nih.gov/articles/PMC7862224 · https://doi.org/10.3389/fevo.2022.768752
- Response-threshold division of labour: https://pmc.ncbi.nlm.nih.gov/articles/PMC1688885 · https://link.springer.com/content/pdf/10.1007/s00265-012-1343-2.pdf · https://arxiv.org/pdf/2308.07122
