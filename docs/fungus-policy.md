# The fungus policy: brainstorm for a game about unifying ants

*Research and brainstorm note, 2026-11-01. The goal: the player is a fungus that unifies ant colonies. It alters behaviour so that rival colonies **collaborate**, **specialize** and **reorganize**, instead of one wiping out the other. Biology comes from primary papers and reviews found by web search. Most full texts could not be opened, so figures come from abstracts or citing pages, and anything not confirmed is marked **unverified**. Code references are to `web/src/colony/` at commit `e59e298`.*

## TL;DR

- **Real fungi already do this.** *Rickia wasmannii* is a non-lethal fungus that spreads through whole *Myrmica* colonies. It makes workers **less aggressive to strangers** through one cuticular alkane (n‑C23). When both ants are infected, aggression drops further. A leafcutter's fungus garden is a **source of colony odour**. Argentine-ant supercolonies are what happens when recognition odours stop differing: no aggression across thousands of kilometres. These three facts are the spine of the game.
- **Infection is per-ant state, and the fungus policy is a vector of modifiers.** It acts at the six places an ant touches the world: *sense*, *recognise*, *lay*, *decide*, *move*, and the *mechanics* (where food goes and which nest is home). Most of them are a multiply or an add in code that already exists, and most are free: no Jev.
- **The headline mechanic is colony odour as a number that blends.** Today "enemy" is a fixed colony id. Make it a continuous odour that relaxes toward whatever the ant touches and eats. Infection speeds up the blending and widens the tolerance. When the two nests' odours converge, the colonies are one. It is visible (colour ants by odour hue) and true to the biology. It also gives a clean win condition.
- **Jev's role: the fungus writes the doctrine for the ants it infects.** Infected ants, the rival's included, are asked under a **fungus doctrine** instead of their colony's. Caches are already kept per doctrine, so this adds **no situation dimension**: it costs one more doctrine's questions (~$0.005–0.01 by the MR 4 measurements). A small *fungus strategist* lane, like the stance lane, can pick which expression the fungus runs.
- **Counterplay comes from social immunity.** Grooming clears spores, a heavy load gets an ant rejected, and sick ants keep away from the nest. The result is a **stealth against potency** dial: mild strains spread unseen, strong strains control hard but get culled.
- **Proposed first slice** (§7): infection load with contact spread and a spore brush; perception gains, including reading the rival's trails; pacify; blending odour with a unity meter; the fungus doctrine. The rest of the 40-odd ideas are catalogued in §4.

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

**Unified** could be: nest odours within tolerance, and no fight deaths for 60 sim-s. A softer score (0–100 %) is the meter. Beaten-by-war stays possible: if the colonies wipe each other out first, the fungus has lost its hosts.

## 2. Where a fungus can touch an ant (the code's hooks)

Every idea in §4 lands on one of these. All are in the per-ant loop of `Colony.tick`, plus `battle.ts`.

