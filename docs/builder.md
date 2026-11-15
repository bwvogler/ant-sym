# Builder mode: a child changes the world, and the ants answer from their senses

*Research note for the epic `ja-kjj8` (PRD §73). Written 2026-11-14, against code at `d80ffd8`. Full text was read on PubMed Central and journals.biologists.com. Springer, Wiley, Elsevier, the ACM Digital Library and several authors' sites were out of this session's reach. Numbers from abstracts, search summaries or citing papers are marked **unverified**, and anything recalled is marked "(from memory; not fetched)".*

**The owner's ask (2026-11-14).** A creative mode, like Minecraft's, that their 7-year-old can turn on or off at any point in a normal game. The child should be able to dig, leave food, draw signals and wash them away. A younger sibling who can't read plays too, on a phone or tablet.

The owner decided four things:
- ants can die;
- what the child builds carries into the normal game's save;
- the builder gives no fungus powers;
- the builder spends no Jev of its own.

**What the game does today.**
- Nothing lets the player change the world. The lure, alarm and spore brushes were removed: the lure and alarm brushes painted only the first colony's fields (PRD §50.1), and the spore brush skipped the fungus's progression (§50.15).
- The terrain can already be edited: `world.ts` has `digCell` and `fillCell`.
- Food can already be placed with a quality: `dropFood`, the `quality` layer. The ants taste it, which is a sense in the sense table.
- Trails can already be laid per colony: `Pheromones.deposit`, one field set per colony and layer.
- `Game.save` already keeps the plane, the curtain and every pheromone field, so edits carry into the save with no new code.

**The question this note answers.** When someone else changes an ant's world (a drawn trail, a new obstacle, sweeter food, a washed-out path, a dug or filled tunnel), what do real ants do? And how should the tools be shaped for children of 4 to 7 on a touch screen?

## A drawn trail is followed, for a while

- **Argentine ant (*Linepithema humile*), full text.** Experimenters drew an S-shaped trail 17.3 cm long on filter paper. A pencil line alone drew no following. With the full pheromone blend, a mean of 5.0 ± 0.6 ants followed the whole trail in 2 min. With one compound of the blend alone ((Z)-9-hexadecenal), 0.2 ± 0.1 did. The paper's Discussion says a small amount of the blend dissipates in about 40 min, a figure cited from earlier work, so **unverified**. Source: Choe, Villafuerte & Tsutsui 2012.
- **Yellow meadow ant (*Lasius flavus*), full text.** The standard bioassay is a drawn *circle*, scored by how many of its 10 arcs an ant crosses. With hindgut extract the median was 4.5 arcs; with the solvent control, no more than 1. The response did not rise with dose and fell at high doses. Source: Butterfield, Bacon & Hill 2025, following the method of Pasteels & Verhaeghe 1974.
- **Fire ant (*Solenopsis saevissima*).** Trails drawn with Dufour's-gland extract recruit workers and guide them, and fade within about 2 min. Source: Wilson 1962 (from memory; not fetched; the citation is confirmed).
- **Too much pheromone confuses ants (Argentine ant).** Flooding an area with the synthetic trail compound broke trail integrity "within seconds", and foraging stayed down for 2 days. Source: Suckling et al. 2008. **Unverified**: abstract only.

**In the game:** a trail crayon lays the food-trail channel of one colony along the stroke, at the strength a food carrier's own mark has. It does not lay the strongest level a cell can hold. Ants follow it the way they follow their own food trail: through the antenna sensors already in the sense table ("Trail pheromones"), into the existing `foodTrail` situation field and trail steering. Each crayon has its colony's colour, because each colony reads only its own trail.
- The mark fades at the game's food-trail rate (t½ ≈ 11.6 s, `DEFAULT_CHANNELS.food`), unless ants that find food along it lay more.
- A crayon line that leads nowhere fades out. Ants that reach its end with no food lay "no entry", as they do now (`trails.md`).
- How long a line lasts is a decision for the owner (open questions). The biology says minutes for a drawn trail. The game's own trails last seconds of game time, because the game runs its clock faster than real time.

## A circle of trail does not trap ants, as far as anyone has measured

- **Mills are an army-ant failure.** Army-ant foragers that get cut off from the main column, with their pheromone communication disturbed, can circle until they die of exhaustion. Mills also form on their own in the lab. Source: Delsuc 2003 (full text), citing Schneirla 1944 and 1971 and Couzin & Franks 2003. Schneirla 1944 itself was not reached.
- **Drawn circles let ants go.** In the circle bioassays above, *Lasius flavus* workers followed about half the circle and then left it (Butterfield et al. 2025).
- No mill in a non-army ant, and no mill started by a drawn circle, was found.

