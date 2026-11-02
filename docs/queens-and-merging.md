# Several queens, adoption, and orphans merging

Design note for MR 8 (species framework, `ja-8fd`) and MR 10 (lifetime layer, `ja-1vg`). Nest slice 9 (`ja-wjw`): docs only, nothing here is built. An agent review checked every claim about the code against it; §3's "needs" lists come from that. It picks up where docs/nest-and-home.md §3 leaves queen loss: "Several queens, adopting queens and pleometrosis are per-species options", and "an orphaned colony merging into a neighbour it tolerates is a unification route grounded in biology".

## 1. Where the sim is now

The nest slices built these:
- **One queen per colony** (slice 4, PRD §33): `Colony.queen`, in the royal chamber, laying while the larder holds. In the side view, workers come only from brood. The top-down maps have no queen and keep "food makes ants". Note: `queen !== null` is the side-view flag in about 20 places.
- **Orphaned:** the queen is dead. There are no new eggs, brood in progress finishes, workers age out (`LIFESPAN`), and the colony dwindles. Orphaned is a state, not an ending. *Beaten* is no workers and no brood that can still finish (`Game.beaten`).
- **How a queen dies:**
  - a raider at her side, now that raids reach the other nest (slice 7, PRD §36);
  - the fungus's `crown` (slice 8, PRD §37): Bloom only, lethal, off the menu by default.
- **Unity** (`Game.unity`): the two nests' odours within tolerance, a quiet minute without fight deaths, and neither colony beaten. Garden gets there by blending odours (PRD §22, §29, §37).

There is no nuptial flight, no queen besides the founding one, and no way for workers to change colony.

## 2. What ants do

**One queen or several.**
- Many species have one queen (monogyny). *Lasius niger* founds with several queens at once (pleometrosis), but they fight once the first workers emerge, until one is left.
- Other species keep several queens (polygyny). In the fire ant *Solenopsis invicta*, whether a colony accepts more queens is decided by its **workers**, not the queens:
  - colonies whose workers carry the *b* allele of *Gp-9* (the *Sb* supergene) accept extra queens;
  - colonies with only *BB* workers kill them;
  - a fairly small share of *b* workers is enough (Ross & Keller 1998; Gotzek & Ross 2008).
- Polygyne species often also adopt mated queens back into the nest. The Pharaoh ant goes further and founds new nests by budding: queens and workers walk off together.

**Losing the queen.**
- Orphaned workers of many species lay unfertilised eggs, which become males:
  - *Temnothorax*, where orphaned colonies lived for years producing males;
  - reportedly *Pogonomyrmex badius* (majors more than minors), and rarely *Atta*, where the workers may die before their sons are raised. These two are provisional: see Sources.
- In most species an orphan makes no more workers: it ends, and its last throw is males. The exceptions are thelytokous species, whose workers lay eggs that become workers: *Pristomyrmex punctatus*, and *Cataglyphis cursor* (relevant to the desert ant species in MR 8). For them, orphaning is not an ending.

**Merging.**
- Queenless colonies of an African army ant (*Dorylus molestus*, Mount Kenya) often fuse with a neighbour: 7 of 10 experimentally orphaned colonies did (Kronauer et al. 2010).
- The orphan's workers kept their own odour until the fusion. Then the odour quickly shifted to a mixed one, consistent with the host accepting the strangers.
- Schneirla saw the same around 1950 in the Neotropical *Eciton*: queenless colonies trace and join foreign colonies, while colonies with a queen do not mingle (anecdotal accounts, cited by Kronauer et al.).
- Fusion also happens where nest sites are scarce (*Pristomyrmex punctatus*).

**Supercolonies.**
- Where a colony population loses the variation in its recognition cues, nests stop fighting each other. Introduced Argentine ants in California are the classic case (Tsutsui et al. 2000). The idea of one statewide supercolony has been disputed since.
- This is the sim's Garden ending in nature: nests that smell alike and so stop fighting.

## 3. Proposal

