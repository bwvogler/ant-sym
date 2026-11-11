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
| Landmarks and entrance odour | corrects the vector near home; while searching, the colony's own smell on its mound leads to the hole | near the hole; on one world's plane, the ant's own mound while its vector has run out (`ja-lp4.11`) | [nest-and-home §1](nest-and-home.md#outside-home-is-the-hole), [nest-search](nest-search.md) |
| Floor marks ("road signs") | which chamber this is; turns at decision points | local, underground | [nest-and-home §1](nest-and-home.md#inside-gravity-memory-and-road-signs) |
| Queen pheromone | where the queen is; whether the colony has a queen; faint in a big nest, so new queens are reared | within the nest; carried on workers and passed by contact | [nest-and-home §1](nest-and-home.md#the-queen), [queens-and-merging §2](queens-and-merging.md#2-what-ants-do), [new-queens §2](new-queens.md#2-the-queen-holds-it-back) |
| Brood | dig here, tend here | local | [nest-and-home §1](nest-and-home.md#nest-structure) |
| Own body | age, hunger, load, fatigue | internal | [fungus-policy §3](fungus-policy.md#3-what-real-parasites-do-to-ants) (response thresholds) |

**Not yet researched:** corpse odour, which matters for the midden. Write a note, with primary sources, before building on it. What a fungus senses inside its host is in [fungus-policy §11](fungus-policy.md#11-what-the-fungus-senses-inside-an-ant-and-its-levers). Most of it is marked design: no paper shows a fungus reading those cues.

## Where the code is today

**The policy surface.**
- **Mode.** The colony policy picks one `Mode` of four (`explore`, `follow`, `return`, `fight`), and only for an ant that carries nothing (`colony.ts`, `Mode`, `Situation`). Its `Situation` has six fields:
  - `mode` and `tired`: the ant's own state, which is sensed;
  - `foodTrail` and `alarm`: from the antenna sensors, which is sensed;
  - `homeTrail`: on the ground, the home trail. Underground, it is the chamber's role, read from the chamber table (meant as floor smell);
  - `enemy`: strangers within two cells, recognised by odour.
- **Stance.** On the top-down map each ant's stance (`forage`, `defend`, `raid`) is its own, from what it senses: defend while it senses a threat near its nest, raid once a raid trail or its own errand recruited it ([stance](stance.md)). On the side view the colony's `Stance` is still chosen from colony-wide and map-wide totals (`StanceSituation`) and broadcast to every ant: no ant senses it.

**Everything else is scripted.** Each row below is a behaviour that a mechanic chooses for the ant, using knowledge the ant could not sense, and the sensed cue that could drive it instead.

| Scripted behaviour | Where | What it reads that an ant can't sense | Sensed cue that could drive it | Bead |
|---|---|---|---|---|
| ~~Leaving the nest: a rested forager home goes straight out~~ | ~~the arrival rule~~ | ~~nothing: it ignored whether anyone was finding food~~ | built in MR 5 on top-down maps: a waiting forager leaves on contacts with nestmates bringing food, scouts now and then ([activation](activation.md)); the side view still sends it straight out (`ja-web`) | ~~`ja-um8`~~ |
| Work by age: young nurse, middle-aged dig and carry, old forage (and only the old end a trip home: `arrive`, behaviour MR 2) | `band`, `#mayGoOut`, `#digs`, `#staysIn`, the arrival rule | fixed age thresholds | response thresholds over brood signal and encounter rate; age only shifts the threshold ([nest-and-home: places with jobs](nest-and-home.md#places-with-jobs), [fungus-policy A7](fungus-policy.md#a-perception-what-the-host-senses)). **Porting and nursing built** (`ja-xu6.1`, PRD §50.18): an old ant works inside when the hunger it feels by touch passes a threshold age raises; going out, digging and arrival are still by age | `ja-k4k.1` |
| Steering to the queen and to the hole | `#toBrood`, `#climbOut`, `#outField`, `#walkTunnel` | the queen's exact position; a whole-nest distance field; exact depth; the true goal vector when stuck | queen pheromone, gravity, floor marks, the drifting vector ([nest-and-home §1](nest-and-home.md#inside-gravity-memory-and-road-signs)) | `ja-k4k.2`, with `ja-ipu`, `ja-cwu` |
| Digging gate, chamber placement and roles | `crowded`, `#newChamberWay`, `#chamberRoom`, `#roleFor` | the colony's total floor per ant; every chamber of every colony; a role fixed at founding | local crowding (encounter rate); brood as the digging template; roles from what is kept there ([nest-and-home: nest structure](nest-and-home.md#nest-structure)) | `ja-k4k.3` |
| Nursing, porters, food flow | `#nurse`, `#port`, `#wanted`, `feed`, `#alatesOut` | the least-tended brood chamber colony-wide; every chamber's unmet need; food added straight to stores; a larva's and a waiting alate's chamber food, from the chamber table | brood and hunger signals by contact; trophallaxis; food that has to be carried ([ant-communication §1](ant-communication.md#1-how-many-channels)). **Hunger by contact and trophallaxis built** (`ja-xu6.1`, PRD §50.18): begging larvae, hungry adults and a queen who can't lay are felt within one cell and passed on, and draw ants to the stores' marks; where a porter takes food (`#wanted`, which now counts hungry adults too) still reads every chamber | `ja-k4k.4` |
| Midden, mound, backfill | `#middenSide`, `#byANest`, `#byAnEntrance`, `#occupied`; the mound's reach in `#carryOut` and the side view's walk out (`#heaped`); `#pickPlane`'s flank test | the rival's hole position; every nest and entrance; a scan of every ant; the colony's total soil brought out (`#heaped`), which sets how far a spoil carrier walks before it drops, in the side view and on one world's plane; the true cell of the ant's own hole, for which neighbour is "farther out" on a flank (one world's plane) | corpse odour (not yet researched); distance from the entrance by the vector; local occupancy ([nest-and-home: places with jobs](nest-and-home.md#places-with-jobs)); for the reach, walk out until the ground underfoot leaves the mound's top (the spoil the carrier feels underfoot, as the midden's off-mound rule reads it); for the flank, "farther out" by the ant's own vector, as its spreading heading already is | `ja-k4k.5` |
| In its own nest or a stranger's (`Touch.place` "out" underground; where trips end) | `#inOwnNest` | every other colony's hole position | its own colony's floor odour or home field underfoot ([nest-and-home §1](nest-and-home.md#inside-gravity-memory-and-road-signs)) | `ja-k4k.2` |
| ~~Tiredness: a timer only the hole resets~~ | ~~`since` vs `patience`~~ | ~~time at the hole (never inside); any load put down or fight counts as success~~ | built in MR 3.1: `fatigue` grows only while searching outside empty-jawed, resets on finding food, recovers while resting inside ([tiredness](tiredness.md)) | ~~`ja-q47`~~ |
| Stance and raids (side view) | `StanceSituation` (`game.ts`), `raidTarget` | colony totals; the rival hole's coordinates. Top-down, built: ~~the strategist's totals~~ each ant's own stance (defend on a sensed threat near home, raid once recruited; raid scouts on the `leave` answer "raid", [stance](stance.md)), and raiders follow a scout's trail ([raid-recruitment](raid-recruitment.md)) | alarm, encounter rates, recruitment trails laid by scouts ([ant-communication §3](ant-communication.md#3-rival-colonies)); underground, trails in the tunnels (`ja-1a9`) | `ja-k4k.6` |
| A founding or young colony's queen feeds her brood (as two nurses), and her first eggs become nanitics | `#nestLife` (`founding`, `incipient`) | whether any worker, or any worker reared by workers, has eclosed anywhere in the colony | begging felt by contact (hunger.ts) with few workers met; larvae fed by the queen herself | `ja-k4k.13` |
| Grooming: every nestmate within reach grooms a host, at a fixed rate, up to a cap (4; a queen 8 in the evolving game, a stop-gap from `ja-lo8.12`) | `Fungus.step`, `#stepQueen` | who is a nestmate, by colony index rather than odour; nothing chooses it, and it costs the groomer nothing | the pathogen cue on the cuticle (fungal ergosterol, sickness cues), recognition by odour, the retinue drawn by queen pheromone ([fungus-body §4](fungus-body.md#4-grooming-and-the-queen)) | `ja-k4k.12` |

## The fungus

**Today** (`fungus.ts`, `fungalPolicy.ts`, `levers.ts`; since `ja-lo8.4`). The fungus senses its host's body and sets a level for every lever, per fungal situation ([fungus-policy §11](fungus-policy.md#11-what-the-fungus-senses-inside-an-ant-and-its-levers)):
- **What it senses:** arousal (perceived alarm, strangers close), touch (a nestmate or a foreigner on the cuticle), place (the substrate underfoot, the queen's mark), task (age band, standing in for juvenile hormone), carrying and grooming. Neither the host's mode nor a chamber's owner is read.
- **On perception:** gains on food, rival trails, home, alarm, stranger scent, floor marks and the queen's scent (`ja-lo8.9`), and the felt time out.
- **On emission:** trail laid, trail leaked to other colonies, alarm laid, a calming cue, the fungus's own odour, how much of the fungus shows to groomers, and, in a queen, how much of her signal she gives off (`ja-lo8.7`).
- **Lethal, off until the player turns them on:** the odour weapon, and `crown`, which passes a lethal infection to the queen and brood its host tends, as a chance per second (`regicide`).
- **Its own effectors:** spores on the ground, contact spread, and Bloom corpses on the midden that sporulate.
- **Its body and its progress** (`evolution.ts`, `ja-lo8.12`): in the game it lands weak and takes root as a mycelium by the hole, which grows and pays for the spores it puts out; every bit of new fungus can mutate, so mutations come as fast as it grows, and the player keeps them as its spread traits or to how far each group of levers may reach ([fungus-body](fungus-body.md)). Reach holds a level where it takes effect; Jev is asked the full range.

The gaps:
- ~~**The fungal situation reads things a fungus can't sense** (its host's mode; the chamber table's owner)~~: closed by `ja-lo8.4` (`ja-k4k.7`). Most of the new senses are marked design in §11: no paper shows a fungus reading them.
- **The fungus has no scent of its own on the ground,** and no choice of where or when to sporulate, such as summiting (`ja-k4k.8`).

The biology and the full catalogue of levers:
- [fungus-policy §2](fungus-policy.md#2-two-policies-and-the-perceived-state-between-them): two policies, and the perceived state between them;
- [fungus-policy §3](fungus-policy.md#3-what-real-parasites-do-to-ants): what real parasites do;
- [fungus-policy §4](fungus-policy.md#4-the-levers-the-fungus-can-pull): about 35 levers sorted into perception, recognition, emission, body, spread and world;
- [fungus-policy §11](fungus-policy.md#11-what-the-fungus-senses-inside-an-ant-and-its-levers): the game's account of what the fungus senses inside an ant, and its perception and emission levers;
- [new-queens](new-queens.md): when a colony rears new queens, and the fungus's two levers on it (queen signal and queen scent).

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
