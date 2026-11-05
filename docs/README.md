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
| [combat.md](combat.md) | research + design (MR 4) | Narrow ground favours the stronger side (Lymbery et al. 2023); alarm that draws at low doses and repels at high; who retreats when strangers meet at food. Basis for terrain-limited combat, graded alarm and the `contact` response. |
| [queens-and-merging.md](queens-and-merging.md) | research + design (not built) | Several queens, adoption, and orphaned colonies merging as a route to unification. |

## Records

- [PRD.md](PRD.md) is the decision log. It holds every product decision, why it was made, and the measured Jev numbers, milestone by milestone. §1–8 are the removed picture mode.

## Citation convention

- A claim in a note names its source in the text, and the source is listed under the note's **Sources** with a labelled link.
- Primary papers are preferred: the journal page, PubMed Central or the publisher's DOI.
- Links marked *(secondary)* go to news, encyclopaedia, blog or university-news pages. Replace each with the primary paper when the claim is built on.
- Numbers that could only be read in an abstract or a citing paper are marked **unverified** in the note.
