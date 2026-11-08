---
name: reviewing-prs
description: "Reviews a pull request on bwvogler/ant-sym (jev-ants) and posts the review as one GitHub comment, with measured evidence, merge mechanics against main and the other open PRs, and the owner's decisions relayed into the PR and into beads. Use whenever the user asks to review a PR, re-review one, 'check for updates', 'anything new?', 'fixes are in', 'is #N ready', or 'approve what's ready', including stacked PRs, and whenever a lead agent hands a subagent a PR to review (role: helper). Not for writing the fix itself or for designing a mechanic (that is adding-mechanics)."
argument-hint: "[PR number(s), or 'open'] [role: helper]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/merge-check.sh *), Bash(${CLAUDE_SKILL_DIR}/scripts/fast-checks.sh *)
hooks:
  PreToolUse:
    - matcher: "Bash|mcp__github__add_issue_comment|mcp__github__update_issue_comment|mcp__github__add_reply_to_pull_request_comment|mcp__github__add_comment_to_pending_review|mcp__github__pull_request_review_write|mcp__github__merge_pull_request|mcp__github__enable_pr_auto_merge"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/skills/reviewing-prs/scripts/guard.sh"
  Stop:
    - hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/skills/reviewing-prs/scripts/stop-check.sh"
---

# Reviewing a PR

PR(s): **$ARGUMENTS**

A review here is finished when **one GitHub review is posted on the PR** (or, for a helper, when the lead has a report it can paste), the owner has a plain-language summary with the one decision that is theirs, and the working tree is back as it was. Every rule below comes from a review that went right or wrong; [reference/history.md](reference/history.md) has the cases.

## Roles

- **Lead** (default). Runs every stage and posts the comment. Owns what is posted: re-checks anything a helper reports before it goes out.
- **Helper** (the lead passed "role: helper", usually via [reference/brief.md](reference/brief.md)). Does stages 1 and 5 in its own worktree (stage 4 too, unless the brief says the lead ran it; then single test files only) and returns a ready-to-paste report of **verified findings only**. A helper never posts, comments, commits, pushes, merges, or changes beads (`bd create/update/close/remember`); it may read them (`bd show`, `bd search`). It removes its worktree and reports `git worktree list` at the end.

## Hard rules

Hooks enforce some of these once the skill is invoked (and stay on for the rest of the session; `pr-reviewer` agents carry them too). `scripts/guard.sh` refuses a GitHub post without the footer or naming a model, a review submitted as APPROVE or REQUEST_CHANGES, and a worktree path that is relative, right under `/` or built on an unguarded variable; it asks the owner before a merge and before slow or paid runs. `scripts/stop-check.sh` stops you finishing once while a detached worktree or a changed `.beads/issues.jsonl` is left. A refusal says how to fix the call: fix it, don't route around it. Their tests: `scripts/test.sh`.

- `env -u JEV_API_KEY` on every command that runs the game, tests or scripts. No live Jev calls; spend is real and the owner decides it.
- Worktrees at **absolute** paths under the scratchpad, with the variable guarded: `W="${S:?}/pr57"`. An empty `$S` once put a worktree at `/r53m`.
- `npm --prefix "$W/web" ci` in each worktree. Never symlink `node_modules`.
- **Slow runs are off unless the owner asks**: `npm run test:slow`, 12-minute game runs, G′ over 20 seeds, `side-bench`, `colony-cost --side`, anything multi-minute (`bd memories slow`). List them under "Not re-measured" instead.
- **One CPU-heavy job at a time.** Never run `npm test` beside a helper's runs or a trial merge's tests; parallel load made test files hit the 60 s timeout on #47 and looked like failures.
- The reviewer commits nothing, pushes nothing, opens no PR, never force-pushes, and never merges unless the owner asks in this session. Never touch the `beads-dolt` or `__dolt_remote_info__` branches.
- Beads change only through `bd`. `.beads/issues.jsonl` is an export: revert it (`git checkout -- .beads/issues.jsonl`), never edit or commit it.
- No model name or id in anything posted. Every GitHub post ends with the footer in [reference/comment.md](reference/comment.md).

## Checklist

Copy this into your reply and tick it as you go (a helper copies the shorter one below it):

