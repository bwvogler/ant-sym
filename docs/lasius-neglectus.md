# The invasive garden ant (*Lasius neglectus*): many queens, nests that don't fight, and the best-measured defences against *Metarhizium*

*Research note for the species epic `ja-e668` (PRD §64.2). Written 2026-11-12, against code at `f8afe17`. **Read in full text** (through PMC; for the long ones, the first 100,000 characters: methods and results): Ugelvig et al. 2008, Cremer et al. 2008, Konrad et al. 2012, Pull et al. 2018, Konrad et al. 2018; for the Argentine ant (§7), Tsutsui et al. 2000, Giraud et al. 2002, van Wilgenburg et al. 2010, Choe et al. 2012, Inoue et al. 2015, Stock et al. 2023. **Abstract or search snippet only** (numbers **unverified**): Ugelvig & Cremer 2007, Tragust et al. 2013, Stroeymeyt et al. 2018, Espadaler et al. 2004, Paris & Espadaler 2009, Choe et al. 2009, Thomas et al. 2006, Heller et al. 2008, Milutinović et al. 2020, Pull & Cremer 2017. **Not fetched** (from memory): Keller et al. 1989, Markin 1970, Passera & Keller 1990. The research was done by a subagent with WebSearch and WebFetch; `journals.plos.org`, `elifesciences.org`, PubMed and Europe PMC were out of reach from the session, `pmc.ncbi.nlm.nih.gov/articles/PMC…` was not. This species was not on the owner's list (2026-11-11); it is proposed because the research supports it (§Play, PRD §64).*

The game's generic ant is a trail-laying mound ant with one queen, one nest and colonies that fight strangers ([species.md](species.md)). The fungus's goal is to turn rivals into allies ([vision.md](vision.md) goal 3), and its counterplay is social immunity ([fungus-policy](fungus-policy.md) §6). The question: **is there a real ant whose colonies already tolerate one another, and whose defences against *Metarhizium* are measured well enough to build the fungus's opponent from?** *Lasius neglectus* is both, and it is a *Lasius*, the genus much of the game's generic biology already comes from ([ant-communication](ant-communication.md), [new-queens](new-queens.md)).

## 1. One population is one network of tolerant nests, with several queens in each

- Populations are networks of polygynous nests that tolerate one another, covering 0.01–0.57 km² (Ugelvig et al. 2008, *BMC Biol* 6:11, Table 1), **full text**. About 100 populations are known (30 in 2000), each a single supercolony; spread is by human transport.
- 4.3 ± 1.1 queens per nest. Queens mate in the nest (seen in nest boxes in 10 of 27 trials); they are small, with short wings and a small flight thorax; there are no mating flights; colonies spread by budding (Cremer et al. 2008, *PLoS ONE* 3:e3838; Ugelvig et al. 2008), **full text**.
- One supercolony at Seva (Spain) covered 14 ha, at about 800 workers/m², about 1.1 × 10⁸ workers and between 35,500 and 360,000 queens by two counting methods (Espadaler et al. 2004, *Insectes Soc*), **unverified** (snippet).

