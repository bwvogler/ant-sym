# Hyphal growth: the mycelium is tips that extend, turn and branch

*Research + design note for bead `ja-2bw` (not built; PRD §61). Written 2026-11-12, against code at `9eeaa44`. Searched and read by an agent on 2026-11-12: PubMed Central pages were read in full (through a fetch tool that summarises, so a few figures deserve a second look by eye); Trinci 1974, Fargues et al. 1992, the Cardiff post-print of Fricker et al. 2017 and arXiv could not be reached from the session, and one PMC page (Hu & St. Leger 2002) was refused by the fetch tool's filter. Numbers read only in an abstract, a snippet or a citing text are marked **unverified**. §6 (habitat, sunlight, corpses) comes from a second search the same day, which closes `ja-2qv`'s question; there a "[bio]" filter refused some searches (Braga et al. 2001 on UV-B, cadaver sporulation) and one fetch, and PubMed, Frontiers and Europe PMC were unreachable.*

Today the fungus's mycelium is a number: a mass on its patch by the hole that grows logistically and pays for spores ([fungus-body](fungus-body.md) §1–2, `evolution.ts`). The page draws threads from it, but they are a picture hashed from the patch (`ui/fungusSight.ts`): nothing grows, nothing chooses, and nothing an ant does touches them. The owner asked (2026-11-12) for actual threads, lines through the hexagons, grown by a policy asked every few ticks, at a rate set by a growth factor, that can branch and turn. The question this note answers: **how does a mycelium explore? At what rate do its tips extend, when do they branch, which way do they turn, what do they sense, and when do they stop?**

## TL;DR

