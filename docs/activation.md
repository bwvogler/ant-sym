# Activation: foragers go out because foragers come back

Research note for behaviour MR 5 (bead `ja-um8`, PRD §47). What the game did before MR 5:
- A rested forager that reached home with empty jaws went straight back out (`arrive`).
- Only fatigue kept an ant inside, and only until it was rested (MR 3.1, `tiredness.md`).
- No ant knew whether others were finding food.
- The strategist read the map's food total (`foodLeft`), which no ant can sense.

The paper sites (journals.plos.org, pmc.ncbi.nlm.nih.gov, frontiersin.org) were outside this session's network allowlist. Numbers come from abstracts and search summaries and are marked **unverified**, as in `tiredness.md`, `trails.md` and `combat.md`.

## A waiting forager leaves when it meets successful foragers

**Red harvester ant, *Pogonomyrmex barbatus*:**
- **The cue.** Foragers wait in a chamber just inside the entrance. Whether one leaves depends on brief antennal contacts with returning foragers carrying food, read from their cuticular hydrocarbons and the seed's odour.
- **Only successful returns count.** Departure rates did not respond to the return of unsuccessful foragers, but depended strongly on the return of successful ones (Gordon's lab; summarised in Pinter-Wollman et al. 2013, *Anim. Behav.* 86:1). **Unverified.**
- **The response is fast.** A forager left 3–8 s after a marked rise in its contacts with returning foragers. It did not leave after a rise in contacts with other ants in the chamber (Pinter-Wollman et al. 2013). **Unverified.**
- **Removing the returners cuts departures.** When returning foragers were taken away, departures fell. They settled within about 3 min (Gordon 2002, *Am. Nat.* 159:509; Gordon 2025, *Ecol. Evol.*). **Unverified.**
- **Waiting has a limit.** Foragers waited in the entrance chamber for about 3 min with no forager returning. With none returning for about 8 min, they tended to go down to the deeper nest (Gordon 2025). **Unverified.**
- **Interactions also bring foragers up** (Pless et al. 2015, *PLoS ONE* 10:e0141971):
  - ants that left had more contacts than ants that went back down;
  - a faster return rate sends more ants down, which brings more up into the entrance chamber.

  So the return rate sets both who leaves and how many are waiting to.

## The model: a leaky count of contacts with a threshold

- **Prabhakar, Dektar & Gordon 2012** (*PLoS Comput. Biol.* 8:e1002670):
  - a stochastic model in which the outgoing rate follows the rate of successful returns, with no spatial information;
  - field returns arrive roughly as a Poisson process;
  - the press called it the "anternet": it works like TCP, where each acknowledgement lets the next packet go;
  - its parameters (increment per contact, decay, threshold) were not reached here.
- **Davidson et al. 2016** (*Front. Ecol. Evol.* 4:115):
  - tracked about 1,200 foragers in four field colonies;
  - modelled each ant as a stochastic accumulation of evidence: contacts with returning foragers raise a decision variable, and the ant leaves when it crosses an upper threshold;
  - parameters not reached.
- **Pagliara, Gordon & Leonard 2018** (*PLoS Comput. Biol.*, "closed-loop excitable system"): the same loop as an excitable system, as in neuron models.

**For the model:**
- Each ant keeps a **leaky count** of contacts with nestmates carrying food home. Its half-life is tens of seconds, so a rise is felt within seconds and fades over a minute or so.
- A rested forager inside leaves when the count passes a threshold.
- Contact is a sense the game already uses for meeting strangers (`#odds`, MR 4).

## Who starts foraging when nothing comes back

- **Patrollers go first.** In *P. barbatus*, patrollers go out in the morning. Their safe return stimulates the foragers to leave; if they don't return, the foragers don't come out.
- **The rate that works best** (Greene & Gordon 2007, *Behav. Ecol.* 18:451): glass beads coated with patrollers' cuticular hydrocarbons, dropped in at about 1 per 10 s, brought foraging on fastest. **Unverified.**

**For the model:** some ants must leave with no returns at all, or a colony with nothing coming in never finds food. A small spontaneous rate (`scoutRate`) stands in for the patrollers: scouts leave unprompted, and the first finds then start the loop.

## A colony's bias as a threshold

- **Response thresholds** (Bonabeau, Theraulaz & Deneubourg 1996): an individual takes up a task with probability s² / (s² + θ²), where s is the stimulus and θ the ant's threshold. A colony shifts how much of a task it does by its members' thresholds, not by an order.
- **For the model:** the doctrine, or a later colony-wide bias, can move the departure threshold (`leaveAt`) and `scoutRate` instead of commanding a stance. That is the full form of "a stance that emerges". MR 5 builds the threshold, and leaves the doctrine's hold on it for later.

## What a colony knows about food

- **The rate is the information.** Harvester ant colonies don't count the food on their range. They respond to the rate at which successful foragers return (Greene & Gordon 2007: "rate is a crucial source of information in the network of interactions").
- **For the model:** the strategist's `foodLeft` (the map's food total) gives way to `intake`, the rate of food brought home lately against the colony's size. It is the same signal the waiting foragers sense, summed over the nest.

