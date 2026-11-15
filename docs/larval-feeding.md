# Larval feeding: nurses feed larvae by mouth, and food spreads ant to ant

*Research note for `ja-638i` (fixes `ja-rvli` with `ja-7r7x`; PRD §75). Written 2026-11-15, against code at `693acad`. Read in full: Greenwald, Segre & Feinerman 2015 (PMC, verbatim through the references). Not reached (network allowlist: bio.fsu.edu, antwiki.org, arxiv.org, sciencedirect.com): Cassill & Tschinkel 1995 and 1999, Meurville & LeBoeuf 2021 (review), Greenwald, Baltiansky & Feinerman 2018; their claims come from abstracts, search results or citing papers and are marked **unverified**. Creemers, Billen & Gobin 2003 is known only as cited by Metz et al. 2021.*

The question: how does food get from where a colony keeps it to its larvae, and what limits the rate?

In the game today, larvae are fed only from food lying in their own chamber, by the nurses within two cells (`nestLife`, `FEED_RATE`). Food gets there only as whole units carried by porters, and a porter starts only when an ant exploring within two cells of a stocked store or reception is asked. The porters' targets come from a colony-wide table of every chamber's unmet need (`portView`, `wanted`), a gap in vision.md's table. In `economy.test`'s hour (assay `larvae`, PRD §74), larvae wait for food because it comes out of the store too slowly:
- In the traced seed, all 300+ food lay in one store of 3 cells at a tunnel's end.
- Up to 54 ants were heading for it; at any sample none were at it, so they were queuing on the way.
- Porters delivered 7–30 food a minute against 25–58 owed.
- Bringing more ants to the brood (task reversion) or making larvae beg (`owedBeg`) only lengthened the queue.

## Workers feed larvae from their crops, in small fixed doses, more often when the larva is hungry

- *Solenopsis invicta*: workers feed larvae liquid food by trophallaxis, regurgitating from the crop. Each feeding is the same small increment whatever the larva; the rate of feedings is what varies, rising with the larva's food deprivation. When deprived, larger larvae were fed at higher rates than smaller ones, and larvae of every size took about 8 hours of feeding to be sated (Cassill & Tschinkel 1995, abstract and search summaries; **unverified**). In fourth-instar larvae, the duration of each feeding, the bolus and the swallowing rate were constant, so the long-term allocation of liquid food is set by how often workers feed (a later paper by the same group, as summarised in search results; **unverified**). The feeding rate rose with deprivation time (Cassill & Tschinkel 1999, as cited by Metz et al. 2021).
- Larvae beg: *Myrmica rubra* larvae show begging behaviour (Creemers, Billen & Gobin 2003, as cited by Metz et al. 2021; **unverified**). The game already has larvae begging by touch below `BEG_BELOW` (ja-xu6.1).
- Older larvae of many species also take solid food, and seed harvesters store seeds deep and carry them down to the brood (docs/nest-and-home.md, "Food goes in at the top and is stored deep"). Young larvae of many species are fed liquid only, by nurse–larva trophallaxis (a pharaoh-ant preprint, as summarised in search results; **unverified**).

**In the game:** a nurse beside a hungry or growing larva feeds it a small fixed bolus from its own crop, more often the more the larva begs. Larvae no longer depend only on whole units lying in their chamber, so food reaches them as fast as nurses with full crops come by.

## Food spreads mouth to mouth through the nest within an hour

- *Camponotus sanctus* (a queen and 50 workers, starved six weeks; 1,007 trophallaxis events recorded): food brought in by foragers spread through the colony by trophallaxis; "food dissemination is essentially over in less than an hour". Foragers made 13.7 ± 1.2 trips and unloaded 49.8 % ± 4.2 % of their crop per nest visit (N = 30 visits); a full crop held 5.6 ± 0.3 mg. The flow network was hierarchical, "containing no closed loops"; some inner workers filled their crops and kept the food, others "both gain and distribute food", relaying it on. Foragers had more partners than other workers (31 ± 1 against 21 ± 1). Greenwald, Segre & Feinerman 2015, read in full.
- That paper measured sugar water in crops only. It did not follow food to the brood ("larvae require a protein-rich diet, whereas workers ingest mainly carbohydrates"), and it did not measure food kept outside crops.

**In the game:** each ant gets a crop (a little food, separate from its own energy). It fills from food lying in a store or reception within reach, and passes food by contact to a nestmate whose crop is emptier and who feels more need. Food then flows down the felt-need gradient that begging larvae already make, to the nurses beside them, without every carrier having to reach the store and the brood chamber in turn. Porters with whole units stay as they are.

## What was not found

