# The lichen partner: the fungus takes an alga on rock, spreads over it, lives on light and breaks the rock down

*Research and design note for epic `ja-vlla.11` (M4 of `ja-vlla`, PRD §90). Written 2026-11-24 against code at `99532b60`, from two literature searches made on 2026-11-23 through Europe PMC, PubMed and Crossref.*
- *Read status:* every source is marked full text (**FT**), abstract only (**ABS**, its numbers **unverified**) or not read (**NR**).
- *Not reachable:* many society journals (Wiley, Springer, Elsevier) were behind a bot wall. Their numbers are abstract-only and gathered for reading in `ja-vlla.11.1`.
- *Second read (`ja-vlla.11.1`, 2026-11-24):* no full text of the eleven sources could be reached. Wiley, Springer, Cambridge, BioOne and Elsevier answered with bot walls, and the session's network refused the open copies on iforest.sisef.org and flore.unifi.it (Di Nuzzo), publishup.uni-potsdam.de (Heinken) and publications.aston.ac.uk (Armstrong). The abstracts and citing papers were read instead, and the claims are restated to what they say. Allowing those four hosts would let three of them be read in full. Chen et al. 2000 and Stretch & Viles 2002 still give no rate (no abstract online).

**Today**, nothing on the map is a plant, an alga, light or water, and rock is permanent:
- Hyphae never enter rock (`enterable`, `hyphae.ts`).
- Only the builder's tools change rock.
- Light exists only as the desert ant's sun (`heat.ts`, off for every other species).

The owner asked (PRD §85, 2026-11-22) for a partner, "a special lichen: use rock, break it down, spread across it", unlocked by contact with an alga or a plant. Then (2026-11-23) the owner asked for a broad brainstorm before choosing ideas.

**The question:** what does a lichen fungus do to find its partner, to grow over rock, to live and to break the rock down, and which of it could the game's fungus be given?

## TL;DR

- **A lichen fungus captures its alga by contact.** Free algae are scarce. Some lichens take the alga from another lichen (§1).
- **A lichen spreads over rock from its edge, slowly.** Crustose lichens grow well under 1 mm a year. A model puts a ceiling near 26 mm a year (§2).
- **The partner fixes carbon only while wet and lit.** It switches on within minutes of wetting. How much carbon the fungus gets is not quantified (§3).
- **Lichens turn rock into a nascent soil** by hyphae drilling in, wet-dry swelling and pH. No paper read gives a rate (§4).
- **Usnic acid, a lichen compound, made insects die faster of *Metarhizium* and *Beauveria*.** This is abstracts only (§5).
- **Red wood ants carry lichen fragments from the ground round their mounds,** where the authors think fragments may regrow (inferred, not observed). This is abstract only (§6).
- **Owner decisions (2026-11-23):**
  - All four groups go into the epic: partner and crust, light income, rock to soil, then bitter crust and ant carriers.
  - Partners come from alga films and from wild lichens to overgrow.
  - Rock opens to hyphae first. Rock the ants can dig is a later step.
  - Owner, 2026-11-24: ants meet a lichen from the next cell (**beside**), as a hypha meets an alga; the crust stays on rock, out of the ants' reach.

## 1. Finding a partner: contact, a scarce free alga, theft

- **Contact capture.** The hyphae of a germinating lichen spore capture free-living algae they touch, and a single compatible algal cell may be enough to start a thallus. A fungus can also take algae from an existing lichen: "the host thallus is eventually destroyed as its photobionts are taken over by the invading hyphae of the aggressor" (Sanders & Masumoto 2021, *Lichenologist* 53:347, FT).
- **Contact turns the symbiosis on.** In *Cladonia grayi* with *Asterochloris*, self/non-self recognition genes switch on when the partners first meet (Joneson, Armaleo & Lutzoni 2011, *Mycologia*, ABS). Fungal lectins binding the alga are a proposed recognition step (Sanders & Masumoto 2021). Joneson & Lutzoni (2009, not read) got the fungus to differentiate only beside a compatible alga, not beside glass beads, and 11–28 % of both partners' genes are already up before contact: a chemical signal, not touch itself (as described by Pichler, Muggia, Carniel, Grube & Kranner 2023, *New Phytol*, FT). For the game, meeting a compatible alga is the trigger.
- **Free algae are scarce, not absent.**
  - *Trebouxia*, the commonest lichen alga, is "infrequently reported in the free-living state", though careful looking often finds it (Sanders & Masumoto 2021).
  - Meier, Scherrer & Honegger (2002, *Biol J Linn Soc* 76:259, ABS) call it rare outside thalli.
  - Pioneer lichens with no propagules on smooth bark carried the local alga, which suggests a free pool (Beck, Friedl & Rambold 1998, *New Phytol* 139:709, ABS).
