# Plan: the docs and beads that come before code

Everything here is written and committed before the first line of code. The check script (`scripts/check-plan.sh`) verifies the parts a script can see; the owner reviews the rest.

## Contents
- Order
- docs/README.md row
- vision.md rows
- PRD section stub
- Beads: epic and children
- Commit

## Order

1. The note in `docs/` (research, mechanic, play, open questions, sources).
2. Its row in `docs/README.md`.
3. vision.md: sense-table row (new sense), gap-table row (a scripted read added, or one this closes, with its bead).
4. The PRD section stub.
5. The bead epic and children, with dependencies.
6. One commit with the docs and the beads export; then the check; then the owner's review.

## docs/README.md row

Add to the "Research notes" table, matching the others:

```markdown
| [<topic>.md](<topic>.md) | research + design (not built, `<epic-id>`) | <one or two sentences: what it covers, the papers it leans on>. Basis for <the mechanic>. |
```

Kinds in use: `research`, `design (not built, <bead>)`, `research + design (not built, <bead>)`, `research + design (built, MR n)`. Update the kind when it is built.

## vision.md rows

- **New sense** (sense table): `| <Channel> | <what it tells the ant> | <range and time> | [<note> §](<note>.md#<anchor>) |`. Remove it from "Not yet researched" if it was there.
- **A scripted read the mechanic adds** (avoid it; if unavoidable, record it): a gap-table row with the code symbols, what it reads, the sensed cue that could replace it, and a `ja-k4k` child bead.
- **A gap the mechanic will close**: leave the row; the build strikes it ("~~…~~ built in MR n: …") when done.

## PRD section stub

Append the next number to `docs/PRD.md` (`grep -n '^## [0-9]' docs/PRD.md | tail -3`). Use the title style `## <n>. <plain claim> (<stage>, <bead ids>, <date>)`:

```markdown
## <n>. <Plain-language claim> (design, <epic-id>, <YYYY-MM-DD>)

**Research basis:** [<note>.md](<note>.md): <three bullets of the biology, with **unverified** where it applies>.

**The problem (measured).** <What the game does today, the scripted rule or global read, the assay numbers that show it.>

**Decisions.**
- <Decision> (owner) / (proposed: needs the owner).

**The mechanic.** <Cue → response → local rule; "off" = main bit for bit; what it retires.>

**Play.** <From the note's Play section, two to four lines.>

**Assays and targets.** <Assay id, the literature target, seeds; new assays land first with no behaviour change.>

**Cost (estimated).** <New situation fields, questions per game, tokens per question, $/h; "none" for steering only.>

**Beads.** <epic-id> (this), <children in build order>.

**Still open.** <Measurements to make; owner calls pending.>
```

The build later adds subsections in the order the earlier MRs used: what was there, assays (no behaviour change, commit), what was built, results (ablation, seeds 1–10, held-out 11–20, tuning table with the chosen row), the lane and live check, cost per lane, review.

## Beads: epic and children

Change beads only with `bd` (`.beads/issues.jsonl` is a local export, not in git). Titles are plain claims; labels from the small set in use (`colony`, `fungus`, `research`, `design`, `experiments`, `ui`, `mr`).

```sh
bd create --type=epic --priority=2 --labels=colony,design \
  --title="<Mechanic as a claim>" \
  --description="<Owner's ask and date>. Design: docs/<note>.md, PRD §<n>. <One-paragraph scope.> Stages: <list>."

# children, in build order; each names its doc §, what it retires, and its gate
bd create --parent=<epic> --type=task --labels=research --title="Research: <gap the note left open>" \
  --description="<What to find; primary sources, unverified marks as in the other notes.>" \
  --acceptance="Note section added with sources; vision.md rows updated."
bd create --parent=<epic> --type=task --labels=experiments --title="Assay <id>: <target>" \
  --description="<Literature target from docs/<note>.md §; how experiment.ts measures it.>" \
  --acceptance="Assay in experiment.ts; baseline numbers in PRD §<n>; no behaviour change (goldens bit-exact); todo in tests/slow/assays.test.ts if today's ants fail it."
bd create --parent=<epic> --type=feature --labels=colony --title="<Behaviour change as a claim>" \
  --description="docs/<note>.md §<x>. Cue: <…>. Response: <…>. Local rule: <…>. Retires: <symbols / gap row / ja-k4k.n>." \
  --acceptance="Gate: <assay> passes on seeds 1–10 by the worst seed and on 11–20; off = main bit for bit; goldens re-recorded and said so; PRD §<n> results and cost per lane; vision row struck."

# research and assays block the build
bd dep add <behaviour-child> <assay-child>
bd dep add <behaviour-child> <research-child>
```

A child's description names: the doc section, what code it retires, its gate (assay target, tick budget in ms), and owner decisions under notes (`bd update <id> --notes=...`). Close reasons later say what was built, the PRD §, and any beads split off.

## Commit

```sh
git add docs/
git commit -m "<Mechanic>: research note, PRD §<n>, beads (no code)"
scripts/beads-sync.sh push   # share the new beads (CLAUDE.md)
```

Then run `scripts/check-plan.sh docs/<note>.md <epic-id> --session <id>` and show the owner the plan.
