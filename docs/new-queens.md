# New queens: when a colony rears them, how they found, and where the fungus comes in

*Part of the [research notes](README.md) behind the [vision](vision.md).*

*Research and design note, 2026-11-07, for the fungus game (bead epic `ja-lo8`, slice 1 `ja-lo8.1`). **Built since:** the queen as a host and her signal lever (`ja-lo8.7`); her scent carried on the workers, gyne rearing and culling, the alate, the queen's pen and founding with a daughter's odour drift (`ja-lo8.9`, PRD §50.19, `web/src/colony/royal.ts`); balance: one gyne at a time per brood pile, nanitics who forage at once, daughters dug apart (`ja-lo8.10`, PRD §50.21). As first written, docs only. The game needs:*
- *new queens to be born,*
- *each to found a daughter colony,*
- *the fungus to have a lever on when that happens.*

*Biology comes from primary papers and reviews found by web search. Most full texts could not be opened: figures read from an abstract or a citing page are marked **unverified**, and anything that is the game's own invention is marked **design**. Code references are to `web/src/colony/` at commit `be29ff2`. Picks up from [queens-and-merging](queens-and-merging.md), which covers several queens, adoption and orphans merging.*

## TL;DR

- **A colony rears queens (gynes) once it is large and established.**
  - In the black garden ant that takes years and thousands of workers.
  - In the fire ant, the share of production going to sexuals jumps between about 20,000 and 50,000 workers.
- **The mated queen holds queen-rearing back with pheromone, in two ways:**
  - **through her daughters:** workers that sense her pheromone kill sexual larvae, and stop killing them when she is gone;
  - **on the virgin queens themselves:** her pheromone keeps them from shedding their wings and laying.

  Take the queen away, or dilute her signal over a large nest, and gynes are reared.
- **The game rule follows that, on cues a nurse senses:**
  - a well-fed larva in a chamber where the **queen's mark is faint** becomes a gyne;
  - where it is strong, nurses cull gyne larvae.

  The mark already exists (`QUEEN_MARK`, laid in `#nestLife`).
- **The fungus has two levers on it, and both are design:**
  - **Emission, in the queen:** it turns down her *queen signal*.
  - **Perception, in the nurses:** it turns down the *queen scent* they perceive.

  The second works before the queen is infected. The default is to build both and let the aim decide which Jev pulls (§4).
- **A gyne leaves on a nuptial flight and founds alone** (claustral founding): she sheds her wings, digs a chamber, and raises a first brood of small workers on her own body reserves.
- **She carries the fungus out by contact,** walking through an infected nest. No vertical transmission (mother to egg) is claimed; none is shown for fungi.

## 1. When a colony rears new queens

**Size and age.**
- *Lasius niger*: colonies produce queens and males "after several years, once well established", at a few thousand workers (Wikipedia, *secondary*; typical colonies hold 4,000–7,000 workers). Hobbyists report alates in a colony's first year, which is anecdotal.
- *Solenopsis invicta*: across one annual cycle, the share of production invested in sexuals rose sharply in colonies between 20,000 and 50,000 workers, then held near a third. Sexual production peaked in spring at about half of daily output (Tschinkel 1993).
- Removing workers from mature fire-ant colonies lowered sexual production and raised worker production (Vargo 1988, cited in a review table; **unverified**).
- So queen production follows size. The question for a sim that does not count its workers is which cue a colony uses to know it is large. §2 gives the answer the literature supports: the queen's signal, diluted.

**Season.**
- Sexual production is seasonal in the field: spring for *S. invicta* (Tschinkel 1993), late summer flights for *L. niger*.
- Argentine-ant units of overwintered workers and brood produced more female sexuals, sooner, than units collected at other times (Vargo & Passera, a French-language paper read through its abstract; **unverified** detail).
- The sim has no seasons yet (`ja-1vg`), so season is left out.

**Nutrition.**
- Caste is not fixed at the egg in most ants studied: larvae are bipotent early.
- In *Aphaenogaster senilis*, larvae stay bipotent until the second instar, and workers could steer caste by feeding and by moving larvae along temperature gradients. Rearing temperature had no effect there, but orphaning did (Boulay et al. 2009).
- Across social insects, well-fed larvae become queens (bumblebees: larval food decides size and caste).

