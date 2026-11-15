# Aphids: a renewable sugar source that ants find by smell, milk by touch, guard where they stand, and sometimes eat

*Research and design note for a builder tool (PRD §73, [builder.md](builder.md); this mechanic PRD §78, epic `ja-nzkg`; not built). Written 2026-11-15, against code at `c08cde8c`. **Read in full text** (PMC): Verheggen et al. 2012, Oliver et al. 2007, Oliver, Leather & Cook 2012, Gaber et al. 2024, Gibb, Andersson & Johansson 2016, Hertaeg et al. 2021, Parmentier 2023, Jossart, Hance & Detrain 2025, Foronda et al. 2025 (for what it says of papers it cites); the abstract of Parmentier & Wybouw 2025 read from its full text. **Abstract only** (numbers **unverified**): Mailleux et al. 2000, 2003, 2005, 2006; Detrain & Prieur 2014; Völkl et al. 1999; Fischer et al. 2001, 2002; Fischer & Shingleton 2001; Yao et al. 2000, Yao & Akimoto 2001, 2002; Banks & Nixon 1958; Sakata 1995; Endo & Itino 2012; Novgorodova 2015; Oliver et al. 2008; Detrain, Fichaux & Verheggen 2017; Nault et al. 1976; Fischer C.Y. et al. 2015, 2017; Kindlmann et al. 2007; Ivens et al. 2012; Czaczkes et al. 2013; Oberhauser et al. 2019; Blanchard et al. 2021; Stadler & Dixon 2005; Matsuura et al. 2024 (preprint). **Not reached** (Springer, Elsevier and eje.cz pages bot-walled; Mailleux 2003's PMC scan would not download): Offenberg 2001, Lang & Menzel 2011, Rosengren & Fortelius 1986, Quinet & Pasteels 1996, Collins & Leather 2002, Matsuura & Yashiro 2006, Vantaux et al. 2012, Skinner & Whittaker 1981, Way 1963, and the full texts of Novgorodova 2015 and Mailleux 2003.*

## Frame

**The biological question.** When ants meet a clump of aphids, how do they find it, how do they work it over hours and days (milk, guard, eat, move), and when do they leave it?

**What the owner asked for (2026-11-15).** A builder tool that places a clump of aphids. Ants find them, collect honeydew, return again and again, and perhaps guard them against the other colony.

**What the game does today.**
- **Food is an item on a cell.** `dropFood` (`world.ts`) puts units of food with a `quality` on a cell; an ant takes one unit and tastes its quality at pickup ("Taste" in the sense table). The builder's sugar cube and crumb are qualities 1.5 and 0.5 (builder.md).
- **Recruitment is by trail, laid by quality.** A carrier lays the food trail at a rate set by the food's quality ([trails](trails.md), Beckers et al. 1993); waiting foragers leave on contacts with returning finders ([activation](activation.md)). An ant at a trail's empty end can lay "no entry" (built, off).
- **Food can regrow, but only where the world began with it.** In the fungus game, the piles the world started with grow back (`GameParams.regrow`, `GAME_REGROW` = 1800: a pile eaten bare is half back in about 20 minutes, `game.ts`). Food the builder drops does not regrow. Nothing produces food at a rate that depends on being visited.
- **Returning to a place.** Route memory is built and on; going back to the last find by its vector is built and off ([forager-trips §3](forager-trips.md#3-foragers-go-back-to-where-they-last-found-food), `ja-lp4.15`).
- **Defence is on home ground only.** An ant's stance turns to defend while it senses a threat near its own hole, by sight or its vector ([stance](stance.md), `ja-k4k.6.2`). Nothing away from home is defended.
- **Which ant.** The generic ant is a trail-laying mound ant whose biology comes mostly from *Lasius*, chiefly *L. niger* (the black garden ant): trails, quality and crowding in [trails](trails.md) and [builder](builder.md) are *L. niger* data, and [lasius-neglectus](lasius-neglectus.md) calls *Lasius* "the genus much of the game's generic biology already comes from". *L. niger* is also the best-studied aphid-tending ant in Europe, so most numbers below are from it.

**Existing notes and beads.** `bd search aphid` and `bd search honeydew` find nothing. [lasius-neglectus §5](lasius-neglectus.md#5-food-aphids-and-honeydew) says *L. neglectus* keeps "massive aphid cultures" and, for now, lets "food items stand in for honeydew sources" (data, no change). [species.md](species.md) lists food finding for that species as "the generic ant's (aphids as food items): data". [builder.md](builder.md) lists aphids among its "later notes". No existing note covers tending.

## Ants find aphids by smell as well as by chance, and *L. niger* scouts climb toward aphid odour

- ***Lasius niger*, full text.** Scout antennae responded most strongly to the aphid alarm pheromone (*E*)-β-farnesene (EβF) of *Aphis fabae* (−0.69 ± 0.20 mV at the top dose, against −0.22 for (*E*)-caryophyllene and −0.04 for α-humulene). In a four-arm olfactometer, 53.3 % of 30 scouts went first to the EβF arm (25 % expected by chance). In a two-choice set-up (two 25 cm branches, a fan blowing 0.6 m/s from each plant toward the ants), 67 % of 43 scouts chose the branch toward the EβF-treated plant; 90 % of those chose it from the start. The dose matched what a quiet, unattacked colony of about 75 *Myzus persicae* aphids releases. No scout behaved aggressively; walking speed (1.7–2.0 cm/s) was that of scouts foraging for food. Source: Verheggen et al. 2012.
- ***L. niger*.** Volatiles of honeydew, mostly made by its bacteria, attract scouts in a two-way olfactometer. Each of two aphid species (the tended *A. fabae* and the untended *Acyrthosiphon pisum*) attracted ants against a control; given both, ants preferred *A. fabae*, its honeydew and its honeydew's bacteria. Source: Fischer C.Y. et al. 2017. **Unverified** (abstract; no distances or percentages in it).
- **At high doses EβF means attack.** *Formica subsericea* tending aphids and suddenly exposed to large amounts of EβF extended their antennae and opened their mandibles, ready to attack enemies (Nault, Montgomery & Bowers 1976, abstract; the behaviour as described in Verheggen et al. 2012's introduction, full text).
- **Chance discovery is also normal.** A recent *L. niger* study's introduction says tending "may" start with foragers that "discover aphids by chance" or are attracted by honeydew volatiles or low amounts of alarm pheromone (Jossart, Hance & Detrain 2025, full text; a review statement, not a measurement).
- **Melezitose is a sugar only aphids make, and *L. niger* is most sensitive to it.** Of fructose, glucose, sucrose, melezitose and trehalose, melezitose gave the highest sensitivity and feeding stimulation; trehalose was ignored; sucrose from 0.1 to 2.5 M was accepted, intake most efficient at ≥ 1 M. The authors read melezitose as a cue to the presence of aphids. Source: Detrain & Prieur 2014. **Unverified** (abstract).
- **Limits.** All the odour work is in the lab, over tens of centimetres in a fan's air stream. No field range for detecting an aphid colony by smell was found. Aphids do not, in turn, seek out ants: winged *A. fabae* did not choose plants ants frequented (Fischer C.Y. et al. 2015, abstract).

**In the game:** an aphid clump would be found by searching, as food is now, and from closer by its smell. The air-borne cue has a lab basis in *L. niger* (EβF and honeydew volatiles), unlike food odour through soil. The sense table already has "Food odour in the air" as a radial plume, built for the desert ant only (`foodPlume`); giving the generic ant a plume from aphids alone would extend that row to a second species, with this note as its source. Its range is **design** (no field range was found). Melezitose as a taste is the existing "Taste" row (quality at pickup).

## Recruitment to honeydew is the same trail recruitment as to sugar, scaled to how much the aphids produce

- ***L. niger*.** A scout lays a recruitment trail only if it can drink its own "desired volume" at the source; the volume acts as a threshold. Offered drops larger than a crop holds (3 or 6 µl), 90 % of scouts went straight home laying trail; offered 0.3–1 µl, many stayed searching nearby and, if they found no more, went home without laying trail. Drop size set the share of trail-layers, not how strongly each marked. Source: Mailleux, Deneubourg & Detrain 2000. **Unverified** (abstract). The authors relate this rule to aphid tending.
- ***L. niger*, honeydew productivity.** The same rule holds when a scout fills up from many small feeders, and trail marks are of equal strength whatever the number of sources visited. In their model the share of recruiting ants rises with the aphid colony's total honeydew production, and the number of foragers that gives the strongest recruitment rises linearly with it. Source: Mailleux, Deneubourg & Detrain 2003. **Unverified** (abstract; the PMC scan was not reached).
- **The threshold is individual and moves with hunger.** Each forager's desired volume is its own and stays constant over trips; 14 % of foragers never laid trail over successive trips (Mailleux, Detrain & Deneubourg 2005). Starved foragers have a higher threshold, so they recruit to large sources and less to sources smaller than a crop (Mailleux et al. 2006). Both **unverified** (abstracts).
- **Ants come in proportion to honeydew.** On tansy, *L. niger* attendance followed each aphid species' honeydew output and its share of trisaccharides; the species that made least, with none, was not attended at all (Völkl et al. 1999). Colonies of first and second instars, which make half as much honeydew, were attended less, and attendance tracked the amount, not amino acids (Fischer M.K. et al. 2002). Both **unverified** (abstracts). In the field the number of ants at a *Metopeurum fuscoviride* colony rose with its size (Gaber et al. 2024, full text).
- **Memory and smell beside the trail.** *L. niger* foragers learn a simple route quickly and often follow memory over trail; on a route with two alternating turns errors were 32 %, against 3 % on a repeating route, and trail pheromone cut errors by 30 % (Czaczkes et al. 2013). Trained to two scented feeders, 100 % followed the odour linked with the better food over their route memory (Oberhauser et al. 2019). Both **unverified** (abstracts).
- **Limits.** In a 10-day lab test with two plants, *L. niger* did not at first send more foragers to the better aphids; the shift came only as feeding on the worse honeydew declined (Jossart et al. 2025, full text). Individual faithfulness to one aphid tree is documented in wood ants (*Formica*: Rosengren & Fortelius 1986, "(from memory; not fetched)") and spatial specialisation in *Lasius fuliginosus* (Quinet & Pasteels 1996, "(from memory; not fetched)"); none of this was read here, and no measure of how often one *L. niger* worker returns to the same aphid colony was found.

**In the game:** no new rule is needed for recruitment. Honeydew is food the ant tastes; the trail it lays by quality (Beckers et al. 1993, already built) and activation by returning finders carry it. The desired-volume rule says a source that cannot fill a forager draws no trail; that is a rule about crop fullness, which the game does not model per drop (a forager takes one unit). Whether an aphid clump hands out units slowly enough that this matters is a stage-2 question. Repeated returns already have their sensed pieces: the trail, route memory (on) and the last-find vector (built, off). Individual fidelity to one clump is **not shown** for *L. niger* by anything read here.

## Honeydew is renewable, and tending makes aphids give more of it more often

- **Rates, by species.** On tansy, *M. fuscoviride* produced by far the most honeydew, then *Brachycaudus cardui*, *A. fabae* and *Macrosiphoniella tanacetaria*; the abstract gives 880, 223, 133 and 46 µg "per aphid per hour". Source: Völkl et al. 1999. **Unverified**, and the first figure looks high for one aphid (close to its body mass each hour); read the full text before building on any of them.
- **Concentration.** *M. fuscoviride* honeydew held about 80 µg sugar per µl in every age class; melezitose was 59 % of it; amino acids rose with the aphid's age (Fischer M.K. et al. 2002, **unverified**, abstract).
- **Tending changes excretion.** With *Formica yessensis* attending, *Tuberculatus quercicola* excreted smaller droplets more often; total sugar concentration did not change, but the mix did (less glucose, more sucrose and trehalose), and amino acids rose (Yao & Akimoto 2001, 2002). Ant-attended aphids grew smaller and carried fewer embryos, but ant exclusion raised the colonies' extinction rate (Yao, Shibao & Akimoto 2000). *Chaitophorus* species usually tended made less melezitose when reared without ants (Fischer & Shingleton 2001). *A. fabae* attended by *L. niger* changed its excretion behaviour (Banks & Nixon 1958). All **unverified** (abstracts); no factor for how much more honeydew a tended aphid gives was in them.
- **How it is taken.** Ants palpate an aphid's abdomen with their antennae and the aphid releases a droplet (Verheggen et al. 2012's introduction; Jossart et al. 2025 counted droplets released spontaneously and after antennal stimulation, full text). Aphid colonies in Jossart's lab grew from 30 to about 130–200 in two weeks.
- **What a forager carries.** Red wood ants (*Formica aquilonia*) coming down trees weighed 8.53 ± 0.27 mg against 6.42 ± 0.17 going up: 2.11 mg of honeydew, about a third of body mass; 70 % of those coming down carried a visible load (Gibb, Andersson & Johansson 2016, full text). For *L. niger*, 3 µl already exceeds a crop (Mailleux et al. 2000, abstract), so a full crop is under 3 µl.
- **Temperature.** In the lab, *L. niger* harvested more honeydew from *A. fabae* at 23 °C than at 20 °C and less at 26 °C; aphids were as likely to release droplets at all three (Blanchard et al. 2021, **unverified**, abstract).
- **Limits.** Aphid colonies are short-lived: they grow, crash and go extinct within weeks, and move down a stalk as the plant withers (Gaber et al. 2024, full text: colonies crashed during the one-month survey; Oliver et al. 2007's introduction calls aphid colonies "short lived and transient", citing Dixon 1998). No figure for trips per hour by a honeydew forager was found.

**In the game:** the biology supports a source that refills at a steady rate rather than a pile that is used up; the closest existing piece is regrowth (`regrow`), which today applies only to the world's first piles and not to builder food. That tending raises the flow is measured (more frequent droplets), but no ratio was read, so any "visited aphids give more" factor is **design**. A clump that grows, then crashes, is the biology's time course over days to weeks; at the game's clock that would be **design** too.

## Some tenders stay at the aphids; in *Lasius* the division is loose

- ***L. niger*, full text.** On *M. fuscoviride* in Berlin, focal ants were sorted (after Novgorodova 2015) into caretakers that stayed by the aphids, scouts that left to explore the plant, and transporters that left the plant, "likely" carrying honeydew home. Caretakers spent on average half their time tending (palpating and feeding) and the rest walking among the aphids, meeting other ants, trophallaxis and resting. Ants per aphid ranged from 0.055 to 0.963, highest in tiny colonies of fewer than 15 aphids with 2–9 ants each. The authors write that, unlike *Formica*, "*L. niger* workers in our study seemed to display flexible task allocation". Source: Gaber et al. 2024.
- **Twelve species, marked foragers.** Five strategies, from unspecialised foragers at colonies attended under 60 % of the time, through ants "on duty" at a colony, to a clear division into "shepherds" that collect, "guards" that protect and "transporters" that carry home. *Formica* used all five, *Lasius* only the two unspecialised ones; division grew with colony size and when food was scarce. Source: Novgorodova 2015. **Unverified** (abstract).
- **Trophallaxis at the aphids** was among caretakers' acts (Gaber et al. 2024), so honeydew can pass from ant to ant before going home; no rate was given.

**In the game:** an ant that lingers at the clump while others carry home is the biology, but for the generic (*Lasius*) ant it should come from each ant's own choice, not a caste. The cues it would use (the clump in contact, its own crop, nestmates met there) are existing rows: contact, own body, encounter rate. A fixed shepherd, guard or transporter role is **not** *Lasius* biology (Novgorodova 2015); it would suit a *Formica* species later.

## Tending ants attack the aphids' enemies, more readily than other ants, and mostly locally

- ***L. niger*, full text.** Of 332 ants approached with a needle at aphid colonies, more than 80 % bit it; caretakers 90 %, other ants 76 %; aggression rose with urbanisation. Source: Gaber et al. 2024.
- ***L. niger* against ladybirds.** Ants destroyed ladybird eggs and attacked larvae and adults; *Adalia bipunctata* moved away from patches with *L. niger*, laid fewer eggs there, and avoided ant semiochemicals alone (Oliver et al. 2008, **unverified**, abstract).
- ***L. niger* against hoverflies.** Aggression was tuned to the threat: eggs and young larvae drew low aggression and were often removed with no mobilisation; third-instar larvae were bitten hard, raised the number of patrollers locally "without any further recruitment from inside the ant nest", and often glued and killed ants with a sticky secretion, so the protection failed against them (Detrain, Fichaux & Verheggen 2017, **unverified**, abstract).
- **Defence matters to the aphids.** Abandoned *Aphis* colonies suffered more predation and lasted less long (Fischer, Hoffmann & Völkl 2001); excluding ants raised aphid colony extinction (Yao et al. 2000). Both **unverified** (abstracts).
- **Against other ant colonies: nothing measured was found.** No paper read here measured fighting between ant colonies, of one species or two, at aphids. Wood ants (*Formica rufa*) are said to hold trees with aphids against other insects (Skinner & Whittaker 1981, "(from memory; not fetched)"), and dominance hierarchies among ant species are a general theme (Stadler & Dixon 2005, review, abstract). One full-text paper argues against strong competition: aphid colonies "are usually abundant and do not represent a limiting resource" for *L. niger* (Jossart et al. 2025, discussion, citing others).

**In the game:** tenders defending the clump against what attacks it fits the biology, and the cue would be a threat sensed at the clump: an enemy in contact or close ("enemy" field), or alarm. The measured response is local (more nearby ants, no recruitment from the nest: Detrain et al. 2017), which matches a raised individual threshold rather than a raid. Defending the clump against the **other colony** is **design**: no measurement was found. The game has no aphid predators; adding any would be a separate mechanic. Today's home-ground defence does not cover a clump away from home; whether "at the aphids" counts as home ground is a stage-2 decision, and the vision rule forbids reading the clump's position from the map.

## Ants also eat aphids, mostly the ones that give least

- ***L. niger* on chestnut.** Predation on two aphid species rose with the density of the better honeydew producer (*Lachnus tropicalis*) per ant, and fell mainly on the poorer producer (*Myzocallis kuricola*) (Sakata 1995, **unverified**, abstract).
- ***L. niger*, two aphid species on one shoot.** The preferred species grew; the other declined through predation by the ants (Fischer, Hoffmann & Völkl 2001, **unverified**, abstract).
- ***L. niger*, full text.** Over seven days, plants tended by colonies with 20 larvae carried 118.5 ± 7.4 aphids against 147.4 ± 6.9 on ant-free controls; colonies without larvae, 145.6 ± 14.9 (no difference from controls). Previous diet (sugar, or sugar and protein) made no difference. The authors read it as ants balancing a renewable sugar flow against a protein meal by their larvae's demand. Source: Oliver, Leather & Cook 2012.
- **Offenberg 2001** (*Lasius*; "milk or meat") is reported as showing that ants switch from tending to preying when other sugar is available, while extra protein did not change predation (as summarised by Oliver, Leather & Cook 2012 and Foronda et al. 2025; *secondary*; the paper was not reached).
- **Marking.** *Lasius fuji* preyed less on aphids its nestmates had attended; glass dummies with the attended aphids' hydrocarbons were attacked less; the tended aphids' hydrocarbons came to resemble the ants' (Endo & Itino 2012, **unverified**, abstract).
- **Can be heavy.** *Lasius* ants tending *Stomaphis* took up to half the standing aphid population a day, choosing aphids that gave no honeydew when attacked (Matsuura et al. 2024, *preprint*, abstract).
- **Contrary.** In Jossart et al.'s lab colonies (*L. niger*, *A. fabae*, 10 days), ants were never seen to attack or prey on aphids, infected or not (full text).

**In the game:** ants taking aphids as prey is well supported, and the cues are sensed ones: the aphid's honeydew (taste at the clump), its smell on contact (whether ants have tended it), and the colony's larvae (felt by touch, the hunger row). Larval demand raising predation is one measured study. Any rule for when an ant eats an aphid instead of milking it is **design** beyond that. For a child, "the ants ate my aphids" is honest biology.

## Ants keep aphids from leaving, and one *Lasius* carries its root aphids home

- ***L. niger*, full text.** On paper ants had walked on for 4 hours, *A. fabae* walked 0.354 ± 0.022 mm/s against 0.496 ± 0.032 on clean paper (about 29 % slower); contact with ants added nothing over the marks alone. From an unsuitable leaf, *A. fabae* took 117.5 ± 7.5 s to reach a dish's edge with 12 ants present, against 88.3 ± 10.8 s without; the untended *A. pisum* was unaffected. Source: Oliver et al. 2007. Its introduction says ants also remove alates' wings and chemically hold back wing development (cited, not measured there).
- **Other aphid side effects.** Ant-attended aphid species migrate later in the season (Kindlmann, Hullé & Stadler 2007); ants reduce the number of winged aphids leaving a newly colonised plant (Fischer C.Y. et al. 2015); tended *A. fabae* adults stayed on young growth longer (Banks & Nixon 1958). All **unverified** (abstracts).
- **Yellow meadow ant (*Lasius flavus*), full text.** Workers carried root aphids of six associated species into the nest in a clear order of preference; half of the three favourite species were carried after three encounters, and in a choice test they were carried as fast as the ants' own larvae (half within 6 min). They were never attacked. Unassociated aphids, even species that live with other ants, were bitten and dragged. Source: Parmentier 2023.
- ***L. flavus* aphid eggs.** In winter, eggs of the root aphid *Anoecia zirnitsi* lay only in *L. flavus* chambers beside the ant brood; workers detect, carry, pile and groom them, and beads coated with the eggs' surface chemicals got the same care; other ant species did not. The eggs hatch without ants (Parmentier & Wybouw 2025, abstract read in full text). A *Lasius* also guards *Stomaphis* eggs (Matsuura & Yashiro 2006, title only, not reached).
- ***L. flavus* root aphids are kept clonal and at home**: winged forms are rare and the populations viscous, consistent with little movement between ant colonies (Ivens et al. 2012, **unverified**, abstract).
- **Not found.** No measurement of *L. niger* (or any above-ground ant) carrying aphids to a new plant. One title asks it ("Ant-mediated dispersal of the black willow aphid … does the ant *Lasius niger* L. judge aphid-host quality?", Collins & Leather 2002; not reached, so not cited for a result). Earth shelters built over aphids (Way 1963, "(from memory; not fetched)") were not checked.

**In the game:** the biology supports aphids that stay put while tended (they walk slower on ant marks) and drift off when not. Whose behaviour that is matters: it is the *aphids'* response to the colony's footprint smell, not an ant choice, so it can be a mechanic of the clump. Ants carrying aphids into the nest is shown only for *L. flavus* and its root aphids, a different ant and a different life. For the generic ant, herding aphids to new plants is **design**: nothing read shows *L. niger* doing it.

## Ants know their aphids by touch and by the aphids' hydrocarbons, and learn them

- **Tactile.** Ants antennate the aphid's abdomen to get a droplet (Verheggen et al. 2012, Jossart et al. 2025, full text). In Jossart et al., ants antennated healthy aphids for longer each day over five days, and infected ones for shorter.
- ***L. niger*, full text.** Trained with a honey reward, *L. niger* learned to tell apart the cuticular hydrocarbon (CHC) profiles of *A. fabae* lines with different bacterial symbionts; untrained ants showed no preference, innate or otherwise. Source: Hertaeg et al. 2021.
- **Lang & Menzel 2011** (*L. niger*) is cited as showing that ants discriminate aphids by their hydrocarbons, with n-alkanes a likely signal because they differ between tended and untended species (*secondary*, through Foronda et al. 2025; not reached).
- ***L. fuji* marks its aphids with its own hydrocarbons** and attacks marked ones less (Endo & Itino 2012, abstract, above).
- ***L. flavus*** antennated associated aphids and attacked unassociated ones (Parmentier 2023, full text, above).

**In the game:** recognising aphids is the existing contact row, "Cuticular hydrocarbons (contact): nestmate, stranger, another species", applied to a new kind of creature; that it is *learned* with a sugar reward (Hertaeg et al. 2021) fits an ant that has fed there before. Touching an aphid to get a droplet is contact plus taste. No new sense is needed for this part.

## When the honeydew stops or something better appears, ants leave within days, and no give-up time was measured

- ***L. niger*.** Ants abandoned colonies of a less preferred aphid species "as soon as" colonies of a better one were on neighbouring tansy plants (Fischer, Hoffmann & Völkl 2001, **unverified**, abstract; no time given).
- ***L. niger*, full text.** When one plant's aphids carried a bacterium that made their honeydew less palatable (production unchanged), ants ate fewer droplets and took longer to start feeding; their share of ants on that plant fell over the days, and from days 6 to 10 there were too few contacts with those aphids to measure (Jossart et al. 2025).
- **The recruitment rule implies it.** A source that can no longer fill a forager draws no trail (Mailleux et al. 2000, 2003, abstracts), so traffic falls as the trail fades.
- **Not found.** No measured time for ants to abandon an aphid colony that stopped producing, died or left.

**In the game:** leaving a clump needs no new rule: if it gives nothing, no trail is laid, the trail decays, tired ants go home, and the existing "no entry" mark (built, off) says the same. How fast is not set by biology (days in the field; nothing measured), so any figure is **design**.

## Not every ant in the game tends aphids

- **Desert ant (*Cataglyphis*).** Its diet is dead arthropods; honeydew was searched for and not found ([desert-ant](desert-ant.md), §diet). It should ignore aphids, or at most treat them as prey (**design**; not searched).
- ***L. neglectus*.** Tends heavily (about 2.09 kg of honeydew per tree against 0.82 for *L. grandis*; [lasius-neglectus §5](lasius-neglectus.md#5-food-aphids-and-honeydew), unverified there).
- **Leafcutters, army ants, termites, the Pharaoh ant.** Not searched here. That leafcutters and army ants do not tend aphids is "(from memory; not fetched)".
- **Facultative.** For *L. niger* and *A. fabae* the partnership is optional on both sides: *A. fabae* lives without ants, and ants switch partners readily (Fischer C.Y. et al. 2015; Jossart et al. 2025; Völkl et al. 1999).

**In the game:** whether a species tends is data per species; the desert ant should not. The fit is good for the generic ant (*L. niger* is the model tending ant) and better still for *L. neglectus*.

## What was not found

- A field range at which ants detect an aphid colony by smell; all odour results are lab olfactometers over tens of centimetres.
- How often one *L. niger* worker returns to the same aphid colony, or how long it stays faithful; fidelity papers (Rosengren & Fortelius 1986, Quinet & Pasteels 1996) are for other genera and were not reached.
- Trips per hour for a honeydew forager, and a verified honeydew output per aphid per hour (Völkl et al. 1999's figures are abstract-only and the largest looks implausible).
- A ratio for how much more honeydew a tended aphid gives than an untended one.
- Any measurement of fighting between ant colonies, of the same species or two, over aphids, or of a territory drawn around an aphid tree for *Lasius*.
- *L. niger* carrying aphids to new plants or building shelters over them.
- A measured time for ants to abandon a clump that stops producing.
- Lacewing larvae against tending ants (asked for; not searched in the time).

## The mechanic

The owner's decisions (2026-11-15), each put with the sources for and against it: ants find a clump by searching **and** by a short smell; tenders at the clump defend it, rival ants included, without calling the nest; ants eat a few aphids; a clump grows, then crashes, over a few game minutes.

Most of it is the clump's body, not an ant's choice. What the ants do with it runs through rules they already have: honeydew is food, tasted at pickup and recruited to by trail; the smell steers; the defence is the stance they already take on home ground.

| Cue (sensed) | Sense row | Response | Local rule | Off | Retires or adds |
|---|---|---|---|---|---|
| honeydew on the cell in the jaws | Taste | `get` (food), trail by quality | as food now; honeydew a sugar's quality (**design**) | no aphids placed | nothing |
| aphid odour in the air | Food odour in the air (built for the desert ant) | steering up the plume, empty-jawed | `plume.ts` from aphid cells only, out to `aphidPlume` cells (**design**: no field range measured) | `aphidPlume` 0 | nothing; extends the row to the generic ant, aphids only |
| the clump in contact, and a threat it senses (strangers in reach, alarm) | Cuticular hydrocarbons (contact: another species); Alarm; Encounter | the defend stance, so `contact` answers fight | `stance.ts`: touching an aphid cell counts as home ground in the defend test | `tendDefend` 0 | nothing; no new situation field |
| an aphid in contact | Cuticular hydrocarbons (contact) | `get`: an aphid taken home as food | a small share of takes at the clump (**design**) | `aphidPrey` 0 | nothing; larval demand left to `ja-nzkg.7` |

**The clump (body, not choice).**
- The clumps on the plane (`Game.aphids`, aphids.ts: each a list of cells, a start count, an age and its aphids eaten), put down by the builder's aphid tool.
- Each aphid cell makes honeydew: ordinary food of a sugar's quality, refilled at a rate by its aphids up to a cap. Tending raising the flow is measured (more frequent droplets, Yao & Akimoto), but no ratio was read, so it is left out of the first build.
- Its aphids grow, then crash: a few game minutes (**design**; real colonies over weeks).
- The aphids stay where they are put. Their slowing on ant marks (Oliver et al. 2007) is not built.

**What it does not read.** No ant reads the clump's position, its count or the colony's larvae. An ant knows the clump by touching it, by its smell or by the trail to it.

**Species.** The generic ant tends (*L. niger* is the model tending ant); *L. neglectus* too. The desert ant takes no honeydew: the tool is hidden for it, as the crayon is for a species with no food trail.

**Cost.** No new situation field and no new lane: steering, body and an existing stance test. A cached game still spends nothing. The aphid odour is rebuilt every tick while a clump lives: about 25 µs a build on one world's plane (512 × 368), under 1 % of a tick, measured in the review of #243.

**Assays** (`builderAssays.ts`, `ja-nzkg.1`, before any behaviour):

| Id | Question | Target |
|---|---|---|
| B9 `aphidsFound` | How soon is a clump first found, with the plume and without? | Sooner with it, seed for seed, in most seeds (Verheggen et al. 2012: scouts head toward aphid odour). |
| B10 `aphidsRenewable` | Over 5 game minutes, does a clump deliver more than the same cells of sugar, and does a trail form to it? | More, and a trail (honeydew renews; recruitment as to food: Mailleux et al.). |
| B11 `tendersDefend` | Rivals walk through a clump: what share of contacts there become fights, against the same rivals met away from both homes? | Higher at the clump (Gaber et al. 2024: 90 % of caretakers bit against 76 % of other ants). |
| B12 `aphidsEaten` | Aphids left with ants against none, after the same time | Fewer with ants: report (Oliver et al. 2012: 118 against 147 after 7 days). |

## Play

- **See:** a green clump on the surface. A scout wanders near, turns toward it, finds it; a trail forms; ants come and go for minutes, not one trip. The clump swells, then thins and goes. Rivals that wander in get bitten. Now and then an ant carries an aphid home. Learn entry: "what you see / what real ants do / how the game models it", for a parent to read aloud ("Real ants milk aphids like tiny cows, and guard them.").
- **Choose:** the child's, not the fungus's (the builder is not a fungus lever, PRD §73): where to put the aphids, near which colony, between two colonies. Feeding one colony grows it; a clump between nests makes fights.
- **Counterplay and progression:** none in the fungus game's sense. A clump is food that lasts longer than sugar, so it helps a colony more than one sugar stroke; it can't skip the fungus's progression (it doses no ant and unlocks nothing).
- **Cost:** none in Jev (no new field or lane). Tick cost: the plume rebuild, and a refill pass over aphid cells.
- **Risks:**
  - *Runaway food:* clumps everywhere grow a colony fast. The clump crashes on its own and refills only to a cap; `npm run colony-bench` with a scripted aphid flood says what it costs.
  - *Invisible:* a clump nobody finds. B9 and the plume; smell vision shows the trail once found.
  - *Endless fights:* a clump between two nests could become a battlefield. B11 measures it; the defence is local, with no recruitment from the nest.
  - *A sad child:* "the ants ate my aphids". The owner chose it as honest biology; the notice says so kindly.

## Decisions

- Finding: search and a short smell (owner, 2026-11-15). The range is **design**.
- Guarding: tenders defend on a threat, as on home ground, rival ants included, with no recruitment (owner). The rival part extends Gaber et al.'s measured result: **design**.
- Eating: a few aphids are eaten (owner). Larval demand as the cue waits for a sensed cue (`ja-nzkg.7`).
- Lifetime: a clump grows, then crashes (owner); the timing is **design**.

## Still open

- How much honeydew per aphid, how fast, and the cap: no verified figure (What was not found). Set so that B10 holds and a colony is not flooded.
- Whether tenders should linger at the clump (Gaber et al.: caretakers spend about half their time tending). Not in the first build.
- Whether tending should raise the flow (measured, no ratio read).
- A forager's sensed cue for larval hunger (`ja-nzkg.7`).

## Sources

- Banks CJ, Nixon HL (1958). Effects of the ant, *Lasius niger* L., on the feeding and excretion of the bean aphid, *Aphis fabae* Scop. *J Exp Biol* 35:703–711. [doi:10.1242/jeb.35.4.703](https://doi.org/10.1242/jeb.35.4.703) (abstract; journal page 403)
- Blanchard S, Van Offelen J, Verheggen F, Detrain C (2021). Towards more intimacy: moderate elevation of temperature drives increases in foraging and mutualistic interactions between *Lasius niger* and *Aphis fabae*. *Ecol Entomol* 46:406–418. [doi:10.1111/een.12982](https://doi.org/10.1111/een.12982) (abstract)
- Collins CM, Leather SR (2002). Ant-mediated dispersal of the black willow aphid *Pterocomma salicis* L.; does the ant *Lasius niger* L. judge aphid-host quality? *Ecol Entomol* 27:238–241. [doi:10.1046/j.1365-2311.2002.00390.x](https://doi.org/10.1046/j.1365-2311.2002.00390.x) (title only; not reached)
- Czaczkes TJ, Grüter C, Ellis L, Wood E, Ratnieks FLW (2013). Ant foraging on complex trails: route learning and the role of trail pheromones in *Lasius niger*. *J Exp Biol* 216:188–197. [doi:10.1242/jeb.076570](https://doi.org/10.1242/jeb.076570) (abstract)
- Detrain C, Fichaux M, Verheggen F (2017). Tuned protection of aphids by ants against a predatory hoverfly. *Ecol Entomol* 42:235–244. [doi:10.1111/een.12378](https://doi.org/10.1111/een.12378) (abstract)
- Detrain C, Prieur J (2014). Sensitivity and feeding efficiency of the black garden ant *Lasius niger* to sugar resources. *J Insect Physiol* 64:74–80. [doi:10.1016/j.jinsphys.2014.03.010](https://doi.org/10.1016/j.jinsphys.2014.03.010) (abstract)
- Endo S, Itino T (2012). The aphid-tending ant *Lasius fuji* exhibits reduced aggression toward aphids marked with ant cuticular hydrocarbons. *Popul Ecol* 54:405–410. [doi:10.1007/s10144-012-0314-9](https://doi.org/10.1007/s10144-012-0314-9) (abstract)
- Fischer CY, Vanderplanck M, Lognay GC, Detrain C, Verheggen FJ (2015). Do aphids actively search for ant partners? *Insect Sci* 22:283–288. [doi:10.1111/1744-7917.12125](https://doi.org/10.1111/1744-7917.12125) (abstract)
- Fischer CY, Detrain C, Thonart P, Haubruge E, Francis F, Verheggen FJ, Lognay GC (2017). Bacteria may contribute to distant species recognition in ant–aphid mutualistic relationships. *Insect Sci* 24:278–284. [doi:10.1111/1744-7917.12302](https://doi.org/10.1111/1744-7917.12302) (abstract)
- Fischer MK, Hoffmann KH, Völkl W (2001). Competition for mutualists in an ant–homopteran interaction mediated by hierarchies of ant attendance. *Oikos* 92:531–541. [doi:10.1034/j.1600-0706.2001.920314.x](https://doi.org/10.1034/j.1600-0706.2001.920314.x) (abstract)
- Fischer MK, Shingleton AW (2001). Host plant and ants influence the honeydew sugar composition of aphids. *Funct Ecol* 15:544–550. [doi:10.1046/j.0269-8463.2001.00550.x](https://doi.org/10.1046/j.0269-8463.2001.00550.x) (abstract)
- Fischer MK, Völkl W, Schopf R, Hoffmann KH (2002). Age-specific patterns in honeydew production and honeydew composition in the aphid *Metopeurum fuscoviride*: implications for ant-attendance. *J Insect Physiol* 48:319–326. [doi:10.1016/s0022-1910(01)00179-2](https://doi.org/10.1016/s0022-1910(01)00179-2) (abstract)
- Foronda J, Berville L, Rodríguez E, Peña A, Perdereau E, Montoro M, Lucas C, Ruano F (2025). Chemical recognition cues in ant-aphid mutualism: differentiating, sharing, and modifying cuticular components. *J Chem Ecol* 51:52. [doi:10.1007/s10886-025-01562-w](https://doi.org/10.1007/s10886-025-01562-w) · [PMC12064600](https://pmc.ncbi.nlm.nih.gov/articles/PMC12064600/) (full text; used only for what it reports of Lang & Menzel 2011 and Offenberg 2001)
- Gaber H, Ruland F, Jeschke JM, Bernard-Verdier M (2024). Behavioural changes in the city: the common black garden ant defends aphids more aggressively in urban environments. *Ecol Evol* 14:e11639. [doi:10.1002/ece3.11639](https://doi.org/10.1002/ece3.11639) · [PMC11221068](https://pmc.ncbi.nlm.nih.gov/articles/PMC11221068/) (full text)
- Gibb H, Andersson J, Johansson T (2016). Foraging loads of red wood ants: *Formica aquilonia* in relation to tree characteristics and stand age. *PeerJ* 4:e2049. [doi:10.7717/peerj.2049](https://doi.org/10.7717/peerj.2049) · [PMC4878371](https://pmc.ncbi.nlm.nih.gov/articles/PMC4878371/) (full text)
- Hertaeg C, Risse M, Vorburger C, De Moraes CM, Mescher MC (2021). Aphids harbouring different endosymbionts exhibit differences in cuticular hydrocarbon profiles that can be recognized by ant mutualists. *Sci Rep* 11:19559. [doi:10.1038/s41598-021-98098-2](https://doi.org/10.1038/s41598-021-98098-2) · [PMC8486828](https://pmc.ncbi.nlm.nih.gov/articles/PMC8486828/) (full text)
- Ivens ABF, Kronauer DJC, Pen I, Weissing FJ, Boomsma JJ (2012). Reproduction and dispersal in an ant-associated root aphid community. *Mol Ecol* 21:4257–4269. [doi:10.1111/j.1365-294X.2012.05701.x](https://doi.org/10.1111/j.1365-294X.2012.05701.x) (abstract)
- Jossart M, Hance T, Detrain C (2025). Infected connections: unraveling the impact of a bacterial symbiont on ant-aphid partnership. *PLoS ONE* 20:e0326875. [doi:10.1371/journal.pone.0326875](https://doi.org/10.1371/journal.pone.0326875) · [PMC12184899](https://pmc.ncbi.nlm.nih.gov/articles/PMC12184899/) (full text)
- Kindlmann P, Hullé M, Stadler B (2007). Timing of dispersal: effect of ants on aphids. *Oecologia* 152:625–631. [doi:10.1007/s00442-007-0684-4](https://doi.org/10.1007/s00442-007-0684-4) (abstract)
- Lang C, Menzel F (2011). *Lasius niger* ants discriminate aphids based on their cuticular hydrocarbons. *Anim Behav* 82:1245–1254. [doi:10.1016/j.anbehav.2011.08.020](https://doi.org/10.1016/j.anbehav.2011.08.020) (not reached; cited through Foronda et al. 2025)
- Mailleux AC, Deneubourg JL, Detrain C (2000). How do ants assess food volume? *Anim Behav* 59:1061–1069. [doi:10.1006/anbe.2000.1396](https://doi.org/10.1006/anbe.2000.1396) (abstract)
- Mailleux AC, Deneubourg JL, Detrain C (2003). Regulation of ants' foraging to resource productivity. *Proc R Soc B* 270:1609–1616. [doi:10.1098/rspb.2003.2398](https://doi.org/10.1098/rspb.2003.2398) · [PMC1691411](https://pmc.ncbi.nlm.nih.gov/articles/PMC1691411/) (abstract; the scanned PDF would not download)
- Mailleux AC, Detrain C, Deneubourg JL (2005). Triggering and persistence of trail-laying in foragers of the ant *Lasius niger*. *J Insect Physiol* 51:297–304. [doi:10.1016/j.jinsphys.2004.12.001](https://doi.org/10.1016/j.jinsphys.2004.12.001) (abstract)
- Mailleux AC, Detrain C, Deneubourg JL (2006). Starvation drives a threshold triggering communication. *J Exp Biol* 209:4224–4229. [doi:10.1242/jeb.02461](https://doi.org/10.1242/jeb.02461) (abstract)
- Matsuura K, Yashiro T (2006). Aphid egg protection by ants: a novel aspect of the mutualism between the tree-feeding aphid *Stomaphis hirukawai* and its attendant ant *Lasius productus*. *Naturwissenschaften* 93:506–510. [doi:10.1007/s00114-006-0136-8](https://doi.org/10.1007/s00114-006-0136-8) (title only; not reached)
- Matsuura T, Handa C, Takahashi S, Itino T (2024). Selective predation by ants against less-honeydew secreting aphids. *bioRxiv*. [doi:10.1101/2024.05.02.592168](https://doi.org/10.1101/2024.05.02.592168) (*preprint*; abstract)
- Nault LR, Montgomery ME, Bowers WS (1976). Ant-aphid association: role of aphid alarm pheromone. *Science* 192:1349–1351. [doi:10.1126/science.1273595](https://doi.org/10.1126/science.1273595) (abstract)
- Novgorodova TA (2015). Organization of honeydew collection by foragers of different species of ants (Hymenoptera: Formicidae): effect of colony size and species specificity. *Eur J Entomol* 112:688–697. [doi:10.14411/eje.2015.077](https://doi.org/10.14411/eje.2015.077) (abstract, through OpenAlex; the open PDF's host did not answer)
- Oberhauser FB, Schlemm A, Wendt S, Czaczkes TJ (2019). Private information conflict: *Lasius niger* ants prefer olfactory cues to route memory. *Anim Cogn* 22:355–364. [doi:10.1007/s10071-019-01248-3](https://doi.org/10.1007/s10071-019-01248-3) (abstract)
- Offenberg J (2001). Balancing between mutualism and exploitation: the symbiotic interaction between *Lasius* ants and aphids. *Behav Ecol Sociobiol* 49:304–310. [doi:10.1007/s002650000303](https://doi.org/10.1007/s002650000303) (not reached; cited through Oliver et al. 2012 and Foronda et al. 2025)
- Oliver TH, Mashanova A, Leather SR, Cook JM, Jansen VAA (2007). Ant semiochemicals limit apterous aphid dispersal. *Proc R Soc B* 274:3127–3131. [doi:10.1098/rspb.2007.1251](https://doi.org/10.1098/rspb.2007.1251) · [PMC2293950](https://pmc.ncbi.nlm.nih.gov/articles/PMC2293950/) (full text)
- Oliver TH, Jones I, Cook JM, Leather SR (2008). Avoidance responses of an aphidophagous ladybird, *Adalia bipunctata*, to aphid-tending ants. *Ecol Entomol* 33:523–528. [doi:10.1111/j.1365-2311.2008.01009.x](https://doi.org/10.1111/j.1365-2311.2008.01009.x) (abstract)
- Oliver TH, Leather SR, Cook JM (2012). Ant larval demand reduces aphid colony growth rates in an ant-aphid interaction. *Insects* 3:120–130. [doi:10.3390/insects3010120](https://doi.org/10.3390/insects3010120) · [PMC4553619](https://pmc.ncbi.nlm.nih.gov/articles/PMC4553619/) (full text)
- Parmentier T (2023). Differential transport of a guild of mutualistic root aphids by the ant *Lasius flavus*. *Curr Zool* 69:409–417. [doi:10.1093/cz/zoac060](https://doi.org/10.1093/cz/zoac060) · [PMC10443613](https://pmc.ncbi.nlm.nih.gov/articles/PMC10443613/) (full text)
- Parmentier T, Wybouw N (2025). *Lasius flavus* ants protect root aphid eggs from predators and pathogens during winter hibernation. *R Soc Open Sci* 12:250217. [doi:10.1098/rsos.250217](https://doi.org/10.1098/rsos.250217) · [PMC12308343](https://pmc.ncbi.nlm.nih.gov/articles/PMC12308343/) (abstract read in the full text)
- Quinet Y, Pasteels JM (1996). Spatial specialization of the foragers and foraging strategy in *Lasius fuliginosus*. *Insectes Soc* 43:333–346. [doi:10.1007/BF01258407](https://doi.org/10.1007/BF01258407) (from memory; not fetched)
- Rosengren R, Fortelius W (1986). Ortstreue in foraging ants of the *Formica rufa* group: hierarchy of orienting cues and long-term memory. *Insectes Soc* 33:306–337. [doi:10.1007/BF02224248](https://doi.org/10.1007/BF02224248) (from memory; not fetched)
- Sakata H (1995). Density-dependent predation of the ant *Lasius niger* on two attended aphids *Lachnus tropicalis* and *Myzocallis kuricola*. *Res Popul Ecol* 37:159–164. [doi:10.1007/BF02515816](https://doi.org/10.1007/BF02515816) (abstract, through Crossref)
- Skinner GJ, Whittaker JB (1981). An experimental investigation of inter-relationships between the wood-ant (*Formica rufa*) and some tree-canopy herbivores. *J Anim Ecol* 50:313. [doi:10.2307/4047](https://doi.org/10.2307/4047) (from memory; not fetched)
- Stadler B, Dixon AFG (2005). Ecology and evolution of aphid-ant interactions. *Annu Rev Ecol Evol Syst* 36:345–372. [doi:10.1146/annurev.ecolsys.36.091704.175531](https://doi.org/10.1146/annurev.ecolsys.36.091704.175531) (review; abstract)
- Verheggen FJ, Diez L, Sablon L, Fischer C, Bartram S, Haubruge E, Detrain C (2012). Aphid alarm pheromone as a cue for ants to locate aphid partners. *PLoS ONE* 7:e41841. [doi:10.1371/journal.pone.0041841](https://doi.org/10.1371/journal.pone.0041841) · [PMC3411575](https://pmc.ncbi.nlm.nih.gov/articles/PMC3411575/) (full text)
- Völkl W, Woodring J, Fischer M, Lorenz MW, Hoffmann KH (1999). Ant-aphid mutualisms: the impact of honeydew production and honeydew sugar composition on ant preferences. *Oecologia* 118:483–491. [doi:10.1007/s004420050751](https://doi.org/10.1007/s004420050751) (abstract)
- Way MJ (1963). Mutualism between ants and honeydew-producing Homoptera. *Annu Rev Entomol* 8:307–344. [doi:10.1146/annurev.en.08.010163.001515](https://doi.org/10.1146/annurev.en.08.010163.001515) (from memory; not fetched)
- Yao I, Shibao H, Akimoto S (2000). Costs and benefits of ant attendance to the drepanosiphid aphid *Tuberculatus quercicola*. *Oikos* 89:3–10. [doi:10.1034/j.1600-0706.2000.890101.x](https://doi.org/10.1034/j.1600-0706.2000.890101.x) (abstract)
- Yao I, Akimoto S (2001). Ant attendance changes the sugar composition of the honeydew of the drepanosiphid aphid *Tuberculatus quercicola*. *Oecologia* 128:36–43. [doi:10.1007/s004420100633](https://doi.org/10.1007/s004420100633) (abstract)
- Yao I, Akimoto S (2002). Flexibility in the composition and concentration of amino acids in honeydew of the drepanosiphid aphid *Tuberculatus quercicola*. *Ecol Entomol* 27:745–752. [doi:10.1046/j.1365-2311.2002.00455.x](https://doi.org/10.1046/j.1365-2311.2002.00455.x) (abstract)