- Crop capacity in the game's units, or the bolus size and feeding rate in any species, from a paper read in full.
- Whether workers feed larvae by contact in response to begging, or patrol and feed every larva they pass; the fire-ant summaries say the rate tracks the larva's hunger.
- How seed harvesters (the game's stores) get seed to the larvae: by carrying seeds to the brood, or by workers eating and regurgitating.

## The mechanic

Behind one setting whose 0 is the old game bit for bit (`cropFeed`; on at 0.1 since ja-638i.3, the owner's pick from the crop sweep in PRD §75). These are body and steering rules with no situation field, so there is **no Jev cost**.

- **Crop:** `crop`, per ant, in food units, up to `CROP_MAX` (**design**, about a third of a unit).
- **Filling:** an ant underground within two cells of a stocked store or reception tops its crop up from that chamber's food. Today's limit is the store's 3 cells; ants in that queue now leave with crops full.
- **Passing (trophallaxis):** an ant whose crop is fuller gives part of it to a touching nestmate with an emptier crop and more felt need. The share given is a **design** number; the paper measured about half a forager's crop per nest visit.
- **Feeding larvae:** a nurse with food in its crop, beside a larva that begs or is still owed growth food, feeds it a bolus `BOLUS` at a rate that rises with the larva's beg (**design**, after Cassill & Tschinkel's fixed bolus and rate that follows hunger). The bolus goes to the larva's energy, then its growth, as chamber food does now.
- **Reads:** what an ant touches and its own crop. Nothing reads the chamber table. Porters and `wanted` are left as they are; retiring them is a later step that would strike part of the vision gap row.

**Assay:** `larvae` (ja-7r7x.1), seeds 1–16. Target: no seed above 8 larvae waiting, no worker starved, food stored not worse. Then the same with `forageDig: 120` for ja-16rp.5, and the two-colony game for fight losses.

## Play

- **What the player sees:** food passing ant to ant in the nest, nurses at the brood, larvae growing on time. A crop could show as a tint on the ant. The Learn drawer can say: "nurses feed the larvae from their crops; food passes mouth to mouth from the stores".
- **Choices it makes matter:** the fungus. Trophallaxis is a known route for social immunity and for pathogens; the existing fungus levers (hunger, spread by contact) gain a route through crops. Any new fungus lever on it is later work.
- **Progression:** unchanged early. It matters once a colony has more brood than its porters can serve, in long games and after the foraging dig is on (ja-16rp.5).
- **Cost:** none in Jev. CPU: a pass over touching pairs underground each tick, like the existing sharing by mouth (`donors`).
- **Risks to play:**
  - Food hoarded in crops instead of stored. The guard is food stored.
  - Larvae fed so well that brood booms, and colonies hit their cap and raid sooner (ja-ccej's mechanism). The guard is fight losses in the two-colony game.
  - Invisible flows. The tint and the Learn entry are there to show them.

## Open questions

- **The owner's calls:** `CROP_MAX`, the share passed per contact and `BOLUS`, all **design**; whether the porter table (`wanted`) is retired once crops carry the brood's food.
- **Still to measure:** whether crops clear the store queue on assay `larvae`, alone and with task reversion.
- **Still to read:** Cassill & Tschinkel 1995 and 1999 in full, Meurville & LeBoeuf 2021 (the review), Greenwald et al. 2018 on crop loads; all are on hosts this session can't reach.

## Sources

- Greenwald E, Segre E, Feinerman O (2015). Ant trophallactic networks: simultaneous measurement of interaction patterns and food dissemination. *Sci Rep* 5:12496. [PMC4519732](https://pmc.ncbi.nlm.nih.gov/articles/PMC4519732/)
- Cassill DL, Tschinkel WR (1995). Allocation of liquid food to larvae via trophallaxis in colonies of the fire ant, *Solenopsis invicta*. *Anim Behav* 50:801–813. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/0003347295801405) (abstract only; **unverified**)
- Cassill DL, Tschinkel WR (1999). Effects of colony-level attributes on larval feeding in the fire ant, *Solenopsis invicta*. *Insectes Soc* 46:261–266. (as cited by Metz et al. 2021; **unverified**)
- Creemers B, Billen J, Gobin B (2003). Larval begging behaviour in the ant *Myrmica rubra*. *Ethol Ecol Evol* 15:261–272. (as cited by Metz et al. 2021; **unverified**)
- Metz BN, Chakrabarti P, Sagili RR (2021). Honey bee nursing responses to cuticular cues emanating from short-term changes in larval rearing environment. *J Insect Sci* 21(6):7. [PMC8559155](https://pmc.ncbi.nlm.nih.gov/articles/PMC8559155/) (honey bees; read for its citations)
- Meurville M-P, LeBoeuf AC (2021). Trophallaxis: the functions and evolution of social fluid exchange in ant colonies. *Myrmecol News* 31:1–30. [doi:10.25849/myrmecol.news_031:001](https://doi.org/10.25849/myrmecol.news_031:001) (not reached)