**In the game:** a colony knows it is large by what a nurse senses, not by counting its workers. The cue is the queen's mark perceived faint where the brood lies (§2); a well-fed larva in a chamber with food is the one that can become a gyne (§5). Season is left out until the sim has one (`ja-1vg`). The worker counts above are not read. **Design:** the threshold (`GYNE_MARK`) and what "fed" means. Not on `main` yet (`ja-lo8.9`); PRD §50 adopts the rule.

## 2. The queen holds it back

**Through the workers: gyne larvae are killed while she is there.**
- *S. invicta*: sexual larvae mostly survived in queenless colonies, and were mostly killed in colonies with a single dealate queen, fertilised or not. Adding fresh queen corpses to queenless colonies also got the larvae killed. The active signal was extracted in buffer but not in acetone, so it is probably proteinaceous (Klobuchar & Deslippe 2002).
- Argentine ant: adding queen corpses to queenless fragments stopped gyne production and led workers to execute gyne larvae (Vargo & Passera; **unverified** detail).
- A 2023 review of ant queen pheromones lists among their functions "inhibiting larval sexual development, through worker behaviours". The chemical basis is not yet shown for every function it lists.

**On the virgin queens.**
- In *S. invicta* the mated queen suppresses wing-shedding (dealation) and egg-laying in virgin queens, through a primer pheromone the workers spread (Fletcher & Blum 1981). It acts through juvenile hormone: it suppresses the corpora allata in virgin alates (Brent & Vargo 2003).
- After the queen dies, surviving virgins keep their wings, and workers tend the ones that give off reproductive signals. Being unmated, they cannot rebuild the workforce (WurmLab summary, *secondary*).

**When the queen is lost.**
- *A. senilis*, a monogynous ant, rears replacement queens from bipotent larvae when the queen disappears. Newly mated queens inhibited queen-rearing more strongly than virgin ones (Boulay et al. 2009).
- Argentine-ant units with a functional mated queen never produced sexuals, but nearly all did after the queen was removed in spring (Vargo & Passera).

