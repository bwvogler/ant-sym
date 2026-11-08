---
name: adding-mechanics
description: Plans a new game mechanic or behaviour for jev-ants (an ant, fungus, nest or colony behaviour, a new sense, action, lever or Jev lane) from primary research on the real biology, through its translation into a sensed-policy mechanic and what it does for play, to a committed research note, PRD section and bead epic, before any code is written. Use whenever the user asks to add, design, change or rework how ants, the fungus or colonies behave, proposes a new mechanic or game feature, or asks "what would real ants do" with intent to build it, even if they don't say "mechanic" or ask for a plan. Not for bug fixes or tuning an existing mechanic's numbers.
argument-hint: "[mechanic in a few words]"
hooks:
  PreToolUse:
    - matcher: "Edit|Write|NotebookEdit"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/skills/adding-mechanics/scripts/gate.sh"
---

# Adding a game mechanic

Mechanic asked for: **$ARGUMENTS**

This repo adds mechanics in a fixed order, learned the hard way (see [reference/history.md](reference/history.md)): **biology first, then the translation to the game, then what it does for play, then docs and beads, and only then code.** Each stage below produces a written artifact; the next stage builds on it, not on memory.

While this skill is active, a hook blocks edits under `web/` and `scripts/` until the plan passes its check (stage 5). Docs, beads and `.claude/` stay editable. That is deliberate: code written before the plan is the failure this skill exists to prevent.

Copy this checklist into your reply and tick it as you go:

```
Mechanic: <name>
- [ ] 0. Frame: the question, what the game does today, existing notes and beads
- [ ] 1. Research: primary sources, a note in docs/ (or a section of an existing one)
- [ ] 2. Translate: senses, actions, policy vs body, cost; "For the model" paragraphs
- [ ] 3. Play: what the player sees, chooses and feels; the risks to play
- [ ] 4. Docs and beads: PRD section, README row, vision rows, epic + children
- [ ] 5. Check: scripts/check-plan.sh passes; owner has reviewed the plan
- [ ] 6. Hand off: the first code bead, assays first
```

## 0. Frame

- State the question in one line as a biological question ("when does a forager give up?"), not a feature ("add tiredness").
- Find what exists, so you extend it rather than duplicate it:
  - `docs/README.md` (the notes index) and `docs/vision.md` (the sense table, the gap table)
  - `grep -n` the topic in `docs/PRD.md` and `docs/*.md`
  - `bd search <topic>`, `bd list --status=open`, and the `ja-k4k` (scripted gaps) epic
- Read the code that does it today (`web/src/colony/`): which rule, which global read, which assay measures it (`experiment.ts`).
- If the ask is really a bug fix or a tuning change, say so and stop: this skill is not for that.

## 1. Research

Find what real organisms do, from primary sources. Follow [reference/research.md](reference/research.md) for the search method, the rigour rules and the note template. Key rules:
- Primary papers (journal, PMC, DOI) over reviews; reviews over press. Name species, authors and years in the text.
- A number read only in an abstract or a citing paper is marked **unverified**. A claim from memory is marked "(from memory; not fetched)". Say what you could not reach.
- Record what contradicts the idea, and what the biology does *not* show. A mechanic with no biological basis is marked **design**, never passed off as biology.
- A new sense (anything not in vision.md's sense table) needs this note before anything else.

Write it as `docs/<topic>.md`, or as a new section of an existing note when the topic is already covered there.

## 2. Translate to a mechanic

Turn each biological finding into a game rule. Follow [reference/translation.md](reference/translation.md). In short:
- **Choices come from the policy, over what the ant senses.** Physiology (ageing, hunger, decay) may stay mechanics. A rule that reads the chamber table, another nest's position or a colony-wide count is a new gap, not a mechanic.
- **Name the cue and the response**: the sensed field (and its sense-table row), the action or response hook, and the local rule that stands in for Jev, with today's behaviour as the "off" setting.
- **Prefer steering over a new situation field.** Steering is free; every situation field multiplies the question space and the Jev bill. Estimate the lane's tokens per question.
- **Name the assay**: which literature target (from the note) the colony must hit, and how `experiment.ts` measures it.

End each research section with a bold **In the game:** paragraph that says this.

## 3. Play

Say what the mechanic does for the person playing. Follow [reference/play.md](reference/play.md). Answer at least:
- What will the player **see** on the map that they could not see before, and can the Learn drawer explain it?
- What new **choice** does it give the player (the fungus's aim, menu, reach, strain), or what choice does it make matter more? A colony's own behaviour is its nature, not the player's lever.
- Does it keep the **progression** (a weak start, a slope not a cliff) and the counterplay (social immunity)?
- What does it **cost** per hour of play, and does a cached game still spend nothing?
- What could make it **worse** to play (a free lever that skips progress, an invisible effect, a runaway), and how would we know?

Write it as a `## Play` section in the note.

## 4. Docs and beads, before code

Follow [reference/plan.md](reference/plan.md) for the templates and commands.
1. **The note** (stages 1–3) in `docs/`, with its row in `docs/README.md`.
2. **vision.md**: a sense-table row for a new sense; a gap-table row for any scripted read it adds or closes.
3. **PRD**: a new numbered section stub in `docs/PRD.md`: the problem, the decisions so far (marking which are the owner's), the plan, the assays and targets, what is still open. Results come later.
4. **Beads**: one epic for the mechanic, children in build order (research gaps, assays first, then each behaviour change with its gate), dependencies between them, acceptance on each child. Use `bd`, never edit `.beads/issues.jsonl`.
5. **Commit** the docs (and the beads export) before code, as their own commit.

## 5. Check and review

Run the plan check, then show the owner the plan:

```sh
.claude/skills/adding-mechanics/scripts/check-plan.sh docs/<note>.md <epic-id> --session ${CLAUDE_SESSION_ID}
```

It fails with a list of what is missing; fix each and run it again until it passes. Passing it opens the code gate for this session. Then summarise for the owner: the biology in three lines, the mechanic, the play case, the beads, the open decisions. **Ask before building**: the owner makes the game decisions (PRD §50 shows how they get recorded).

If the owner explicitly says to skip the plan for a change (an urgent fix found along the way, say), open the gate with the reason, which is logged:

```sh
.claude/skills/adding-mechanics/scripts/check-plan.sh --waive "<reason the owner gave>" --session ${CLAUDE_SESSION_ID}
```

Don't waive on your own judgement.

## 6. Hand off to code

Start from the epic's first ready child (`bd ready`). The build follows CLAUDE.md, not this skill; the order that has worked is:
1. assays and targets land first, with no behaviour change (golden masters bit-exact);
2. the mechanic behind a setting whose "off" matches main bit for bit;
3. sweeps over seeds 1–10, chosen by the worst seed, confirmed on 11–20; goldens re-recorded and said so;
4. the PRD section filled in with results, cost per lane, and what is still to measure;
5. the vision row struck, the note's "What MR n built" section written back, the Learn guide updated.
