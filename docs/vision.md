# Vision: one sensed policy, and a fungus that works through the senses

*Where the repo is going, and how far the code is from it. Every biological claim here points at a research note in this folder, and each note cites its primary sources ([index](README.md)). Code references are to `web/src/colony/` on 2026-11-03. The work is tracked under the bead epic `ja-k4k`.*

## The goal

1. **Each species, and each colony, has one policy.** Every choice an ant makes comes out of that policy: where to walk, whether to dig, what to carry, whom to fight, where to rest. The policy's only input is what that ant can **sense**: odour on the ground and in the air, contact with another ant, vibration, gravity, its own drifting home vector, its own body. The sensing is grounded in research on what real ants perceive. Specialisation, such as nurses, diggers, foragers, undertakers and chamber roles, should *emerge* from that one policy acting on local cues. It should not be scripted beside it.
2. **The fungus works through the ants' senses.** It augments, damps or rewrites what a host perceives and what a host gives off. It responds to signals the *fungus* can sense: contact chemistry, its own load, the substrate. It also has effectors of its own: sporulation, a scent of its own, and the body of a host near the end. It never decides for an ant. The ant still makes its own choice, from a perceived world the fungus has bent.
3. **The fungus turns conflict into collaboration and specialisation.** The baseline behaviour of rival colonies is competition. The player's fungus shapes its policy so that colonies tolerate each other, share trails and divide work, until they act as one.
4. **The ladder: more and more capable organisms.** The same pattern of a sense table plus an action set under one policy shape extends to other ant species, then to other social insects, and then beyond. The fungus adapts its policy to each new host it can reach. The steps after ants are deliberately left open.

**Decisions versus body.** Physiology may stay mechanics: ageing, egg laying, hunger, death, pheromone decay, a queen's output. Every *choice* must come from the policy. A scripted choice that reads something an ant could not sense, such as the chamber table, another nest's coordinates or a colony-wide count, is a gap to close. The rule for new code is in [CLAUDE.md](../CLAUDE.md).

## What an ant can sense