**Reading for the game.**
- **The workers decide, by sensing the queen.** A nurse that perceives her pheromone culls a gyne larva; a nurse that does not, rears it.
- **The trigger is local.** The signal reaches only so far, and a big nest with brood chambers far from the royal chamber has corners where it is faint. That is a sensed proxy for "the colony is large", and it is how the sim should know size.
- **The vision allows it.** It lets "a queen's output" and caste stay physiology, as long as the inputs are sensed ([vision](vision.md#the-goal)).

**In the game** (`ja-lo8.9`, PRD §50.19, `royal.ts`): the cue is the queen's scent as the ants carry it. Her royal mark lies on her chamber's floor and doesn't spread, so the ants that touch her take up her supply, share it with the nestmates they touch, and it fades: a big colony carries less of it an ant. Nurses perceive it (× the *queen scent* lever) within two cells of a larva. The response: a young (bipotent), well-fed larva with food in its chamber, whose nurses all perceive it below `GYNE_MARK` for a few seconds, is reared as a gyne; a gyne larva by a nurse perceiving it at `CULL_MARK` or more for `CULL_CUE` seconds is culled (the execution above). The queen's hold on virgin queens (dealation, laying) is not modelled: a gyne leaves through the hole (§5). **Design:** the thresholds, the two-cell reach, the cue times and the scent's rates.

## 3. The flight and founding

**Claustral founding** is the common mode in Formicinae, Dolichoderinae and Myrmicinae, which together hold about 80 % of known species (AntWiki, *secondary*):
- The mated queen sheds her wings, digs a small chamber, seals herself in, and raises her first brood without foraging, on her body reserves.
- Wing shedding and flight-muscle breakdown are hormonal. Allatectomised queens did neither, and juvenile hormone restored both (Barker 1979, as cited by AntWiki; **unverified**).
- In *Lasius japonicus* the broken-down flight muscle gives way to an expanded "thoracic crop". The founding queen feeds her larvae from weeks 2–5, and the first worker emerges in week 6 (Kurihara et al. 2022).
- The first workers are few and small: **nanitics** (minims). In *L. niger*, about 75 workers mark the shift to normal-sized ones (Wikipedia, *secondary*).

**What the game takes.**
- A gyne leaves through the hole and flies. The sim has no air, so the flight is a jump to a landing site within a radius.
- She founds a new colony there: a founding chamber, a first clutch raised on a fixed reserve (no larder needed), then the ordinary economy (nest slice 4).
- The daughter starts at her mother's odour (kin), as she was raised in that nest.
- **Not modelled:** males and mating.
- **Most founding queens fail in nature.** In the game a queen lands at the nearest spot the founding rule allows within her flight. Once the world is one surface and a curtain, a new nest goes only beyond an end of the line; when no such spot lies within her flight, she dies and the game says why ([one-world §3](one-world.md#3-the-line-and-where-a-new-nest-may-go)).

**In the game:** a gyne walks out through the nest and flies, a jump to a landing site within a radius, since the sim has no air. She founds at her mother's odour, so the daughter is kin and her mother does not raid her (`Game.addColony`, PRD §50.8). A queen carrying the evolving fungus roots a mycelium by her new hole, so a founded colony gets what the first one had (PRD §50.13). In one world (built in U4a, 2026-11-10) she flies 140 cells from her mother's hole in a direction drawn from the game's stream (`FLIGHT_2D`), and lands at the nearest spot the founding rule allows within 140 cells of there (`FOUND_RADIUS`); where none lies within it, she dies and the game says why: "no room beyond the line's ends within her flight" (`Game.lastLoss`; [one-world §3](one-world.md#3-the-line-and-where-a-new-nest-may-go), PRD §51). **Design:** the jump, its radius (research bead `ja-lp4.7`) and the founding clutch raised on a fixed reserve. Males and mating are not modelled.

## 4. Where the fungus comes in

**How the new queen gets the fungus.**
- She walks out through her mother's nest and passes infected workers, so she picks the fungus up by contact, the same transmission as any ant (`Fungus.step`).
- **No vertical transmission is claimed.** There is no evidence that an entomopathogenic fungus passes from a queen to her eggs.
  - The known vertical symbiont of ants is a bacterium (*Wolbachia*).
  - In *Crematogaster scutellaris*, what passed from parents to offspring after *Metarhizium* exposure was enhanced **resistance**, not the fungus.
  - Founding *Formica selysi* queens were *attracted* to soil contaminated with *Beauveria* and *Metarhizium*.
  - Paired *L. niger* foundresses showed no social immunity against *Metarhizium* (Pull & Cremer 2017).

**The lever on queen birth: two routes, both design.** No paper shows a fungus doing either.

| Route | Kind | What the fungus does | Where | Basis it borrows |
|---|---|---|---|---|
| Queen signal | **emission** | turns down the queen pheromone its host gives off | in the queen | parasites change what a host emits (*Rickia*'s n‑C23; *Ophiocordyceps* weakening communication; [fungus-policy §3](fungus-policy.md#3-what-real-parasites-do-to-ants)) |
| Queen scent | **perception** | turns down how strongly its host perceives the queen's mark | in nurses | parasites change what a host perceives (the same section) |

- The **emission** route needs the queen infected, and it acts colony-wide: the mark is faint everywhere.
- The **perception** route works from the first nurse infected, and only where the fungus is: nurses that carry it spare gyne larvae where healthy nurses would cull them. It is the subtler route, and the one a player can reach first.
- **Build both** as levers in the fungus's catalogue ([fungus-policy §11](fungus-policy.md#11-what-the-fungus-senses-inside-an-ant-and-its-levers)). The aim decides which Jev pulls: "make the colony raise a new queen" can be met by either, and a careful player can ask for the queen to be left alone.

**Why queen birth matters to the player.** The game's rule (owner, 2026-11-06):
- A colony's policy is hidden until the fungus is in its queen.
- After that, the policy changes **only when a new queen is born**, and the new words drive **only her offspring**, in the colony she founds.

So the fungus's levers on queen-rearing are the player's only route to rewriting how ants behave. Both routes are built as player-reachable levers.

**In the game:** a new queen picks up the fungus by contact on her way out, as any ant does (`Fungus.step`); there is no vertical transmission (PRD §50). The fungus has two levers on gyne rearing. *Queen signal* (emission, in the queen) multiplies the mark she lays, `QUEEN_MARK` × 0.1 / 0.4 / 1 / 1.5 / 2, lerped by her load; it is built (`levers.ts`, PRD §50.7) and held by the Royal upgrade. *Queen scent* (perception, in nurses) scales the scent a nurse perceives, × 0.1 / 0.3 / 1 / 1.5 / 2 (`levers.ts`, `ja-lo8.9`, PRD §50.19); it works before the queen is reached, and the Royal upgrade holds it with *queen signal*. A colony's policy changes only when a new queen is born, and the new words drive only her daughter colony (PRD §50). **Design:** both levers; no paper shows a fungus doing either.

## 5. What the sim needs (slices 7–9 of the epic)

1. **The queen as a host.**
   - `Colony.queen` gains `load` and `resist`, and her attendants infect her by contact.
   - Her queen-signal lever scales `QUEEN_MARK`.
2. **Queen scent as a perceived reading.** The royal mark at a nurse's cell, times its `queenScent` gain. The young already steer by the queen's exact position (`ja-k4k.2`); reading the mark as a sense moves that toward the vision too.
3. **Gyne rearing in `#nestLife`.** A larva gains a caste:
   - **Becomes a gyne:** fed, in a chamber with food, and the mark perceived by the nurses within two cells is below `GYNE_MARK`.
   - **Culled:** a gyne larva beside a nurse who perceives a strong mark is culled, at a rate (the execution of §2).
   - **Cost:** a gyne needs more food and time than a worker.
4. **The alate.** She walks out through the nest (picking up the fungus), then flies to a landing site.
5. **Founding.** `Game.addColony` at the landing site: several colonies at runtime, `ja-8fd.3`.
6. **To measure** (assay `lifecycle`):
   - the time to the first gyne with no fungus (dilution alone), with the queen-signal lever, and with the queen-scent lever;
   - how many gyne larvae are culled;
   - the time from landing to the daughter's first forager.

## Play

PRD §50 makes queen birth the game's middle: chapters 5 and 6 ("a new queen", "her colony", §50.4). Built: the queen as a host with *queen signal* (§50.7), founding at runtime (§50.8, §50.13), and gyne rearing, the flight, the queen's pen and daughters that drift (`ja-lo8.9`, §50.19).
- **See:** the top bar's goal reads "Make the … colony raise a new queen". A winged queen (an alate, pale wings) walking out through the hole; the game pauses for the queen's pen when she flies carrying the fungus; then a new hole with its own colour and nest button (Jade, Rust …, §50.8). Learn has no gyne entry yet; "What the fungus senses, and its levers" cites §4 here.
- **Choose:** *queen signal* in an infected queen, held by the Royal upgrade (1,000 then 4,000 mutations, side view only; `evolution.ts`), and *queen scent* in nurses, held by the same upgrade. The aim's words decide which Jev pulls. At the birth the player rewrites the daughter's policy, the game's only route to changing how ants behave (§50).
- **Counterplay and progression:** healthy nurses that read a strong mark cull gyne larvae, and the queen's eight groomers in the evolving game clear her (§50.12, `ja-k4k.12`). It sits late on the slope: the fungus first reaches a queen at 182–314 s (§50.14), and Royal is among the dearest upgrades. Queen births may stay rare (§50).
- **Cost:** a queen is asked only her two levers, *fungus showing* and *queen signal*. Re-shipping answers with the queen task cost $0.0083 for 93 situations per preset aim (§50.7); the fungus lane runs at about 708 real tokens per situation (§50.9). *Queen scent* adds a score to every worker's question in the side view: re-shipping cost $0.0126 for 390 answers, and the lane runs at about 770 real tokens per situation, $0.003–0.005 a 5-minute game (§50.19). Gyne rearing and founding are local rules and cost nothing. A daughter on new words asks her doctrine's situations once, then plays them cached (§50.11).
- **Risks:** a cliff: *queen signal* acts colony-wide, and damping it made nearly every young larva a gyne at once (28–69 in 30 minutes); nurses now rear no second gyne beside gyne brood, which leaves 3–6.5 (median; §50.21), though daughters still fill the cap under a lever held all sitting. Runaway: each daughter carries a mycelium of its own (§50.13), and two patches hold twice as much, so mutations come faster with every founding. Famine: a gyne costs more food, and larvae already starve beside a full larder (`ja-xu6`, §50.5). The `lifecycle` assay (§5) is what would show each: time to the first gyne, gynes culled, landing to first forager.
- **Owner decisions needed:** none new. §50 settled the two levers, the rewrite at birth and the pace.

## Sources

- **Size and season:**
  - Tschinkel W. R. (1993). Sociometry and sociogenesis of colonies of the fire ant *Solenopsis invicta* during one annual cycle. *Ecol. Monogr.* 63: 425–457. [bio.fsu.edu](https://www.bio.fsu.edu/~tschink/publications/1993-6.pdf)
  - Black garden ant. [Wikipedia](https://en.wikipedia.org/wiki/Black_garden_ant) *(secondary)*
- **Execution of sexual larvae:**
  - Klobuchar E. A. & Deslippe R. J. (2002). A queen pheromone induces workers to kill sexual larvae in colonies of the red imported fire ant (*Solenopsis invicta*). *Naturwissenschaften* 89: 302–304. [link.springer.com](https://link.springer.com/doi/10.1007/s00114-002-0331-1)
  - Queen pheromones in ants, a review (2023). *Behav. Ecol. Sociobiol.* [link.springer.com](https://link.springer.com/10.1007/s00265-023-03378-8)
- **Queen inhibition of virgin queens:**
  - Fletcher D. J. C. & Blum M. S. (1981). Pheromonal control of dealation and oogenesis in virgin queen fire ants. *Science* 212: 73–75. [pherobase](https://pherobase.com/literature/data/details/C/39786)
  - Brent C. S. & Vargo E. L. (2003). Changes in juvenile hormone biosynthetic rate and whole body content in maturing virgin queens of *Solenopsis invicta*. *J. Insect Physiol.* [ars.usda.gov](https://ars.usda.gov/ARSUserFiles/42111/Brent%20%20Vargo%202003.pdf)
  - Fire-ant gene expression after dealation. [WurmLab](https://WurmLab.github.io/publications/fire-ant-gene-expression-after-dealation-colony-founding/) *(secondary)*
- **Argentine ant, queen removal and corpses:** Vargo E. L. & Passera L. Actes des Colloques Insectes Sociaux 5. [dictionnaire-amoureux-des-fourmis.fr](https://dictionnaire-amoureux-des-fourmis.fr/Noms%20propres/Publis/1989/ACTES-COLLOQUES-INSECTES-SOCIAUX-VOL5-Vargo-Passera.pdf)
- **Replacement queens and bipotent larvae:** Boulay R. et al. (2009). *Ecol. Entomol.* (*Aphaenogaster senilis*). [insectes-sociaux.univ-tours.fr](https://insectes-sociaux.univ-tours.fr/dictionnaire-amoureux-des-fourmis/Publications/2009-Boulay-et-al-EEN.pdf)
- **Founding:**
  - Colony Foundation. [AntWiki](https://antwiki.org/wiki/Colony_Foundation) *(secondary)*
  - Kurihara et al. (2022). Thoracic crop formation is spatiotemporally coordinated with flight muscle histolysis during claustral colony foundation of a *Lasius japonicus* queen. *Arthropod Struct. Dev.* [biorxiv.org](https://www.biorxiv.org/content/10.1101/2022.03.03.482739.full.pdf)
- **Pathogens and founding queens:** Pull C. D. & Cremer S. (2017). No evidence for social immunity in co-founding queen associations. *BMC Evol. Biol.* 17: 219. [PMC5701228](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5701228/)
- **Juvenile hormone and task** (§4's `task` sense in fungus-policy §11):
  - Dolezal A. G. et al. (2012). Worker division of labor and endocrine physiology are associated in the harvester ant *Pogonomyrmex californicus*. *J. Exp. Biol.* 215: 454–460. [cob.silverchair.com](https://cob.silverchair.com/jeb/article/215/3/454/11168/Worker-division-of-labor-and-endocrine-physiology)
  - Effect of juvenile hormone on worker behavioral transition in *Solenopsis invicta* (2023). *Insects* 14: 934. [PMC10743645](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10743645/)