| Hook | Where | What a modifier does there |
|---|---|---|
| **Sense** | `#sense` (`colony.ts:323`) reads food / home / alarm at three sensors | multiply a channel (gain up or down), add another field (the rival's), change sensor distance or angle |
| **Classify** | `trailLevel` and `FAINT` / `STRONG` (`colony.ts:415`) turn readings into the situation | shift the thresholds per ant: response thresholds, the basis of specialization |
| **Decide** | `this.policy(...)` (`colony.ts:422`) | swap the policy (the fungus doctrine), or bias its input |
| **Steer** | mode steering and alarm avoidance (`colony.ts:434–460`) | wander, turn rate, alarm sign (avoid ↔ approach) |
| **Lay** | deposit (`colony.ts:462`) | deposit gain; lay into another field (the rival's, or a fungal one) |
| **Recognise / fight** | enemy grid (`game.ts:66` `#refresh`) and `resolveFights` (`battle.ts:85`) | who counts as an enemy; hazard rate; who gets alarm |
| **Mechanics** | pick-up and drop-off, nest, patience (`colony.ts:414`, `:481`) | which nest counts as home, where food may be delivered, how long before tired |

The ant state is a structure of arrays, so infection is one or two more typed arrays: `load: Float32Array` (0..1) and `strain: Uint8Array`. Every modifier is `base × (1 + effect × load)` or a lerp by load, so a lightly infected ant is only lightly changed.

## 3. What real parasites do to ants

| Organism | What it does | Evidence | Game lever |
|---|---|---|---|
| ***Rickia wasmannii*** (Laboulbeniales) on *Myrmica scabrinodis* | **Non-lethal**, can infect a whole colony. Infected workers carry more **tricosane (n‑C23)** and are **less aggressive to non-nestmates and to unrelated queens**, making extra queens easier to accept. Synthetic n‑C23 on non-nestmates lowers the aggression they receive. Aggression is lowest when **both** ants are infected. | Csata et al. 2017 ("Lock-picks"); 2023 *Commun Biol* follow-up. One host species. | **Pacify** (B1), **infected-pair bonus** (B2), **lock-pick adoption** (F3) |
| **Argentine ant** supercolonies | Recognition is by cuticular hydrocarbons. Introduced populations form one huge, chemically uniform supercolony with no internal aggression. Proposed causes: a bottleneck cut the diversity of recognition cues; diet-derived hydrocarbons shift profiles and lower aggression. Specific synthetic hydrocarbons can make nestmates attack each other. | Several studies; the genetics-against-diet balance is **contested** | **Odour blending** (B3), **shared diet** (B4), **odour weapons** (B6) |
| **Leafcutter fungus garden** (*Acromyrmex*) | Workers tell their own colony's fungus from a foreign one by its chemistry, and reject the foreign one. The fungus picks up colony odour from the brood, and gardens are proposed as an **independent source of recognition cues** in the colony's odour "gestalt". The ants' faecal droplets carry the resident fungus's imprint. | Viana et al. 2001; a 2007 *Acromyrmex* study | **Shared garden** (F1): two colonies feeding one fungus converge on one odour |
| Leafcutter fungus → worker feedback | The garden is thought to signal its condition back to the ants, probably chemically. Ants are slow to drop plants that harm the fungus. | Green & Kooij 2018 commentary: a **hypothesis** | The fungus **telling foragers** what to fetch (D6) |
| ***Escovopsis*** (garden parasite) | Minors groom the garden and majors weed it: **caste-specialized defence**. Infected colonies put **more workers on the midden**. *Escovopsis* raises metabolites thought to impede grooming. | *A. octospinosus* and *Atta colombica* studies | Infection **reallocates tasks** (D3); a strain that **suppresses grooming** (§5) |
| ***Ophiocordyceps*** (zombie-ant fungi) | Infected *Camponotus* **lose their activity rhythm**, forage worse and **communicate less with nestmates**. Nestmates **do not attack or isolate** them; they keep getting fed. Before death, ants climb to a set height and bite a leaf vein, locked on by atrophied jaw muscles. Summiting happens at set times of day; clock hijack is proposed (correlational). | Trinh et al. 2021 ("Getting lost"); Penn State 2018; Hughes et al. 2011 | **Desync and wander** (E2), **stealth** (§5), **summit beacons** (E4), **clock windows** (E3) |
| ***Pandora formicae*** (Entomophthorales) on *Formica* | Infected ants die clinging to grass **in the evening, near trails and the nest**. Ants remove sporulating corpses faster than fresh ones. Manipulation is weaker than *Ophiocordyceps*. | KU Copenhagen studies | **Sporulating corpses** (E5), **necrophoresis** counterplay |
| ***Metarhizium*** (generalist) | Exposed *Lasius* foragers **and their nestmates** change behaviour so the contact network resists spread: exposed ants spend more time outside. Grooming passes **low doses** that immunise nestmates. 92 % of *Temnothorax* that died spontaneously had left the nest first. | Stroeymeyt et al. 2018 *Science*; Konrad et al. 2012 *PLoS Biol*; Heinze & Walter 2010 | **Social immunity** (§5), **self-exile** (E6) |
| **Lancet fluke** *Dicrocoelium* (not a fungus) | **Temperature** sets the behaviour: infected ants climb grass when it is cool and let go when it warms, every day. One worm sits in the brain. A thesis reports **tyramine and serotonin 22 % / 17 % lower** in infected brains. | Field and lab studies; the amine figures are from a thesis | **Condition-gated effects** (E3) |
| ***Myrmeconema*** (nematode) | The gaster turns **berry red** and is held up. Infected ants are sluggish and forage outside more. | Yanoviak et al. 2008; bird predation not directly seen | **Visible marks** (E7), **slow and showy** |
| **Octopamine / serotonin** (pavement ants) | Raising either makes workers **more likely to attack** non-nestmates; there seems to be a **threshold**. Recent contact with nestmates raises them. | Bubak et al. 2016 *PLoS ONE* | **Aggression threshold** (B5): fungus lowers the amines |
| **Microbiome** | Adding microbes to a harvester ant's cuticle gets it **rejected** by nestmates. In *Acromyrmex*, antibiotic-treated nestmates were more aggressive (preprint). No gut effect on recognition in Argentine ants. | Mixed | **A heavy load is visible** (§5) |
| ***Wolbachia*** (bacterium) in Pharaoh ants | Infected colonies grow faster and reproduce earlier ("live fast"). No cost found in the lab. | Preprint | **Growth boon** strain (F5) |
| **Parabiosis** (*Crematogaster* + *Camponotus*) | Two species share nests and trails. *Camponotus* follows *Crematogaster* trails, but not the reverse. Tolerance is selective, and each keeps its own recognition. | Field and chemical studies | **Asymmetric trail reading** (A3): collaboration *without* merging |
| **Pleometrosis** | Unrelated queens found a colony together after the nuptial flight. Usually only one survives the association. | *Lasius niger*, *Pogonomyrmex californicus* | **Co-founded nests** (F4) |
| **Response thresholds** | Each worker does a task when its stimulus passes its own threshold. If doing a task lowers that threshold, specialists emerge. A 2023 model found specialization needs a **cost to switching tasks** as well. | Theraulaz, Bonabeau & Deneubourg 1998; Duarte et al. 2012; arXiv 2308.07122 | **Specialization** (D1, D2) |

**The design reading.** Real manipulators work by **changing what an ant perceives or emits**, rarely by issuing new orders. The strongest unifying tool in nature is **recognition chemistry**: pacifying alkanes, a shared fungal odour, uniform supercolony labels. That favours mechanics on *sense* and *recognise*, which are free, over mechanics on *decide*, which is paid.

---

## 4. The brainstorm: ways a fungus could act

Each idea gives its **hook** (§2), its **cost** (*free* = steering or mechanics only; *paid* = touches the Jev situation or doctrine), what it pushes (**C**ollaborate / **S**pecialize / **R**eorganize), and a rough **effort**: S (a few lines and a test), M (a new array or grid), L (a new subsystem).

### A. Perception: turning pheromone senses up or down

All of these are multipliers in `#sense` or on the readings just after it. They are free, and the situation follows by itself: a damped food channel reads `none` more often, so the policy is asked a different question.

| # | Idea | Biology | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| A1 | **Food-scent gain** ×0–3. Up makes trail addicts who pile onto routes; down makes ants ignore trails and explore. | *Ophiocordyceps* weakens communication | `s[slot]` × gain | S | S |
| A2 | **Home-scent gain.** Down: ants rely on path integration and wander more. Up: ants cling to home. | — | `s[slot+3]` × gain | R | S |
| A3 | **Read the rival's trails** with weight *w* (0 = today). Infected ants follow the other colony's food trail to *its* food: shared foraging routes. *Asymmetric*: only infected ants read, like *Camponotus* on *Crematogaster* trails. | Parabiosis; shared trail chemistry across species (`ant-communication.md` §3) | `#sense` adds `w × foreign.fields.food` (game sets `c.foreign = other.ph`, as it sets `enemies` today) | **C** | S–M |
| A4 | **Alarm gain** up (skittish, easily routed) or down (calm). Down near the rival's ants is a quiet form of pacify. | Amine thresholds | `s[slot+6]` × gain | C | S |
| A5 | **Alarm sign flip.** Faint alarm attracts instead of repels: ants gather to a disturbance and meet, rather than scatter. Strong alarm still repels. This is the graded alarm from MR 7 (`ja-2iq`), at a fungus-set threshold. | *Pogonomyrmex* graded alarm | `avoid` → `climb` below a level | C | S |
| A6 | **Foreign-alarm blindness.** Infected ants ignore alarm laid by the rival colony's fights. Needs per-colony alarm to be readable across colonies first. | — | as A3, alarm | C | S |
| A7 | **Trail-threshold shift** per ant: `FAINT` / `STRONG` × factor. A low threshold makes a follower that acts on faint scent; a high one makes an explorer. This is the cheapest specialization knob. | Response thresholds | classify step | **S** | S |
| A8 | **Tunnel vision.** Sensor angle 0.6 → 0.2 rad: precise, slow-turning haulers. **Wide-eyed**: 1.2 rad, scouts that catch side branches. | — | `sensorAngle` per ant | S | S |
| A9 | **Long nose.** `sensorDistance` 3 → 5: early detection of food and enemies, at the cost of cutting corners on trails. | — | per ant | S | S |
| A10 | **Hallucination.** Noise added to sensor readings: infected ants stray off trails and discover side routes. Too much makes ant mills. | "Getting lost" (*Ophiocordyceps*) | `#sense` + noise | S | S |
| A11 | **Smell the fungus.** A fourth field, *mycelium*, that every infected ant reads as attractive whatever its colony. The fungus grows it along paths infected ants walk, or the player paints it. It becomes **one network both colonies use**. | Fungal hyphae as infrastructure (design, not biology) | new channel in `Pheromones` (the chunked layer makes this cheap) | **C**, R | M |

### B. Recognition and aggression: who counts as an enemy

Today an enemy is any ant of another colony within two cells (`#enemyHeading`) or the 3×3 cells around it (`resolveFights`). That binary is the single thing keeping colonies apart.

| # | Idea | Biology | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| B1 | **Pacify.** An infected ant counts enemies × (1 − *p*·load) when fighting and when deciding `enemy: near`. It still sees them; it just doesn't care. | *Rickia* n‑C23 | `resolveFights` weight; enemy grid weighted by the *seen* ant's load | **C** | S |
| B2 | **Infected-pair bonus.** When *both* ants are infected, their mutual hazard falls further, e.g. × (1 − *p*)². Infection becomes a passport: the more of both colonies infected, the less war. | *Rickia*: infected–infected pairs fought least | per-pair weight (needs an infected-count grid per colony) | **C** | M |
| B3 | **Blending colony odour.** ⭐ Each ant carries an `odour` scalar (player 0, rival 1; with N colonies a hue angle). At its nest it relaxes toward the nest's odour (the gestalt), and the nest drifts toward its ants. Infected ants also relax toward **the ants they touch**, at a rate ∝ load. An ant is an enemy only when `|odour_i − odour_j| > τ`. Unity is the nests' odours within τ. Draw ants coloured by odour, and the blending is visible. | Gestalt odour; Argentine-ant uniformity | enemy grids binned by odour (e.g. 8 bins, one `CountGrid` each); B1's weight becomes this | **C**, R | M |
| B4 | **Shared diet.** Odour drifts toward the food patch an ant eats from (diet-derived hydrocarbons). Two colonies on the same patch converge. The fungus brushes "seasoned" food (a flavour per patch) that pulls toward a common odour. | Buczkowski et al. 2005 (contested) | odour update at pick-up | C | S once B3 exists |
| B5 | **Aggression threshold.** The fungus raises τ (B3) or lowers the attack drive: a fighting ant's turn toward enemies (`turnRate × 2`) is scaled down. | Octopamine and serotonin thresholds; fluke lowers serotonin | τ per ant; fight steering | C | S |
| B6 | **Odour weapon** (the dark side). A strain *raises* an ant's odour distance from its own nest, so nestmates attack it: this purges the colony's most aggressive ants. Or the player marks hard-line raiders. | Synthetic hydrocarbons make nestmates attack | odour push | R | S once B3 exists |
| B7 | **Masking.** Heavily infected ants smell of the fungus, not of a colony: odour → a neutral "fungus" value both colonies tolerate. They become couriers that can cross lines. | Fungal odour on the garden; *Ophiocordyceps* ants not attacked | odour lerp to neutral | C | S once B3 exists |

### C. Signalling: what ants lay

| # | Idea | Biology | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| C1 | **Deposit gain** ×0–3. Up gives loud trails that both colonies' infected ants (A3) pick up. Down gives quiet ants, and quieter fights. | — | `p.deposit` × gain | C, S | S |
| C2 | **Lay into the rival's field.** An infected carrier lays its food trail in **both** colonies' food fields: it advertises its food to the rival. Collaboration by leaking information. | Shared trail pheromones across colonies and species | second `deposit` call on `foreign` | **C** | S |
| C3 | **Silent fights.** Infected ants in a fight lay no alarm (`FightParams.alarm` × (1 − load)). Skirmishes stop escalating into wars: one fight doesn't recruit forty defenders. | — | `resolveFights` | **C** | S |
| C4 | **Peace mark.** Infected ants that meet an enemy *without* fighting (pacified) lay a short-lived "truce" scent that lowers hazard where it lies. A ceasefire zone spreads outward from the first peaceful contacts. | Design | new channel, or a negative alarm | C | M |
| C5 | **Mycelium laying** (pairs with A11). Infected ants grow the fungal network as they walk. Highways form where both colonies travel, and the fungus's map becomes the shared map. | Design | `deposit("mycelium", …)` | C, R | M |

### D. Motivation, thresholds and roles: specialization

| # | Idea | Biology | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| D1 | **Reinforced thresholds.** ⭐ Each ant keeps a threshold offset per mode. Doing a mode lowers its threshold and raises the others, with a switching cost. Over minutes the colony splits into foragers, scouts and guards **with no new mode**. The fungus only nudges: a strain biases one offset, and reinforcement amplifies it. | Theraulaz, Bonabeau & Deneubourg 1998; the switching cost from arXiv 2308.07122 | per-ant `Float32Array(MODES)` offsets applied in classify (A7) | **S** | M |
| D2 | **Strains as roles.** Three spore types the player sprays, each a preset modifier vector: **Wanderlust** (scout: wander ×2, patience ×3, food gain ×0.5), **Trailbinder** (hauler: food gain ×2, wander ×0.5, deposit ×1.5), **Peacecap** (diplomat: pacify, fast odour blending, lays mycelium). Where a strain lands sets what that part of the colony becomes. | Caste-specialized defence (*Escovopsis*) | `strain` array → modifier table | **S**, C | M |
| D3 | **Task reallocation on infection.** Infected colonies send more ants to one job: the fungus raises the share of guards, or of foragers. A colony-level lever through the stance or the threshold offsets. | Midden workers rise in *Escovopsis*-infected colonies | stance bias, D1 offsets | S, R | S |
| D4 | **Patience.** `patience` × factor. Long: ants push far and find the rival's ground (contact, so spread). Short: ants stay home (the colony turns inward). | — | `p.patience` per ant | R | S |
| D5 | **Nearest-nest delivery.** An infected carrier drops food at the **nearest** nest, either colony's, or at a shared garden (F1). Food crosses colony lines: an **exchange** counter and real collaboration. | Trophallaxis across a supercolony | drop-off mechanic; `return` steers to the nearest nest | **C** | S–M |
| D6 | **The fungus asks for food.** A fungus "hunger" scent at the garden makes infected foragers prefer certain patches. The player steers *what* both colonies gather, not *where* the ants are. | Fungus-to-forager feedback (hypothesis) | per-patch attraction | C | M |

### E. Body, clock and death

| # | Idea | Biology | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| E1 | **Pace.** `speed` × factor. Sluggish infected ants (the nematode, late *Ophiocordyceps*) hold ground; fast ones carry spores far. | *Myrmeconema*, *Ophiocordyceps* | per-ant speed | — | S |
| E2 | **Desync.** Infected ants lose rhythm: random rest bouts. They become poorer foragers but **stop marching with the army**, which breaks up raids. | *Ophiocordyceps* loses the activity rhythm | rest timer | C | S |
| E3 | **Clock windows.** Effects run only at a phase of a day clock, e.g. a **dusk truce**: pacify and alarm damping at full strength for 30 s of every 3 min. The player times diplomacy. It needs the day/night of MR 10 (`ja-1vg`) or a fungus-only clock. | *Pandora* in the evening; the fluke by temperature; *Ophiocordyceps* summit times | `load × window(t)` | C | S |
| E4 | **Summit beacons.** Heavily loaded ants walk uphill (world height is a pure function, `world.ts`) and lock on near rock. They become **fixed spore emitters** that infect passers, and landmarks both colonies route past. Costs the colony an ant; gives the fungus a tower. | Summit disease, death grip | a mode-like override for load > 0.9; a spore source | R | M |
| E5 | **Sporulating corpses.** Fight deaths leave a spore cloud for ~30 s. **War spreads the fungus**, so the fungus profits from the first battles and then ends them. Colonies carry corpses away (necrophoresis) as counterplay. | *Pandora* corpses, removed faster when sporulating | at `kill(i)`, a spore deposit | C | S |
| E6 | **Self-exile.** Heavily loaded ants leave the nest and live at the border: a **mixed frontier population** that meets the rival's frontier and blends. | Moribund *Temnothorax* leave the nest; exposed *Lasius* stay out | low home gain + long patience past a load | R, C | S |
| E7 | **Visible mark.** Infected ants are drawn with a fungal tint (the berry-red gaster as UI): the player reads spread at a glance. Purely visual. | *Myrmeconema* | renderer | — | S |

### F. Colony level: reorganizing who lives where

| # | Idea | Biology | Hook | Pushes | Effort |
|---|---|---|---|---|---|
| F1 | **Shared garden.** ⭐ The fungus grows a garden at a spot the player picks between the nests: a third, nest-like site. Infected foragers of **both** colonies deliver there (D5). The garden pays food back to both larders in proportion to deliveries, and **its odour pulls everyone who tends it toward one value** (B3). It is the leafcutter biology turned into the win mechanic: a common fungus, so a common colony odour. | *Acromyrmex* gardens as a recognition source; faecal imprint | `Nest`-like site in `world.ts`; drop-off; odour pull | **C**, **R** | M–L |
| F2 | **Merge.** When the nests' odours stay within τ for a minute, the colonies get one alliance id (MR 8 plans `alliance ids`, `ja-8fd`): no fights, shared larder or not, and Jev stances asked jointly. | Supercolonies | `game.ts` | **R** | M |
| F3 | **Lock-pick adoption.** An infected ant whose odour has crossed to the other nest's side **changes membership** at that nest: its slot moves colonies. Colonies trade workers, and a weak colony is rescued, not raided. | *Rickia*-infected colonies accept strangers and queens | move an ant across `Colony` arrays (free slot + kill) | R | M |
| F4 | **Co-founded nest.** With enough mixed, infected ants at the garden, a new **joint colony** buds there. It belongs to neither original colony, and its doctrine is the fungus's. In MR 10 terms, a daughter colony with two mothers. | Pleometrosis (unrelated queens co-found) | new `Colony` at the garden | **R** | L |
| F5 | **Growth boon.** A strain that makes the colony grow faster (`foodPerAnt` × 0.75) only while it isn't fighting: peace pays. | *Wolbachia* in Pharaoh ants (preprint) | `foodPerAnt` by recent losses | C | S |
| F6 | **Stance bias.** Infection share pushes the strategist away from `raid`. It is free with the local strategist; with Jev it is the fungus doctrine (G1). | — | `localStance` input | C | S |

### G. Decisions: where Jev comes in

| # | Idea | Hook | Cost | Effort |
|---|---|---|---|---|
| G1 | **The fungus writes the doctrine for the ants it infects.** ⭐ Ants over a load threshold are asked under the **fungus doctrine** (the player's words for the fungus), not their colony's. The situation is unchanged, and caches are already per doctrine (`policyContext`), so it costs one extra doctrine's worth of situations. It works for the rival too: today the rival runs the local rule, so infected rival ants are the first time Jev steers both colonies, under one doctrine. | per-ant policy choice at `colony.ts:422`; a second `ColonyJev` cache context | paid: one doctrine, ~$0.005–0.01 per doctrine (MR 4 table) | M |
| G2 | **Fungus strategist.** Every ~10 s Jev picks the fungus's **expression** from a coarse view: infection share per colony (low / some / high), unity (apart / close / one), fight deaths (none / some / heavy), immunity (low / high), food left. Expressions: *spread* (transmission up, effects down), *pacify*, *bind* (odour blending), *specialize* (D1 / D2 bias), *garden* (route to F1). Each is a preset modifier vector. It is cached per view, like the stance lane (`packStanceRequest`). | new lane in `colonyBrain.ts` | paid, tiny: a few hundred possible views, a handful met | M |
| G3 | **`infected` in the ant situation** (×2 or ×3). Lets one doctrine say "infected ants do X". It is more expressive than G1 but doubles or triples the 1,296 situations. **Not recommended first**: G1 gets the same effect without growing the key. | `Situation`, `encode`, legend | paid: ~2× questions per doctrine; ~5–10 more tokens per situation (**estimate**) | M |
| G4 | **Doctrine drift.** A colony's own doctrine text gains a fungus clause as its infection share rises (e.g. at 50 %: "Rival ants that smell like us are kin"). A new doctrine is a new cache, so it is coarse: three or four tiers, not continuous. | doctrine string | paid: a doctrine per tier | S |

---

## 5. Making it a game: spread, resistance and failure

**Spread.** Load passes on **contact**: each tick, ant *i* gains `β × Σ load of ants in its 3×3 cells` across both colonies. That is the same neighbourhood `resolveFights` already scans with block sums, so the cost is close to zero. The player seeds load with a **spore brush**, a third brush beside *lure* and *alarm* in `useColony.ts:29`. Load decays slowly, or not at all for a *Rickia*-like strain.

**Resistance (counterplay), from social immunity:**
- **Grooming.** Healthy nestmates next to an infected ant lower its load and take a small dose themselves. A small dose gives an ant lasting **resistance** (Konrad et al. 2012), so a colony that grooms heavily becomes immune.
- **Rejection.** Above a visible load, nestmates treat the ant as an enemy (the harvester-ant microbiome result). A potent strain gets its carriers killed by their own side.
- **Exile.** Exposed ants keep to the outside (Stroeymeyt et al. 2018), which slows spread into the nest. This **helps** unification (E6), so the fungus may *want* it.
- **Necrophoresis.** Corpses are carried off, which limits E5.

**The dial this creates: stealth against potency.** A *Rickia*-like strain (mild effects, no visible load, never rejected) spreads everywhere but only nudges. An *Ophiocordyceps*-like strain (strong overrides, summiting) controls hard but triggers grooming and rejection. The player and the fungus strategist (G2) trade one against the other. *Escovopsis* suggests a third kind of strain, one that **suppresses grooming**: an unlock.

**Failure modes to test for:**
1. **Pacify everything → famine.** If nobody defends, a raid by an uninfected faction wins anyway, or both colonies over-forage and starve. Unity should need *both* colonies alive.
2. **Cross-reading trails → ant mills between nests** (A3). Food trails from two nests can loop. The existing *tired* rule and MR 7's no-entry mark are the guard; test with the mill check from MR 2.
3. **Odour overshoot.** Blending toward contacts can oscillate, or give "everyone is a stranger" mid-blend. Use one-way relaxation with clamped rates, and test that two equal colonies converge monotonically.
4. **Infection runs away**, and the game is over in a minute. Transmission must fall with resistance; tune with the headless bench.
5. **Cost runaway.** G1 and G3 grow Jev questions. Measure with `npm run colony-cost` and cap like the other lanes.

## 6. Cost

Most of this catalogue is **free**: sensing, laying, recognising, mechanics. Only group G touches Jev.

| Option | Situations | Tokens / question | Note |
|---|---|---|---|
| Free modifiers only (A–F) | unchanged (1,296) | unchanged (~451) | no Jev change |
| **G1** fungus doctrine | unchanged; one more doctrine cache | unchanged + the fungus doctrine's length | ≈ one more doctrine: ~$0.005–0.01 per run (MR 4) |
| **G2** fungus strategist | a new lane, ~hundreds possible, a handful met | ~stance lane size (**estimate**) | negligible |
| G3 `infected` dimension | ×2 (2,592) or ×3 | +~5–10 (**estimate**) | measure before and after |

Per CLAUDE.md, the PR that adds G1, G2 or G3 must report the measured tokens per question.

## 7. A first slice (proposed "MR: fungus 1")

Five pieces. Each is pure TypeScript in `web/src/colony/`, testable with `node --test`.

1. **Infection state and spread.** `load` and `strain` arrays; contact transmission across colonies; decay; a **spore brush**.
   - *Test*: a loaded ant among clean ants raises their load; isolated ants don't change.
2. **Perception gains, including the rival's trails** (A1, A2, A3, A4, C2). A per-strain gain vector applied in `#sense`; `Colony.foreign` set by `Game` the way `enemies` is.
   - *Test*: food gain 0 makes a follower lose a trail; foreign weight > 0 lets an infected ant reach the rival's food along the rival's trail.
3. **Pacify** (B1) in `resolveFights` and in the `enemy: near` check.
   - *Test*: a pacified group trades fewer deaths in a fixed-seed skirmish.
4. **Blending odour with a unity meter** (B3). Odour arrays; nest odour; enemy grids binned by odour; tolerance τ; panel meter; a "unified" outcome.
   - *Test*: two colonies sharing contacts converge monotonically, and fights stop once inside τ.
5. **Fungus doctrine** (G1). Infected ants of either colony use a second cache context and the fungus doctrine text.
   - *Test* (stubbed Jev): infected rival ants are asked under the fungus context; uninfected ones keep the local rule.

**Defer** to later slices: the shared garden and merge (F1, F2, F3), the strains as roles with reinforced thresholds (D1, D2), clock windows (E3, after MR 10's day/night), summit beacons (E4), co-founded nests (F4), and the fungus strategist (G2).

**Overlap with the plan.**
- MR 13 (`ja-azo`) already lists "fungus powers" (propaganda, decoy food, spore wall); spores and strains fit there.
- MR 7 (`ja-2iq`) makes footprints readable across colonies and adds graded alarm. That is the groundwork for A3, A5 and A6, so it should land first.
- MR 8 (`ja-8fd`) brings N colonies and alliance ids, which F2 needs.

## 8. Open questions for the design

1. **Is the player still a colony, or only the fungus?** "Unify" reads best if the player is the fungus with no side. Then the player's colony becomes "colony A", and the local rule or Jev runs both.
2. **What counts as a win: merged nests (F2), or sustained peace with exchange?** A merge is a clean ending; peace with exchange suits a lifetime world (MR 10), where nothing ends.
3. **May the fungus kill?** *Rickia* never kills, while summit beacons (E4) and odour weapons (B6) cost ants. A strictly non-lethal fungus is a distinctive tone.
4. **How much of the fungus policy is Jev's?** The player's words (G1), Jev's strategy (G2), or both.

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
