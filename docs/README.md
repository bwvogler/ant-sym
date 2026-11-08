# Docs

Start with **[vision.md](vision.md)**. It covers what the repo is for, what an ant may sense, and which behaviours are still scripted. Every row in it links one of the research notes below, and each note cites primary research in its own Sources section.

## Research notes

| Note | Kind | What it covers |
|---|---|---|
| [ant-communication.md](ant-communication.md) | research | Signal channels (trail, alarm, contact, vibration, trophallaxis), their ranges and lifetimes, recognising rival colonies, and combat laws. |
| [nest-and-home.md](nest-and-home.md) | research + design (built) | How ants find home outside (path integration, landmarks, entrance odour) and inside (gravity, memory, floor marks); the queen; nest architecture; jobs by place and age. Designs nest slices 0–9. |
| [fungus-policy.md](fungus-policy.md) | research + design (built) | What real parasites do to ants (*Rickia*, *Ophiocordyceps*, *Pandora*, supercolonies, response thresholds); about 35 levers the fungus could pull; the fungus policy; more colonies and other species. |
| [tiredness.md](tiredness.md) | research + design (built, MR 3.1) | When a forager gives up a search and how it recovers: search time sets trip length, rest between bouts inside, inactive reserve workers. Basis for the ant's `fatigue`. |
| [trails.md](trails.md) | research + design (MR 3) | The double bridge's shape; trail amount by food quality (Beckers 1993); which journeys lay trail; the "no entry" mark on emptied food (Robinson 2005, 2008). Basis for `trailRate` by quality and the `noEntry` channel. |
| [combat.md](combat.md) | research + design (MR 4) | Narrow ground lets a smaller, stronger side hold off numbers (Lymbery et al. 2023); alarm that draws at low doses and repels at high; who retreats when strangers meet at food. Basis for terrain-limited combat, graded alarm and the `contact` response. |
| [activation.md](activation.md) | research + design (MR 5) | Foragers leave when they meet successful foragers coming home (Gordon; Pinter-Wollman 2013; Pless 2015); a leaky count of contacts with a threshold; patrollers start the day; the colony knows its food only as a rate. Basis for the `leave` response and the strategist's `intake`. |
| [raid-recruitment.md](raid-recruitment.md) | research + design (MR 5.2) | Scouts find a rival nest and recruit before a raid (Polyergus; Temnothorax slave-makers); encounters at a border recruit (honeypot ants, weaver ants). Basis for the `raid` trail and the finder. |
| [queens-and-merging.md](queens-and-merging.md) | research + design (not built) | Several queens, adoption, and orphaned colonies merging as a route to unification. |
| [one-world.md](one-world.md) | design (not built, `ja-lp4`) | The top-down and side views as two views of one game: the surface (a plane) and a curtain under the line through the nests' holes; a new nest only beyond an end of the line; what changes in the colony code; stages U1–U6. |
| [new-queens.md](new-queens.md) | research + design (not built, `ja-lo8`) | When a colony rears new queens (size, the queen's pheromone, workers culling gyne larvae); the nuptial flight and claustral founding; the fungus's two levers on queen birth. |
| [fungus-body.md](fungus-body.md) | research + design (built, `ja-lo8.12`) | What the fungus is made of and what its progress rests on: *Metarhizium* living off-host in soil, spores paid out of mycelium (design), adapting in its hosts over passages, diminishing returns; grooming triggered by sensing the pathogen. Basis for the mycelium at the landing and adaptations from growth in hosts. |

The page's **Learn** drawer quotes these notes in its field guide (`web/src/ui/guide.ts`), linking their headings. `guide.test.ts` fails when a cited heading is renamed or a gap the guide calls scripted is closed: update the entry with the note.

## Writing a new note

A new mechanic starts with a note here. The `adding-mechanics` skill ([.claude/skills/adding-mechanics](../.claude/skills/adding-mechanics/SKILL.md)) has the template: findings that each end with **In the game:**, a **Play** section (what the player sees and chooses, the risks to play, the cost), open questions, and Sources under the convention below.

## Records

- [PRD.md](PRD.md) is the decision log. It holds every product decision, why it was made, and the measured Jev numbers, milestone by milestone. §1–8 are the removed picture mode.

## Citation convention

- A claim in a note names its source in the text, and the source is listed under the note's **Sources** with a labelled link.
- Primary papers are preferred: the journal page, PubMed Central or the publisher's DOI.
- Links marked *(secondary)* go to news, encyclopaedia, blog or university-news pages. Replace each with the primary paper when the claim is built on.
- Numbers that could only be read in an abstract or a citing paper are marked **unverified** in the note.