- **Each tip extends on its own, at a steady average rate.** *Metarhizium anisopliae* grew 1.3 µm/min in straight channels; other fungi 0.9–4 µm/min. The growth is pulsed, steady only over minutes (§1).
- **Branching keeps pace with extension.** Total length per tip (the hyphal growth unit) settles to a constant, so tips multiply as the mycelium grows. The tip holds back branches close to itself (apical dominance), and branches leave at about 45–60° (§2).
- **A tip senses contact.** It slides along a wall it meets at a shallow angle, splits in two against one it meets head on, then goes back to its old heading. It turns away from hyphae of its own nearby (§3).
- **The network feeds the tips.** Supply to a hypha goes with the number of tips it feeds; resources move out to the foraging edge (§4).
- **Against the idea:** in soil, *Metarhizium* is found mostly as spores and on roots, not as a free-foraging mycelium. The game takes a licence here, as fungus-body.md already does for its mycelium by the hole (§5).
- **It lives just under the surface, along walls, and on corpses.** Sunlight kills its spores within an hour or a few; it is densest in the top few cm and litter; burrow walls are microbial hotspots; a corpse is where it grows out and sporulates (§6).
- **In the game:** a mycelium of hyphae in the topsoil under the plane round the hole and down the shaft's and tunnels' walls, rooted by the hole, each tip a few cells long a step; a **growth policy** chooses for each tip (grow on, veer, branch, rest) from what that tip senses at its point (what is ahead, whether it is buried in soil, on a tunnel's wall or out in a dug cell, and its supply). The local rule is the biology above; Jev answers it under the player's aim. Hyphae may grow along tunnels and across them; spores go out where they are exposed to air.

## 1. A tip extends at a steady average rate, in pulses

- *Metarhizium anisopliae* extended **1.3 µm/min** in straight microfluidic channels (a single run); thirteen other species ran 0.94–4.1 µm/min (*Neurospora crassa* 3.1, *Aspergillus nidulans* 3.8, *Trametes* 4.1). In the mazes, *Metarhizium* completed few paths. Hopke et al. 2021 (*PLoS One*), full text.
- *N. crassa* tips grew about 0.3 µm/s under imaging (an optimum of about 0.8 µm/s), with nuclei flowing to the tips at up to about 20× the tip speed. Roper et al. 2013 (*PNAS*), full text.
- Elongation is **never perfectly steady**: *N. crassa* and *Trichoderma* tips pulsed 13–14 times a minute, *Fusarium culmorum* 2.7. López-Franco et al. 1994 (*PNAS*), full text.
- The apical compartment drives its own extension: cutting off the compartment behind it cut growth by only 4–8 % in *Penicillium* and *Schizophyllum* (but by 71 % in *Rhizopus*), at 1.3–2.9 µm/min. Tegelaar et al. 2020 (*Antonie van Leeuwenhoek*), full text.
- The leading hyphae's rate rises, then holds constant (Trinci 1974). **Unverified** (search excerpts; not fetched). *Metarhizium* colonies on agar are measured in mm/day with an optimum near 25 °C (Fargues et al. 1992). **Unverified** (abstract only; no per-isolate figure).

**In the game:** every tip extends at one rate, a cell per step, with its step every few ticks; the rate is a trait of the fungus (the growth factor: the *Mycelium* upgrade), not a choice. The time scale is **design**: at 1.3 µm/min a hypha would take most of a day to cross one ant-sized cell, so the game runs the mycelium about four orders of magnitude fast, as it already does for the mycelium's mass. Pulses are not modelled; the step is the average.

## 2. Branching keeps pace with extension; the tip holds back branches near itself

- **The hyphal growth unit** (total hyphal length ÷ number of tips) oscillates early, then settles to a roughly constant value, so the number of tips grows with the mycelium's length (Trinci 1974; Caldwell & Trinci 1973). **Unverified** (search excerpts; per-species values not obtained).
- **Apical dominance:** the tip suppresses new branches close to itself (Rayner 1991, via Semighini & Harris 2008). In *A. nidulans* this needs reactive oxygen at the tip: blocking it left 71 % of tips swollen or branched, and a mutant split its tips in 41–45 % of hyphae. Semighini & Harris 2008 (*Genetics*), full text.
- **Lateral branches** arise behind the septa of compartments behind the tip; splitting the tip itself is typical of fast tips. Lin et al. 2015 (review), full text.
- **Angles:** in *N. crassa* lateral branches leave at about 45° and apical splits are V-shaped at about 45° (Held et al. 2019, *PNAS*, Table 1, full text); mature hyphae at about 50–60° (Simonin et al. 2012, *Eukaryot Cell*, full text).
- **Species differ:** *Rhizopus* branches often and explores every path; *Trametes* keeps one or two dominant hyphae (Hopke et al. 2021).

**In the game:** a branch leaves a hypha one hex turn aside (60°, the grid's nearest to the measured 45–60°). The local rule branches a tip once its run since its last branch reaches the growth unit `HGU` cells (**design**: no per-species value was obtained), and never within the cells next to a tip (apical dominance). How many tips the body can feed is set by its supply (§4), so the growth unit holds by itself under the local rule; that is the first assay.

## 3. A tip senses contact: walls, and its own hyphae

- **Obstacles** (*N. crassa*, Held et al. 2019, full text): a tip meeting a wall at under about 35° **slides along it**; above 35° it **stalls**, its Spitzenkörper vanishes 70 ± 40 s after contact, and the tip **splits into two branches** going opposite ways ("hit and split"). After a deflection a tip **returns to its old heading** within about 20° (directional memory). Confined, branch spacing shrinks 5–10× and extension slows up to 10×.
- **Direction** is set by the Spitzenkörper at the tip (Bartnicki-Garcia 1995, via Lin et al. 2015).
- **Thigmotropism:** *Candida* hyphae reorient on ridges through stretch-activated calcium channels (Brand et al. 2008, via Brand & Gow 2009, full text); several fungi follow grooves and pores (1997 study, **unverified**, abstract only). *Metarhizium* germ tubes switch to forming appressoria on hard hydrophobic surfaces: over 70 % on Teflon or polystyrene against under 40 % on agarose (St. Leger et al. 1989, **unverified**, abstract only). That is a switch from growing to penetrating, not steering.
- **Negative autotropism:** hyphae turn away from a neighbour within about 24–30 µm (Trinci et al. 1979; **unverified**, a textbook excerpt). The mechanism is unproven (Brand & Gow 2009), and a 2025 preprint reports apex–hypha interactions as intermittent, sometimes toward and sometimes away (arXiv 2507.06280; preprint, **unverified**, not fetched).
- **Chemotropism** outside mating is "limited" in the evidence (Brand & Gow 2009); none was found for *Metarhizium* toward insects. **Gravitropism** of vegetative hyphae: not found.

**In the game:** a tip senses only what touches it: the cell ahead (soil to grow through, an open tunnel or chamber, rock, or a hypha of its own) and whether it is **exposed**: buried in soil, in soil with a dug cell beside it (a tunnel's wall), or out in a dug cell itself (open to the air of a tunnel or chamber). These are contact senses, sourced above: walls steer a tip (Held et al.) and hyphae follow grooves and pores (thigmotropism). A tip may grow along a tunnel's wall, or out into the tunnel and across it (owner, 2026-11-12). That an exposed hypha is where the fungus sporulates follows *Metarhizium*'s conidiation on surfaces open to the air, **design** here (from memory; not fetched). What ants are doing in the tunnel is not sensed. The local rule follows Held et al.: rock ahead head-on, split (a branch each way); at a glancing angle, slide (turn one hex along it); its own hypha ahead, turn away; a tunnel ahead from the soil, slide along its wall (thigmotropism); otherwise drift back to its first heading. Growing toward food (`ja-lo8.13`) would be chemotropism, which the evidence above calls limited: it stays a design choice for that bead.

## 4. The network feeds the tips; resources move out to the edge

- Flows in the mycelium supply nuclei to the extending tips, and **the flow in each hypha is proportional to the number of tips it feeds** (Roper et al. 2013, full text).
- *N. crassa* sends resources from a food source **outward to the foraging tips**, with little return to the interior; fusion between hyphae is needed for efficient transport (Simonin et al. 2012, full text).
- Cord-forming basidiomycetes remodel their networks by growth, branching, fusion and **regression** (Boddy 1999; Fricker et al. 2017; **unverified**, abstracts). Under grazing, *Phanerochaete velutina* adds cross-links "at the expense of further exploratory growth" (Rotheray et al. 2008, cited in Simonin et al. 2012).
- **Not found:** a measured rule for when a tip stops for lack of supply, regression times, or translocation speeds.

**In the game:** the mass the mycelium grows (`Evolution.grow`, unchanged) is what pays for new hypha: each cell of hypha costs `HYPHA_MASS` (**design**; a 2–3 µm hypha is about 0.5–1.2 µg dry per metre by a derivation from density, **unverified**, which fixes no game number). A step is shared among the tips: each tip's **supply** is the mass the network can spend this step divided by its tips. A tip whose supply falls short does not extend (it waits, as a tip that stalls), so the body never grows more hypha than it has grown mass for. Regression is **design**, and left out of the first build.

## 5. Where it lives, and what is against the idea

- **In soil, *Metarhizium* is mostly spores and root-associated hyphae**, not a free-foraging mycelium: propagules about 10⁵/g in the inner rhizosphere, falling from 10⁵ to 10³/g in bulk soil over months (Hu & St. Leger 2002, **unverified**, a snippet); *M. robertsii* germinates on roots and grows over and into them (Sasan & Bidochka 2012, **unverified**, abstract only). No hyphal length density for an entomopathogen in soil was found; all soil fungal hyphae together run 3–38 m/g (**unverified**, snippets, mostly mycorrhizal).
- The owner put the game's mycelium in the soil, not on the surface, since sunlight kills it (PRD §51 note of 2026-11-08, `ja-yo3`, with its research in `ja-2qv`).
- **Against "tips decide":** extension is pulsed (§1); a tip's vigour depends on its place in the network (§4); lateral branching in confinement follows "the availability of lateral space, rather than … internal processes" (Held et al. 2019). **For it:** apical compartments are self-sustaining (Tegelaar et al. 2020), and Held et al. model each tip as two local routines, directional memory and branching at obstacles.

**In the game:** the mycelium grows in the soil: the topsoil just under the plane's surface round the hole, and the curtain's soil under it, rooted by the hole (where it lives is §6). A free-foraging hyphal network for an entomopathogen in soil is a **licence**, taken for play (the player sees and steers the fungus's body) and kept honest by the rules above: tips grow at one rate, branch by the growth unit, sense only contact, and spend only mass the body has grown.

## 6. Where it lives: just under the surface, along walls, and on corpses

- **Sunlight kills it fast.** Twelve Brazilian *Metarhizium* isolates kept over 70 % germination after 4 h of UV-B (0.66 W m⁻²), fell after 6 h, and after 8 h nine of twelve were under 5 % (Couceiro et al. 2021, full text). Simulated full sunlight (about a summer noon) cut germination of seven Ghanaian isolates by 28–40 % in 30 min and killed all of them in 60 min (Acheampong et al. 2025, full text). No paired field test of sun against shade was found. No UV test on hyphae was found either; Couceiro et al. read conidia as the hardened stage and mycelium as the active, root-associated one, and germlings are more sensitive than conidia (Braga et al. 2001, from memory; not fetched). So bare hyphae on a sunlit surface would be at least as vulnerable as spores.
- **It is densest in the top few cm and the litter.** In Polish forests entomopathogenic fungi were usually denser in leaf litter than in the soil below, *Beauveria* most at 0–5 cm and falling with depth; *Metarhizium* was recorded at 0–5 cm (Majchrowska-Safaryan & Tkaczuk 2021; abstract and part of the full text, its per-depth figures **unverified**). GFP-tagged *M. anisopliae* fell from 10⁵ to 10³ propagules/g in bulk topsoil (0–2 cm) over months but held about 10⁵/g in the inner rhizosphere, and tracked roots below 10 cm (Hu & St. Leger 2002, full text this time). No evidence was found of *Metarhizium* hyphae growing on a bare soil surface.
- **Burrow walls are hotspots.** An earthworm burrow's 0–3 mm wall had dehydrogenase activity 235 % above bulk soil and about 8× the metabolic activity (Lipiec et al. 2016, full text); no fungal measure was taken, and *Metarhizium* on tunnel walls was not found.
- **Corpses are where it grows out.** A *Metarhizium* or *Beauveria* weevil cadaver gave about 1.3 × 10⁸ conidia in 7 days at high humidity (Khun et al. 2021, full text). Argentine ant workers put corpses in refuse areas in 19 of 20 trials and coated them with pygidial secretion; a lone corpse grew fungus about 3 days after death, corpses the ants attended grew nothing, and grew within a day once the ants were taken away (Kesäniemi et al. 2019, full text). Termites bury cadavers once deaths pass 15 %; a buried cadaver still sporulated but did not pass it on, and 85.9 % of unburied ones sporulated (Chouvenc & Su 2012, full text). One sporulating *Beauveria* cadaver killed 98 % of 692 *Camponotus* in 51 sub-colonies within 28 days (Loreto & Hughes 2016, full text).
- **Around nests.** *Metarhizium* occurred in and around most of 22 Ontario ant nests at concentrations the nest did not change (2018 study, **unverified**, snippet); in Danish *Myrmica* nests entomopathogen load was lower in nest soil than within 2 m of it (Schär et al. 2015, full text). Restricted from removing corpses, *Myrmica rubra* survival fell from 94 % to 87 % (Diez et al. 2014, full text). *Myrmica rubra* dug as much in sand carrying *M. brunneum* spores, with no avoidance (Leclerc et al. 2018, full text). That middens are a *Metarhizium* hotspot: **not found**.

**In the game** (owner, 2026-11-12): the plane is read as the topsoil and litter just under the surface, not its sunlit top. Hyphae thread through it round the hole (drawn faint, as under the ground) and down the shaft's and tunnels' walls into the curtain, the dug surfaces first; pushing into undug soil needs the *Mycelium* upgrade's second level, renamed **a borer**. Nothing grows on top in the sun: spores laid out in the open die faster there (`ja-6ip`). A hypha that reaches a **corpse** (on the midden or anywhere) grows over it and puts out many spores; ants tending a corpse hold it back (Kesäniemi et al. 2019), which is also their counterplay.

## What was not found

- *Metarhizium* or *Beauveria* tip speed in soil; their hyphal length density in soil.
- *Metarhizium* chemotropism toward insects or nutrients; gravitropism of vegetative hyphae.
- Per-species hyphal growth unit values; when a tip stops for want of supply; regression times; translocation speeds.
- Conidiation of *Metarhizium* on exposed hyphae in soil pores (the `exposed` cue's role for spores is design).
- A sun-against-shade field test of spores; a UV test on hyphae; *Metarhizium* per depth (refused); *Metarhizium* on burrow walls or a bare surface; counts in ant middens; a measured humidity threshold for sporulation on cadavers.

## The mechanic

Cheapest first; everything behind a setting (`hyphae`) whose "off" plays as main does bit for bit (the golden masters never land a fungus; the progression script is the play baseline).

1. **The body: hyphae in the soil** (`colony/hyphae.ts`, pure). A set of hypha cells in the curtain's soil, each with its parent (so a hypha is a chain and the mycelium a tree), and a list of tips, each with its heading (one of six hex directions), its first heading (directional memory) and its run since its last branch. The landing roots a few tips in the topsoil by the hole (the plane, read as the layer just under the surface) and on the shaft's walls under it (the zone `ja-yo3` defined; folded in). At the *Mycelium* upgrade's first level (*a thread*) a tip grows only through the plane's topsoil and along dug surfaces in the curtain (the shaft's and tunnels' walls, `exposed` wall or open); the second, renamed **a borer**, lets it push into undug soil (`exposed` buried); what the third (*a web*) unlocks is open. Each tip steps every `TIP_STEP` seconds (the growth factor: shorter with each *Mycelium* level), paid out of the mycelium's mass at `HYPHA_MASS` a cell, shared among the tips (§4). Tips may grow into dug cells (along a tunnel or across it). **Spores** go out onto open cells where a hypha is exposed (a hypha in a dug cell, or on a tunnel's wall), at the *Fruiting body* rate, replacing today's fixed patch. **Ants digging** a hypha cell cut it: the cell is gone, and tips beyond the cut stop (counterplay; **design**). **Corpses:** a hypha reaching a corpse's cell colonises it and puts out many spores there for a while (Khun et al. 2021, rate **design**); a corpse an ant is tending or carrying is not colonised (Kesäniemi et al. 2019).
2. **The growth policy.** The fungus's choice for a tip at its step, from what that tip senses:

   | Cue (sensed by the tip) | Values | Source |
   |---|---|---|
   | `ahead`: the cell it would grow into | soil, open (a tunnel or chamber), rock, hypha (its own) | contact: Held et al. 2019; autotropism (Trinci et al. 1979, unverified) |
   | `exposed`: where the tip is | buried (soil all round), wall (soil, a dug cell beside), open (in a dug cell) | thigmotropism and pore following (Brand & Gow 2009; 1997 study, unverified); Held et al. 2019 (walls) |
   | `supply`: its share of the network's mass this step | short, ample | Roper et al. 2013 (flow ∝ tips fed) |

   4 × 3 × 2 = **24 situations**. Answers: `grow` (on, straight), `left`, `right` (veer one hex), `branch` (a new tip one hex aside), `rest` (no step; it keeps its mass). The tip's local rule (Jev's stand-in, and the "preset"): rock head-on, branch both ways (split); rock at a glance, slide (veer along it); own hypha ahead, veer away; open ahead from the soil, slide along the tunnel's wall (thigmotropism); in a dug cell, grow on across it toward soil; supply short, rest; run ≥ `HGU`, branch; else drift back toward the first heading. Growing out into a tunnel instead of along it is the aim's choice (Jev may answer `grow` there).
3. **The lane.** A new Jev lane, `growth`, under the fungus's aim (the player's words): one question per situation, cached like the fungus lane; a tip whose situation has no answer under the words in force plays the local rule until the answer arrives (ja-lo8.15). Precached for the preset aims (`scripts/precache.mjs`, from a live check's caches).
4. **The picture.** The renderer draws each hypha as lines through the hexagons' centres (parent to child), thin, tips as a dot; on the plane faint, as under the ground. It replaces the hashed threads of `ui/fungusSight.ts` and the mat drawn on the plane.

| Cue | Sense row | Response | Local rule | Off | Retires |
|---|---|---|---|---|---|
| ahead, exposed, supply (a tip's contact and its supply) | fungus senses, [fungus-policy §11](fungus-policy.md#11-what-the-fungus-senses-inside-an-ant-and-its-levers), extended by this note | grow, left, right, branch, rest | Held et al.'s slide and split, autotropism, the growth unit, supply | `hyphae` off: the patch by the hole as today | the fixed patch (`Fungus.root`'s base) and its spores' missing terrain check; the hashed threads in `ui/fungusSight.ts`; the fungus has its first choice of where its spores go out (part of `ja-k4k.8`) |

**Assays and targets** (they land first, with `hyphae` off measuring nothing, then on):
- **H1, the growth unit:** under the local rule in open soil, length ÷ tips settles to within ±20 % of `HGU` once past 20 tips (Trinci 1974, unverified).
- **H2, slide and split:** a tip meeting rock head-on leaves two tips going opposite ways; one meeting it at a glance follows it (Held et al. 2019).
- **H3, autotropism:** under the local rule, under 5 % of tip steps run into the mycelium's own cells.
- **H4, supply:** total hypha × `HYPHA_MASS` never exceeds the mass grown; with supply short, no tip extends.
- **Play (P1):** with `hyphae` on, `scripts/lab/progression.mjs --map one`: no seed worse than PRD §61's one-world baseline (a quarter at 147–509 s on nine seeds, never on seed 6), and the median quarter within ±25 % of it. (§50.14's band was the side world's.)
- **Bench:** a tip step is O(1); a few hundred tips stepping every few ticks fits the tick budget (measured in the PR).

**Cost (estimated).** The lane's request is the fungus lane's shape with a smaller legend: about 24 situations per set of words, at roughly the fungus lane's ~770 tokens a situation (PRD §50.19), about 18k tokens, **≈ $0.0008 per new aim**, once; cached games spend nothing. The fungus lane is unchanged.

## Play

- **See:** threads spreading faintly under the plane round the hole and onto the midden's corpses, and in the side view as lines through the hexagons down the shaft, tips creeping on, splitting at stones, turning from each other, running along tunnel walls or out across them, and spores showing where they are exposed. Ants digging cut them. Corpses it reaches sprout spores. The Learn entry "The fungus's body" gains what you see (lines, tips, splits) and the biology above.
- **Choose:** the aim in words now reaches the fungus's body: "run along the tunnels" or "stay buried and out of their way" changes where the hyphae go, and so where ants pick spores up. It is the fungus's first say in where its spores go out (`ja-k4k.8`). The *Mycelium* upgrade becomes the growth factor (tip speed and how many tips the body feeds), so it shows on the field.
- **Counterplay and progression:** ants digging cut hyphae; a colony that digs a lot keeps clearing its own walls. The start stays weak: a few tips, slow, a few cells from the shaft; the slope is the *Mycelium* upgrade. A hypha out in a tunnel is where ants can reach it.
- **Cost:** about $0.0008 a new aim (24 situations), once; cached games spend nothing. No other lane changes.
- **Risks:** a **cliff** if hyphae reach every tunnel at once and spores go out everywhere; the number to watch is the progression worst seed (P1). A **runaway** body if growth outpaces mass: H4 forbids it. **Invisible** above: the effect shows only in the side view, so the top view's ants carrying spores must still read as the fungus's doing. **Mills:** a tip resting at a tunnel forever does nothing harmful; a tip veering left and right forever would stall, which H1 would show as too few branches.
- **Owner decisions needed:** listed below.

## Open questions

- **Decided (owner, 2026-11-12, after §6):** the plane is the topsoil just under the surface: hyphae thread there first, round the hole and to the midden, then down the dug walls; *a borer* (the renamed second *Mycelium* level) lets them push into undug soil; corpses they reach sporulate, in this epic. Earlier the same day: the local rule first, then a Jev growth lane; no cue for ants: instead whether the tip is buried, on a tunnel's wall or out in a dug cell, and tips may grow along tunnels or across them; ants digging cut hyphae.
- **Decided:** `ja-yo3` folds into `ja-2bw.2`.
- **Owner, open:** what *a web*, the third *Mycelium* level, unlocks.
- **Owner:** do ants walking through a dug cell break a hypha out in it, or only pick spores off it? Proposed: only pick spores off it in the first build.
- To measure: `HGU`, `TIP_STEP` per *Mycelium* level and `HYPHA_MASS` against the progression band; the tick cost of a few hundred tips.

## Sources

- Hopke A, Mela A, Ellett F et al. (2021). Crowdsourced analysis of fungal growth and branching on microfluidic platforms. *PLoS One* 16:e0257823. [doi:10.1371/journal.pone.0257823](https://doi.org/10.1371/journal.pone.0257823) ([PMC8480888](https://pmc.ncbi.nlm.nih.gov/articles/PMC8480888/))
- Roper M, Simonin A, Hickey PC, Leeder A, Glass NL (2013). Nuclear dynamics in a fungal chimera. *PNAS* 110:12875–12880. [doi:10.1073/pnas.1220842110](https://doi.org/10.1073/pnas.1220842110) ([PMC3740868](https://pmc.ncbi.nlm.nih.gov/articles/PMC3740868/))
- López-Franco R, Bartnicki-Garcia S, Bracker CE (1994). Pulsed growth of fungal hyphal tips. *PNAS* 91:12228–12232. [doi:10.1073/pnas.91.25.12228](https://doi.org/10.1073/pnas.91.25.12228) ([PMC45410](https://pmc.ncbi.nlm.nih.gov/articles/PMC45410/))
- Tegelaar M, van der Lans GPA, Wösten HAB (2020). Apical but not sub-apical hyphal compartments are self-sustaining in growth. *Antonie van Leeuwenhoek* 113:697–706. [PMC7138781](https://pmc.ncbi.nlm.nih.gov/articles/PMC7138781/)
- Held M, Kašpar O, Edwards C, Nicolau DV (2019). Intracellular mechanisms of fungal space searching in microenvironments. *PNAS* 116:13543–13552. [doi:10.1073/pnas.1816423116](https://doi.org/10.1073/pnas.1816423116) ([PMC6613077](https://pmc.ncbi.nlm.nih.gov/articles/PMC6613077/))
- Simonin A, Palma-Guerrero J, Fricker M, Glass NL (2012). Physiological significance of network organization in fungi. *Eukaryot Cell* 11:1345–1352. [doi:10.1128/EC.00213-12](https://doi.org/10.1128/EC.00213-12) ([PMC3486018](https://pmc.ncbi.nlm.nih.gov/articles/PMC3486018/))
- Semighini CP, Harris SD (2008). Regulation of apical dominance in *Aspergillus nidulans* hyphae by reactive oxygen species. *Genetics* 179:1919–1932. [doi:10.1534/genetics.108.089318](https://doi.org/10.1534/genetics.108.089318) ([PMC2516069](https://pmc.ncbi.nlm.nih.gov/articles/PMC2516069/))
- Lin X, Alspaugh JA, Liu H, Harris S (2015). Fungal morphogenesis. *Cold Spring Harb Perspect Med* 5:a019679. [PMC4315913](https://pmc.ncbi.nlm.nih.gov/articles/PMC4315913/)
- Brand A, Gow NAR (2009). Mechanisms of hypha orientation of fungi. *Curr Opin Microbiol* 12:350–357. [PMC2728830](https://pmc.ncbi.nlm.nih.gov/articles/PMC2728830/)
- Trinci APJ (1974). A study of the kinetics of hyphal extension and branch initiation of fungal mycelia. *J Gen Microbiol* 81:225–236. [doi:10.1099/00221287-81-1-225](https://doi.org/10.1099/00221287-81-1-225) (not fetched)
- Fargues J et al. (1992). *Agronomie* 12(7) (abstract only; not linked).
- St. Leger RJ et al. (1989). Production in vitro of appressoria by the entomopathogenic fungus *Metarhizium anisopliae*. [USU repository](https://digitalcommons.usu.edu/biology_facpub/1386) (abstract only)
- Hu G, St. Leger RJ (2002). Field studies using a recombinant mycoinsecticide (*Metarhizium anisopliae*) reveal that it is rhizosphere competent. *Appl Environ Microbiol* 68:6383–6387. [PMC134390](https://pmc.ncbi.nlm.nih.gov/articles/PMC134390/) (fetch refused; snippet only)
- Sasan RK, Bidochka MJ (2012). The insect-pathogenic fungus *Metarhizium robertsii* (Clavicipitaceae) is also an endophyte that stimulates plant root development. *Am J Bot* 99:101–107. [doi:10.3732/ajb.1100136](https://doi.org/10.3732/ajb.1100136) (abstract only)
- Fricker MD, Heaton LLM, Jones NS, Boddy L (2017). The mycelium as a network. *Microbiol Spectrum* 5(3). [doi:10.1128/microbiolspec.FUNK-0033-2017](https://doi.org/10.1128/microbiolspec.FUNK-0033-2017) (abstract only)
- Boddy L (1999). Saprotrophic cord-forming fungi: meeting the challenge of heterogeneous environments. *Mycologia* 91:13–32 (abstract only; not linked).
- Apex–hypha interactions (2025), preprint. [arXiv:2507.06280](https://arxiv.org/abs/2507.06280) (not fetched)
- Couceiro JC et al. (2021). *Front Fungal Biol* 2:645737. [doi:10.3389/ffunb.2021.645737](https://doi.org/10.3389/ffunb.2021.645737) ([PMC10512313](https://pmc.ncbi.nlm.nih.gov/articles/PMC10512313/))
- Acheampong MA et al. (2025). *Front Fungal Biol* 6:1660692. [doi:10.3389/ffunb.2025.1660692](https://doi.org/10.3389/ffunb.2025.1660692) ([PMC12415697](https://pmc.ncbi.nlm.nih.gov/articles/PMC12415697/))
- Braga GUL et al. (2001). *Mycol Res* 105:874; *Photochem Photobiol* 73:140; *J Invertebr Pathol* 78:98 (titles from reference lists; not fetched).
- Majchrowska-Safaryan A, Tkaczuk C (2021). *Insects* 12:134. [doi:10.3390/insects12020134](https://doi.org/10.3390/insects12020134) ([PMC7915602](https://pmc.ncbi.nlm.nih.gov/articles/PMC7915602/))
- Lipiec J et al. (2016). *Front Microbiol* 7:1361. [PMC5004331](https://pmc.ncbi.nlm.nih.gov/articles/PMC5004331/)
- Khun KK et al. (2021). *Sci Rep* 11:2188. [doi:10.1038/s41598-021-81647-0](https://doi.org/10.1038/s41598-021-81647-0) ([PMC7838307](https://pmc.ncbi.nlm.nih.gov/articles/PMC7838307/))
- Kesäniemi J et al. (2019). *Sci Rep* 9:7593. [PMC6527551](https://pmc.ncbi.nlm.nih.gov/articles/PMC6527551/)
- Chouvenc T, Su N-Y (2012). *PLoS One* 7:e34484. [PMC3314638](https://pmc.ncbi.nlm.nih.gov/articles/PMC3314638/)
- Loreto RG, Hughes DP (2016). *PLoS One* 11:e0160820. [PMC4986943](https://pmc.ncbi.nlm.nih.gov/articles/PMC4986943/)
- Schär S et al. (2015). *R Soc Open Sci* 2:150474. [PMC4632524](https://pmc.ncbi.nlm.nih.gov/articles/PMC4632524/)
- Diez L, Lejeune P, Detrain C (2014). *Biol Lett* 10:20140306. [PMC4126623](https://pmc.ncbi.nlm.nih.gov/articles/PMC4126623/)
- Leclerc J-B, Pinto Silva J, Detrain C (2018). *R Soc Open Sci* 5:180267. [PMC6083733](https://pmc.ncbi.nlm.nih.gov/articles/PMC6083733/)
- Ontario ant-nest *Metarhizium* study (2018). *J Invertebr Pathol* 156:73–76 (snippet; authors not confirmed).
