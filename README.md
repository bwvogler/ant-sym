<h1 align="center">Jev Ants</h1>

<p align="center"><em>Two ant colonies and a fungus on one map, each ant steered by a Jev decision.</em></p>

Every ant forages on its own: it lays a trail to food and a trail home, and switches between
exploring, following and going home. [Jev](https://typesafe.ai) decides, once per *situation*
rather than once per ant, which mode an ant should be in under its colony's doctrine, which
stance each colony takes (forage, defend, raid), and what the fungus does under the player's
aim. Answers are cached, so a game costs roughly $0.10–0.15 an hour of retuning.

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

- **The colony game**: a procedural 512×320 world of rock, soil
  and food, dug underground by default (*Ground → open* for the surface), with two
  colonies, Ink and Amber. Food makes ants, fights kill them, and each colony's
  strategist picks forage, defend or raid. The ants forage on their own: they lay a
  trail to food and a trail home, and switch between exploring, following and going home.
  You are the fungus and nothing else: paint spores of one of three strains, choose what
  the fungus may do and what it aims for, and paint *lure* or *alarm* scent. You win
  when the colonies become one (*unified*) and lose if one falls. With **Start Jev**, Jev
  picks every colony's ant modes and stances under its doctrine, and what the fungus does
  under your aim, each once per situation, for roughly $0.10–0.15 an hour of retuning
  (PRD §11–12, §19).

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

## Hosting

The app is a Vite dev server with middleware, run locally. To host it: build the
front end (`npm run build`), serve `web/dist` statically, and run the same handlers
from `web/server/api.ts` behind any Node HTTP server with `JEV_API_KEY` in its
environment. The handlers check `Origin` against the host and keep the key out of
every response and log. Each visitor shares one spend ledger, so a hosted copy
should lower the default caps.

## Development

```sh
npm test            # every node --test suite: server, colony, ui (native TS, Node ≥ 22.18)
npm run lint        # oxlint
npm run typecheck   # tsc -b
```

`web/src/colony` (colony, nest and fungus) is pure TypeScript and testable headless;
`web/shared` holds the wire types; `web/server` is the proxy and ledger; `web/src/ui` is
React, canvas and the browser-side Jev client. Work is tracked with [beads](https://github.com/steveyegge/beads)
(`bd ready`). MIT.