```
PR #<n> (<head sha7> on <base>) — <first review | re-review since <sha7>>
- [ ] 0. Sync: fetch, open PRs, beads, last reviewed SHA
- [ ] 1. Read: body vs diffstat, comments, cited beads, CLAUDE.md rules touched
- [ ] 2. Merge: merge-check vs main and every open PR; stack base
- [ ] 3. Route: inline (< ~300 lines) or one helper + my fast checks
- [ ] 4. Check: fast-checks.sh (tsc, test, lint vs main, build, goldens, versions)
- [ ] 5. Verify: mutations, measurements, every blocker re-read in code
- [ ] 6. Post: one review (COMMENT), body = whole review + footer, inline suggestions for one-liners
- [ ] 7. Relay: owner summary; decisions → comment edit + beads
- [ ] 8. Clean up: worktrees gone, jsonl reverted, git status clean
```

```
Helper, PR #<n> (<head sha7>)
- [ ] 1. Read: claims, diff, cited beads (read-only)
- [ ] 4. Check: only what the brief says the lead didn't run
- [ ] 5. Verify: mutations, measurements, single test files
- [ ] 8. Clean up: my worktree gone; report `git worktree list`
- [ ] Report: brief.md's sections, verified only; no Merge mechanics (the lead adds it)
```

## 0. Sync

- `git fetch origin`; list open PRs (`mcp__github__list_pull_requests`, state open) with head and base branches. "Approve what's ready" means every open PR.
- `scripts/beads-sync.sh start` so `bd` reads the shared database.
- Re-review? Find your last review (`mcp__github__pull_request_read`: get_reviews for review bodies, get_review_comments for inline threads and whether they're resolved, get_comments for older single-comment reviews, corrections and the owner's decisions) and the head SHA it reviewed. Review the commits since then, but re-run stages 2 and 4 in full: main moves.

## 1. Read

