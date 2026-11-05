# Trails: how much to lay, on which journeys, and the "no entry" mark

Research note for behaviour MR 3 (bead `ja-3ml`, PRD §45). Before MR 3 every food carrier laid the same trail, whatever it carried, and nothing marked a patch once it ran out. Two assays fail for that reason (PRD §43.5): the double bridge (A1) and two equal sources (A2a). This note collects what real ants do. The paper sites were outside this session's network allowlist, so numbers come from abstracts and index pages and are marked **unverified**, as in `tiredness.md`.

## The double bridge

- **What Goss et al. 1989 did.** An Argentine ant colony (*Linepithema humile*) reached food over a bridge of two branches, one twice as long as the other. In most trials nearly all traffic ended up on the short branch. The ants that took it came back first, so its trail grew first.
  - Source: Goss, Aron, Deneubourg & Pasteels 1989, *Naturwissenschaften* 76:579. A lecture summary gives "about 100 % on the short branch in the long run". **Unverified.**
- **The fork's shape matters.** The two branches leave the choice point at equal angles, so length is the only difference between them. Pharaoh's ant trail forks are about 60° (Jackson, Holcombe & Ratnieks 2004, in `ant-communication.md` §2). Goss's modules diverge by the same total angle, ±30° from the axis.

**For the model (ja-dez):** A1's arena should be a fork whose two branches leave one choice point at ±30° and look alike for their first stretch. The short branch must not also be the straight line home. A share is only meaningful if food is being carried, so a run only counts when food actually comes home.

## Trail amount follows food quality

- ***Lasius niger* lays more trail for richer food.** Foragers at a 1 M sugar source laid about 43 % more trail marks than foragers at 0.05–0.1 M sources. Trail laying per forager also fell during each recruitment episode. A recruitment model built on these data picked the richer of two sources from this modulation alone.
  - Source: Beckers, Deneubourg & Goss 1993, *J. Insect Behav.* 6:751 (abstract). The same paper estimates a weak trail's mean lifetime at 47 min. **Unverified** numbers.