**In the game:** the builder makes no promise of a mill. A circle drawn with a crayon may hold its followers for a few laps before they wander off, as the circle bioassays show. Whether the game's ants loop longer than real ants is something an assay reports (B5 below), not a target. Assay A3 already watches for loops between nests.

## Trails fade; nothing measured shows rain washing them off

- **Black garden ant (*Lasius niger*).** A weak trail lasts about 47 min on average. Source: Beckers, Deneubourg & Goss 1993. **Unverified**: abstract only.
- **Black garden ant (*Lasius niger*).** A trail laid by 500 ant passages fell to the control level in 20–24 h; trails from 125 or 30 passages decayed faster. Source: Evison et al. 2008. **Unverified**: from a summary of the abstract.
- **Leaf-cutting ant (*Atta cephalotes*), in rain.** Wet leaf loads gained 143 % in weight and were dropped. Watering the trail did not change how often ants dropped loads. Ants walked 30 % faster when humidity rose or they heard raindrops. Source: Farji-Brener et al. 2018. **Unverified**: abstract only.
- **Turtle ants.** Trail links "are easily destroyed by wind, rain", but the paper gives no numbers. After an experimental cut, ants explored new paths within about 75 min and pruned them by 5 h; those figures come from field work the paper cites. Source: Chandrasekhar, Gordon & Navlakha 2018.

**In the game:** the rain cloud is **design**. No paper measured rain removing trail pheromone. Under the cloud it removes every colony's food, home and no-entry trails and alarm, on the view it is used on. Floor marks underground are left alone; they belong to a later "label a room" tool. Rain draws no random numbers and touches no ant.
- The ants find their way again with what they already have: the home vector, route memory, the mound's smell and fresh trails from new finds.
- How fast the trail network comes back is reported by assay B3. There is no literature target to hold it to.
- Real water (flooding, ants carrying brood upstairs, rafts) is not in this slice. It needs its own note.

## A blocked route is rerouted, but an old trail can hold

- **Argentine ant, full text.** The maze had 32,768 possible paths; colonies had 500–1,000 workers. After 1 h the most-used bridge was blocked. Ants began pruning the network 10–20 min later. The shortest remaining path was found by 90–93 % of colonies that had explored the maze beforehand and by 73–79 % of those that had not. Ants walked faster on mazes already marked by explorers (10.6 against 8.6 mm/s). Source: Reid, Sumpter & Beekman 2011.
- **Big-headed ant (*Pheidole megacephala*), full text.** A Y-bridge had branches of 60 and 180 mm. The short branch was blocked from 60 to 120 min:
  - while it was blocked, 18 of 21 colonies moved to the long branch;
  - in the first hour after it reopened, 9 of 21 went back to it;
  - by the last 30 min, 16 of 21 had.

  Source: Dussutour et al. 2009.
- **Limit.** Argentine ants (Goss et al. 1989) and *Lasius niger* (Beckers et al. 1992) are cited by reviews as *not* switching to a shorter branch added later. **Unverified**: secondary reviews only.

**In the game:** a rock or soil stamp dropped on a busy trail blocks it, and the ants get round it with what they already sense: the trail, the vector, route memory and exploring. Assay B2 measures it. **Target:** traffic to the food comes back by another way in most seeds, in the spirit of Dussutour's 18 of 21 colonies. The time limit is a design mark, scaled to the game's clock. A stamp opened again later (with the dig tool) need not win traffic back, and the biology says it often doesn't. That is fine to show a child: "they remember the long way."

## Sweeter food wins, unless a poorer trail is already strong

- **Black garden ant (*Lasius niger*).** Trail laying is 43 % higher at 1 M sugar than at 0.05–0.1 M, and models show that difference alone is enough for the colony to pick the richer source. Source: Beckers, Deneubourg & Goss 1993. **Unverified**: abstract only.
- **Black garden ant (*Lasius niger*).** The colony picks a 1 M source over a 0.1 M one. But if the trail to the 0.1 M source is already well established when the 1 M source appears, the colony stays on the poor one. *Tetramorium caespitum*, which recruits in small groups, does switch. Source: Beckers, Deneubourg, Goss & Pasteels 1990. **Unverified**: abstract only.
- **Pharaoh ant, full text.** With 1 M against 0.1 M feeders, the 1 M side was favoured in 12 of 20 trials, the 0.1 M side in 1, and neither in 7. With 0.5 M against 0.1 M, the richer side won 6 times and neither 14 times. Source: Price et al. 2016.
- **Black garden ant (*Lasius niger*), full text.** Two 1 M feeders differed in how many ants could feed at once. When the roomier one was added 15 min after the first was found:
  - under heavy crowding, colonies moved to it within about 10 min on average;
  - ants that failed to feed were 3.2× as likely to walk to the other feeder;
  - with little crowding, colonies stayed on the first.

  Source: Grüter et al. 2012.

