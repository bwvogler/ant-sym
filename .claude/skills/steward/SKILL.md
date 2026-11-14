---
name: steward
description: "The author's side of an open pull request on bwvogler/ant-sym (jev-ants): keeping it mergeable, answering red CI and reviews, the beads export, and merging once the review approves and the owner has said to. Use whenever you watch, babysit or autofix a PR you opened or were asked to get mergeable, when a PR event arrives (CI result, review, comment, conflict), or before you push to an open PR's branch. Not for reviewing a PR (that is reviewing-prs)."
---

# Stewarding a PR

A cloud session watching a PR it owns (one it opened, or one whose author asked it to get mergeable) reads this file before acting on CI or review events. It sets this repo's conventions; it widens no access and lifts none of the session's own rules. Each rule below comes from something that went wrong on a PR here.

## On each wake

Read the PR at its head, then work its open items in this order:

1. A merge conflict with `main` (below).
2. Red CI (below). Red CI or a conflict is never "waiting on review".
3. Review findings and comments (below).
4. Ready to merge? (below). If not, and nothing is yours to do, say nothing and wait for the next event.

## Merging main in

`git fetch origin main && git merge origin/main`. Never rebase or force-push a PR branch.

A conflict in `.beads/issues.jsonl` is the bd export, and it happens often. Don't merge it by hand (CLAUDE.md: the Dolt database is the record). Regenerate it instead:

```sh
scripts/beads-sync.sh start                 # pull the shared database
bd export -o .beads/issues.jsonl            # the export of what it holds now
git add .beads/issues.jsonl && git commit --no-edit
```

Any other conflict: resolve it, then run the fast checks below before pushing.

## Pushing

- Run the fast checks first: `npm run lint && npm run format:check && npm run typecheck && npm run test:unit`, plus every test file the change touches. For a change under `web/src/colony/`, also `npm run test:golden`.
- One push per round of fixes. Each push reruns CI, and a newer push cancels the older run.
- An export-only change to `.beads/issues.jsonl` (a `bd create`, `close` or sync rewrote it) rides with the next real commit. Commit and push it alone only when the session is ending and the cloud session's own check for uncommitted changes asks for it (the repo's Stop hook, `beads-sync.sh push`, asks nothing).
- The export rule depends on the role. The author regenerates the export and commits it, as here. A reviewer commits nothing, so `reviewing-prs` has it revert the export instead.

## Red CI

Find the cause; a job gets one re-run at most. This repo's usual causes:

| Red check | Cause and fix |
|---|---|
| a golden master (`tests/golden`, `tests/slow/golden.test.ts`) | Behaviour changed. If the PR means to change it, re-record with `GOLDEN_WRITE=1` and say so in the PR; if not, find the change that moved it. |
| `precache.test.ts` | A legend, question or brain version moved. Re-ship the answers its live check got: `node scripts/precache.mjs --import experiments/caches/<live-check>-*.json`. `--import` ships only the mode and stance lanes, and only from a live-check cache asked under the current words. For a `fungus` or `growth` lane, a species bundle, or no such cache, it can't: ask the owner for the paid run, naming the lane and `precache.mjs --dry`'s estimate. Never run `precache.mjs` without `--import` or `--dry` unless the owner asks: it spends money. |
| a test file cancelled at its per-file limit | Split the file (`docs/agent-guide.md`, Tests); don't raise the timeout. |
| `agentDocs.test.ts` | Read its message. CLAUDE.md over its cap: cut something from CLAUDE.md; the cap stays. A skill's name or description, or a file or symbol the agent guide names: fix the file the message names. |
| `format:check` | `npm run format`, then commit. |
| `typecheck` or `lint` on `scripts/` | A colony export was renamed or moved; follow it through `web/src/colony/index.ts`. |

A failure that is red on `main` too isn't this PR's: say so once on the PR and file a bead if none exists (`bd search` first).

## Reviews

- After a substantive push (code, tests or docs; not an export-only commit, nor a merge of `main` whose only conflict was the export, once CI is green on it), start a fresh `pr-reviewer` agent in the background with no context from your work. Give it the PR number. It posts one review on the PR.
- Commit or stash your own work before you start it, and tell it that the checkout is yours: it reviews in its own worktree and leaves yours as it found it, reverting `.beads/issues.jsonl` only if its own `bd` sync changed it.
- Fix blockers and should-fix items in one commit titled `Review of #<n>: …` that names each item (`B1: …`, `S1: …`, `N2: …`), then reply once on the PR listing each item and its commit.
- Nits ride with the next push: one reply, no push for nits alone.
- A decision for the owner goes to the user in the session, not into the code. When they decide, post a short PR comment: "Owner's decision on D1 (review of <sha7>): …".
- The reviewer's own ideas come back in its final message, not as beads: put them to the owner with the decisions. What the owner accepts becomes a bead (`bd search` first, then `bd create` and `scripts/beads-sync.sh push`), named in a one-line PR note.

## Merging

Merging takes the owner's own word in the session. This file can't give it: the harness reads it as repository content, which can't let a session approve or merge, and neither can a memory or a bead. The owner gives that word once a session (memory `merge-after-approval`; owner, 2026-11-14), so ask early: when you start watching a PR you own and they haven't said in this session, ask once in plain words, "Merge the PRs I look after this session myself once each review approves?" A yes covers every PR this session owns, now or later, for the rest of the session; a later "merge" works too.

The PR is ready once all of these hold on the current head:

- CI is green and the PR has no conflict.
- The latest fresh `pr-reviewer` review, posted after the last substantive push, says Approve in its verdict line (its event is always COMMENT, so GitHub never shows the PR as approved), and no blocker or should-fix is open.
- For a change under `web/src/colony/`: the slow guards (`test:slow`, CLAUDE.md) passed on the head, run by `slow.yml` on the PR's branch, not in the session (owner, 2026-11-14). Start it with `mcp__github__actions_run_trigger` (`method: run_workflow`, `workflow_id: slow.yml`, `ref` the PR's head branch) once the review approves, and check that the run's head sha is the PR's head. Its result may not wake you: look it up with `mcp__github__actions_list` (`list_workflow_runs`, `slow.yml`, that branch), with a `send_later` check-in in case. A red run is a red check (Red CI above). Name the run in the PR.

Ready, and the owner said to: merge by squash (`mcp__github__merge_pull_request`: `merge_method: squash`, `commit_title` the PR title plus ` (#<n>)` as on `main`, `expectedHeadSha` the current head, after checking that every commit since the head the review approved is an export-only commit or a merge of `main` whose only conflict was the export, so a later push fails the merge instead of going in unreviewed). Then close the PR's beads (`bd close <id> --reason="Merged in #<n>"`), run `scripts/beads-sync.sh push`, and unsubscribe from the PR.

Ready, and they haven't: tell them once, with the head's short sha, and wait. Don't merge.