- **Theft.**
  - *Diploschistes muscorum* starts as a parasite inside *Cladonia* scales and uses the *Cladonia* alga, *Trebouxia irregularis*, which multiplies as the *Diploschistes* hyphae grow. It turns independent as its host breaks down, and mature thalli can exchange that alga for *T. showmanii*; one thallus held both (Friedl 1987, *Lichenologist* 19:183, ABS).
  - Young *Xanthoria parietina* first pairs with "foreign algae" (Ott 1987, *Nord J Bot* 7:219, ABS).
- **Contrary.**
  - Beck et al. (1998) found *Xanthoria*'s alga different from neighbouring *Physcia*'s, so they found no theft there.
  - Even lichens that disperse both partners together end up with algae unmatched to the fungus (Wornik & Grube 2010, *Microb Ecol* 59:150, ABS). Partners are swapped and shared.

**In the game:** a hypha cell beside an alga film, or beside a wild lichen, is the contact: the alga's rock cell becomes lichen (the hypha's own open cell stays hypha).
- **Body, not choice.** This is contact physiology, so it needs no situation field and costs no Jev.
- **World content (design):**
  - **Alga films:** scarce, on rock cells beside open ground.
  - **Wild lichens:** a few small discs on rocks, which the fungus takes over by touching and growing over them (theft, as in *Diploschistes*).
