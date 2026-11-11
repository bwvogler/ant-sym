# Agent guide

*How we write instructions for agents, and the style an agent follows in this repo. Part 1 is the practice, from the research in Sources (read their caveats: the evidence is small and mixed). Part 2 is what the code already does, written down so an agent doesn't have to rediscover it. Where a rule can be a test, a lint rule or a hook, it is, and this guide names it.*

## Part 1: writing agent instructions

### The rules

1. **Say what the code can't.** `CLAUDE.md` holds commands an agent wouldn't guess, rules that differ from the defaults, and gotchas that cost someone a day. It does not hold what the code says (a directory tree, what a module does), generic advice ("write clean code"), or anything a formatter or linter enforces.
2. **Keep it small.** The file loads in every session, so its length comes off the room for the work, and recall drops as context grows. Anthropic's docs target under 200 lines. Ours is held by a test (`ui/tests/agentDocs.test.ts`): at most 200 lines and 12 KB. Lines here run long, so the byte cap is the one that bites. Raise it only by cutting something else.
3. **Be specific and checkable.** "Run `npm run test:unit` before committing" can be followed and checked; "test your changes" cannot. A new rule names the command, the path or the symbol.
4. **Plain wording.** Current models follow a plain line; emphasis (IMPORTANT, NEVER) mostly makes them over-apply it. If two lines could contradict, the agent may pick either: resolve it in the file.
5. **Hard rules are not prose.** A guideline in `CLAUDE.md` may be judged not to apply. What must hold every time is a test, a lint rule or a hook. Examples here: `ui/tests/colonyIndex.test.ts` (imports through the colony's index), `npm run format:check` and the lint rules in CI, the `adding-mechanics` hook (no edits under `web/` or `scripts/` until a plan exists) and the `reviewing-prs` guard (asks before paid or multi-minute runs). A hook guards only where it is loaded: those two work while their skill is active in a session, not in every subagent.
6. **Put each thing where it loads when it is needed.**

   | What | Where | Loads |
   |---|---|---|
   | Rules every session needs; commands; gotchas | `CLAUDE.md` | always |
   | The beads workflow | `AGENTS.md` | read by other agent tools; Claude Code reads `CLAUDE.md` (it does not import `AGENTS.md`), so the beads context reaches it through the SessionStart `bd prime` hook. Written by `bd`: change it through `bd` |
   | A procedure for one kind of task | a skill in `.claude/skills/` | when the task matches |
   | A reviewer's or helper's job | an agent in `.claude/agents/` | when spawned |
   | Rules for one directory | a `CLAUDE.md` in that directory | when its files are read |
   | Research, decisions, measurements | `docs/` (PRD, research notes) | when read; `CLAUDE.md` gives the pointer |
   | Things that must always happen | hook, test, lint | every time |

7. **Point, don't copy.** Name the file, symbol or test; a pasted snippet or a line number goes stale. A copy of a number that lives in the PRD goes stale too: link the section.
8. **Write by hand, from friction.** A line goes in when an agent made the same mistake twice; it comes out when agents do it right without it, or when a lint rule now catches it. Don't keep an `/init`-generated file: the studies found generated context files cost more and did not help. Review `CLAUDE.md` changes in the PR like code.
9. **Prefer small, clear tools.** If a person can't say which script to run for a job, an agent can't either: one command per job, named in the Build & test block.

### Changing `CLAUDE.md`

Before adding: has an agent got this wrong in a way a test or lint rule could catch instead? Is it already in a doc that can be linked? Does it contradict an existing line? After: `npm run test:unit` (the size test), and say in the PR which line it replaces or why none does.

### Sources and how far to trust them

- Anthropic, [How Claude remembers your project](https://code.claude.com/docs/en/memory), [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) and [Extend Claude Code](https://code.claude.com/docs/en/features-overview): the under-200-lines target, where `CLAUDE.md`, rules, skills and hooks each belong, hooks for what must always happen, plain wording over emphasis. Primary and current.
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents): the smallest set of high-signal tokens; minimal is not the same as short; small, unambiguous toolsets. Primary. (The post that introduced tuning `CLAUDE.md` like a prompt and adding emphasis is older; the current docs reverse the emphasis advice.)
- [AGENTS.md](https://agents.md) and the AAIF's [Writing an effective AGENTS.md](https://aaif.io/blog/writing-an-effective-agents-md): no required sections; short and specific; repo-specific boundaries beat general advice; hooks and tools for hard rules; nested files for scoped rules. One experiment there reports a short file cutting median runtime by 28.6 %: a single experiment.
- [Do Context Files Help Coding Agents?](https://www.alphaxiv.org/abs/2607.27250) and the ETH Zurich study it follows (arXiv 2602.11988, cited second-hand: check the listing before quoting): generated context files raised cost by over 20 % and did not help success on average (the reported change is small and varies by source); human-written files helped little except on niche repos; agents do follow what the file says, so every unneeded line costs work. Small, mostly Python, different metrics. Read as "keep it minimal and measure on this repo", not as settled.
- Practitioner guides ([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md) and others): short, specific, no code snippets, no style rules a linter owns. Consistent with the above; secondary.

## Part 2: the style of this repo

What Prettier (`npm run format`) and oxlint (`npm run lint`) enforce is not repeated here: don't hand-format, and let CI's `format:check` tell you.

### Layers and imports
- `web/src/colony/` is pure TypeScript with no DOM. The page, the server, the worker and the maintained scripts import it only through `colony/index.ts` (held by `colonyIndex.test.ts`); `experiment.ts` is imported by name.
- Shared words (modes, stances, trail levels, situations) live in `colony/vocab.ts`, which imports no colony code. A type or constant that two colony modules both need goes there, not in one of them: that is how the import cycle went away.
- One meaning per exported name across the colony. Before adding `Touch`, `Place`, `Trail`, search: the index re-exports every module and a collision is a compile error.
- No module-level mutable state (`let` at module scope, setters for tests). Tuning that varies goes in `ColonyParams` (see `backfill`, `tunnelDrift`); each colony copies what a save loads into.

### Data and types
- Per-ant data: a new array that a colony keeps per ant goes in `colony/ants.ts` `ANT_FIELDS` (type, fill, one doc line). It is allocated, saved and loaded by construction; don't add a `#field` array and a line in `saveState`. (The older public arrays, `x`, `y`, `mode`, …, are being moved there.)
- No `any` (lint). No casts on JSON: read wire data through the readers in `shared/jev.ts` (`isRunSummary`, `readHealth`, …). `x[i] as number` on an array read is noise (`noUncheckedIndexedAccess` is off): don't write it.
- Strings the UI and Jev see (legends, questions) are part of the product and of its cost: a change to one changes the hourly cost; follow the CLAUDE.md cost and precache rules.

### Determinism
- The simulation draws only from its injected seeded `rng`; `Math.random` appears only as a constructor default. The order of draws is behaviour: a refactor that moves a draw changes every golden master.
- A change that should not alter behaviour keeps the goldens bit-exact (`npm run test:golden`, and `test:slow` before merging colony changes). One that should re-records them, and its PR says so.

### Tests
- Place a test by how long its file takes alone: under about 1.5 s `unit/`, to 12 s `int/`, over that `soak/`; the fast golden masters in `golden/`. A file that nears the per-file limit is split, not given a longer timeout.
- Build the world with `tests/builders.ts` (`SMALL_SIDE`, `smallOne`, `arena`, `placedAt`, `run`, `editPrivate`). A test whose setup differs says why next to it.
- A test name states the claim. A new test is mutation-checked: break the rule it guards and see it fail (the PRs that added tests say which mutation).
- Schedulers are disposed in `afterEach`; never `--test-force-exit`. Don't add a long game when a small test of the rule would do.

### Comments and docs
- Comments say why, and cite the source: the PRD section (`PRD §50`), the bead (`ja-xxx`) or the research note for the biology. A comment that restates the next line goes.
- A behaviour with a real-world basis follows the `adding-mechanics` skill: research note, PRD section and bead epic before code. A sense the ant can't have is not added (`docs/vision.md`).
- A decision goes in the PRD as a numbered section; new work is a bead, not a TODO comment. When a rename or move leaves a doc pointing at the old name, fix the pointer in the same PR (the PRD keeps old names as history).

### Git and PRs
- One PR per stage or slice, branch `claude/…` as assigned, squash merge unless the PR needs its commits kept (a bulk reformat is merged by rebase and its hash goes in `.git-blame-ignore-revs`).
- The commit and PR text say what changed and why, what was measured (test counts, timings, goldens), what was not run, and the Jev cost note. Attribution lines as the session gives them.
- A fresh review agent reads every PR before merge; findings are fixed or answered on the PR, then merge. Never push to `main`, never force-push a branch you didn't create.

### Spend and safety
- `JEV_API_KEY` stays in the server's environment. A live Jev run (`colony-live`, `precache` without `--import`) spends money: only when the owner asks. Everything else in the repo runs offline.
- Don't weaken a check to get green: no skipped, quarantined or loosened test, no empty commit to re-run CI.

### Reporting
- Say what you measured and with which command; say what you did not run. "Tests pass" is a count and a tier. A mutation that was not caught is a finding, not something to leave out.
