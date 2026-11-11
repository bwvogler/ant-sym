<h1 align="center">Jev Ants</h1>

<p align="center"><em>Ant colonies whose every choice comes from what an ant can sense, and a fungus that turns their rivalry into one colony by working through those senses.</em></p>

## Goal

**One policy per species, fed only by the senses.** Each species, and each colony, has a
single policy. Every choice an ant makes comes out of it: where to walk, whether to dig, what
to carry, whom to fight. Its only input is what that ant can actually perceive: trail and alarm
odours, the hydrocarbons of an ant it touches, how often it meets returning foragers, vibration,
gravity, its own drifting home vector, its own body. All of it is grounded in research on real
ants. Nurses, diggers, foragers, undertakers and chamber roles should *emerge* from that one
policy acting on local cues, not be scripted beside it.

**A fungus that works through those senses.** The player is a fungus. It changes what a host
perceives and what it gives off, the way real manipulators do: *Rickia* changes one cuticular
alkane, and supercolonies form when recognition odours stop differing. It responds to signals
the fungus itself can sense, and it has effectors of its own: sporulation, a scent of its own,
and a host's body near the end. It never decides for an ant.

**From conflict to collaboration.** Left alone, colonies compete. The fungus shapes its policy
so they tolerate each other, share trails and divide the work, until they act as one.

**Then more capable organisms.** The same pattern of a sense table and an action set under one
policy shape extends to other ant species, then to other social insects, then beyond. The
fungus adapts its policy to each new host it can reach.

The long form is [docs/vision.md](docs/vision.md).

## Where it stands

- The ant policy chooses one of four modes (explore, follow, return, fight) from six sensed
  fields. A colony stance (forage, defend, raid) is chosen from colony-wide totals and
  broadcast to every ant.