- The PR body and **every** comment, including heads-ups other PRs left there.
- **Diffstat against the body.** `git diff --stat origin/<base>...<head>`. Every slice the diff carries must be in the body and vice versa (#42 said "docs only" and carried eight code slices).
- **Cited beads.** `bd show <id>` for each one the body names: it should exist, be open (or closed by this PR) and match what the PR does. A bead that appears only in the jsonl diff and not in `bd show` was hand-edited; say so.
- **The rules the diff touches.** CLAUDE.md and the focus list in [reference/checks.md](reference/checks.md#focus-list): sensed-state, conservation, saves, goldens, Jev versions and per-lane cost.

## 2. Merge

```sh
"${CLAUDE_SKILL_DIR}/scripts/merge-check.sh" <n> [--base <branch>] <other open PR numbers…>
```

Pass the base branch and the other open PR numbers from stage 0 (git alone can't tell open PRs from closed). It fetches their heads, runs `git merge-tree` of this PR against main, its base and each other open PR, says whether a stacked base is in main yet, and lists files changed on both sides since the PR split from main. A conflict only in `.beads/issues.jsonl` is the bd export and doesn't count. Conflicts or not, read what main changed in files this PR touches: a clean textual merge can still break (#40 renamed `foodLeft` and broke #39's merged tree). When main changed shared code, trial-merge in a worktree and run the tests there ([checks.md](reference/checks.md#trial-merge)).

## 3. Route

- **Small** (under ~300 changed lines, no new mechanic): review inline.
- **Large**: spawn **one** background general-purpose agent with the filled-in [reference/brief.md](reference/brief.md). While it runs, do stages 1, 2 and the fast checks yourself, sequentially, and **do not repeat its work**. Don't run `npm test` while it is running measurements; run yours before you spawn it or after it reports. Its whole report goes on the PR in the review's collapsed "Helper's report" block, each item marked confirmed, didn't hold, or not checked ([comment.md](reference/comment.md)).
- **No Agent tool** (you are yourself a subagent, e.g. `pr-reviewer`): do the deep pass yourself after the fast checks, one job at a time.

## 4. Check

```sh
"${CLAUDE_SKILL_DIR}/scripts/fast-checks.sh" "$W"        # W = the PR head's worktree
```

Typecheck, `npm test` pass/fail counts, lint warnings compared with main's count, `vite build`, the goldens and precache diffstat, and a hint when brain or legend files changed without a `*_VERSION` bump. Goldens must be bit-exact unless the PR says why they moved.

## 5. Verify

**Nothing is posted that was not checked.** Prefer a number to an adjective. Recipes are in [reference/checks.md](reference/checks.md).

- **Mutation checks** for every fix and every new test: break the line the fix adds (or the condition the test guards), run that one test file, restore with `git checkout -- .`. Report a table: mutation → caught by / not caught / equivalent. Before grading "not caught", check the mutant really behaves differently: run original and mutant over many inputs and count differing outputs ([checks.md](reference/checks.md#mutation-check)).
  - No input gives a different output: **equivalent**, not a gap; drop it.
  - The changed code is never reached: **unreachable**, a nit (add a test that reaches it, or say in a code comment that it is defensive).
  - Some output changes and no test catches it: a **should-fix** (#54: removing the young-queen nursing passed every test).
- **Measure suspected bugs**: instrument a counter through `globalThis` in a scratch worktree, run one seed (`npm run exp -- <assay> --seeds 1`, ~7–15 s), and report counts (#39: rolls per tick; #44: where the past-end trigger fired). A trial fix measured the same way shows the fix works.
- **Jev cost and ask-path claims**: trace when a request is actually sent (cache miss only? on load? on a timer?) before quoting any rate. Read the "Jev's answers (cache hits…)" line. #42's first review multiplied a rate by an hour and was wrong: an open run costs nothing; only misses spend.
- **Like-for-like comparisons only.** Same seed, same cache contents, same everything but the change. If the PR's cache differs from main's, graft the missing answers in and replay on main (#41: the Warlike loss predated the PR).
- **A helper's blockers**: open the file and read each one yourself before it goes in the comment.

## 6. Post

**One GitHub review per round**, submitted with event `COMMENT`: its body is the whole review, and one-line fixes also go on their lines as inline suggestions. Steps and templates are in [reference/comment.md](reference/comment.md#posting-the-review).

- **The body is the record.** Verdict line; Blockers / Should-fix / Decision for the owner / Nits, each with `file:line`, the evidence and a suggested fix; Mutation checks table; Merge mechanics; Checked and fine; Not re-measured (slow); footer. A re-review leads with each earlier item's status (resolved / partly / not) and the commits it covered. Every finding is in the body, inline or not, so an agent that reads only the body misses nothing.
- **Inline only for one-liners**: a fix that replaces one line (or a few adjacent lines) of the diff, as a `suggestion` block the author can apply. Each inline comment starts with its item number (`N2.`) and is listed in the body. Anything wider, unlocated or needing discussion (a missing test, a cross-file bug, a decision) stays in the body only.
- Approval is the body's verdict line ("**Approve**", "**Approve with one should-fix**"), with event `COMMENT`, never `APPROVE` or `REQUEST_CHANGES`: it is the owner's own repo. Don't merge unless asked.
- Decisions belong to the owner. Offer options with their cost; don't prescribe a design they didn't ask for (#42: "ship a full precache" was more than the owner wanted while the game is still changing).
- A submitted review's body can't be edited with the tools here. If something in it turns out wrong, post a short PR comment, "Correction to the review of <sha7>, item S2: …" (`mcp__github__add_issue_comment`), or reply on the inline thread (`mcp__github__add_reply_to_pull_request_comment`). Don't leave a wrong number standing or post a second competing review.

## 7. Relay

- Tell the owner, in plain words: what the PR does, the verdict, what is left and on whom, the merge order, and the **one** decision that is theirs. No jargon they didn't use.
- When the owner decides something, put it on the PR as a short comment, "Owner's decision on D1 (review of <sha7>): …", so the author sees it where they look. The next re-review carries it in its status table.
- **Ideas and follow-ups become beads, not prose.** `bd search <words>` for a duplicate first; then `bd create --title=… --description=… --type=feature|task|bug --priority=N --silent`; `bd dep add <child> <parent>` for ordering; `scripts/beads-sync.sh push`. Add a one-line PR note naming the bead ids (#53: "no living rival" → ja-5hm, ja-506). A should-fix the owner accepts as later work gets a bead too.
- A lasting preference about how reviews are done ("skip slow runs") goes to `bd remember`.

## 8. Clean up

```sh
git worktree remove --force "${S:?}/pr57"; git worktree list     # only the main checkout left
git checkout -- .beads/issues.jsonl
git status --short                                                 # empty
```

If you filed beads and the push hook may not have run, `scripts/beads-sync.sh push` by hand.
