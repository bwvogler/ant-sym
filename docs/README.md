# Docs

Start with **[vision.md](vision.md)**. It covers what the repo is for, what an ant may sense, and which behaviours are still scripted. Every row in it links one of the research notes below, and each note cites primary research in its own Sources section.

## Research notes

| Note | Kind | What it covers |
|---|---|---|
| [ant-communication.md](ant-communication.md) | research | Signal channels (trail, alarm, contact, vibration, trophallaxis), their ranges and lifetimes, recognising rival colonies, and combat laws. |
| [nest-and-home.md](nest-and-home.md) | research + design (built) | How ants find home outside (path integration, landmarks, entrance odour) and inside (gravity, memory, floor marks); the queen; nest architecture; jobs by place and age. Designs nest slices 0–9. |
| [nest-search.md](nest-search.md) | research + design (built, `ja-lp4.11`) | How a homing ant searches when its vector runs out at no nest: loops back through that spot, wider after a longer trip (Wehner & Srinivasan 1981; Müller & Wehner 1994; Merkle et al. 2006), and its colony's smell near the nest, followed only while searching (Buehlmann et al. 2012; Sturgis et al. 2011). All from abstracts (unverified). Basis for one world's centred search loops and the mound's smell (PRD §56). |
| [forager-trips.md](forager-trips.md) | research + design (built, switched off, `ja-lp4.15`) | What keeps a forager's way home short: a trip ends on search time (Beverly et al. 2009), the ant reads its uncertainty from its vector's length (Merkle & Wehner 2010), and foragers go back to their last find (Buchkremer & Reinhold 2008; Wolf et al. 2012). All from abstracts (unverified). Basis for one world's shorter search on the plane and site fidelity, both built and off (PRD §58). |
| [route-memory.md](route-memory.md) | research + design (not built, `ja-lp4.16`) | What an ant does when its home vector points through rock: route memories beside path integration (Collett et al. 2013; Mangan & Webb 2012), backtracking when lost (Wystrach et al. 2013), one-way routes and slowly learnt detours (Wehner et al. 2006; Wystrach et al. 2020). All from abstracts (unverified). Basis for one world's route memory: a carrier retraces its own way out when its vector fails (PRD §59). |
| [fungus-policy.md](fungus-policy.md) | research + design (built) | What real parasites do to ants (*Rickia*, *Ophiocordyceps*, *Pandora*, supercolonies, response thresholds); about 35 levers the fungus could pull; the fungus policy; more colonies and other species. |
| [tiredness.md](tiredness.md) | research + design (built, MR 3.1) | When a forager gives up a search and how it recovers: search time sets trip length, rest between bouts inside, inactive reserve workers. Basis for the ant's `fatigue`. |
| [trails.md](trails.md) | research + design (MR 3) | The double bridge's shape; trail amount by food quality (Beckers 1993); which journeys lay trail; the "no entry" mark on emptied food (Robinson 2005, 2008). Basis for `trailRate` by quality and the `noEntry` channel. |
| [combat.md](combat.md) | research + design (MR 4) | Narrow ground lets a smaller, stronger side hold off numbers (Lymbery et al. 2023); alarm that draws at low doses and repels at high; who retreats when strangers meet at food. Basis for terrain-limited combat, graded alarm and the `contact` response. |
| [activation.md](activation.md) | research + design (MR 5) | Foragers leave when they meet successful foragers coming home (Gordon; Pinter-Wollman 2013; Pless 2015); a leaky count of contacts with a threshold; patrollers start the day; the colony knows its food only as a rate. Basis for the `leave` response and the strategist's `intake`. |
| [raid-recruitment.md](raid-recruitment.md) | research + design (MR 5.2) | Scouts find a rival nest and recruit before a raid (Polyergus; Temnothorax slave-makers); encounters at a border recruit (honeypot ants, weaver ants). Basis for the `raid` trail and the finder. |
| [stance.md](stance.md) | research + design (top-down) | Defence as an individual's threshold raised by alarm and encounters (pavement ants, *Pheidole*); hunger does not raise aggression (Argentine ants); crowded colonies raid (fire ants). Basis for each ant's own stance and the `leave` answer "raid". |
| [queens-and-merging.md](queens-and-merging.md) | research + design (not built) | Several queens, adoption, and orphaned colonies merging as a route to unification. |
| [entrances.md](entrances.md) | research (`ja-nzx`) | How many entrances colonies keep (more as they grow, into one entrance chamber: Gordon 2025), nightly sealing and plugging, and the depth cues a digger has (CO₂, moisture, temperature, light). Decision: the crust stays a mechanic; `ja-4h2` deferred. |
| [one-world.md](one-world.md) | design (U1–U3a built, `ja-lp4`) | The top-down and side views as two views of one game: the surface (a plane) and a curtain under the line through the nests' holes; a new nest only beyond an end of the line; what changes in the colony code; stages U1–U6. |
| [nest-spacing.md](nest-spacing.md) | research (`ja-lp4.7`) | How far apart mature colonies sit (harvester ants 9–14 m, overdispersed by deaths, not by landing), where young colonies survive, and how far founding queens fly. Proposes one world's flight and landing radius; keeps the hole gap and clearance. |
| [new-queens.md](new-queens.md) | research + design (built: `ja-lo8.7`, `ja-lo8.9`; PRD §50.19) | When a colony rears new queens (size, the queen's pheromone, workers culling gyne larvae); the nuptial flight and claustral founding; the fungus's two levers on queen birth. |
| [desert-ant.md](desert-ant.md) | research + design (not built, `ja-rf5`) | A third species, the desert ant *Cataglyphis*: solitary foragers with no trails, path integration plus food-odour plumes, a thermal window, small colonies, aggression between colonies. Four papers read in full text (Razin 2013, Dillier & Wehner 2004, Buehlmann 2012 and 2013); the rest from abstracts or summaries (unverified). Basis for the species epic and what the species descriptor must express (PRD §60). |
| [fungus-body.md](fungus-body.md) | research + design (built, `ja-lo8.12`) | What the fungus is made of and what its progress rests on: *Metarhizium* living off-host in soil, spores paid out of mycelium (design), adapting in its hosts over passages, diminishing returns; grooming triggered by sensing the pathogen. Basis for the mycelium at the landing and adaptations from growth in hosts. |
| [hyphal-growth.md](hyphal-growth.md) | research + design (not built, `ja-2bw`) | How a mycelium explores: tips extend at a steady average rate (Hopke 2021: *Metarhizium* 1.3 µm/min), branch to keep length per tip constant (Trinci 1974), slide along or split at obstacles and turn from their own hyphae (Held 2019), fed by the network in proportion to their number (Roper 2013). Basis for hyphae in the soil and the growth policy. |

The page's **Learn** drawer quotes these notes in its field guide (`web/src/ui/guide.ts`), linking their headings. `guide.test.ts` fails when a cited heading is renamed or a gap the guide calls scripted is closed: update the entry with the note.

## Writing a new note

A new mechanic starts with a note here. The `adding-mechanics` skill ([.claude/skills/adding-mechanics](../.claude/skills/adding-mechanics/SKILL.md)) has the template: findings that each end with **In the game:**, a **Play** section (what the player sees and chooses, the risks to play, the cost), open questions, and Sources under the convention below.

## Records

- [hosting.md](./hosting.md) (operations, not a research note, so not in the field guide): GitHub Pages for `main`, a preview per PR, and the Cloudflare Worker that hosts Jev for them behind a passphrase and a daily cap. Setup steps.
- [agent-guide.md](./agent-guide.md) (how agent instructions are written, and the code style an agent follows; its size budget is held by `ui/tests/agentDocs.test.ts`).
- [refactor.md](./refactor.md) (a roadmap, not a research note): the foundation refactor before new species, structures and UI, stages S0–S6 (`ja-fnd`, PRD §57).
- [species.md](./species.md) (a design, not a research note): what a species is in this code, the three tiers a species can differ in, the `Species` descriptor at tier 1 and the order of work (`ja-fnd.5.3`, PRD §62).
- [PRD.md](PRD.md) is the decision log. It holds every product decision, why it was made, and the measured Jev numbers, milestone by milestone. §1–8 are the removed picture mode.

## Citation convention

- A claim in a note names its source in the text, and the source is listed under the note's **Sources** with a labelled link.
- Primary papers are preferred: the journal page, PubMed Central or the publisher's DOI.
- Links marked *(secondary)* go to news, encyclopaedia, blog or university-news pages. Replace each with the primary paper when the claim is built on.
- Numbers that could only be read in an abstract or a citing paper are marked **unverified** in the note.