## What MR 5 built from this (PRD §47)

- **The cue.** Each ant keeps a leaky count, `met` (half-life 20 s), of encounters with nestmates coming home with food. A forager that puts its food down at home meets the waiting ants in its cell and the six round it, once each.
  - Counted as seconds of contact instead, a carrier was met for a single tick, since it turns round the moment its food is down. The count never reached the threshold, and only scouts went out.
  - Unsuccessful returns don't count.
- **Waiting.** On a top-down map, a rested forager home with empty jaws is asked `leave` instead of its mode:
  - "now" goes out at about 1 per second;
  - "soon" at 0.2 per second, in line with the 3–8 s delay;
  - "wait" stays in, milling out to 0.9 of the nest's radius, where foragers come home.
- **The local rule:** many returns (4 or more), now; a few (at least 1, `leaveGate`), soon; none, wait. A colony that is raiding or defending doesn't wait.
- **Scouts.** A waiting ant still goes out at 1/180 per second (`scoutRate`), about Gordon's 3 minutes with nothing returning.
  - With scouts at 1/30 per second, the returns made no difference: every waiting ant was out within a minute or two whatever came back.
- **The strategist** reads `intake`, food stored per ant per second over the last 60 s, instead of the map's food left.
- **The side view** is unchanged: a fresh forager still leaves the royal chamber at once (bead `ja-web`).

## Sources

- Prabhakar, Dektar & Gordon 2012, "The regulation of ant colony foraging activity without spatial information", *PLoS Comput. Biol.* 8:e1002670: https://doaj.org/article/d90b7eebe8b04706ab40c82ac8658ca0 *(index page)* · https://pmc.ncbi.nlm.nih.gov/articles/PMC3426560 · https://engineering.stanford.edu/news/stanford-biologist-and-computer-scientist-discover-anternet *(press)*
- Pinter-Wollman, Bala, Merrell, Queirolo, Stumpe, Holmes & Gordon 2013, "Harvester ants use interactions to regulate forager activation and availability", *Anim. Behav.* 86:1–11: http://www.web.stanford.edu/~dmgordon/articles/other/animal-behaviour-86/Animal%20Behaviour%2086%20(2013)%201-11.pdf
- Pless, Queirolo, Pinter-Wollman, Crow, Allen, Mathur & Gordon 2015, "Interactions increase forager availability and activity in harvester ants", *PLoS ONE* 10:e0141971: https://pinterwollmanlab.eeb.ucla.edu/wp-content/uploads/sites/86/2016/05/Pless-et-al-2015-Plos-One.pdf
- Davidson, Arauco-Aliaga, Crow, Gordon & Goldman 2016, "Effect of interactions between harvester ants on forager decisions", *Front. Ecol. Evol.* 4:115: https://www.frontiersin.org/articles/10.3389/fevo.2016.00115/full
- Pagliara, Gordon & Leonard 2018, "Regulation of harvester ant foraging as a closed-loop excitable system", *PLoS Comput. Biol.*: https://journals.plos.org/ploscompbiol/article?id=10.1371%2Fjournal.pcbi.1006200
- Greene & Gordon 2007, "Interaction rate informs harvester ant task decisions", *Behav. Ecol.* 18:451–455: https://ideas.repec.org/a/oup/beheco/v18y2007i2p451-455.html *(index page)*
- Gordon 2002, "The regulation of foraging activity in red harvester ant colonies", *Am. Nat.* 159:509: https://web.stanford.edu/~dmgordon/old2/gordon2002.pdf
- Gordon 2025, "Nest entrance architecture and the regulation of foraging activity in desert harvester ants", *Ecol. Evol.*: https://onlinelibrary.wiley.com/doi/10.1002/ece3.72122
- Bonabeau, Theraulaz & Deneubourg 1996, "Quantitative study of the fixed threshold model for the regulation of division of labour in insect societies", *Proc. R. Soc. B* 263:1565 *(from memory of the standard form; not fetched)*
