# Entrances: how many a colony keeps, and what a digger senses near the surface

*Part of the [research notes](README.md) behind the [vision](vision.md).*

*Research (bead `ja-nzx`). The question: can the game's undiggable crust become a choice an ant makes from what it senses, and can colonies open new entrances? Today the side view's crust (`#crust`, `colony.ts`) forbids digging soil that touches the sky, except at the hole. It was added after bugs, not from biology (PRD §27, §40). The searches were made on 2026-11-08. They reached abstracts, repository pages and summaries, not full texts, so figures are marked **unverified** where only a summary gave them.*

## TL;DR

- **Colonies do keep several entrances, and add them as they grow.** Older, larger harvester colonies have more entrances, with tunnels that all lead into one shared entrance chamber (Gordon 2025). Fire ants forage through underground tunnels that surface at many small exits, and most mounds are joined to others by such tunnels.
- **Entrances open and close.** Harvester ants seal their entrances at night and open them again. One desert ant plugs its rival's entrances, delaying its foraging (Gordon 1988).
- **Soil changes with depth, and diggers respond to some of it.** Soil CO₂ rises with depth (about fivefold from the surface to nest depth in *Pogonomyrmex badius*), but erasing or reversing that gradient did not change how harvester ants built. Leaf-cutting ants prefer digging at low CO₂ and avoid higher levels. They dig faster in moister soil, and they stop about 12 mm short of standing water. Warmth speeds digging. Workers avoid light.
- **Nothing found says what makes a colony open a *new* entrance from inside.** No study here ties any of those cues to breaking through to the surface.
- **The decision for the game:** the crust stays a mechanic for now, and `ja-4h2` (the crust as a sensed choice) is deferred, not built. §4 gives the reasons and what would reopen it.

## 1. How many entrances, and when

- **Desert harvester ants** regulate foraging by encounters in the chamber just inside the entrance. That chamber is a hub that channels ants inside the nest to the entrance. Older, larger colonies have **more nest entrances, with tunnels leading to a single entrance chamber**, which may reduce variability in encounter rates. A colony could instead widen one entrance tunnel, but a wider tunnel gives more turbulent airflow, and drought that dries the soil damages the structure (Gordon 2025, *Ecol. Evol.*, abstract and excerpts; **unverified** beyond them).
- **Fire ants** (*Solenopsis invicta*) forage through subterranean tunnels running out from the mound. The tunnels surface at small foraging exits, (Markin 1975, *J. Kansas Entomol. Soc.* 48:83, reached only as cited by later papers, **unverified**). About 80 % of mounds were joined to at least one other mound by such tunnels (Hays 1986, *J. Econ. Entomol.* 79:637, abstract-level, **unverified**).
- **Leaf-cutting ants** build turrets over their mound's openings. Wind drawing air out of the central tunnels was the main force ventilating a large field nest of *Atta vollenweideri* in summer, and the turrets may reinforce it (Kleineidam, Ernst & Roces 2001). In *Acromyrmex fracticornis*, splitting a nest entrance with artificial beams produced turrets with branched galleries ending in **several openings** (Römer, Cosarinsky & Roces 2020, abstract).
- **Building is steered by a building pheromone.** *Lasius niger* workers add a pheromone to the material they build with. Because it decays, it is unevenly spread over the built surfaces, and this topochemical landscape decides where ants concentrate their building (Khuong et al. 2016, *PNAS*). The pheromone has not been identified.

## 2. What a digger senses underground