- **The cue:** contact. It is a new fungus sense row in `docs/vision.md` (the fungus's contact, design).
- **Off:** no world content and no trait level. That is main bit for bit.

## 2. Edge-led spread over rock

- **The edge does the growing.** Circular lichens' radial growth levels off with size, and eight species fall on one curve (Seminara, Fritz, Brenner & Pringle 2018, *J R Soc Interface* 15:20180063, FT).
  - CO₂ reaches the rim faster than the centre.
  - The model's ceiling is about 26 mm a year, against about 13 mm a year for the fastest reported *Parmelia*. The 13 mm figure is **unverified**: it comes second-hand from the paper's references.
  - 33 of the tracked thalli died during the survey.
- **Crustose lichens are the slowest:**
  - *Rhizocarpon* averaged 0.07 mm a year over six years, ranging 0–0.19 (SD 0.06); 7 of 39 thalli did not grow measurably, and growth was below lichenometric estimates (Armstrong 2005, ABS: numbers stated in the abstract).
  - Crustose growth can decline in large thalli (Armstrong & Bradwell 2010, *Geogr Ann A* 92:3, ABS).
- **A fruticose lichen,** *Usnea aurantiacoatra*, grew 4.3–5.5 mm a year in Antarctica (Li et al. 2014, *PLoS One* 9:e100735, FT).
- **Not found:** a measured ring, where the centre of a lichen dies and leaves a ring. The nearest support is Seminara's poorer CO₂ supply to the centre.

**In the game:**
- **Growth:** a lichen grows one rock cell from its rim every design interval. A minute of play is far faster than a real lichen, so the timing is **design**.
- **Protection:** its cells lie on rock, which ants never dig, so the colonies' usual counterplay (cutting hyphae by digging) cannot reach it. Its slowness is the balance.
- **Parked as idea P2:** rings and visible age.

## 3. Carbon from light, while wet

- **Wet and lit only.** A lichen's alga fixes carbon only when the thallus is wet and lit.
  - Too much water slows it as well, by slowing CO₂ diffusion.
  - The fungus, most of the biomass, takes the carbon and regulates the alga.
  - The split between the partners has "seldom been quantified" (Palmqvist 2000, *New Phytol* 148:11, ABS).
  - The common figure that "up to 70–80 % passes to the fungus" was **not found** in any source read.
- **Fast to wake.** In *Flavoparmelia caperata*, PSII (the alga's light-harvesting step) switched on within 1 minute of wetting and peaked within 5. This was measured as chlorophyll fluorescence, not as net carbon gain (Bhatt et al. 2024, *BMC Plant Biol* 24:1268, FT).
  - Recovery takes "minutes to hours", and net photosynthesis is best at about 65–90 % of full water content (Gasulla et al. 2021, *Plants* 10:807, FT).
- **Water source.** Green-algal lichens can photosynthesise on humid air alone: dried *Lobaria* reached net photosynthesis at 33 % relative humidity. Cyanobacterial partners need liquid water (Worthy et al. 2024, *AoB Plants* 16:plae025, FT).

**In the game:**
- **Light income:** lichen cells in light add slow growth to the fungus's **free pool** (PRD §85 M3). That is income from no host at all.
- **Lit cells (design):** plane cells, and curtain cells beside the sky.
- **Cap:** the income is capped by the crust's area, so it is slow and bounded.
- **Wet pulses:** water is parked as idea P1, because the world has no moisture. It would need a dew or rain clock, which the builder's rain tool hints at.
- **Rate:** the carbon share is unquantified, so the rate is **design**, tuned against P1 and a late runaway check.

## 4. Rock to soil

- **The Atacama "grit crust" sequence** (Jung et al. 2020, *iScience* 23:101647, FT):
  - Lichens colonise bedrock, break it into fragments, colonise those, and trap fine grains into a nascent soil.
  - The named processes are single hyphae drilling into the grit, and tunnels widened by the thallus swelling and shrinking with fog and dew.
  - Green algae release OH⁻ as they photosynthesise and raise the pH.
  - On black grit stones, alkaline phosphatase, acid phosphatase and phosphodiesterase activities were 140, 165 and 221 µg p-nitrophenol g⁻¹ h⁻¹.
  - The authors call biocrust weathering rates a field "still in its infancy". No mm a year is given.
- **Depth.** In a medieval brick tower, *Calogaya decipiens* hyphae went 4–5 mm deep on wet faces and 2–3 mm on dry faces, while *Verrucaria nigrescens* reached 1.0–2.5 mm on both. Calcium oxalate formed at the contact in some species (Zabihi, Sohrabi, Nortaghani & Favero-Longo 2025, *Sci Rep* 15:37391, FT). This is brick, not natural rock.
- **Contrary.**
  - The evidence on how much lichens weather rock is "contradictory": on schist, hyphal spread was higher in the species dominant on north-west faces (no species spread differently by orientation), while oxalate (chemical weathering) was found only on south-east faces (Marques et al. 2016, *Ecology* 97:2844, ABS).
  - Oxalate crusts can consolidate stone as well as break it (`fungus-unlocks.md` §3, Paiva et al. 2026).
- **Not read:** two reviews with rates, Chen, Blume & Beyer 2000 (*Catena* 39:121) and Stretch & Viles 2002 (*Geomorphology* 47:87). Both are gathered in `ja-vlla.11.1`.

**In the game:**
- **Step one:** rock under a lichen older than a design age weathers into ground the hyphae can enter, as the *borer* opened undug soil (owner, 2026-11-23: fungus first). The ants' map is unchanged.
- **Step two** (owner: later, behind its own assay): weathered rock becomes soil the ants can dig. That can open routes between nests, so the gate is A3 (mills) and raid times.
- **The age:** it is **design**, as no rate was read.

## 5. Usnic acid and the host

- **Usnic acid helps the pathogen.** Usnic acid, a common lichen compound, **raised** deaths from *Metarhizium robertsii* and *Beauveria bassiana* in Colorado potato beetle and wax moth larvae. A reindeer-lichen extract (perlatolic and usnic acids) acted in synergy with fungal infection in wax moth, more than usnic acid alone; the abstract gives no doses and no route, eaten or by contact (Duisembecov, Dubovskiy & Glupov 2017, *Contemp Probl Ecol* 10:286, ABS, **unverified**).
  - A fluorinated usnic acid with *B. bassiana* cut the median time to death threefold and raised 15-day mortality by 36 % in a field trial in Kazakhstan (with synergy in the lab too, in instars 2–4); the compound is synthetic, not natural usnic acid. It lowered larval haemocyte counts but raised phenoloxidase activity, and the authors attribute the synergy to toxicosis (Kryukov et al. 2018, *Pest Manag Sci* 74:598, ABS, **unverified**).
- **It deters grazers.** Lichen compounds deter snails: removing them made *Parmeliaceae* palatable (Gauslaa 2005, *Oecologia* 143:94, ABS).
- **Not found:** ants and lichen compounds, whether avoidance or harm. Nor any study of lichen compounds inhibiting entomopathogenic fungi; general antifungal screens were not reviewed.

**In the game:**
- **A "bitter crust" upgrade:** an ant on a cell beside a lichen cell loses some of its resistance to the fungus (owner, 2026-11-24: ants meet lichen from the next cell; rock is closed to them).
- **Body, not choice.** It is a body effect on the host: no new ant sense and no choice.
- **Gated:** behind reading the two papers in full (`ja-vlla.11.1`).
- **Design, for now:** ants are not beetle larvae, and contact on a cell is not eating, so the effect stays **design** until then.

## 6. Ants carry fragments

- **Red wood ants.** Across 25 mounds of the *Formica rufa* group in five pine and spruce forest types in Germany, there were fragments of 20 moss and 10 lichen species, on almost all mounds and often many. The species matched the **ground** vegetation round the nests, so the ants gather fragments from the ground nearby. Fragments "may" regrow where dropped on the way (over several metres) or on an abandoned mound: inferred, not observed (Heinken, Rohner & Hoppert 2007, *Nova Hedwigia Beihefte* 131:147, ABS).
  - Where *F. paralugubris* was introduced over 50 years ago, lichens on silver fir differed in composition (not in richness) from trees without ants, and asexually reproducing species "seemed to be associated" with ants (Di Nuzzo et al. 2022, *iForest* 15:71, ABS).
  - That ants move propagules is the authors' argument there, with herbivore exclusion as the alternative; it is not shown.
- **Other animals disperse living propagules:**
  - 25 % of the mites *Humerobates arborea* carried soredia and left them 0.1–7.1 cm away (Stubbs 1995, *Mycologia* 87:454, ABS).
  - Lichens regrew from 29 % and 41 % of snail droppings (Boch et al. 2011, *PLoS One* 6:e18770, FT).
  - Mite droppings held living cells of both partners (Meier et al. 2002, ABS).

**In the game:**
- **Pickup:** an ant on a cell beside a lichen cell may scrape a fragment from it and carry it as load, as it picks up spores.
- **Drop:** where it drops it on rock, or beside its mound, a new lichen starts. The colonies become the lichen's dispersers.
- **Rates:** they are **design**.
- **Gated:** behind reading Heinken in full.

## 7. What the game does today

**The world** (`world.ts`):
- Cells are `OPEN`, `ROCK`, `SOIL` and `AIR`.
- The plane is about 22 % rock, from hashed value noise.
- The curtain has a crust, soil, stones that grow commoner with depth, and a few cavities.
- Nothing breaks rock.
- Per-cell layers hold food, food quality, dig state and spoil.

**Light and water:**
- `heat.ts` has a day and a sun, run only when `heatDay > 0`, which is the desert ant only.
- There is no moisture layer. "Rain" is a builder tool that clears trails.

**The fungus:**
- Hyphae grow from tips (`hyphae.ts`) into enterable cells.
- Patches are `base` and `sources`. A flower (a hex and its six neighbours, all hyphae) makes or spreads a patch (`fungus.ts`, PRD §85).
- A colonised corpse is a new start with six tips.

**Pools and the growth lane:**
- Two mutation pools: ants and free (`evolution.ts`, PRD §85 M3).
- The growth lane asks Jev over 96 situations: `ahead`, `exposed`, `supply`, `run`, `resource` (`growthBrain.ts`).

**Ants and the fungus:**
- Ants cut hyphae by digging, pick up spores on their cell, and are groomed automatically.
- No ant senses a hypha.

## Ideas considered

The owner asked for a broad brainstorm before choosing. Each idea with its biology and its fate:

| Idea | Biology | Fate |
|---|---|---|
| Alga capture on contact | §1, Sanders & Masumoto 2021 (FT) | **Taken** (L1) |
| Theft of a wild lichen's alga | §1, Friedl 1987 (ABS), contrary Beck 1998 | **Taken** (L1; owner: both films and wild lichens) |
| Edge-led spread over rock | §2, Seminara et al. 2018 (FT) | **Taken** (L1) |
| Light income | §3, Palmqvist 2000 (ABS), Bhatt 2024 (FT) | **Taken** (L2) |
| Rock to soil | §4, Jung et al. 2020 (FT) | **Taken** (L3a hyphae, L3b ants) |
| Usnic acid weakens the host | §5, abstracts only | **Taken, gated on reading** (L4) |
| Ants carry fragments | §6, abstract only | **Taken, gated on reading** (L5) |
| Wet and dry pulses | §3 | **Parked** (`ja-ve8t`): needs a moisture clock |
| Rings and visible age | §2 (a ring not measured) | **Parked** (`ja-zar4`) |
| The lichen as a refuge after a host crash | desiccation tolerance (Gasulla et al. 2021, FT) | **Parked** (`ja-g8zo`) |
| Growth forms, crust to leaf to shrub | §2 (Li et al. 2014; Armstrong & Bradwell 2010) | **Parked** (`ja-419b`) |
| Tips steered toward an alga by the growth lane | §1 (contact; thigmotropism not read) | **Parked** (`ja-5ush`): paid, 96 → 144 situations |
| Nitrogen from cyanolichens enriching ground | Knowles et al. 2006 (ABS): soil N up within about 1.5 m of *Peltigera* | **Dropped**: nothing in the game uses nitrogen |
| A partner stack (yeasts, bacteria) | Spribille et al. 2016 against Lendemer et al. 2019 (2.7 % of 339 species) | **Dropped**: contested |
| Lichen wars where thalli meet | none read | **Dropped**: no source |

## What was not found

- A rate of lichen weathering in mm of rock per year or century (the two reviews that may give one were not read).
- The share of the alga's carbon passed to the fungus.
- A measured ring (the centre of a lichen dying).
- Any study of ants and lichen compounds, of ants eating lichen, or of an ant–lichen mutualism.
- Lichen compounds inhibiting *Metarhizium* or any entomopathogen.
- *Metarhizium*, or any entomopathogen, as a lichen fungus. **The partnership itself is design**, as `fungus-unlocks.md` §4 already says.

## The mechanic

Each milestone is its own PR behind a setting whose off is main bit for bit. **Body, not choice:** none adds a Jev situation field.

| Milestone | Cue (sensed) | Response | Local rule (design) | Off | Bead |
|---|---|---|---|---|---|
| Assay | none | metrics only: time to first lichen, lichen cells, growth from light, weathered cells | none | main | `ja-vlla.11.2` |
| L1 partner and crust | a hypha cell beside an alga film or a wild-lichen cell (the fungus's contact) | the alga's rock cell becomes lichen; a wild lichen overgrown is captured | one rock cell from the rim every interval; free-pool `lichen` trait after the mycelium levels | no world content, no trait level | `ja-vlla.11.3` |
| L2 light | a lichen cell in light (plane, or curtain beside the sky) | growth into the free pool | a rate per lit cell, capacity by lichen area | rate 0 | `ja-vlla.11.4` |
| L3a rock to hyphae | lichen age on a rock cell | rock becomes ground the hyphae enter | age threshold | never | `ja-vlla.11.5` |
| L3b rock to ants | weathered rock | rock becomes soil the ants dig | age threshold | never | `ja-vlla.11.6` |
| L4 bitter crust | a host on a cell beside a lichen cell | its resistance falls | a factor per second beside lichen; free-pool upgrade | factor 1 | `ja-vlla.11.7` |
| L5 ant carriers | an ant on a cell beside a lichen cell | it may scrape and carry a fragment; dropped on rock or by its mound, a lichen starts | a pickup chance, a drop rule | chance 0 | `ja-vlla.11.8` |

Learn entries, upgrade text and drawings follow each built milestone (`ja-vlla.11.9`). Nothing reads state an ant or the fungus could not sense, so the vision gap table gains no row.

## Play

- **See:**
  - green alga films at rock edges and grey-green wild lichens on rocks, things on the map to go to;
  - a crust creeping over rock from its edge;
  - later, a rock turning into ground the hyphae enter, and in L3b, soil the ants dig.
  - Each needs a Learn entry: what you see, what real lichens do, how the game models it.
- **Choose:**
  - a free-pool line, lichen then light then weathering then bitter crust, against the ants pool's lethal levers;
  - where to send hyphae: towards a film, or to a wild lichen to take it over;
  - whether to bank a slow host-free income or spend on infection.
- **Counterplay and progression:**
  - It is a late unlock behind the mycelium levels, so the start is untouched (P1 by the worst seed, plus a new time to first lichen).
  - The crust can't be cut by digging, but it is slow, and light income is capped by its area.
  - With L5 the colonies carry the lichen themselves, a mutualism the fungus did not choose.
- **Cost:** none in Jev. Contact, spread, light and weathering are body. The optional growth-lane value (`ja-5ush`) would cost a re-ask of the growth lane (96 → 144 situations; tokens to measure). Cached games still spend nothing.
- **Risks:**
  - **A host-free income runs away**, making infection pointless. Measure mutations per minute in minutes 8–10 against L1, and the share of growth from light.
  - **A cliff when lichen first appears.** Measure the step in the progression curve.
  - **Weathering opens routes and changes raids.** Measure A3 (mills) and raid times (L3b).
  - **Invisible effects** (the bitter crust). It needs a drawing on the host and a Learn entry before it ships.
- **Owner decisions needed:** the design rates (spread interval, light rate, weathering age) after the assay's numbers; L3b's go after L3a; whether to ship L4 and L5 after the full-text reads.

## Open questions

- **Owner:**
  - the design rates once measured;
  - L3b's go;
  - L4 and L5 after `ja-vlla.11.1`;
  - whether the lichen trait needs the borer or the web level first.
- **To measure:**
  - time to first lichen;
  - lichen cells per game;
  - growth share from light;
  - weathered cells per game;
  - P1 by the worst seed with each milestone.
- **To read** (`ja-vlla.11.1`):
  - Duisembecov et al. 2017;
  - Kryukov et al. 2018;
  - Heinken et al. 2007;
  - Di Nuzzo et al. 2022;
  - Friedl 1987;
  - Beck et al. 1998;
  - Chen et al. 2000;
  - Stretch & Viles 2002;
  - Joneson & Lutzoni 2009;
  - Palmqvist 2000.

## Sources

- Armstrong RA, Bradwell T (2010). Growth of crustose lichens: a review. *Geogr Ann A* 92:3–17. [doi:10.1111/j.1468-0459.2010.00374.x](https://doi.org/10.1111/j.1468-0459.2010.00374.x) (ABS)
- Armstrong RA (2005). Radial growth of *Rhizocarpon* section *Rhizocarpon* lichen thalli over six years at Snoqualmie Pass. *Arct Antarct Alp Res* 37:411–415. [doi:10.1657/1523-0430(2005)037[0411:RGORSR]2.0.CO;2](https://doi.org/10.1657/1523-0430(2005)037%5B0411:RGORSR%5D2.0.CO;2) (ABS)
- Beck A, Friedl T, Rambold G (1998). Selectivity of photobiont choice in a defined lichen community: inferences from cultural and molecular studies. *New Phytol* 139:709–720. [doi:10.1046/j.1469-8137.1998.00231.x](https://doi.org/10.1046/j.1469-8137.1998.00231.x) (ABS)
- Bhatt U, Singh H, Kalaji HM, Strasser RJ, Soni V (2024). Decoding the physicochemical basis of resurrection: the journey of lichen *Flavoparmelia caperata*. *BMC Plant Biol* 24:1268. [PMC11681686](https://pmc.ncbi.nlm.nih.gov/articles/PMC11681686/), [doi:10.1186/s12870-024-05751-9](https://doi.org/10.1186/s12870-024-05751-9) (FT)
- Boch S, Prati D, Werth S, Rüetschi J, Fischer M (2011). Lichen endozoochory by snails. *PLoS One* 6:e18770. [PMC3076439](https://pmc.ncbi.nlm.nih.gov/articles/PMC3076439/) (FT)
- Chen J, Blume HP, Beyer L (2000). Weathering of rocks induced by lichen colonization: a review. *Catena* 39:121–146. [doi:10.1016/S0341-8162(99)00085-5](https://doi.org/10.1016/S0341-8162(99)00085-5) (NR)
- Di Nuzzo L et al. (2022). Red wood ants shape epiphytic lichen assemblages in montane silver fir forests. *iForest* 15:71. [doi:10.3832/ifor3897-014](https://doi.org/10.3832/ifor3897-014) (ABS)
- Duisembecov BA, Dubovskiy IM, Glupov VV (2017). Effect of plant secondary metabolites on susceptibility of insects to entomopathogenic microorganisms. *Contemp Probl Ecol* 10:286. [doi:10.1134/s1995425517030052](https://doi.org/10.1134/s1995425517030052) (ABS)
- Friedl T (1987). Thallus development and phycobionts of the parasitic lichen *Diploschistes muscorum*. *Lichenologist* 19:183. [doi:10.1017/s002428298700015x](https://doi.org/10.1017/s002428298700015x) (ABS)
- Gasulla F, del Campo EM, Casano LM, Guéra A (2021). Advances in understanding of desiccation tolerance of lichens and lichen-forming algae. *Plants* 10:807. [doi:10.3390/plants10040807](https://doi.org/10.3390/plants10040807) (FT)
- Gauslaa Y (2005). Lichen palatability depends on investments in herbivore defence. *Oecologia* 143:94. [doi:10.1007/s00442-004-1768-z](https://doi.org/10.1007/s00442-004-1768-z) (ABS)
- Heinken T, Rohner M-S, Hoppert M (2007). Red wood ants (*Formica rufa* group) disperse bryophyte and lichen fragments on a local scale. *Nova Hedwigia Beihefte* 131:147–163 (venue from citing papers' reference lists). [Potsdam repository](https://publishup.uni-potsdam.de/frontdoor/index/index/docId/30639) (ABS)
- Joneson S, Armaleo D, Lutzoni F (2011). Fungal and algal gene expression in early developmental stages of lichen-symbiosis. *Mycologia* 103:291–306. [doi:10.3852/10-064](https://doi.org/10.3852/10-064) (ABS)
- Joneson S, Lutzoni F (2009). Compatibility and thigmotropism in the lichen symbiosis: a reappraisal. *Symbiosis* 47:109. [doi:10.1007/bf03182294](https://doi.org/10.1007/bf03182294) (NR)
- Jung P et al. (2020). Lichens bite the dust: a bioweathering scenario in the Atacama Desert. *iScience* 23:101647. [PMC7578742](https://pmc.ncbi.nlm.nih.gov/articles/PMC7578742/) (FT)
- Knowles RD, Pastor J, Biesboer DD (2006). Increased soil nitrogen associated with dinitrogen-fixing, terricolous lichens of the genus *Peltigera* in northern Minnesota. *Oikos* 114:37–48. [doi:10.1111/j.2006.0030-1299.14382.x](https://doi.org/10.1111/j.2006.0030-1299.14382.x) (ABS)
- Kryukov VY et al. (2018). Effects of fluorine-containing usnic acid and fungus *Beauveria bassiana* on the survival and immune–physiological reactions of Colorado potato beetle larvae. *Pest Manag Sci* 74:598. [doi:10.1002/ps.4741](https://doi.org/10.1002/ps.4741) (ABS)
- Lendemer JC et al. (2019). A taxonomically broad metagenomic survey of 339 species spanning 57 families suggests cystobasidiomycete yeasts are not ubiquitous across all lichens. *Am J Bot* 106:1090–1095. [doi:10.1002/ajb2.1339](https://doi.org/10.1002/ajb2.1339) (ABS)
- Li Y, Kromer B, Schukraft G et al. (2014). Growth rate of *Usnea aurantiacoatra* (Jacq.) Bory on Fildes Peninsula, Antarctica and its climatic background. *PLoS One* 9:e100735. [PMC4072682](https://pmc.ncbi.nlm.nih.gov/articles/PMC4072682/) (FT)
- Marques J et al. (2016). On the dual nature of lichen-induced rock surface weathering in contrasting micro-environments. *Ecology* 97:2844–2857. [doi:10.1002/ecy.1525](https://doi.org/10.1002/ecy.1525) (ABS)
- Meier FA, Scherrer S, Honegger R (2002). Faecal pellets of lichenivorous mites contain viable cells of the lichen-forming ascomycete *Xanthoria parietina* and its green algal photobiont, *Trebouxia arboricola*. *Biol J Linn Soc* 76:259. [doi:10.1111/j.1095-8312.2002.tb02087.x](https://doi.org/10.1111/j.1095-8312.2002.tb02087.x) (ABS)
- Ott S (1987). Sexual reproduction and developmental adaptations in *Xanthoria parietina*. *Nord J Bot* 7:219. [doi:10.1111/j.1756-1051.1987.tb00933.x](https://doi.org/10.1111/j.1756-1051.1987.tb00933.x) (ABS)
- Palmqvist K (2000). Carbon economy in lichens (Tansley Review No. 117). *New Phytol* 148:11–36. [doi:10.1046/j.1469-8137.2000.00732.x](https://doi.org/10.1046/j.1469-8137.2000.00732.x) (ABS)
- Sanders WB, Masumoto H (2021). Lichen algae: the photosynthetic partners in lichen symbioses. *Lichenologist* 53:347. [doi:10.1017/s0024282921000335](https://doi.org/10.1017/s0024282921000335) (FT, key passages)
- Pichler G, Muggia L, Carniel FC, Grube M, Kranner I (2023). How to build a lichen: from metabolite release to symbiotic interplay. *New Phytol* 238:1362–1378. [PMC10952756](https://pmc.ncbi.nlm.nih.gov/articles/PMC10952756/) (FT)
- Seminara A, Fritz J, Brenner MP, Pringle A (2018). A universal growth limit for circular lichens. *J R Soc Interface* 15:20180063. [PMC6030627](https://pmc.ncbi.nlm.nih.gov/articles/PMC6030627/) (FT)
- Spribille T et al. (2016). Basidiomycete yeasts in the cortex of ascomycete macrolichens. *Science* 353:488. [doi:10.1126/science.aaf8287](https://doi.org/10.1126/science.aaf8287) (ABS)
- Stretch RC, Viles HA (2002). The nature and rate of weathering by lichens on lava flows on Lanzarote. *Geomorphology* 47:87. [doi:10.1016/S0169-555X(02)00143-5](https://doi.org/10.1016/S0169-555X(02)00143-5) (NR)
- Stubbs CS (1995). Dispersal of soredia by the oribatid mite *Humerobates arborea*. *Mycologia* 87:454. [doi:10.1080/00275514.1995.12026554](https://doi.org/10.1080/00275514.1995.12026554) (ABS)
- Worthy FR et al. (2024). Acquisition of green algal photobionts enables both chlorolichens and chloro-cyanolichens to activate photosynthesis at low humidity. *AoB Plants* 16:plae025. [PMC11102867](https://pmc.ncbi.nlm.nih.gov/articles/PMC11102867/) (FT)
- Wornik S, Grube M (2010). Joint dispersal does not imply maintenance of partnerships in lichen symbioses. *Microb Ecol* 59:150. [doi:10.1007/s00248-009-9584-y](https://doi.org/10.1007/s00248-009-9584-y) (ABS)
- Zabihi M, Sohrabi M, Nortaghani A, Favero-Longo SE (2025). Lichen colonization and associated biodeterioration processes on ancient bricks of the Gonbad-e Qābus tower. *Sci Rep* 15:37391. [PMC12559727](https://pmc.ncbi.nlm.nih.gov/articles/PMC12559727/) (FT)
