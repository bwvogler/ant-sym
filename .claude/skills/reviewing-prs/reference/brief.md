# Helper brief

For a large PR the lead spawns **one** background `general-purpose` agent with this brief, filled in. The helper knows only what is written here, so give it the SHAs, the claims and the focus; don't hand it your conclusion to confirm. While it runs, the lead does stages 1–2 and its own fast checks, and doesn't repeat the helper's work or run `npm test` alongside its measurements.

```text
Load the reviewing-prs skill (.claude/skills/reviewing-prs/SKILL.md), role: helper.

PR #<n> on bwvogler/ant-sym: "<title>". Head <full sha> (refs/pr/<n>, already fetched), base <branch> at <full sha>.
<Stacked on #m? Say so; review only this PR's commits: git diff <base sha>...<head sha>.>

Claims to verify (from the PR body):
1. <claim, with the number the PR gives>
2. …

Focus (from reference/checks.md#focus-list, the ones this diff touches):
- <e.g. conservation of food in found()/eclose; idempotence of found()>
- <e.g. sensed-state: does #wanted read colony-wide state?>
- mutation checks for every fix and new test

Already known / ruled out (don't redo): <what the lead has checked>.

Setup:
  cd <repo root>     # optional: git worktree add works from any subdirectory
  S=<absolute scratchpad path>
  W="${S:?}/pr<n>h"; git worktree add --detach "$W" <head sha>; npm --prefix "$W/web" ci
Every run under env -u JEV_API_KEY. Fast runs only: single test files, `npm run exp -- <assay> --seeds 1`,
no test:slow, no multi-seed sweeps, no game runs over a minute. One CPU-heavy job at a time.
Do not post, comment, commit, push, merge, or change beads. Do not touch files outside $W.
At the end: git worktree remove --force "$W"; report `git worktree list`.

Leave out Merge mechanics: the lead does stage 2 and adds it.
Return a ready-to-paste report in reference/comment.md's sections (Blockers / Should-fix / Decision for the owner /
Nits / Mutation checks / Checked and fine / Not re-measured). Verified findings only: each with file:line, the
evidence (numbers, the command that produced them), and a suggested fix. Put anything you suspect but could not
confirm under a separate "Unverified" heading, saying what would confirm it.
```

## When it reports

- Re-read every Blocker and Should-fix in the code yourself. Drop or downgrade what doesn't hold.
- Check its mutation table on one row at least.
- Check `git worktree list` matches what it said; remove anything it left.
- Merge its report with your merge mechanics and fast checks into one comment.