This is the budget the policy may draw on. Each row points to the research section that grounds it. Ranges are at ant scale; the game keeps the *ratios* ([ant-communication §2](ant-communication.md#2-distance-and-time-scales)).

| Channel | What it tells the ant | Range and time | Research |
|---|---|---|---|
| Trail pheromones (several per species) | food, route memory, "no entry" | about 1 cm active space; half-life from minutes to days | [ant-communication §1](ant-communication.md#1-how-many-channels), [§2](ant-communication.md#2-distance-and-time-scales) |
| Alarm | danger; faint attracts, strong triggers attack or digging | a few cm; fades in seconds | [ant-communication TL;DR](ant-communication.md#tldr), [fungus-policy A5](fungus-policy.md#a-perception-what-the-host-senses) |
| Cuticular hydrocarbons (contact) | nestmate, stranger, another species | contact only | [ant-communication §3](ant-communication.md#3-rival-colonies), [fungus-policy §3](fungus-policy.md#3-what-real-parasites-do-to-ants) |
| Encounter rate (antennation) | how many foragers are returning with food; local crowding | contact; a rate over seconds to minutes | [ant-communication §1](ant-communication.md#1-how-many-channels) (Gordon) |
| Vibration (stridulation) | come here, dig here, buried nestmate | short, through the substrate | [ant-communication §1](ant-communication.md#1-how-many-channels) |
| Trophallaxis | food, hunger, hormones, colony odour | mouth to mouth | [ant-communication §1](ant-communication.md#1-how-many-channels) |
| Taste | the quality of food in the jaws (sugar strength) | contact, at pickup | [trails](trails.md#trail-amount-follows-food-quality) (Beckers et al. 1993) |
| Gravity | up and down in the dark | everywhere underground | [nest-and-home §1](nest-and-home.md#inside-gravity-memory-and-road-signs) |
| Path integration | a home vector whose error grows by about 10 % of distance | outside; resets inside the nest | [nest-and-home §1](nest-and-home.md#outside-home-is-the-hole) |
| Landmarks and entrance odour | corrects the vector near home | near the hole | [nest-and-home §1](nest-and-home.md#outside-home-is-the-hole) |
| Floor marks ("road signs") | which chamber this is; turns at decision points | local, underground | [nest-and-home §1](nest-and-home.md#inside-gravity-memory-and-road-signs) |
| Queen pheromone | where the queen is; whether the colony has a queen | within the nest | [nest-and-home §1](nest-and-home.md#the-queen), [queens-and-merging §2](queens-and-merging.md#2-what-ants-do) |
| Brood | dig here, tend here | local | [nest-and-home §1](nest-and-home.md#nest-structure) |
| Own body | age, hunger, load, fatigue | internal | [fungus-policy §3](fungus-policy.md#3-what-real-parasites-do-to-ants) (response thresholds) |

**Not yet researched:** corpse odour, which matters for the midden, and the substrate cues a fungus can sense. Write a note, with primary sources, before building on either.

## Where the code is today

**The policy surface.**
- **Mode.** The colony policy picks one `Mode` of four (`explore`, `follow`, `return`, `fight`), and only for an ant that carries nothing (`colony.ts`, `Mode`, `Situation`). Its `Situation` has six fields:
  - `mode` and `tired`: the ant's own state, which is sensed;
  - `foodTrail` and `alarm`: from the antenna sensors, which is sensed;
  - `homeTrail`: on the ground, the home trail. Underground, it is the chamber's role, read from the chamber table (meant as floor smell);
  - `enemy`: strangers within two cells, recognised by odour.
- **Stance.** The colony's `Stance` (`forage`, `defend`, `raid`) is chosen from colony-wide and map-wide totals (`StanceSituation`) and broadcast to every ant. No ant senses it.

**Everything else is scripted.** Each row below is a behaviour that a mechanic chooses for the ant, using knowledge the ant could not sense, and the sensed cue that could drive it instead.

| Scripted behaviour | Where | What it reads that an ant can't sense | Sensed cue that could drive it | Bead |
|---|---|---|---|---|
| ~~Leaving the nest: a rested forager home goes straight out~~ | ~~the arrival rule~~ | ~~nothing: it ignored whether anyone was finding food~~ | built in MR 5 on top-down maps: a waiting forager leaves on contacts with nestmates bringing food, scouts now and then ([activation](activation.md)); the side view still sends it straight out (`ja-web`) | ~~`ja-um8`~~ |
| Work by age: young nurse, middle-aged dig and carry, old forage (and only the old end a trip home: `arrive`, behaviour MR 2) | `band`, `#mayGoOut`, `#digs`, `#staysIn`, the arrival rule | fixed age thresholds | response thresholds over brood signal and encounter rate; age only shifts the threshold ([nest-and-home: places with jobs](nest-and-home.md#places-with-jobs), [fungus-policy A7](fungus-policy.md#a-perception-what-the-host-senses)) | `ja-k4k.1` |
| Steering to the queen and to the hole | `#toBrood`, `#climbOut`, `#outField`, `#walkTunnel` | the queen's exact position; a whole-nest distance field; exact depth; the true goal vector when stuck | queen pheromone, gravity, floor marks, the drifting vector ([nest-and-home §1](nest-and-home.md#inside-gravity-memory-and-road-signs)) | `ja-k4k.2`, with `ja-ipu`, `ja-cwu` |
| Digging gate, chamber placement and roles | `crowded`, `#newChamberWay`, `#chamberRoom`, `#roleFor` | the colony's total floor per ant; every chamber of every colony; a role fixed at founding | local crowding (encounter rate); brood as the digging template; roles from what is kept there ([nest-and-home: nest structure](nest-and-home.md#nest-structure)) | `ja-k4k.3` |
| Nursing, porters, food flow | `#nurse`, `#port`, `#wanted`, `feed` | the least-tended brood chamber colony-wide; every chamber's unmet need; food added straight to stores | brood and hunger signals by contact; trophallaxis; food that has to be carried ([ant-communication §1](ant-communication.md#1-how-many-channels)) | `ja-k4k.4` |
| Midden, mound, backfill | `#middenSide`, `#byANest`, `#byAnEntrance`, `#occupied` | the rival's hole position; every nest and entrance; a scan of every ant | corpse odour (not yet researched); distance from the entrance by the vector; local occupancy ([nest-and-home: places with jobs](nest-and-home.md#places-with-jobs)) | `ja-k4k.5` |
| In its own nest or a stranger's (`Touch.place` "out" underground; where trips end) | `#inOwnNest` | every other colony's hole position | its own colony's floor odour or home field underfoot ([nest-and-home §1](nest-and-home.md#inside-gravity-memory-and-road-signs)) | `ja-k4k.2` |
| ~~Tiredness: a timer only the hole resets~~ | ~~`since` vs `patience`~~ | ~~time at the hole (never inside); any load put down or fight counts as success~~ | built in MR 3.1: `fatigue` grows only while searching outside empty-jawed, resets on finding food, recovers while resting inside ([tiredness](tiredness.md)) | ~~`ja-q47`~~ |
| Stance and raids | `StanceSituation` (`game.ts`), `raidTarget` | ~~map-wide food~~ (MR 5: the colony's intake, the rate food comes home, [activation](activation.md)); colony totals; the rival hole's coordinates | alarm, encounter rates, recruitment trails laid by scouts ([ant-communication §3](ant-communication.md#3-rival-colonies)) | `ja-k4k.6` |

## The fungus

**Today** (`fungus.ts`, `fungalPolicy.ts`). The fungus picks an intervention per fungal situation. Most of its levers already act the right way:
- **On perception:** `soothe`, `share`, `roam` and `muddle` change channel gains, tolerance, the clock and floor marks.
- **On emission:** `blend` and `cull` change the host's odour; `share` changes trail laying; `soothe` quiets the host.
- **On the body:** `crown` passes a lethal infection to the queen and brood its host tends, as a chance per second (`regicide`).
- **Its own effectors:** spores on the ground, contact spread, and Bloom corpses on the midden that sporulate.

The gaps:
- **The fungal situation reads things a fungus can't sense.** Its `host` field is read straight from the ant's mode. In the side view, `ground` comes from the chamber table's owner. It should rest on what the fungus could sense: contact chemistry, its own load and the substrate (`ja-k4k.7`).
- **The fungus has no scent of its own on the ground,** and no choice of where or when to sporulate, such as summiting (`ja-k4k.8`).

The biology and the full catalogue of levers:
- [fungus-policy §2](fungus-policy.md#2-two-policies-and-the-perceived-state-between-them): two policies, and the perceived state between them;
- [fungus-policy §3](fungus-policy.md#3-what-real-parasites-do-to-ants): what real parasites do;
- [fungus-policy §4](fungus-policy.md#4-the-levers-the-fungus-can-pull): about 35 levers sorted into perception, recognition, emission, body, spread and world.

## The ladder

1. **Colonies of one species become one.**
   - Recognition odours converge, as in supercolonies.
   - An orphaned colony merges into a neighbour it tolerates ([queens-and-merging §3.3](queens-and-merging.md#33-orphans-merging-a-unification-route)).
2. **Species ally without merging (parabiosis).**
   - Each species keeps its own odour.
   - Strains get a host range ([fungus-policy §10](fungus-policy.md#10-more-colonies-and-other-species-planned-with-mr-8-ja-8fd); species framework `ja-8fd`, waves `ja-jhd`, `ja-v06`).
3. **Beyond ants: open.** Each new organism brings:
   - its own sense table, a new version of the one above;
   - its own action set;
   - its own species parameters over the same policy shape.

   The fungus learns a policy per host range.

## How a gap gets closed

One scripted behaviour per change:
1. Add the sensed field, or the action, that the policy needs.
2. Delete the global read.
3. Measure the behaviour before and after.
4. Note the new token cost for the lane in the PR, as CLAUDE.md requires. A new situation field multiplies the question space, so look for a steering-only route first ([ant-communication §1](ant-communication.md#1-how-many-channels): steering is free, the situation is paid).
5. Close the row's bead and strike the row here.
