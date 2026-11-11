# Activation: foragers go out because foragers come back

Research note for behaviour MR 5 (bead `ja-um8`, PRD §48). What the game did before MR 5:
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
- **For the model:** the doctrine, or a later colony-wide bias, can move the departure threshold (`leaveAt`) and `scoutRate` instead of commanding a stance. That is the full form of "a stance that emerges". MR 5 builds the threshold, and leaves the doctrine's hold on it for later. MR 5.2 uses the same idea for raids: the stimulus is a scout's raid trail ([raid-recruitment.md](raid-recruitment.md)).

## What a colony knows about food

- **The rate is the information.** Harvester ant colonies don't count the food on their range. They respond to the rate at which successful foragers return (Greene & Gordon 2007: "rate is a crucial source of information in the network of interactions").
- **For the model:** the strategist's `foodLeft` (the map's food total) gives way to `intake`, the rate of food brought home lately against the colony's size. It is the same signal the waiting foragers sense, summed over the nest.

## What MR 5 built from this (PRD §48)

- **The cue.** Each ant keeps a leaky count, `met` (half-life 20 s), of encounters with nestmates coming home with food. A forager that puts its food down at home meets the waiting ants in its cell and the six round it, once each.
  - Counted as seconds of contact instead, a carrier was met for a single tick, since it turns round the moment its food is down. The count never reached the threshold, and only scouts went out.
  - Unsuccessful returns don't count.
- **Waiting.** On a top-down map, a rested forager home with empty jaws is asked `leave` instead of its mode:
  - "now" goes out at about 1 per second;
  - "soon" at 0.2 per second, in line with the 3–8 s delay;
  - "wait" stays in, milling out to 0.9 of the nest's radius, where foragers come home.
- **The local rule:** many returns (4 or more), now; a few (at least 1, `leaveGate`), soon; none, wait. A colony that is raiding or defending doesn't wait.
- **Scouts.** A waiting ant still goes out at 1/90 per second (`scoutRate`), the same order as Gordon's 3 minutes with nothing returning; at 1/180 the top-down game's worst seed fell to 5 ants alive.
  - With scouts at 1/30 per second, the returns made no difference: every waiting ant was out within a minute or two whatever came back.
- **The strategist** reads `intake`, food stored per ant per second over the last 60 s, instead of the map's food left.
- **The side view** is unchanged: a fresh forager still leaves the royal chamber at once.

### One world: the gate at the top of the shaft (`ja-web`, PRD §48.6, 2026-11-10)

A port of the above into one world, where the foragers' chamber "just inside the entrance" is the top of each colony's shaft in the curtain.
- **The gate.** Every outgoing forager (old, exploring or following, or a recruited raider) with empty jaws passes a gate within `WAIT_STEPS` (3) steps of its own hole, by the way out through its tunnels. There it mills among the top cells, is not asked its mode, and rolls `leave` once a step, as a returning forager (as a raider if recruited). A yes is its pass, and it climbs out. It senses its place as `hole`, so its `leave` key has the top-down form.
- **Who is never held:** porters, ants carrying spoil, a corpse or brood, the young and middle-aged, and a finder going home to tell.
- **Who comes to the gate.** A rested returner with empty jaws is held as soon as it is down its hole (the owner's choice: it doesn't go down first). A tired one goes down to rest; rested, it climbs back up and is held.
- **The cue.** Each carrier that comes down its hole with food counts once; every ant held at the top meets last tick's count, since the carrier walks down past all of them. `crowd` is the nestmates round a held ant. `met` leaks on both layers.
- **A successful forager never waits.** A carrier that came down with food has a pass back out (`leaveOk`), used when it climbs out.
- **Raids.** On "raid" a held ant goes out as a raid scout, in fight. A finder lays its raid trail on to its own hole (on open ground it stops at the nest's rim). Ants held at the gate smell that trail on the hole's cell and the six round it, and are recruited by it by degrees.
- **Nobody waits on the plane**: every returner goes down its hole (one-world §8 item 9).
- **Results** (PRD §48.6): A5b passes 7/10 on one world (`main` 6/10), and departures fall once food is gone (120 trips out a minute against `main`'s 167). A5 fails 0/10, as on `main`, because the middle-aged go out unheld. G1's food carried down is unchanged (−0.3 %), and raids return: 187 raid scouts, 47 finds and 15 recruits over 20 colonies, none on `main`.

## Play

- **See:** on the top-down maps, rested foragers mill at the nest's rim and pour out once carriers come home with food; with none returning, a scout leaves now and then (PRD §48.3). In one world (the page's only game since PRD §55) they mill at the top of the shaft in the view below, and climb out as carriers come down past them (PRD §48.6). Learn has no guide entry for it; the Policy tab's small responses give the `leave` rule in words.
- **Choose:** none. No lever bends the count of returns a waiting ant meets. Levers that change how many carriers come home (`food`, `trail`, `time`) may shift it at second hand; not measured.
- **Counterplay and progression:** none: it is the colony's nature, and the fungus has no hold on it.
- **Cost:** the page answers `leave` by the local rule and asks Jev none of it; asked live top-down it was 268 tokens a question (PRD §48.5). In one world it is asked now; `colony-cost --one` estimates the lane at about 1,900 tokens a question and $0.007 an hour if Jev were asked (PRD §48.6). The strategist's stance lane reads `intake` at 193 tokens a question, and its answers for the preset doctrines are shipped (PRD §48.5, §50.2). The live check cost $0.0016.
- **Risks:** a cliff in the scout rate: at 1/180 a second, G′'s worst seed fell to 5 ants alive (PRD §48.4). A legend that doesn't explain a few returns gets "wait", which cost the first colony 11–14 % of its G′ food (PRD §48.5).
- **Owner decisions needed:** whether the middle-aged, who carry spoil out and then forage on the plane, should pass the gate too (A5 on one world, PRD §48.6); a Learn entry; whether the fungus should have a lever on this cue, which would need research first. Activation in one world is decided and built (`ja-web`); the side view keeps none.

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