| Cue | What was found | Source |
|---|---|---|
| CO₂ | Soil CO₂ rose about fivefold from the surface to nest depth in *P. badius* (flagged as a possible depth template). Venting the soil to erase the gradient, and reversing it, changed neither the architecture nor where workers and brood sat, so CO₂ is not the template (Tschinkel 2013; reversed-gradient result from summaries, **unverified**). *Acromyrmex lundii* workers preferred digging at 1 % CO₂ and avoided 4 %; digging rate was unaffected except at 11 %, while soil removal rose up to 7 % (**unverified**: from abstract and a commentary). | Tschinkel 2004; Tschinkel 2013; Römer et al. 2018 |
| Moisture | *Atta vollenweideri* workers formed and carried clay pellets faster in wetter clay; preference and group digging rate rose with water content, then dropped for very wet material. Digging upward toward standing water, they stopped about 12 mm below the soil–water interface. *Messor ebenius* is reported to dig toward wetter soil (Tohmé 1972, reached only as cited, **unverified**). | Pielström & Roces 2014 |
| Temperature | *Lasius flavus* dug faster at higher temperature (15–30 °C), as fast as their walking sped up, and produced the same overall nest structure (preprint). *Formica podzolica* workers kept warmer excavated deeper nests. | Rathery et al. 2025; Sankovitz & Purcell 2021 |
| Light | *Formica polyctena* and *Camponotus* workers prefer darkness in dark–light choice tests; how strongly depends on task and is partly reversible with experience. | *F. polyctena*: *J. Insect Behav.* 2015; *Camponotus*: Korczyńska & Godzińska 1995; **unverified** details |

So the soil does change with depth, and diggers respond to some of it in choice tests (CO₂ in a leaf-cutter, moisture), but no study shows an ant reading its depth from these gradients, and the harvester ants' CO₂ gradient guided nothing. Light is a cue only once the soil is broken.

## 3. Closing and opening entrances

- **Nightly sealing.** *Pogonomyrmex occidentalis* workers retreat into the nest at night and close the entrances; an ant caught outside stays out until morning (AntWiki, *secondary*). *P. barbatus* workers seal the entrance with gravel and twigs in the evening (Wikipedia, *secondary*).
- **Plugging as competition.** *Novomessor cockerelli* plugs *P. barbatus* nest entrances, an interference competition that delays its rival's foraging (Gordon 1988, *Oecologia* 75:114).

## 4. What the game takes: the decision for `ja-4h2`

**Grounded:**
- Colonies keep several entrances, more as they grow, funnelled into one entrance chamber.
- Entrances are closed and reopened.
- Soil CO₂, moisture and temperature change with depth, and diggers respond to CO₂ (in a leaf-cutter) and to moisture in choice tests. No study shows ants reading depth from them.

**Not grounded:** what makes a colony open a new entrance from inside. No source found ties any cue to breaking through to the surface. Turret openings follow construction, the building pheromone steers where ants build, and Gordon links entrance number to colony size and age. None of these says when a digger chooses to break through.

**The decision (2026-11-08):**
- **The crust stays a mechanic.** Its ban keeps two things the game needs: the walkway never left hanging, and the hole never cut off.
- **`ja-4h2` is deferred, not closed.** Making the crust a sensed choice now would mean inventing the response; the cues exist, but the rule that uses them doesn't.
- **No new row in the vision's sense table yet.** A depth gradient (CO₂, moisture, temperature) is a candidate sense. It needs primary sources showing ants respond to it in the way a behaviour would use, and a behaviour that uses it.

**What would reopen it:**
1. A source on what triggers a new entrance, for example traffic or crowding at the entrance chamber, airflow, or colony size.
2. A behaviour in the game that needs a depth sense anyway, such as chamber placement by moisture or temperature (`ja-k4k.3`). The sense-table row would need its own primary sources first.

**Ideas filed for later** (not part of `ja-4h2`):
- **New entrances that scale with colony size,** converging on one entrance chamber. This is the colony-level pattern Gordon describes, and it belongs to one world's new entrances (`ja-lp4.9`).
- **Closing the entrances at night,** and plugging a rival's (`ja-lsu`). This needs day and night in the game first (`ja-0qs`).

## Sources

