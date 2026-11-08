# Why the order: what this project learned

Short cases from the PRD and git history. Each is why a stage of the skill exists.

## Research first

- **Tiredness was a timer** that nothing reset underground, so every inside worker was "tired" within a minute; fights and dumping spoil counted as finding food (PRD §43). `docs/tiredness.md` (Beverly et al. 2009; Charbonneau & Dornhaus) gave the rule that held: fatigue grows only with unsuccessful search outside and recovers with rest inside (MR 3.1, §44).
- **Infection was a cliff**: the landing took a whole colony in half a minute (§50.12). The owner asked for a research note (`docs/fungus-body.md`) before the redesign, and the grounded body (a mycelium in soil, growth paying for spores) replaced a currency.
- **A note closed but never committed**: `ja-k4k.9` was closed as "nest-chemistry.md written", but the file never reached the repo, and two child beads cite it (`ja-px9`). The check script now requires the note to be tracked by git.

## Translate to sensed cues

- **The strategist read the whole map** (map-wide food) and broadcast a stance no ant could sense. MR 5 replaced `foodLeft` with the colony's intake rate (`docs/activation.md`, §48); MR 5.2 replaced raiders aiming at the rival hole's coordinates with a scout's raid trail (`docs/raid-recruitment.md`, §49). The stance row is still open (`ja-k4k.6`).
- **The `ja-k4k` epic** holds one bead per scripted gap; vision.md's gap table is the map. New code that adds a global read reopens what these closed.

## Measure before and after; let measurement overturn the design

- **Combat**: `docs/combat.md` planned to cap the enemies an ant faces by the open cells around it; MR 4 measured that narrow ground already favoured the few and the cap only blunted numbers everywhere, so it was dropped, and the note says so ("What MR 4 found", PRD §46.3).
- **Numbers that did not reproduce**: the crown and muddle figures in §37 had no committed harness, and the review could not reproduce them; §39 replaced them with numbers from committed scripts (`crown.mjs`, `muddle.mjs`).
- **Assays land first** (`experiment.ts`, baseline §42), with no behaviour change, so the change is measured against main, not against memory.

## Play value decides what stays

- **Picture mode** (ants forming images) was removed whole (#34; PRD §1–8 keep its history). The game is the colonies and the fungus.
- **The spore brush** dosed every ant under a stroke for free and skipped the whole progression; the owner removed it (§50.15, `ja-260`).
- **No colony is the player's** (§21): mechanics for ants are the colonies' nature; the player's lever is the fungus.

## Docs and beads before code

- MR 3.1 shows the order as separate commits: research note and ablation script, then beads, then a WIP with the PRD draft, then the sweep and re-recorded goldens, then the PRD, then the review fixes.
- Design-only PRs exist and are fine: one world (#45, PRD §51) and queens (§38) landed as notes, PRD sections and beads with no code.