**In the game:** the sugar cube and the crumb are the two qualities assay A2b already uses: 1.5 and 0.5, standing for Beckers et al.'s 1 M and 0.1 M sugar. They are placed with `dropFood`. The ants taste them at pickup and lay trail by quality, both already built (`trails.md`).
- A2b is the target for two dishes at once: the rich one takes at least 70 % of the food carried.
- Assay B4 reports what happens when sugar is dropped beside a crumb pile the colony already works. The biology says *Lasius* often stays, so B4 has no pass mark. If the game's ants always stay, the child's "they still like the crumbs" is real ant behaviour, and the Learn entry says so.

## Damaged nests are repaired

- **Carpenter ant (*Camponotus fellah*), full text.** Researchers collapsed 25–30 % of the dug area by hand. Colonies stopped digging once they had recovered 93 ± 3 % of the lost area. After a collapse, ants of every age dug; in normal growth mostly young ants did. The top digging rate per ant did not change. Source: Rajendran et al. 2026.
- **Floodplain ants, full text.** Five species built earthen levees 1.5–4 cm high within about 24 h of the first heavy rain. *Ectatomma opaciventre* began repairing breaches within 30 min. Breached colonies recruited more slowly (median 16.8 against 8.0 min) and moved workers from foraging to repair. Source: LeBrun, Moffett & Holway 2011.
- **Fire ant (*Solenopsis invicta*).** Rain blocks nest exits with soil. Small repairs start during the rain, and large-scale repair finishes within about 12 h. Source: Lu, Hao & Liang 2012. **Unverified**: abstract only.

**In the game:** the dig and dirt brushes change soil to open ground and back, underground and on the mound, with the same `digCell` and `fillCell` the ants use. Dirt never fills a cell that holds an ant or brood: it is placed around them, as the backfill rule's `occupied` check already requires.
- This slice adds no repair behaviour. Ants meet filled tunnels and new open space through what they already do: digging at faces, chamber digging and backfill.
- The colony's response to a cave-in, which the papers above describe as all ages digging until most of the lost area is back, is a later mechanic. Assay B6 reports whether the ants dig back into a filled tunnel today.

## Young children on a touch screen

- **Pinching is hard at these ages (full text).** 90 children in New Delhi, 30 per age band, scored strictly (the gesture done on all 4 objects within 2 min):
  - 4–6 years: tapping the intended place succeeded 57 % of the time, tap and hold 20 %;
  - 7–8 years: tapping 83 %, slide 40 %, drag and drop 30 %, pinch and zoom 13 %.

  The authors advise that apps for children aged 8 or under should not require pinch and zoom and should not use text prompts. Source: Yadav et al. 2020.
- **Other studies find more.** Among 89 children aged 3–6, single-finger drag and drop completed 92.0 % of the time and a two-handed multi-touch drag 53.7 %. Source: Vatavu, Cramariuc & Schipor 2015. **Unverified**: abstract and a citing page. Two-finger scaling succeeded as often as tapping for 2–3-year-olds in isolated trials. Source: Nacher et al. 2015. **Unverified**: abstract only.
- **Small targets and "holdovers."** Children miss small targets far more than adults. A child's touch often lands where the previous target was (a holdover); 96 % of holdovers came from children. Sources: Anthony et al. 2012 and 2013; Woodward et al. 2016. **Unverified.**
  - Their advice: make the active area larger than the drawn icon, put targets flush with the screen's edge, and answer each touch at once.
  - No primary minimum target size for touch at ages 4–7 was found.
- **Pre-readers follow sound and demonstrations, not symbols.** Children of about 3½ to 5 followed in-app audio and on-screen demonstrations. A button that only changed how it looked did not work as a prompt at any age tested. Abstract symbols, such as a cartoon hand or a progress bar, needed specific design up to age 5. Sources: Hiniker et al. 2015 and 2016. **Unverified**: abstracts only.

**In the game:**
- **Moving the map with one finger.** A one-finger "move" tool in the tray (a hand) is the main way to move the map. Two-finger pinch and pan work with any tool in hand, and build nothing: a finger (or pen) with a tool waits until it has moved past a click's slop, when the stroke starts from where it landed, or until it lifts as a tap, when it places there. A second finger arriving first makes it a pinch (before this, the first finger had already dropped the brush where it landed). A mouse builds at once. With any tool, tapping places (a stamp, a dish, one cell dug) and dragging paints.
- **Big tools.** Tray buttons are at least 64 CSS px square (**design**: about 1.5× the 44 px commonly given for adults, since no child figure was found). Their active areas run flush to the screen's bottom edge, with gaps between them.
- **Forgiving strokes.** A painted stroke is smoothed and has a wide brush, so a wobbly line still makes a trail.
- **Sound and pictures, not words.** Choosing a tool plays its sound and enlarges its icon. The first time a tool is chosen, a short animated finger shows what it does, with no words. Nothing relies on a glow alone.
- **The little-hands tray.** Four tools only (move, sugar, dig, rain), for the child who can't read.
- **Palms.** No study measured palm touches at these ages. A touch whose contact area is very large is ignored (`PointerEvent.width` and `height`; **design**).