- Gordon D. M. (2025). Nest entrance architecture and the regulation of foraging activity in desert harvester ants. *Ecology and Evolution*, doi:10.1002/ece3.72122. [PMC12413562](https://pmc.ncbi.nlm.nih.gov/articles/PMC12413562/) · [NSF PAR](https://par.nsf.gov/servlets/purl/10675488)
- Gordon D. M. (1988). Nest-plugging: interference competition in desert ants (*Novomessor cockerelli* and *Pogonomyrmex barbatus*). *Oecologia* 75:114. [ADS abstract](https://ui.adsabs.harvard.edu/abs/1988Oecol..75..114G/abstract)
- Tschinkel W. R. (2004). The nest architecture of the Florida harvester ant, *Pogonomyrmex badius*. *J. Insect Sci.* 4:21. [PMC528881](https://pmc.ncbi.nlm.nih.gov/articles/PMC528881)
- Tschinkel W. R. (2013). Florida harvester ant nest architecture, nest relocation and soil carbon dioxide gradients. *PLoS ONE*. [PMC3610692](https://pmc.ncbi.nlm.nih.gov/articles/PMC3610692)
- Römer D., Halboth F., Bollazzi M. & Roces F. (2018). Underground nest building: the effect of CO₂ on digging rates, soil transport and choice of a digging site in leaf-cutting ants. *Insectes Sociaux*. [doi:10.1007/s00040-018-0615-x](https://doi.org/10.1007/s00040-018-0615-x); commentary in the same issue: [doi:10.1007/s00040-018-0622-y](https://doi.org/10.1007/s00040-018-0622-y)
- Pielström S. & Roces F. (2014). Soil moisture and excavation behaviour in the Chaco leaf-cutting ant (*Atta vollenweideri*): digging performance and prevention of water inflow into the nest. *PLoS ONE*. [PMC3991694](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3991694/)
- Kleineidam C., Ernst R. & Roces F. (2001). Wind-induced ventilation of the giant nests of the leaf-cutting ant *Atta vollenweideri*. *Naturwissenschaften* 88:301–305. [doi:10.1007/s001140100235](https://dx.doi.org/10.1007/s001140100235)
- Römer D., Cosarinsky M. I. & Roces F. (2020). Selection and spatial arrangement of building materials during the construction of nest turrets by grass-cutting ants. *R. Soc. Open Sci.* 7:201312. [Würzburg repository PDF](https://opus.bibliothek.uni-wuerzburg.de/opus4-wuerzburg/files/23045/rsos.201312.pdf)
- Khuong A. et al. (2016). Stigmergic construction and topochemical information shape ant nest architecture. *PNAS* 113:1303–1308. [PMC4747701](https://pmc.ncbi.nlm.nih.gov/articles/PMC4747701)
- Rathery, Facchini, Halsey & Perna (2025). High environmental temperatures put nest excavation by ants on fast forward: they dig the same nests, faster. bioRxiv preprint (reportedly published in *Insectes Sociaux*, **unverified**). [doi:10.1101/2025.03.24.645078](https://www.biorxiv.org/content/10.1101/2025.03.24.645078.full.pdf)
- Sankovitz M. & Purcell J. (2021). Ant nest architecture is shaped by local adaptation and plastic response to temperature. *Scientific Reports* 11:23053. [s41598-021-02491-w](https://www.nature.com/articles/s41598-021-02491-w.pdf)
- Behavioral reversion and dark–light choice behavior in workers of the red wood ant *Formica polyctena* (2015). *J. Insect Behav.* [PMC4435637](https://pmc.ncbi.nlm.nih.gov/articles/PMC4435637) **unverified** details
- Korczyńska J. & Godzińska E. J. (1995). Dark–light choice in *Camponotus* workers (title not checked). *Acta Neurobiologiae Experimentalis*. [ane.pl](https://ane.pl/index.php/ane/article/download/1080/1080) **unverified**
- Markin G. P. et al. (1975). Foraging tunnels of the red imported fire ant. *J. Kansas Entomol. Soc.* 48:83. Reached only as cited. **unverified**
- Hays (1986). *J. Econ. Entomol.* 79:637 (fire-ant mounds joined by foraging tunnels). [academic.oup.com](https://academic.oup.com/jee/article/79/3/637/2214647) **unverified** (abstract level)
- Tohmé G. (1972), *Messor ebenius* digging toward moisture: reached only as cited in the *L. flavus* manuscript ([IRIS](https://iris.imtlucca.it/bitstream/20.500.11771/36379/1/digging_manuscript_2025_06_27.docx)). **unverified**
- *Pogonomyrmex occidentalis* (AntWiki, *secondary*): [antwiki.org](https://antwiki.org/wiki/Pogonomyrmex_occidentalis). *P. barbatus* evening sealing: [Red harvester ant, Wikipedia](https://en.wikipedia.org/wiki/Red_harvester_ant) (*secondary*)