### 3.1 Queens become a list
- `Colony.queen` becomes `queens: Queen[]`. Each queen lays at today's rate, and the lay check reads the colony's total.
- **Orphaned** means every queen is dead. `crown`, a raider at her side and the banner all act per queen.
- **Royal chambers:** one per queen. Slice 3's royal mark is laid by each, so road signs lead a nurse to the nearest.
- **Species trait** (MR 8's `species.ts`): `queens: "one" | "several"`. Wave 1, as `ja-8fd` lists it:

  | Species | Queens | Notes |
  |---|---|---|
  | garden ant (*L. niger*) | one | pleometrosis is a founding detail, out of scope until the lifetime layer |
  | fire ant | one or several | the polygyne form is a per-colony flag: `accepts` |
  | Pharaoh ant | several | budding as well |
  | desert ant (*Cataglyphis*) | one | |

- A one-queen colony behaves exactly as now, so every slice 4–8 number reproduces.
- **Watch for:**
  - `queen !== null` is the side-view flag in about 20 places. Replace it with an explicit side-view flag first, so an empty or all-dead `queens` never flips a colony into top-down behaviour.
  - Food for the queen goes to the first royal chamber (`find`). Feeding has to pick a queen, and role assignment has to make more than one royal chamber.

### 3.2 Adoption
- A queen is adopted when **(a)** the colony accepts queens (species `several`, or the fire ant's polygyne flag), and **(b)** her odour is within the colony's tolerance of its nest odour. That is the same test the ants already use for strangers (Recognition), so Garden makes more queens acceptable.
- Today, adoption's only source is a merger (§3.3). With the lifetime layer (`ja-1vg`), mated queens from nuptial flights land and seek a nest, and polygyne colonies adopt them.

### 3.3 Orphans merging: a unification route
An orphaned colony's workers join a neighbour that they tolerate and that tolerates them.

**When.** An orphaned colony's forager meets a living ant of another colony, and each smells within the other's tolerance. This is a new, mutual check. The fungus's `allied` contact is not enough: it is computed only for infected hosts, and only one way. Gate it on calm too: the host isn't raiding, and there have been no fight deaths nearby (army ants fuse when calm). Then that forager **defects**:
- it walks to the other colony's hole and goes in;
- on arrival it changes colony.

Workers of a colony that still has a queen never defect.

**Walking there.** Homing (`#entrance`, `#holeX`, `#chamberGoal`, road signs) only knows the ant's own nest. The one cross-nest walk is the raid path (`raidTarget`, `raidNest`, PRD §36). A defector reuses it with a per-ant target, which also points toward MR 8's N colonies: there `raidTarget`, `raidNest` and `foreign` become per-colony lists, not `1 − k`.

**Following.** Orphan ants read only their own colony's field; the host's trail (`foreign`) is read only by fungus-bent ants. So "trace and join" needs a defector to lay its *orphan* colony's trail toward the host while it walks: its nestmates follow their own field to the host's hole.

**How an ant changes colony.** The colony arrays are fixed-size, so a defector becomes a new ant in the host. Today's API doesn't do this; it needs a new pair of methods:
- `host.adopt(from)`: place an ant copying age, lifespan, load, strain and resistance, return its slot (or −1), and count it as an arrival, not a birth. `spawn()` returns a boolean, resets all of these and counts a birth.
- `orphan.leave(i)`: remove the ant with no corpse and no loss. `kill()` always leaves a corpse in the side view, drops carried food, and stocks a porter's food. A carried item goes with the ant instead.
- **The cap:** host arrays hold `maxAnts` (1.5 × the starting count). A defector that finds no slot stays behind. Measure how many fit, and consider raising the host's cap by the orphan's count.

**Odour.** Recognition sets every ant's odour outright each step, as its nest odour plus its fungal share (recognition.ts). There is no per-ant blending; contact blending was tried and dropped. So a defector takes the host's odour at the next step that runs. Then the host's nest gestalt drifts a little toward any of the orphan's odour it brings into the royal chambers. That gestalt drift is the sim's version of the mixed odour Kronauer et al. measured, and is enough.

**Brood.** The orphan's nurses carry pupae and fed larvae across. This needs `Brood` items moved between colonies' lists with the chamber counts fixed. Today a dying or leaving nurse drops its brood into its *own* colony's list (`#dropBrood`), where pupae would later hatch as the orphan's ants and keep `Game.beaten(orphan)` false. Brood the orphan leaves behind finishes as now.

**Chambers.** The orphan's chambers become the host's (`chamber.colony` reassigned, with `floorOf` moved too). This is polydomy: one colony, two holes. It needs `Colony` to have more than one entrance, and the fungus's tunnel ownership (nearest hole) to know a colony's holes. That is the larger change here. A first cut leaves the old nest empty and lets it decay.

**The ending.** Today a merged-away orphan would read as *beaten*: `outcome()` checks `fallen()` first, and `unity()` requires neither colony beaten. The rule:
- Each colony counts its defectors. A colony is **merged** when it is beaten and at least half of the workers it had at orphaning defected. Otherwise, when it dies out of age or fights, it **fell**.
- `outcome()` returns `"merged"`, a new `Outcome` value, ahead of `fallen()`. The UI shows it as a unification.
- `unity()` is unchanged. It is about two living colonies; a merger ends the game before unity is needed.
- The chronicle (MR 10) records which colony absorbed which.

### 3.4 The fungus play
This makes the speculative route in docs/nest-and-home.md concrete, as a two-strain play: Bloom's `crown` orphans the rival, and Garden makes the two colonies tolerate each other, so the orphan's workers defect instead of fighting.
- It is lethal (crown) and strain-gated.
- It needs both strains in one game. The fungus already runs several strains side by side.
- The fungus policy needs no new situation: `allied` contact already tells an infected host that colonies are coming together (one way; the defection check itself is separate, §3.3).

### 3.5 Worker-laid males (lifetime layer only)
An orphaned colony's workers lay male eggs. Males don't work and leave on the next nuptial flight, so within one game they change nothing. They belong with flights and lineage in `ja-1vg`: an orphan's last contribution to the next generation.

## 4. Jev cost
- **Foragers:** no new field. Defection is a local rule with its own tolerance check, like nursing and undertaking.
- **Strategist:** `stanceSituation` could gain `orphaned` (yes/no). Stances are cached by situation, so this doubles the distinct stance situations that can be asked, not the calls. Each is one small request; measure it when built: `npm run colony-cost`.
- **Fungus lane:** unchanged.

## 5. What to measure when built
- **Several queens:** growth over 600 s against one queen (PRD §33's curve), and orphaning time under crown with one queen against two.
- **Merging:** with Garden on both colonies and crown on one, the time from orphaning to the last defector, and the share of the orphan's workers that arrive (the rest die on the way or of age). The host's population against no merger.
- **Unity:** how often a game ends merged rather than fallen, with the merge rule on and off.

## 6. Follow-up beads
- `ja-8fd.1`: several queens per colony (§3.1).
- `ja-8fd.2`: orphans merging (§3.3–3.4).
- `ja-1vg.1`: queen adoption, once nuptial flights exist (§3.2).
- `ja-1vg.2`: worker-laid males (§3.5).
- `ja-yif.2` (crown's timing, PRD §37) matters here too: the merging play starts with an orphaning.

## 7. Open questions
- **Should a defector be accepted when it is within tolerance but the host is fighting?** Army ants fuse only when the colonies are calm. Gate it on the host's stance not being raid.
- **Polydomy or abandonment?** Taking over the orphan's chambers is truer to *Pristomyrmex* and supercolonies, but needs several entrances per colony. Abandoning them is simpler and keeps every homing number.
- **Does a merged colony keep the orphan's midden?** Probably not: middens are rebuilt by use.
- **Can a colony with a queen absorb a beaten one's last brood?** Raiders already carry off nothing. Brood raiding (slave-making species) is a separate species trait, not this note.

## Sources
- Kronauer, Schöning, d'Ettorre & Boomsma (2010). Colony fusion and worker reproduction after queen loss in army ants. *Proc. R. Soc. B* 277: 755–763 (*Dorylus molestus*, Kenya; cites Schneirla's *Eciton* accounts). <https://pmc.ncbi.nlm.nih.gov/articles/PMC2842746>
- Ross & Keller (1998). Genetic control of social organization in an ant. *PNAS*. <https://pmc.ncbi.nlm.nih.gov/articles/PMC24356>
- Gotzek & Ross (2008). Experimental conversion of colony social organization by manipulation of worker genotype composition in fire ants. *J. Insect Behav.* <https://ent.uga.edu/content/dam/caes-subsite/entomology/documents/publications/ross-publications/32-Gotzek%26RossJInsectBehav2008.pdf>
- Tsutsui, Suarez, Holway & Case (2000). Reduced genetic variation and the success of an invasive species. *PNAS* 97: 5948–5953. <https://pmc.ncbi.nlm.nih.gov/articles/PMC18539>
- Colony fusion in a parthenogenetic ant, *Pristomyrmex punctatus*. *J. Insect Sci.* 13: 38 (2013). <https://bioone.org/journals/journal-of-insect-science/volume-13/issue-38/031.013.3801/Colony-Fusion-in-a-Parthenogenetic-Ant-Pristomyrmex-punctatus/10.1673/031.013.3801.full>
- *L. niger* queens fight after the first workers emerge: a 2020 study of pleometrosis in this species. <https://pmc.ncbi.nlm.nih.gov/articles/PMC7419493>
- Worker reproduction in orphaned colonies: e.g. a long-term *Temnothorax* study, <https://pmc.ncbi.nlm.nih.gov/articles/PMC7882922>. The *Pogonomyrmex badius* and *Atta* findings are from the same literature search and still to be pinned to papers before this note is built on.