## What was not found

- A measurement of rain or wetting removing trail pheromone, or of how fast ants rebuild a trail after rain.
- A mill in any non-army ant, or a mill started by a drawn trail.
- An experiment that *adds* soil to a nest and records the response. Buhl et al. 2005's numbers were found as a citation only.
- A primary minimum touch-target size for ages 4–7, a measured rate of palm or accidental touches for that age, and any empirical study of children using undo.

## The mechanic

The builder is a set of **player tools that edit the world**. It is not a change to how ants decide. Every tool writes to state the ants already sense; no tool tells an ant what to do.

| Tool | View | What it changes | Through | The ants respond by | Guard |
|---|---|---|---|---|---|
| Move (hand) | both | the camera | `ui/camera.ts` | — | — |
| Dig | both | soil or rock → open (the map's own rock too: owner, D1) | `digCell` | digging, backfill and route steering as now | not the world's edge or the curtain's sky |
| Dirt | below; the mound above | open → soil | `fillCell` | as above | skips cells with an ant or brood, and the hole cell |
| Rock | both | open → rock | a new `placeRock` beside `fillCell` | trail, vector and route memory get round it (B2) | as dirt; never on a hole |
| Sugar / crumb | both | food, quality 1.5 / 0.5 | `dropFood` | taste and trail laying by quality (A2b, B4) | open ground only |
| Trail crayon (one per colony) | both | that colony's `food` channel | `Pheromones.deposit` | antenna sensors, the `foodTrail` field (B1, B5) | at a carrier's mark strength, not the cap |
| Rain cloud | both | every colony's food, home, no-entry and alarm under the cloud set to 0 | a new `Pheromones.clear(x, y, r, channels)` | vector, route memory, new trails (B3) | floor marks kept |
| Undo | both | back to before the last stroke | a stroke journal of cell diffs | — | the last 20 strokes |
| Smell vision | both | the picture only | `ColonyField` | — | while the builder is on |

**Where the code goes.** The tools are pure functions over a `Game`, in a new `colony/builder.ts` exported from `colony/index.ts`.
- Each takes a stroke (cells on one layer) and returns the cells it changed, with their old values, for undo.
- They draw no random numbers.
- The page applies a stroke between ticks, as the queen's pen founds a colony between ticks. A game the builder never touches runs bit for bit as main does, so the golden masters stay bit-exact.
- `Game.save` already keeps the map, the curtain and every pheromone field. So builds carry into the save (the owner's decision), and the undo journal is not saved.

**Off.** The builder is off unless the player turns it on. With it off, no state changes and no code runs in the sim.

**What it retires or adds in vision.md.** Nothing on either side.
- No ant reads anything new; every response runs through the sense table's existing rows (trail pheromones, taste, contact with soil faces).
- No scripted choice is added: the rock and dirt guards keep the world sound (never bury an ant), they don't choose for an ant.
- Smell vision shows every colony's trails while the builder is on. It is a picture, not a sense, and the game never reads it.

**Cost.**
- The builder adds no Jev lane, situation field, legend or question, so tokens per question are unchanged and a cached game spends nothing.
- Edited worlds may show ants situations a plain game rarely reaches. A run that is on asks for those within the daily budget (`JEV_DAILY_USD`, $0.10 a UTC day), as any game does.
- The builder itself makes no request.
- Expected change in $/h: none to small. Measured once the tools exist, with `npm run colony-cost` on a scripted builder session.

**Assays** (`experiment.ts`, landed before any tool, with no behaviour change). Each runs a scripted builder stroke in an arena:

| Id | Question | Target |
|---|---|---|
| B1 | A crayon line out from the hole across empty ground: do ants follow it? | **Design mark:** ants on the line ≥ 3× those on its undrawn mirror over the minute after drawing, in ≥ 8 of 10 seeds. After Choe et al. 2012: blend 5.0 against 0.2 ants. |
| B2 | A rock wall dropped across the established trail to a pile: does traffic come back? | Delivery 150–270 s after the wall ≥ 50 % of before, in ≥ 8 of 10 seeds. After Dussutour et al. 2009: 18 of 21 colonies; Reid et al. 2011: 73–93 %. |
| B3 | Rain over the trail network, mid-game: how fast does the food rate recover? | Report only (no measurement in the literature). |
| B4 | Sugar dropped beside a crumb pile the colony already works. | Report only. Beckers et al. 1990: *Lasius* often stays on the old source. |
| B5 | A crayon circle around the hole: how long do followers circle? | Report only. Butterfield et al. 2025: ants leave after about half a circle; no mill. |
| B6 | A tunnel filled with dirt behind the queen's chamber: do the ants dig it out? | Report only. Rajendran et al. 2026: 93 % of the lost area recovered (a later mechanic). |

A2b already covers two dishes, sugar and crumb, placed at once.

## Play

- **See.** Every tool shows on the field the moment it is used: a hole, a mound of dirt, a rock, a white sugar cube or a brown crumb, a coloured crayon line, a grey cloud with rain falling.
  - Then the ants answer within seconds of game time at 4×: a trickle along the crayon line, a crowd at the sugar, a detour round the rock, a stall after rain.
  - Smell vision makes the invisible trails visible while building, which is what makes the crayons make sense.
  - Each tool gets a Learn entry in the "what you see / what real ants do / how the game models it" shape, written so a parent can read it aloud. Example: "Real ants follow a line drawn with their trail smell, but a pencil line does nothing."
- **Choose.** The builder is not a fungus lever and gives no fungus power (owner). Its choices are the child's: where to put food, which colony to help with a crayon, whether to wall a path or wash it.
  - It sits beside the fungus game, not inside it.
  - **Owner's call, recorded:** builds carry into the save. A child can make a colony thrive or wreck a path, and the fungus game goes on in that world.
- **Counterplay and progression.** §50.15 removed the spore brush because one stroke skipped the fungus's whole progression.
  - The builder can't skip it the same way: it doses no ant, grows no mycelium and unlocks nothing.
  - It can change the colonies the fungus works through. Feeding one colony makes it larger; walling a path changes where hosts meet. That is indirect help, the way a gardener helps.
  - Chapter goals keep counting while the builder is on (proposed; open below).
- **Cost.** No new lane or field (see The mechanic). The builder makes no request, and a cached game spends nothing.
- **Risks, and the number that would show each:**
  - *A softlock*: a hole sealed with rock, a queen walled in. Guarded: no rock or dirt on a hole, never on an ant or brood. Undo covers the rest. A test holds each guard.
  - *A crayon that does nothing visible*: the line fades before ants find it. B1 and smell vision show it; the line's lifetime is an open question.
  - *Runaway food*: piles of sugar everywhere grow a colony past the population cap's comfort and slow the tick. Measured by `npm run colony-bench` with a scripted sugar flood, and capped by a per-stroke amount if it bites.
  - *A frustrated little sibling*: the map moves when she means to paint, or a tool misses. Measured by watching (the owner's family), plus the e2e test of the gesture rules.
  - *Cost creep*: an edited world asking many new situations. `npm run colony-cost` on a builder session; the daily cap holds regardless.

## Open questions

Owner's calls:
1. **Smell vision against §65.** §65 shows trails only where the fungus's hosts sensed them. Proposed: while the builder is on, smell vision shows every colony's trails; with the builder off, §65 holds.
2. **How long a crayon line lasts.** At the ants' own food-trail rate (t½ ≈ 11.6 s of game time) it fades unless ants reinforce it. That is real, but may disappoint. Proposed: a crayon line fades as the colony's home trail does (evaporation 0.02/s, t½ ≈ 35 s), still within the channel's cap.
3. **Holes.** Proposed: rock and dirt never cover a nest hole (no softlock).
4. **Chapter goals and the tutorial while building.** Proposed: goals keep counting, and the tutorial does not start in builder mode.
5. **The little-hands tray.** A switch inside the builder (proposed), or its own button on the start screen?
6. **Sounds.** Proposed: generated in the browser with WebAudio (no sound files, no new dependency), plus spoken tool names with `speechSynthesis` where the device has a voice.

Still to measure: B1–B6 on seeds 1–10; the tick cost of a sugar flood; the cost of an edited world; the gesture rules on a real phone and tablet.

Later notes: floods and rafts (real water), cooperative carrying, aphids, labelling rooms with floor marks, and tweezers (displacement and homing).

## What the builder built (PRD §73.1–73.2)

- **Tools:**
  - pure tools in `colony/builder.ts`, with guards, undo and crayon lines that are saved;
  - picture-only tools in a tray that takes the tab bar's place;
  - Move for one finger;
  - smell vision, the little-hands tray, sounds and spoken names;
  - five Learn entries.
- **What the assays found** (seeds 1–10):
  - the crayon line is followed, at 6.4× its undrawn mirror (worst 4.3);
  - a crayon circle is crowded, then left;
  - rain barely slows a colony;
  - late sugar is mostly ignored, as Beckers et al. 1990's *Lasius* did;
  - a filled chamber is 39 % dug out in 4 min.
- **What they overturned:** a long rock wall across a trail cuts delivery to 14 % of before, for minutes. The game's ants don't reroute well on open ground. That is a new behaviour to build (`ja-y94o`), not a builder fix.
- **Changed on the way:**
  - Zoomed all the way out, one finger's stroke covered hundreds of cells, so the builder now opens zoomed in.
  - B1's first arena, with a pile beyond each line, measured the piles more than the crayon, so it now has no food, as Choe et al.'s line led to none.

## Slice 2: tweezers, the no-entry sign, and what happened (PRD §73.3, `ja-b3us`)

The owner's next step (2026-11-15): tweezers, no-entry paint and "look what happened" notices, as one change.

### A displaced ant runs off its old vector, then searches

- **Desert ants (*Cataglyphis*)** carried from a feeder to unfamiliar ground run off their whole home vector, as if they had not been moved. Where it runs out they search in loops centred there, and find home only if the search reaches it. Source: Wehner & Srinivasan 1981; the searches themselves are in `nest-search.md`. **Unverified** (abstract only).
- **Near home,** landmarks and the nest's smell correct the vector (`nest-search.md`, `nest-and-home.md` §1).

**In the game:** the tweezers lift one ant off the plane and set it down where a finger lets go, on open ground.
- The ant's sense of home is not reset. Its belief of where home lies (`believePlane`: the hole plus its own drift) is shifted by exactly the distance it was carried, through two per-ant arrays, `carriedX` and `carriedY`. A carrier then walks to a "home" that is off by that distance, searches there in its loops, and finds home by the search, the mound's smell or the hole in sight, as `nest-search.md` built.
- Any retrace by route memory is dropped (`routeClear`): the places it stored are not where it now is. An undo puts the ant back but not its places: it has none for the rest of that trip.
- Nothing about choice changes. The ant decides from what it senses, as before. Only its position and its belief move, the way a real experimenter's forceps move them.
- **Design:** tweezers work on the plane only, never underground; an ant can't be dropped on rock or in the sky.

### "No entry" turns trail followers away

- **Pharaoh's ants** lay a repellent on unrewarding branches at trail forks. Facing a marked branch, 71 % of foragers took the other one. Source: Robinson, Jackson, Holcombe & Ratnieks 2005, already in `trails.md`. The mark steers trail followers at forks; it is not a barrier to ants that aren't following a trail.
- **The game** already reads it the same way. A follower's food scent counts for less where "no entry" lies (`steer.ts`, `noEntryAvoid`). It is shipped off (`noEntryAvoid` 0), because the ants' own laying cost assay A2a (PRD §45.4).

**In the game:** the no-entry paint (🚫) lays "no entry" for every colony on the layer painted, kept topped up as a crayon line is (the home trail's half-life).
- Followers read it with a fixed strength while the colony's own `noEntryAvoid` is 0: `NO_ENTRY_PAINTED`, 4, the value PRD §45 tested. The ants still lay none of their own. So a game with no paint is bit for bit as before, since the field is never awake.
- Wanderers ignore it, as real ants do (owner, 2026-11-15: "Real-ant stop sign").

### What happened: notices from the game itself

**In the game:** the builder watches what the ants do with a child's build, and says it in the bell's log (`Builder.watch`, read once a second by the page). The notices:
- An ant found your sugar (or crumbs).
- Your sugar is all gone: the ants carried it home.
- Ants are following your crayon line (three or more on it at once).
- The ant you moved found its way home, after N seconds.
- The ant you moved didn't make it home (it died).

This is design: no paper. It reads the game, never steers it.

### The mechanic, slice 2

| Tool | View | What it changes | The ants respond by | Guard |
|---|---|---|---|---|
| Tweezers 🤏 | above | one ant's position, and its belief of home shifted by the same | walking its old vector, searching, finding home (`nest-search.md`) | open ground only; the plane only |
| No entry 🚫 | both | every colony's `noEntry` along the stroke, topped up as it fades | followers discount food scent there (`NO_ENTRY_PAINTED`) | none needed |

**Assays** (`builderAssays.ts`):

| Id | Question | Target |
|---|---|---|
| B7 `noEntryFork` | A crayon fork with no entry painted near the start of one branch: which branch do ants on the fork take? | ≥ 70 % on the unpainted branch, in ≥ 8 of 10 seeds (Robinson et al. 2005: 71 %); the fork with no paint about even. |
| B8 `tweezers` | Carriers carried 30–60 cells sideways: do they run their old vector before finding home? | Report: the share that come within 6 cells of where home would be before they reach home, and the share home in 300 s (Wehner & Srinivasan 1981). |

**Cost:** no lane, field, legend or question changes. `noEntry` is already sensed, so Jev cost is unchanged.

### Play, slice 2

- **See:** an ant lifted and set down far off walks away from home, loops, and comes back, and the bell says so with its time. Ants on a crayon fork take the branch without the stop sign. A pop-up when an ant finds the sugar.
- **Choose:** the child's own experiments: move the same ant twice, paint the sign on one branch then the other.
- **Risks:**
  - A moved ant lost for good, dropped far from home. The search finds home in most cases (S1: ≥ 99 % within 600 s). The notice says "didn't make it" only if it dies.
  - Notices spam. Each kind is said once per build: once per sugar stroke, once per crayon line, once per moved ant.

### Open, slice 2

- How strong the painted sign is (`NO_ENTRY_PAINTED` 4) was to be tuned on B7, but it needed no tuning. B7 passes 9/10 on seeds 1–10 and 10/10 on 11–20 (PRD §73.3).

### Aphids (PRD §78, [aphids.md](aphids.md))

A clump of aphids (🐛) the ants find by smell, milk for honeydew, defend where they stand, and now and then eat; it grows, then fades. Its research and its numbers are in its own note.

### What slice 2 built (PRD §73.3)

- **The way home, drawn** (ja-cwjp): a moved ant's walk is traced on the top view from where it was set down, the run of its old vector solid and its search loops dotted, so a child sees the experiment happen. It fades once the ant is home or dead.

- **B7:** with the sign on one branch of a crayon fork, a median 75 % of the ants on the fork took the other branch, against 49 % with no sign. Robinson et al. found 71 %.
- **B8:** of carriers moved 30–60 sideways, 92 % walked to where home would be by their old vector before finding home. All were home within 300 s (median 36.5 s), as Wehner & Srinivasan's displaced ants were. Before the review of #229 dropped their stored route, most walked back by it instead, and got home in 20 s.

## Sources

- Robinson EJH, Jackson DE, Holcombe M, Ratnieks FLW (2005). 'No entry' signal in ant foraging. *Nature* 438:442. [doi:10.1038/438442a](https://doi.org/10.1038/438442a) (via `trails.md`)
- Wehner R, Srinivasan MV (1981). Searching behaviour of desert ants, genus *Cataglyphis*. *J Comp Physiol* 142:315–338. [doi:10.1007/BF00605445](https://link.springer.com/article/10.1007/BF00605445) (abstract only)

- Choe D-H, Villafuerte DB, Tsutsui ND (2012). Trail pheromone of the Argentine ant, *Linepithema humile* (Mayr) (Hymenoptera: Formicidae). *PLoS ONE* 7:e45016. [PMC3447822](https://pmc.ncbi.nlm.nih.gov/articles/PMC3447822/)
- Butterfield T, Bacon J, Hill EM (2025). Identification of trail following and alarm pheromones of *Lasius flavus*. *J Chem Ecol* 51:99. [doi:10.1007/s10886-025-01651-w](https://doi.org/10.1007/s10886-025-01651-w)
- Suckling DM et al. (2008). Pheromone disruption of Argentine ant trail integrity. *J Chem Ecol* 34:1602–1609. [doi:10.1007/s10886-008-9566-4](https://doi.org/10.1007/s10886-008-9566-4) (abstract)
- Wilson EO (1962). Chemical communication among workers of the fire ant *Solenopsis saevissima* (Fr. Smith). *Anim Behav* 10:159–164. [doi:10.1016/0003-3472(62)90143-4](https://doi.org/10.1016/0003-3472(62)90143-4) (not reached)
- Delsuc F (2003). Army ants trapped by their evolutionary history. *PLoS Biol* 1:e37. [PMC261877](https://pmc.ncbi.nlm.nih.gov/articles/PMC261877/)
- Schneirla TC (1944). A unique case of circular milling in ants. *Am Mus Novit* 1253:1–26. (not reached)
- Beckers R, Deneubourg JL, Goss S (1993). Modulation of trail laying in the ant *Lasius niger* and its role in the collective selection of a food source. *J Insect Behav* 6:751–759. [doi:10.1007/BF01201674](https://doi.org/10.1007/BF01201674) (abstract)
- Beckers R, Deneubourg JL, Goss S, Pasteels JM (1990). Collective decision making through food recruitment. *Insectes Soc* 37:258–267. [doi:10.1007/BF02224053](https://doi.org/10.1007/BF02224053) (abstract)
- Evison SEF, Petchey OL, Beckerman AP, Ratnieks FLW (2008). Combined use of pheromone trails and visual landmarks by the common garden ant *Lasius niger*. *Behav Ecol Sociobiol* 63:261–267. [repository](https://sro.sussex.ac.uk/id/eprint/29656/) (not reached)
- Farji-Brener AG et al. (2018). Working in the rain? Why leaf-cutting ants stop foraging. *Insectes Soc* 65:233–239. [doi:10.1007/s00040-018-0605-z](https://doi.org/10.1007/s00040-018-0605-z) (abstract)
- Chandrasekhar A, Gordon DM, Navlakha S (2018). A distributed algorithm to maintain and repair the trail networks of arboreal ants. *Sci Rep* 8:9297. [PMC6006367](https://pmc.ncbi.nlm.nih.gov/articles/PMC6006367/)
- Reid CR, Sumpter DJT, Beekman M (2011). Optimisation in a natural system: Argentine ants solve the Towers of Hanoi. *J Exp Biol* 214:50–58. [doi:10.1242/jeb.048173](https://doi.org/10.1242/jeb.048173)
- Dussutour A, Beekman M, Nicolis SC, Meyer B (2009). Noise improves collective decision-making by ants in dynamic environments. *Proc R Soc B* 276:4353–4361. [PMC2817102](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817102/)
- Goss S, Aron S, Deneubourg JL, Pasteels JM (1989). Self-organized shortcuts in the Argentine ant. *Naturwissenschaften* 76:579–581. [doi:10.1007/BF00462870](https://doi.org/10.1007/BF00462870) (not reached)
- Price RI, Grüter C, Hughes WOH, Evison SEF (2016). Symmetry breaking in mass-recruiting ants: extent of foraging biases depends on resource quality. *Behav Ecol Sociobiol* 70:1813–1820. [PMC5054046](https://pmc.ncbi.nlm.nih.gov/articles/PMC5054046/)
- Grüter C, Schürch R, Czaczkes TJ, Taylor K, Durance T, Jones SM, Ratnieks FLW (2012). Negative feedback enables fast and flexible collective decision-making in ants. *PLoS ONE* 7:e44501. [PMC3440389](https://pmc.ncbi.nlm.nih.gov/articles/PMC3440389/)
- Rajendran H, Weinberger R, Fonio E, Feinerman O (2026). Colony demographics shape nest construction in *Camponotus fellah* ants. *eLife* 13:RP100706. [PMC13102390](https://pmc.ncbi.nlm.nih.gov/articles/PMC13102390/)
- LeBrun EG, Moffett M, Holway DA (2011). Convergent evolution of levee building behavior among distantly related ant species in a floodplain ant assemblage. *Insectes Soc* 58:263–269. [PMC3059759](https://pmc.ncbi.nlm.nih.gov/articles/PMC3059759/)
- Lu Y, Hao D, Liang G (2012). Impact of rainfall on the nesting activity of *Solenopsis invicta*. *Sociobiology* 59(3). [record](https://agris.fao.org/search/en/records/675ad4520e654e779babcd40) (abstract)
- Yadav S, Chakraborty P, Kaul P, Pooja M, Gupta B, Garg A (2020). Ability of children to perform touchscreen gestures and follow prompting techniques when using mobile apps. *Clin Exp Pediatr* 63:232–236. [PMC7303424](https://pmc.ncbi.nlm.nih.gov/articles/PMC7303424/) (full text)
- Vatavu R-D, Cramariuc G, Schipor DM (2015). Touch interaction for children aged 3 to 6 years: experimental findings and relationship to motor skills. *Int J Hum-Comput Stud* 74:54–76. [doi:10.1016/j.ijhcs.2014.10.007](https://doi.org/10.1016/j.ijhcs.2014.10.007) (abstract)
- Nacher V, Jaen J, Navarro E, Catala A, González P (2015). Multi-touch gestures for pre-kindergarten children. *Int J Hum-Comput Stud* 73:37–51. [doi:10.1016/j.ijhcs.2014.08.004](https://doi.org/10.1016/j.ijhcs.2014.08.004) (abstract)
- Anthony L, Brown Q, Nias J, Tate B, Mohan S (2012). Interaction and recognition challenges in interpreting children's touch and gesture input on mobile devices. *ITS 2012*. [doi:10.1145/2396636.2396671](https://doi.org/10.1145/2396636.2396671) (not reached)
- Woodward J et al. (2016). Characterizing how interface complexity affects children's touchscreen interactions. *CHI 2016*. [doi:10.1145/2858036.2858200](https://doi.org/10.1145/2858036.2858200) (not reached)
- Hiniker A et al. (2015). Touchscreen prompts for preschoolers: designing developmentally appropriate techniques for teaching young children to perform gestures. *IDC 2015*. [doi:10.1145/2771839.2771851](https://doi.org/10.1145/2771839.2771851) (abstract)
- Hiniker A, Sobel K, Hong SR, Suh H, Irish I, Kientz JA (2016). Hidden symbols: how informal symbolism in digital interfaces disrupts usability for preschoolers. *Int J Hum-Comput Stud* 90:53–67. [pdf](https://faculty.washington.edu/alexisr/HiddenSymbols.pdf) (abstract)