**In the game:** several queens per colony is `Colony.queens[]` (`ja-8fd.1`); budding is a new colony founded *on foot* by a queen and workers walking to a site, rather than by a flight (a new founding route beside [new-queens](new-queens.md)' flight). A nest network is polydomy: one colony with more than one nest, which the nest-kind interface must own (`ja-fnd.5.5`). Both are **structure**, and both are what the Pharaoh ant ([pharaoh-ant](pharaoh-ant.md)) also needs: building them for this species builds them for that one.

## 2. Strangers are tolerated in proportion to how alike they smell

- Inside a population no aggression between nests; nestmate relatedness r = 0.022 ± 0.013 (against 0.39–0.56 in the sister species *L. turcicus*), so tolerance is not kinship (Cremer et al. 2008), **full text**.
- Between populations it is graded: of 91 population pairs, 14 % were never aggressive, 19 % always, 67 % mixed; aggression tracked chemical and genetic distance, with no clean supercolony blocks. Workers carry 24 hydrocarbons (C31–C35), 23 of them in every population; *L. neglectus* has the longest-chain and least varied profiles of its relatives (Ugelvig et al. 2008; Cremer et al. 2008), **full text**.
- Low variation was already there in the native range, so it is not a bottleneck effect (Cremer et al. 2008), unlike the Argentine-ant explanation (§7).

**In the game:** this is the recognition odour and tolerance the game already has ([ant-communication §3](ant-communication.md#3-rival-colonies), `ColonyParams.odour`, `tolerance`), with a **wider tolerance** for this species: **data**. Graded aggression by odour distance is exactly what the fungus's odour levers act on, so the game's goal (rivals become allies) has a measured basis here. No new sense.

## 3. A sick nestmate is groomed, and the colony is immunised by it

- Exposed workers stay away from the brood chamber, and healthy nestmates take on more brood care (Ugelvig & Cremer 2007, *Curr Biol* 17:1967). Contact with an exposed worker protected naive nestmates on a later challenge. **Unverified** (abstract).
- *Metarhizium anisopliae* (Konrad et al. 2012, *PLoS Biol* 10:e1001300, **full text**): grooming of an exposed ant peaked on days 0–2; 37 % of nestmates carried 1–10 conidia by day 2; 64 % of nestmates had low-level infections on days 3 and 5, with loads about 8 and 12 times lower than the exposed ant's (4.4 against 36 CFU); 2 % of nestmates died (3 of 150) against about half of the exposed ants; on day 3 their immune genes were up (PPO p = 0.007, defensin p = 0.032). Low-level infection by grooming is the immunisation.
- Care adjusts to risk: more grooming for a nestmate carrying the pathogen an ant already had (P = 0.0004); for a different pathogen less grooming and more poison spraying (P = 0.02); the risk of a *Beauveria* superinfection fell from 92 % to 0 under this care (Konrad et al. 2018, *PNAS* 115:2782), **full text**.
- In *Lasius niger* exposure changes the colony's contact network: everyone spends more time outside and away from nurses and the queen (Stroeymeyt et al. 2018, *Science* 362:941). **Unverified** (abstract; numbers not reached).

**In the game:** grooming exists (`Fungus.step`), scripted at a fixed rate up to a cap (vision gap row, `ja-k4k.12`). This species gives it its sensed form: **a nestmate's pathogen load is felt by contact** (a new sense row, "sickness cues", below), grooming rises with it, and **a groomed nestmate takes a small dose** that makes it resist later (`resist` exists in the fungus's per-ant arrays). The sick ant keeping off the brood is a policy choice over its own body (it senses its own sickness, an existing own-body row). These close part of `ja-k4k.12` for every species, not just this one.

## 4. Infected brood is unpacked, bitten and sprayed: destructive disinfection

- Workers unpack infected pupae 2–10 days after exposure (doses 10⁴–10⁹ conidia/ml), bite them and spray them with formic-acid poison; 85 % of unpacked pupae were infected, against 25 % of those left in their cocoons; sporulation fell by about 95 % at 5 days. The cue is the pupa's own cuticular hydrocarbons (C33–C35), not a fungal compound: washing them off cut unpacking by 72 % (Pull et al. 2018, *eLife* 7:e32073, PMC5760203), **full text**.
- Sporulating pupal corpses lethally infected 42 % of the ants that met them; pupae after destructive disinfection infected none (Pull et al. 2018).
- Poison is taken into the mouth from the acidopore and spread on brood when grooming (Tragust et al. 2013, *Curr Biol* 23:76). **Unverified** (abstract).
- How *L. neglectus* handles adult corpses was not found. In *L. niger*, co-founding queens bite, bury and remove a dead co-foundress (Pull & Cremer 2017, PMC5639488, abstract).

**In the game:** the fungus's brood lever (`crown`: lethal infection to brood a host tends) meets its counter here: **an infected pupa is detected by the changed smell of its own cuticle**, a contact cue (sickness cues row), within a window of 2–10 days, and destroyed before it sporulates. The policy chooses to destroy it (a response hook on brood contact); the local rule is "destroy brood whose sickness cue passes a threshold". The player's counter-counter is timing: spread before the cue shows. Tier 2 (a brood response; the undertaking rule widened from adults to brood).

## 5. Food: aphids and honeydew

- Aphid tending: 2.09 kg of honeydew per tree against 0.82 kg for the native *L. grandis*; the ant keeps "massive aphid cultures" (Paris & Espadaler 2009, *Arthropod-Plant Interact* 3:75, **unverified**, snippet; Cremer et al. 2008, full text, qualitatively).
- Trail chemistry was not found for this species. Recruitment to the best food is strong (search hits only, **unverified**).

**In the game:** foraging, trails and recruitment are the generic ant's (food items standing in for honeydew sources). **Data**: no change.

## 6. What it costs the fungus to be groomed

- In the Argentine ant, ten passages of *Metarhizium* through grooming groups over 27 weeks gave fungal lines with about twice the spores per corpse, half the grooming and 50–70 % of the ergosterol; pure ergosterol increased grooming (P = 0.026); virulence fell to 65–75 % (Stock et al. 2023, *Nat Ecol Evol* 7:450, PMC9998270), **full text**. Grooming selects for a fungus that hides from it.
- Sanitary care changes which of two co-infecting fungi wins, favouring fast germinators (Milutinović et al. 2020, *Ecol Lett*), **unverified** (snippet).

**In the game:** this is the fungus's existing stealth lever (how much of the fungus shows to groomers, [fungus-policy §11](fungus-policy.md#11-what-the-fungus-senses-inside-an-ant-and-its-levers)) with a measured price: hiding from groomers costs virulence and buys spores. It gives the stealth-against-potency dial ([fungus-policy](fungus-policy.md) §6) a number to tune against. No new rule for the ant.

## 7. The Argentine ant: the same tolerance, at continental scale, and war at its borders

- The main European supercolony runs along about 6,000 km of sampled coastline (33 sites); in 1,151 trials workers from different supercolonies died in 98 % of encounters (235 of 241) and never within one; aggression stayed at its maximum after 6 and 18 months (Giraud, Pedersen & Keller 2002, *PNAS* 99:6075, PMC122904), **full text**. The main supercolonies of Japan, Europe, California, New Zealand and Hawaii did not attack one another (0 of 50, 0 of 20) (van Wilgenburg et al. 2010, *Evol Appl* 3:136, PMC3352483), **full text**.
- Introduced populations lost genetic diversity (alleles 59 → 30; heterozygosity 0.64 → 0.20); every native-range pair 60–800 km apart fought, no Californian pair did; aggression fell with allele sharing (Tsutsui et al. 2000, *PNAS* 97:5948, PMC18539), **full text**. Chemical distance predicts aggression (F = 68.65, P < 0.001; van Wilgenburg et al. 2010).
- Trails are dolichodial plus iridomyrmecin (0.1–3 ng/cm), followed down to 62 pg/cm (Choe, Villafuerte & Tsutsui 2012, *PLoS ONE* 7:e45016, PMC3447822), **full text**. The same compounds are on live workers and largely gone an hour after death: corpses are removed on the *loss* of a life cue, not a death cue (Choe, Millar & Rust 2009, *PNAS* 106:8251), **unverified** (abstract).
- Workers kill up to 90 % of queens at the start of the breeding season, whatever their weight, fecundity or age (Keller et al. 1989, from memory; cited in Inoue et al. 2015, *Ecol Evol* 5:4098, PMC4588641, full text).
- Against the giant-supercolony view: Heller et al. 2008 argue nests work ecologically as small groups within 3–4 m that share food (**unverified**, abstract); secondary supercolonies do attack the main one (US1 against US2, 42 of 50 trials).

**In the game:** the Argentine ant is the same tolerance at a larger scale plus **border wars between supercolonies**, a ready-made front for the fungus to end. It needs mixed or multi-colony worlds (`ja-wfw0`, owner 2026-11-12) to show; the life-cue corpse rule is a cleaner way to make undertaking sensed (vision "corpse odour", below). **Proposed as a later variant on this epic**, not a species of its own yet.

## What was not found

- *L. neglectus* trail chemistry, worker size data, adult corpse handling; queens per nest in *L. humile*; destructive disinfection or poison use in *L. humile*; the numbers inside Stroeymeyt et al. 2018; Heller et al. 2008's nest counts.

## The mechanic

Cheapest first; every row's "off" is the generic ant (main bit for bit).

| Cue (sensed) | Sense row | Response | Local rule | Off | Tier |
|---|---|---|---|---|---|
| Odour distance to a stranger | contact (CHC) | tolerate or fight | existing tolerance, wider for this species | generic tolerance | 1 (data) |
| Several queens; budding | queen pheromone | a queen and workers walk off to found | bud when the queen signal per worker is high and the nest crowded (**design**) | one queen | 3 (`ja-8fd.1`, `ja-fnd.5.5`) |
| A nestmate's pathogen load | **new: sickness cues** | groom (strength by load) | groom harder the stronger the cue, up to a cap | fixed-rate grooming | 2 (closes part of `ja-k4k.12`) |
| Grooming a sick nestmate | own body | small dose, raised resistance | each groom moves a little load and raises `resist` | no transfer | 2 |
| Own sickness | own body | keep off the brood | a sick ant does not nurse | nurses as usual | 1–2 (a policy answer) |
| An infected pupa's changed cuticle | **new: sickness cues** | unpack, bite, spray | destroy a pupa past a cue threshold, 2–10 days after exposure | no brood response | 2 |

**Situation and lanes.** The mode lane is the generic ant's (same fields), with this species' words (its tolerance: "strangers who smell like us are friends"). The response lanes gain a `sick` value where a sickness cue is felt (a `Touch` field, `ja-fnd.5.6`). The stance lane stays.

**What it forces on the code.** `queens[]` and budding (`ja-8fd.1`), the nest kind owning queens and several nests (`ja-fnd.5.5`), a response to a sensed sickness cue (a `Touch` field on a schema, `ja-fnd.5.6`). Every one is something the Pharaoh ant also needs, and the grooming rules improve the generic ant's social immunity gap. No tick split, no new mode.

**Assays** (land first, no behaviour change). N1: **immunisation**: with the rule on, groomed nestmates carry low loads and survive a later challenge better (target: Konrad et al. 2012, about 2 % nestmate deaths against about half the exposed). N2: **destructive disinfection**: infected pupae destroyed before they sporulate, sporulation down about 95 % (Pull et al. 2018). N3: **tolerance**: two colonies of this species meeting fight in proportion to odour distance (Ugelvig et al. 2008: 14 % never, 19 % always). N4: **budding**: a crowded colony with several queens founds a daughter nest within its own network.

**Cost (estimated from request size; not measured, no paid run).** The mode lane has the generic shape, so about the generic ant's ~122 situations a game, ~783 tokens a question, ~$0.074/h while the doctrine is new (PRD §51, `colony-cost --one`), $0 cached. A `sick` value in the response lanes doubles the questions of the lanes that see it, on the order of ~$0.01/h if asked. The live check that ships its precache: at most one full live run of all lanes (~$0.0065, PRD §54.4). Measured with `npm run colony-cost` when the legend exists.

## Play

- **See:** nests of one colony side by side that never fight; ants grooming a sick nestmate in a knot; pupae dragged out and torn open; a daughter nest appearing beside the old one with no flight. Learn entries: the supercolony; destructive disinfection.
- **Choose:** this is the host that makes the fungus's stealth choice bite. Show yourself and get groomed out, immunising the colony as you go; hide and lose virulence (§6). The `crown` lever meets a counter (infected brood destroyed in the 2–10-day window). And this is the species where *unity* is closest: colonies already tolerate those who smell alike, so the odour levers have the most leverage.
- **Counterplay and progression:** strong social immunity with measured strength, which grows with exposure: an early, careless spread immunises the colony against the later, strong one. A mid-game rung: easier to unite than the generic ant, harder to kill.
- **Cost:** above; cached games spend nothing.
- **Risks:** a **cliff** in immunisation (one early grooming wave makes the colony immune for good: watch the infection curve over seeds); a **free lever** if tolerance makes unity trivial (the unity score must still need the fungus); **invisible effects** (grooming and immunisation must show: a knot of groomers, a tint on resistant ants).
- **Owner decisions needed:** see Open questions.

## Open questions

Decided here (2026-11-12; the owner can overturn):
1. **Propose this species** although it was not on the list, because it is the cheapest second consumer of the descriptor (generic lanes, the structures the Pharaoh ant needs too) and carries the best fungus counterplay of any candidate.
2. **The Argentine ant is a variant on this epic** for later (it needs multi-colony worlds), not its own epic.

For the owner:
3. ~~Whether this species comes second~~ **Owner (2026-11-12): second, after the desert ant** (PRD §64).
4. Whether the grooming and immunisation rules are built for every species (closing more of `ja-k4k.12`) or for this one first.
5. The fungus's levers on this host (the owner is asked when the species is built).

Still to read: Ugelvig & Cremer 2007 and Tragust et al. 2013 full texts (both *Curr Biol*); Stroeymeyt et al. 2018's numbers; any account of how *L. neglectus* handles adult corpses.

## Sources

- Ugelvig LV, Drijfhout FP, Kronauer DJC, Boomsma JJ, Pedersen JS, Cremer S (2008). The introduction history of invasive garden ants in Europe: integrating genetic, chemical and behavioural approaches. *BMC Biol* 6:11. [PMC2292682](https://pmc.ncbi.nlm.nih.gov/articles/PMC2292682/) (full text, first 100k characters)
- Cremer S et al. (2008). The evolution of invasiveness in garden ants. *PLoS ONE* 3:e3838. [PMC2585788](https://pmc.ncbi.nlm.nih.gov/articles/PMC2585788/) (full text)
- Konrad M et al. (2012). Social transfer of pathogenic fungus promotes active immunisation in ant colonies. *PLoS Biol* 10:e1001300. [PMC3317912](https://pmc.ncbi.nlm.nih.gov/articles/PMC3317912/) (full text, first 100k characters)
- Pull CD et al. (2018). Destructive disinfection of infected brood prevents systemic disease spread in ant colonies. *eLife* 7:e32073. [PMC5760203](https://pmc.ncbi.nlm.nih.gov/articles/PMC5760203/) (full text)
- Konrad M, Pull CD, et al. (2018). Ants avoid superinfections by performing risk-adjusted sanitary care. *PNAS* 115:2782–2787. [PMC5856517](https://pmc.ncbi.nlm.nih.gov/articles/PMC5856517/) (full text)
- Stock M et al. (2023). Pathogen evasion of social immunity. *Nat Ecol Evol* 7:450–460. [PMC9998270](https://pmc.ncbi.nlm.nih.gov/articles/PMC9998270/) (full text, first 100k characters)
- Tsutsui ND, Suarez AV, Holway DA, Case TJ (2000). Reduced genetic variation and the success of an invasive species. *PNAS* 97:5948–5953. [PMC18539](https://pmc.ncbi.nlm.nih.gov/articles/PMC18539/) (full text)
- Giraud T, Pedersen JS, Keller L (2002). Evolution of supercolonies: the Argentine ants of southern Europe. *PNAS* 99:6075–6079. [PMC122904](https://pmc.ncbi.nlm.nih.gov/articles/PMC122904/) (full text)
- van Wilgenburg E, Torres CW, Tsutsui ND (2010). The global expansion of a single ant supercolony. *Evol Appl* 3:136–143. [PMC3352483](https://pmc.ncbi.nlm.nih.gov/articles/PMC3352483/) (full text)
- Choe D-H, Villafuerte DB, Tsutsui ND (2012). Trail pheromone of the Argentine ant. *PLoS ONE* 7:e45016. [PMC3447822](https://pmc.ncbi.nlm.nih.gov/articles/PMC3447822/) (full text)
- Inoue MN et al. (2015). Queen execution increases relatedness among workers of the invasive Argentine ant. *Ecol Evol* 5:4098. [PMC4588641](https://pmc.ncbi.nlm.nih.gov/articles/PMC4588641/) (full text)
- Ugelvig LV, Cremer S (2007). Social prophylaxis: group interaction promotes collective immunity in ant colonies. *Curr Biol* 17:1967–1971. [doi:10.1016/j.cub.2007.10.029](https://doi.org/10.1016/j.cub.2007.10.029) (abstract only)
- Tragust S et al. (2013). Ants disinfect fungus-exposed brood by oral uptake and spread of their poison. *Curr Biol* 23:76–82. (abstract only)
- Stroeymeyt N et al. (2018). Social network plasticity decreases disease transmission in a eusocial insect. *Science* 362:941–945. [doi:10.1126/science.aat4793](https://doi.org/10.1126/science.aat4793) (abstract only)
- Choe D-H, Millar JG, Rust MK (2009). Chemical signals associated with life inhibit necrophoresis in Argentine ants. *PNAS* 106:8251–8255. [doi:10.1073/pnas.0901270106](https://doi.org/10.1073/pnas.0901270106) (abstract only)
- Espadaler X et al. (2004). *Lasius neglectus*, a polygynous, sometimes invasive, ant species. *Insectes Soc*. [doi:10.1007/s00040-003-0732-y](https://doi.org/10.1007/s00040-003-0732-y) (snippet only; title from memory)
- Heller NE, Ingram KK, Gordon DM (2008). Nest connectivity and colony structure in unicolonial Argentine ants. *Insectes Soc* 55:397–403. [doi:10.1007/s00040-008-1019-0](https://doi.org/10.1007/s00040-008-1019-0) (abstract only)
- Thomas ML et al. (2006). When supercolonies collide: territorial aggression in an invasive and unicolonial social insect. *Mol Ecol* 15:4303–4315. (abstract only)
- Pull CD, Cremer S (2017). Co-founding ant queens prevent disease by performing prophylactic undertaking behaviour. *BMC Evol Biol* 17:219. [PMC5639488](https://pmc.ncbi.nlm.nih.gov/articles/PMC5639488/) (abstract only)