- Much of the nest is still scripted from knowledge no ant has: work by age thresholds,
  chamber placement and roles, nursing and food flow, the midden, raid targets. Each one is
  listed in the [gap table](docs/vision.md#where-the-code-is-today), with the sensed cue that
  should replace it and a bead (`ja-k4k`).
- The fungus already acts through perception, emission and the body: channel gains,
  recognition tolerance, odour masking, trail laying, and (`crown`) a lethal infection
  passed to the queen and brood a host tends. What it *senses* still includes facts no fungus
  could read, such as the host's mode.

[Jev](https://typesafe.ai) answers each policy question once per *situation* rather than once
per ant, and the answers are cached, so a game costs roughly $0.10–0.15 an hour.

## Run it

```sh
export JEV_API_KEY=...      # your TypeSafe key; the browser never sees it
cd web && npm install && npm run dev
open http://localhost:38500
```

The dev server is the app: Vite serves the React front end and a small middleware
holds the key, forwards packed requests to `api.typesafe.ai`, and enforces the
spend and time caps from the real `usage.input_tokens` of every reply.

## What you can do

- **The fungus game** (the epic `ja-lo8`, PRD §50): one procedural world seen two ways, the surface from above and the nests below (PRD §51, §55), with two colonies, Ink and Amber. Food makes ants, fights kill them, and each colony's strategist picks forage, defend or raid. The ants forage on their own: they lay a trail to food and a trail home, and switch between exploring, following and going home.
  - A start screen opens the game: your spores fall by the Ink colony's hole and ants walking out pick them up (`Game.land`). It runs at 4× by default (1–8× in the top bar), and the top bar's goal line follows the chapters (`colony/chapters.ts`).
  - You are the fungus and nothing else. The main screen is the field, a top bar (play, speed, time, where the game stands) and the fungus's panel: how far it has spread, and its **aim**, your words for what it wants.
  - Jev picks every colony's ant modes and stances under its doctrine, and what the fungus does under your aim, each once per situation. Answers are kept and some ship with the page, so Jev is asked only for a situation with no answer yet under the words in force, and a game that meets only answered situations spends nothing. One daily budget caps what Jev costs (`JEV_DAILY_USD`, default $0.10; PRD §11–12, §19, §50.11).
  - The page ships Jev's answer to every ant and strategist situation under each preset doctrine (`web/public/precache/`, `scripts/precache.mjs`), so a first game asks Jev almost nothing. Answers are kept and keep playing when Jev can't run (no key, the spend cap reached, the Pages build); then no policy can be changed.
  - New words don't wipe the board: until Jev answers a situation under them, the earlier words' answer plays, dimmed in the ant card.
  - Each colony's doctrine is its nature, not yours to rewrite. You win when the colonies become one (*unified*) and lose if one falls.
- **Details** (top right): the colonies' numbers, Jev's spend and caches (Stop and Resume), infection and unity, the world's settings, and the lab: the fungus's menu and each colony's doctrine, for experiments. There is no spore brush: the fungus reaches the ants only from where it lands (PRD §50.15).
- **Learn** (top right): a field guide to what is on screen, with what real ants do and
  links to the research notes; the policy (the fungus's aim and menu, which you shape, and
  each colony's doctrine, which you can read), with how each decides and the exact request
  Jev is sent; and the nest's chambers.
  Turn on **Labels** on the field to name the chambers and click one to inspect it (PRD §47).

## How it talks to Jev

A request carries up to a hundred *situations*. The state is a JSON object with one key per
situation; each gets its own question (an ant's mode, a colony's stance, one of the fungus's
interventions). Jev evaluates each question against the state independently, so a packed
request costs the same as a hundred single ones but takes one round trip. Each distinct
situation is asked once and its answer reused (turned and mirrored copies count as one where
the world allows it), so cost follows how many different things happen, not how many ants
there are. Until an answer arrives an ant follows the local rule.

The server keeps a connection pool so parallel requests overlap, and counts the real
`usage.input_tokens` of every reply against the spend and time caps. Output tokens are free.
Colony questions run about 450–560 input tokens each as a game asks them (`npm run
colony-cost`), the fungus's about 530–570. The schemas, measured numbers and every design
decision are in [docs/PRD.md](docs/PRD.md).

## Documentation

- [docs/vision.md](docs/vision.md): the goal, what an ant may sense, and what is still scripted.
- [docs/README.md](docs/README.md): the index of research notes and how they cite. Each note
  links the primary papers it rests on:
  - [ant-communication.md](docs/ant-communication.md): signal channels, their ranges and
    lifetimes, and recognising rivals;
  - [nest-and-home.md](docs/nest-and-home.md): homing by path integration, gravity and floor
    marks; the queen; nest architecture; jobs by place and age;
  - [fungus-policy.md](docs/fungus-policy.md): what real parasites do to ants, and the levers
    the fungus can pull;
  - [queens-and-merging.md](docs/queens-and-merging.md): several queens, and orphaned
    colonies merging.
- [docs/PRD.md](docs/PRD.md): the decision log, with every measured number.

## Hosting

The app is a Vite dev server with middleware, run locally. To host it: build the
front end (`npm run build`), serve `web/dist` statically, and run the same handlers
from `web/server/api.ts` behind any Node HTTP server with `JEV_API_KEY` in its
environment. The handlers check `Origin` against the host and keep the key out of
every response and log. Each visitor shares one spend ledger, so a hosted copy
should lower the default caps.

## Live demo

Every merge to `main` publishes the static build to GitHub Pages
(`.github/workflows/pages.yml`, after lint, typecheck and tests):
<https://bwvogler.github.io/ant-sym/>. The API is dev-server middleware, so the
page has no backend and no key: the game plays Jev's answers already kept in the
browser, the local rule elsewhere, and the policy editors say why they are disabled. One-time
setup: Settings → Pages → Source: GitHub Actions.

## Development

```sh
npm test            # every node --test suite: server, colony, ui (native TS, Node ≥ 22.18)
npm run test:unit   # just the quick tier (~9 s); test:watch reruns it on save; see CLAUDE.md for the tiers
npm run lint        # oxlint
npm run typecheck   # tsc -b
```

`web/src/colony` (colony, nest and fungus) is pure TypeScript and testable headless;
`web/shared` holds the wire types; `web/server` is the proxy and ledger; `web/src/ui` is
React, canvas and the browser-side Jev client. Work is tracked with [beads](https://github.com/steveyegge/beads)
(`bd ready`). MIT.
