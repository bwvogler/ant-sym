# Where the rules came from

Reviews of PRs #39–#54 (November 2026). Each rule in SKILL.md is here because it caught something, or because skipping it cost a correction.

## What worked

- **#39: count it.** `#leaves` was suspected of rolling the leave chance twice in one tick (once in the rest block, once at trip end). A `globalThis` counter in a scratch worktree showed the double roll per tick; a trial fix with a `rolled` flag measured one roll. The review posted both counts, not a suspicion.
- **#40 → #39: a clean merge can still break.** #40 renamed `foodLeft`; #39's files (`policyText.ts`, `prompt.ts`, `policyText.test.ts`) still used it. `merge-tree` was clean in places, but the trial merge failed `tsc`. Now every review trial-merges when main touched shared code, and checks the other open PRs.
- **#41: like for like.** The Warlike stance lost a pass battle with the PR's cache. Main's cache had no mode answers, so the raw comparison measured the cache. Grafting the PR's mode answers into main's cache and replaying on main reproduced the loss: it predated #41. Not a blocker.
- **#44: where it fires.** The past-end trigger (`#pastEnd` / `raidOnward`) was logged by location; the counts showed it firing mid-trail, which led to the `rf === top && rf < raid` end check.
- **#47: conservation by arithmetic.** `found()` adds a 24-food reserve; `#eclose` writes off at most 10. 14 food from nothing. And `found()` could run twice for one flight. Both posted with the line and the arithmetic.
- **#53: the owner's decision, made durable.** "No living rival" → the owner wanted new generated terrain with another nest some day. Filed as beads ja-5hm and ja-506 (after `bd search`, with `bd dep add`), pushed, noted on the PR; the PR's interim gate (no raid recruitment without a rival) was accepted.
- **#54: mutations find untested branches.** Three of four fixes were caught by tests when broken. Dropping `incipient` from the queen's nursing branch, the change that lets daughter colonies grow, passed every test: a should-fix.
- **#55: a trial run of this skill.** A helper followed the skill on #55 and reported its gaps: it told helpers both to run fast-checks (the full `npm test`) and to run single test files only; its report asked for Merge mechanics a helper doesn't do; and "not caught is a should-fix" was too strict. Nudging one end of `hexLine` was an equivalent mutation, and `standing()`'s wider cut changed 0 of ~18 million verdicts (unreachable on grid cells). The skill now has a helper checklist and the equivalent / unreachable grades.
- **Review format (owner's choice, 2026-11-08).** Reviews moved from one PR comment to one GitHub review: the body stays the whole review (it worked for fixing agents: ranked, one event, numbered items that carry into re-reviews), and one-line fixes also go inline as `suggestion` blocks the author can apply.
- **Hooks for the rules that slipped (owner's go-ahead, 2026-11-08).** The footer, no model names, COMMENT-only reviews, guarded worktree paths, asking before merges and slow or paid runs, and the stage-8 clean-up are checked by `guard.sh` and `stop-check.sh`, because each was broken at least once while it was only written down.
- **Structure.** One comment, numbered items, Merge mechanics and Not re-measured always present, then a plain-language summary to the owner with the one decision that's theirs. Re-reviews as a status table.

## What went wrong

- **#42: a cost claim from a rate, not the code.** The review said "$0.15–0.20/h always on". The ask path spends only on cache misses; an open run costs nothing. Corrected by editing the comment, "(Corrected: …)". Rule: trace the ask path before quoting cost.
- **#42: prescribing more than the owner wants.** The review pushed "presets never ask Jev; ship a full precache". The owner: "That would require us to have all possibilities pre-cached. I'm not interested in that while we're still developing." Rule: offer options; the owner decides design.
- **#42: the body didn't match the diff.** The body said docs only; the diff carried eight slices. Caught late. Rule: diffstat against the body, first.
- **#42: a 30-minute per-run cap** was accepted without asking why. The owner asked "Why the 30 minute limit??" and replaced it with one daily server-side budget. Rule: question limits and defaults that shape play or spend; put them to the owner as a decision.
- **#47: timeouts that weren't failures.** A helper's runs, the lead's fast checks and a trial merge's tests ran at once; several test files hit the 60 s limit. Alone, every file passed in under 60 s. Rule: one CPU-heavy job at a time; re-run a timed-out file alone.
- **A worktree at `/r53m`.** A helper built a path from an empty `$S`. Rule: absolute paths, `${S:?}`, and `git worktree list` at the end of every brief.
- **A typo in a posted constant name** (`COLONY_BLAIN_VERSION`). Fixed by editing. Rule: copy identifiers from the code, not from memory.
- **Slow runs.** 12-minute game runs and 20-seed sweeps cost review time the owner didn't want spent. Rule (`bd remember`): skip them unless asked, and list them under Not re-measured.
- **`.beads/issues.jsonl` in `git status`.** `bd` auto-exports it; the Stop hook flagged it. Rule: revert it, never commit it; the Dolt branch is the record.
