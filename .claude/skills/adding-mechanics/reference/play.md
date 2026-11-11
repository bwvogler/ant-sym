# Play: what the mechanic does for the person playing

Realism is the floor, not the point. A mechanic earns its place when it makes the game better to play: more to see, a choice that matters, a slope to climb. The owner's game decisions are in PRD §50 (the fungus game), §21 (no colony is the player's), §47 (Learn) and §50.12–15 (progression; the brush removed). Read the ones your mechanic touches.

## Contents
- Who the player is
- Questions to answer
- Risks to play
- Writing the Play section

## Who the player is

- **The player is the fungus.** Its policy is the game's main handle: an aim in words, a menu of levers, a reach that grows with the mycelium (PRD §50, §50.12). The player never steers an ant.
- **No colony is the player's** (§21). A colony's doctrine is its nature, a scenario setting. A mechanic that only changes what ants do is not a new lever for the player, unless the fungus can bend the cue it runs on. Ask: *which fungus lever reaches this?*
- **The main screen keeps some magic** (§50): the table and the numbers sit in Details and Learn. The effect of a mechanic has to be visible on the field itself.

## Questions to answer

1. **See.** What will the player notice on the field that they could not before (a trail forming, ants pausing at the entrance, a crowd at a border)? At 4× speed? Can a Learn entry (`web/src/ui/guide.ts`) explain it with "what you see / what real ants do / how the game models it"?
2. **Choose.** Which choice does it add or make matter more: an aim that now has a cue to work through, a lever on the fungus's menu, a reason to land somewhere else? If the answer is "none", it may still be worth building as realism or as groundwork. Say so plainly, and make it cheap.
3. **Counterplay.** How can the colonies push back (grooming, rejection, exile, corpse removal; `docs/fungus-policy.md` §6)? Does the stealth-against-potency dial still hold?
4. **Progression.** Does it keep a weak start and a slope, not a cliff (§50.12)? Is any part of it free power that skips the progression (§50.15: the brush was removed for exactly this)?
5. **Pace.** Over how long does it show: seconds, minutes, a sitting, several sittings (saves)? Are queen births or other rare events made rarer or commoner?
6. **Cost.** Jev tokens per hour of play, and whether a cached game still spends nothing (§50.11: one daily budget; ask only what isn't cached). A mechanic that makes every game re-ask is a play cost too.
7. **Measure.** Which number would show it helped play: the progression curve (`scripts/lab/progression.mjs`), unity, games won and lost over seeds, time to first host or the queen?

## Risks to play

Check the mechanic against the failure modes this project has hit:
- **A cliff.** The landing took a whole colony in half a minute (§50.12). Look for thresholds where everything flips at once.
- **A free lever.** One drag of the brush skipped the whole progression (§50.15).
- **Invisible effects.** A rule that changes numbers but nothing on the field, or a lethal lever at full strength from the first second, as crown and the odour weapon were until their reach upgrades (`ja-lo8.16`, PRD §50.16).
- **Runaway or famine.** Soothe everything and both colonies starve; runaway infection ends the game in a minute (`docs/fungus-policy.md` §6).
- **Mills and loops.** Trails between two nests can loop (assay A3).
- **Cost creep.** A new situation field that re-asks every cached answer.

## Writing the Play section

In the note, under `## Play`, keep it short:

```markdown
## Play

- **See:** <what shows on the field; the Learn entry it needs>.
- **Choose:** <the fungus lever that reaches it, or "none: groundwork for X">.
- **Counterplay and progression:** <how colonies push back; where it sits on the slope>.
- **Cost:** <tokens per question, questions per game, $/h; cached games spend nothing>.
- **Risks:** <the failure modes above that apply, and the number that would show each>.
- **Owner decisions needed:** <the game calls this note can't make>.
```
