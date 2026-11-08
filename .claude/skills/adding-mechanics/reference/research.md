# Research: finding and writing up the biology

The notes in `docs/` are the project's ground truth for what real ants (and the fungus) do. Every mechanic built so far that held up started from one; the ones that did not (see history.md) were reworked once a note was written. Copy the shape of `docs/activation.md` or `docs/tiredness.md` (short, one behaviour each) for a new behaviour, and of `docs/one-world.md` or `docs/queens-and-merging.md` for a design that spans many changes.

## Contents
- Search method
- Rigour rules
- Note template
- Checks before moving on

## Search method

1. **Start broad, then go to the source.** Search for the phenomenon in plain words ("ant forager giving-up time", "ant nest excavation template brood"), then follow the citations back to the paper that measured it. A review is a map to primary papers, not a source to cite for numbers.
2. **Name the organism.** Behaviour differs by genus: *Lasius niger*, *Pogonomyrmex barbatus*, *Temnothorax*, *Cataglyphis*, *Atta*, *Linepithema humile*, *Formica*; for the fungus, *Metarhizium*, *Beauveria*, *Ophiocordyceps*, *Pandora*, *Rickia*. Say which ant the number comes from, and whether the game's ant is meant to be like it.
3. **Look for the mechanism, not just the outcome.** The game needs the cue an individual senses and the response it makes (an encounter rate and a threshold), not the colony-level result ("colonies regulate foraging").
4. **Look for counter-evidence.** Search for the same phenomenon with "not", "absent", "fails", other species. A behaviour found in one lab species may not generalise.
5. **Prefer:** PubMed Central, the publisher's DOI page, journal pages, bioRxiv (mark as preprint). Use Google Scholar results to find them.
6. **When a paper is out of reach** (paywall, network allowlist), use the abstract and citing papers, mark every number **unverified**, and say in the note's header what could not be fetched.

Use subagents for broad searches so the main context keeps the conclusions, not the pages: give each one question, the species, and ask for citations with links and which numbers it read in full text.

## Rigour rules

These follow `docs/README.md` ("Citation convention"):
- Every claim names its source in the text (authors, year), and the source is listed under **Sources** with a labelled link.
- Primary papers are preferred: the journal page, PubMed Central or the publisher's DOI.
- Secondary links (news, encyclopaedia, blogs, university press) are marked *(secondary)*; replace each with the primary paper before the claim is built on.
- A number read only in an abstract or a citing paper is marked **unverified**.
- Anything recalled rather than fetched is marked "(from memory; not fetched)". Don't build a mechanic on it until it is fetched.
- Invented parts of a mechanic are marked **design**: "no paper shows a fungus doing this".
- Write what was looked for and not found ("No measured give-up time was found").

## Note template

```markdown
# <Behaviour>: <one-line claim in plain words>

*Research note for bead `<id>` (<MR or stage>, PRD §<n>). Written <date>, against code at `<short sha>`. <What could not be fetched; numbers from abstracts are marked **unverified**.>*

<Two or three lines: what the game does today, what is wrong with it (measured if possible), and the question this note answers.>

## <Finding 1 as a claim, e.g. "A waiting forager leaves when it meets successful foragers">

- <Species, what was measured, the number.> Sources: <Author et al. year (Journal vol:page)>. **Unverified** <if so>.
- <Contrary or limiting evidence.>

**In the game:** <the cue the ant senses (sense-table row), the response, the local rule, what is **design**.>

## <Finding 2 …>

…

## What was not found

- <Searched for X; no measurement found.>

## The mechanic

<The proposal, cheapest first. For each: the sensed cue, the action or response hook, the local rule and its "off" setting, the new gap rows it closes or opens, the assay and its literature target, the estimated Jev cost (steering is free; a situation field is paid).>

## Play

<From play.md: what the player sees, chooses and feels; risks to play and how we would notice.>

## Open questions

- <Decisions for the owner; measurements still to make.>

## Sources

- <Author A, Author B (year). Title. *Journal* vol:pages.> [doi:…](https://doi.org/…)
- <…> [PMC…](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC…/)
- <…> *(secondary)* [site](https://…)
```

After the mechanic is built, add a `## What MR <n> built from this (PRD §<n>)` section before Sources, including what the measurements overturned (`docs/combat.md` "What MR 4 found: no cap is needed" is the model).

## Checks before moving on

- [ ] Every number has a named source and a link under Sources, or is marked unverified / from memory.
- [ ] Each finding ends with **In the game:**.
- [ ] Contrary evidence and "not found" are written down.
- [ ] Any sense the mechanic uses is in vision.md's sense table, or this note is what admits it (and a row is added).
- [ ] The note is linked from `docs/README.md` with its kind (research / research + design (not built, `<bead>`)).