- **Two equal sources: the colony picks one.** With two identical 1 M sources, a *Lasius niger* colony usually concentrates on one of them. Amplification by trail breaks the symmetry.
  - Source: Beckers, Deneubourg, Goss & Pasteels 1990, *Insectes Sociaux* (assay A2a's source).

**For the model:** `trailRate` scales with the quality of the food carried. Rich food (1 M) lays about 1.4× what poor food (≤ 0.1 M) lays. Quality has to be sensed: an ant tastes the food when it picks it up, which is a contact sense (vision.md).

## Which journeys lay trail

- **Mass recruiters such as *Lasius* lay trail on the way home from food.** That is the recruitment trail. The game has always done this: carriers lay food trail.
- **Argentine ants also mark while exploring.** Aron, Deneubourg & Pasteels 1989 suggest the same pheromone serves food and exploratory recruitment. Whether *L. humile* lays on its outbound food trips as well was not settled here: the full text was not reached. **Unverified.**

**For the model:** MR 3 keeps "carriers lay food trail" (*Lasius*). With carriers homing by trail and vector, A1 passes without outbound laying.

## The "no entry" mark

- **What it is.** Pharaoh's ants (*Monomorium pharaonis*) lay a repellent pheromone on unrewarding branches at trail forks. It was the first negative trail pheromone found. Facing a marked branch, most foragers (71 %) took the other branch. U-turns were more than four times as likely on the marked one.
  - Source: Robinson, Jackson, Holcombe & Ratnieks 2005, *Nature* 438:442.
- **How long it lasts.** The repellent's effect lasts more than twice as long as the short-lived attractive pheromone's: 78 min against 33 min. Its initial pull on branch choice was about double (48 % against 25 % above control). The authors suggest the repellent steers at forks and the attractive pheromone guides along the whole trail.
  - Source: Robinson, Green, Jenner, Holcombe & Ratnieks 2008, *Insectes Sociaux* 55:246 (abstract). **Unverified.**
- **Why it helps.** An agent-based model parameterised on Pharaoh's ants found a repellent makes foraging more robust and flexible: the colony leaves an emptied source sooner.
  - Source: Robinson, Ratnieks & Holcombe 2008, *J. Theor. Biol.*
- Ants change course about 15 body lengths before a marked fork (`ant-communication.md` §1).

**For the model:** an ant that follows a food trail to its end and finds no food there lays "no entry" on the spot. Followers steer away from it. The game's food trail lasts 11.6 s (`ant-communication.md` §2), so a mark lasting about 2× that, ~25 s, keeps the paper's ratio. This is the sensed fix for ant mills, which only *tired* breaks today.

## What MR 3 built from this (PRD §45)

- **A1's arena** is Goss's fork, with the long branch's side alternating by seed. It is scored by passages, and a run counts only when food comes home.
- **Food quality.** A map layer (`WorldMap.quality`) holds it. An ant tastes it at pickup and carries it, and `Touch.quality` passes it to the responses. `trailRate` gives rich 1.2, fair 1 and poor 0.83.
- **Followers choose by strength** (Deneubourg's (k + C)² choice, `followChoice` 1), and the top-down food channel holds up to 80 (`foodCapTop`). That was the missing piece: under the old cap of 20 a busy trail sat at the cap near the nest, so a strong trail and a weak one read the same, and followers always turned to the strongest sensor. Laying a quarter of the trail instead, the first try, left the trail too weak for explorers to follow (review of #37).
- **Carriers home by trail and vector** (`homeTrail` 0.8): a carrier takes the food trail where it lies within 90° of its home vector, as foragers combine route cues and pheromone with path integration as the fallback (Czaczkes et al. 2011, 2013). At the bridge's fork the vector can't tell the branches apart; the trail can.
- **Top-down maps only.** In the side view trails don't fork, and every variant tried there slowed the nest, so the side view plays as before.
- **"No entry"** is built: a channel with t½ ≈ 27 s, a `noEntry` response, and a follower discount (`noEntryAvoid`). It ships off: the marks it laid landed on live trails and cost A2a more than they gained on A3 (bead `ja-4n1`).
- **Which journeys lay trail:** only carriers lay food trail (*Lasius*). Outbound laying by followers was measured and didn't help A1 (0.50, with a wide spread).

## Sources

- Goss, Aron, Deneubourg & Pasteels 1989, "Self-organized shortcuts in the Argentine ant", *Naturwissenschaften* 76:579–581: https://link.springer.com/article/10.1007/BF00462870 *(index page)*
- Beckers, Deneubourg & Goss 1993, "Modulation of trail laying in the ant *Lasius niger*…", *J. Insect Behav.* 6:751–759: https://link.springer.com/article/10.1007/BF01201674 *(index page)*; abstract: https://data.zhenzhi.com/details/1/989180220 *(secondary)*
- Beckers, Deneubourg, Goss & Pasteels 1990, "Collective decision making through food recruitment", *Insectes Sociaux*: https://www.semanticscholar.org/paper/Collective-decision-making-through-food-recruitment-Beckers-Deneubourg/dc079c47d907e06eb570825903a1f82c5785018c *(index page)*
- Aron, Deneubourg & Pasteels 1989, trail laying during exploratory recruitment in the Argentine ant: https://hilo.hawaii.edu/maunakea/library/ref/3121 *(catalogue entry)*
- Robinson, Jackson, Holcombe & Ratnieks 2005, "'No entry' signal in ant foraging", *Nature* 438:442: https://sro.sussex.ac.uk/id/eprint/22787/
- Robinson, Green, Jenner, Holcombe & Ratnieks 2008, "Decay rates of attractive and repellent pheromones in an ant foraging trail network", *Insectes Sociaux* 55:246–251: https://link.springer.com/doi/10.1007/s00040-008-0994-5 *(index page)*
- Robinson, Ratnieks & Holcombe 2008, agent-based model of the repellent pheromone, *J. Theor. Biol.*: https://eprints.whiterose.ac.uk/46211/ *(index page)*
