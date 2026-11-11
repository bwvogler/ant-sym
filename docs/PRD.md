# jev-ants — product requirements

*Written 2026-10-25 from an interview with Aaron. Every decision below was chosen explicitly; the "why" is kept so later work can revisit it on purpose rather than by accident.*

> **Status (2026-11-02): the picture mode is removed.** The app was first built to make ants form a typed or uploaded picture (§1–8 and the picture parts of §3–4). That mode, its code (`web/src/sim`, `App.tsx`, the picture Jev scheduler and overseer) and its scripts (`probe`, `situations`, `cacheprobe`, `bakeoff`) are gone; the colony game (§9 on) is the whole app. §1–8 stay as the record of the interview, the Jev contract and the measured token and latency numbers the colony's cost estimates were calibrated on. Where they say "the app" or point at `sim/`, read "the removed picture mode". The architecture below is current.

## 1. Vision

A web app where a few hundred to a couple of thousand ants, scattered at random, walk around and collectively form whatever the user typed or uploaded: a word, a letter, a black-and-white image. The point of the app is to **showcase Jev** (TypeSafe's System One decision model): every ant's step is a Jev decision made from what the ant can see around it. Nothing central plans the picture. It emerges.

Tone is the spirit of the ant colony: self-coordination, local information, a picture nobody drew.

## 2. Decisions from the interview

The table is the original interview, with later reversals marked *(now: …)*. The code is the reference for current numbers; §8 explains the picture-app changes, §9 on are the colony.

| Topic | Decision | Why |
|---|---|---|
| Format | Web app. Vite + React + TypeScript + Tailwind v4, Canvas 2D for the field, a small Node proxy for the API key. | Moving a few thousand dots is trivial in a browser; the bottleneck is Jev round trips, not rendering. No heavier engine needed. WebGL points only if we ever want 20k+ ants. |
| Agent model | **Packed requests.** ~100 ants share one `state`; each ant gets its own questions. | Jev evaluates every question in isolation against the shared state, so each ant still gets an independent decision and can genuinely see its neighbours. One state per request is the API's shape; there is no batch endpoint. Measured: 100 ants in ~0.5 s. |
| Ant brain | Three questions per ant: **direction** (choice: 8 compass points + stay), **pace** (score: creep / walk / hurry), **settle** (noul: "this cell still needs ants, stay"). *(Now: direction + settle only, ~296 tok/ant; pace was dropped in the bake-off, §8.1b–8.2.)* | Extra questions cost almost no latency. Settling is what makes the picture sharpen instead of jitter. |
| Scale | 500 to 2,000 ants, default 1,000. | Enough density for letters and simple images at a 64×64 grid *(now 96×64, `DEFAULT_PARAMS.size`)*. |
| Cadence | Each **unsettled** ant re-decides about every 2 s *(now: at least 1.5 s apart, `minAgeSeconds`, §8.6)* and coasts in between; settled ants ask again only when their cell's deficit changes. Scheduler takes the stalest ants every ~200 ms. | 1,000 ants → ≤5 requests of 100 per second at the start, decaying as ants settle. Measured headroom: 8 parallel requests of 100 ants in 0.65 s wall. Parallelism buys latency, not cost (see §8). |
| Spend control | Explicit **Start / Stop**. Running cost from the real `usage.input_tokens` of every response × $0.042/M, never estimated. Three stop conditions, whichever first: **formed** (local grid error under threshold; *now the overseer noul is shown beside it and does not gate it, §8.2*), **time cap** (default 3 min), **spend cap** (default $0.50). Caps editable. After a stop, ants idle on the local rule and Jev is not called. | A demo must never run away, and a formed picture should cost nothing to look at. Cost plan in §8. |
| Images (Jev) | **Overseer.** Every few seconds, send the current field and the target as two images; ask a `box` ("the region of current that most lacks ants vs target") and a `noul` ("current is a recognisable copy of target"). The box becomes an attractor hint in each ant's state; the noul drives a "formed" badge. | Showcases Jev's new image input without making the core loop depend on a feature TypeSafe calls "dreamer-ready, not production-ready". |
| Shading | Target image → greyscale → downsample to a grid (64×64 default, *now 96×64*) → darkness per cell → normalised so Σ target = ant count. Density is tone. | Text and images are the same pipeline: text is rendered to an offscreen canvas first. |
| Baseline | A **local-rule** mode (greedy toward max neighbouring deficit, with noise) next to Jev mode. | A greedy rule would also form the picture; the demo should show the difference, not assert it. Also the fallback at the spend cap and under 429s. |
| Look | **Ink on warm paper**: lingo-dojo palette. Light: ink ants on `#f6f4ef`; dark: pale ants on charcoal. One jade accent for the overseer box and selected things. Ants are 2 px oriented ticks. | More ants = darker reads naturally as a pen drawing. Reuses an existing, tested token scheme. |
| Controls (v1) | Text input + image upload with live target-grid preview; ant count, sim speed, Jev/local toggle; Jev telemetry panel; overlays (deficit heatmap, overseer box, pheromone trails). | All chosen. |
| End state | Overseer "formed" badge; **Scatter** button; **Morph** (type a new target while formed and ants walk to it). GIF recording deferred to a later milestone. | Scatter is the replay moment. Morph is cheap once the target is just a grid. |
| Deployment | Local first (port **38500**, key from `JEV_API_KEY` in the shell), server written so it can be hosted later with per-visitor budgets. *Hosted since 2026-11-05: Pages for `main` and each PR, Jev through a Cloudflare Worker behind a passphrase and a $2/day cap, one shared ledger rather than per-visitor budgets (docs/hosting.md).* | Same shape as lingo-dojo / travel-guide. |
| Process | Beads (prefix `ja`) + one PR per milestone with agent review before merge. | House convention. |
| Repo | Public, `scalefreegan/jev-ants`, MIT *(now `bwvogler/ant-sym`)*. | Showcase piece. |

## 3. Architecture

```
browser (Vite + React)                               node (Vite dev-server middleware, web/server/)
┌────────────────────────────────────────┐           ┌──────────────────────────────────┐
│ colony/    colony + fungus: pure TS    │           │ api.ts    wrap(): same-origin    │
│   world, colony, pheromone, battle,    │  POST     │ http.ts   JSON bodies, HttpError │
│   recognition, fungus, game, brains,   │ /api/jev  │ jev.ts    node:https Agent pool  │
│   policyCache (situation → answer)     │ ────────► │           of N → TypeSafe        │
│ ui/        React, canvas, Jev client   │ ◄──────── │ ledger.ts tokens, $, caps, width │
│   colonyJev (queues, batches, caches)  │  answers  └──────────────────────────────────┘
│   ColonyField, panels, hooks           │                         │ Bearer JEV_API_KEY
└────────────────────────────────────────┘                         ▼
                                                      https://api.typesafe.ai/v1/systemone
   shared/jev.ts: wire types, price, caps, in-flight width (both sides)
```

- **Game loop** runs in the browser with `requestAnimationFrame`; Jev answers arrive asynchronously and the tick never waits on the network.
- **Scheduler** (`ui/colonyJev.ts`): every interval, the queued situations go to Jev, at most `batch` a request, with an in-flight limit (browsers allow 6 connections per host; one stays free so Stop reaches the server at once). The server retries 429/529 honouring `retry-after`; a 429 "busy" from the proxy releases the situations to be asked next cycle.
- **Server** holds the key, forwards packed requests, counts `usage.input_tokens` and enforces the caps.
- **Connection pool**: Node's `fetch` on one dispatcher serialised our requests (10 × 50 ants took 2.9 s stacked; separate connections took 0.65 s for 8 × 100). The server uses a `node:https` `Agent` sized for the in-flight limit (an undici `Agent` queued behind one warm socket too, `web/server/jev.ts`), and a test pins that parallel requests overlap.
- `colony/` is pure and covered by `node --test`; the renderer and React layer are thin.

## 4. The Jev contract

### 4.1 Ant request (packed)

The original shape, kept for the record. What is sent now is `packRequest` in `web/src/sim/jevBrain.ts`: a `legend` instead of `rules`, `room` / `idle` / `far` in each ant's state, and no pace question (§8.1b–8.2).

```jsonc
{
  "model": "jev-latest",
  "state": {
    "rules": "Each ant is one key in `ants`. deficit3x3 is how many more ants each of the 9 cells around the ant still needs (negative = too many), row-major NW..SE, centre = the ant's own cell. crowd is 0..1 local density. attractor points toward the region the overseer says most lacks ants.",
    "ants": {
      "a17": { "pos": [12, 40], "heading": "NE", "deficit3x3": [0.5, 1.2, -0.3, 0, 2.1, 0.4, -1, 0, 0.2],
               "crowd": 0.8, "nearbyHeadings": ["N", "NE"], "ticksSinceMove": 3, "attractor": "E" },
      "...": {}
    }
  },
  "questions": {
    "a17_dir":    { "type": "choice", "instructions": "Which way should ant `a17` step so the cells that still need ants get filled, avoiding crowding?",
                    "criteria": { "N": "step north", "NE": "…", "E": "…", "SE": "…", "S": "…", "SW": "…", "W": "…", "NW": "…", "stay": "do not move this cycle" } },
    "a17_pace":   { "type": "score", "instructions": "How fast should ant `a17` move this cycle?",
                    "criteria": ["creep: barely move, nearly settled", "walk: normal pace", "hurry: far from where ants are needed"] },
    "a17_settle": { "type": "noul", "instructions": "Ant `a17` is standing in a cell that still needs ants and should settle here." }
  }
}
```

Answers: `choice` carries `confidence` and a full `probabilities` map (we can sample from it for liveliness instead of always taking the argmax); `score` is an expected value 0..2 with `probabilities`; `noul` is a bare probability.

Limits that bind: 64k context tokens per request → about 150 ants per request at ~376 tokens each. We pack 100. The state shape is the main cost lever; a terser schema measured 274 tokens/ant.

### 4.2 Overseer request (images)

Header `TypeSafe-Danger-Zone-Images: true`. Two PNGs (280–1568 px per side) in `assets`, referenced from `state`:

```jsonc
{ "model": "jev-latest",
  "state": { "target": "img-target", "current": "img-current" },
  "assets": { "img-target": { "type": "image", "format": "png", "data_base64": "…" },
              "img-current": { "type": "image", "format": "png", "data_base64": "…" } },
  "questions": {
    "gap":  { "type": "box",  "instructions": "the region of `current` that most lacks ants compared with `target`" },
    "done": { "type": "noul", "instructions": "`current` is a recognisable copy of `target`" } } }
```

`box` returns normalised `{top,bottom,left,right}` in 0..1 and has no "not found"; `done` gates whether we trust it. Runs every 4 s (`overseerMs`; first planned as ~3 s, ~10 s once formed). Image tokens bill at the normal input rate.

## 5. Probe results (2026-10-25, real API, `scripts/probe.mjs`)

| ants / request | status | latency | input tokens | tokens / ant |
|---|---|---|---|---|
| 5 | 200 | 156 ms | 2,181 | 436 |
| 20 | 200 | 494 ms | 7,754 | 388 |
| 50 | 200 | 401 ms | 18,922 | 378 |
| 100 | 200 | 512 ms | 37,576 | 376 |

- Terser state (short keys, fixed small arrays), 100 ants: 27,404 tokens, 459–603 ms → 274 tokens/ant.
- Burst, 8 separate connections × 100 ants: all 200, wall 654 ms. No `retry-after`, no rate-limit headers, no 429 seen.
- Same burst on one Node `fetch` dispatcher: latencies stacked 343 → 2,949 ms. Client-side serialisation; see §3.
- Output tokens are free. Price is $0.042 per million input tokens.
- `GET /v1/models` lists `jev-latest` and `jev-preview` only.

**Cost model.** tokens/s = ants × tokens-per-ant ÷ cadence. At 1,000 ants, 376 tok/ant, 2 s: 188k tok/s → $0.0079/s → **~$28/hour** at full tilt; ~$20/hour with the terser schema; roughly halves at 500 ants or a 4 s cadence. Settled ants are scheduled rarely, so a formed picture costs little to hold. The $1 cap planned here is about 2–3 minutes of forming at 1,000 ants (the default became $0.50, `DEFAULT_CAPS`). The telemetry panel shows all of this live.

## 6. Milestones

Each is a bead (`ja-*`) and lands as one PR.

1. **Scaffold + proxy + probe** — Vite/React/TS/Tailwind, `web/server` with `wrap()`, `/api/jev` forwarding with a parallel connection pool and a test that proves overlap, budget ledger, this PRD, probe script committed.
2. **Sim core + local rule + text targets** — grid, ants, text → density grid, canvas renderer with the paper palette, greedy local mode, ant-count and speed controls. The picture forms without Jev.
3. **Jev ant brain** — pack/apply, scheduler by staleness, in-flight limit, backoff, Jev/local toggle, telemetry panel (in flight, median latency, tokens, cost, 429s, one ant's live state + answers), spend cap and banner.
4. **Overseer** — field + target PNGs, box + noul, attractor into ant state, formed badge, box overlay.
5. **Images, morph, scatter, overlays** — PNG/JPG upload with subject-aware fit, morph to a new target, scatter, deficit heatmap and pheromone trail layers.
6. **Polish + README** — README with a GIF, `macos/` Dock app if wanted, hosting notes with per-visitor budgets.

## 7. Risks and open questions

- **Cost at scale** is the real constraint, not latency. The state schema and cadence are the levers; tune with the telemetry panel.
- **Does Jev steer better than greedy?** Unknown until milestone 3. The toggle exists precisely so we can see. Sampling from `probabilities` instead of argmax may matter for liveliness.
- **Image accuracy**: TypeSafe says all models do worse on images than text. The overseer is a hint, never an authority; the noul gates the box.
- **Rate limits** are per org and unpublished. None hit in the probe; check the console before pushing past ~10 req/s.
- **Browser-direct calls**: CORS unconfirmed and would expose the key. Always via the proxy.

## 8. Cost strategy (added 2026-10-25 after the follow-up)

Jev bills per input token. Parallelism changes latency, not cost: tokens per ant were flat across pack sizes (184 at 100 ants, 187 at 50). So the plan attacks the two factors that do matter, **tokens per decision** and **number of decisions**, and reports only real cost.

### 8.1 Where the tokens go (measured, 100 ants, `scratchpad/decomp.mjs`, `noul.mjs`)

| part | tokens | note |
|---|---|---|
| ant state, compact string | ~45 / ant | `d=1,2,0,-1,3,0,1,2,0 c=0.4 h=NE n=N,SW i=3` plus a legend once |
| one `choice` question, 9 options | ~145 | option descriptions barely matter (full 150, minimal 145) |
| one `choice` question, 5 options | ~85 | roughly 15 tokens per option |
| one `noul` question | ~16 | no criteria |
| original schema (object state, 3 questions) | 376 / ant | §5 |
| terse state, dir choice + pace score + settle noul | 269 / ant | |
| terse state, dir choice only | 191 / ant | |
| **terse state, 3 nouls: north-vs-south, east-vs-west, settle** | **109 / ant** | 3.4× cheaper than the original; heading = atan2(P(north)−0.5, P(east)−0.5) is continuous |

Questions, not state, dominate. A choice over 9 compass points is the single most expensive thing an ant can ask.

### 8.1b Bake-off result (2026-10-25, `scripts/bakeoff.mjs`, 2×100 synthetic ants per schema, live API)

Synthetic states with one unambiguous wanting neighbour (or a cell with room). Chance is 12.5% exact, 37.5% within 45°.

| schema | tokens/ant | latency | direction exact | within 45° | settle when room | leave when over-full |
|---|---|---|---|---|---|---|
| A object + choice9 + score + noul (original) | 324 | 448 ms | 73% | 88% | 63% | 99% |
| B string + choice9 | 211 | 218 ms | 57% | 65% | 75% | 100% |
| C string + 3 nouls | 136 | 198 ms | 25% | 62% | 58% | 91% |
| **D object + 3 nouls (N/S, E/W, settle)** | **178** | 277 ms | 32% | **85%** | **89%** | **100%** |
| D2 terse-key object + 3 nouls | 146 | 210 ms | 27% | 74% | 98% | 87% |
| D3 object + choice9 + settle noul | 285 | 304 ms | 71% | 87% | 88% | 99% |
| E string + choice5 + settle noul | 177 | 219 ms | 42% | 78% | 52% | 91% |

Two lessons. **Structure beats terseness**: the same facts as a compact string (B, C) lose 20 points of steering accuracy against a plain JSON object (A, D); the token saving is not worth it. **Nouls steer as well as a 9-way choice within 45°** (85% vs 88%) at 55% of the tokens, and settle better (89% vs 63%), because the settle question is asked on its own instead of being the "stay" option of a crowded choice. Exact-direction accuracy is lower for nouls by construction: two binary axes land on diagonals, and the heading is read as a continuous angle anyway.

**Default brain: D3** (`compass`). **Selectable: D** (`nouls`) for the demo's comparison. (Revised the same evening — see below.)

**Revision after the first live run (2026-10-25 evening).** With the noul brain, 1,000 ants drifted into the south-west corner. Cause: Jev's "no opinion" on a noul is not 0.5. Flat ants (nothing around them) answered north 0.06 and east 0.19, so a heading read against 0.5 points south-west for every undecided ant; and because the neutral sits near zero, "south" has almost no dynamic range below it. Three calibration ants per request (flat state, answers used as that request's neutral point) fixed the far-hint cases but left the deficit cases noisy; a four-noul variant (N, S, E, W each against its own neutral) was no better (236 tok/ant). The compass choice has its calibration built in (probabilities over nine options sum to one) and, once the state carried an explicit `room` field for the ant's own cell, steered every synthetic group correctly (8/8 on N, S, E, W, SE, far hints, attractor, settle on room ≥ 0) at 296 tok/ant with mean confidence 0.78. The bake-off's synthetic states had an unambiguous wanting neighbour; the live sim is mostly ants with nothing in view, which is where the noul neutral bias bites. Lesson for the PRD: **a noul read as a signed axis needs calibration, and even calibrated it is a poor compass; a choice is self-normalising.** The noul brain stays selectable, with calibration, as the cheaper and visibly worse comparison.

### 8.2 Levers, in order

1. **Ask cheaper questions, but not wrong ones.** The default is the 9-way compass choice plus a settle noul on a structured state with an explicit `room` field (~296 tok/ant). It is 1.6× the cost of the noul brain per decision, but it steers; a brain that sends ants the wrong way costs far more in decisions. No pace question (pace follows confidence).
2. **Make fewer decisions.** Only unsettled ants are scheduled. Each decision buys a **commit distance**: an ant walks 1.1 cells when a neighbouring cell wants ants (and stops there) and up to 4 when far (then coasts), so the far-away phase costs a quarter as much. Settled ants are woken, and re-ask, only when their cell is over-full by more than one ant (fractional targets must not oscillate); Jev's "settle" is refused where there is no room.
3. **Stop.** Formed, time cap, or spend cap, whichever first. The tolerant coverage metric (error beyond ±0.5 ant per cell, free, `grid.ts coverage`) is the "formed" signal; the overseer noul is shown beside it as "recognisable N %" and does not gate the badge (§8.5: it reads 41–65 % on formed pictures). After a stop the scheduler is off, ants idle on the local rule, and the cost line does not move.
4. **Start/Stop is explicit.** Nothing calls Jev before Start. Scatter only scatters (after a stop the free local rule re-forms the picture); a run is always a Start, and Morph is a Start with a changed picture.

### 8.3 What a run should cost

Estimate at 1,000 ants, compass brain (~296 tok/ant), 2 s cadence, a ~90 s forming run where the active fraction decays from 1 to ~0.2 (mean ~0.5): about 22k decisions × 296 tokens ≈ 6.5M tokens ≈ **$0.27 per formation**; with commit distance roughly **$0.12**. Full-tilt rate is ~150k tokens/s ≈ $22/hour, but a run stops at formed, so the hourly figure only matters if the picture never forms. The $0.50 default cap is therefore several formations, not a fraction of one.

### 8.4 Real cost, not estimates

The server keeps a ledger of `usage.input_tokens` per response and the panel shows: tokens this run, dollars this run (tokens × $0.042/M), elapsed, requests, median latency, and the active-ant count. The per-formation figure from the ledger goes into the README once measured. If TypeSafe exposes a billing endpoint later, the console total should reconcile with the ledger.

### 8.5 Live results (2026-10-25, 1,000 ants, compass brain, overseer on)

| Run | Formed in | Requests | Tokens | Cost |
|---|---|---|---|---|
| "ANTS" from scatter | 13 s | 95 | 1.71 M | $0.072 |
| Morph "ANTS" → "JEV" (no scatter) | 9 s | 61 | 1.30 M | $0.055 |
| Morph "JEV" → uploaded ring PNG | 13 s | 90 | 1.68 M | $0.070 |

The overseer costs **1,259 input tokens per look** (two 480×320 PNGs plus the box and noul), about $0.00005, three looks per run at the 4 s cadence: noise next to the ants. Its `done` noul read 41–65 % on pictures the grid metric called formed (86–96 %), so the badge stays driven by the grid and the noul is shown as "recognisable N %". The box mostly landed on the blank middle of a formed letter or ring and was rejected by the ink-share guard (`box ignored` in the panel); it steered only early in a run. Fine as a showcase of the image path, not load-bearing, which is what §7 predicted.

### 8.6 Situation cache (2026-10-31, `scripts/situations.mjs`, offline)

The `cached` brain asks the compass questions once per *situation*, not once per ant decision (`web/src/sim/policyCache.ts`). A situation is the ant's view, reduced to a short key:

- **Neighbours**: each of the 8 cells around the ant is *wants ants* (> 0.3), *too many* (< −0.5) or *neither*.
- **Own cell**: whether it has room for the ant.
- **Hints**: the far-field and overseer directions, kept only when the ant must move and no neighbour wants it. That is when the legend tells Jev to use them.
- **Symmetry**: turned and mirrored copies of a situation share one key, and the answer is turned back for each ant.

Crowd, idle time, own heading and neighbours' headings are dropped. Jev's answer (full probabilities plus P(settle)) is kept for the page's lifetime and in `localStorage`, under a context hash of the legend, the question wording and the quantisation version. Within one request, ants in the same situation share one question pair: 100 unsettled ants mid-formation came to 16 situations (`scripts/cacheprobe.mjs --dry`).

**Offline numbers.** The harness runs the real sim headless with a greedy stand-in for Jev and counts what each schema would ask. It reproduces the live compass runs closely (§8.5: 1.71M / 1.30M tokens), so the counts are a fair estimate of the miss curve. Tokens are counts × 296 per ant decision (measured) or × ~263 per situation (estimated from request size, since a situation carries fewer fields). The cached runs ran back to back, so the cache was already warm for the second and third rows.

| Run (1,000 ants, 96×64) | compass | cached | cheaper by |
|---|---|---|---|
| "ANTS" from scatter | 7,178 decisions ≈ 2.13M tok, 20.0 s | 585 situations ≈ 0.15M tok, 21.5 s | 14× |
| Morph → "JEV" | 4,706 ≈ 1.39M, 10.5 s | 489 ≈ 0.13M, 8.5 s | 11× |
| Morph → "ANTS" again | 5,245 ≈ 1.55M, 13.6 s | 172 ≈ 0.045M, 9.8 s | 34× |

1,220 situations were cached after the three formations. Most of the remaining misses are genuinely new ones (new letter edges, new hint directions). Once a picture has formed, it costs almost nothing to form again.

**Two lessons from building the harness.**
1. **Hits keep the 1.5 s minimum age.** Serving cache hits every 200 ms cycle stalled the picture at ~70 % coverage. Ants at a peak of the far field turned on the spot instead of coasting off it, so the cadence is part of the policy, not just a cost control.
2. **The hints are only in the key when they are used.** Keeping far and attractor in every key doubled the situations asked (1,548 → 585 for the first formation). The legend already tells Jev to use them only when nothing nearby wants the ant.

**Still to measure live.** Run `JEV_API_KEY=… node scripts/cacheprobe.mjs` (about a cent). It reports:
- whether Jev answers the same request the same way;
- real tokens per situation;
- how often the situation's answer, turned back into the ant's frame, agrees with asking per ant on direction (exact and within 45°) and on settle.

Then run a live formation from scatter and a morph with the `cached` brain, and add them to §8.5. The stand-in cannot show any steering lost by quantising (deficit magnitudes and crowd are gone from the key). If fidelity is low, add a fourth class for strong want (> 1.5) before anything else.

`compass` stays the default until those live numbers are in.

## 9. The colony (MR 2, 2026-10-31): a world the ants forage on their own

This is the first step toward the Sim-Ant-style game: a procedural world, a nest and food, no Jev. The page is at `#colony`, beside the picture. The sim is pure TypeScript in `web/src/colony/`, tested with `node --test`.

- **World** (`world.ts`):
  - A seeded 160×100 map: rock from two octaves of value noise (~22 %). (§12 makes it 512×320, chunked.)
  - The nest sits on open ground joined to most of the map. A spot inside a rock blob, once cleared, made a sealed pocket, and seed 2 had no food it could reach.
  - Six food patches, at least a quarter of the map away from the nest, placed only where the nest can walk to them.
- **Pheromones** (`pheromone.ts`):
  - Two channels, evaporating and spreading every tick; nothing spreads into rock.
  - The *food* trail is laid by ants carrying food, so it leads to food. The *home* trail is laid by ants walking out, so it leads home.
  - A deposit falls with the seconds since the ant left its source, so each trail rises toward that source.
- **Ants** (`colony.ts`), in three behaviour modes, each steered for free every frame:
  - *explore*: wander, and walk to food in sight.
  - *follow*: climb the food trail with three sensors.
  - *return*: climb the home trail, plus path integration toward the nest. Path integration pauses for a second after a bump, or a straight line home walks into the same rock forever.
- **Mechanics, not choices**: picking food up, putting it down, and resting at the nest.
- **The mode choice is the one decision.** It is a `Policy(situation) → mode`, asked only when an ant's situation changes, not every frame. The situation is: mode, carrying, tired (out more than 60 s without food), and the food and home trails, each none / faint / strong. That makes 108 situations in all.
  - Today the policy is the local rule.
  - *Tired → go home* breaks ant mills. Without it, ~770 of 800 ants circled trails to food that was gone, and nobody was left exploring.
  - **This is the seam for MR 3.** A cached Jev policy answers at most 108 questions per doctrine, however many ants and however long the game runs. The panel shows mode choices per second (500–2,000) next to situations seen (~30 of 108 in a typical run).

Measured (headless, 800 ants, 1/30 s steps): ~0.8 ms per tick. Over six seeds the colony brought home 49–86 % of the food in 3 sim-minutes (seed 1: 1,077 of 1,632 by 60 s).

Known limits, left for later MRs:
- There is no fungus input yet (painting pheromone and retuning come in MR 3).
- There are no rivals or fights (MR 4).
- Food does not regrow, so a long run ends with the map picked clean.

## 10. The fungus and Jev in the colony (MR 3, 2026-10-31)

With Jev on, each ant's mode choice is **Jev's answer for its situation under the colony's doctrine**, asked once and cached. The player is the fungus.

- **Brushes are free.**
  - *Lure* paints food scent, so ants follow it.
  - *Alarm* paints a new alarm channel. It fades in seconds, every mode steers away from it, and it is part of the situation, so a doctrine can make ants go home on it.
- **Doctrine is the paid lever.** It is the player's words for how ants should behave: three presets, or custom text.
  - The doctrine rides in the shared request state and in the cache context (`colonyBrain.policyContext`).
  - A new doctrine re-asks only the situations the colony meets. One used before is free, because caches are kept per doctrine in memory and `localStorage`.
  - The panel shows the retune estimate before you commit to it.

**Situations.** A carrying ant always goes home. That is now a mechanic, never asked. The situation is mode × tired × food trail × home trail × alarm, so 3 × 2 × 3 × 3 × 3 = **162**. Each request carries one shared state (legend, doctrine, situations) and one 3-way `choice` per situation (`packModeRequest`). Situations don't depend on the map, so the cache carries over to new worlds.

**Client** (`ui/colonyJev.ts`, the colony's `JevScheduler`).
- The colony needs a mode at once, so the policy is synchronous. It returns the cached answer, or the local rule while the situation is queued.
- The queue goes out every 300 ms: at most 100 situations per request, 2 requests in flight, each situation asked once.
- Answers fill the cache and every ant reconsiders on its next tick.
- It uses the same proxy, ledger and caps as the picture, with colony defaults of $0.10 and 30 min.
- On 409 it stops and goes back to the local rule. On a failure it cools down for 5 cycles.
- On busy it requeues the batch into every current lane asking under the context it was asked under, not only the lane that sent it. That lane may be gone after a new game, or have moved to another doctrine (ja-1u2, PR #32).
- Lanes take turns (ja-ytc, PR #32): each cycle takes one batch per lane per pass, starting after the last lane served. A long mode queue no longer keeps the fungus and the other colonies waiting.
- Stored answers are kept only if the lane's question could have given them (ja-ue6). Saving merges with what another tab stored (`ui/cacheStore.ts`).
- A Start reply that lands after Stop or after the page unmounts opens no run, and stops the server run it opened (ja-7tf). This uses a counter, not a latch, because React's StrictMode disposes the client once on mount and keeps using it.

**Cost, offline** (`npm run colony-cost`: 800 ants, 10 sim-minutes, 5 doctrines with the first one repeated last, alarm painted every ~20 s). The stand-in for Jev is the local rule; tokens are estimated from request size.

| Doctrine | New situations | Requests | Tokens | Cost |
|---|---|---|---|---|
| Forage | 47 | 23 | ~16.2k | $0.0007 |
| Cautious | 47 | 28 | ~18.2k | $0.0008 |
| Scouts | 41 | 24 | ~15.8k | $0.0007 |
| Custom | 32 | 13 | ~9.9k | $0.0004 |
| Forage again | 6 | 4 | ~2.5k | $0.0001 |

That is about 63k tokens, **≈ $0.016 per hour** retuning every 2 minutes, against the ≤ $0.25/h target. 443k mode choices were answered by 173 questions. Tokens per question (~360) are dominated by the legend and doctrine, because situations trickle in a few per request. A longer batching interval would cut that, but it is not needed at this spend.

**Browser check** with Jev stubbed to answer like the local rule:
- Forage asked 16 situations in the first 8 s.
- Painting alarm added 8.
- Cautious added 25.
- Switching back to Forage added 4: situations Forage had never met.
- 92 % of mode choices were served from the cache.

**Still to measure live:** a colony run against `api.typesafe.ai` for real tokens per question, and whether Jev follows each doctrine (e.g. Cautious sends ants home on alarm).

## 11. A rival colony, fights, growth and the strategist (MR 4, 2026-10-31)

The colony page is now a game: your colony and a rival's on one map, sharing its food.

- **World.** `generateWorld` adds a rival nest. Out of 400 spots the player's ants can walk to, it takes the farthest. Food patches keep a quarter of the map's size away from both nests, so maps differ from MR 2–3 for the same seed.
- **Growth.** Every 4 food stored is a new ant, born in a free slot of a fixed capacity (1.5× the starting count). Food beyond the cap waits in the larder.
- **Fights** (`battle.ts`).
  - An ant with enemies in the 3×3 cells around it dies with probability 1 − e^(−1.5 · dt · enemies ÷ allies). That is Lanchester-like: equal numbers trade, the bigger crowd wins.
  - Deaths are decided for everyone before anyone is removed.
  - A fighting ant lays alarm in its own colony's field, which brings defenders and drives foragers away.
  - A dying carrier drops its food on the spot, so food is conserved; a test pins it.
- **A fourth mode, fight.** The ant goes for enemies within two cells, else up its colony's alarm trail, else (when raiding) toward the rival's nest.
- **Stance**, the strategist's choice: forage, defend or raid. Every 5 s each colony picks one from a coarse view of itself: ants against its cap, recent losses, enemies near its nest, food left on the map, and the larder.
  - It is cached per view and doctrine, like the ant modes: 324 views (the current stance is part of the view; review corrected an earlier "108").
  - With no living rival (the rival turned off, or beaten) there is no stance to choose: the colony forages and the strategist asks nothing. Found in review: solo, the local strategist picked "raid" once food ran low, and the colony's explorers became fighters with no target.
  - The stance is part of every ant's situation, so a change re-asks the ants on its own.
  - The ant situation is now mode × tired × food × home × alarm × enemy × stance = 1,296 possible. A real game meets a few hundred.
- **The outcome.** A colony with no ants and too little food for one more is beaten. The panel shows a banner.
- **Jev.** The player's colony can play on Jev: one client, two cached lanes (ant modes and stances), one doctrine. The rival plays the local rule and the local strategist, for free.

**A navigation fix found on the way.** On seed 3 the rival's nest sat behind a wall. Tired ants homing in a straight line bumped the wall, took a 1 s detour and bumped it again, while nobody walked out to lay a fresh home trail: 447 of 450 ants stuck. Detours now double with each bump in a row, from 0.5–1.5 s on the first bump up to 8–24 s, and during a detour the ant wanders instead of homing. (Review found this is not enough on every map: a long wall can still trap homing ants; PR #5 replaces it with homing by the ant's own senses, §12.)

**Measured headless** (600 + 600 ants, 1/30 s steps): ~1.8 ms per tick.
- Seed 1: your colony wiped out the rival by ~200 s.
- Seed 2: an even war.
- Seed 3: your colony out-foraged the rival and kept raiding.

**Cost, offline** (`npm run colony-cost`: 10 sim-minutes, 5 doctrines with the first repeated last, alarm painted every ~20 s, stand-in Jev = local rule):

| Doctrine | Ant situations | Stance views | Requests | Tokens | Cost |
|---|---|---|---|---|---|
| Forage | 267 | 7 | 105 | ~116k | $0.0049 |
| Cautious | 322 | 5 | 125 | ~138k | $0.0058 |
| Warlike | 150 | 1 | 70 | ~70k | $0.0030 |
| Custom | 54 | 2 | 33 | ~29k | $0.0012 |
| Forage again | 2 | 2 | 3 | ~2k | $0.0001 |

That is about 355k tokens per session, **≈ $0.09 per hour** retuning every 2 minutes, against the ≤ $0.25/h target. War meets far more situations than foraging (459 vs ~60), and tokens per question rise to ~440. Steady state stays near zero, and returning to an old doctrine stays free.

**Browser check** with Jev stubbed:
- 212 ant situations and 5 stance views were asked in 45 s.
- 98 % of mode choices came from the cache.
- The rival's raids and your colony's raid stance were visible.
- Light, dark and phone layouts all worked, with no console errors.

**Still to measure live:** real tokens per question, and whether Jev's stances follow each doctrine (Warlike raids, Cautious defends).

## 12. A chunked world, ten times the ground (MR 5, 2026-10-31)

This is the first step of the lifetime-world plan. It builds on the research note `docs/ant-communication.md`, which found the old map was a ~0.6 × 0.4 m patch, where real foraging ranges are 20–100+ m. The default map is now **512×320** (10× the area), stored in **64×64 chunks**, and it ticks faster than the old 160×100 map did.

- **Chunks** (`chunks.ts`).
  - Each layer (rock, food, every pheromone channel, every count grid) is one typed array per chunk, allocated when first written. A missing chunk reads as the layer's `empty` value.
  - Chunk coordinates are signed, and the table grows to cover any chunk asked for. That is the hook for the endless map (MR 9).
  - A read is a few integer operations (`x >> 6`, `x & 63`).
- **Position-pure terrain** (`world.ts`).
  - Height is three octaves of *hashed* value noise: blobs at 18 cells, rough edges at 6, and broad rocky or open regions at 80. Every cell's height is a pure function of (seed, x, y), so any chunk can be generated alone, in any order. A test pins that the 160×100 corner of a 512×320 map is the 160×100 map's terrain.
  - Rock is a fixed height threshold, calibrated once (from a fixed spread of seeds) to ~22 %. The mean over 20 seeds is within ±3 %; a single seed varies more, because of the broad octave.
- **Placement.**
  - The player's nest must pass `escapes()`: a bounded search shows it can walk 48 cells away, so it is not in a sealed pocket. This works on a map of any size. On a finite map the whole-map `reachable()` still checks the result, and tests use it as the oracle.
  - Rival nests aim for **140 cells** from the nearest nest (at least 70 % of that): neighbours a walk apart, not opposite corners.
  - Food is placed **chunk by chunk**, each chunk's patches from its own seed: 1.5 patches per chunk. Every food cell is at least 24 cells from any nest (the patch's edge is checked, not just its centre). Over seeds 1–40 that gives 17.6–24.1k food on the default map, median ~20.8k.
- **Food accounting.** All changes go through `takeFood` / `dropFood`, which keep `map.foodLeft` as a running count; the full-map scan is gone.
- **Sparse pheromones** (`pheromone.ts`).
  - Only *awake* chunks are stepped. A chunk wakes when scent is laid in it or a neighbour's facing edge holds some. It sleeps, zeroed, when everything in it is below `SLEEP` (1e-4, far under `FAINT` = 0.05) and no neighbour is feeding it.
  - Review caught a gap that the "no neighbour feeding it" condition now closes: a chunk woken by a faint edge got less than `SLEEP` and was zeroed again every step, so faint scent never crossed a chunk border.
  - The step is double-buffered like the dense one, so a chunk reads only the old values of its neighbours. Two tests pin sparse against dense to within 1e-4: one across chunk borders and a ragged map edge, and one with a steady source 8 cells from a border.
  - Levels below 1e-6 are flushed to zero so faded ground takes a cheap path. Flushing at `SLEEP` itself stalled faint trail fronts (7× too little five cells past a trail's end), so the flush threshold sits far lower.
- **Per-channel step rates.** `advance(dt)` steps each channel only when its own interval has passed: at most 5 % spread or 2 % evaporation per step. At 30 Hz ticks that is 6 Hz for food and home (every 5th tick) and 15 Hz for alarm (every 2nd), instead of every tick. Colonies' clocks are offset, so they don't step on the same tick; an offset clock's first step covers only the time that really passed. `step(dt)` stays exact, for tests. Review found the comparison off by a float hair (five ticks of 1/30 s sum to just under 1/6 s, so food and home stepped every 6th tick); it now has a 1e-9 tolerance and a test.
- **Counts without scanning.** Occupancy and enemy grids are `CountGrid`s, built from the ants. A reset clears only the cells that were touched. 8×8 block sums let `#enemyHeading` and `resolveFights` skip ants with no enemy nearby.
- **Sensors.** All three channels are read at once at each sensor position. The two side sensors come from one `cos`/`sin` pair by angle addition, and the hot paths use squared distances instead of `Math.hypot`.

**Homing by the ant's own senses** (from the reviews of PRs #2 and #4; reworked at the product owner's request).
- **The problem:** homing was a straight line to the nest plus home-trail climbing. On many maps it trapped ants behind long walls, sometimes every homing ant of a colony, freezing the game. #4's doubling detours did not fix it.
- **First fix, replaced:** a whole-map walking-distance map. It reached 0 % stuck, but it gave every ant knowledge of the map. That breaks this game's premise (§1: local information), so it is gone.
- **What an ant uses now:** only what it has:
  - its **home vector** (path integration: real ants count steps against a sky compass);
  - its **antennae**;
  - **touch**.
- **Wall-following by touch (the Bug2 rule):**
  - A blocked homing step starts wall-following. Two touch probes either side of the home vector pick the side to keep the wall on.
  - Following, the ant turns away from rock ahead and hugs round corners where the wall falls away.
  - It leaves the wall only when back on its **line home**: the line from where this trip first met rock to the nest. It must also be nearer home than where it met this wall, with the way home open by touch. Leaving anywhere nearer settled ants in the deepest bay facing the nest.
  - After 45 s it tries the other side once. After 120 s it gives up and wanders 8–24 s, then tries afresh. A bump during that wander only turns it: it doesn't make the wander longer, or start a new wall.
  - Touching no rock (ahead or on its wall side) for 1.5 s, it lets go of the wall and walks its home vector, keeping its line home. Alarm avoidance or a thin rock tip could throw it off the wall, and the corner hug then circled in the open until the 120 s give-up.
  - A trip home starts afresh, when the ant picks up food or its policy sends it home: no detour or wall left over from foraging. A leftover detour switched the home vector off, and each bump renewed it.
- **Hints and physics:**
  - The home trail is a hint, climbed at a quarter of the turn rate. At full rate, clusters circled on their own trail.
  - `squeezes()` stops ants slipping diagonally between two rocks.
- **Measured:** seeds 1–10 at 600 s with the UI defaults (600 + 600 ants), each colony's share of ants out more than 120 s.
  - Before (straight line): up to 100 %, and 18 of 20 colony-runs over 5 %.
  - With the map: 0 %.
  - Now: at most 7 % (seeds 2 and 10), with 16 of 20 runs at 5 % or below.
  - Most of those are slow, not trapped: within the next 30 s about 40 % reach home and more get closer. Truly stalled ants are at most ~3 % of a colony (`ja-ipu`).
  - Ticks are ~10 % slower (3.7 vs 3.3 ms mean), because wall-followers spread trails over more ground (59 vs 48 awake chunks).
  - After the review fixes (trips home start afresh, lost walls let go, no new wall on give-up), same seeds, seeding as the UI (`mulberry32(seed × 7919)`): mean 3.1 % → 1.9 %, 18 of 20 runs at 5 % or below (17 before), worst 6.9 % → 8.0 % (seed 6's rival; one end-of-game snapshot per run is noisy: variants of the lost-wall rule put the worst run anywhere from 8 to 14 % on a different seed each time). Food stored 3.7 % lower over the 20 runs.

**Measured** (`npm run colony-bench`: 1,200 + 1,200 ants, 60 sim-s, local rule, same container):

| Map | Before (dense) | After (chunked) |
|---|---|---|
| 160×100 | 3.58 ms median | 2.74 ms mean, 2.57 ms median |
| 512×320 | 12.12 ms median | **3.27 ms mean**, 2.96 ms median, 4.81 ms p90 |

The browser holds 60 fps at 512×320 in headless Chromium, with no console errors in light, dark or phone layouts. The renderer walks the map chunk by chunk, but still fits the whole map to the canvas; MR 6 adds the camera.

**Jev:** no change. Situations don't depend on the map: 1,296 possible, 248 met in a 4-minute `colony-cost` run (600 + 600 ants), at ~451 tokens per question. That run cost ≈ $0.009, ≈ $0.13/hour while retuning every 0.8 minutes, against the ≤ $0.25/h target. The request state is unchanged, so tokens/ant are unchanged.

## 13. Camera, minimap and following an ant (MR 6, 2026-11-01)

The 512×320 map is now something to move around in, not a picture squeezed into a box.

- **Camera** (`ui/camera.ts`, pure, tested).
  - The camera is a centre in cells and a zoom in device pixels per cell.
  - Zoom runs from "the whole map" to `MAX_ZOOM` (28 px a cell). The view never leaves the map; an axis the map doesn't fill stays centred.
  - `zoomAt` keeps the point under the cursor fixed, and `pan` moves the ground with the pointer. Tests pin both, plus the screen ↔ world inverses.
- **Input** (`ColonyField.tsx`).
  - **Pointer:** drag to pan (or right-drag, or space + drag while a brush is on), wheel to zoom about the pointer, two-finger pinch.
  - **Keyboard** (focus the field first): arrows or WASD to move, +/− to zoom, `0` for the whole map, `n` for your nest, Esc to stop following.
  - There are "Whole map" and "Your nest" buttons on the field.
  - Brushes paint in world coordinates, and widen when zoomed out (×1 at ≥ 6 px a cell, up to ×6), so a stroke stays a stroke on screen.
- **Rendering.**
  - Only the chunks in view are painted, each into its own 64×64 canvas and drawn onto whole pixels, so chunks meet without seams.
  - Only the ants in view are drawn. Cells past a ragged map edge are transparent.
- **Minimap.**
  - Zoomed in, a corner inset shows the whole map: ground, food, both colonies' ants, and the view's rectangle. It is redrawn twice a second.
  - Click or drag on it to jump.
- **Following an ant.**
  - Click an ant (yours or the rival's) to follow it: the camera tracks it, with a jade ring around it.
  - The card under the field shows:
    - its mode, whether it is carrying, and how long it has been out;
    - the situation it was in when it last chose (`Colony.lastQuestion`, decoded from the situation index);
    - who made the choice: **Jev's cached answer**, **the local rule while Jev is asked**, or **the local rule**. This comes from `ColonyJev.explain`, which neither counts a hit nor queues anything.
  - Panning, the minimap, `0`, `n` or Esc stops following, and so does the ant dying.
  - This is the Jev showcase at the scale of one ant.

**Checked in the browser:** fit, nest, wheel zoom, click-to-follow, drag-to-stop, minimap jump, painting while zoomed, and `0` for the whole map. A synthetic two-pointer pinch zooms about its midpoint. Light, dark and phone layouts show no console errors, and the page holds 60 fps.

**Review** (agent, before merge) found five bugs. All are fixed, each with a test or a browser check:
- **The followed ant could silently become a newborn.** A dead ant's slot is refilled at once, often within the same frame at 4× speed or under 30 fps. Ants now carry a per-slot generation (`Colony.gen`), and a follow is (side, slot, generation): `ui/follow.ts`.
- **Wheel or pinch at `MAX_ZOOM` slid the view toward the pointer.** `zoomBy` now cuts the factor to the zoom range before it works out the centre.
- **After a resize the view stopped fitting.** "Whole map" only stayed whole until the canvas changed size, so the minimap appeared uninvited. A fitted view now stays fitted.
- **Ctrl/Cmd shortcuts were swallowed** while the field had focus.
- **Space could stick "down"** after an alt-tab; it is now released on blur.

Also from the review:
- The tap slop is in CSS px (8 × DPR), so a finger tap still picks an ant.
- A drag catches up from where it began.
- Stopping a follow clears the ref at once, so a frame can't re-centre on the ant first.
- A carrier's stale question is cleared.
- Middle-drag no longer starts autoscroll.
- The follow state no longer pins the previous game in memory.

**Second review** (fresh agent, whole stack): no confirmed bugs.
- **Fixed from its suggestions:**
  - A third finger lifted during a pinch now keeps the pinch, instead of turning the other two into a double-speed pan.
  - Letter shortcuts work with Shift or Caps Lock.
  - With a brush on, the hint says how to pan and follow.
  - The field has `role="application"`, a fuller label and a visible focus ring.
  - A test pins that `explain` alone sends no request.
- **By design:** a pinch while following zooms about the followed ant.
- **Filed as beads:** keyboard access to following and to the minimap, the card's "by …" while paused, tap slop by net rather than total movement, and moving the gesture logic into a tested pure module.

**Jev:** no change. `explain` makes no calls, and the request state is unchanged.

## 14. Underground: the ants dig (MR 7, 2026-11-01)

The product owner asked for "seeds with less cavernous starts: they need to dig". They chose mostly soil with ants digging tunnels, and soil handled the way real ants handle it.

**What real ants do with soil** (looked up for this MR):
- Excavated soil is carried out as pellets and dumped round the entrance, which is how nest mounds form ([Tschinkel 2015, PMC4368782](https://pmc.ncbi.nlm.nih.gov/articles/PMC4368782)).
- Digging is self-limiting: the excavated volume follows colony size ([Rasse & Deneubourg 2001, doi 10.1023/A:1011163804217](https://doi.org/10.1023/A:1011163804217)).
- Pellets carry a building pheromone that draws more digging and deposition nearby, which concentrates excavation into a few tunnels ([Khuong et al. 2016, PMC4747701](https://pmc.ncbi.nlm.nih.gov/articles/PMC4747701)).
- Ants keep to walls (thigmotaxis), which is how they walk tunnels and find openings.

**Terrain** (`world.ts`). Each cell of the terrain layer is `OPEN`, `ROCK` or `SOIL`. Both solids block ants and scent; only soil digs.
- **Underground (the default):** ~12 % rock, ~69 % soil and ~19 % open ground in small chambers (a second hashed-noise lattice, ~10-cell blobs, position-pure like the height).
- Food is denser and nearer than on the surface (2.5 patches per chunk, ≥ 16 cells from a nest), because every way to it has to be dug.
- Placement plans through *diggable* ground (`reachable` / `escapes` with `through: "diggable"`), so every nest and food patch can be dug to and none is sealed behind rock. On foot, the nest's chamber reaches only a few hundred cells.
- **`OPEN_WORLD`** is the old surface map, and it generates cell for cell as before (checked on seven seeds). The UI has a **Ground: underground / open** toggle.

**Digging** (`colony.ts`). Digging is a mechanic, not a Jev choice, and it is triggered by touch:
- **Digging a face.** An explorer carrying nothing that meets a tunnel's end digs it for 1–2 s. A tunnel's end is a soil cell with at most 2 of its 8 neighbours open, or one with open ground straight beyond it, so tunnels break through into chambers.
  - The cell opens and the ant takes a **pellet**.
  - It goes home like a food carrier: never asked, and laying no trail.
  - At the nest it drops the pellet on the **mound** (`soilOut`, drawn as an earth ring growing with √pellets).
  - A dying carrier loses its pellet.
- **Tunnel shape:**
  - Side walls of tunnels and flat chamber walls are never dug as faces, so tunnels stay one cell wide and don't widen into caverns.
  - New tunnels start from chamber walls now and then (5 % of head-on contacts, 10 % per wall cell walked), never within two cells of another passage, so the ground isn't combed into parallel slots.
  - At a dead end, 15 % of digs go sideways: a fork.
- **Walking tunnels.** A cell is a tunnel when it is part of no 2×2 open square and touches soil. In a tunnel, ants move cell by cell, because steering by heading can't hold a one-cell passage:
  - explorers keep a **hand on the wall**, so they visit every branch in turn and dig at the ends they reach;
  - followers take the branch with the most food scent;
  - homing ants take the branch with the most **home scent** (laid by ants walking out; strongest near the nest).
  - An explorer that touches soil keeps its hand on the chamber wall for 8 s, which is how it finds tunnel mouths.
- **Homing round soil.** Wall-following round soil is also by cell: Bug2's leave rules at each cell's centre, handing over to home scent on entering a tunnel. Two more leave rules:
  - the nest in plain view within 8 cells;
  - back round an island to where it met it, with the way home open.
  
  Round rock in open ground it stays by touch, as before.
- **Two changes that also apply to the surface:**
  - A homing ant on a detour no longer has every bump extend it. In a tunnel it bumps constantly and never tried for home again.
  - A pellet carrier's trip starts with a clean slate.

**Measured** (seeds 1–5, 600 sim-s, 600 + 600 ants, local rule; per colony):

| | First food stored | Food home at 600 s | Cells dug | Ants out > 120 s (mean / worst) | Tick |
|---|---|---|---|---|---|
| Underground | 13–235 s, median ~18 s | 15–1,618, mean ~690 | 964–2,432 (84–99 % on the mound) | 8–23 % / up to 65 % | 3.0–3.3 ms* |
| Open, this MR | 7–13 s | 1,366–4,060, mean ~2,940 | 0 | 0.6–2.2 % / ≤ 10 % | 2.9–4.5 ms |
| Open, before (MR 6) | 7–12 s | 1,255–4,228, mean ~2,980 | 0 | 1.2–3.8 % / ≤ 14 % | 3.0–4.3 ms |

(*Five runs in parallel on four cores; the bench below is the fair timing. Underground rows are after the review fixes.)

- Digging makes the start slower and the economy about a quarter of the surface's at 10 minutes.
- The open map is unchanged within noise.
- Underground homing is the weak spot: carriers working round the dug-out areas near the nests stay out long (bead `ja-cwu`).
- How this was tuned: unrestricted digging carved one huge cavern per nest. Tunnel-end-only digging with random wandering made dense mazes and almost no food. Thigmotaxis plus scent at branches is what made tunnels reach food.
- **Known look:** tunnels run at right angles, because digging and tunnel walking follow the square grid's four directions. A follow-up MR looks at a meandering dig heading or a hex grid.

**Bench** (`npm run colony-bench`, 1,200 + 1,200 ants, 60 sim-s, back to back with MR 6 on a busy container): 512×320 open 3.94 ms mean (MR 6: 4.28 ms), underground **2.90 ms** mean. Underground is cheaper because scent only spreads along tunnels (5 awake chunks vs 45).

**Review** (agent, before the PR) found four bugs, all fixed with tests or the reviewer's repro scripts:
- **Homing ants circled four open cells for up to 120 s.** Following a soil wall started with a facing taken from the heading, not from the cell edge the step crossed. With the wall not at its hand, the ant turned hand-ward at every cell. Seeds 1 and 2 had 66 and 73 such ants at 180 s.
  - The facing now comes from the crossed edge (`crossedDir`), and `handOnWall` turns hand-ward only round a wall that is really there.
  - Fixing it showed a second loop: a wall-follower handed over to the tunnel walker inside a scentless stub off a chamber. It now hands over only where there is home scent.
  - The test rebuilds the review's 7×7 neighbourhood. It fails on the old code.
- **A digger froze for good** when another ant opened a cell beside its face (the face glanced, but `digT` was kept).
- **Stale target cells:** a newborn walked to its dead predecessor's tunnel cell, and a give-up walked back after its detour. Targets are now reset, and any target that isn't adjacent counts as stale.
- **An explorer with food in sight behind soil stood still** (only under policies that keep it exploring). It now keeps its hand on the wall.

Also from the review: the pellet colour no longer looks like the rival's ants, and there is a golden test that hashes `OPEN_WORLD` against MR 6's generator. After the fixes, the reviewer's stall scan finds no ant still for 30 s in 180 s of seed 1 (900 + 900 ants).

**Second review** (agent, after the PR was opened) found three more, all in underground homing, fixed with tests that fail on the old code:
- **A permanent freeze.** A wall-follower handed over to a tunnel with home scent turned to its home vector; with the nest straight through soil, the step was blocked, a new wall started (give-up clock at 0), and it was handed over again, every tick. The handover now goes straight to the tunnel walker.
- **Standing inside soil.** A step checked in float64 at 192.999996 was stored in float32 as 193.0, inside the soil cell, where every step is blocked. Steps are rounded to float32 before the check.
- **Rings of tunnels without end.** The tunnel walker follows the most home scent and never turned back, so a ring with strong scent held an ant for up to 542 s. A homing ant that gets no cell nearer home for 20 s picks branches by its home vector for 15 s, then by scent again.
- **Measured** (seeds 1–5, 600 s, 600 + 600 ants, underground, UI seeding): ants still (< 0.5 cell moved) for the last 30 s, away from the nest, 164 → 67 over the 10 colony-runs. The share out > 120 s is unchanged (16.5 % → 15.3 % mean): that is `ja-cwu`. Most of the remaining still ants shuttle between a dead-end stub and the tunnel beside it, where no tunnel leads toward home.

**Checked in the browser:** tunnels grow out of both nests, pellet crumbs ride on carriers, mounds grow, and the toggle switches maps. Light, dark and phone layouts show no console errors.

**Jev:** situations are unchanged (1,296). The legend now says explorers dig and that a soil carrier is never asked, and `COLONY_BRAIN_VERSION` is 3, so cached answers are re-asked once. The estimated request is ~235 tokens per situation (was ~225): about +10 tokens per question.

**Beads:** density-regulated digging (`ja-wii`), pellet scent and backfill (`ja-jmf`), underground homing (`ja-cwu`), soil on the endless map (`ja-r84`).

## 15. The player is the fungus: infection, spread and the spore brush (fungus 1a, 2026-11-01)

The design is in `docs/fungus-policy.md`. The player is the fungus and nothing else. It never decides for an ant: each colony keeps its own policy, doctrine, situations and cache. The fungus acts on ants (what they perceive, give off and can do), and their own policy still chooses. This first slice (bead `ja-t4d.1`) gets the fungus *into* ants and lets it move. Nothing an infected ant does is different yet; the perception layer (`ja-t4d.2`) is next.

- **Per-ant state** (`colony.ts`): `load` (0..1), `strain` (which trait set infected it), `resist` (immune priming, 0..1) and `expr` (the intervention the fungus runs in it; all dormant until the fungus policy, `ja-t4d.5`). A newborn is clean and unprimed.
- **Strains** (`fungus.ts`): two trait sets, from the two ends of the stealth-against-potency dial.
  - **Lockpick**, after *Rickia wasmannii*: transmission 0.15/s, never clears on its own, 10 % visible.
  - **Bloom**, after *Metarhizium*: transmission 0.6/s, clears 1 %/s, 80 % visible.
- **Contact transmission, across colonies.** A host gains load at the strain's rate × the load-weighted share of the ants around it (3×3 cells, every colony, not counting itself) that carry it. It is frequency-dependent, so a crowded nest is not an instant epidemic. A clean ant takes the strain of the most loaded cell around it; a host keeps its first strain.
- **Grooming and priming** (the colony's answer; Konrad et al. 2012). Up to 4 nestmates around a host groom off 0.12/s each of its *visible* load. Grooming visible nestmates leaves an ant resistant, and resistance scales down every load it takes. Bloom is groomed off and immunises the colony; Lockpick hides.
- **The spore brush** (a third free brush beside lure and alarm): spores on the open ground under the stroke, and a dose of the chosen strain into every ant there, *of either colony*. Ants walking onto spores pick up load and take some away; untouched spores fade (3 %/s).
- **Order-independent.** One step reads only grids built from everyone's load before it, each ant writes only its own load, and spores taken are pooled and taken after every ant has read its cell. A test swaps the colony order and gets the same loads (compare `ja-slv`, where the order of colony ticks decides contested food).
- **No spores, no change.** The fungus draws no random numbers and does nothing while idle; a test pins that a game with no spores runs tick for tick as before.

**Cost per tick.** The fungus steps every 0.1 s (a load moves at most ~6 % per step, the budget the pheromone channels use), and each ant's 3×3 reads take one chunk-array fetch per layer where the 3×3 lies inside one chunk (~94 % of cells), against the clipped slow path elsewhere; a test pins that the two agree across a chunk border. Measured with the new worst-case option of `npm run colony-bench` (Bloom painted over both nests, so every ant of both colonies is loaded; 1,200 + 1,200 ants, 60 sim-s):

| Map | No spores | Every ant loaded |
|---|---|---|
| 160×100 | 3.09 ms mean, 3.63 p90 | 3.76 ms mean, 5.00 p90 |
| 512×320 | 3.62 ms mean, 4.93 p90 | 4.27 ms mean, 6.10 p90 |

The first version stepped every tick and read each layer cell by cell: 7.15 ms mean at 512×320.

**Measured dynamics** (seeds 1–2, 300 + 300 ants, the nest painted at the start):
- Lockpick settles at a mean load of ~0.65 and the colony's resistance creeps to ~0.15 by 3 minutes.
- Bloom peaks, then is groomed down to ~0.2 while resistance climbs to ~0.33.
- On seed 2, Bloom crossed into the rival colony by contact: 11 rival ants infected at 30 s, all 345 by 3 minutes.

**Checked in the browser:** the spore brush and strain picker, the infection panel (infected share and mean resistance per colony, spore cells), spores drawn on the ground and infected ants marked in the new `--spore` tone. Light, dark and phone (390 px, no horizontal scroll) layouts, with no console errors.

**Jev:** no change. Nothing here enters an ant's request; tokens per ant are unchanged.

## 16. The perception layer: the fungus bends what a host senses (fungus 1b, 2026-11-01)

Bead `ja-t4d.2`; design in `docs/fungus-policy.md` §2. The fungus never decides for an ant. It bends the ant's **perceived state**, and the ant's own policy (the local rule, or Jev under its colony's doctrine) chooses from it, as it would for a healthy ant in the world the host perceives.

- **Perception arrays on `Colony`**: food, home and alarm gains; how strongly the ant smells the *other* colony's food trail as its own food scent; and its sense of time out (tired after patience × it). They default to the world as it is, and a newborn starts there.
- **Applied in `#sense`, so steering and the situation agree.** Both read the same three sensors, so an ant never decides by one world and walks in another. Only scent is bent: seen food, the nest and rock/edge (−1) read as they are. With neutral values the reads are exact (`x × 1`, and the rival's field is not read at all), so healthy colonies run bit for bit as before.
- **The rival's trails.** `Game` hands each colony the other's `Pheromones` (`Colony.foreign`, as it already hands over the enemy grid). Only a host whose perception reads it ever looks.
- **Interventions** (`fungus.ts`): a bundle of levers per intervention, lerped from "as it is" by the host's load. So far:
  - *dormant*: nothing.
  - *soothe*: alarm ×0.25.
  - *share*: food scent ×1.5, and the rival's food trail smelled as its own.
  - *roam*: home scent ×0.35, time out felt 2.5× slower.
  - Later slices add recognition, emission and body levers and the rest of the menu.
- **Until the fungus policy lands** (`ja-t4d.5`), a host runs its strain's default (Lockpick *soothe*, Bloom *share*). This is one method, `#expression`, which the policy replaces.
- **The follow card** says what the fungus runs in the followed ant and which senses it bends, e.g. "Bloom 76 % · runs share — it perceives food scent ×1.38, the rival's food trail as its own ×0.76". The situation chips above it are what the ant perceived.

**The test that matters:** an infected ant on a faint food trail it smells ×3, a strong home trail it smells ×0.1, and alarm it smells ×0 is asked the same `Situation`, the same cache key and a byte-identical Jev request as a healthy ant on a strong food trail and a faint home trail with no alarm. And it makes the same choice. Seven tests in all (`perception.test.ts`), 162 in the suite.

**What it does to a game** (seeds 1–3, 300 + 300 ants, the player's nest painted at the start, 3 sim-minutes; one run each, so read the direction, not the digits):

| Seed | Strain | Food home (you / rival) | Lost (you / rival) | Rival infected |
|---|---|---|---|---|
| 1 | none | 1,167 / 1,390 | 48 / 66 | — |
| 1 | Lockpick (soothe) | 1,259 / 1,448 | 50 / 41 | 0 % |
| 1 | Bloom (share) | 1,248 / 1,487 | **208 / 200** | 100 % |
| 2 | none | 1,633 / 924 | 255 / 201 | — |
| 2 | Lockpick | 1,420 / 929 | 186 / 164 | 1 % |
| 2 | Bloom | 1,286 / 899 | 203 / 183 | 100 % |
| 3 | none | 1,438 / 893 | 87 / 64 | — |
| 3 | Lockpick | 1,423 / 1,058 | 108 / 100 | 0 % |
| 3 | Bloom | 1,453 / 1,074 | 72 / 59 | 67 % |

*Share* walks hosts along the rival's trails into its ground. That carries the fungus into the rival colony, but contact without recognition is war: on seed 1, losses quadrupled. This is failure mode 1 in the design doc. Perception alone pulls colonies together; recognition (`ja-t4d.3`: pacify, blending odour) is what turns contact into collaboration, and it is next. *Soothe* stays inside its colony (Lockpick barely spreads by contact), and its effect on losses is mixed.

**Cost per tick** (`npm run colony-bench`, 1,200 + 1,200 ants, 60 sim-s, 512×320):
- No spores: 3.57 ms mean, with identical food stored (1,650 / 1,657).
- Every ant loaded: 4.57 ms mean (4.27 before), the difference being reads of the rival's field.

**Jev:** the request state and the situation are unchanged, so tokens per ant are unchanged. Bent perception could make a colony meet situations it otherwise rarely would; measured, it doesn't add any: 99–209 situations met per colony in the runs above, against 109–209 without spores. Lockpick on seed 1 met fewer (103), because soothed ants rarely perceive alarm.

## 17. Recognition: strangers by odour, and one colony at the end (fungus 1c, 2026-11-01)

Bead `ja-t4d.3`; design in `docs/fungus-policy.md` §4.B. Who is an enemy is no longer "an ant of another colony" but **an ant whose odour differs from mine by more than a tolerance**. Colony odour is a blend of cuticular hydrocarbons, and where it stops differing, aggression stops (Argentine-ant supercolonies). This gives the game its goal: **unify the colonies**.

- **Odour** (`recognition.ts`). Every ant carries an odour in 0..1 (the colonies start at 0 and 1). An ant smells of its nest: the nest's odour (the gestalt) drifts toward the mean odour of the ants at it, and newborns take it.
- **Strangers by odour band.** Ants are binned into 10 odour bands (one chunked float grid each, replacing the per-colony enemy grids). `look(odour, tolerance)` picks the bands that are strangers. Every query skips empty bands, and consecutive ants reuse the mask, so a game with two pure colonies reads one band. Strangerhood is judged by band centre (within 0.05).
- **Fights** (`battle.ts`): the strangers around an ant, judged at the healthy tolerance τ₀ = 0.35.
  - A **calming cue** counts on both sides: a calm neighbour is (1 − calm) of an enemy, and a calm ant takes (1 − calm) of the hazard. This is *Rickia*'s n‑C23, which lowers the aggression a host receives and gives.
  - A calmed encounter (under half an enemy) raises no alarm.
  - Allies are still the ant's own colony around it.
- **Perceived strangers** (`#enemyHeading`, the situation's `enemy`, and the charge) use the ant's own odour and **its own tolerance**, which the fungus can widen (B4). A calm ant does not charge.
- **The strategist**: strangers near the nest are judged against the nest's odour. A colony whose nest smells like ours is no rival, so the strategist forages instead of raiding kin. Found in the browser: after unification, raiders swarmed the other nest with nobody there to fight.
- **New levers and interventions** (`fungus.ts`):
  - *soothe* adds calm 0.8 and tolerance +0.3.
  - *blend* gives a host a **fungal share** of up to `MAX_MASK` = 0.6 of the fungus's own odour (0.5, between the colonies'), plus tolerance +0.15.
  - A third strain, **Garden**, runs *blend*. It is after the leafcutter's cultivar, whose odour becomes the colony's (*Acromyrmex*).
  - A host's odour is its nest's, that share of the way to 0.5, so it is never more than 0.3 from its nest's: **a host is never a stranger to its own colony** (tested).
- **Unity** (`Game.unity`):
  - the nests' odour gap;
  - fight deaths per minute (a 60 s fading count);
  - seconds since the last fight death;
  - mixing (the share of ants within tolerance of the other nest's odour);
  - a score: how far the nests have come together × how long it has been quiet.
- **Unified** is a new outcome, beside won and lost: the nests are within τ₀ and nobody has died fighting for 60 s.
- **The page**:
  - a unity meter in the Fungus panel;
  - the unified banner;
  - **ants coloured by odour**: ink for the player's colony, the warn tone for the rival's, mixed between. As the fungus works, both colonies visibly meet in the middle colour.
  - The follow card gives the ant's odour, its nest's, and the calm, tolerance and fungal share the fungus gives it.

**What was tried first and dropped.** Contact blending: a host relaxing toward the odour of the ants it touches, with a gestalt pull at the nest. Measured over 10 sim-minutes, it moved the nests' odours by less than 0.04. Contacts with strangers are brief fights, and the gestalt undoes them at home. Instrumenting the run also showed that the war is driven by the strategist's raids, which calm alone cannot stop. What unifies colonies is a **shared fungus with an odour of its own** carried home, which is the leafcutter's case.

**No fungus, no change.** With every ant at its colony's odour and nobody calm, the strangers around an ant are exactly the other colony's ants. A test runs six fights both ways (by colony, by odour) and gets the same deaths, ant for ant. The bench gets the same food stored as before 1c on both maps.

**Measured** (seeds 1–3, 300 + 300 ants, Garden painted on both nests at the start, 6 sim-minutes; one run each):

| Seed | | Unified at | Lost (you / rival) | Food home | Ant situations met |
|---|---|---|---|---|---|
| 1 | no fungus | — | 317 / 303 | 2,263 / 1,804 | 296 |
| 1 | Garden | 178 s | 11 / 21 | 2,135 / 2,163 | 163 |
| 2 | no fungus | — | 379 / 361 | 1,890 / 1,131 | 275 |
| 2 | Garden | 185 s | 31 / 40 | 1,868 / 1,310 | 178 |
| 3 | no fungus | — | 237 / 231 | 1,739 / 493 | 319 |
| 3 | Garden | 150 s | 8 / 11 | 2,315 / 1,076 | 122 |

- Garden in **one** colony moves that colony's nest halfway (to 0.5) and no further. Whether the colonies unify then depends on whether Garden crosses into the other colony by contact: over seeds 1–6 it does on most (corrected in review of #7; the first measurement, seed 2 alone, suggested it stays put). The test now checks only what holds on every seed: each nest stops at the fungal odour.
- Lockpick (soothe) alone calms but never unifies, because it does not touch odour.
- Checked in the browser (light and dark): Garden swept over the map at 4× speed reaches **unified** in about 45 s of real time; both stances return to forage, with 0 fighting and food coming home. No console errors.

**Cost per tick** (`npm run colony-bench`, 1,200 + 1,200 ants, 60 sim-s, 512×320): no spores 3.79 ms mean (3.56 before 1c), with the same food stored; every ant loaded 4.38 ms.

**Jev:** the situation and the request are unchanged, so tokens per ant are unchanged. Peace also makes Jev **cheaper**: a unifying game meets fewer situations (122–178 against 275–319), because war situations stop arising.

## 18. Emission: what a host gives off (fungus 1d, 2026-11-01)

Bead `ja-t4d.4`; design in `docs/fungus-policy.md` §4.C. The fungus changes what a host lays. The host's choices stay its own.

- **Deposit gain (C1):** trail laid × `Colony.layGain`, home and food alike.
- **Cross-laying (C2):** a carrier also lays `crossLay` of its food trail into the *other* colony's food field. It leaks where food is, and the rival's ants follow it like their own trail.
- **Silent fights (C3):** in a fight, a host lays (1 − `quiet`) of the alarm, so a skirmish need not recruit the colony.
- **In the menu** (§5.2):
  - *soothe* gains quiet 0.9;
  - *share* gains trail ×1.5 and a full leak of its food trail to the rival.
  - Each is lerped by load, like every lever.
- **As-is is exact:** a gain of 1 and no leak, so with no fungus the bench stores the same food as before (1,561 / 1,591 at 512×320) and the tick is unchanged (3.61 ms mean).
- **The follow card** names these too, e.g. "lays its trail ×1.50, leaks 100% of its food trail to the rival".

**Tests** (`emission.test.ts`, 5):
- a gain of 0 lays nothing and 2 lays exactly twice;
- a leaking carrier gives the rival as much food trail as its own, along its path;
- in a fixed skirmish with idle defending nestmates, a loud host lays alarm and recruits defenders, while a silent one lays none and recruits nobody;
- the fungus writes the levers and a cleared host is as it was;
- every lever stays in range.

**What it does to a game.** Before and after 1d, same seeds and same start (each strain painted on both nests, 300 + 300 ants, 6 sim-minutes):

| Strain | Seed | Lost before → after | Food home before → after | Situations met before → after |
|---|---|---|---|---|
| Lockpick (soothe) | 1 | 273/196 → **128/114** | 1,797/1,688 → 1,550/1,572 | 238 → 175 |
| | 2 | 315/215 → 350/281 | 1,896/1,297 → 1,949/1,311 | 256 → 320 |
| | 3 | 205/260 → 231/235 | 1,482/643 → 1,558/617 | 141 → 258 |
| Bloom (share) | 1 | 325/273 → 315/260 | 2,043/1,875 → 2,079/1,863 | 294 → 416 |
| | 2 | 414/373 → 398/312 | 1,814/1,145 → 2,025/1,207 | 287 → 281 |
| | 3 | 252/272 → 255/292 | 1,773/455 → 1,664/416 | 331 → 319 |
| Garden (blend) | 1–3 | unchanged (blend has no emission lever) | | |

The levers work as built, but none decides a war on its own:
- Quiet fights halved the deaths on seed 1 and did little on the others. A colony that is not recruited also does not defend.
- Leaking food trails moves food and contact around without settling who wins.

They are tools for the fungus policy (`ja-t4d.5`) to use where they help, not traits to run in every host of a strain. Garden's shared odour (§17) is still what unifies.

**Jev:** the request state and the situation are unchanged, so tokens per ant are unchanged. Quieter and leakier fronts make some games meet more situations (up to 141 → 258). At ~451 tokens per question that is ≈ 50k tokens, ≈ $0.002 per doctrine.

## 19. The fungus policy, and the player's levers on it (fungus 1e, 2026-11-01)

Bead `ja-t4d.5`; design in `docs/fungus-policy.md` §5. The fungus picks one intervention per host. It never picks what an ant does. The player never picks an intervention either: the player shapes the policy.

- **The fungal situation** (`fungalPolicy.ts`): what the fungus in one host senses.
  - its strain;
  - load (low, mid or high);
  - the host's activity (its mode; a carrier counts as returning);
  - **ground**: home, border or foreign, by whose home scent is where it stands;
  - **contact**: none, kin or strangers, from the recognition grid;
  - whether it is being **groomed** right now;
  - whether the colonies are **apart, close or one**. "One" is the game's own *unified*: within tolerance and a quiet minute.

  That is 648 situations per strain. All of it is local to the host except the last, the one fact the fungus knows about itself as a whole. Each host keeps the situation it was last chosen in (`Colony.fungal`), and the follow card shows it with who chose.
- **The gate** (`Fungus.choose`): whatever a policy answers, a host runs only what **its strain allows** and **the player's menu** has on. Otherwise it runs its strain's own default, else the first thing still on, else nothing (as-is; it hides only if dormant is on; §23).
  - Lockpick allows dormant, soothe and roam.
  - Bloom allows dormant, share, roam and cull.
  - Garden allows dormant, blend, soothe and share.
  - A test runs every strain × every menu × every answer: lethal needs both strain and menu.
- **New intervention: cull (lethal).** It is an odour weapon: the host's odour is pushed half the scale away from its nest's, so its own colony and the rival both take it for a stranger. Only Bloom allows it, and the menu starts with it off.
- **Dormant now means lying low:** a host the policy keeps dormant shows a quarter of its strain's visibility (`DORMANT_SHOW`), so its nestmates groom it far less. Hiding is a real move: Bloom hidden from its groomers keeps more load, and the colony primes less (tested).
- **The player's levers** (§5.1), in the Fungus panel:
  - the spore brush and strain (1a);
  - **the menu**: what the fungus may do, with lethal in red;
  - **the rule's settings**: *hide groomed hosts*, *cull high-load hosts fighting strangers*;
  - **the aim**: the fungus's goal in the player's words, with three presets (Unite, Spread, Peace), read by Jev and never by the ants.
- **The local rule** is free and the default: each strain's own default (Lockpick soothes, Bloom shares, Garden blends), except where the player's settings hide or cull.
- **The Jev lane** (`fungusBrain.ts`, a third lane in `ui/colonyJev.ts`):
  - one question per fungal situation, under the **aim** (not the doctrine);
  - a `choice` among only what that host may be given, so Jev's answer is always runnable;
  - cached per aim, with what each host was offered in its key (§23);
  - an answer outside the offer is not cached, and the local rule covers it.

  The ant lanes are untouched. A test checks that ant requests never carry the aim or a host, and fungus requests never carry an ant or the doctrine.

**What was tried and dropped: situational local rules.** Four rules were built and measured against each strain's default (Garden on both nests or one, Lockpick and Bloom on both, seeds 1–3, 6 sim-minutes):
1. Share routes and roam away from home, soothe strangers. Garden unified 30–50 s later with two to four times the deaths: sharing walked hosts into the rival's ground while they still smelled different.
2. Sequenced by how close the colonies are. Still later, because soothing a meeting takes a host off blend, so it brings less of the fungus's odour home.
3. Blend everywhere until close, then the rest. Later again: the close phase stalled short of one odour.
4. Blend until unified, then share and roam (shared work among kin). It unified exactly as always-blend did, by construction, but afterwards brought in 2–9 % *less* food.

None beat the default, so the default rule is the default.

Situational play is still what the per-host situation is for: the player's settings now, and Jev under an aim. Whether Jev finds placements that beat the defaults is the live measurement still to make.

**Cost:** about **323 input tokens per fungal situation** (estimated from request size, as for the ants' 225). A 6-minute game meets 172–297 fungal situations: ≈ 56–96k tokens, **≈ $0.002–0.004 per aim**. One used before is free. Ant requests and tokens per ant are unchanged.

**Tests** (17 new, 191 in all): situations encode and decode; the rule; the gate; what the fungus senses (ground, contact, groomed, the game's reading); dormant hiding; cull making a host a stranger to its own colony; the lane's request and reader; and the client's fungus lane against a scripted fetch (asked under the aim, cached, hosts switch to Jev's answers; a new aim or menu is a new cache; stopping hands back to the local rule).

**The suite's timeout.** `--test-timeout` also bounds each test file as a whole. `game.test.ts` takes ~17 s alone and passed 20 s under the suite's parallel load as whole-game tests were added. It is now 60 s (a hang guard sized for files of whole games). The 1c commit's per-test timeouts in `game.test.ts` could not help and were reverted. Three full runs since: 191/191, ~23 s.

**Checked in the browser** (light and dark): the policy block (menu, settings, aim) and the follow card, e.g. "the fungus senses: load high · host explore · ground home · contact none · unseen · colonies apart → blend, by the local rule". Phone width has no horizontal scroll, and there are no console errors.

**Still to measure live:** the fungus lane against `api.typesafe.ai`, for real tokens per fungal situation and whether Jev under an aim places interventions better than the strains' defaults. The cloud session has no key.

## 20. The fungus senses only what is local, and assumes no number of colonies (2026-11-01)

From review of §19. The fungal situation had one map-wide field, `colonies` (apart / close / one: the gap between *the two* nests' odours). It broke two things:
- the game's premise of local information, which the stack had just enforced for homing;
- any game with more than two colonies.

The local rule had stopped using it (§19), so only Jev ever saw it.

- **Removed.** In its place `contact` gains a value, **allied**: the host is touching another colony's ants that it tolerates (within the healthy tolerance, by odour). That is unification as it is felt where it happens. Contact is now none / kin / allied / strangers, in that order of precedence from the bottom: strangers over allied over kin.
- **288 fungal situations per strain** (was 648). The Jev lane's version is bumped (`FUNGUS_BRAIN_VERSION` 2), because old cached answers were keyed on the removed field. The legend no longer says "two".
- **A test pins locality:** moving the nests' odours (a map-wide fact) leaves what the fungus senses unchanged.
- **No change in play.** Garden on both nests (seeds 1–3, 300 + 300) unifies at 178 / 185 / 150 s with the same deaths as before, because the local rule never read the field.
- **Cheaper.** About 314 tokens per fungal situation. A 6-minute Garden game meets 154–190 (was 221–297), and three strains together 192–260: **≈ $0.002–0.0034 per aim**.

What still assumes two colonies (odour on a line, the unity meter, `foreign` and `raidTarget`, the won/lost banner) and how it should stop is in `docs/fungus-policy.md` §10, filed onto MR 8 (`ja-8fd`):
- odour on a disc with the fungus's odour at its centre;
- unity as a graph of alliances, where a supercolony is an alliance id;
- species as a host range per strain, plus an odour dimension the fungus cannot erase, so that between species the goal is parabiosis, not a merge.

## 21. No colony is the player's (ja-t4d.6, 2026-11-01)

The player is the fungus (§15). The page and the Jev client still framed the first colony as the player's: "you" against "rival", a won/lost banner, Jev steering only the first colony while the second always ran the local rule, and the doctrine as the player's words for "your" ants.

- **Names by colour.** The colonies are **Ink** and **Amber** (`ui/names.ts`), after how they are drawn, in the panel's tables, the follow card, the banner and the nest buttons ("Ink nest", "Amber nest"; `n` cycles the nests). `Game.player` / `Game.rival` and the follow type's `"you" | "rival"` stay as identifiers for the first and second colony, documented as such: the stack's tests and scripts use them.
- **The outcome is the fungus's.** **unified** (one colony) is its win. **fallen** (either colony gone: hosts lost, and no one left to unite them with) is its loss. Won/lost are gone. `Game.fallen()` names the colony; the stack's outcome test is updated to say so.
- **Every colony on equal footing.**
  - Each colony has a doctrine, now its *nature*: a scenario setting in a new Colonies section, not the player's lever. The player's lever is the fungus's aim.
  - With Jev on, the client drives **every** colony's ants and strategist under that colony's own doctrine, plus the fungus under the aim (`ColonyJev.attachColonies`, `setDoctrineFor`).
  - Caches and in-flight questions are kept by context, across colonies: situations depend on neither the colony nor the map. So two colonies with the same doctrine share every answer, and a question in flight for one is not asked again for the other (tested).
  - Both colonies start foraging: one doctrine, no extra spend. A second doctrine costs one more doctrine's situations (§11: ~$0.005–0.01).
- **Fixed on the way:** the follow card's `explain` checked in-flight questions by the bare key, though they are stored by context and key. So an ant whose question was in flight read "by the local rule" instead of "waiting". It now reads "waiting" (tested).
- **The summary line** (food home, ants by mode, mode choices, situations seen) is the whole map's, summed over every colony.

**Checked in the browser** (light and dark): no "your colony" anywhere; Ink and Amber in every table; per-colony doctrines; following an Amber ant ("Ant #71 · the Amber colony"); the nest buttons. Phone width has no horizontal scroll, and there are no console errors.

**Jev:** tokens per ant are unchanged. The second colony now asks Jev too: with the same doctrine it adds nothing (shared cache); with its own, one more doctrine's situations.

## 22. After the underground world (#8): what still holds (2026-11-01)

§15–21 were measured on the open surface, before #8 made worlds start mostly in soil. Merged onto `main` and re-measured: Garden painted on both nests, seeds 1–3, 300 + 300 ants, 10 sim-minutes.

| World | Seed | No fungus: lost | Garden: unified at | Garden: lost | Infected |
|---|---|---|---|---|---|
| open | 1 | 492 / 501 | 195 s | 15 / 14 | 100 / 100 % |
| open | 2 | 506 / 499 | 159 s | 37 / 31 | 100 / 100 % |
| open | 3 | 374 / 379 | 171 s | 8 / 9 | 100 / 100 % |
| underground | 1 | 0 / 0 | 104 s | 0 / 0 | 100 / 94 % |
| underground | 2 | 0 / 0 | 107 s | 0 / 0 | 100 / 100 % |
| underground | 3 | 0 / 0 | 107 s | 0 / 0 | 100 / 77 % |

*Since §53 (ja-i0f): "unified" also needs the colonies to have met; the underground rows above were the bug.*

- **On the open surface the result holds.** Garden unifies the colonies in about 3 minutes, and fight deaths fall from 374–506 per colony to 8–37.
- **Underground, unity is vacuous for now.** In 10 minutes the two colonies never meet (no deaths even without the fungus). Garden still reaches "unified" at ~105 s, because the nests' odours converge and the minute is "quiet" with nobody in contact. Unity ("smell alike, nobody has died fighting for a minute") does not ask that the colonies have met. Filed: unified should also need allied contact, ants of both colonies meeting within tolerance (`ja-i0f`).
- **Every test passes on the new default world.** One test was fragile and is fixed: `perception.test.ts`, where a healthy ant given 8 s on a 40-wide map reached the edge, bounced at random and (with #8's movement) stumbled onto the food. It now runs 4 s, the time the infected ant needs and before the healthy one can reach the edge.

## 23. Agent review of the fungus policy (PR #7, 2026-11-01)

An agent reviewed 1e, local sensing, the multi-colony client and the reframe, and confirmed 8 bugs, each with a repro. All are fixed and each has a test that fails without its fix. Results at the default settings are unchanged: the bench's stored food, digging and infection with Garden painted are identical before and after, so §22 stands.

1. **"Hide groomed hosts" flipped hosts every step.** `groomed` was judged at what the host showed now, so a host that hid read as ungroomed the next step, woke, showed, and hid again: about 70 % of host-steps flipped. Groomed now means enough nestmates are around to groom it, judged at the strain's visibility; hiding shows them less but does not send them away. Now ~6.5 % of host-steps change, as hosts walk in and out of their groomers.
2. **A strain with nothing on the menu asked Jev an empty choice forever**, billed each time and never cached. A host is asked only when it has a real choice (two or more things on offer), and the server now rejects a `choice` with no options.
3. **A menu change while a question was in flight threw away the paid answer.** What a host was offered is now in its question's key, so an answer is packed, read and kept against what it was offered.
4. **The gate fell back to dormant (and hid) with dormant switched off.** It now falls back to the strain's default, else the first thing still on, else nothing; a host hides only if dormant is on.
5. **Cull did nothing between loads 0.7 and 0.8**, though the rule culls from 0.7: a half-pushed odour was still within tolerance of its nest's. Cull now takes full effect from a high load (`HIGH_LOAD`).
6. **A soothed stranger was sensed as "allied".** Contact counted strangers weighted by calm, as fights do. The fungus now counts them by odour alone; fights still weight by calm.
7. **After a 409, Start re-asked questions still in flight.** A 409 now cancels what is in flight, as Stop does, and an old run's reply no longer clears the new run's in-flight set.
8. **Toggling an intervention dropped every strain's cached answers**, because the menu was in the context. The context is now the aim, the legend and the wording (including the interventions' blurbs, which it missed). The key holds what that strain was offered, so switching cull, Bloom's alone, keeps Garden's and Lockpick's answers.

`FUNGUS_BRAIN_VERSION` is 3: the legend now explains groomed and calmed strangers, and keys and contexts changed. Answers cached under v2 are not reused. The longer legend moves the estimate from ≈ 314 to ≈ 315 tokens per fungal situation; ant requests and tokens per ant are untouched.

Unconfirmed points the review raised, filed rather than fixed: lane starvation (the fungus lane is filled last each cycle); a 429 re-queue lost after a doctrine switch; colony k without its own doctrine following colony 0's only at the next game; `Fungus.configure` alone not telling Jev the menu; cull's push depending on which side of 0.5 the nest's odour has drifted to.

*§24–28 were §15–19 on the side-view stack (MR 8–15 and the nest design); they were renumbered when `main` (the fungus, §15–23) was merged in (on #17, and in nest slice 0, ja-6nm).*

## 24. Hexagons, and tunnels that meander (MR 8, 2026-11-01)

The product owner asked why the tunnels are all right angles. On the square grid, digging went through cell edges only, ants in tunnels walked four ways, and dead ends forked at 90°. The owner chose a **hex grid plus a meander**, with **true hexagons drawn up close**.

**The grid** (`hex.ts`, after Red Blob Games' hex guide).
- **Layout:** pointy-top hexagons in odd-r offset rows. A cell is still (column, row) in the 64×64 chunks. 64 is even, so a row's parity is the same in a chunk as on the map, and `chunks.ts` is unchanged.
- **World units:** neighbouring centres are 1 apart and rows R = √3/2 apart. Speeds, sensor distance and radii keep their meaning.
- **Lookups:** `cellOf` uses cube rounding into a shared scratch, so it allocates nothing. It costs about the same as a floor (36 vs 34 ns).
- **Map size:** 512 × 368 cells, which keeps the old aspect (about 512 × 319 world units).
- **What hexes buy:** all six neighbours share an edge. `squeezes()` (the diagonal-corner rule) is gone, and so are the edge/corner cases in digging and wall-following.
- **Terrain** is sampled at hexagon centres. Rock and soil cuts are calibrated as before.
- **`OPEN_WORLD`** keeps its make-up (~22 % rock), but it is a new map: the "cell for cell as MR 6" property can't survive a change of grid. The golden test now pins the hex generator.

**Scent** spreads toward the mean of the six neighbours.
- On unit spacing the hex mean less the centre is ≈ ¼∇², the same as the square grid's four-neighbour mean, so the parameters mean the same; scent just spreads round instead of in diamonds.
- With odd rows shifted right, a chunk's top-left corner also touches the chunk diagonally up-left, and its bottom-right corner the chunk diagonally down-right. Those two corners wake the diagonal chunks.
- The sparse step still matches a dense hex reference within 1e-4: across borders, both diagonal corners and the ragged edge.

**Tunnel rules on six neighbours:**
- **A tunnel cell** has no two neighbours next to each other both open (an open triangle is the hex grid's 2×2).
- **A tunnel's end** is a soil cell with one open neighbour. Tunnels lengthen and fork, turning at most 60° a cell, and stay one cell wide.
- **A new tunnel** from a chamber wall needs no open ground within two steps, except on the chamber's side. The chamber's side is judged from the face's own open neighbours.
- **Hand on the wall** goes round six ways, hand side first.

**The meander.** A tunnel's direction belongs to the tunnel, not the digger.
- Each dug cell stores the heading it was dug at (`map.digHeading`, 255 steps round the circle).
- The next digger at the end reads it, adds a small drift (σ 0.2 rad a cell), and digs one of the two ways either side of it, in proportion to how near each is (`chooseDig`). So a tunnel runs at its heading on average, at any angle.
- Forks are Ys: one arm 60° to one side now, the other 60° to the other side, dug by the next digger to pass the fork (`markFork` / `takeFork`). A fork with one arm 60° off and the other straight on can't happen on hexes: the cell straight on touches the 60° arm, so it is no longer a tunnel's end and is never dug (review of #9: 2 junctions in the meander field, against #8's 21; with Ys, 27). New tunnels start along the face.
- The review caught that the heading was dropped on the ant's last step to the face, so the drift never added up along a tunnel; the test passed on noise. Fixed. The test now needs more than 20 % of runs to sit 20°+ off every way. Fresh noise per cell gives about 8 %, and it measured 9 % before the fix.

**Drawing** (`ColonyField.tsx`).
- **Zoomed out:** each chunk's 64×64 colour buffer is drawn as 64 row strips, odd rows shifted half a cell. These bricks have the same six neighbours and cost a few draw calls.
- **From 12 CSS px per cell:** the cells in view are drawn as true hexagons, composited over the paper and batched into one path per colour, with soil (or paper, on the surface) as background.
- At 8 CSS px per cell the hexagon pass ran at 11–15 fps in headless Chromium (software canvas). At 12 px everything holds about 60 fps: fit 53–58, nest view (bricks) 61, close (hexagons) 60, phone 58. No console errors in light, dark or phone layouts.
- The minimap samples one cell per pixel. Dark-mode soil is a shade lighter so tunnels read.

**Measured** (seeds 1–5, 600 sim-s, 600 + 600 ants, local rule, per colony; five runs in parallel):

| | First food stored | Food home at 600 s | Cells dug | Out > 120 s, mean / worst |
|---|---|---|---|---|
| Underground, hexes | 9–272 s (median ~36 s) | 22–1,389, mean ~670 | 1,802–3,792 | 20–27 % / ≤ 44 % |
| Underground, MR 7 | 13–235 s (median ~18 s) | 15–1,618, mean ~690 | 964–2,432 | 8–23 % / ≤ 65 % |
| Open, hexes | 7–12 s | 1,793–5,044, mean ~3,600 | 0 | 0.5–2.5 % / ≤ 16 % |
| Open, MR 7 | 7–13 s | 1,366–4,060, mean ~2,940 | 0 | 0.6–2.2 % / ≤ 10 % |

- **Same economy underground** (about 680 food home per colony), with more digging.
- **Slower starts on some seeds:** on seeds 1 and 2 the player's colony took 3–4 minutes.
- **More ants out long:** the ground round each nest gets hollowed into a large cavern with specks of soil left. Carriers spend long stretches following walls round them, and a homing ant takes the home-scent branch choice only in strict one-cell tunnels.
- **Tried, no clear gain** (bead `ja-dy9`):
  - scent walking in any dug cell beside soil: seed 1 better, seed 2 worse;
  - fewer tunnel starts from chamber walls: digging unchanged.
  
  Filed as a bead.
- The open map holds more food (the map is 15 % taller in rows, with more chunks of patches).

**Bench** (`npm run colony-bench`, 1,200 + 1,200 ants, 60 sim-s, run back to back with MR 7 twice):

| | MR 7 | Hexes |
|---|---|---|
| Underground, mean tick | 2.99–3.09 ms | 3.68–3.81 ms (+23 %) |
| Open, mean tick | 3.88–3.95 ms | 5.11–5.31 ms (+33 %) |

- The cost is spread out: the six-neighbour scent stencil, hex windows for fights and enemies, and tunnel checks.
- Caching each ant's cell by position, and skipping tunnel checks on a map without soil, took off about a fifth.
- The open run also has more ants alive and more chunks awake (54 vs 45), so it isn't quite like for like.
- This misses the plan's 15 % target, but it is well inside a frame at normal speed. Bead `ja-9uy`.

**Jev:** situations, legend and request are unchanged. The tokens per question and per ant are unchanged.

**Merged with `main` (#7 fungus, #13), 2026-11-02.** The fungus came in on square cells and now runs on hexes:
- **Windows are hex discs.** Fights, recognition (`Recognition.around`), the fungus's contact and grooming (`#gather`), and the nearest-enemy search read the cell and its six neighbours (7 cells, where the square read 9). `enemiesNearNest` counts strangers in a world-unit disc. So contact and fight counts per encounter are a little lower than on the square grid.
- **Ant cells come from `antCell`** (the hex cell, cached), not `floor(x)`, everywhere the fungus and recognition place ants. The spore brush paints a hex disc (`disc`, now exported from `world.ts`).
- **The nearest enemy is the nearest by distance**, not the first in ring order (review of #9: within ring 2 it could pick a cell 2 away over one √3 away, leaning north-west).
- **Tunnel headings are kept in 252 steps,** not 255: a multiple of 6, so a fork's ±60° and 120° land exactly. With 255 every fork was half a step off the same way, and it added up (worst 2.1° in the meander test).
- **`handOnWall`'s `lost` tests only the back-hand cell** (review of #9). A follower with a speck at its front hand only turned 120° into the open back-hand cell, put the speck on its other hand and walked off; it now passes the speck and turns round it at the next cell. A homing test across a speckled cavern went from a median 164 s home (57 of 200 never home in 300 s) to 12 s (1 of 200).
- **Second review (of the merge):**
  - **No square-grid assumption left in the sim.**
  - **A fork's second arm** is taken two ways round from the way actually dug, not from the aim. From the aim, a dithered dig put the two arms side by side about 1 fork in 8, and the second could never be dug. The meander field now has 38 junctions.
  - **Fork entries** whose cell later widens into a chamber are never read again: about 4 % of dug cells, at most one per cell, for one game. Bounded, left.
  - **The fungus is calibrated for 7-cell windows,** against 9 on the square grid. The enemy disc is 19 cells, not 25, and the nest watch is a disc, not a square. Ratios (fights, contact load) are unchanged, but count-gated terms (grooming mates, kin and allied contact) fire a little less, so §15–23's fungus numbers may be a little off on hexes.
  - **`colony-cost` painted alarm by row count** as if rows were 1 apart, so about 12 % of blots fell off the map. It now uses `worldExtent`.
- **Tests:** `main`'s homing tests from the review of #8 (ring of tunnels, tunnel handover) are ported to hex maps; its square-only corner-slip test is dropped (hexes have no corners to slip through), and its float32 test becomes an invariant in the underground game: no ant-tick is ever inside a solid cell. The fungus, recognition, emission and perception tests place ants at hex cell centres. New: a speck at the front hand (`handOnWall`), and at least 12 junctions in the meander field.

## 25. Getting home through dug ground (MR 9, 2026-11-01)

MR 8 (hexagons) kept the underground economy but more ants stayed out long: 20–27 % out over 120 s (MR 7: 8–23 %). The reviewer's stall scan (900 + 900 ants, seed 1, 180 s) found 151 ants that hadn't moved 2 cells in over 30 s. Traces found three faults in wall-following round soil:

1. **Spinning round three cells** (151 → 22 → 0 stalled ants):
   - The hand-on-wall rule took a sharp 120° turn toward the hand first.
   - On hexes that turn always leads into a cell touching the one the ant came from. Three open cells meeting at a corner, each with soil beyond, made it go round and round.
   - It now comes last, before only going back. One-cell tunnels never need it, because the tunnel rules forbid such triangles.
2. **A line home anchored too far back:**
   - Bug2's line home ran from the trip's *first* wall.
   - In dug ground the ant meets speck after speck of soil, and heading home from wherever it left the last one it is rarely back on that line, so it circled a speck until it gave up.
   - Soil walls now re-anchor the line at every wall. Rock walls on the open surface keep the old rule, so the open map is unchanged (identical numbers).
3. **Leaving a speck, without livelock:**
   - A soil wall is now also left where the way home is open for two cells: after 1 s if half a cell nearer home than the nearest it has been on this trip, or after 3 s wherever, but only three times a trip without progress. A hand on the wall in a cavern drifts from speck to speck farther from home, so a distance rule alone never fired.
   - **Progress is kept for the whole trip.** The distance to beat is the trip's best, lowered at every release and kept across walls. Handing over to home scent in a tunnel counts as a release too.
   - Coming back to the first cell of a soil wall means the ant has been all the way round. It leaves if the way home is open; otherwise it gives up on that wall now (wanders 8–24 s, then tries afresh) instead of after 120 s.
   - **Caught by the review, before the PR:** re-anchoring reset progress. Carriers left a wall, bumped the same spot and re-anchored, cycling over ~3 cells every 1–2 s; the stall scan (within 2 cells) missed them. In closed caverns with a far exit, 12 of 12 were stuck for 300 s.
   - Now:
     - "homing over 60 s with more than 15 releases and no wandering" counts 0, 0, 1 and 2 on seeds 1–4 (was 20, 4, 75, 12);
     - closed caverns all get home (26–28 s mean; #8 took about 15 s, so this is slower than before the livelock it fixes: bead `ja-cav`);
     - the stall scan finds nothing still over 8 s.

**Digging is social.** Rasse & Deneubourg (2001): workers dig more where nestmates crowd, so digging falls off as the nest grows roomy and they spread out.
- At a tunnel's end, an ant digs with chance 0.1 + (nestmates within two cells) / 6, capped at 1 (`digChance`).
- The game keeps each colony's own ant counts per cell underground (it already counted them for fights).
- This stays within the senses: the ant feels the ants round it.

**What didn't work, and why it isn't here:**
- **Counting open ground round a face before digging:** stopped tunnels short of food pockets and chambers, and foraging collapsed (≈ 70 food home).
- **Facing home at every bump:** touch probes 1 and 1.5 cells out step over thin walls, so ants bumped in a loop (50–70 % out long).
- **A colony-wide digging budget:** worked, but it isn't something an ant can sense; the nestmate rule does as well.

**Measured** (seeds 1–5, 600 sim-s, 600 + 600 ants, per colony):

| Underground | Out > 120 s, mean | Worst | Food home, mean | First food, median | Cells dug |
|---|---|---|---|---|---|
| MR 9 | **2.5–12.5 %** (mean ~5 %) | ≤ 28 % | **~1,060** | ~30 s | 1.7–5.0k |
| MR 8 (hexes) | 20–27 % | ≤ 44 % | ~670 | ~36 s | 1.8–3.8k |
| MR 7 (squares) | 8–23 % | ≤ 65 % | ~690 | ~18 s | 1.0–2.4k |

- **Stall scan:** 0 ants still for 30 s (MR 8: 151). The longest still is 8 s. The scan flags only ants within 2 cells, so the review added a check on homing trips: median 4.8–6.4 s, p95 22–73 s over seeds 1–4 (MR 8: p95 112–144 s).
- **Speckled cavern test:** ten carriers cross a 41-unit cavern dotted with two-cell specks in 5.6–8.4 s; it's under 6 s in a straight line. On MR 8's code 7 of 10 circled one speck for the whole 40 s.
- **Open map:** identical to MR 8.
- **Not met:**
  - Cells dug did not drop. The nestmate rule shifts where ants dig more than how much; it gates digging on at a tunnel's end, but not new tunnels from chamber walls (bead `ja-wii`).
  - The first-food median is ~30 s, against a ~25 s target. Seeds 1 and 2 put the player's food far from its nest (173 s there); the rival on the same maps is under 30 s.
- **Bench:** no change (3.7 ms underground, 5.4 ms open, back to back with MR 8). The browser holds ~60 fps at every zoom, with no console errors in light, dark or phone layouts.

**Jev:** situations, legend and request are unchanged. Tokens are unchanged.

**Review of #10, fixed on merging #9 (2026-11-02):**
- **Every wall underground is followed cell by cell,** rock as well as soil (`cellWall = map.hasSoil || soil`). A rock speck in dug ground was followed by touch, out of reach of every release the cell-by-cell follower has (re-anchoring, `nearer`, `anywhere`, the give-up on coming back round, `sight`), so carriers circled it until the 120 s give-up: on seed 2 about 85 of one colony's carriers round one speck at once. The speckled-cavern test now runs with soil, rock-and-soil and rock specks; the rock variants fail without this. Whole games underground (600 + 600 ants, 600 s, seeds 1–5; food home per colony, and the share of ants homing for over 120 s, sampled every 5 s after the first 2 minutes):

  | Seed | Without | With | Homing > 120 s, without → with |
  |---|---|---|---|
  | 1 | 451 / 1,311 | 241 / 1,330 | 1.3 → 0.6 % |
  | 2 | 1,001 / 1,274 | 769 / 1,387 | 2.2 → 0.5 % |
  | 3 | 1,203 / 718 | 1,228 / 756 | 3.5 → 0.5 % |
  | 4 | 134 / 935 | 1,234 / 966 | 17.5 → 0.7 % |
  | 5 | 1,676 / 845 | 1,418 / 1,296 | 1.6 → 0.4 % |
  | All | 9,548 | 10,625 (+11 %) | |

  Single games are noisy (seeds 1 and 2 bring home less), but every seed has fewer ants out long, and seed 4's first colony, stuck round rock without it, brings home nine times the food.
- **An island release counts against `NO_GAIN`** like `anywhere`: leave, meet the same spot, go round and leave had no bound. Progress is named (`GAIN`, 0.5).
- **The wall's cell is the landing cell** the step was judged on (float32), not the float64 step.
- **The "no corner spins" reorder of `handOnWall`** is the same rule as #9's review fix (`lost` tests only the back-hand cell): checked over all 1,536 neighbour, direction, side and parity cases. It also changes how explorers walk tunnels and hug chamber walls.
- **A tunnel that its home scent leads into is walked** (`#walkTunnel`), not turned from toward the home vector: from a tunnel that can point into soil, and the blocked step started a new wall every tick (the review of #8's freeze, kept through the merge).
- **The meander test's drift bound is back to 2°** (headings in 252 steps, from #9).
- **Not fixed: closed caverns** (`ja-cav`): 18–29 s, mean 26 s over 16 seeds, against #8's 12–18 s. Longer look-ahead for the `anywhere` release and `NO_GAIN` 1–2 didn't change it much (`NO_GAIN` 1: mean 19 s but one seed 52 s).

## 26. Where the dug soil goes (MR 10–11, 2026-11-01)

The product owner asked whether the earth ring was grounded, adding that "the soil has to actually go somewhere".

**What the research says:**
- **Florida harvester ants** (Tschinkel, Rink & Kwapich 2015, coloured sand): about **2.5 %** of excavated sand is redeposited below ground, mostly near the surface. The rest is carried up to a surface spoil disc, whose area tracks the nest's volume and depth (Tschinkel 2015, [PMC4368782](https://pmc.ncbi.nlm.nih.gov/articles/PMC4368782)). Sand moves up in stages, and some is worked into walls and floors.
- **Leaf-cutting ants** (*Atta vollenweideri*; Pielström & Roces) put **most** excavated soil back inside the nest. Workers refill unused space with pellets, opportunistically.
- **Swell** (earthwork references, e.g. Caterpillar's swell and load factors): dug soil takes more room loose than in place: sand 10–15 %, loam 20–30 %, clay 30–40 %.

**MR 10: the mound holds the soil.** The old ring grew with √pellets: 2,000 dug cells drew a ring about 9 cells wide, holding a fraction of them. Now:
- The mound's area is every pellet brought out × `SWELL` (1.2: the sim's soil is unspecified, so loam-like) × a hex cell's area (√3/2). It is a ring round the entrance: radius √(nest r² + area/π), from `moundRadius`.
- It is drawn as a faint fill with an outline, since it sits on the surface above this slice; the tunnels under it still show.
- The stats show "dug / mound" per colony, so the bookkeeping is visible.
- At 4× speed after 40 s, about 2,300 cells dug make a mound about 29 units across from the nest. It looks big because that is how much soil there is.
- No simulation numbers change.

**MR 11: backfilling unused dead ends** (bead `ja-jmf`).
- **The rule:** a pellet carrier at least 3 s into its trip home drops its pellet into a neighbouring dead end that nobody uses, filling it back with soil, and then goes back out. This is opportunistic refilling of unused space, as in *Atta*.
- **What counts as unused, by the ant's senses:**
  - no food in it;
  - no food or home scent (outbound ants lay home scent, so a tunnel being worked carries it);
  - no ant of either colony in it;
  - not within the nest's radius + 2.
- **A dead end** is a cell whose one or two open neighbours lie next to each other (`stub`), so filling it can't cut a passage. On offset rows, a one-cell stub off a straight tunnel touches two cells of it.
- **Bookkeeping:** cells dug = mound + filled + carried + lost with ants that died carrying. Tested over a two-minute underground game.
- **What measuring showed:**
  - Without the 3 s wait, carriers refilled the cell they had just dug, on their first step home. Ants dug and filled in a loop, half of all dug soil "went back" (53 %), and the economy fell (≈ 940 food home, one seed with 29 % of ants out long).
  - With the wait, genuinely unused dead ends are rare, because ants walk their tunnels and home scent spreads into stubs. Backfill is **0.6 %** of dug soil, close to the Florida harvester ant's 2.5 % (Tschinkel, Rink & Kwapich 2015) and far from *Atta*'s majority.
  - Seeds 1–5, 600 s: food home ~1,120 per colony (MR 10: ~1,060); ants out over 120 s 1.5–13.6 % (2.5–12.5 %); first-food median ~28 s. The open map is unchanged, number for number.
  - The stall scan finds nothing still over 11 s. The livelock counter (homing over 60 s with more than 15 wall leaves) reads 9, 0, 0, 0 on seeds 1–4; every flagged ant got home within 140 s, so these are slow trips, not livelocks. The counter swings by seed: 2 instead of 9 on seed 1 from a change that only acts at fills.
  - Bench: 3.81 ms underground vs 3.67 ms for MR 10, run back to back. The open map, which never backfills, moved by the same 4 %, so it is noise.
- **Review fixes:**
  - **Burial.** The occupancy grids are a tick old, so a nestmate that stepped into a stub earlier in the same tick, or a rival that already moved, could be walled in. It then couldn't step anywhere: 7 such ants on seeds 3–6, one stuck 25 s. Now the filler checks its own colony's ants in the cell itself, and a step that stays inside the ant's own cell always moves, so an ant in a cell filled round it walks out. The burial scan finds none on seeds 3–6.
  - **Turning round** after a fill never happened: the tick wrote its own heading back over it, and the carrier walked on to the nest. It now turns in the tick's heading.
  - **A follower or homing ant whose next cell is filled** steered into it for good. A target that is no longer open is now decided afresh, except an explorer's face to dig.
  - **Kept as it was:** the trip clock still restarts after a fill. Letting it run on, so the ant lays faint home scent from deep tunnels rather than a fresh peak, was measured worse: such ants soon tire and walk home empty, and seeds 3, 4 and 6–8 brought 12 % less food home.
- **Not done here:** an *Atta*-like colony needs a looser sense of "unused". That is MR 12, below.

**MR 12: leaf-cutter backfill** (bead `ja-jmf`, closed).
- **Why:** the owner wanted most of the soil to go back. In *Atta vollenweideri*, workers excavate space in excess and refill part of it with removed soil, depositing pellets inside the nest (Pielström & Roces 2013), and fresh pellets attract more work. In *Lasius niger*, a decaying building pheromone on pellets concentrates further deposits (Khuong et al. 2016).
- **What stopped MR 11 filling more** (instrumented):
  - two-thirds of pellet carriers' steps never reached the check, because the ants were wall-following or detouring, not walking a tunnel;
  - 98 % of checks found no one-cell dead end beside them, and most dead ends that existed had a digger in them.

  The scent threshold was not the limit: loosening it alone reached only 8.7 %.
- **The rules now:**
  - **Where:** every pellet carrier looks round each cell it enters, after 2.5 s of its trip home.
  - **Unused is judged against the path.** A neighbour counts as unused when its home + food scent is under half the scent where the carrier stands (or under `FAINT`), but never above the carrier's own: a cell as busy as its own is in use.
  - **Fillable means one unbroken run.** A cell can be filled when its open neighbours (1–5 of them) form one unbroken run: a dead end, the edge of a chamber, the side of a wide tunnel. In digital topology this is a *simple* cell, so filling it never changes how the ground is connected and no passage is ever cut. A cell of a one-wide tunnel (two runs) is never fillable.
  - **Fresh pellets draw more.** `map.filledAt` records when each cell was filled, and is cleared when it is dug out again. The "pellet scent" of a cell is exp(−age / 60 s) from the freshest fill beside it, and it raises the threshold up to 7×, so fills cluster and whole branches close.
  - **Stale branches.** At a cell where a neighbour smells far staler than the path (than both this cell and the one it came from, and never back the way it came), a carrier turns in 30 % of the time (only in the first 20 s of its trip). It walks on by the stalest way ahead to the branch's end and fills the last cell, so branches shrink from the tip, a cell per pellet; at an end with nothing to fill it heads home. A branch's mouth and first cells touch the tunnel it leaves, so they are never tunnel cells on hexes: this is decided in the tick on arrival, not in the tunnel walk.
  - **Unchanged guards:** no food in the cell, no ant of either colony (grids plus a direct look at nestmates), not within the nest's radius + 2.
  - **Put back stays put** (review of MR 12, below). A cell filled less than 600 s ago (`BACKFILL.hold`) is never dug: `chooseDig` skips it, `soilFace` only glances off it, and a dead end beside one is left rather than dug on. An explorer whose next cell is filled decides afresh, unless that cell is a face it chose to dig.
  - **Fresh digging is the frontier, not excess.** `map.dugAt` records when an ant dug each cell; a cell dug in the last 200 s (`BACKFILL.young`) is never filled, and a carrier never fills the cell its own pellet came from.
  - **Tuning** is in `BACKFILL`, frozen. Tests and sweeps change it only through `tuneBackfill`, which returns the function that restores it.
- **Tuning sweep** (seeds 1–4, 300 s unless noted):

  | setting | share refilled | notes |
  |---|---|---|
  | one-cell dead ends only, any threshold | ≤ 8.7 % | |
  | one-run cells, threshold 0.5× | 45 % | |
  | the same without pellet scent | 18 % | pellet scent does most of the work |
  | the same without detours | 41 % | |
  | wait 1–1.5 s instead of 3 | 68–74 % | food home −30 %: carriers fill space others then re-dig |
  | wait 2.5 s, pellet scent 30 s ×5 | 48 % at 600 s | after the review fixes below |
  | wait 2.2 s | 52 % at 600 s | food home −17 % |
  | wait 2.5 s, pellet scent 60 s ×7 (first cut) | 53 % at 600 s | food home −12 %; but see the review: most of it was the same cells cycling |
- **Measured, first cut** (seeds 1–5, 600 s, 600 + 600 ants, underground). The refill share and cells dug in this table are superseded by the review below: most fills were dug out again.

  | | MR 11 | MR 12, first cut |
  |---|---|---|
  | dug soil refilled | 0.6 % | 53.3 %, but 31–46 % of all digs re-dug filled cells (see the review) |
  | cells dug per colony | ~3,500 | ~6,200 (the same cells dug, filled, dug again) |
  | food home per colony | ~1,120 | ~990 (−12 %; seed noise is about ±7 %) |
  | first-food median | ~28 s | ~31 s |
  | ants out over 120 s | 1.5–13.6 % | 0.7–1.7 % |
  | homing trip median | ~5 s | ~3.3–4.2 s (carriers drop pellets early) |
  | livelock counter (seeds 1–4) | 9, 0, 0, 0 | 1, 1, 3, 1 (every one home within 70 s) |
  | homing over 60 s (seeds 1–4) | 85–232 | 25–87 |
  | burial scan (seeds 3–6) | | 0 |
  | stall scan, max still | | 10–25 s |

  - The open map is unchanged, number for number.
  - Bench: 3.78–3.92 ms vs 3.74–3.84 ms for MR 11, back to back; noise.
- **Movement fixes needed once the ground keeps changing round the ants** (the stall scan found ants still for 30–45 s; each fix has a test):
  - **Filled target.** A cell-by-cell wall-follower whose target is filled, or no longer beside it, decides afresh. The tunnel walk already did.
  - **Tunnel round a by-touch follower.** A follower going by touch (rock in open ground) that finds itself in a tunnel switches to by-cell; steering by touch spins on the spot in a one-cell passage.
  - **Edge graze.** A by-cell follower whose step is blocked is moved a quarter of the way back to its own cell's centre. From strictly inside a cell, the straight way to a neighbour's centre never leaves the two cells; only an ant exactly on an edge (it happens: Float32 positions) grazes the solid cell beside it, every step landing there.
- **Agent review fixes:**
  - the stale-walk flag is part of one trip with a pellet: it was left set after trips that ended at the nest, switching detours off and steering later trips (6 % of trips);
  - the "end of the branch, nothing to fill: home" exit could never run, because the way back was a candidate;
  - a wall-follower with a lost target now feels its next way from the cell it is in, not from the lost cell (the target used to run ahead a cell a tick);
  - the edge-graze recentre set a heading that the next tick overwrote: it is now the position nudge above, and its test starts exactly on an edge (the old one started in the soil cell next door);
  - re-dug cells no longer smell of fresh pellets;
  - fills keep clear of every nest, not only the carrier's own.
- **Review of MR 12: put-back soil was dug straight out again.** Counting every dig and fill (a hook on the map, no sampling; seeds 1–5, 600 s, 600 + 600 ants, `generateWorld(seed)`, game seed `seed × 31 + 7`), 38–46 % of all digs re-dug a filled cell, mostly within a minute of the fill. The "53 % refilled" was mostly the same cells cycling. Causes and fixes (each fix has a test that fails without it, checked by reverting it):
  - **Filling a branch from its tip leaves a new dead end**, and dead ends are where explorers dig: on along the tunnel's run, straight into the fill. Now a cell filled in the last `hold` (600 s) is never dug, and a dead end beside one is left.
  - **An explorer kept a filled target** (`#walkTunnel` exempted explorers from "a filled target is decided afresh"), stepped into the fresh soil and dug it back. Now only a face it chose to dig is kept.
  - **Carriers refilled the cell they had just dug** (the 2.5 s wait is a time guard, not a cell guard): 2.9 % of fills. Each ant now keeps the cell it last dug, and never fills it.
  - **Stale turn-ins reversed carriers**: 40 % went straight back the way they came, because home scent falls away from the nest along any path, so the cell behind always smells fainter than here. Now the way it came (the cell it looked from last, else the cell behind its heading) is never a candidate, and a branch must smell stale against that cell too, not only against here: a side way nobody walks, not the path's own far end. Straight reversals: 1.1 % (the residue is the counter's own idea of "the cell before"). About 57 % of turn-ins still lead away from the nest, as side branches off an outward tunnel do.
  - **With re-digging stopped, the colony stopped growing.** The fills ate the tunnels' live ends (a lone digger's tip smells stale against a busy path), and nothing dug them out again: net excavation fell to ~1,000 cells per colony and food home to ~620 (−37 %). Re-digging had been what kept the frontier moving. Hence the youth guard: a cell dug in the last `young` seconds is not filled.

  | setting (seeds 1–5, 600 s) | re-digs of filled cells, share of digs | dug soil filled | net dug (dug − filled) per colony | food home per colony |
  |---|---|---|---|---|
  | MR 11 (`main`) | 0.3–0.6 % | 0.6 % | 3,698 | 1,080 |
  | MR 12, first cut | 38–46 % | 56.5 % | 2,997 | 984 |
  | hold only (600 s; leave dead ends by fills) | 0 % | 62.7 % | 974 | 619 |
  | the same, digging on round fills | 0 % | 58.5 % | 1,062 | 492 |
  | the same, hold 300 s | 9–12 % | 61.5 % | 1,199 | 690 |
  | hold, no stale turn-ins | 0 % | 55.0 % | 1,111 | 606 |
  | hold, pellet scent ×3 | 0 % | 57.4 % | 1,058 | 641 |
  | hold, never fill a tunnel's tip | 0 % | 48.1 % | 1,094 | 421 |
  | hold, youth 120 s | 0 % | 30.2 % | 2,564 | 774 |
  | **hold, youth 200 s (chosen)** | **0 %** | **27.2 %** | **2,613** | **942** |
  | hold, youth 300 s | 0 % | 20.9 % | 2,967 | 947 |

  - **What the first cut really put back.** Its fills minus the fills dug out again come to about 23 % of the cells it dug for the first time. The chosen rules put back 27 % with nothing dug out again within the run, at the same food (942 vs 984, −4 %; −13 % against MR 11, whose colonies haul every pellet out). So this is a leaf-cutter colony that keeps about a quarter of its spoil underground, not the half the first cut claimed; *Atta* refills part of what it digs (Pielström & Roces), *Pogonomyrmex* 2.5 %.
  - **Mound share:** at least 0.54 of dug soil reaches the mound per colony on these seeds (first cut 0.32); the underground test's floor is back, at more than 0.25 of soil dug.
  - Carriers filling their own dig: 0 of ~9,750 fills (first cut 1,140 of 38,866).
  - **Longer games** (seeds 1–2, 1,200 s): once fills pass the 600 s hold, explorers may dig them again, and 0.7–4.6 % of all digs did, every one of a fill over 600 s old. A permanent hold gave 0 % but less food on both seeds (1,688 and 2,296 vs 1,789 and 2,564, both colonies together): old refilled ground is ground like any other.
  - **Food home**, rule by rule, is in the table: the youth guard is what keeps it (hold alone −37 %, with youth 200 s −4 % against the first cut).
  - Bench and the movement scans (stalls, livelocks, burial) were not re-run for the review fixes; conservation (dug = mound + filled + carried + lost) held on every run above, and the underground test's "no ant in a solid cell" invariant passes.


## 27. The side view: a cross-section

**MR 13** (owner's request, 2026-11-01): "I'm not seeing it deposit above ground because we don't see above ground — or is this not a cross section?"
- **Before:** the colony view was a top-down slice at one depth, and the mound was only a ring overlay.
- **Now:** the app opens on a **side view**: sky, a ground line, and the nest dug below it.
- **The Ground toggle** is "side view / from above". "From above" is the open surface map, unchanged number for number. The top-down underground map stays in the code as the tests' and bench's digging test bed.

**The model** (`generateSideWorld`, `SIDE_WORLD`):
- **Size:** 768 × 368 cells, with the ground line about 64 rows down (gentle noise, ±5 rows), leaving sky room for the mound (MR 14).
- **Below ground:** soil with stones (rock), more stones deeper. A few cavities, only more than 8 rows down.
- **Air is a terrain value (`AIR`):** solid to ants and scent like rock, never dug, drawn in `--sky`.
- **The walkway** is the air cells touching solid ground. They are stored as OPEN, so ants walk the ground line and its overhangs with every existing rule, and scent lies only on the walkway and in tunnels (the sky costs nothing to step).
- **`map.sky`** marks cells above ground. `updateSurface` re-derives walkway and air whenever a cell is dug or filled.
- **Nests.** Each nest is a chamber (radius 3) 14 rows down, joined by a steep zigzag shaft to its **entrance**, the hole where the shaft meets the ground line (always open ground, with the walkway beside it). The rival's entrance is 340 columns along.
- **Food.** Piles 3–6 cells wide lie on the walkway (seeds and bits, as harvester ants forage): four per 64 columns (`surfacePatches`), at least 16 from an entrance. Pockets lie in the soil, centred at least 10 rows down; their cells are at least 4 rows down. Food the player's ants couldn't reach by digging is dropped, and every pile on the ground can be walked to (§39).

**Ants:**
- **Where homing heads.** A homing ant heads for the chamber when underground. Pellet carriers, and any ant on the walkway, head for the **entrance**, the hole itself: path integration home is to the hole, not through the ground. A change of goal drops the wall being followed.
- **On the walkway, homing is along the ground to the hole.** At each cell it takes the way nearer the hole by column. The tunnel walk's most-home-scent rule walked carriers past the hole: home scent lies along the walkway on both sides of it, so at 300 s a third of the colony was shuttling along the ground line with food (agent review of MR 13).
- **On the walkway, explorers walk on** the way they are going, turning back only at the map's edge. A hand on the wall turned them round at every step in the ground and kept them within about 30 columns of the hole, short of the food farther out.
- **Food and pellets.** Food is stored in the chamber. Pellets are dropped at the hole (`soilOut`, physical in MR 14). A carrier that drops one goes on out onto the ground and is asked afresh, so the ground near the nest is searched.
- **The crust.** Soil touching the sky is dug only within 4 of the entrance, and ants on the walkway start no tunnels elsewhere. Otherwise surface explorers holed the ground everywhere, and a hollow dug just under the ground line left walkway cells hanging in the air.
- **Backfill** never fills a sky cell, or within 4 of any nest's entrance.
- **Defence and raids.** Enemies round the entrance count as near the nest (the chamber's watch doesn't reach it). Raids aim at the rival's entrance.
- **Food balance:** piles on the ground hold 40 units a cell (seeds lie thick), four per 64 columns; pockets below 0.8 per chunk. About a quarter of the food is on the ground. At first it was 6 %, and colonies whose nearest piles were 30 columns out barely grew.

**Two colonies by default, as from above.**
- The first version shared the ground line badly: carriers walking past their hole met the rival's foragers all along it, and at a 140-column gap half of both colonies were dead in three minutes.
- With homing to the hole they coexist: 615–900 ants each at 600 s, at the default gap of 340 on the 768-wide map.

**Measured** (seeds 1–5, 600 s, 600 ants per colony):

| | side view, one colony | side view, two colonies |
|---|---|---|
| first food | 8–11 s (food on the ground) | 8–11 s |
| food home | 448–1,511 | 63–1,349 per colony |
| ants alive at 600 s | 712–900 | 615–900 per colony |
| dug soil refilled | 65–74 % | 63–70 % |
| ants out over 120 s | 0–0.2 % | 0.1–4.9 % |

- **The open map** is unchanged on seeds 1–5.
- **Bench** (60 s, 1,200 ants per colony): side view 1.9 ms per tick with one colony and 4.6 ms with two, against 3.7 ms for the 512 × 320 top-down underground map.

**MR 14: the mound above ground.**
- **Pellets become cells.** A pellet dropped at the hole adds to the colony's spoil. Each whole cell of it, ⌊pellets × `SWELL`⌋ counted exactly (summing 1.2 in floats drifts), is heaped as a **loose-soil cell**. Loose soil is SOIL marked in `map.loose`, drawn in `--spoil`, walkable, and never dug again.
- **A sandpile.** `heapMound` drops a cell in a column some way off the hole, and it slides to the lower neighbouring column while one is a row or more lower. At most one row per column is about 41°, the angle of repose of damp soil (dry sand ≈ 34°).
  - Near **every** nest's hole, a column holds at most a row per column of distance, so each inner side slopes down into its hole at the same angle: a funnel crater, the hole open at its bottom, and no colony's spoil ever buries another's hole.
  - Food on a buried cell is lifted on top. Trail scent on it is topped up onto the new walkway cell above.
  - If one side has no room, the other is tried. A cell with no room on either side is counted in `moundLost` (none seen in play).
- **A spoil disc.** Pellets are carried out to a reach that grows with the mound: 3 + cells ÷ 6 columns, at most 90. More of them land farther out (the square root of a uniform draw). Its area tracks the nest's volume (Tschinkel 2015). By 600 s it is about 180 columns across, rising 10–19 rows near the crater.
  - **Dropped right by the hole:** a steep cone 30–40 rows high grew, which every forager had to climb, and food home fell by half.
- **Ants and the mound:**
  - An ant whose cell becomes solid (spoil heaped on it, or round it) climbs straight out to an open neighbour, upward first. Six heaps round an ant, three a second by the hole, used to wall it in for good.
  - Homing on the ground line goes cell by cell to the hole wherever the walkway is. On the mound's slopes it is two cells thick and no tunnel, and steering freely there wandered.
  - A homing ant on the ground line follows no wall and no detour. An explorer's detour used to carry on after it picked up food and walk it away from the hole.
- **Agent review fixes:**
  - one colony's spoil sealed the other's hole on the default two-colony map by 540 s, and food home froze;
  - ants were buried alive in loose soil for the rest of the run (up to 595 s);
  - uniform drops piled up by the hole;
  - scent carried up was added, not topped up.

  Each fix has a test that fails without it. The reviewer's two-colony run to 720 s now has no sealed hole and food home still rising.
- **Measured** (seeds 1–5, 600 s, 600 ants per colony):

  | | one colony | two colonies |
  |---|---|---|
  | food home | 420–978 | 512–773 per colony |
  | ants alive at 600 s | 705–844 | 728–793 per colony |
  | dug soil refilled | 65–71 % | 68–72 % |
  | ants out over 120 s | 0–1.5 % | 0.1–4.3 % |

  - Mound cells are exactly ⌊pellets out × 1.2⌋, and soil is conserved.
  - The open map is unchanged.
  - **One colony regressed against MR 13** (noted in the review of #16 and #17, added by the F2 fix-up, §41): food home 448–1,511 (mean 871) → 420–978 (mean 701). MR 15 below more than recovered it.

**MR 15: the mound is carried and loose** (owner, 2026-11-01): "Why is the mound not movable? They should be pellets that are actually easier for ants to move… right now ants can touch the mound from below and it just grows somewhere." Both were true. A pellet "dropped" at the hole was put in a random column up to 90 away, and loose soil could never be dug. The owner chose for ants to both spread the mound and take it down to backfill.
- **Carried out.** A pellet carrier comes up through the hole and walks out along the ground, away from the hole on a random side. It drops the pellet where it stands, once it is a chosen distance out. That distance grows with the mound (√ of a uniform draw over a reach of 3 + cells ÷ 6, at most 90).
  - The cell lands on that spot and slides only to the angle of repose. The mound grows where you see ants drop soil.
  - Funnels: every hole's funnel still holds.
  - Give-up: a carrier that can't get onto the ground within 15 s drops the pellet anyway, heaped on top of its column clear of the crater.
- **Loose.** Mound soil (`map.loose`) is no crust. ~~Dug from below, it comes up in a quarter of packed soil's time (`LOOSE_DIG`).~~ The pellet is a *moved* one: it doesn't count as dug, and it goes back out like any other.
  - ~~**Settling:** taken from inside the heap, the column settles a cell, so it is the column's top that goes, never a hole under hanging spoil.~~
  - Both struck rules never ran (review of #17: zero times in 300 s on seeds 1–5): the ground under the mound is crust, so no tunnel reaches loose soil from below, and pellets are only ever picked off a column's top. The F2 fix-up (§41) removed them: loose soil is never dug, and `takeLoose` takes only the top.
- **Spread.** An explorer on the ground beside a steep flank of the mound (the next column out a row lower, at the angle of repose) picks a pellet off it, 1 % a cell. It carries it about 6–18 columns farther out and drops it, so the mound spreads and smooths itself as ants rework their spoil.
  - On the ground line, mound soil is picked up only by these rules, not dug at head-on: explorers chewed the mound and carried it to the hole and out again.
- **Backfill from the mound.** Beside the mound anywhere, an explorer takes a pellet down into the nest to refill unused space, 0.5 % a cell (leaf-cutting ants refill excess space with soil, Pielström & Roces).
  - It homes like an ant without a load and backfills by the usual rules.
  - If it finds nowhere by the chamber, it carries the pellet back out.
- **Bookkeeping**, tested every few seconds:
  - **Dug soil:** dug = brought out + filled + dug pellets carried + lost.
  - **Loose soil:** picked up = dropped again + filled + carried + lost.
  - **The mound:** the mound on the map = ⌊brought out × 1.2⌋ − unplaced − picked up + dropped again.
  - The "filled" stat counts both kinds of pellet.
- **Ants on moving ground:** an ant whose cell becomes solid climbs out (up its column if every neighbour is solid). One left in the sky, the mound taken from under it, drops to the ground. Longest any ant spends in solid ground: 0.1 s.
- **The crust now holds round the hole and under the mound.**
  - Digging round the hole once hollowed the ground under the walkway above it. That cell fell to sky, and the carriers piled up in the hole with no way out onto the ground (seed 2).
  - Ground under the mound counts as crust too. Dug out under a blanket of spoil, the next pellet picked off the top opened a new hole into the tunnels, away from every entrance (agent review).
  - Ants on the ground line never dig: the hole is the way in.
- **Agent review fixes:**
  - the carry-out state is cleared when a carrier backfills (it leaked into later trips), and carry-out needs a pellet in jaws;
  - carriers on their way out don't look for space to fill;
  - food on top of a pellet picked up comes down with it, never left in the sky;
  - the tests check that the chamber reaches the hole and the hole the ground line, that no new holes open, and that the mound books balance when two colonies pick up each other's spoil.
- **Measured** (seeds 1–5, 600 s, 600 ants per colony):

  | | one colony | two colonies |
  |---|---|---|
  | food home | 1,267–1,881 (MR 14: 420–978) | 1,276–1,435 per colony (MR 14: 512–773) |
  | ants alive at 600 s | 900 (the cap) | 900 and 900 |
  | dug soil refilled (with loose fills) | 63–78 % | 66–71 % |
  | loose pellets picked up | 555–1,220 a colony, ~25 % of them into backfill | 404–1,044 |
  | longest in solid ground | 0.1 s | 0.07 s |

  - Food home roughly doubles: carriers walking soil out search the ground, and drop their pellet as foragers.
  - The open map is unchanged.

## 28. Home is a nest, not a point (design, 2026-11-01)

The owner asked where "home" really is for an ant, whether it is the queen, and whether ants build spaces with jobs. In the side view, home is still one pre-dug chamber that every ant steers to by an exact vector through solid soil.

The research and the design are in [`docs/nest-and-home.md`](nest-and-home.md), built since by nest slices 0–9 (§29–§38) and the fix-up in §39:
- **Outside,** home is the hole: a step-counting vector that drifts, corrected by landmarks and the entrance's smell, and reset in the shaft.
- **Inside,** ants go by **gravity**, memory and **chemical road signs** on the floor. Each chamber has its own smell.
- **The queen's scent** says where she is, not where home is.
- **Real nests** are shafts and chambers with jobs: royal, brood, store (deep), reception (top) and midden, with workers zoned by age.
- **Losing the only queen dooms a colony**, without ending it at once: no new workers, then a slow decline. So *orphaned* becomes a state, and *fallen* stays "no workers left".

Slices 0–9 are beads under the epic, starting with merging the fungus milestone (`main`, PR #7) into this stack.

## 29. The fungus on hexes: `main` merged into the side view (nest slice 0, ja-6nm, 2026-11-02)

The fungus milestone (§15–23, PR #7) and the maintenance review (#13) were built on square cells; the side-view stack (§24–27) rewrote the colony on hexes. This merge puts them together. The sections were renumbered (see the note above §24).

**How it was merged.** `main` reached this branch twice: here first, and again through #17 (mr15), which merged `main` itself and was then merged in (2026-11-02). That second merge was criss-cross (two bases: the stack before #17's own merge, and `main`), so git took the hunks the first cut had dropped as deliberate deletions; they were put back by hand. `colony.ts` is now #17's, and its port of the fungus onto hexes is described in §24 ("Merged with `main`") and §25 ("Review of #10"). On top of it, this slice keeps:
- after a stall, `#walkTunnel` picks branches by the vector to the ant's goal (`#goalX`, `#goalY`: the entrance on the ground line, else the nest), not always to the nest;
- `bestD` and `stallT` are reset when the goal changes (nest ↔ entrance), so progress is judged toward the goal the ant now has. There is one stall clock, advanced once a tick;
- backfill asks for every ant of another colony (`look` at tolerance −1), so it won't wall one in, stranger or not;
- `Game.enemiesNearNest` watches the entrance as well as the chamber, in world units;
- solo underground, the game refreshes occupancy through `#refresh()` like every other case (the same work: one colony, no recognition).

**Main's five homing fixes** (the review of #8), on hexes:

| Fix | Disposition |
|---|---|
| A trip home starts afresh (`#homeAfresh`: detour, bumps, wall, line home, lost-wall clock, stall clock) | Kept: on food pickup, on picking up a pellet, and when the policy sends an ant home. One definition. |
| No progress for `TUNNEL_STALL` (20 s): branches by the home vector for `BY_VECTOR` (15 s) | Kept, with the goal-change reset above. Without it carriers circle a ring of scented tunnels for ever (6 of 6 seeds on the first cut); two ring tests, one per ring shape. |
| Lost wall (`WALL_LOST`, `untouched`): touching no rock for 1.5 s lets go of the wall | Kept. Rock on open ground is still followed by touch, so a follower thrown off it by alarm circles in the open until the 120 s give-up without it. Two tests. |
| No new wall on give-up: a give-up earlier in the tick re-read (`wandering`) before a blocked step starts a wall | Kept. Its test sets the ant at `centreY(10)`: at `y = 10`, on hexes row 11, the step was never blocked and the test passed without the fix. |
| Tunnel handover and float32 | Kept. A wall-follower handed to a scented tunnel is walked on by `#walkTunnel`, not turned to the home vector; positions are rounded to float32 (`Math.fround`) before the landing cell is judged; the underground game asserts no ant-tick inside a solid cell. |

With #17 merged in, `tsc` and oxlint are clean and all 257 tests pass.

**Measured** on the first cut of this merge, before #17 was merged in (`scripts/colony-bench.mjs 1200 60 1`, merged vs the stack's tip mr15 as it then was):
- **Fungus hooks alone:** before the two homing fixes, the side view was identical to mr15 ant for ant (one colony 497 stored; two 448 / 439).
- **With the fixes:** the side view stores 482 (one colony) and 462 / 500 (two).
- **Tick time:** unchanged within noise, side view two colonies 5.15 ms against 5.23 ms.
- **Tests:** all 253 pass.

**Homing on the side view** (600 + 600 ants, 600 s; ants out over 120 s, sampled every 10 s from 120 s, mean and worst sample per colony):

| Seed | mr15 (= merge without the fixes): out > 120 s | food home | With the fixes: out > 120 s | food home |
|---|---|---|---|---|
| 1 | 17.2 % (worst 75 %) | 1345 / 1126 | 0.4 % (worst 4 %) | 1437 / 1395 |
| 2 | 0.1 % (1 %) | 1258 / 1481 | 0.1 % (1 %) | 1236 / 1415 |
| 3 | 18.0 % (59 %) | 1003 / 1352 | 10.6 % (56 %) | 1209 / 1421 |

Rings of scented tunnels were most of the stuck share in `ja-dy9`.

**§22 rerun on the side view** (Garden painted 4× on each chamber, 300 + 300 ants, 10 sim-minutes):

| World | Seed | No fungus: lost | Garden: unified at | Garden: lost | Infected | Ants at 10 min |
|---|---|---|---|---|---|---|
| side | 1 | 0 / 0 | 112 s | 0 / 0 | 100 / 100 % | 450 / 450 |
| side | 2 | 0 / 0 | 112 s | 0 / 0 | 100 / 100 % | 450 / 450 |
| side | 3 | 0 / 0 | 108 s | 0 / 0 | 100 / 98 % | 450 / 450 |

As underground in §22, the colonies never meet in ten minutes, so "unified" is reached without a meeting (`ja-i0f`). This table is the baseline that nest slice 8 (the fungus on the new home) is measured against.

**Jev cost:** unchanged. The colony situation is the stack's (`TOKENS_PER_SITUATION` ≈ 235), and the fungus lane is main's.

## 30. Home by a drifting vector, the hole in sight, and road signs (nest slice 1, ja-6tj, 2026-11-02)

The side view no longer gives ants an exact vector home through the soil (docs/nest-and-home.md §3.1). Top-down maps keep exact homing, so earlier numbers still reproduce.

**The vector drifts.** Each ant keeps an odometer and a drift drawn per trip (Gaussian, σ = `PI_DRIFT` 0.1), so it believes its goal lies drift × distance away, to one side.
- Only the way out counts. The vector it walks home on is the one it brought out; counting the walk home and the search moved the believed goal as fast as the ant chased it (the first cut did, and 40 % of a colony was out over 120 s).
- Depth never drifts: gravity tells an ant how far it has climbed.
- **On the surface,** the vector starts afresh coming up out of the hole.
- **Underground,** a self-referenced memory of the chamber starts afresh in the chamber.

**Local cues snap the believed goal to the real one:**
- the hole within `HOLE_SIGHT` (6) across the ground, and twice that up or down: the mound's rim stands rows above the hole in its crater, and the entrance's smell rises;
- the chamber in clear view within `NEST_SIGHT`.

**Search.** An ant that reaches its believed hole's column and finds nothing searches in loops either side, each 1.6× wider (Wehner's systematic search). It searches only there; blocked anywhere else, it goes round (Bug2 below).

**Road signs.** Underground, standing on a strong nest trail fades the memory's error (time constant `ROAD_SIGN`, 2 s). It is read on the floor under the ant, since the sensors ahead are often in soil in a tunnel. Without this, diggers that had walked 300–700 cells underground were tens of cells off, and stuck. In slice 3 the chamber marks take this role.

**Pellet carriers climb.** They head up and out without a vector: up the shaft is the hole. Steering them by a drifted vector had them surfacing off target and dropping spoil beside the hole.

**Bug2 on the ground.** With no open cell nearer the hole it heads for, a homing ant keeps a hand on the surface until it is nearer than where it got stuck.
- It picks its hand by feeling ahead along the surface both ways (`GROUND_LOOK`, 16 cells) and taking the side that gets nearer sooner. In a gully between two heaps, one side leads over toward the hole and the other along the far heap and away.
- After `GROUND_FLIP` (24) cells it turns back with the other hand, and each leg after that is twice the last (24, 48, 96 … cells), so a leg always passes where the one before began.
  - With equal legs the walk back ended where it started, and flipped there again for ever. Merging #17 (2026-11-02) changed the tunnels (Y forks), and so the mound; on seed 4 that left a pit on the mound whose only way out other than back led away from the hole, so both hands left it the same way. Carriers shuttled 24 cells either side of it: "away from the hole" in side.test.ts went from 7.8 % to 10.3 % (bound 10 %), and to 17.4 % on another seed. With doubling legs it is 1.2–6.8 % over six seeds (before the merge: 0.9–7.8 %).
- If the hole it heads for changes (it comes into sight), the follow starts afresh.
- Before this, the ground walk only stepped to nearer cells and rocked between two cells in a pit by the mound. That trapped 318 ants of one colony on slice 0 (seed 3) and 647 on an early cut of this slice.

**Agent review.** The review found that the first cut searched at any dead end on the ground, not only at the believed hole. The offset grew a step per decision (3, −4.8, 7.7 … 50), and blocked ants walked 50–80 cells off. My rewrite of side.test.ts hid this by measuring against a target that included the search offset.

Fixed:
- The search is gated on the believed column. Bug2 now handles every other obstacle, with the look-ahead hand above.
- The crater counts as in sight.
- A leftover search is cleared when a trip home starts.

On the reviewed code, 243 of 8,280 homing samples whose vector was within 3 cells were searching (seed 5). Now none are, and a test checks it.

side.test.ts measures against the real hole again, with two bounds:
- in sight of the hole (sampled every ⅓ s), a carrier never moves away: ≤ 1 %, and 0 is measured;
- overall, ≤ 10 %. 7.8 % is measured: three quarters of it is drift and search, the rest going round heaps. With an exact vector it was 0.

**Measured, before the review fixes** (side view, 600 + 600 ants, 600 s, seeds 1–6; ants out over 120 s sampled every 10 s from 120 s, mean / worst sample per colony; food home both colonies):

| Seed | Slice 0: out > 120 s | food home | Slice 1: out > 120 s | food home |
|---|---|---|---|---|
| 1 | 0.4 % / 4 % | 2832 | 1.4 % / 7 % | 2806 |
| 2 | 0.1 % / 1 % | 2651 | 1.0 % / 2 % | 2811 |
| 3 | 10.6 % / 56 % | 2630 | 1.5 % / 3 % | 2890 |
| 4 | 5.8 % / 26 % | 2321 | 3.2 % / 12 % | 2610 |
| 5 | 0.7 % / 3 % | 2693 | 0.4 % / 2 % | 2786 |
| 6 | 0.9 % / 6 % | 2833 | 0.5 % / 1 % | 2872 |
| mean | 3.1 % (worst 56 %) | 15,960 | 1.3 % (worst 12 %) | 16,775 |

Homing with error is a little slower where it was already easy (seeds 1–2), but no colony jams any more, and food home is up 5 %.

**After the review fixes** (same runs): out over 120 s is 1.2 / 1.7 / 1.0 / 2.7 / 1.8 / 0.3 % on seeds 1–6, a mean of 1.45 % (worst sample 11 %). Food home is 2841 / 2733 / 2820 / 2724 / 2722 / 2865, a total of 16,705 against slice 0's 15,960.

**Tick time** (`colony-bench 1200 60 1`, run back to back with slice 0):

| Side view | Slice 0 | Slice 1 | Change |
|---|---|---|---|
| Two colonies | 5.0–5.2 ms | 5.5 ms | about +7 % |
| One colony | 2.2–2.35 ms | 2.7 ms | about +15 % |

The cost is a cell lookup and a scent read per ant per tick, and the belief is computed only for homing ants.

**Tests.**
- `homing.test.ts` covers:
  - the vector's error grows with the way out, starts afresh, and is fixed on the way home;
  - a carrier 12 cells off walks to its belief, searches, and gets home;
  - road signs fade the error;
  - top-down maps keep no vector;
  - a homing ant whose vector is within 3 cells never searches (the review fix below).
  §40 adds tests for Bug2's other side, errors of 90 and 150 cells and a belief past the map's edge, and the vector's reset at the ant's own hole only.
- side.test.ts's "never away from the hole" measures against the real hole, with the two bounds below (the review reverted a first rewrite that measured against the believed hole).

**Jev cost:** unchanged. `down` is a sense in the sim, but not yet in the situation; slice 3 decides that. (Slice 3 left it out: see §32 and docs/nest-and-home.md §5.)

## 31. Ants dig the nest's chambers, as much as they need (nest slice 2, ja-60r with ja-wii, 2026-11-02)

The side view's nest is no longer one pre-dug disc. The ants dig chambers off its tunnels, as many as the colony's crowding asks for (docs/nest-and-home.md §3.2).

**Chambers** (`chambers.ts`, pure). Each chamber knows its cells, its floor, its colony, its role and its brood (slice 4 fills brood in).
- The founding disc is chamber 0 and is royal.
- Floor is a chamber cell with ground under it to stand on. At first floor needed ground under both of a cell's lower neighbours. Every tunnel dug down out of a chamber then took two floor cells with it, and the founding chamber's floor wore away to nothing.
- Backfill never fills a chamber cell.

**Crowding regulates digging.** A colony is crowded while its chambers' floor is less than `FLOOR_PER_ANT` (0.1) per ant underground.
- **Crowded,** explorers widen their chamber along its floor, 2 rows high. Widening is likelier near the top, where traffic is (`WIDEN_DEPTH` 30), and brood pulls it (`BROOD_PULL`, from slice 4).
- **Crowded,** explorers in tunnels also start new chambers sideways, likelier near the top (`exp(−depth / 40)`).
  - None start in the top 8 rows. One started 5 rows down beside the shaft trapped a whole colony's pellet carriers.
  - None start within `4 + 0.15 × depth` rows of a chamber in the same stack.
- **Roomy,** every other kind of digging happens at `ROOMY_DIG` (15 %) of its rate: tunnel ends, starts off walls, faces met head-on. A 30-ant colony in the founding chamber dug 3–7 cells in two minutes, against about 78 without chambers (from before the review fix: corrected under the table below).
  - **Floor building is exempt from #14's youth guard** (since #17's second merge, 2026-11-02). Nothing dug in the last 200 s is filled back (`BACKFILL.young`), but a tunnel dug down out of a chamber takes its floor with it until it is filled, so with the guard the floor barely grew in a 240 s game: 1.0–2.3× its start (worlds 1–4, games 4–6; 2.4–3.7× before #14). Filling the ground a floor stands on (`#floorGround`: a cell directly under a chamber cell, or beside one on its floor row) is construction, not spare soil put away, so it may be filled at once: 2.1–3.1× at 240 s, and the crowded-nest test is back to 240 s. `hold` (refilled soil isn't dug again for 600 s) and `besideRefill` still apply everywhere; exempting floor ground from `besideRefill` too added little (2.4–3.3×).
    - Refills in 240 s: 21–47 floor-ground cells and 7–174 others (without the exemption, 0–18 and 5–186).
    - Do floor fills cycle? Over 1,200 s (games 4 and 5 of world 2, game 4 of world 4), 35–49 % of floor-ground fills were dug out again once `hold` ran out (32 of 92, 37 of 75, 28 of 62), against 5–17 % of other fills (47 of 716, 24 of 469, 73 of 418). Without the exemption: 0 % and 65 % of a few dozen floor fills, 1 % and 30 % of other fills (two games). **Floor fills cycle:** once `hold` runs out (600 s), they are dug out again at 2–7× the rate of other fills. Not fixed here; left for the F2 fix-up. Floor at 1,200 s is 2.9–4.1×. **Fixed in F2 (§41):** soil put back under a chamber cell stays for good.
    - The crowded-nest test runs three games and asks for the depth trend (deeper chambers further apart) in at least 2 of them, every other check in each: the trend is one nest's handful of stacked chambers and fails in about 1 game in 6–9.
  - Since #17 was merged in (2026-11-02), a Y fork's second arm, left for the next digger to pass, is another kind of digging; it is damped the same way. Undamped, it raised the roomy colony's dig ratio (roomy ÷ no chambers, over 30 games on nest 5) from 0.34 before the merge to 0.38 (one game, world 2 game 8, to 1.00: as much as with no chambers); damped it is 0.35 (that game 0.33).

**Chambers never join.** A chamber face (widening or new) is dug whatever the tunnel spacing rules say, so it may open onto a tunnel (a junction), but never onto another chamber of either colony. The first cut forbade opening onto any passage, and chambers stayed at 1–6 cells with every colony crowded 100 % of the time.

**Measured** (side view, 600 + 600 ants, 600 s, seeds 1–6; the slice 1 numbers are from §30):

| | Slice 1 | Slice 2 |
|---|---|---|
| Cells dug, all colonies | 43,422 | 31,116 (−28 %) |
| Floor per ant underground | none | held at about 0.1 (crowded 24–64 % of the time) |
| Chambers per colony at 600 s | 1 (given) | 8–18 |
| Out over 120 s, mean / worst | 1.45 % / 11 % | 1.45 % / 11 % (wrong: see the correction below) |
| Food home | 16,705 | 15,676 (−6 %) |

Food home is down because less digging reaches less of the food underground. Pellet carriers climbing out of wide chambers by straight line and Bug2 can still wander (filed as a follow-up).

**Corrected (F2, §41; review of #21 item 3).** The table's "out over 120 s" is identical to two decimals while digging fell, and the 30-ant figure below was from before the review fix. Re-measured with `scripts/economy-bench.mjs` on the PR heads as they now stand (#20 at 22180ae, #21 at 9c1969e, both since merged with #14's backfill fixes; seeds 1–6, 600 + 600 ants, 600 s):

| | Slice 1 (#20) | Slice 2 (#21) |
|---|---|---|
| Cells dug, all colonies | 19,083 | 18,803 (−1.5 %) |
| Chambers per colony at 600 s | 1 (given) | 14–24 |
| Out over 120 s, mean / worst | 0.86 % / 9.0 % | 2.53 % / 23.7 % |
| Food home | 18,667 | 18,598 |

- With #14's backfill merged in, both slices dig far less than the table above (most pellets now go back underground), and the chambers no longer cut digging. The reviewer's run of the PR as it was: out over 120 s 1.85 % / 11.6 % → 1.41 % / 11.3 %.
- The roomy nest (`scripts/roomy-bench.mjs`, games 6–9): on #21's head 30 ants dig 12–21 cells in two minutes against 47–84 without chambers (ratio 0.14–0.33, 0.24 summed); the reviewer measured 13–25 against 74–83. On F2's branch, 11–51 against the same (0.13–1.09 by game, 0.45 summed; the test asks under 0.5 summed).

**Depth profile** (Tschinkel; per 10-row band below the ground). These are **imposed by rule, not emergent** (review of #21): the gap is `#chamberRoom`'s spacing, 4 + 0.15 × depth rows, and "largest near the top" is `WIDEN_DEPTH`'s falloff. The crowded-nest test checks that the rule shows in the nest the ants dig, nothing more:
- **Gap to the chamber above in the same stack** grows with depth on 11 of 12 colonies (one is nearly flat at 9–11): about 4–10 rows at 10–20 deep, 5–13 at 20–30, 7–14 at 30–40, and 10–32 below 40.
- **Size:** chambers are largest 10–30 rows down (mean 13–50 cells) and small below 30 (1–24 cells).
- **The topmost 10 rows** hold smaller chambers than the next band: none start in the top 8 rows, and the crust and mound are there.

**Tick time** (back to back with slice 1): side view one colony 2.85 ms against 2.71 ms; two colonies 5.77 ms against 5.34 ms (+5–8 %).

**Rendering:** chamber cells are a faint mound-coloured wash; slice 3 tints them by role.

**Tests:** `chambers.test.ts` covers:
- bookkeeping;
- a crowded nest digging chambers, with floor growing and gaps growing with depth;
- a roomy nest barely digging;
- no two chambers touching (it fails on the reviewed cut).

**Agent review.** The review found four problems, all fixed:
1. The gravity rule added during this slice (a homing ant in the hole never steps back up) was tested by a test that passed without it. Measured without the rule, seed 3 is at 0.6 % and seed 6 unchanged, so the cluster of 146 ants rocking in the hole on seed 3 had been cured by keeping chambers out of the top 8 rows. The rule and its test are gone.
2. In a roomy nest, aimed digs were damped twice (0.15² ≈ 2 %). They are now damped once. The roomy test checks the rate is above `ROOMY_DIG`, and it fails on the reviewed cut.
3. Chamber faces could dig into other chambers. They no longer do.
4. New chambers kept their spacing only from the colony's own chambers; now from every colony's.

**Jev cost:** unchanged.

## 32. Chamber roles, road signs, and asking an ant where it is (nest slice 3, ja-4n4 with ja-qnx, 2026-11-02)

The nest's chambers have jobs, its floors carry road signs, and an ant inside the nest is asked by where it is (docs/nest-and-home.md §3.3).

**Roles.** A chamber takes its role when it is started:
- The founding chamber is **royal**.
- The colony's first chamber more than 4 rows above the royal one is **reception**.
- Any more than 2 rows below the royal one is a **store**.
- The rest are **brood**.
- Midden is for slice 7.

Over seeds 1–3, each colony has its royal and reception chambers, 4–7 brood and 4–6 store chambers.

**Road signs** are five mark channels in the colony's pheromones (`MARKS`: royal, brood, store, reception, midden).
- Underground, an ant lays the mark of the last chamber it was in. The mark is fainter the longer it has been away (`MARK_DEPOSIT` 4 per second, falling to 1/e after `MARK_DECAY` 30 s), the way walking out lays home trail. So every tunnel smells of what lies back along it, and each junction carries the signs of each branch (Heyman et al. 2017).
- Marks fade slowly (1 % a second) and don't spread. Spreading them kept twice the chunks awake and cost 14 % of a tick (6.73 against 5.90 ms, side view, two colonies, as the slice's PR measured).
- On the ground and on the top-down maps they are never laid and stay asleep.
- **Homing in a tunnel** goes by the mark of where it is going (`SIGN_WEIGHT` 4 × the home trail). For now that is royal; slice 5 sends food carriers to reception.
- **A strong mark underfoot** corrects the in-nest memory, as the home trail does (slice 1).

**The situation.** Underground in the side view, `homeTrail` no longer reads the home trail. It says where the ant is: `tunnel`, or a chamber of its colony by role. On the ground, and on the top-down maps, it is the home trail's level as before. The design's `down` field (docs/nest-and-home.md §5) is not in it: gravity steers every ant underground already, and no choice turns on it.
- An ant that has just put food down in the royal chamber is now asked "in the royal chamber". Before, it was asked "home trail strong", the same question as an ant on the walkway by the hole.
- The legend says what the places mean and that an ant inside the nest is home. `COLONY_BRAIN_VERSION` is 4.
- `SITUATIONS` is 3,888 (home: 3 trail levels or 6 places).

**Jev cost.**
- **Per situation:** about 237 input tokens on the ground, 238 in the nest, against about 235 before, from `estimateTokens` on 100 situations to a request. The legend is a little longer.
- **Distinct situations a game asks** (both colonies, one doctrine; seeds 1–3, 600 s): 209–242, of them 128–159 in the nest. Slice 2 asked 88–91.
- Situations are cached per doctrine, so a game's questions cost about 55k input tokens once, against 21k: about $0.002 at $0.042/M. No live run: there is no API key in the cloud.

**Measured** (side view, 600 + 600 ants, 600 s, seeds 1–3, against slice 2's §31 runs):

| Seed | Slice 2: out > 120 s | food home | Slice 3: out > 120 s | food home |
|---|---|---|---|---|
| 1 | 2.2 % | 2800 | 2.0 % | 2538 |
| 2 | 1.2 % | 2348 | 1.0 % | 2747 |
| 3 | 1.3 % | 2668 | 1.8 % | 2810 |

**Tick time** (back to back): side view two colonies 6.35 ms against 5.90 ms (+8 %); one colony about the same.

**Rendering:** chambers are washed by role: the queen's violet, brood rose, store gold, reception teal, midden grey.

**Agent review.** The review found that `ja-qnx` was only moved, not fixed:
- In the side view, one cached "return" for "royal" would park every ant just home, since its time out resets at the nest and nothing re-asks it.
- On the top-down maps nothing changed. The reviewer measured 798 of 1,200 ants parked by a policy answering "return" to returning ants.

The fix is a mechanic in both views: an ant resting at home in "return" for `REST` (10 s), carrying nothing, is set to explore and asked afresh. Under the local rule nobody rests that long, so the top-down bench is unchanged (open 160×100: 2889 / 455). With the stubborn policy, the parked ants went from 300 of 300 (the test fails without the fix) to about a third of the colony resting at any moment, and food still comes home.

Also fixed:
- road signs are read through the fungus's home gain, like the home trail;
- marks are laid at the colony's trail `deposit`;
- the strategist keeps its own cache version (`STANCE_BRAIN_VERSION` 3), so its cached stances aren't thrown away.

The cost figures above come from a scratch script on the side view: `scripts/colony-cost.mjs` used the top-down map, which meets no in-nest situation. It has `--side` since §39: on the side view (600 + 600 ants, 5 minutes, five doctrines), the colony lane asks 113 distinct situations at ~589 tokens per question, ~222k tokens a game, about **$0.11 an hour** at a doctrine a minute (#22's review measured 568 tokens per question and $0.114 an hour at #24's head): about twice the top-down lane, under the $0.25/h target.

**Tests:** `marks.test.ts`:
- every chamber gets a role, and the royal mark is strongest in the royal chamber;
- an ant home with food is asked "royal", and on the ground the home trail level;
- a policy that always answers "return" to a returning ant no longer parks the colony, on either view.

## 33. The queen and brood; births from pupae; losing the queen orphans the colony (nest slice 4, ja-eyp, 2026-11-02)

In the side view, workers come from brood, not from a counter (docs/nest-and-home.md §3.4, "Queen loss"). The top-down maps keep the larder → ants rule and have no queen.

**The queen** lies on the royal chamber's floor. (Until the F2 fix-up she was placed a row below the chamber's centre, rows above its floor: review of #23. She is now on its bottom row, in the cell nearest its centre.)
- **Laying:** she lays an egg at most every `LAY_INTERVAL` (0.5 s). She lays only while the larder holds, beyond what the brood already laid will be fed, a whole worker's food, and while there is room under the cap. Without that reserve, eggs laid into an empty larder starved as larvae.
- **Her pheromone** is the royal mark, strongest where she lies.
- **She can be killed** by strangers at her side (rate `QUEEN_FIGHT` per stranger: a raid that reaches the royal chamber), or by `killQueen()` (the fungus's, slice 8).

**Brood** (`brood.ts`, pure) goes from egg to larva to pupa to worker.
- **Egg:** 1 food, 15 s.
- **Larva:** fed 3 food from the larder by the nurses within two cells of it (0.5 a second with two or more), for at least 20 s.
- **Pupa:** 20 s, then a worker is born where it lay.
- A worker still costs 4 food (`foodPerAnt`) and arrives about a minute after its egg.
- **Nurses:** an idle ant in the royal chamber picks up an egg near it and takes it to the brood chamber holding the least brood, steering by the homing machinery and the brood mark. With no brood chamber yet, brood stays with the queen. Each chamber counts the brood lying in it, so slice 2's brood pull works.

**Ageing.** Workers have a lifespan of `LIFESPAN` (1,800 s; **3,600 s since the F2 fix-up, §41**), 0.7–1.3× it each. The founding workers start between newborn and half a lifespan old, so none dies of age in a 10-minute game. Old age doesn't count as a loss for the strategist.

**Orphaned.** With the queen dead there are no new eggs, brood in progress still hatches, and the workers age out.
- On seed 1, alone, with the queen killed at 300 s: 900 workers at 600 s, 842 at 900 s, 458 at 1,500 s, 136 at 2,100 s, none at 2,700 s. Then the colony is fallen.
- **Beaten** in the side view now means no workers and no pupa left. Eggs and larvae need nurses, and the queen alone can't feed them.
- The stats table shows "queen" or "orphaned", and the brood as eggs / larvae / pupae.

**The strategist's larder.** It read 8 food or more as a full larder and sent explorers raiding. With brood, the larder holds what the brood will be fed while the colony grows, and every colony went raiding (689 of 765 ants fighting on seed 2). Now the larder counts as full only for food the brood won't eat, at the cap.

**Measured** (side view, 600 + 600 ants, 600 s, seeds 1–3; workers at 120 / 240 / 360 / 480 / 600 s per colony):

| Seed | Slice 3 (larder → ants) | Slice 4 (queen, brood) | Food home, slice 3 → 4 |
|---|---|---|---|
| 1 | 717 / 771 / 865 / 900 / 900; 715 / 772 / 817 / 862 / 890 | 701 / 797 / 900 / 900 / 900; 691 / 801 / 877 / 899 / 900 | 1375 / 1163 → 1375 / 1376 |
| 2 | 722 / 810 / 874 / 900 / 900; 735 / 820 / 887 / 900 / 900 | 662 / 739 / 789 / 876 / 900; 675 / 748 / 814 / 893 / 899 | 1344 / 1403 → 1268 / 1282 |
| 3 | 738 / 846 / 900 / 900 / 900; 752 / 830 / 900 / 900 / 900 | 667 / 759 / 817 / 876 / 898; 710 / 818 / 899 / 900 / 900 | 1400 / 1410 → 1310 / 1321 |

- **Growth** reaches the cap about as before. Birth comes about a minute after the food does, so colonies run 5–10 % smaller in the first minutes.
- **Homing:** 0.6–1.2 % out over 120 s.
- **Tick time** is about the same as slice 3 (two colonies 6.23 ms against 6.44 ms).

**Not built:** moving brood up and down for temperature (there is no temperature yet), and larvae dying unfed (they wait).

**Rendering:** brood is drawn as small dots (eggs pale, larvae cream, pupae tan) and the queen as a larger body in her colony's colour, hollow and crossed out once dead.

**Tests:** `queen.test.ts`:
- the side view has a queen and the top-down maps don't;
- egg to larva to pupa to worker, no sooner than the three stages;
- nurses fill a brood chamber;
- orphaned: no eggs, brood still hatches, the workers age out, and old age is no loss;
- strangers kill the queen, and the side-view beaten rule;
- the strategist's larder.

**Agent review.** Food is conserved to 2 × 10⁻¹¹ (larder + brood food + 4 × births = stored), chamber brood counts never drift, and the top-down maps are identical ant for ant. The review found:
1. **A nurse lost round a ring of tunnels**, passing a cell or two from a three-cell brood chamber, held an egg for 193 s. The egg became a larva in its jaws and went unfed, and once on the ground the nurse homed straight through the soil. Fixed:
   - a nurse next to its target chamber puts the brood down in it;
   - after `HOLD_MAX` (30 s) a nurse puts the brood down wherever it is;
   - on the ground line a nurse heads for the hole first, like any homing ant.

   A game-level test didn't reproduce the 193 s case, so it was dropped. No test covers the timeout.
2. **The orphan test was vacuous:** the colony was at its cap, so the queen couldn't have laid anyway. The test now gives room and food, and fails if laying isn't gated on her being alive.
3. **Unchecked test claims** now have checks: born on the pupa's cell; an unfed larva stays a larva; every chamber's brood count matches what lies in it.
4. **An orphaned colony's spare food** always read "low", since it never reaches the cap. Orphaned, food beyond what the brood will eat is spare.
5. **Beaten** now also waits for fully fed larvae, which pupate without nurses.
6. **Backfill** never fills a cell with brood on it.

After the fixes (seeds 1–3, 600 s): every colony reaches 900 workers with 300 births, food home is 1,276–1,353, and 0.4–1.0 % are out over 120 s.

**Jev cost:** unchanged. The ants' situation is the same; the brood is not in it.

## 34. Food flow: in at reception, kept in stores, carried to brood and queen (nest slice 5, ja-f2j, 2026-11-02)

With a queen (the side view), food lies in chambers. The larder is the food in the colony's chambers, kept in step as food comes and goes (docs/nest-and-home.md §3.6). The top-down maps keep the scalar larder.

**Foragers** take their food underground to the **reception** chamber (Tschinkel & Kwapich: harvesters drop seeds only in the top chambers), or to the royal chamber until a reception is dug. They steer by the reception's mark and put the food down on arriving: that is "food home" (`stored`).

**Porters.** An idle ant in reception or a store, or within two cells of one, with food there, takes a unit (`PORT_RATE` 3 a second). It takes it to whichever chamber wants food most: a brood chamber's larvae's unmet needs, or the royal chamber, kept stocked with `QUEEN_STOCK` (8) for her eggs, less what lies there and what porters already carry there. With nothing wanted, reception's food goes down to the least stocked store.
- **The first cut** let only ants standing in a chamber carry. The reception on seed 1 was a single cell; 1,850 food piled up in it, the royal chamber stayed empty, and the queen laid almost nothing (2–47 births).
- **Also fixed while building:** a carrier that put its food down was turned round, but the tick wrote its old heading back. It walked on into the nest's tunnels and dug at their ends; a roomy nest dug 41–60 cells against 16–25.

**The queen** lays from the food in her chamber. **A larva** is fed from the food in its own chamber.

**Measured** (side view, 600 + 600 ants, 600 s, seeds 1–3):

| | Slice 4 | Slice 5 |
|---|---|---|
| Food home, all six colonies | 7,842 | 7,969 |
| Porter trips per food | none | 1.3 |
| Workers at 600 s | 900 every colony | 897–900, but seed 2's first colony 813 (213 births; it brought in 1,002 food) |
| Out over 120 s | 0.4–1.0 % | 0.8–1.6 % |

**Where colony 0's food lies at 600 s:**
- seed 1: reception 149, store 76, royal 8;
- seed 2: store 24, royal 25;
- seed 3: reception 121, store 57, royal 8.

The pipeline keeps the queen and brood fed and puts the surplus into stores. Reception holds what has just come in.

**Tick time** (back to back with slice 4): two colonies 6.8 ms against 6.6 ms (+3–5 %); one colony 3.6 ms against 3.3 ms (+10 %). What each chamber wants, and what is already on its way, is worked out once a tick, not per porter.

**Rendering:** food lying in a chamber is drawn as seeds along its floor, up to 40 a chamber.

**Tests:** `food.test.ts` covers:
- the larder is always the food in the chambers;
- porters move it, and brood is raised;
- a forager puts its food down in reception, or in the royal chamber without one.

`colony.feed(n)` puts food at home for tests: in the royal chamber with a queen, else in the larder.

**Agent review.** The review checked food conservation (to 9 × 10⁻¹²) and the larder against the chambers' food (to 2 × 10⁻¹²), and found the top-down maps identical. It found:
1. **Stray larvae starved.** Brood put down outside a chamber (a nurse timed out, or died) was never fed and never moved. Each stray held back laying (3 food owed for ever) and took a slot under the cap. On seed 2, colony 0 had a 472-second-old stray larva at 500 s and 184 births against 286 before this slice. Now any idle ant underground takes stray brood in from within two cells, to a brood chamber, or to the queen without one.
2. **Porters put food down only standing in their target,** and stores one or two cells wide took up to 259 s to hit. Porters now also put food down from a cell beside the target. Foragers don't: put down beside their chamber, they were explorers in a tunnel and dug at its ends, and a roomy nest dug two to three times as much. Food in porters' jaws now counts toward the queen's reserve and the strategist's spare food.
3. **A porter that died dropped its food on the tunnel floor,** where a forager would bring it "home" a second time. It now goes into the chamber the porter was taking it to.
4. **Wants counted brood lying in another colony's chamber.** Now only the colony's own chambers.
5. **Seeds drawn in one column** for some chamber widths.
6. **Tests:** they now also check:
   - no chamber's food goes negative;
   - a larva eats only its own chamber's food;
   - a stray larva is taken in and raised. This one fails on the reviewed code.

After the fixes (seeds 1–3): food home 8,032 for the six colonies; 1.0 porter trips per food; 269–304 births a colony; out over 120 s 0.5–1.0 %, except seed 3 at 4.2 %.

**Jev cost:** unchanged. Foragers are still asked by place and trail; the inside work is a local rule.

**Open: #14's backfill guards widen this slice's floor spread** (since #17's second merge, 2026-11-02). With the floor-ground exemption from nest 2, the founding floor grows ×1.8–3.4 in 240 s (mean 2.33, worlds 1–4, nine games), against ×2.3–3.2 (mean 2.83) before #14; only switching all three guards off restores it. Likely the porters and food lying in chambers change how many ants dig and refill. The crowded-nest test asks for the mean over its three games to be at least ×2. The porter / backfill interaction is to be looked at in F2. **Resolved in F2 (§41):** not the porters; #14's youth guard made a crowded nest's diggers haul every pellet of its widening out to the mound.

## 35. Who works where goes by age (nest slice 6, ja-5kj, 2026-11-02)

In the side view with a queen, each worker's age band sets where it is and what it does (Tschinkel, J. Insect Sci. 4:21; docs/nest-and-home.md §3.5). The bands are shares of the mean lifespan: young under `YOUNG` (0.15), middle-aged under `MIDDLE` (0.35), old beyond. On the top-down maps every ant is old, which changes nothing.

**What each band does:**
- **Young ants** nurse: only they carry eggs from the queen to brood chambers. They keep with the queen and brood, following the royal and brood marks in tunnels and drifting toward the queen in open chambers. They never go out.
- **Middle-aged ants** dig and carry inside: only they dig, and they port food and take in stray brood. They may go out; they are not pushed to.
- **Old ants** forage. Underground they head up and out: climbing to the hole in tunnels, and toward it in open chambers. Before this, old ants that no longer dug wandered the nest's tunnels, and one colony had only 20–60 of 900 out.

**Enforcement.** Only the young are kept in.
- An inside worker underground doesn't follow a food trail (it leads out): it explores.
- Its walk turns back down at the top of the shaft.
- If it does step up out of the hole, it is put back, pointed down the shaft at its deepest open cell.
- Food and pellet carriers are exempt.

**Zoning is not in the Jev situation.** The ants asked out on the ground are foragers anyway.

**Measured** (side view, 600 + 600 ants, 600 s, seeds 1–3; sampled every 10 s from 120 s; depth in rows below the ground):

| Seed | Young: share, depth, out | Middle: share, depth, out | Old: share, depth, out |
|---|---|---|---|
| 1 | 20 %, 21.1, 0 % | 29 %, 8.9, 43 % | 51 %, 6.3, 54 % |
| 2 | 19 %, 19.0, 0 % | 27 %, 12.6, 15 % | 54 %, 8.6, 31 % |
| 3 | 17 %, 17.5, 0 % | 29 %, 12.6, 17 % | 53 %, 7.7, 27 % |

The young sit deepest and never go out; the old are nearest the surface and do most of the foraging.

| | Slice 5 | Slice 6 |
|---|---|---|
| Food home, six colonies | 8,032 | 7,794 (−3 %) |
| Births | 269–304 | 288–303, one colony 211 |
| Out over 120 s | 0.5–4.2 % | 0.4–0.8 % |
| Cells dug | about 2,500 a colony | 1,050–1,860 (only the middle-aged dig) |

Fewer ants dig, since only the middle-aged do, so chambers and floor grow more slowly.

**Tick time:** the first cut asked for the colony's population, which counts every slot, once per ant per tick (+57 %). It now uses the tick's own counts, and two colonies are at 6.74 ms against 6.8 ms on slice 5.

**Agent review.** The review found ants pinned at the hole by the first cut's hard rule.
- **The first cut also kept the middle-aged in unless foragers were short.** Put back and turned round in the hole, which is no tunnel cell, ants steered at random into the sky again for up to 45 s. Free ants spent 10–20 % of their time at the hole against 2–6 % before, and food home at 300 s fell 15–25 %.
- **Inside workers.** Following food trails up the shaft brought them there, and so did walking it.
- **Fixes:**
  - only the young are kept in;
  - inside workers don't follow food trails out, and turn back at the top of the shaft;
  - a put-back points down the shaft;
  - middle-aged raiders go out, and the young don't;
  - a stale chamber aim no longer lets a non-digger dig.
- **Tests:** the young-to-queen pull was untested; the test now compares young and middle-aged underground, and fails without the pull.

**Tests:** `zoning.test.ts`:
- bands on both views;
- the young never go out, and the old go out more than the middle-aged;
- the young sit deeper than the old and nearer the queen than the middle-aged underground, and only the middle-aged dig.

`chambers.test.ts`'s crowded nest makes every ant a digger: it tests how chambers are dug, not who digs.

**Not built:** castes (`ja-jhd`) build on these bands.

**Jev cost:** unchanged.

**Open: a known regression from #14's backfill guards, to be fixed in F2** (since #17's second merge, 2026-11-02). With only the middle-aged digging, floor depends even more on refills than on slice 5. In 240 s with every ant middle-aged, the founding floor grows ×1.1–2.4 (mean 1.91, worlds 1–4, nine games) against ×2.4–3.4 (mean 2.96) before #14, and 3 of 9 games have fewer than 3 stacked chambers (none before). The crowded-nest test asks for a mean floor growth of at least ×1.6 and a mean of at least 3 stacked chambers over its three games; F2 must restore the floor bound to ×2. **Restored in F2 (§41):** ×2 in every game.

## 36. The midden: the dead carried out, and a boundary (nest slice 7, ja-li6, 2026-11-02)

In the side view with a queen, a worker that dies leaves a corpse where it fell. Undertakers carry the dead to the colony's midden on the ground, past the mound's edge: harvester ants keep it at the edge of the cleared disc (AntWiki, *The Ants* ch. 18). The midden marks the colony's ground, and raiders shy from it (*Pogonomyrmex badius*; docs/nest-and-home.md §3.7).

**Undertakers.**
- Inside, an idle middle-aged ant with a corpse within two cells picks it up (`PICK_CORPSE` 1 a second).
- On the ground, any exploring or trail-following ant within `MIDDEN_NEAR` (100) columns of its hole does: out to the midden and a little past it.
- A corpse carrier moves like a soil pellet carrier: up the shaft and along the ground. It gives up after `CORPSE_GIVE_UP` (60 s) rather than a pellet's 15 s. A corpse put down short of the midden lies there, unmarked, until another ant takes it on.
- Corpse carriers are kept out of the soil accounting (dug = mound + filled + carried + lost holds), out of backfill, and out of soil losses.
- A carrier that dies drops its corpse where it falls.
- A corpse off the midden rots after `CORPSE_ROT` (15 min). The midden's corpses stay (since §39 as a count per cell, not a list).

**Where the midden lies.** It is `MIDDEN_AT` columns from the hole: `MOUND_REACH` + `MIDDEN_PAST` = 93, past the mound's largest reach, so the mound never grows over it. If the nests are close, it is nearer: at most 40 % of the way to the neighbour's hole. It is on the side toward the nearest other colony (of any number, since §39), so two neighbours' middens lie between them, east of the hole when alone.

**The midden's mark** is the fifth mark channel, `midden`. It is laid where a corpse is put on the midden (`MIDDEN_MARK` 20), and a little every second while corpses lie there. Since §39 each is spread over the column and 3 either side, tapering.

**Raids in the side view.** Before this slice, raiders could not get there at all. They steered straight at the rival's hole: through soil from inside their own nest, and off the bumpy walkway on the ground.
- A raider underground in its own nest climbs out by its hole, from chambers too, and never detours.
- On the ground it walks cell by cell to the rival's hole, as homing ants walk to their own.
- In at the rival's hole, it goes down toward the rival's chamber (the game gives each colony the rival's nest).
- About to step onto the rival's midden, it turns back with chance 1 − exp(−mark / `MIDDEN_SCALE` 5). As first built this was a wall, not a deterrent: the mark saturates, so 98 % turned back at every step and no raider ever got into a nest with a midden. Since §39 the chance falls with the raiders around it.

**Measured** (side view, 600 + 600 ants; 100 of colony 0's workers killed underground at 60 s; colony 1 set to raid from 300 s; "erased" clears colony 0's midden mark every tick):

| Seed | Of 100 dead on the midden by 30 / 60 / 120 / 240 s | Raiders within 20 columns of colony 0's hole, 300–600 s mean: midden / erased | Within 40 columns: midden / erased | Deaths 0 / 1: midden / erased |
|---|---|---|---|---|
| 1 | 56 / 83 / 97 / 100 | 1.9 / 54.1 | 20.2 / 141.1 | 364 / 227 vs 339 / 108 |
| 2 | 32 / 54 / 78 / 98 | 0 / 0 | 0.3 / 0.2 | 125 / 21 vs 115 / 25 |
| 3 | 44 / 78 / 98 / 100 | 2.4 / 11.4 | 7.5 / 20.5 | 375 / 256 vs 722 / 590 |

- **The dead are cleared** within two to four minutes, with the midden 93 columns out.
- **The midden was a wall.** On seeds 1 and 3 the rival's midden kept raiders off the hole: 2 rather than 11–54 within 20 columns. On seed 2 the raid is fought out between the nests, with or without it. On seed 3, half the deaths. No raider got into the rival's nest in any run, midden or not (§39 has why, and the fix).
- **Raids are bloody now.** A raid reaches the other nest, and both sides lose hundreds. The strategist's raid choice now has a real cost; a follow-up bead covers tuning it.

**Food home** (seeds 1–3, 600 s, six colonies): 9,845 against slice 6's 7,794 (+26 %), with raids now fought on the ground. Births 186–349; out over 120 s 0.4–0.8 %. Bench (side view, 1,200 + 1,200 ants): 7.0 ms a tick.
- **The gain is not the midden's.** It comes from where raiders are while the colony raids. On slice 6 a raiding colony's fighters steered at the rival through soil from inside their own nest (398 of 418 underground in the review's run) and did nothing; on this slice they leave and fight on the ground. §39 measures it in a natural game.

**Rendering:** the dead are drawn as small grey crosses, where they lie and in an undertaker's jaws.

**Tests:** `midden.test.ts`:
- the dead are carried out to the midden at `MIDDEN_AT`, and soil accounting holds;
- each colony's midden faces the other, on its own ground (fails with the midden always east);
- a carrier that dies leaves its corpse lying (fails without the release in `kill`), and unclaimed corpses rot;
- raiders reach the rival's side and go in under its hole (none did before);
- a raider shies from the rival's midden; this fails without the turn-back.

**Review fixes.** An agent review found that:
- raiders never left their own nest, and those that got there climbed back out at the rival's hole;
- the midden was always east, so only one colony's faced its rival;
- the midden moved out with the mound and was buried by it;
- corpses beyond 20 columns were never collected, and a raiding colony buried nothing;
- a dying carrier's corpse and the carried-corpse drawing were untested or wrong.

All are fixed above but one: the raiding colony still buried nothing. Its dead lay more than `MIDDEN_NEAR` out, and those in its own nest went uncollected, since raid stance made every middle-aged explorer a fighter (§39). Measuring the fixes showed that 15 s give-ups left corpses short of the far midden on hilly ground (seed 2: 6 of 100 buried), hence `CORPSE_GIVE_UP` and the wider `MIDDEN_NEAR`.

**Not built:** a deep midden chamber (*Atta cephalotes*). The `midden` role exists, but no chamber is given it.

**Uncollected: the battle dead.** Corpses more than `MIDDEN_NEAR` (100) columns from a colony's hole are never carried: a raid's dead lie where they fell until they rot (`CORPSE_ROT`, 15 min). In the review's runs, 165 (seed 1) and 395 (seed 3) of colony 0's dead lay 40–100 columns toward the rival, its ants there being fighters; in a natural game (seed 3, 300 ants, 400 s) colony 0 buried 1 of 88. Undertakers who fight, and a wider reach, are follow-ups (§39).

**Jev cost:** unchanged.

## 37. The fungus on the new home (nest slice 8, ja-iox, 2026-11-02)

The nest gives the fungus new levers (docs/nest-and-home.md §4). Everything here is side view only. The top-down maps keep the home-field ground.

**Ground.** A host's ground is now where it stands in the nest:
- `home`: one of its own colony's chambers;
- `tunnel`: its own nest's tunnels and shafts;
- `border`: the open ground;
- `foreign`: another colony's chamber or tunnels (whose tunnel it is: at first the nearest hole; since §39 the home scent where the host stands, own against any other colony's, with `borderRatio`, and `border` where neither is clearly stronger).

This replaces the home-field ratio. It makes 3 × 4 × 4 × 4 × 2 = 384 situations per strain (load × host × ground × contact × groomed), up from 288. I left out a chamber role per ground value: it would multiply situations by five, and the in-nest field (§32) already tells the ants.

**Two new interventions:**
- **`muddle`** (Lockpick; not lethal). The host smells its floor marks at 0.3 of their strength, so at full load it can't tell which chamber it is in and follows road signs weakly. It also swaps brood and store, both in the situation it is asked in and in the signs it follows home. This is the nest's "roam".
- **`crown`** (Bloom; lethal, off the menu by default, like cull). From a high load only (≥ `HIGH_LOAD` 0.7), a host by the queen kills her, and a host by a brood item kills it, each with chance `CROWN_RATE` (0.05) a second. The queen's death orphans the colony (§33). The first cut killed at once; spores painted on the royal chamber then orphaned the colony in its first second. **Since §39** it acts at any load, at `CROWN_RATE` × the host's load a second: from a high load only, grooming took every host below it within seconds and no queen died in a game.

**The midden.** An infected corpse carries its load and strain. Put on the midden by a strain that sporulates (Bloom, `sporulates`), it puts spores on the ground there (`MIDDEN_SPORES` 3). Other strains die with their host: carrying them out is hygiene.

**Nest odour** (recognition) drifts toward the ants in the colony's royal chambers in the side view, as §4 asks. The first cut kept the nest's disc (r 3), which held few of them once the royal chamber had widened to 9–12 columns. (Untested until §39.)

**Only where there is a nest.** `muddle` and `crown` (`NEST_ONLY`) are dropped from the menu on the top-down maps, where there are no chambers or queen: `Fungus.menu` filters them, and the Jev lane reads its menu back from the fungus. Since §39 the page hides their buttons there too, and `Fungus.menu` hands out a copy (adding to the live set skipped the filter).

**Each view its own cache** (since §39). `home` is one of the host's own chambers in the side view and home-scented ground on a top-down map, so the fungus lane's cache context (`fungusContext`) names the side view; the top-down maps keep theirs.

**The midden rarely spores.** Most fight dead rot where they fall before an undertaker reaches them (§36), so a Bloom corpse put on the midden, and the spores it leaves there, are rare in play.

**`FUNGUS_BRAIN_VERSION`** is 4. The legend says what each ground is.

**Measured.** The §22 rerun is against §29's baseline: Garden painted 4× on each chamber, 300 + 300 ants, 10 sim-minutes.

| World | Seed | No fungus: lost | Garden: unified at | Garden: lost | Infected | Ants at 10 min |
|---|---|---|---|---|---|---|
| side | 1 | 21 / 31 | 108 s | 0 / 0 | 100 / 91 % | 450 / 401 |
| side | 2 | 35 / 37 | 104 s | 0 / 0 | 92 / 98 % | 433 / 450 |
| side | 3 | 51 / 72 | 104 s | 0 / 0 | 68 / 66 % | 450 / 450 |

- Garden still unifies, at the same times (104–108 s against 108–112 s), with no deaths.
- Without the fungus the colonies now lose 21–72 ants each, where §29 lost none: raids reach the other nest since slice 7 (§36). So Garden's peace is now worth something.

**Crown and muddle in a game.** Neither is chosen by the local rule, only by Jev, so a scripted policy stands in.

*As first measured* (colony 1 painted 4× at its hole; 300 + 300 ants; 10 minutes), crown at high load at home orphaned the colony at 12–23 s and muddle showed no cost in food. Neither held up. The review of #27 could not reproduce the crown runs (no harness was committed; with crown acting only from a high load, grooming took every host below it within ~8 s and no queen died in 300 s, even under heavier paint than the UI brush), and muddle had been measured by food, not brood. §39 has the committed harnesses (`scripts/crown.mjs`, `scripts/muddle.mjs`) and the numbers that replace this table:

| Seed | Crown, Bloom stroked across colony 1's hole at 60 s (UI brush, 6 events): queen dies after / brood killed / births, colony 1 vs 0 | The same stroke along its royal chamber: queen dies after | Muddle, Lockpick on both holes (UI brush), 300 s: colony 1's births, local rule vs muddle |
|---|---|---|---|
| 1 | 19 s / 66 / 43 vs 236 | 31 s | 114 vs 99 |
| 2 | 26 s / 82 / 22 vs 152 | 4 s | 150 vs 129 |
| 3 | 53 s / 104 / 52 vs 144 | 10 s | 87 vs 80 |

- **Crown is decisive and quick** once it can act at any load (§39). Bloom reaches nearly all of colony 1 within 30 s, and the nurses by the queen carry it. Whether it should wait for something, such as a host's time by the queen or her guards, is open (`ja-yif.2`).
- **Muddle costs brood.** A muddled nurse follows the store's signs with brood in its jaws, and a muddled porter takes the larvae's food toward the stores. §39 keeps it as the intervention's intended cost and measures it.

**Bench** (side view, 1,200 + 1,200 ants): 7.3 ms a tick, against 7.0 ms.

**Tests:** `fungusHome.test.ts`:
- the four grounds, including a host in the rival's shaft (foreign);
- muddle, blunted and swapped in the situation; blunted, a road sign of strength 2 is not read (the vector's error doesn't fade);
- crown kills the queen and brood, not at once, only from a high load, and it is lethal, Bloom's, and off the menu;
- muddle and crown are not on a top-down map's menu, even when asked for;
- `kill()` records a host's load and strain on its corpse;
- a Bloom corpse on the midden sporulates and a Garden one doesn't.

The tests for the rival's shaft, the high-load threshold and the unread road sign each fail without their fix.

`fungalPolicy.test.ts`: 384 situations, and what each strain is offered.

**Review fixes.** An agent review found:
- a host in the rival's tunnels read `tunnel` (its own);
- crown acted from load 0.35, not a high one;
- muddle was offered on the top-down maps, where it does nothing;
- the ant card and stats didn't show the new levers or the brood crown killed (now: "its nest's floor marks ×0.30", "brood as store", "kills the queen and brood it touches", and "† n" after the brood counts);
- three tests would have passed with the feature broken;
- the nest odour's disc missed most of the royal chamber;
- `game.ts` read the global strain list, not the fungus's;
- the crown loop scanned brood for hosts on the surface.

All are fixed. Unity moved by one second; the crown runs are unchanged (the scripted policy only crowned at high load).

**Jev cost.** Fungus lane, tokens per fungal situation with every intervention on the menu (`estimateTokens`, side view; on the top-down maps Lockpick stays at 232):
- Lockpick: 232 → 276;
- Bloom: 297 → 343 (crown included; it is off by default);
- Garden: 315, unchanged.

The legend's longer `ground` line is shared across a request's hosts, so it costs little per host. The colony lane is unchanged at 237.

## 38. Several queens, adoption, orphans merging: a design note (nest slice 9, ja-wjw, 2026-11-02)

Docs only: `docs/queens-and-merging.md`. It designs, for the species framework (`ja-8fd`) and the lifetime layer (`ja-1vg`):
- **queens as a list**, with a per-species trait (one or several; the fire ant's polygyne form is a per-colony flag, after Ross & Keller 1998);
- **queen adoption** within odour tolerance, once nuptial flights exist;
- **orphans merging into a tolerated neighbour**, after an African army ant (Kronauer et al. 2010): an orphaned colony's workers defect when they meet a calm colony they tolerate (a new, mutual check), walking the raid path to its hole; a colony half of whose workers defected ends **merged**, not fallen. The note lists what the code needs for this (an adopt/leave pair instead of spawn/kill, brood moved between colonies, per-colony raid targets, the host's cap). With Bloom's crown and Garden this is the "infect the queen" unification play of docs/nest-and-home.md;
- **worker-laid males**, in the lifetime layer.

No situation changes for the ants or the fungus; the strategist might gain `orphaned` (stances are cached per situation and calls follow distinct situations, so this can double both the distinct stance situations and the stance calls; measure with `npm run colony-cost -- --side` when built). Thelytokous species (*Cataglyphis cursor*) make workers without a queen: for them orphaning is not an ending.

An agent review checked the note's code claims; it caught that recognition has no per-ant odour blending, that `spawn`/`kill` reset or leave what a defector should keep, and that the fungus's `allied` contact is one-way and infected-only. The note is corrected.

Follow-ups: `ja-8fd.1`, `ja-8fd.2`, `ja-1vg.1`, `ja-1vg.2`.

**The owner's answers** (2026-11-02, after the review of #28): more than two colonies is coming soon, so merging is worth building (with two, Garden alone unifies); and crown stays, reachable in real play (§39). The note's §7 lists them, and the decisions still open: "merged" as an ending, whether the Unite aim allows crown, polydomy or abandonment, a calm gate on defection, defectors keeping their old odour (§3.3 of the note: as built, a defector carries none of the orphan's odour, so the host's gestalt never moves toward it), the host's cap, thelytoky, crown's pacing, `orphaned` in the strategist's situation, the midden, how Bloom and Garden share the colony to be orphaned (the first strain in holds a host), and brood. The review also corrected the note's odour model and its two-strain play.

**Jev cost:** unchanged (no code).

## 39. Fix-up after the reviews of the nest stack: raids, the midden, the fungus on the nest, any number of colonies (2026-11-02)

The agent reviews of #26 (midden, raids), #27 (the fungus on the nest), #28 (the queens design note), #18 (the nest design) and #22 (roles and marks) found that raids parked the young at their own hole, the midden was a wall, crown could not happen in a game, and several docs and cost notes were wrong or missing. The owner decided two things: **more than two colonies is coming soon** (nothing may assume one rival), and **crown stays**, reachable in real play. Harnesses, committed: `scripts/raids.mjs`, `scripts/raid-food.mjs`, `scripts/crown.mjs`, `scripts/muddle.mjs`, `scripts/fungus-cost.mjs`, and `scripts/colony-cost.mjs --side`. All use the app's own setup: `generateSideWorld(seed)`, `Game` with `mulberry32(seed * 7919)`.

**Closes:** #26 review items 1–5 and its nits; #27 items 1–5 and its nits; #28's note fixes; #18 items 1–3 and the stale lines; #22's nits and its `--side` request.

### Raids

**The young are no raiders** (#26 blocker). Raid stance made every explorer a fighter, the young too; a young raider climbed to its hole, was put back down the shaft (slice 6), and climbed again. Now an ant that may not go out, with no enemy near, explores when the policy (local or Jev) answers "fight" under raid stance. A local mechanic after the answer, like zoning itself: the cached answer is unchanged.

**Raiders walk on to the raided nest.** Measuring the midden fix showed raiders stopping 12–13 columns short of the rival's hole, in the pits by its mound, whatever the midden. Two causes:
- an ant "saw" strangers through soil (`#enemyHeading` took the nearest stranger within two cells): a raider on the walkway charged ants in a tunnel under it, into the soil, for good. It now needs a clear line (`#clearTo`), on maps with soil;
- a side-view raider climbed the alarm gradient by free steering before walking to its target. It now walks the ground to the raided nest cell by cell, past the alarm (a raider with an enemy in sight still charges it; defending, alarm still calls fighters).

**The midden deters; it is no wall** (#26 item 2). The midden's mark saturates, so a raider turned back with chance 0.98 at every step onto it. Now:
- the turn-back chance is `1 − exp(−mark / 5)` × `MIDDEN_CROWD` (3) / the raider's own colony's ants within two cells, once they are more than 3: a scout or a handful shies, a raid in force presses on;
- the mark is laid over the midden cell's column and 3 either side, tapering (`MIDDEN_SPREAD`).

**Raids aim at the nearest rival, of any number** (owner). The game points each colony's raids at the nearest colony that is not beaten and not kin by odour (`nearestRival`, re-aimed at each strategy step), and gives raiders that colony's marks for its midden (`raidMarks`). Each colony knows every other nest (`Colony.others`): which nest a column belongs to (nearer its hole than any other, now with the row's parity: `centreX(cx, cy)`), and which way the midden faces (toward the nearest neighbour, at most 40 % of the way).

**Measured** (`scripts/raids.mjs`: 600 + 600 ants; 100 of colony 0's workers killed underground at 60 s; colony 1 forced to raid from 300 s; means over 300–450 s, sampled each second):

| Seed | Raiders within 20 columns of colony 0's hole: before / after / after, midden erased | Inside colony 0's nest (most at once) | Colony 1's young at its own hole: before / after | Deaths during the raid, colony 0 / 1: before / after | Buried, colony 0 / 1 (picked up): before / after |
|---|---|---|---|---|---|
| 1 | 0.3 / 18.5 / 0.9 | 0 / 0 | 78.9 % / 1.2 % | 330 / 222 → 436 / 325 | 98 / 0 (239 / 0) → 98 / 0 (291 / 0) |
| 2 | 2.5 / 2.6 / 4.3 | 0 (1) / 0 | 42.4 % / 0.5 % | 131 / 141 → 157 / 179 | 100 / 0 (306 / 0) → 100 / 0 (455 / 0) |
| 3 | 0 / 1.9 / 6.6 | 0 / 0 | 60.7 % / 0.4 % | 214 / 209 → 326 / 376 | 122 / 0 (320 / 0) → 122 / 1 (358 / 1) |

"Before" is the stack's head (nest 9); colony 1's raiders went to the rival's ground and stayed 12–13 columns short of it. Raids are bloodier now: more raiders reach colony 0's doorstep, and more of colony 0's undertakers carrying corpses out die there, which is why its pick-ups outnumber its burials (a corpse dropped by a carrier that dies is picked up again).

- **The young stay in:** 0.4–1.2 % of the raiding colony's young at its hole, against 42–79 %.
- **Raiders reach the rival's hole,** but in this setup none gets in, midden or not: colony 0 defends (its strategist sees enemies at its nest and losses), and the raiders die in the fights at its hole. Erasing colony 0's midden every tick changes little now: the midden is no longer what stops them.
- **Past a midden, in force:** `midden.test.ts` gives a rival a buried heap (20 dead, its mark laid every tick from the heap) and sends 150 middle-aged raiders: at least 3 get in under its hole; with the old turn-back rule, none.

### The midden

- **A raiding colony buries** (#26 item 3). Middle-aged fighters with no enemy near, underground in their own nest, now undertake. In the forced raids the raiding colony still buries next to nothing: its dead lie more than `MIDDEN_NEAR` out, at the rival's (`ja-yif.4`).
- **Corpses past the midden are carried back to it.** Taken up between the midden and `MIDDEN_NEAR`, a corpse was "carried out" to a point already passed, put down at once off the midden, and taken up again. Now the undertaker walks it back toward the hole to the midden's far edge.
- **The midden is a count per cell** (`Colony.midden`), not a list growing all game: a buried corpse leaves `corpses`, and the game hears of each burial (`onBury`) for the midden's spores.

### The fungus on the nest

**Crown is reachable** (#27 item 1; owner). From a high load only, no queen died in a game. Crown is now the spores a host passes on as it tends the queen and brood: a host by her kills her with chance `CROWN_RATE` (0.05) × its load a second, and likewise each brood item it is by (`regicide` = load). `scripts/crown.mjs`: 600 + 600 ants, crown on the menu, a scripted policy (crown wherever a Bloom host is in its own chamber, as Jev under an aim like "kill their queen" would), Bloom with the UI brush (radius 3, spores 2, dose 0.15) at 60 s:

| Seed | 6 events across colony 1's hole: queen dies after | brood killed | births, colony 1 / colony 0 (300 s) | 6 events along its royal chamber: queen dies after |
|---|---|---|---|---|
| 1 | 19 s | 66 | 43 / 236 | 31 s |
| 2 | 26 s | 82 | 22 / 152 | 4 s |
| 3 | 53 s | 104 | 52 / 144 | 10 s |

At a fifth of the rate (0.01) the royal-chamber stroke still kills her in 4–34 s: many hosts are by her at once, so the rate alone barely paces it. Whether crown should wait (a host's time by the queen, her guards) stays open (`ja-yif.2`).

**Muddle costs brood: kept as its intended cost** (#27 item 2). Lockpick with the UI brush on both holes at 30 s, 300 + 300 ants, 300 s, every host muddling against the local rule (soothe), `scripts/muddle.mjs`:

| Seed | Births, colony 0 / 1: local rule | Muddle | Change | Brood at 300 s: local → muddle |
|---|---|---|---|---|
| 1 | 112 / 114 | 114 / 99 | +2 % / −13 % | 34 / 23 → 34 / 51 |
| 2 | 90 / 150 | 94 / 129 | +4 % / −14 % | 24 / 19 → 33 / 23 |
| 3 | 140 / 87 | 141 / 80 | +1 % / −8 % | 44 / 15 → 9 / 30 |
| 4 | 139 / 101 | 78 / 82 | −44 % / −19 % | 12 / 43 → 64 / 25 |

Food home moves either way (585 / 548 → 592 / 666 on seed 1; 639 / 610 → 571 / 428 on seed 4), so food was the wrong measure. In most colonies muddle costs 8–19 % of births in 270 s; in one of eight, 44 % (seed 4's colony 0, whose brood piles up unhatched: 64 at the end against 12), as the review found under heavier paint (35–40 %).

A muddled nurse follows the store's signs with brood in its jaws (and at `HOLD_MAX` puts it down where it is); a muddled porter takes the larvae's food toward the stores. Exempting brood carriers from the swap was tried and did not bring the births back (colony 1: 87 and 121 against 114 and 150), so the cost is the whole misreading, nurses and porters, as muddle's blurb says ("it gets lost inside"). Not lethal, but not free.

**Whose tunnel is local, for any number of colonies** (#27 item 5). The nearest hole (map-wide, and wrong for polydomy) is gone: a host in a tunnel is on its own (`tunnel`) where its colony's home scent is at least `borderRatio` (2) times the strongest other colony's, on another's (`foreign`) where that holds the other way, and `border` where neither does. Top-down `home` / `foreign` reads every other colony's scent the same way (with two colonies, as before).

**Nest odour has a test** (#27 item 4): masked hosts in the royal chamber, outside the old disc, move `nestOdour`; in a brood chamber, or in the disc but out of the royal chamber, they don't. It fails with the disc rule back.

**Nits:** the fungus lane's cache context names the side view (each view its own cache; the top-down maps keep theirs); the page hides `NEST_ONLY` buttons on top-down maps; `Fungus.menu` returns a copy; one `swapBroodStore` helper; nest-and-home §4 says only lethal crown was built; fungalPolicy.ts's header says foreign covers another's tunnels; §37's count is 3 × 4 × 4 × 4 × 2; the oxlint warnings in the tests are gone. From #22: `#roleFor` takes only the row; `chambers.test.ts` explains its 2× floor bound; §32 gives the marks' spreading cost as the PR measured it (14 %).

### Food home: the gain from slice 6 to slice 7 (#26 item 5)

`scripts/raid-food.mjs`, a natural game (local rule and strategist), seed 3, 600 + 600 ants, 600 s:

| Branch | Food home, colony 0 + 1 | Births | Losses (fights) | Colony 0 raiding, share of the time | Its fighters while raiding: underground / out |
|---|---|---|---|---|---|
| nest 6 (slice 6) | 1,498 + 1,286 = 2,784 | 295 / 302 | 2 / 2 | 35 % | 719 / 82 |
| nest 7 (slice 7) | 2,356 + 1,232 = 3,588 | 293 / 296 | 6 / 26 | 28 % | 220 / 352 |
| nest 9 (the stack's head) | 2,356 + 1,232 = 3,588 | 293 / 296 | 6 / 26 | 28 % | 220 / 352 |
| this fix-up | 2,722 + 1,665 = 4,387 | 405 / 345 | 132 / 202 | 32 % | 109 / 298 |

- **Slice 6 to 7 (+29 % here, +26 % over §36's six colonies) is the raiders getting out,** not the midden. On slice 6 a raiding colony's fighters (almost all its explorers) sat in its own nest, 719 underground against 82 out, for the third of the game it raided: nobody explored, so nobody found food, and no raid ever reached the rival (2 losses each). From slice 7 they leave the nest, and when the stance turns back to forage they are already out on the ground, spread along it, and find food. Colony 0, the raider, gains all of it (1,498 → 2,356); colony 1, which never raided, is unchanged.
- **This fix-up adds +22 %,** with raids that now reach the rival in a natural game (132 / 202 lost in fights, against 6 / 26), and more births (dead workers free room under the cap, `maxAnts`). Which change carries the food gain is not separated here: raiders that walk on rather than charge ants through soil, and inside ants no longer distracted by enemies they can't reach, both change who is out and where.

### Jev cost

All estimates offline (`estimateTokens` on the requests a game would send, behind each lane's own cache logic); no live call. The stack's head ("before") and this fix-up give the same figures unless both are shown.

**Colony lane, side view** (`npm run colony-cost -- --side 5 600 1`: 600 + 600 ants, 5 sim-minutes, five doctrines, the first again at the end; new with this fix-up, #22's request):

| | Distinct ant situations | Tokens | Tokens per question | $ per game | $ per hour at this pace (a doctrine a minute) |
|---|---|---|---|---|---|
| before and after | 113 | ~222k | ~589 | $0.0093 | $0.112 |

Unchanged by this fix-up, and against #22's review of #24 (120, 225k, 568, $0.114). Under the $0.25/h target. On the top-down map `npm run colony-cost` is as before.

**Fungus lane, per game** (`node scripts/fungus-cost.mjs <play> 5 600 1`: 600 + 600 ants, 5 minutes, the UI brush, 6 events, at 30 s; the player's default menu, Bloom with crown added where named; the "Unite" aim):

| Play | Distinct fungal situations asked | Requests | Tokens per game | Tokens per question | $ per game |
|---|---|---|---|---|---|
| Lockpick, both holes | 54 | 26 | ~30.5k | ~564 | $0.0013 |
| Bloom, colony 1's hole | 44 | 21 | ~23.3k | ~529 | $0.0010 |
| Bloom with crown, colony 1's hole | 52 → 47 | 21 → 22 | ~27.6k → 26.8k | ~530 → 569 | $0.0012 → $0.0011 |
| Garden, both royal chambers | 81 | 30 | ~43.4k | ~535 | $0.0018 |

- Per fungal situation, at 100 to a request (§37): Lockpick 276, Bloom 343 with every intervention, Garden 315. Unchanged: no legend, situation or question changed. As a game asks them (a few to a request, each request carrying the legend and aim) a question costs ~530–570.
- Even a whole game is about a fifth of a cent, a few cents an hour if the player replays; the lane's cost is its fixed per-request share, not the situations.
- The side view now has its own cache context, so the first side-view game under an aim asks afresh what a top-down game had cached under it.
- #27's review counted more distinct situations under heavier paint (Lockpick 35 → 67, 2.3× per game, from slice 7 to 8); these runs use the UI brush.

CLAUDE.md's fungus-lane figure now gives both numbers.

### Docs

- docs/nest-and-home.md: §5 rewritten to what was built (`homeTrail` says where the ant is, no levels, no `down`, which was dropped) with the measured costs, each labelled estimate or live; §3.3 says what was built; the header and §4's stale lines, §2's line numbers (now symbols), §6's "no vector", and slice 8's baseline (§29's rerun) are fixed; bead IDs instead of "MR N" where touched.
- docs/queens-and-merging.md: §3.3's odour model (a defector carries none of the orphan's odour, so the host's gestalt never moves toward it; a mixed odour needs per-ant odour memory); §3.4's two-strain conflict (the first strain in holds a host); "doubles the stance situations, not the calls" corrected; the owner's answers recorded and the remaining decisions listed as open (§7).
- §28's "not built yet", §30's open `down`, and §36–§38 point here.

### Tests

Each new test fails with its fix reverted (checked one by one):
- `midden.test.ts`: a raiding colony of every age keeps its young in (longest stay at the hole under 5 s, against 58 s reverted; 68 % of the young's samples at the hole reverted); a raid in force gets past a rival's buried midden and in under its hole (0 reverted), and the mark lies over ±3 columns; a corpse past the midden is carried back and buried, picked up once; any number of colonies: raids to the nearest rival (kin skipped), the midden toward the nearest neighbour (reverted: 44 columns out the wrong way). The "shies" test's raider is middle-aged now: the young are no raiders.
- `fungusHome.test.ts`: whose tunnel by the scent where the host stands, three colonies (fails with the nearest hole); crown below a high load kills the queen in minutes, and `regicide` follows the load (fail with the old threshold); `Fungus.menu` is a copy; the nest's odour follows hosts in the royal chamber and not elsewhere (fails with the disc). The four-grounds test lays each shaft's scent (an unscented tunnel says nothing about whose it is).
- `fungalPolicy.test.ts`: the side view has its own fungus cache context.

Full suite: 300 of 300 (`node --test --test-concurrency=2 --test-timeout=600000`, niced); `tsc -b` clean; oxlint 9 warnings, down from 14, all older (8 in colony.ts, 1 in chambers.test.ts); those in `midden.test.ts` and `fungusHome.test.ts` (#27's nit) are fixed.

### Follow-ups

- `ja-yif.2`: crown's pacing (reachable now; should it wait?).
- `ja-yif.3`: fights still resolve through soil (`resolveFights` counts neighbours whatever lies between).
- `ja-yif.4`: the battle dead are never collected past `MIDDEN_NEAR`.
- `ja-yif.5`: during a raid the young follow the royal mark up the shaft (no stays, but ~9 % of samples near the hole on the test map).
- `ja-8fd.3`: the rest of N colonies: `Game` builds two, `unity()` reads two nests, and `foreign` (Bloom's share, cross-laying) is one colony.

## 40. Fix-up F1: ground homing and the side world's generation (2026-11-02)

Held findings from the reviews of #15, #17, #20 and #25, fixed together on top of nest slice 9 (#28), then merged with nest 9 carrying #14's backfill fixes (99eed4b); the numbers below say which. Every new test fails with its fix reverted (each was mutation-checked that way).

**Closes:** #20 B1 (checked: already fixed by doubling Bug2's legs, now tested), #20 B2, #20 S1, #20 S3 / #16's dropped guard, #20's four nits, #25 S8, and from #15 / #17: the walkway through a hole cell, the carrier trapped in a rival's hole, the freeze above the hole, the golden test for `generateSideWorld`, the circular food test, and §27's pile count.

### Measuring: `scripts/side-bench.mjs`

Several earlier PR numbers couldn't be reproduced because their scripts were never committed. This one is. It runs the app's own setup (`generateSideWorld(seed)`, and `Game` with `mulberry32(seed * 7919)`) headless on the local rule, and reports per colony:
- food home, births, ants alive;
- ants out over 120 s (every 10 s from 120 s: mean share and worst sample);
- **foragers holding food over 120 s** (at the end, and the most at any sample), and the longest hold; porters (§34) are counted apart;
- ant-seconds of ants that haven't left their cell for 20 s or more: on the ground; underground exploring (the dead-end tips of #25); the rest underground;
- ants still for 20 s by a hole, and ants still for 60 s, at the end.

It takes a `root`, so one harness measures any checkout: `node scripts/side-bench.mjs 1-6 600 600 2 [root]`.

### The fixes

**Bug2 on the ground tries the other side (#20 B1).** Commit 744dff3 already made each leg twice the last (24, 48, 96 … cells), so a turn back passes where the walk began and tries the far side. The new test walls a carrier's way home with a pillar 20 rows tall, too far round to feel (`GROUND_LOOK`), so it keeps the hand it had: one hand climbs it, the other walks away along the flat ground first. With equal legs that one turns again at the pillar's foot for good; now both get home.

**Far-off vectors (#20 B2).** A carrier whose vector was off by more than about 86 cells never got home: the search kept within `SEARCH_MAX` (80) of the believed hole, and a believed hole past the map's edge was never reached, so the search never started. Now:
- the belief is clamped to the ground's ends (`EDGE`), and the search is centred on the end the ant can reach;
- the search keeps widening, 1.6× a loop, up to the map's width.

Which is faithful to *Cataglyphis*: drift stays per unit of path walked (σ = 0.1 × odometer), and the search is unbounded. The home vector's error grows with the path walked out, winding or not, and the search's spread grows with it (Merkle, Knaden & Wehner 2006: ants that had walked farther searched wider); the systematic search itself has no limit in time, loops widening round where the vector ran out for as long as the ant searches (Wehner & Srinivasan 1981; Müller & Wehner 1994). A cap at 80 cells has no counterpart; scaling drift by distance from home instead would make a long winding trip as exact as a straight one, which it isn't.

Not done: moving the search on after a Bug2 cycle without progress. With the walkway running edge to edge (below) and Bug2's legs doubling, a follow on the ground always ends nearer its belief; the cases measured at the edge were an off-map belief, which the clamp fixes. Moving the search on mid-follow would cut the long legs short, so an ant could never get round an obstacle that needs one.

A lone carrier on seed 2: one ant (`Colony` alone on `generateSideWorld(2)`), put down on the walkway carrying food, its surface vector off by the given cells (`driftSurf × odoSurf`); up to 600 s.

| Vector off by (cells) | Starts (columns from its hole) | Before | After | Search's widest loop after (cells) |
|---|---|---|---|---|
| 30 | 10 | 31 s | 31 s | 50 |
| 60 | 10 | 80 s | 80 s | 129 |
| 80 | 10 | 63 s | 63 s | 81 |
| 90 | 10 | not home in 600 s | 129 s | 206 |
| 120 | 10 | not home | 99 s | 129 |
| 150 | 10 | not home | 208 s | 330 |
| 400 (belief past the map's east end) | 10 | 189 s | 264 s | 528 |
| −90 | −10 | not home | 128 s | 206 |
| −150 | −10 | not home | 199 s | 330 |
| 460 (past the east end) | 410 | 106 s | 234 s | 768 |
| 500 (past the east end) | 434 | 109 s | 230 s | 768 |
| −369 (at the west end) | −320 | 194 s | 116 s | 330 |

The same before and after #14's backfill fixes were merged. Seed 2 has two nests: this ant's hole is at column 329 of 768, the rival's 340 columns east. Before, every error from 90 to 150 cells was never home: the search stayed within 80 cells of the believed hole. The three beliefs past the east end got home before only by luck: at 400 the carrier went down the rival's hole and up again, which reset its vector to exact (#20 S1, fixed here: its search dropped from 50 to 0 as it passed column 340); at 460 and 500 it never searched, and turned back from the map's end on its own after about 45 s. After the fix they search from the end they can reach, and loops widening 1.6× a time need nine or ten loops to come back 400 cells: 230–264 s. That is the price of an unbounded search started at the wrong end of the map, and it is still home.

**Only its own hole resets the surface vector (#20 S1).** `#integrate` reset the vector on surfacing anywhere: up out of the rival's hole, the belief was exactly its own hole. Now only at its own hole.

**The rival's hole (#15).** Two parts:
- **Off the ground line it heads for the chamber only once in its own nest:** in at its own hole, or in tunnels joined to it (the way-out field below). In at another hole it keeps heading for its own and climbs straight back out. The trap no longer reproduced as reported (on the base a carrier put down the rival's shaft got out after about 10 s, when its stall turned it), but it climbs out at once now: 0.2–0.9 s.
- **Walking along the ground it never steps into another hole:** `#towardHole` and Bug2's hand (`#groundHand`) take only walkway cells and the hole it heads for. With a pellet heaped on the rival's rim (the mound may hold a row there), the hole was the only step nearer home by column, and a carrier went in and out of it for 59 s.

**The walkway through a hole cell (#15).** Digging a shaft's top cell took the footing from the walkway cell above the hole's rim where the ground stepped down a row beside it: that cell fell to sky, and the walkway ran on only through the hole, which explorers never step onto. 30 of 100 seeds; the continuity test ran only at small size on seeds 1–3, where it never happened. `digNest` now puts a cell of soil (crust, never dug) under that walkway cell. 0 of 300 seeds break; the continuity test runs at full size over seeds 1–30.

**The freeze above the hole (#17).** A homing ant at the bottom corner of the walkway cell above the hole had its straight step to the hole's centre land in the soil beside it. The blocked step started a wall, the ground line dropped the wall next tick, and the nudge back to the cell's centre only ran for an ant already following a wall: the same blocked step every tick, for good. The nudge now runs on every blocked step by cell. On the bench (600 + 600 ants, 600 s, seeds 1–6), ants still for 20 s or more on the ground by a hole at the end: 1 before (seed 1), 0 after; alone (600 ants, one colony) seeds 2 and 6 had 3 and 1 before. A cut of these fixes without this one froze 21 ants at one tunnel cell on seed 3 (the same blocked step, its wall let go into scent every tick); the same change cures it.

**Dead-end tips (#25 S8).** `#climbOut` stepped greedily toward the hole in a straight line; a tunnel tip just under the ground near the hole is nearer than anything round it, and old foragers (who don't dig) parked there. Now they step by path: a breadth-first field of steps to the colony's hole through its own tunnels (`#outField`), cached per colony and rebuilt when the ground changed (`map.dug + map.filled`), at most every 0.5 s. A cell it doesn't reach steps straight toward the hole as before. Raiders leaving their own nest (#26) use the same `#climbOut`; the midden test's raiders still reach the rival's side (getting in under its hole fails after the merge: see Open).

**Nits (#20).** `#towardHole` uses `#holeMetric`; `#searchOn` resets `bestD` and `stallT`; §30's test text is current; the top-down "keeps no vector" test now gives a carrier a 60-cell vector error and checks it still walks straight home (it fails if `#believe` uses the vector there). It runs on `generateWorld(1, { soil: 0 })`: on the default map soil closes round the nest within 7–11 units, so a first version never found a clear way. The surface-vector test's ant now comes up out of its own hole before walking out: put down on the ground straight from the chamber, it keeps its vector (S1).

**Generation tests (#15).**
- **Golden:** terrain, sky, food, nests and food total of full-size seeds 1–3 are hashed and pinned, like the top-down golden test.
- **Food:** "all food reachable, walking or digging" couldn't fail: the generator drops food it can't reach by digging. The test now walks the map with its own breadth-first search, through open cells only, and checks every pile on the ground can be walked to from the chamber, and that every pocket cell is open and at least 4 rows under the ground line. Neither is ensured by the generator.
- **§27** said three piles per 64 columns; the code has four.

### Measured

**The whole-game guard (#16's, restored).** The last test in `side.test.ts`: seeds 4 and 6, 600 + 600 ants, 600 s; at every 10-s sample from 120 s, at most 2 foragers in a colony holding food over 120 s. Porters are not counted (below). It takes about 3 minutes, so it has its own 15-minute timeout. The seeds were chosen to separate before from after, not to pass: of seeds 1–6, they are the only two where the code before these fixes passes the bound. Lost carriers pile up late, and only with 600 ants a colony, hence the size and length. Most foragers holding food over 120 s at any sample by 600 s, per colony (c0 / c1), from `scripts/side-bench.mjs`:

| Seed | Before (nest 9, 99eed4b) | After (this branch) |
|---|---|---|
| 1 | 0 / 2 | 1 / 1 |
| 2 | 0 / 0 | 0 / 2 |
| 3 | 0 / 1 | 0 / 0 |
| **4** | **4** / 0 | 1 / 1 |
| 5 | 2 / 1 | 0 / 0 |
| **6** | 0 / **3** | 0 / 1 |

Before, none passed 2 until 510 s. The guard fails on 99eed4b ("seed 4: 4 / 0; seed 6: 0 / 3") and passes after (1 / 1 and 0 / 1).

The fixes were first measured on nest 9 before #14's backfill fixes were merged up the chain (af964b1). There the lost carriers were plainer: 6–13 in the worse colony by 600 s on each of seeds 1–6 (seed 4: 0 / 13; seed 2: 8 / 1), and at most 1 after. The backfill fixes slowed the colonies' growth (births 3,827 → 2,479 over the six games), fewer foragers held food that long, and the guard was set again on the merged code.

**Six games, before and after** (`node scripts/side-bench.mjs 1-6 600 600 2`, with the root set to each checkout; 600 + 600 ants, 600 s). Per seed, both colonies: food home and births summed; foragers and porters holding food over 120 s, the most in a colony at any sample; ants out over 120 s, the worst sample's share in either colony; ant-seconds still for 20 s underground (tips and the rest).

| Seed | Food home | Births | Foragers > 120 s | Porters > 120 s | Out > 120 s, worst | Still underground (ant-s) |
|---|---|---|---|---|---|---|
| 1 | 3,892 → 3,808 | 458 → 173 | 2 → 1 | 2 → 0 | 8.5 → 4.5 % | 2,245 → 0 |
| 2 | 2,931 → 4,384 | 158 → 513 | 0 → 2 | 1 → 1 | 11.8 → 1.4 % | 3,482 → 793 |
| 3 | 3,353 → 3,641 | 545 → 286 | 1 → 0 | 9 → 7 | 4.2 → 5.2 % | 970 → 37 |
| 4 | 3,921 → 4,479 | 369 → 602 | 4 → 1 | 8 → 4 | 11.0 → 6.0 % | 100 → 31 |
| 5 | 4,089 → 4,445 | 641 → 632 | 2 → 0 | 3 → 3 | 10.8 → 4.2 % | 4,893 → 269 |
| 6 | 3,684 → 3,864 | 308 → 89 | 3 → 1 | 4 → 0 | 6.3 → 1.4 % | 1,981 → 0 |
| **All** | **21,870 → 24,621** | **2,479 → 2,295** | **4 → 2** | **9 → 7** | **11.8 → 6.0 %** | **13,671 → 1,130** |

- Before is nest 9 at 99eed4b; after is this branch with it merged.
- Still on the ground 20 s or more: 49 → 137 ant-seconds; by a hole at the end, and still for 60 s anywhere: 0 → 0.
- Births swing most from seed to seed. #14's backfill guards' floor regression (§35's open item, for F2) sits under both.
- Before the merge (af964b1 → this branch's first cut, same harness):
  - food home 22,445 → 26,378; births 3,827 → 4,177;
  - foragers over 120 s, most in a colony: 13 → 1, and 41 → 0 at the end over the twelve colonies;
  - still underground 42,758 → 6,467 ant-seconds; still on the ground 498 → 84; by a hole at the end 1 → 0.

### Open, for the next fix-up

- **Two tests fail after the merge with nest 9's backfill fixes.** Both pass on 99eed4b and on this branch before the merge, and neither failing path is code this fix-up changed:
  - homing.test.ts, "a homing ant whose vector is nearly right never searches": 6 of 3,582 samples searching. They are carriers underground, 1.3–1.6 units from a one-cell reception chamber. A bend hides it, so the straight line to it fails `#clearTo`, and with the chamber out of view they walk to their belief (0.4–0.7 off) and start a search (`nest !== goal && … < 1` in the free homing step). The rule predates this fix-up; the one-cell reception in a bend is new to this game.
  - midden.test.ts, "raiders leave their own nest and go in at the rival's hole": 0 raiders get under the rival's hole (at least 3 asked). Nine stand at the step down five columns east of it, then walk east, away from it, with a stale target cell.
  - Undoing this fix-up's blocked-step nudge (above) makes both pass, but the nudge runs only for homing ants, never raiders, so that looks like a different game, not a cause. Lifting the ground walk's no-other-hole rule doesn't help the raid test.
  - Both need a look at the mechanism before any change. A tuned nudge that happens to pass them would be fitting the trajectory.

- **Porters (food flow, §34) on trips they never finish.**
  - Seed 2, colony 1: porters circle a brood chamber about 24 columns away that they never reach.
  - Before the merge, seed 5, colony 1: from 510 s, 41 porters at once held food over 120 s (44 at the worst sample). All were taking it to one store, a single cell 20–31 steps away through tunnels the breadth-first walk finds open, wandering 10–20 columns off it.
  - Reception's food goes to the least-stocked store, and that choice ignores porters already on their way (`#enRouteTo` counts only for wanted chambers). A store nobody reaches stays least stocked and draws every porter.
  - Porters don't use `#climbOut` or the ground-line rules this slice changed. On the merged code the worst porter sample is 7 after and 9 before.
- **Pellet carriers led round by the way-out field.**
  - Before the merge, seed 4, colony 0: up to 97 pellet carriers held their pellet over 120 s, from 180 s to about 450 s. They sat underground 2–4 columns from the hole, in a side tunnel whose field ran 23 steps round to it, and moved cell every second without getting out.
  - With `#climbOut`'s field off (straight steps toward the hole, as before), that game had none. The trajectories differ, so this suggests the cause but doesn't prove it.
  - On the merged code the worst share of ants out over 120 s is 6.0 % after (11.8 % before).
  - Pellet carriers may want the old straight step, or to dig, where the field's way is much longer than the straight distance.

**Jev cost:** unchanged. No situation, legend or question changed.

## 41. Fix-up F2: the nest's economy, its chambers, the mound and backfill (2026-11-02)

Held findings from the reviews of #23 (queen and brood), #24 (food flow), #21 (dug chambers), #16 / #17 (the mound) and #22 (cost), and the regressions #14's backfill guards brought into the nest stack, fixed together on top of nest 9 (#28), then merged with the raids / fungus fix-up (F3, §39) and the homing fix-up (F1, §40) under it. The numbers below are on the merged code unless they say otherwise; "before" is nest 9 at 99eed4b. Owner's decision: more than two colonies is coming, so nothing here assumes two.

**Closes:** #23's blocker, its three should-fix items and nits (queen placement, dead code, `BROOD_RGB`, the test leftovers); #24 items 1–2, its two code nits, and F1's circling porters (§40, open item); #21 items 1–4 and its four nits; #17 items 4 and 5 (5 documented, not fixed), its three maintainability notes, and #16's undocumented regression (§27); #14's floor regressions in the nest (§31, §34, §35's open items), except stacked chambers in every game. #22's cost: no situation, legend or question changed, so no new figure (F3 added `colony-cost.mjs --side`).

### Measuring

Three committed harnesses, each with a `root` argument so one script measures any checkout, all on the app's own setup (`generateSideWorld(seed)`, `Game` with `mulberry32(seed * 7919)`):
- `scripts/economy-bench.mjs`: the long run. Per colony at each checkpoint: workers alive, births, deaths of age, fight losses, food home and its rate, the larder, brood, the queen, floor growth, chambers, ants out over 120 s, ants following food scent underground, porter trips, foragers who handed food on, soil dug / filled / out, loose pellets taken down and carried back. Map-wide: food left on the ground and below it; every fill and dig counted by a hook on the map (floor-ground fills and the rest, and how many of each were dug out again); food conservation every 10 s. Options for the tests' small map or any size, and for scaling the map's food.
- `scripts/floor-bench.mjs`: the crowded-nest test's games, nine by default (world 2 games 4–8; worlds 1, 3, 4 game 4; world 3 game 5, as the merge agent measured), with floor growth, stacked chambers, the depth trend, touching chambers and fills.
- `scripts/roomy-bench.mjs`: the roomy-nest test's games, one by one.

### The economy (#23's blocker)

**Why colonies died.** The review blamed age: `LIFESPAN` 1,800 s, founders up to half a lifespan old, births short of deaths. Measuring found a bigger cause first: **food piled up in a one- or two-cell reception while the larvae starved** (#24 item 2, and the colonies' death). On nest 9, seed 2, two colonies at 1,200 s: reception (1 cell; 2 cells) held 1,332 and 1,631 food, every other chamber 0, 81 and 50 larvae waited unfed, and 0–2 idle ants stood near reception to carry it on. Births were 111 and 80 by 1,200 s, with 2,000 food home; both colonies were dead at 3,600 s with 1,674 and 1,902 food in their larders.

**Food flow, fixed:**
- **A reception is a chamber of at least `RECEPTION_MIN` (4) cells.** Until it has that many, foragers take food to the royal chamber.
- **Porters draw from the royal chamber too**, food beyond the queen's stock (`QUEEN_STOCK`). The royal chamber is where the young and idle are.
- **A forager finding food already waiting at reception** (the porters aren't keeping up) carries its own on to the chamber that wants it most, as a porter (`handedOn`). Foragers drop seeds in the top chambers (Tschinkel & Kwapich); a backlog there is the case it handles.
- **Porters lay no food trail** (#24 item 1). They still lay their chamber's mark, like any ant inside.
- **A porter by a chamber of its target's role that wants food puts it down there.** Road signs are by role, so the brood mark led to the nearest brood chamber, not the chosen one (F1's porters circling a chamber 24 columns away). After `HOLD_MAX` (30 s) carrying, it puts it down in whichever of its chambers it is by, or takes it to the royal chamber; never on a tunnel's floor.
- **The least-stocked store counts porters on their way** (F1's 41 porters at once taking food to one single-cell store).
- A porter's goal is the chamber's cell nearest its centre, not its mean position, which can lie in the soil.

**A worker lives an hour** (`LIFESPAN` 3,600 s, 0.7–1.3× it each; the age bands stay shares of it). Why: with the food flow fixed, a one-colony game brings home 0.5–1.2 food a second late in the hour (table below). At a 30-minute life, a colony at its cap of 900 must bring home 2 a second (900 / 1,800 × 4) to replace its workers; at an hour, 1. So an hour is about the longest life the measured economy can replace. It is a game-scale choice, not a measurement: harvester ant workers live about a year (Gordon), the colony's season; the side view compresses a worker's life to an hour of play. The founders still start up to half a lifespan old, so none dies in a 10-minute game and about 85 % die within the hour, which the long-run test needs to show the turnover.

**Not done: foraging the pockets.** Three quarters of the side map's food is in underground pockets (20,760 of 27,840 on seed 1), and none of it comes home in an hour: tunnels stop 6–15 cells short of the nearest pockets by 600 s, and a roomy nest barely digs. Once the ground's piles thin out, the colony lives on its larder. Bead `ja-p0k`.

**Measured** (app map, 600 ants a colony, to 3,600 s; seeds 1–2; before → after):

| | Seed 1 | Seed 2 |
|---|---|---|
| **One colony:** workers at 600 s | 767 → 900 (the cap) | 622 → 900 |
| workers at 3,600 s | 203 → 878 | 0 → 810 |
| births by 3,600 s; died of age | 497, 894 → 924, 646 | 24, 624 → 858, 648 |
| food home by 3,600 s; its rate over the last 600 s | 3,869, 0.16 / s → 4,542, 0.71 / s | 2,694, 0.00 → 3,656, 0.46 |
| food lying in the nest at 3,600 s; larvae waiting | 1,700; 54 → 773; 6 | 2,532; 32 → 92; 53 |
| **Two colonies** (colony 0 / 1): workers at 600 s | 868 / 666 → 846 / 627 | 694 / 659 → 712 / 837 |
| workers at 3,600 s | 20 / 0 → 842 / 0 | 0 / 0 → 0 / 652 |
| births by 3,600 s | 452 / 200 → 1,115 / 397 | 117 / 80 → 416 / 907 |
| lost in fights by 3,600 s | 564 / 684 → 563 / 997 | 9 / 8 → 1,016 / 529 |
| food home by 3,600 s | 3,753 / 1,888 → 4,487 / 1,613 | 2,348 / 2,330 → 1,731 / 3,846 |

- Before, every colony with a queen that no fight destroyed died of old age, with its food lying in the nest (one colony, seed 2: 2,532 food and 32 waiting larvae, no worker left). After, every such colony holds 650–890 workers at 3,600 s.
- On both seeds' two-colony games one colony is destroyed in fights by 1,800 s (about 1,000 lost), the other survives the hour. See Open.

**The long-run test** (`economy.test.ts`). The full game takes about 10 minutes to run an hour, too slow for the suite. The test runs the tests' small map (256 × 160) with one colony of 110 ants (165 at most) and 0.3 of the map's food, about the full game's food per ant (2,190 for 110 founders; 27,840 for 1,200 there). It asserts that most founders died of age (at least 0.6 × 110), births at least matched those deaths, no more than 5 larvae at once waited over two minutes unfed with food enough lying in the nest, and the colony holds its size (at least 110 at 3,600 s). On this branch: 152 workers, 167 born, 125 dead of age, and no larva waited two minutes until the last minute (2, with the larder down to 33). With `LIFESPAN` 1,800 s: 20 workers (it fails). With the old food flow: 130, and from 2,940 s up to 30 larvae unfed for over two minutes beside 117–200 food (it fails). On nest 9 the same game is dead by 3,000 s. About a minute to run.

**Food conservation is tested** (`food.test.ts`): map food + food in jaws + larder + Σ brood (1 + fed) + 4 × births equals the map's food, every 5 s of a two-colony game, to 10⁻⁶ (it fails with an egg charged twice). The bench checks the same on every run: drift at most 2.5 × 10⁻⁹ over an hour.

### Food scent underground (#24 item 1)

Mean ants following food scent underground at 600 s, both colonies: seed 1, 144.8 / 126.8 before → 25.2 / 37.8 after; seed 2, 119.6 / 141.1 → 56.4 / 14.0 (colony 0 / 1). The rest are ants following foragers' trails up the shaft to food outside, which is what the trail is for.

### Chambers (#21)

- **Chambers never join.** A chamber face is judged again when it is dug (`#chamberDug`): if it would touch another chamber, lie outside its chamber's two rows, or lie too near the ground, it stays a plain tunnel. A face an ant was walking up to is forgotten when its mode changes and in `#homeAfresh`. A stale face is dug only while the nest is crowded.
- **No chamber cell less than `CHAMBER_MIN_DEPTH` (8) rows under the ground**, every widened cell, measured from the ground as dug (under the mound's loose soil: `#soilTop`), not the mound's top. The new two-colony test (two small worlds, 200 + 200 diggers, 200 s) checks both; it fails with the depth rule reverted (a cell 7 rows down at 80 s). It does not fail with the join re-check reverted: no join happened in eight small two-colony worlds over 400 s, nor on the app map's seeds 5 and 1 over 600 s. Bead `ja-jn2`.
- **The depth profile is imposed, not emergent** (item 4): §31 and the test now say so.
- **Nits:** `#chamberFace` and `#chamberSpot` hold the face checks once; the crowded-builder predicate is computed once; `openCell` is one function per map; a chamber's span shrinks when an end cell leaves it (`y0`/`y1` are kept for that).
- **§31's numbers, re-measured** (item 3): see the correction under §31's table.

### Backfill and chambers (#14 merged into the nest)

- **Soil put back under a chamber cell stays** (`builtFloor`, part of `refilled`): it is never dug again, however long ago it was filled. Over 1,200 s (world 2 games 4 and 5, world 4 game 4), floor-ground fills dug out again: before, 4 of 32, 0 of 21, 7 of 15 (11 of 68, 16 %) against 10 of 459 other fills (2 %); after, 1 of 42, 0 of 28, 1 of 28 (2 of 98, 2 %) against 44 of 861 other fills (5 %). The two left are cells beside a chamber on its floor row, which aren't kept: that is where chambers widen. Floor at 1,200 s: ×1.56–2.50 before, ×2.75–3.13 after.
- **Floor growth is back** (§34, §35): in the crowded-nest test's nine games at 240 s, ×2.06–2.94 (mean 2.43) against ×1.13–2.38 (mean 1.90) before and ×2.4–3.4 (mean 2.96) before #14; stacked chambers 2–8 (mean 4.9; 1 of 9 under 3) against 1–8 (3 of 9 under 3). What brought it back is mostly F1's homing fix-up merged in: pellet carriers leave the nest by the tunnels' way out and get back to digging sooner. The porters were not the cause §34 suspected.
- **A construction zone, tried and dropped.** Letting soil dug lately be put back within 2 cells of the colony's chambers (exempt from `BACKFILL.young`), so a crowded nest's diggers put their widening's soil away near it: floor ×2.06–3.19 (mean 2.65) but stacked chambers mean 3.9, against 4.9 without. Bead `ja-stk`.
- **The crowded-nest test's bounds:** floor at least ×2 in every one of its three games (restored, as before #14; it was a mean of ×1.6); stacked chambers a mean of at least 3 over its games (kept: at least 3 in every game, as before #14, fails in world 2 game 4, the test's first game, with 2). On nest 9 the per-game floor bound fails (world 2 game 4: ×1.13). The greater bounds a first pass relaxed (floor over ×3, at least 4 stacked) aren't met: mean ×2.43, and 2 stacked in one game.

### The mound (#17, #16)

- **`LOOSE_DIG` removed** (item 4): it never ran, as the ground under the mound is crust. Loose soil is never dug; `takeLoose` takes only a column's top (its settling branch never ran either).
- **Loose pellets taken down to backfill mostly come back** (item 5): 92–97 % of them at 600 s (one colony, seeds 1–2: 791 of 861 and 1,002 of 1,043 carried back; two colonies: 92–97 % in each of the four), and 99 % over an hour (11,449 of 11,603 and 13,509 of 13,663), against the review's 60–90 %. The causes are #14's youth guard (nothing dug in the last 200 s is filled), and the shaft and chamber smelling busy. Two fixes were tried and dropped: restarting the carrier's trip clock at the hole (95 %) and a stale walk out from the chamber (91 %). Documented as the rule the owner asked for, with its cost; bead `ja-lft`.
- **One pellet state** (maintainability): what a pellet is and where it goes is one per-ant value (`#soil`: dug, loose going out, loose going down to fill), and `#clearPellet` puts the pellet and all its state down at once, in every place that did it by hand.
- **The mound is counted on the map** (`map.moundCells`): ants pick up any colony's spoil, so a colony's own count went negative. The tests check each colony's flows (soil out × `SWELL` − taken off + put back) sum to it.
- **The UI's "dug / mound / filled" adds up:** filled is dug soil put back, so dug = mound + filled + in jaws + lost; loose pellets put back underground show after a "+".
- **#16's one-colony regression** is now in §27.

### #23's and #24's smaller items

- `#broodGoal` is gone (`#chamberGoal`); the owed-food loop is `Brood.owed()`; `isFed(b)` and `LARVA_FOOD` live in `brood.ts`; `STAGE_NAMES` and `Brood.remove` are gone.
- The queen lies on the royal chamber's floor (tested on four maps, both colonies).
- `#port` guards a colony with no chamber to take food to; `feed()` throws rather than drift the larder from the chambers.
- `BROOD_RGB` and `HOME_RGB`'s comments are back over their constants; `queen.test.ts`'s leftovers are gone.

### Tests

New or changed, each failing with its fix reverted (mutation-checked): the reception minimum, the hand-off, porters drawing from the royal chamber, porters laying no food trail, food conservation, `builtFloor`, a chamber's span shrinking, the queen on her floor, the two-colony depth rule, and the long-run test (two ways, above). The crowded-nest floor bound fails on nest 9. The mound tests read the map's count.

### Open

- `ja-p0k`: forage the pockets. `ja-lft`: loose-fill round trips. `ja-jn2`: a direct test for the join re-check. `ja-stk`: three stacked chambers in every crowded game. `ja-war`: one of two colonies falls in fights.
- Two colonies: on seeds 1 and 2 one colony is destroyed in fights by 1,800 s (997 and 1,016 lost), while the other holds 842 and 652 workers to 3,600 s. Fights and raids are F3's (§39); what the economy changes is that colonies now reach their cap with food to spare, which the strategist reads as a full larder (raid). Bead `ja-war`.
- The `HOLD_MAX` paths (a nurse's and now a porter's) still have no test.

**Jev cost:** unchanged. No situation, legend or question changed.

## 42. Behaviours as responses, tuned by assays (behaviour MR 0–1, 2026-11-02)

The plan (beads ja-eyk … ja-6df; the design is from `claude/fungus-behavior-palette-qg2n9p`, ported to this colony by #30's review): turn each hard-coded ant mechanic into a **response** to what the ant senses, with today's rule as the default. Then tune one behaviour per MR against **assays** whose targets come from published ant behaviour. MR 0 builds the harness and measures today's ants. MR 1 puts the responses in with no behaviour change, and asks Jev the response questions once, live.

### 42.1 The harness (MR 0)

- **One seeding scheme.** `game.gameRng(seed, generation)` is the page's `mulberry32(seed × 7919 + generation)`. The page, `runGame`, `colony-cost --side` and `colony-live` use it, so a number measured offline reproduces on the page with the same seed (ja-jdu; §9's old figures stay as measured). The benches (`colony-bench`, `side-bench` and the like) keep their own inline seeding on purpose: their `root=` option measures older checkouts, which have no `gameRng`. The same goes for tests that build a game directly.
- **`colony/experiment.ts`**:
  - `runGame` builds the page's side-view game by default, or any map. It takes `Sides` (each colony's policy, strategist, params and responses), scripted events (paint, add food, any call) and probes.
  - Probes: `heldProbe` (foragers holding food over 120 s, as `slow/side.test` counts them), occupancy of regions, and ants near a spot. `heldProbe` and assay G deliberately repeat `slow/side.test`'s measure and bound (≤ 2), so a sweep and the guard agree.
  - Arenas are top-down hex maps drawn in cell coordinates (`Arena`); probes and events work in world units.
- **Tunable at today's values:** pheromone channels per colony (`colony.channels.food.evaporation`, merged per channel and field), `enemyRange`, and the second colony's params and brains.
- **`npm run exp -- <assays|all> [--seeds 1-10] [--set colony.deposit=2,4,8 …]`** runs the cross product of every `--set` over the seeds in worker threads. It prints the median, min and max of each metric with the pass count, and can write JSON.
- **Golden masters**, recorded on main before any of this. Each checks every 10 s: stored, births, losses, decisions, population, and a bit-exact hash of every ant.
  - `tests/golden.test.ts` (~19 s): a side-view game and a top-down war with alarm.
  - `tests/slow/golden.test.ts` (~2 min): a 600 s side-view war with fights and brood births.
  - MR 0 and MR 1 pass both unchanged. A change meant to alter behaviour re-records them (`GOLDEN_WRITE=1`) and says so.
- **The gate.** `tests/assays.test.ts` (fast) has what today's ants pass: A3 and A4 on two seeds, plus seeding and overrides. `tests/slow/assays.test.ts` holds the assays they fail as `todo`, each naming the MR meant to fix it.

### 42.2 Baseline: today's ants on main, seeds 1–10

`npm run exp -- all --seeds 1-10`: 90 runs, 18 min on 3 threads.

| Assay | Target | Pass | Median (min–max) |
|---|---|---|---|
| A1 double bridge (Goss et al. 1989) | ≥ 80 % of branch traffic on the short branch | 0/10 | short share 0.49 (0.40–0.59) |
| A2a twin sources (Beckers et al. 1990) | the busier source ≥ 70 % | 0/10 | 0.52 (0.51–0.54) |
| A3 depletion | the crowd < 20 % of its peak within 60 s of the last food | 10/10 | 41 s (29–48) |
| A4 alarm on a trail | scatter ≤ 50 % in 10 s; back ≥ 50 % within 60 s | 10/10 | scatter 0.00; back in 19 s (19–21) |
| A5 regulation (Gordon; Pinter-Wollman et al. 2013) | out before food ≤ ½ out after | 0/10 | 0.97 out before, 0.90 after |
| A6 2-cell pass vs open (Lymbery et al. 2023) | report only | — | exchange 1.05 (0.57–1.67) vs 0.92 (0.59–1.27) |
| G side-view game, 600 + 600, 600 s | ≤ 2 foragers holding food over 120 s per colony | 10/10 | held 1 (0–2); food home 9 % / 6 % |
| G′ top-down game (`OPEN_WORLD`) | report only | — | held **10 (4–131)**; food home 13 % / 12 % |

- **A1 depends on the arena's shape.** On these hex arenas the short branch gets half the traffic. The palette branch's square arena gave 0.67, and a 60×40 bridge there gave 0.87 (ja-dez). Settle the arena before tuning trails against it (MR 3).
- **A3 and A4 pass:** the trail evaporates, and *tired* sends ants home.
- **A2a and A5 fail by design:** nothing breaks the symmetry between sources, and every ant is always out. MRs 3 and 5 address them.
- **A6:** a 2-cell pass already tilts the exchange slightly toward the defenders. MR 4's terrain-limited combat is still the plan.
- **G′ is new:** the top-down map strands carriers that the side view, since F1 (§40), does not. The worst seed had 131 foragers holding food over 120 s (ja-9uj).

### 42.3 Response hooks (MR 1)

`colony/responses.ts`: each hook is a function of a small `Touch`. A Touch is mode × carrying (none, food, soil, corpse or brood) × porter × digging × at nest × enemy × stance. `localResponses` are main's rules before the hooks:

| Hook | Called | Local rule |
|---|---|---|
| `get` | touching food, jaws empty | take it, unless fighting |
| `carry` | every step while carrying anything (the mode policy is not asked then) | `return` |
| `drop` | carrying food where it goes: the larder on a top-down map, the chamber in the side view | yes |
| `trail` / `trailRate` | every step | food when carrying food; nothing for soil, corpses or porters; else home; × 1 |
| `alarmGain` | smelling alarm | 0 fighting or digging, else 1 (× `alarmAvoid`) |
| `raiseAlarm` | in a fight | 1 (× the fight's alarm rate) |

- The fungus's modulations (`layGain`, `quiet`, `crossLay`, `gainAlarm`) and REST stay outside the hooks. They scale what a response decides.
- Soil, corpse and brood pickups stay mechanics for now (MR 2).
- **No behaviour change, and no cost:**
  - both golden masters pass bit for bit;
  - `colony-bench`, 600 + 600 side view: 4.92 ms/tick on main, 4.90 with the hooks, with identical food stored and soil dug.
- **Jev.** `get`, `carry`, `drop` and `trail` each have a lane in `colonyBrain.ts`: a packer, `RESPONSE_LEGEND`, `readResponse` (a noul is yes strictly above ½), `responsesFromAnswers`, and a context per hook and doctrine. They sit under their own `RESPONSE_BRAIN_VERSION` 2. It became 2 after review, when the legend's "within two steps" became "within the colony's enemy range", since `enemyRange` is now tunable. The page does not ask them.
- **Mode lane:** its schema, legend and `COLONY_BRAIN_VERSION` (4) are unchanged, so tokens per ant are unchanged. `colony-cost -- --side 5 600 1` gives ~581 tok per question and $0.091/h.
- **Response lanes, if asked:** get ~553, carry ~441, drop ~581 and trail ~318 tok per question, about $0.027/h more.

### 42.4 Live check and replay (2026-11-02)

`scripts/colony-live.mjs`:
- runs one headless game, the page's side view (seed 1, 600 + 600, 300 s, alarm painted about every 20 s);
- collects every distinct situation of each lane;
- asks Jev each one per doctrine through the server's `JevClient`, in requests of up to 100, under a hard budget;
- saves one cache per doctrine, with the brain versions and every lane's cache context it was asked under, and the game it played (seed, ants, seconds, view);
- if a request fails, it stops and still writes what was already paid for.

`npm run exp -- … --policy cache:<file>` replays a cache offline. It refuses a cache asked under other versions or other contexts (a legend or question edited without a version bump, or another doctrine), and reports cache hits per lane, so each result says how much of it was Jev. `colony-live --from <cache>` is a second round: it replays the cache's own game and asks only the situations the replay met that the cache lacked. The caches measured below were asked under `RESPONSE_BRAIN_VERSION` 1; they no longer replay against the code, which is as intended.

**Spent: $0.0036** (87k input tokens: round 1 $0.0033, the Forage second round $0.0003).

| Lane | Situations | Est. tok/q | Real tok/q | Agrees with local: Forage | Cautious | Warlike |
|---|---|---|---|---|---|---|
| mode | 91 | 237 | 199 | 75 % | 74 % | 56 % |
| stance | 2 | 389 | 400 | 100 % | 100 % | 50 % |
| get | 3 | 269 | 256 | 100 % | 100 % | 67 % |
| carry | 14 | 268 | 224 | 79 % | 79 % | 71 % |
| drop | 3 | 294 | 270 | 33 % | 33 % | 33 % |
| trail | 14 | 216 | 195 | 36 % | 29 % | 36 % |

- Real tokens are 0.84–1.09× the estimate.
- Three hundred seconds of the side view met no alarm and no raid situations. For doctrine-following on alarm and raids, see the top-down live run on #30: Cautious sent ants home on alarm in 71 of 78 situations, and Warlike sent every raid-stance explorer to fight.
- Here, Warlike goes home tired in only 22 of 38 situations (Forage and Cautious: 38 of 38), and picks "raid" for a full colony.

**Replayed, Jev's answers break foraging.** The Forage cache after its second round answers 95–100 % of lookups.

| Replay (median) | Local | Forage | Cautious | Warlike |
|---|---|---|---|---|
| G side view, seeds 1–5: food home, you / rival | 9 % / 6 % | 2 % / 5 % | 1 % / 8 % | 1 % / 7 % |
| G: foragers holding food over 120 s (bound 2) | 1 | 92 | 57 | 86 |
| A2a twin: food home | 37 % | 0 % | 0 % | 0 % |
| A5: out before food | 0.97 | 0.64 | 0.83 | 0.90 |

An ablation on the side-view game (seed 1, 300 s, Forage's answers; food home under the local rule: 1,074):

| Replayed alone | Food home | Held over 120 s |
|---|---|---|
| mode answers | 624 (−42 %) | 0 |
| … minus the 16 answers "a fresh returner: return" | 1,115 | 0 |
| carry answers | 728 (−32 %) | **56** |
| drop answers | 1,195 | 0 |
| trail answers | 1,269 | 0 |

- **ja-qnx, live on main:** Jev keeps returners returning ("fresh returner → return": 14 of 15 situations under Forage and Cautious, 15 of 15 under Warlike). §32's REST sends a resting ant out after 10 s, but the ant is sent home again as soon as it is asked. Without those answers, foraging is back to the local rule's level. The fix is still a mechanic or a change of meaning.
- **Carry answers strand food:** Jev tells some carriers to explore, follow or fight. This is where the held food comes from. Turn the carry lane on only with the food's destination in its question (ja-1pm).
- **The drop question misreads the side view:** food is put down in a chamber, which is outside `atNest` (the hole's radius). So Jev is asked "carrying food, out: put it down?" and says no in 2 of 3 situations. It did no harm in 300 s, but `Touch` needs an "in its chambers" notion before drop is asked live (ja-1pm).
- **Trail:** explorers are told to lay nothing (5–7 of 14 views, ja-68l.8). On the side view this cost nothing in 300 s; on the palette branch's top-down bridge it halved food home.

## 43. Get, carry and put down; a trip home ends at home (behaviour MR 2, ja-mz7, 2026-11-03)

MR 2 was planned as "get/drop by item, carrying no longer forces going home, nest rooms, nest flow (A8), food conservation". `main` had since built the nest rooms: reception, stores, brood, the queen's chamber, porters, births from brood (§32–33, §41). So MR 2 became the responses for picking up, carrying and putting down every kind of load, and the two fixes §42.4 found Jev needed: ja-qnx (returners never stop returning) and ja-1pm (carriers told to wander with food).

### 43.1 What an ant touches (no behaviour change)

- **Stronger goldens (ja-2x2).** Each 10-s sample now also hashes every colony's pheromone fields and the map's food. `trailRate × 1.000001` passed before; now it fails at 10 s on both fast scenarios.
- **`Touch.place`** replaces `atNest`: out, hole (the nest's mouth, or the nest on a top-down map), tunnel (its own) or chamber (its own). The drop question was being asked of a forager in its chamber as "out" (ja-1pm).
- **`Touch.offered`**: what `get` is offered. Loose soil off the mound, corpses (the undertaker) and brood (the nurse) now ask `get`, after their mechanic's own draw. The local `get` takes food unless fighting and leaves the rest to those mechanics, so the goldens stayed bit-exact.
- **`heldProbe`** also reports `maxCarrying`, counted by its own clock from pickup to put-down. The colony's `since` resets every tick at the nest, so a carrier refusing to put food down there was invisible.

### 43.2 Carry: take it or put it down (ja-1pm)

`carry` answers **take** (where the load belongs, going home) or **put down** (here), no longer a mode. Told to explore or fight with food in its jaws, a carrier stranded it: 56 held food over 120 s in §42.4's replay.
- **Put down** (`#putDown`):
  - Food goes on the map, where anyone may take it. A porter's food goes only into one of its chambers, where it is stocked: it was already counted home.
  - Soil and corpses only on the ground (soil heaps there; a corpse lies there, or goes on the midden if it is there).
  - Brood where the ant stands.
  - What can't be put down here is kept. A forager doesn't take up **food** it has just put down until it has stepped off that cell. Brood and corpses have no such guard: with brood always answered "put down" over 300 s, 537 put-downs met 537 re-takes, with no tight loop (review of #35).
- **The question** names each load's destination: food home into the nest for the larvae and stores, a porter's to the chamber that wants it, soil to the mound, a corpse to the midden, brood to a brood chamber.
- **Deferred:** "drop and run" on contact goes to MR 4 (ja-902), and taking food to a rival's entrance to MR 5 (ja-um8).
- **Food conservation** (`food.test`) also runs with every 40th food carry answered "put down" (foragers out and in tunnels, porters in chambers): no drift. If a porter's food isn't stocked when put down, it drifts by 235.

### 43.3 A trip home ends at home (ja-qnx)

Jev reads the mode as "keep doing this": every ant whose mode was `return` was told `return`, home or not (Cautious and Warlike: 23 of 23). Asked as explorers or followers, fresh ants inside the nest were told explore or follow. Nothing ended the trip, and in the side view's chambers not even REST did, since it runs only at the hole. Colony param `arrive` (default `explore`; `return` is the old behaviour):
- **A fresh forager returning with empty jaws that gets home stops returning** and is asked afresh as an explorer. Home is the nest on a top-down map. In the side view it is the royal chamber, where a returner homes to, and only for the old (the foragers, zoned by age).
- **A tired one stays in, in the side view only.** On a top-down map the nest resets the timer the moment the ant arrives, so every returner there reads fresh and goes out at once (review of #35). That is the timer artefact ja-q47 replaces.
- **A load put down anywhere ends the carrying trip.** The ant is asked as a follower. For a fresh ant the local rule answers that exactly as it answered a returner (a trail is followed; no trail, explore), so the local colony is unchanged there.

Each narrowing was forced by a measurement:

| Version | What broke | Measured by |
|---|---|---|
| any chamber ends a trip | the young left the queen's side | `zoning.test` |
| every age, resting on arrival | porters (young, middle-aged) went out; the queen starved on 1–2 of 4 worlds | the hour-long economy run |
| the hole ends a trip too | explorers followed the carriers' scent into the nest (120–145 followers inside against ~35) and jammed carriers | A8, 600 s whole games |
| tired foragers rested on arrival | the colony's retired foragers went out again; more food than the porters could carry piled up at reception | A8 |
| a put-down ends as an explorer | the middle-aged diggers stopped following the food trail down to reception, where they port: 30–37 % of the nest's food carried on (main 87–100 %) | A8 seeds 5–6 |

**Replay of the paid mode answers** (mode lane v4, unchanged), side view, 600 + 600, 300 s, seeds 1–10, food home by the first colony. Today's local rule on `main`: 10,903.

| Answers | Before the fix | `arrive` explore (shipped) |
|---|---|---|
| local | 10,903 | 11,171 |
| Forage | 9,037 | 9,995 (92 %) |
| Cautious | 6,247 | 7,812 |
| Warlike | 5,631 | 7,236 |

Arriving as a follower did worse under Jev (Cautious 5,928, Warlike 6,254): Jev sends followers at home home again.

**The local colony** (seeds 1–8 against `main`):
- 600 + 600, 600 s: the most foragers holding food over 120 s per colony is 0–3 (`main` 0–2). The guard's seeds 4 and 6: 0 / 0 and 1 / 0. Food home 32,472 (`main` 31,609).
- A8 (below): food home 16,167 (`main` 16,964).
- The hour-long economy run (`slow/economy.test`'s setup) on worlds 1–8:
  - at the test's seeding: one collapse (world 3); `main` has none, but 2 worlds fail its stranded-larvae bound;
  - with each seed nudged by 1: `main` fails 4 of 8 (2 collapse), this branch 2 of 8 (2 collapse).

  The colony's economy is on a knife-edge when the young run out: only young and middle-aged explorers port food to the queen. That predates this MR (ja-xu6).
- Warlike's answers ignore tiredness, and with the parked returners gone their mill shows: on seed 3, 29 carriers were held at the shaft top (ja-3sy).

**Speed** (review of #35):
- As first pushed, the side view ticked about 11 % slower (the reviewer's `colony-bench 600 60 1`, two colonies: 3.58 against 3.96–4.00 ms). Every carrier built a Touch every step to hear the local "take", and `place` was worked out for every ant's trail call.
- **Fixes:**
  - the local carry response isn't asked;
  - `Touch.place` is worked out only when a response reads it;
  - the own-nest check no longer builds an array.
- **After**, interleaved with `main` on one machine: medians 2.88 / 2.90 / 3.03 / 2.42 ms against `main`'s 2.86 / 2.91 / 2.72 / 2.79. Food and digging are identical.

**What an ant senses here** (vision.md):
- `Touch.place` and the end of a trip read the chamber's role through `#perceivedPlace`, so the fungus's muddling acts on them.
- Telling its own nest from a stranger's still reads the other colonies' hole positions (`#inOwnNest`).
- The arrival rule's age gate is scripted by age.
- Both are now rows in the gap table (ja-k4k.2, ja-k4k.1).

### 43.4 A8: the nest's food flow (report only)

Harvester foragers drop seeds only in the top chambers, and other workers carry them down in stages to the seed chambers (Tschinkel, Rink & Kwapich 2015, now cited in docs/nest-and-home.md §3.5). No transport rate could be read in this session, so A8 has no pass mark. `npm run exp -- nestFlow` (one colony, 600 ants, 900 s) reports:
- `beyond`: the share of the nest's food carried on past reception, from 300 s on;
- reception's largest pile;
- larvae unfed beside food (the economy test's measure);
- the first birth, and porter trips.
- **Seeds 1–10 (local):** `beyond` median 1.00 (0.67–1.00); reception's largest pile median 1 (0–214); at most 9 larvae unfed beside food on one seed.
- **`main`, seeds 1–8:** `beyond` 0.87–1.00, larvae unfed 0–18.

### 43.5 Assays, seeds 1–10 (local rule, against §42.2)

| Assay | §42.2 | MR 2 |
|---|---|---|
| A1 double bridge | 0/10, short share 0.49 | 0/10, 0.48 (0.39–0.60) |
| A2a twin sources | 0/10, 0.52 | 0/10, 0.52 |
| A3 depletion | 10/10, 41 s | 10/10, 39 s (25–49) |
| A4 alarm | 10/10, back in 19 s | 10/10, back in 19 s (19–20) |
| A5 regulation | 0/10, 0.97 / 0.90 | 0/10, 0.97 / 0.91 |
| A6 pass / open | 1.05 / 0.92 | 1.05 / 0.92 |
| G side view | 10/10, held 1 (0–2), food home 9 % / 6 % | 9/10, held 1.5 (0–3), 9 % / 7 % |
| G′ top-down | held 10 (4–131) | held 10 (6–136): carriers there still only take (ja-9uj) |
| A8 nest flow | — | `beyond` 1.00 (0.67–1.00) |

**Held-out seeds 11–20:**
- G passes 10/10: held 1 (0–2), food home 9.5 % / 6.5 %.
- A3 passes 10/10: 38 s (4–52).
- A4 passes 10/10: back in 19 s (19–22).
- A8: `beyond` 1.00 (0.75–1.00), at most 2 larvae unfed beside food.

### 43.6 Live check and replay (2026-11-03)

`colony-live.mjs mode,stance,get,carry,drop` on the side view (seed 1, 600 + 600, 300 s), then a second round per doctrine (`--from`). **Spent $0.0057** (139k input tokens).

| Lane | Situations | Real tok/q | Agrees with local: Forage | Cautious | Warlike |
|---|---|---|---|---|---|
| mode | 141 | 201 | 69 % | 65 % | 65 % |
| stance | 4 | 282 | 50 % | 50 % | 75 % |
| get | 14 | 147 | 64 % | 50 % | 43 % |
| carry | 35 | 212 | **100 %** (was 79 %) | **100 %** (79 %) | **97 %** (71 %) |
| drop | 5 | 219 | **100 %** (was 33 %) | **100 %** (33 %) | **100 %** (33 %) |

- **get:** Jev declines loose soil off the mound in 4–8 of 14 situations.
- **Warlike's only carry disagreement:** put food down out on the ground when raiding.

**Replayed** (`npm run exp -- game twin regulate nestFlow --policy cache:…`, seeds 1–10; the second colony is local):

| | Local | Forage | Cautious | Warlike |
|---|---|---|---|---|
| G food home, you / rival | 9.2 % / 6.5 % | 5.8 % / 9.6 % | 4.0 % / 8.3 % | 0.7 % / 8.5 % |
| G held over 120 s, most (§42.4: Forage 92) | 3 | 3 | 1 | 2 |
| A2a twin, food home (§42.4: 0 % under every doctrine) | 37 % | 38 % | 38 % | 33 % |
| A5 out before / after food | 0.97 / 0.91 | 0.97 / 0.90 | 0.97 / 0.90 | 0.97 / 0.90 |
| A8 `beyond`; food home | 1.00; 2,129 | 1.00; 1,663 | 0.99; 1,173 | 1.00; 29 |

- **Stranding is gone:** under Forage, held carriers fall from 92 to 3 and the twin arena forages as the local rule does.
- **Forage still brings home 62 % of the local rule's food over 600 s.** Ablation on G, seeds 1–5, one lane at a time (local 10,974):
  - carry and drop are bit-identical to local;
  - modes 8,095 (−26 %);
  - stances 9,049 (−18 %: Jev keeps foraging where the local strategist raids);
  - get 9,881 (−10 %).

  Which answers cost the food is ja-5ty. Warlike's 0.7 % is its own mill (ja-3sy).

**Cost** (`colony-cost --side 5 600 1`):
- **Mode lane:** ~546 tok per question, $0.092/h, unchanged.
- **Response lanes, if asked:** get ~650, carry ~531, drop ~708, trail ~361 tok per question, about **$0.060/h** more (MR 1: $0.027/h). The legend now explains places, offered items and the carry answers. The page still asks none of them.

**Beads:**
- **Closed:** ja-qnx (parking: fixed; residual cost in ja-5ty), ja-1pm, ja-2x2, ja-mz7.
- **Filed:** ja-xu6 (the economy's knife-edge), ja-3sy (Warlike's tiredness), ja-q47 (tiredness as a body state), ja-5ty (Forage's residual cost).
- **Notes added:** "drop and run" on ja-902, loot to a rival's entrance on ja-um8.

## 44. Which of Jev's answers cost the food; tiredness as a body state (MR 3.1, ja-5ty, ja-q47, 2026-11-03)

Stacked on behaviour MR 2 (§43). Two findings from it:
- Forage's answers, replayed over a 600 s game, brought home 62 % of the local rule's food (ja-5ty).
- "Tired" was a timer that only the hole reset, so the colony's tired foragers retired inside and the young were "tired" within a minute (ja-q47).

### 44.1 Which answers cost the food (ja-5ty)

`scripts/ablate.mjs <cache>` groups a cache's answers that differ from the local rule by lane, by the ant's mode (or the colony's stance), and by local → Jev. It replays an assay once with all of Jev's answers and then once per group, with that group put back to the local rule. Offline, no spend.

The cache is MR 2's Forage cache (mode lane v4, response lane v3), committed as `experiments/caches/mr2-forage.json`. Its README gives the commit it replays at (c168ce2): later code is at v5/v4 and refuses it (review of #36).

**Screen** (side view, 600 + 600, 300 s, seeds 1–5): all of Jev 4,846, local 5,598 (Jev 87 %). 57 answers differ, in 16 groups. Every raid-stance group changed nothing: Jev's own stance answers keep Forage out of raids, so those situations never arise.

**Confirmed** (600 s, seeds 1–10): all of Jev 14,594, local 23,704 (Jev 62 %).

| Group (answers) | Δ food home reverted | What it is |
|---|---|---|
| get: offered loose soil, take → no (2) | **+1,219** | Jev leaves loose soil on the mound. Spoil isn't spread and the hole fills: a legend gap (what soil is for) |
| mode: fresh returner, follow → return (4) | +408 | a fresh ant at home told to go home: ja-qnx's question again, now asked of followers. A legend gap (what return means at home) |
| get: offered brood, take → no (2) | +383 | nurses leave eggs and strays lying; larvae are fed only in a brood chamber: a legend gap |
| stance: raid → forage (2) | +204 | doctrine: Forage raids "only when food runs out" |
| mode: explorer on a faint trail, explore → follow (7) | +196 | doctrine: Forage says to follow food scent |
| mode: fresh returner, explore → return (2) | +139 | as follow → return |
| mode: follower, explore → return (1) | +84 | as above |
| mode: raid-stance returner, follow → return (2) | −118 | — |

- **The groups' rows sum to 2,515 of the 9,110 food.** The rest is the answers interacting: whole lanes reverted (§43.6) are −26 % for modes and −18 % for stances.
- **The legend gaps get legend fixes in §44.2:** what soil, corpses and brood are for, what tired means, and that a fresh ant at home has finished its trip.
- **The doctrine ones stay.** Forage not raiding, and following faint scent, are what its doctrine asks.

### 44.2 Tiredness as a body state (ja-q47)

The basis is `docs/tiredness.md`:
- trip length is set by search time, not distance;
- foragers rest inside between bouts;
- 25–50 % of workers are inactive at any time.

**Before:** tired = `since > patience × clock`. Underground nothing reset `since`, so every inside worker was "tired" within a minute and a tired forager stayed tired. The colony's tired foragers retired inside for good.

**Now** (`colony.ts`):
- **`fatigue`** grows by `dt / clock` while the ant is out of its nest with empty jaws, exploring, following or fighting. It stops at twice `patience`.
- **It falls** at `patience / restTime / clock` per second while the ant is inside its own nest (its hole, or its tunnels and chambers in the side view). Finding food clears it. Digging, spoil and nursing neither tire nor rest it.
- **Fights tire too.** As first pushed they didn't. Then nothing sent a fighter home, since `localPolicy` only sends the tired home before the raid and defend rules. Raids never ended, and combat losses rose 56–72 % (review of #36).
- **Tired once fatigue passes `patience`, until fully rested.** Resting only to just under the line sent foragers out to tire again at once.
- **REST** (10 s at the hole) acts only on an ant that is no longer tired. The arrival rule's freshness test uses the same flag.
- **`since`** keeps its other jobs: trail strength, backfill timing, the held-food guard.
  - The benches' "out > 120 s" (`side-bench`, `economy-bench`) still reads `since`, so it now counts foragers resting inside: 5.2 % against 1.1 %, not a regression.
  - The ant card shows fatigue beside time out.

**`restTime` sweep**, local rule, seeds 1–10, before fighting tired ants:

| `restTime` | G pass | most held | A3 |
|---|---|---|---|
| 30 s (chosen) | 10/10 | 2 | 10/10 |
| 60 s | 9/10 | 3 | 10/10 |
| 120 s | 8/10 | 4 | 10/10 |

`--set colony.restTime` sets the first colony's only; the rival kept 60 s.

**The game against `main` (MR 2)**, local rule, after the review's fix (first colony):

| Seeds | G pass | most held | porters held over 120 s | food home | losses you / rival | fewest ants left |
|---|---|---|---|---|---|---|
| 1–10, `main` | 9/10 | 3 | 1 | 23,704 | 1,663 / 1,974 | 668 |
| 1–10, MR 3.1 | 9/10 | 3 | **6** | 24,512 | 1,552 / 2,179 | 610 |
| 11–20, `main` | 10/10 | 2 | 1 | 22,218 | 1,258 / 1,831 | 696 |
| 11–20, MR 3.1 | 9/10 | 3 | 0 | 20,424 | 1,685 / 1,478 | 646 |

- **Losses on seeds 11–20 are uneven:** the first colony loses 34 % more than on `main` (1,685 against 1,258), and the rival 19 % fewer (1,478 against 1,831). Together they are +2.4 %; on seeds 1–10, +2.6 %. Food home on seeds 11–20 is 8 % lower.
- **A raider standstill** (re-review of #36): in `side-bench` seed 6, colony 1, from 500 to 550 s, up to ~300 fighters stand still for 20 s or more on the surface between the nests, then disperse. That is 10,253 ant-seconds stuck on the ground against `main`'s 104. Losses on that seed are below `main`'s. Bead filed.
- **Porters: mostly a measurement artefact** (re-review of #36). `side-bench`'s porter count read `since`, which `#becomePorter` doesn't reset, so a forager that had rested inside over 120 s counted the moment it took food on. It now uses its own hold clock: on `side-bench 1-6 600 600 2`, 0 porters held over 120 s at the end on both MR 3.1 and `main` (peaks 3 and 1). The "1 → 20" first reported was the old clock.
  - A jam was real on af0a548 (seed 6: 9 at the end); fighting tiring removed it.
  - `heldProbe`'s `maxPorting` (own clock) is at most 6 on G seeds 1–10 and 0 on 11–20; Cautious's replay reaches 49. ja-3po keeps those, and `slow/side.test` keeps a todo guard.
- **Legend** (`COLONY_BRAIN_VERSION` 5, `RESPONSE_BRAIN_VERSION` 4; stance unchanged). The legend now says:
  - that tired means a long unsuccessful search, rested only by staying inside;
  - that going home tired is how the colony stops searching where food has run out;
  - that a fresh ant inside has finished its trip and is needed out;
  - that a carrier answers its own question;
  - what loose soil, corpses and brood are for.

**Re-baselined by the owner's choice.** It was asked in the session that built MR 3.1, on 2026-11-03: of "accept and re-baseline", "fatigue for foragers only" and "dig further first", the owner chose the first.
- The crowded-nest test (`slow/chambers.test`) leaned on the retired foragers. Over 20 games the floor grows ×1.19–3.06, mean 2.21 (`main` 2.45). The digging totals are the same; less of it is chamber floor.
- Its bound is now at least ×1.5 in every game and ×2 on average. This test's three games measure ×2.08 on average, a 4 % margin. Nest 9's backfill regression still fails it.
- Restoring chamber growth from sensed crowding is ja-k4k.3.

**Hour-long economy** (`slow/economy.test`'s setup, worlds 1–8, seeding `mulberry32(w × 7919 + n)` for n = 0 and 1): MR 3.1 fails 5 of 16 (3 collapse), `main` (MR 2) 3 of 16 (3 collapse). The earlier "6 of 16" compared with the `main` before MR 2. The knife-edge is unchanged (ja-xu6).

### 44.3 Live check and replay (2026-11-03)

`colony-live.mjs mode,stance,get,carry,drop` with second rounds: **$0.0045**. The caches are in `experiments/caches/mr3.1-*.json`. Agreement with the local rule:

| Lane | MR 2 | MR 3.1 |
|---|---|---|
| mode | 65–69 % | **83–90 %** |
| get | 43–64 % | 44–56 % |
| carry | 97–100 % | 95–100 % |
| drop | 100 % | 100 % |

- **"A fresh ant at home: return"** is gone under Forage. Its remaining disagreements are explorers following faint trails, which its doctrine asks for.
- **Nurses now take brood.**
- **Loose soil off the mound is still declined** in 4–5 of 9 situations, despite the legend.

**Cost** (`colony-cost --side 5 600 1`, deterministic; review of #36 corrected the figure first reported):

| Lane | `main` (MR 2), tokens per question | MR 3.1, tokens per question |
|---|---|---|
| mode | ~546, $0.092/h | ~657, **$0.074/h** (fewer situations met) |
| get, if asked | 650 | 811 |
| carry, if asked | 531 | 640 |
| drop, if asked | 708 | 863 |
| trail, if asked | 361 | 456 |

The response lanes cost about $0.062/h if asked; the page asks none of them.

**Replayed**, seeds 1–10. The local rule with fatigue: G food home 24,512.

| | Local | Forage | Cautious | Warlike |
|---|---|---|---|---|
| G pass (held ≤ 2) | 9/10 | 7/10 | 9/10 | 7/10 |
| G most held / porters held | 3 / 6 | 4 / 2 | 5 / **49** | 6 / 0 |
| G food home, first colony (sum) | 24,512 | 18,329 | 13,960 | 15,600 |
| … as a share of the map's food (median) | 9.6 % | 5.8 % | 5.4 % | 6.0 % |
| A2a twin, food home | 37 % | 38 % | 38 % | 38 % |
| A5 out before / after food | **0.48** / 0.86 | 0.48 / 0.83 | 0 / 0 | 0.48 / 0.84 |
| A8 `beyond`, lowest | 0.59 | 0.71 | 0.93 | 0.86 |

- **ja-5ty:** Forage brings home 75 % of the local rule's food (18,329 against 24,512). In MR 2 it was 62 % (14,594 against 23,704): Forage's own total rose 26 % while the local rule's rose 3 %. It stays open: the soil answers and the answers' interactions remain.
- **ja-3sy:** Warlike's food home is 6.0 % of the map (MR 2: 0.7 %, §43.6), and its worst seed holds 6 carriers, not 73 as before the fight fix. Still over the bound, so it stays open.
- **ja-3po:** Cautious's porters jam the nest (49).
- **Held-out seeds 11–20** (local): G 9/10 (`main` 10/10); A3 and A4 10/10 before the fight fix.
- **A5 moves for the first time.** Foragers now rest at home before food appears (0.48 out against 0.97). The pass mark is half the share out after food.
- **Bisecting:** the two WIP commits (19fceda, 788d013) fail the fast goldens. They stay, since the branch history isn't rewritten.

## 45. Trails as a response: the double bridge's arena, food quality, choosing a trail by its strength (behaviour MR 3, ja-3ml, ja-dez, ja-68l.8, 2026-11-04)

Stacked on MR 3.1 (§44). The trail assays failed on every seed (§43.5): A1 double bridge 0/10 (0.48 short) and A2a two equal sources 0/10 (0.52). Research basis: `docs/trails.md` (Goss et al. 1989; Beckers et al. 1990, 1993; Robinson et al. 2005, 2008); numbers from abstracts are marked unverified there.

### 45.1 A1's arena (ja-dez)

MR 0's box arena made the short branch also the straight line home, so homing alone scored it. Today's ants (MR 3.1), seeds 1–10, passages on equal straight stretches:

| Arena | Short share, median (min–max) |
|---|---|
| box (MR 0) | 0.59 (0.48–0.69) |
| fork, ±30°, long branch below | 0.33 (0.04–0.37) |
| the same, mirrored (long branch above) | 0.39 (0.18–0.53) |
| fork, ±60° | 0.23 (0.14–0.49) |

- **Chosen: Goss's fork.** One stem leads to a choice point. Two branches leave it at ±30° and look alike for 10 units, then rejoin at a mirror-image fork. The long branch is twice the short one's length. Chosen for faithfulness, not score.
- **Scored by passages**, as Goss counted them (`crossingProbe`). Ant-seconds agree to two decimals (`timeShare`). A run counts only with ≥ 20 food home: under Jev's answers A1 once "passed" with almost no traffic.
- **The long branch's side alternates by seed**, as Goss swapped sides between trials. Homing carriers lean to the lower branch about 2:1 at a mirror-symmetric fork (long below: 481 long against 157 short trips; long above: 586 short against 337 long). That is a steering bias, not length (bead `ja-32w`).
- New: `Arena.path` (corridors at any angle), `crossingProbe`.

### 45.2 Food quality

- `WorldMap.quality`: a layer, absent when every cell is 1. `dropFood` blends by amount, and `Arena.pile` takes a quality. Every game map is all 1.
- Each ant tastes its food at pickup (`Colony.quality`) and returns the quality to the map when it puts the food down. `Touch.quality` is poor / fair / rich (< 0.75, > 1.25).
- `touchKey` adds quality only when it isn't fair, so older keys still match. Taste is a new sense row in `docs/vision.md`.
- `localResponses.trailRate` for food carriers: rich 1.2, fair 1, poor 0.83 (Beckers et al. 1993: ~43 % more trail for 1 M than 0.1 M sugar).
- **New assay A2b** (`richPoor`): a rich (1.5) and a poor (0.5) pile at equal distance, the rich side alternating by seed. Target: the rich takes ≥ 70 %.

### 45.3 Choosing a trail by its strength

**Why A2 failed.** Followers did nearly all the foraging (5,746 of 5,747 pickups in A2a seed 1), yet the split stayed 50/50:
- The food trail sat at the field's cap (`MAX_LEVEL` 20) near the nest on both trails, so a strong trail and a weak one read the same.
- A follower turned to its strongest sensor (`climb`), so it took whichever trail lay ahead of it.

Neither the deposit sweep (0.25–2) alone nor `trailRate` by quality moved A2a or A2b off 0.5.

**Now** (`colony.ts`, top-down maps only):
- **`followChoice`** (k = 1): a follower turns left, ahead or right with chances (k + C)² (Deneubourg's choice; Goss et al. 1989).
- **`foodCapTop`** 80: the food channel holds up to 80 rather than `MAX_LEVEL` 20 (`ChannelParams.max`). A busy trail no longer sits at the cap, and followers can tell strong from weak.
- **The food trail is laid at full strength** (`foodTrailTop` 1). As first pushed it was a quarter, to stay under the cap. That was too weak to reach the level at which explorers follow (≥ 1): on the bridge under 20 of 300 ants followed, and in G′ the explorers left wandering met the rival (review of #37). Explorers judging a weak trail as if it were strong was rejected: an ant can't know how a trail was laid.

Sweep (seeds 1–4, before the raised cap) over k and the food trail's deposit:

| k | deposit 0.5 | 1 | 2 |
|---|---|---|---|
| 1: A2a / A2b | 0.52 / 0.51 | **0.93 / 0.95** | 0.56 / 0.70 |
| 2: A2a / A2b | 0.51 / 0.50 | 0.52 / 0.54 | 0.58 / 0.95 |
| 5: A2a / A2b | 0.51 / 0.50 | 0.50 / 0.49 | 0.52 / 0.54 |

**Not in the side view.** Three variants were measured there, and each failed against main:

| Side-view variant | What broke |
|---|---|
| Choice inside the nest | Food stopped flowing in the nest: 0 porter trips, larvae starved (the hour-long economy test) |
| Choice on the ground line | Births halved |
| Weaker food trail anywhere | Food home −11 to −23 %, G 17/20, chamber growth ×1.83, brood never offered |

The side view's trails don't fork, so it keeps main's rules. Main's side-view golden masters pass bit for bit; only the top-down war's is re-recorded.

### 45.3a Carriers home by trail and vector (ja-00t)

**The problem.** With the choice alone, A1 stalled at about 0.66. A home vector gives a direction, not a route. On the fork it points into the island between the branches, and both branches are equally off its line. So the wall-follower picked the branch, with ja-32w's lean, and carriers laid their food trail wherever it sent them.

**First attempts** (measured, not adopted):
- Outbound laying by followers (*L. humile*-style): 0.50, with a wide spread.
- Carriers steering home by the food trail alone: 0.97, but they milled on their own trail and food home fell about 10×.

**The literature.** Foragers combine route cues and pheromone, with path integration as the fallback (Czaczkes et al. 2011, 2013; docs/trails.md). The owner's question, "I thought ants could integrate their way home", led here.

**Now** (top-down):
- **`homeTrail`** 0.8: a carrier with food steers by the food trail (Deneubourg's choice), 80 % of its turning, only from sensors whose direction lies within **`homeTrailCone`** (90°) of its home vector. The rest of its turning goes to the vector.
- **Letting go of a wall:** a carrier following a wall lets go for the trail only where the trail's way is open. As first written it let go into rock, met the same wall every step, and never got round: G′ seed 4 held 59.

**Sweep** (seeds 1–6, quarter-strength trail):
- `homeTrail` 0.8 lifted A1 to 0.91, but only on odd seeds; on even seeds almost no ant followed.
- With the full trail under the raised cap, every seed passes: A1 0.91–0.99.

### 45.4 "No entry" (built, shipped off)

- **What was built:**
  - a `noEntry` channel: t½ ≈ 27 s, 2.4× the food trail's, after Robinson et al. 2008's 78 against 33 min;
  - a `noEntry` response (local: 1);
  - `noEntryAvoid`: a follower discounts each sensor's food scent by that many times its "no entry".
- **Laid** by a follower walking out, by its home vector, where a strong food trail (≥ 1) falls under half all round and no food is in sight.
- **Effect,** seeds 1–4:
  - `noEntryAvoid` 4: A3 clears in 6.5 s against 9 s without the mark, but A2a falls from 0.93 to 0.76 and food home by a quarter.
  - Before the walking-out condition, A2a fell to 0.53.
  - The marks land on live trails, near the nest and at patch edges.
- **Shipped off** (`noEntryAvoid` 0 lays nothing) until a better test for a spent patch exists (`ja-4n1`). A3 passes without it anyway (§45.5).

### 45.5 Assays (local rule)

Top-down, the final defaults. "main" is 47928ed, measured on the same seeds (review of #37, S1: an earlier table here mixed seed ranges and an old A3 figure).

| Assay | Target | Seeds 1–10 | Seeds 11–20 | main |
|---|---|---|---|---|
| A1 double bridge (fork) | ≥ 80 % short | **10/10**, 0.97 (0.91–0.99) | **10/10**, 0.98 (0.97–0.99) | 0.37, 0/20 |
| A2a two equal sources | busier ≥ 70 % | **10/10**, 0.82 (0.75–0.93) | **10/10**, 0.90 (0.79–0.95) | 0.52, 0/20 |
| A2b rich vs poor (new) | rich ≥ 70 % | **10/10**, 0.94 (0.87–0.96) | **9/10**, 0.93 (0.11–0.96) | 0.51, 0/20 |
| A3 depletion | < 20 % of peak in 60 s | 10/10, 17 s (12–25) | 10/10, 19 s (12–26) | 20/20, 30.5 s |
| A4 alarm on a trail | scatter, back | 10/10 | 10/10 | 20/20 |
| A6 pass / open (seeds 1–20) | report | exchange 0.95 / 0.94 | | 0.95 / 0.94: no change |

- **A2b, seed 11–20's one failure:** the colony settled on the poor source (0.11). Amplification sometimes locks onto whichever source took the lead, as Beckers et al. saw with equal sources.
- **G′, the top-down game (owner's call, 2026-11-04):**

| G′ | main 1–10 | MR 3 1–10 | main 11–20 | MR 3 11–20 |
|---|---|---|---|---|
| food home | 32,018 | 39,964 (+25 %) | 32,040 | 43,104 (+35 %) |
| births | 7,981 | 9,912 | — | 10,608 |
| losses, you / rival | 6,911 / 6,821 | 10,070 / 9,628 (+46 %) | 7,083 / — | 10,223 / 9,968 (+44 %) |
| ants alive at the end, you / rival | 7,070 / 7,307 | 5,842 / 7,105 | 6,898 / 7,001 | 6,385 / 6,275 |
| most held over 120 s, one seed | 129 | 67 | — | 153 (ja-9uj) |

- **The extra deaths are fights in the midfield:** seed 1, 2,158 against main's 969; seed 2, 1,687 against 899. Deaths near either nest are about the same, nearly all in FIGHT. Strong trails carry far more traffic, and both colonies' lanes meet over the shared food mid-map.
  - The owner accepted this for MR 3 (2026-11-04). Bead `ja-hgq`: behaviour MR 4's contact response is the natural fix.
  - Neither knob alone avoids it: the review's choice-only and quarter-trail-only runs raised losses too.
- **The side view is unchanged** by construction (golden masters bit for bit), so G, A8, the hour-long economy and the chamber tests keep §44's figures.
- **Gate:** `slow/assays.test` runs A1, A2a and A2b on seeds 1 and 2 as tests.
- **Tests guarding the mechanisms** (review S2):
  - `choose`'s weights and its large-k limit;
  - the blended quality's value;
  - a top-down follower at a fork, which `followChoice` 0 fails.

### 45.6 The trail lane (ja-68l.8) and the live check (2026-11-04)

- **Legend v5:**
  - The colony finds food and home only by scent trails: carriers' food trail leads others out, explorers' home trail leads carriers back, and where nobody lays, nobody can follow.
  - Quality is explained, and is sent to the get and trail lanes only.
  - The trail question's choices say what each trail is for.
- **Legend v6** (`RESPONSE_BRAIN_VERSION` 6): a porter's food is already home, and a food trail laid inside the nest leads nestmates in, away from the food outside. The trail question's "none" says the same.
- **Live, v5:** `colony-live.mjs mode,trail,get,carry` (side view) and `trail --top`, $0.0036. Caches: `experiments/caches/mr3-side-*.json`, `mr3-top-*.json`.
- **Live, v6:** `colony-live.mjs trail` (side view), $0.0007. Caches: `experiments/caches/mr3-v6-side-*.json`.

| Lane, agreement with the local rule | Side view | Top-down |
|---|---|---|
| mode (v5) | 85–90 % | — |
| trail, v5 | 61–74 % | **95–100 %** |
| trail, v6 | 61–70 %: porters told to lay food trail, 3 → 0–1 per doctrine | — |
| get (v5) | 44–56 % (declines loose soil) | — |
| carry (v5) | 95–100 % | — |

- **Side view, v6:** what remains is followers and diggers in tunnels and chambers told to lay no home trail.
- **The trail lane alone replayed in G** (seeds 1–10; local 24,512):

| Doctrine | v5 | v6 |
|---|---|---|
| Forage | 17,768 (−28 %) | 22,224 (**−9 %**) |
| Cautious | 20,996 (−14 %) | 22,725 (**−7 %**) |
| Warlike | 19,843 (−19 %) | 19,233 (−22 %) |

- ja-68l.8's mark (< 10 %) is met for Forage and Cautious and **not for Warlike**. ja-68l.8 stays open for Warlike's answers.
- **v5's whole caches in G** (seeds 1–10): Forage 12,076 (7/10), Cautious 12,516 (9/10), Warlike 18,672 (8/10).

**Cost** (`colony-cost --side 5 600 1`):

| Lane | MR 3.1, tokens per question | MR 3 (v5) |
|---|---|---|
| mode | ~657, $0.074/h | ~657, $0.074/h (unchanged) |
| get, if asked | 811 | 970 |
| carry, if asked | 640 | 723 |
| drop, if asked | 863 | 1,024 |
| trail, if asked | 456 | 591; v6 613 |

The response lanes would cost ~$0.074/h if asked (MR 3.1: ~$0.062/h). The page asks none of them.

## 46. Meeting strangers: contact response, graded alarm, terrain (behaviour MR 4, ja-902, ja-dul, ja-qld, ja-hgq, 2026-11-05)

Stacked on #37 (MR 3). Research basis: `docs/combat.md`:
- Lymbery et al. 2023: narrow ground favours the smaller side;
- graded alarm: low doses attract, high doses repel (*Atta*, Moser 1968; Lopes et al. 2022);
- at food, the ant that didn't start an encounter usually retreats (Human & Gordon 1996).

The paper sites were outside the allowlist; numbers there are marked unverified. "Baseline" below is 4e41ade: this branch with the new assays and no behaviour change, run with the same assay code (the side view as on main, the top-down as on #37).

### 46.1 What was there

- **Every ant with a stranger near fought** (`localPolicy`: `enemy: near` → fight): foragers, carriers and nurses alike.
- **Alarm only repelled.** Fighters climbed it.
- **ja-dul:** `avoid()` read rock and the map's edge (−1) as the least alarm, so ants steered into walls.
- **Measured costs:**
  - A9 (new): two foraging colonies sharing a pile lose 8.9 ants per 100 food brought home.
  - G′: MR 3's midfield battles (ja-hgq).

### 46.2 Assays (no behaviour change; commit 4e41ade)

- **A4:** recovery is searched from the crowd's lowest point after the alarm (ja-qld).
- **A6 re-specified: few against many.**
  - 80 defenders against 200 attackers, and the pass must give the defenders at least 1.5× the same seed's open-ground exchange.
  - The old A6 pitted equal armies and asked the pass to favour the defenders. Terrain shouldn't favour either side between equals, and it didn't (0.95 against 0.94).
  - Lymbery's effect is about a smaller side against a larger one.
- **A9 contact (new):** two colonies on a forage stance, nests at either end, one pile between. Mark: ≤ 4 lost per 100 food, half the baseline.
- **A10 faint alarm (new):** a faint alarm painted 30 cells from the nest of a colony exploring with no food to find, at 40 s (by 120 s the explorers had tired and gone home). Mark: ≥ 2 more ants near it in the next 10 s.

### 46.3 What MR 4 built

- **ja-dul:** rock and the edge read as the most alarm, not the least.
- **Graded alarm:**
  - `Touch.alarm` is none, faint or strong. `alarmGain` may be negative: a pull, at `alarmDraw` (2) × turnRate. Locally, faint alarm draws an empty-jawed explorer.
  - **Top-down only.**
    - In the side view the drawn explorers crowded the tunnels and the ground line round fights: G seeds 1–20 passed 15/20 with the pull, 18/20 without.
    - A follower keeps to its trail. Drawn too, at first, the trail's followers crowded every strong alarm's faint fringe, and A4 broke (crowd ×1.72 instead of scattering).
  - Strong alarm repels as before. On the side view's ground line a carrier doesn't shy from it: it can't go round, only turn back, and it turned back from fights at its own hole (G seeds 4, 8: raids, 3 held).
  - An ant meeting a stranger already raised alarm: `resolveFights` lays it for any ant with strangers in its cell or the six round it, whatever its mode.
- **Contact response** (`contact` hook: fight | flee | drop and run):
  - Asked every step while strangers are within the colony's enemy range.
  - `Touch.odds` is outnumbered, even or outnumbering, by contact: nestmates against strangers in the ant's cell and the six round it (`Colony.nestmates`).
  - **`localPolicy` no longer sends every ant with an enemy near to fight.** That is the contact response's now, and it sees the mode the policy chose.
  - **Local rule:**
    - a carrier takes its load home;
    - raiders and defenders, and an ant its policy sent to fight, fight;
    - on a forage stance every other ant turns away.
  - **A fleeing ant without a load** runs straight away from the strangers while they are in reach. Once they are gone its mode policy is asked afresh, and locally it resumes foraging (review of #38: the PRD first said "then home", but the policy put it straight back on its trail). Homing alone, fleers often walked along or toward them.
  - **A carrier flees by homing.** Turned straight away, on the ground line it walked away from its own hole (G seed 5, a raid: 3–5 held).
  - **Tried and dropped:**
    - Fighting while outnumbering, judged once: one moment's advantage committed an ant to the death (G′ seed 2: 1,742 of 1,894 deaths in fight mode, mid-map, both colonies foraging).
    - Fighting while outnumbering, judged every step: one side always outnumbers somewhere, and its fighters cut down the other's fleers (G′ seeds 1–4: 7,482 lost, against 6,069 never fighting).
    - Harm only from strangers that fight (`passive` 0.3 or 0): no better (G′ 8,411 at 0).
- **Terrain: nothing to build.**
  - With 80 defenders against 200, the pass already favours the few: exchange 0.57 against the open's 0.25 (seeds 1–6). Only a few attackers reach the defenders at once through it.
  - A cap on how many of a side one cell brings to a fight only blunted numbers everywhere: open 0.26 → 0.69 at a cap of 1. Capping both sides cancelled out. The cap was dropped, and `battle.ts` is as on #37.
- **Tests:**
  - graded `alarmGain`, `contact` (local), the contact lane's packing and reading, and `avoid` at rock;
  - `game.test`'s fighting ant: its policy's "fight" is honoured;
  - `midden.test`'s raid: its bound is 15 raiders on the rival's side, not 20. The rival's foragers no longer charge out, and raiders die faster at its crowded hole (109 against 64 in that minute), so fewer are over there at once (17.5 against 49.9).

### 46.4 Results (local rule)

Measured after #38's review (S1: the contact response records the situation it answered, so a fleeing ant isn't flipped back onto its trail every other step). "Baseline" is 4e41ade run with the same assay code. A10's baseline was run under A10's final spec (de4017f's map and timing).

| Assay | Baseline | MR 4 |
|---|---|---|
| A4 alarm | 10/10 / 10/10 | 10/10 (scatter 0.35) |
| A6 few against many through a pass | 9/10 / 7/10, gain 2.36 | 9/10 (unchanged: geometry) |
| A9 contact, lost per 100 food | 0/10, 8.9 / 0/10, 8.0 | **10/10, 0.88** (food home +28 %) |
| A10 faint alarm | −1.8 (repelled) | +1.4 (drawn): 3/10 at the mark of 2 (ja-je8) |
| A3, A2a, A1 (top-down trails) | 10/10 | 10/10 |
| G side-view game | 18/20 | **18/20** |
| G food home, first colony | 24,512 / 20,424 | 22,995 / 20,942 (−6 % / +3 %) |
| G losses, both colonies | 3,731 / 3,163 | 3,440 / 3,367 |
| A8 nest flow | 0.59 lowest | unchanged (one colony: no contact) |

Where a cell shows two figures, they are seeds 1–10 / 11–20.

**G′, the top-down game, both colonies** (review S3 asked for seeds 11–20):

| G′ | Baseline 1–10 | MR 4 1–10 | Baseline 11–20 | MR 4 11–20 |
|---|---|---|---|---|
| losses | 19,698 | **17,073** (−13 %) | 20,191 | **17,099** (−15 %) |
| ants alive at the end | 12,947 | **15,436** (+19 %) | 12,660 | **14,903** (+18 %) |
| food home | 83,068 | 82,657 (−0.5 %) | 84,319 | 80,106 (−5 %) |
| colonies fallen | 0 | 0 | 0 | 0 |
| most held over 120 s, one seed | 67 | 117 (seed 4) | 153 | **248** (seed 11) |

- **The smallest colonies (review S2):** the first colony's ants alive at the end.
  - **Seed 4:** baseline 0, MR 4 **292**.
  - **Seed 19:** baseline 0, MR 4 **29**: a collapse a few seconds later.
  - Before MR 3 (main 47928ed) they ended with 370 and 84.
- **ja-hgq** keeps these seeds open. MR 4 recovers about half of MR 3's extra losses (main before MR 3: 13,732 on seeds 1–10).
- **Held carriers in G′** (ja-uez) rise on some seeds, worst on seed 11: 248 against 153.
- **Side-bench** (`side-bench.mjs 1-6 600 600 2`; review S5):
  - Food home 26,688 (main 25,985); ants stuck on the ground line 54 (main 10,253: main's seed-6 raider standstill is gone).
  - **Porters held over 120 s at the end: 15** (main 0), 13 of them on seed 3, colony 0, in tunnels next to its nest.
  - Not the cause, measured: alarm in tunnels (26 when carriers ignore it) and contact inside the nest (14 when ants defend it).
  - Single-change variants clear seed 3 but jam another seed (seed 5, 13). Noted on ja-3po; the slow porter guard is still a todo.
- **Tests:** `npm test` 336/336; `test:slow` 9 pass, 3 todo (A5; A10, ja-je8; the porter guard, ja-3po). It gates A1, A2a, A2b and A9 on seeds 1–2. `tsc -b` is clean.

### 46.5 Ants take up room (ja-4ne, filed)

The owner asked whether cells should hold only a few ants. Measured (seed 1): cells hold any number today.

| Game | Ants per occupied cell | Most in one cell | Ants in cells of 10+ |
|---|---|---|---|
| Side view | 2.0–2.1 | 24–29 | 11–20 % |
| Top-down | 1.5–1.6 | 9–17 | ≤ 7 % |

The stacks are at choke points: the hole, the tunnels, the piles. Fewer ants would shorten the queues but not stop them. Physical exclusion is its own bead, with a research note on ant traffic first (Dussutour et al. 2004). It would make terrain-limited combat physical.

### 46.6 The contact lane and the live check (2026-11-05)

- **Legend v7** (`RESPONSE_BRAIN_VERSION` 7): alarm (none, faint, strong) and odds (outnumbered, even, outnumbering), sent to the contact lane only. Strangers in reach hurt any ant they touch; an ant fighting outnumbered dies; one that turns away lives to forage.
- **The question:** fight, flee (home, keeping its load), or drop and run.
- **Live:** `colony-live.mjs contact --top`, first asked for **$0.0023** (83 situations per doctrine). The side view meets only 2 contact situations in 300 s.
- **Re-asked after #38's re-review (N1′), $0.0034.**
  - The S1 fix made fight and return stick while strangers are near, so contact is now asked with `mode: fight` or `mode: return`. The first caches, collected while the mode reset to explore or follow every step, covered only 28–38 % of the replays' contact questions.
  - A fresh run met 95 situations per doctrine, and a second round (`--from`) added 33, 25 and 19 more. The caches in `experiments/caches/mr4-top-*.json` now answer **100 %** of the contact questions the replays below ask.
- **Agreement with the local rule** (95 situations each): Forage 68 %, Cautious 66 %, Warlike 52 %.
  - Forage and Warlike send empty-jawed explorers on a forage stance to fight when even or outnumbering.
  - Cautious has fighters flee from raids, and in the second round declines most fights (40 % agreement).
- **Replayed** (Jev's answers for the first colony; seeds 1–6; G′ figures are both colonies' totals; contact answered from the cache 100 % of the time):

| | Local | Forage | Cautious | Warlike |
|---|---|---|---|---|
| G′ food home | 53,092 | 52,892 | 50,173 | 51,264 |
| G′ losses | 11,607 | 12,402 (+7 %) | 10,780 (−7 %) | 12,575 (+8 %) |
| A9 lost per 100 food | 0.88 (6/6) | 2.27 (6/6) | 0.92 (6/6) | 3.49 (6/6) |

  The doctrines that fight cost ants, as their doctrines ask.

**Cost** (`colony-cost --side 5 600 1`):

| Lane | main (MR 3), tokens per question | MR 4 |
|---|---|---|
| mode | ~657, $0.074/h | ~649, $0.074/h |
| get, if asked | 1,020 | 1,203 |
| carry, if asked | 750 | 894 |
| drop, if asked | 1,078 | 1,180 |
| trail, if asked | 613 (as §45.6 reported) | 738 |
| contact, if asked | — | 1,405 (2 situations in the side view) |

- The main column is the review's own measurement of main (ja-46w corrects §45.6's stale figures). All four lanes on main come to ~$0.078/h.
- The legend's new sentences reach every response lane: all five would cost ~$0.096/h if asked. The page asks none of them.
- Since #38's review the contact lane alone keys on alarm and odds (`colonyBrain.responseKey`). Before, every lane's key carried them, so identical requests in get, carry and trail landed under different keys.

## 47. Learn: the research, the policy and the nest on the page (ja-epn, 2026-11-05)

The page showed what happens but not why. The follow card named an ant's situation and who decided, and a few tooltips hinted at the rest. The research behind the senses lived only in `docs/`, the legend Jev reads was invisible, and chambers were unlabelled washes. The owner asked for ways to learn what you're seeing: the research, the policy and the nest structures.

**Decisions (owner, 2026-11-05):**
- **A Learn drawer, plus "?" buttons where things are.** A header button opens a drawer with three tabs. Each "?" opens it at the matching entry. The drawer's state is one small store (`ui/learn.ts`), so a "?" anywhere needs no callbacks threaded to it. The follow card's situation chips are links into it, and each choice has a "why?".
- **The research as a field guide that links out.** Each entry covers one thing on screen in three parts: what you see, what real ants do (the notes' own claims) and how the game models it. Its sources link the notes' headings on GitHub, since the Pages build has no server to serve `docs/`. Full notes are not rendered in the page: they mix research with design detail meant for developers.
- **Scripted behaviour is called out.** Where a behaviour is still a script reading something no ant can sense, the entry says so and names its vision gap (`ja-k4k.*`).
- **The policy is editable there; the prompt is not.** A first version made each lane's legend editable. The owner's review: edit the *policy*, meaning each colony's doctrine and the fungus's aim, menu and hide/cull settings, and leave the rest of the prompt alone. The Policy tab is flat:
  - The editors come first, bound to the same state as the side panel, so either place changes both. Edits commit on blur, as in the side panel.
  - Then one level of collapsible sections explains how each decides: an ant's mode, the colony's stance, the fungus in a host, what Jev is sent (the legends, read only, with the exact request for the followed ant or a sample) and the small responses (local rule only).
  - A "?" or "why?" opens the section it targets.
- **The fungus has a policy too.** Jev picks, per fungal situation, what the fungus does to a host, under the player's aim and within the menu. With Jev off, each strain runs its default, within the menu and the hide/cull settings.
- **Later, policy by inheritance (`ja-ygc`, owner's idea).** A living colony's doctrine would be fixed. A change would come only through a new queen sent out to found a colony, and only by some fraction of the mother's policy.

**How it is built:**
- **Field guide:** `ui/guide.ts` (16 entries) and its list of the notes. `tests/guide.test.ts` checks the guide against `docs/`:
  - every cited note and heading exists, with anchors slugged as GitHub does;
  - every note in the docs index is listed;
  - every gap an entry calls scripted is still an open row in `vision.md`'s gap table.

  So closing a gap or renaming a heading fails the test and names the entry to rewrite.
- **The local rules in words:** `ui/policyText.ts` gives `localPolicy` and `localStance` as rows ("when …, then …"). `tests/policyText.test.ts` walks all 3,888 situations and every stance view and checks the rows give exactly the code's answers. The Policy tab highlights the row that decides the followed ant's situation.
- **What Jev is sent** (`ui/prompt.ts`): the exact request for one situation from the same packers the client uses, and tokens per question at 100 situations to a request (the page's estimates always were). The brain modules and the Jev client are unchanged from main, apart from exporting `MODE_CRITERIA` and `STANCE_CRITERIA` and the `LaneName` type.
- **Nest tab:** `ui/nest.ts` reads each nest from the chamber table: per chamber its role, depth below the ground line, cells (floor), the ants in it now, brood and food; plus the queen, the brood by stage, inside against out, and the midden. The tab says plainly that this is the player's view: an ant senses only the role of the chamber it stands in.
- **Labels on the field:** a **Labels** button on the field (side view) names each chamber by its role. With labels on, a click on a chamber with no ant under it opens the Nest tab at that chamber's row.
- **Shared colours:** the field's role, brood and home-trail colours moved to `ui/palette.ts`, so the swatches and the canvas share one source.

**Cost.** None: the requests and their contexts are byte-identical (`colony-cost` unchanged: ~769 tokens per question on the top-down session, $0.022/h). A doctrine or aim edited in the drawer re-asks exactly as one edited in the side panel always has.

**Not done:**
- Rendering whole notes in the page.
- Moving the camera to a chamber picked in the table.
- Recording who decided at decision time rather than at render time (`ja-kxw`, still open).
- Filed while doing this: `ja-px9`. `docs/nest-chemistry.md` is missing although `ja-k4k.9` is closed.

## 48. Foragers go out because foragers come back (behaviour MR 5, ja-um8, 2026-11-05)

Research basis: `docs/activation.md`.
- In the red harvester ant, a forager waiting inside leaves on brief contacts with nestmates coming home with food (Gordon; Pinter-Wollman et al. 2013; Pless et al. 2015).
  - Unsuccessful returns don't count.
  - It leaves 3–8 s after a rise in contacts.
  - With none returning, it waits about 3 min.
- Models describe each ant as a leaky count of contacts with a threshold (Prabhakar et al. 2012; Davidson et al. 2016).
- A colony knows its food only as this rate (Greene & Gordon 2007).

The paper sites were outside the allowlist; numbers there are marked unverified. "Off" below is this branch with `leaveGate` 0, which matches `main` bit for bit.

**Scope.** ja-um8 also planned raids that start from scouts' trails. They are split off as MR 5.2 (`ja-tu3`, which now blocks ja-jwy), since raids need their own research and assay.

### 48.1 What was there

- **On a top-down map, a rested forager reaching home with empty jaws went straight back out** (`arrive`). Only fatigue kept one inside, and only until rested.
- **No ant knew whether others were finding food.**
- **The strategist raided on `foodLeft`,** the map's food total, which no ant senses (vision gap "Stance and raids"). In a 600 s game the map never falls below 66 % of its food, so that rule never fired in G or G′.
- **A5 failed on every seed:** on seeds 1–20, 0.48 of the colony was outside before food against 0.84 after (mark: at most half).

### 48.2 Assays (no behaviour change; commit 61125a5)

- **A5** also reports trips out per minute in each window, so a pass shows its cause.
- **A5b, food stops (new):**
  - food at 60 s, taken away at 240 s;
  - mark: trips out per minute over 300–420 s at most half those over 150–240 s (Gordon 2002's removals);
  - `main` already passes 20/20, since fatigue brings unsuccessful foragers home. It is a guard, not the target.

### 48.3 What MR 5 built

- **The cue** (`colony.ts`: `met`, `#returning`, `#returned`).
  - Each ant keeps a leaky count (half-life 20 s, `MET_HALF`) of encounters with nestmates coming home with food.
  - A forager that puts its food down at home meets the waiting ants in its cell and the six round it, once each.
  - The `Touch` gains `returns`: none, few (at least `leaveGate`, 1), or many (4 or more).
- **Waiting.** On a top-down map, a rested forager home in "return" with empty jaws is asked the new `leave` response instead of its mode policy. The mode policy sends any ant out that smells no food trail.
  - **"now"** goes out at 1 per second (`LEAVE_NOW`).
  - **"soon"** at 0.2 per second, about the papers' 3–8 s.
  - **"wait"** stays in. Only a scout goes, at `scoutRate`, 1/90 per second: a waiting ant goes out on its own after 90 s on average, against Gordon's foragers waiting about 3 minutes with none returning. At 1/180, G′'s worst seed fell to 5 ants alive (§48.4).
  - **One roll a step** (review of #39, S1): an ant home in "return" passes both the rest check and the trip's end in one step, and before the fix it rolled `leave` at each. Every rate ran at about twice its stated value; the numbers below are all after the fix.
  - A waiting ant mills out to 0.9 of the nest's radius, where foragers come home.
- **Local rule:** many, now; few, soon; none, wait. A raiding or defending colony doesn't wait.
- **The strategist** reads `intake`, food stored per ant per second over the last 60 s, instead of `foodLeft`. "None" is below 0.0005, "plenty" from 0.01, and "some" until a minute has passed. `localStance` raids on no intake.
  - In G and G′, seed 1, intake ran 0.002–0.017 per ant, so neither the old rule nor the new one fires in a 600 s game.
  - A lone colony never consults the strategist, so the hour-long economy is untouched.
- **Top-down maps only.** The side view is unchanged: G on seeds 1–10 is identical to `main` on every metric. Side-view activation is bead `ja-web`.
- **Three wrong turns the measurements caught:**
  1. **The mode policy sent waiting ants out:** the gate alone changed nothing.
  2. **Ants kept to half the nest's radius never met a carrier,** who puts its food down at the rim. Ants that drifted out of the nest were asked their mode and left.
  3. **Contact counted in seconds stayed under the threshold:** a carrier is met for a single tick. So only scouts went out, and with scouts at 1/30 per second, `leave` deaf to returns gave the same A5 and A5b.

### 48.4 Results (local rule)

**The cue does the work** (seeds 1–10, medians; "deaf" answers `leave` as if no returns were ever met):

| | With returns | Deaf to returns |
|---|---|---|
| A5 outside before food | 0.14 | 0.14 |
| A5 outside once food flows | 0.85 | 0.71 |
| A5 food stored | 5,074 | 4,674 |
| A5b outside while food flows | 0.82 | 0.62 |
| A5b trips out per minute while food flows | 2,254 | 1,636 |
| A5b food stored | 3,338 | 2,372 |

A5's mark alone doesn't tell them apart: both pass 10/10.

**A5 and A5b against off** (seeds 1–10):
- **A5:** 10/10, against 0/20 on seeds 1–20 off. 0.14 outside before food against 0.48 off, and 0.85 once food flows.
- **A5b:** 10/10. It stores 3,338, against 4,118 off: a waiting colony ramps up from a few scouts when food appears.
- **A1–A4 and A9:** unchanged pass counts; food stored −0.2 % to +1.5 % (measured before S1's fix, at the same effective scout rate).
- **A10:** unchanged, 3/10 (ja-je8).

**G′, the top-down game, seeds 1–20** (both colonies' totals):

| | Food home | Losses | Fewest ants alive (seed 19) | Second fewest | Most held over 120 s |
|---|---|---|---|---|---|
| Off | 162,763 | 34,172 | 29 | 257 | 248 |
| MR 5 | 158,012 (−2.9 %) | 32,393 (−5.2 %) | 38 | 348 | 190 |

- **Seeds 1–10:** food −5.2 %, losses −8.3 %.
- **Seeds 11–20:** food −0.5 %, losses −2.1 %.
- Seed 19 is ja-hgq's near-collapse on both.

**Tuning** (G′ seeds 1–20, both colonies; one roll a step):

| `leaveGate` | `scoutRate` | Food home | Losses | Fewest alive |
|---|---|---|---|---|
| 1 (chosen) | 1/90 | −2.9 % | −5.2 % | 38 |
| 1 | 1/180 | −3.9 % | −7.4 % | 5 |

Before the fix, with two rolls a step: `leaveGate` 1 against 2 at a stated 1/180 (about 1/90 in effect) gave −3.5 % against −4.3 % food and 58 against 48 alive at worst; at a stated 1/30, thresholds 1–4 gave −2.7 to −4.9 % food and 4–60 alive at worst.

The 1/30 runs were measured while returns were still counted in seconds (third wrong turn above): there, returns made no difference.

### 48.5 The leave lane and the live check (2026-11-05)

- **Legend** (`RESPONSE_BRAIN_VERSION` 8):
  - `returns` is sent to the `leave` lane only;
  - the colony learns there is food to fetch only by meeting nestmates bringing it in, and even a few means there is food out there;
  - with none returning, an ant that goes out is a scout;
  - a raiding or defending colony needs its ants out whatever comes back.
- **Stance legend v4:** intake replaces `foodLeft`.
- **The question:** now, soon (in a few seconds), or wait.
- **Live:** `colony-live.mjs leave,stance --top`, $0.0016 in all.
  - The first legend didn't explain a few returns or a raid, so Jev answered "wait" to them. Agreement with the local rule was 17–50 %, and the replays cost the first colony 11–14 % of its G′ food. That run cost $0.0008.
  - With the legend above (another $0.0008), agreement is Forage 75 %, Cautious 67 % and Warlike 92 %, over 12 situations each.
  - Caches: `experiments/caches/mr5-top-*.json`.
- **Replayed** (Jev's leave and stance answers for the first colony; seeds 1–6; after S1's fix):
  - `leave` was answered from the cache 100 % of the time.
  - `stance` was answered from the cache only 31–68 % of the time; the local rule answered the rest. So the doctrine columns are part Jev, part local rule (review of #39, N3).

| | Local | Forage | Cautious | Warlike |
|---|---|---|---|---|
| G′ food home, first colony | 23,444 | 23,520 (+0.3 %) | 23,063 (−1.6 %) | 22,144 (−5.5 %) |
| G′ losses, both | 10,216 | 9,831 (−3.8 %) | 10,375 (+1.6 %) | 10,507 (+2.8 %) |
| A5 | 6/6 | 6/6 | 6/6 | 6/6 |

Warlike raids more, as its doctrine asks. Before the fix the same caches replayed at +1.9 / +2.6 / −6.6 % food and +7 / +13 / +4 % losses (N4).

**Cost** (`colony-cost --side 5 600 1`):

| Lane | MR 4, tokens per question | MR 5 |
|---|---|---|
| mode | ~649, $0.074/h | ~651, $0.074/h |
| get, if asked | 1,203 | 1,424 |
| carry, if asked | 894 | 1,016 |
| drop, if asked | 1,180 | 1,396 |
| trail, if asked | 738 | 829 |
| contact, if asked | 1,405 | 1,641 |
| leave, if asked | — | never in the side view; 268 asked live, top-down |
| stance | — | 193 asked live, top-down |

- The legend's new sentences reach every response lane.
- All six lanes would cost ~$0.109/h if asked, against ~$0.096/h for MR 4's five. The page asks none of them.

### 48.6 One world: the gate at the top of the shaft (ja-web, 2026-11-10)

The owner ruled `ja-web` a port of this section into one world (2026-11-10): one world only, no adding-mechanics process, measured against U6a's guards (`docs/one-world.md` §5). U6a had shown that one world never asked `leave` and so never raided: the gates were open ground's, and the plane, the only layer without a hole, is where nobody waits (every returner goes down its hole). Research basis as above: foragers wait in a chamber just inside the entrance and leave on contacts with nestmates coming home with food; a successful forager goes straight back out.

**What was built** (`colony.ts`; the side view and the top-down maps unchanged, their golden masters bit-exact):
- **The gate.** In one world every outgoing forager passes a gate at the top of its own shaft: the cells within `WAIT_STEPS` (3) steps of its hole along its tunnels (the way-out field). An old forager going out (exploring or following, or a recruited raider) with empty jaws and no pass is held there:
  - it mills among those cells, is not asked its mode, and does not cross up;
  - it rolls `leave` once a step, asked as a returning forager, or as a raider if recruited, at §48.3's rates; a yes is its pass, and it climbs out;
  - it senses its place as `hole`, so its `leave` key has the top-down form;
  - porters, carriers of spoil, corpses or brood, the young and middle-aged, and finders going home to tell are never held.
- **Who comes to it.** A rested returner with empty jaws is held as soon as it is down its hole (owner: it doesn't go down first). A tired one goes down to rest; rested, `arrive` sends it out as before, and it is held at the top. A carrier that came down with food has a pass back out (`leaveOk`), used when it climbs out.
- **The cue.** Each carrier down its own hole with food counts once a tick for its colony (`#holeIn`; `#returning` is keyed by cell with no layer). Every held ant adds last tick's count to `met`: the carrier walks down past all of them. `met` leaks on both layers. `crowd` is the nestmates in a held ant's cell and the six round it, over `CROWD_HALF`.
- **Gates.** `gatesFor` gains `hold` (one world's curtain). In one world `gate` is off on the plane, where nobody waits. `rgate` and `sgate` are unchanged (the plane's), so raiders still walk the tunnels.
- **Raids.** `leave` = raid sends a held ant out as a recruited raid scout, in fight; the local rule's crowded home with no returns makes them. Ants held at the gate smell the plane's raid trail on their hole's cell and the six round it (owner), and are recruited by it at `raidRecruit` × level. A raid ends as before, at the plane disc, with no trail there.
- **Not in the plan: a finder lays its trail on to its hole.** On open ground a finder stops telling at the nest's rim, where the waiting ants are. In one world the trail then ended at the plane disc's rim, three cells from the hole: within a cell of the hole it peaked at 0.006 (G1 seed 4, 300 s), under FAINT (0.05), and no held ant was ever recruited. Now a finder in one world tells until it goes down its hole: 0.42 within a cell of it on the same seed.
- **Counters** for the assays: `gateHeld`, `raidScouts`, `finds`, `recruits`. `SAVE_VERSION` 6.

**Results** (local rule; seeds 1–10; full table in `docs/one-world.md` §5, "ja-web as built"):

| | With returns | Deaf (`leaveGate` 10⁹) | `main` (no gate) |
|---|---|---|---|
| A5 pass | 0/10 | 0/10 | 0/10 |
| A5 outside before food | 0.39 | 0.39 | 0.38 |
| A5 outside once food flows | 0.20 | 0.21 | 0.21 |
| A5 trips out per minute, before / after | 88 / 294 | 88 / 265 | 105 / 323 |
| A5 food stored | 889 | 689 | 1,060 |
| A5b pass | 7/10 | 6/10 | 6/10 |
| A5b trips out per minute, flowing / gone | 341 / 120 | 286 / 125 | 365 / 167 |
| A5b food stored | 762 | 559 | 632 |
| Held at the gate, mean | 16–18 | 35–36 | — |

- **A5 fails on one world, as on `main`.** The middle-aged go out unheld: they carry spoil up and out (U3c), then forage on the plane. On seed 1 at 60 s, 107 of the 162 ants outside before food were middle-aged (`main`: 110 of 217). The gate halves the old foragers outside (55 against 107), but only they pass it. Outside once food flows stays low because a carrier's trip down the shaft to reception counts as inside.
- **The returns do the work where food flows:** A5b stores 762 with them and 559 deaf, and departures fall once food is gone (120 trips a minute against `main`'s 167).
- **G1** (both colonies, against `main` on the same seeds): food carried down −0.3 % (44,582 against 44,711), births +3.7 %, crossings up +2.6 %, ants lost **+28 %** (1,679 against 1,315). Raids return: 187 raid scouts, 47 finds and 15 recruits over 20 colonies (none on `main`); recruits on 5 of 10 seeds, and seed 7 had no find. Few ants wait (2.6–7.4 a colony on average) while food keeps coming, so few are there to recruit. Held food still fails (`ja-lp4.6.3`).
- **The assays on the plane** (against U6a): A1 8/10 (6/10), A2b 8/10 (9/10), A6 5/10 and A9 3/10 unchanged, A10 0/10. A8 solo stores 18 % less than `main` per seed (median 2,697 against 3,300).
- **Unity** peaks a little lower in 600 s: 0.10–0.26 % at 300 + 300 and 0.14–0.39 % at 600 + 600 (U6a 0.11–0.29 % and 0.16–0.43 %). **The slow unity guard fails:** seed 3 at 600 + 600, which unified at 732 s under U6a, peaks at 0.44 % and never unifies in 1,800 s. The owner skipped the guard until `MET` or its window changes (`ja-lp4.6.6`); `UNITY=1 npm run test:slow` runs it.
- **Tick** at 1,200 + 1,200 (`colony-bench --one --page`, second half): 10.66 and 10.81 ms against `main`'s 9.10 and 9.31 on the same machine, **over the owner's 10 ms gate**. The gate's own code is about 1 % of the time; the plane's raid sensing (MR 5.2's `#raidLevel`, 2.3 %) now runs, since one world now lays raid trails.
- **Owner (2026-11-10, PR #68):** merged over the tick gate (the lazy raid sense is `ja-lp4.6.7`'s, before U6b); the middle-aged left unheld for later (`ja-lp4.6.8`); G1's few recruits accepted, for U6b's raid assays to watch (`ja-lp4.6.9`).
- **Tuning:** none. Neither A5b's nor G1's food fell, so `WAIT_STEPS` stays 3; `leaveGate` and `scoutRate` stay as §48.4 set them.

**Jev.** `RESPONSE_LEGEND`'s stance sentence now covers one world: stance is the ant's own "on open ground, and in a nest whose hole opens onto open ground, above and below"; the colony's in a nest under a narrow strip of ground. `RESPONSE_BRAIN_VERSION` 11. The response lanes are not shipped in precache, so nothing is re-shipped and nothing was spent. The mode lane's legend has the same sentence and is not changed here: that would re-ship the mode answers (`ja-lp4.13`).

**Cost** (`colony-cost`, offline, against `main` on the same machine):

| | This branch | `main` |
|---|---|---|
| One world, `leave` lane, if asked | 15 situations, ~1,940 tok/q (estimated), ~$0.007/h | never asked |
| One world, the six response lanes | ~$0.154/h | ~$0.125/h |
| One world, mode | ~776 tok/q, ~$0.103/h | ~784 tok/q, ~$0.095/h |
| Side view, the six response lanes | ~$0.193/h | ~$0.190/h |
| Top-down, the six response lanes | ~$0.0216/h | ~$0.0213/h |

The page asks none of the response lanes yet. One world's mode lane sees more distinct situations (192 against 158) and fewer mode choices, since held ants skip the mode policy.

## 49. Raiders follow a scout's trail (behaviour MR 5.2, ja-tu3, ja-jwy, 2026-11-06)

Research basis: `docs/raid-recruitment.md`. Every figure in it was read in a search summary, not the paper (the hosts were outside the network allowlist), so all are **unverified**.
- Slave-making ants send scouts first. Removing *Polyergus breviceps* scouts left raids on 2 of 11 days (Topoff et al. 1987). A scout that finds a host nest goes home and recruits at its own entrance, and a column follows. Whether raiders follow a scent trail is disputed; a trail plus sight fits.
- At a border an encounter recruits: honeypot-ant tournaments by alarm and a trail, weaver ants by a sternal-gland attractant and a rectal-gland trail.
- Not found: whether rivals follow each other's trails, how a scout senses a rival nest itself, when a raid is called off. So the finder's cue is the sense the game has (meeting strangers), and a rival-nest odour is not built.

### 49.1 What was there

- A raiding colony's fighters steered straight at `raidTarget`, the rival hole's coordinates. No ant senses those (vision gap "Stance and raids").
- Bead ja-jwy said a straight line sticks behind rock. In the new assay A11 it doesn't on `main`: raiders get round a pocket of wall (39 % reach the rival, 1 % stuck), by the detour rule. So the change here is the sense, not a rescue from walls.

### 49.2 What MR 5.2 built (top-down maps; `raidGate` 1)

- **A raid stance is a bias, not an order.** The colony's stance is still broadcast, but an ant acts on it only if it is **recruited** (`recruited`, `#stanceOf`). Every other ant carries on as a forager, so a raid stance idles no one. An ant is recruited by:
  - **smelling a scout's raid trail** (its cell and its three sensors, `#raidSense`), or
  - **going out as a scout**: an ant at home with empty jaws rolls `raidScout` (1/90 per second) and goes out in mode fight.
  A recruited ant's raid ends when it is home again with no raid trail under it (event-driven; `#gone` records that it went out). No waiting state and no clock: the raid ends when the trail fades or was never laid.
  "Scouts" are not a few: `raidScout` applies to every empty-jawed ant at home, so with ~500 home about 5 a second go out, come back and are foragers again. A12 (1.00) says it costs the larder nothing.
- **One sense of the raid trail** (`#raidSmelt`, review of #41 N1): the ant's cell and its three sensors, for recruiting, for `Touch.raid` and for keeping an ant recruited. Off the gate, "strong".
- **No coordinates on top-down maps at all** (review of #41 S2): an ant not recruited but in mode fight (Jev's mode lane, or a contact) fell through to the old walk to `raidTarget` (232,682 ant-ticks in G′ seed 1 under the Warlike cache). That branch is now the side view's and `raidGate` 0's only.
- **Legends** (review of #41 S1): `stance` is "what the colony asks of this ant: forage; defend; or raid, which an ant does only once a scout's raid trail has recruited it or it has gone out as a scout". `COLONY_BRAIN_VERSION` 6.
- **A finder.** A recruited ant outside with empty jaws, no raid trail under it, and `findAt` (0.3) seconds of contact with strangers goes home (mode forced to "return", fleeing from them) and lays the new **`raid` channel** on the way: `raidLay` × `deposit`, 0.5 + seconds met (at most 3), falling with time since the find as the food trail does. Channel: evaporation 0.04, diffusion 0.3 (a fifth channel, as `noEntry` was a fourth; asleep until used).
- **Fighters follow it.** A recruited ant with no enemy near climbs the raid trail; with none it walks out, away from its home trail, and wanders (a scout). Walking to the coordinates is gone on top-down maps; the side view keeps it (its raiders already walk the tunnels cell by cell).
- **`Touch.stance` is the ant's own** (`#stanceOf`): forage for an ant not recruited, so Jev's mode and `leave` questions for it are a forager's. **`Touch.raid`** (none, faint, strong) is sent to the `leave` lane only, and only for a raider: a recruited ant home in mode return is asked in mode fight, with the raid trail; a forager in mode return, with its returns. Keys: `…|raid:…` and `…|returns:…`. `leave` locally: a raider goes on a trail and waits without one; a forager on a defend stance goes out whatever comes back, as in MR 5.
- **Versions:** `RESPONSE_BRAIN_VERSION` 9. Mode and stance lanes unchanged.
- **Side view and `raidGate` 0:** the same as `main`; the side-view golden is bit for bit, the top-down golden re-recorded.
- **How it got here.** The first version made raiders wait at home for a trail. Waiting needs something to end it, and a stopwatch (`raidPatience`, 120 s) was the only thing a waiting ant had; the user rejected a clock, and the bias is the alternative. The clock version is in the history of PR #41 (commits `cba2721`–`2e7a4d3`). It reached more raiders (A11 gain 1.67), and it did not fix the replays.

### 49.3 Results (local rule; stance as a bias)

**A11, raiders find the rival round a pocket of wall** (200 ants against 80 defenders, 300 s; seeds 1–20). Reported over the ants recruited to the raid:
- **With the trail:** 0.19 of the colony's ants reach the rival's nest (0.12–0.32) as raiders; **with no trail laid** (`raidLay` 0: scouts alone) 0.14 (0.10–0.17); `raidGate` 0, every ant sent at the coordinates (`straight`): 0.39 (0.28–0.53).
- **Gain** 1.24 median (0.89–2.75); the mark (at least 1.5× and at most 10 % stuck) passes 7/20 seeds. Stuck: 1 %. The clock version gained 1.67 (12/20). Only ants that pass near the nest, or are there, smell the trail, and most of a colony in an arena with no food is out exploring. A stronger lay (`raidLay` 3, 8) did not help (the trail smears), and nor did recruiting by contact with a finder coming home (tried, dropped). Filed as ja-sf1. *The diagnosis was wrong: see 49.7.*

**A12, a raid no one can find** (new; the first colony forced onto a raid stance, the rival sealed in rock, a food pile to forage; 900 s): food stored against the same colony on a forage stance **1.00, 20/20** (0.99 worst). On the first version (waiting raiders) it stored 10 of 7,400.

**A6 few against many through a pass** (seeds 1–20): pass 16/20, gain 1.82 (1.16–2.88) (`main`: 9/10, 2.36; the clock version 1.70). *Stale: the merged code measures 3/20, 1.26; see 49.7.*

**A1–A5b, A9** (seeds 1–10): pass 10/10 each, as before (no raids in them).

**G′, the top-down game, seeds 1–20** (both colonies; medians and extremes, totals not kept):

| | Bias | Coordinates (`main`) |
|---|---|---|
| First colony: ants alive at the end | 897 (3–900) | 855 (38–900) |
| First colony: food stored | 4,431 (1,471–6,076) | 4,086 (1,337–5,780) |
| First colony: ants lost | 865 (82–1,180) | 880 (131–1,260) |
| Rival: food stored | 4,319 (2,082–5,870) | 3,860 |
| Rival: ants lost | 847 (84–1,187) | 862 (123–1,186) |

Food +8 % and +12 %, losses the same. **The worst seed is worse:** seed 19 (ja-hgq) ends with 3 ants against 38. The rival is full (900) and raids from 60 s on.

### 49.4 Jev (at most $0.10)

- **Live:** `colony-live.mjs all --top`, about 250,000 input tokens a run, **$0.0105–0.0109** each (seven runs over the PR; the lane with a new sense is `leave`). Caches `experiments/caches/mr52-top-*.json`, versions 6 / 4 / 9.
- **The first version asked a waiting raider as a returning forager** (review of #41, S1): both got one key and one answer. Now a recruited ant is asked as a raider (fight, with the raid trail) and a forager as a forager (return, with its returns), and the legend no longer tells Jev to override its doctrine.
- **Replays** (G′ seeds 1–6, the first colony's food stored and ants lost; the local rule: 4,186 and 915) *(stale: `main` replays differently today; see 49.7)*:

| | All lanes: food stored | Lost | `leave` and `stance` only (as MR 5's caches) | MR 5 (food) |
|---|---|---|---|---|
| Forage | 5,069 (+21 %) | 825 | 4,860 (+16 %) | +0.3 % |
| Cautious | 3,803 (−9 %) | 636 | 4,679 (+12 %) | −1.6 % |
| Warlike | 1,994 (−52 %) | 859 | 3,521 (−16 %) | −5.5 % |

- **Like for like.** MR 5's caches held only the `leave` and `stance` lanes (`experiments/caches/README.md`); this MR's were recorded with every lane, so Jev's mode, contact and trail answers are in them too. Stripped to the same two lanes (no spend), Forage and Cautious gain and Warlike loses 16 % (MR 5: −5.5 %). Most of Warlike's −52 % is Jev's mode and contact answers under a warlike doctrine (more ants sent to fight), not the raid trail.
- **Warlike's mode answers cost about half the food top-down, on `main` too** (the owner's review of #41, G′ seed 1): the MR 5.2 Warlike cache answers `fight` for 84 of 145 forage situations; with its mode answers removed it stores 5,181 against the local rule's 5,278 (−2 %), and the same mode answers on `main` store 2,344 (−56 %). MR 3–5 never recorded top-down mode answers, so this is the first measure of it, not a regression (`ja-7je`).
- **Why Cautious recovered.** In the waiting version a larder-full colony sat on a raid stance for good, its ants waiting or sent home by the doctrine's mode answers, and stored nothing more (a minute-by-minute trace of seed 1: 847 of 900 ants in mode return, 4–90 outside). As a bias, a raid stance leaves the foragers foraging.
- **Warlike's all-lane loss is not the trail's:** with the old coordinates (`raidGate` 0) the same all-lane cache stores 1,860. A second Cautious recording agreed with the first on 272 of 290 mode answers, so it is not run-to-run noise either. What remains like for like is Warlike −16 % against MR 5's −5.5 % (`ja-7je`).
- **Cost** (`colony-cost --side`): mode ~686 tokens per question, ~$0.078/h (MR 5: 651, $0.074), from the longer stance sentence in the legend; all six response lanes together ~$0.121/h (MR 5: $0.109).

### 49.5 How a raid ends

Research: `docs/raid-recruitment.md`, "How a raid ends" (all **unverified**; search summaries only): *Polyergus* raiders that mill about a host nest for a few minutes begin an incohesive retreat; nothing found says an order ends a raid; trails fade without reinforcement.
- **In the model**, nothing ends a raid by decision. A raid lives while a scout's trail does: it is laid by finders, it fades (half-life about 17 s), and an ant home with none under it goes back to foraging. A scout that finds nothing tires (the existing fatigue, MR 3.1) and comes home.
- **Tried and dropped: a patience clock.** A raider that waited `raidPatience` (120 s) at home stood down. It needed a stopwatch because the design had raiders wait; see 49.2. Clocks elsewhere in the code are filed: ja-d8e, ja-cgv, ja-79f, ja-9ve, ja-hy1.
- **Left out:** a call-off that spreads by contact with raiders coming home empty (one summary line behind it); the strategist reading how many raiders idle (a colony-wide count no ant senses).

### 49.6 Left out

- **The side view** still raids by coordinates and tunnel; its trail needs the tunnels' own senses (`ja-1a9`).
- **Food or loot at a rival's entrance** (ja-um8's deferred note from MR 2) needs brood and prey carrying: `ja-gkl`.
- **Stance** is still broadcast (`ja-k4k.6`).
- **A rival-nest odour,** column marching, call-off: no sources reached.

### 49.7 The trail points, the search finds (ja-sf1, 2026-11-08)

**What was wrong.** A11 with probes for who is recruited, where, and where finds happen (seeds 1–20, the MR 5.2 code):
- **Recruiting was never short.** 81 % of the colony was recruited (0.70–0.99), 43 % of them at home, and the trail was smelt at the nest's rim in 47 % of samples. 49.3's "only ants near the nest smell the trail" was wrong.
- **The trail ends short of the nest.** A finder lays it from where it first met strangers: 25 cells from the rival's nest (17–34; the nests are 80 apart). Recruits climbed it to its end, its strongest point, and stayed there; 20 % of them ever came within reach of the nest, and 32 % died.
- **Tried and dropped: raiders re-laying the trail** on their way home from strangers (the fire-ant and ponerine picture, `docs/raid-recruitment.md`). The trail at the nest's rim was four times as strong (0.81 against 0.20) and smelt in 73 % of samples; reach did not move (gain 1.19).
- **Tried and dropped: a later find** (`findAt` 1, 2, 4 s): gain 1.70, 1.22, 1.00, the worst seed 0.70 at best.

**What changed** (`raidOnward` 1):
- A raider on the raid trail, facing along it (its front sensor the strongest), that finds nothing ahead as strong as underfoot leaves the trail and searches on, out and away from home, as a scout does. It ignores raid trails until it is home, where the flag clears; that includes a fresher, longer one another finder lays meanwhile.
- **Where it fires** (the owner's probe, review of #44, seeds 1–3): mostly near home, a median 0.05–0.19 of the way out, 81–92 % of the times within 40 % of it. The lay fades with time since the find, so near the nest the trail is faint and patchy, and a dip ahead reads as nothing stronger. So the trail recruits and points the way, and the search does the rest. Allowed only where the trail underfoot is strong, as at a real end, A11 gained less: 1.67 against 2.01 (seeds 1–4).
- If a searching raider meets strangers with no trail under it, it is a finder, and lays a trail home from there.
- No new sense: it reads the same three sensors as the climb. No clock. Nothing an ant is asked changed, so Jev's keys and caches stand and nothing was spent.
- Research: `docs/raid-recruitment.md`, "The trail points, the search finds" (a scout's run then sector search; trails kept by those who use them; all **unverified**).

**A11** (raidOnward 1 against 0, the same code):

| | Gain (median, range) | Seeds at the mark | Reach | Recruits that reach |
|---|---|---|---|---|
| Seeds 1–20 | **2.04** (1.32–4.40) against 1.33 (0.48–2.90) | **16/20** against 7/20 | 0.28 against 0.17 | 0.34 against 0.21 |
| Seeds 21–40 | **1.84** (0.97–5.10) against 1.55 (0.69–4.29) | **13/20** against 11/20 | 0.26 against 0.19 | 0.32 against 0.25 |

`straight` (every ant at the coordinates) reaches 0.39; stuck stays 1 %. The slow suite now guards the mark (6 of seeds 1–10), no longer a todo.

**A6, corrected (an assay change, not this fix).** 49.3's A6 (16/20, gain 1.82) is stale: the merge commit of #41 measures **3/20, gain 1.26**, and so does `main`. The number was taken before the owner's review moved unrecruited fighters off the coordinates, after which A6's attackers (all in fight, on a raid stance) went only as recruits, a few at a time, and no battle formed at the pass. A6 is about who reaches whom at a pass, not about finding the rival, so its attackers now all march at the defenders' hole (`raidGate` 0 in both its runs): **14/20, gain 1.74** (1.18–5.20); before MR 5.2, 9/10 and 2.36. raidOnward does not change it (6/20, 1.20 against 1.23, the old spec).

**A12** 20/20 (food 1.00 of the forage colony's), **A5, A9** 20/20: unchanged.

**G′, seeds 1–20** (first colony; medians, worst in brackets):

| | raidOnward | `main` |
|---|---|---|
| Ants alive at the end | 892 (223) | 895 (1) |
| Food stored | 4,274 (1,816) | 4,085 (1,491) |
| Ants lost | 848 | 826 |
| Rival: food stored / lost | 4,179 / 828 | 4,110 / 773 |

Food +5 %, losses +3 %. **The worst seed recovers:** seed 19 ends with 223 ants (`main`: 1; ja-hgq). Seeds 15 and 17 end with fewer (565 and 357 against 724 and 762).

**Jev replays** (G′ seeds 1–6, the first colony's food stored and ants lost; the local rule: 4,088 and 918 on this branch, 4,083 and 901 on `main`):

| Cache | raidOnward: food stored | Lost | `main` today: food stored | Lost | Food against `main` |
|---|---|---|---|---|---|
| Forage | 4,128 | 846 | 4,363 | 824 | −5 % |
| Cautious | 3,444 | 571 | 3,853 | 592 | −11 % |
| Warlike | 3,219 | 850 | 3,472 | 866 | −7 % |

- **Under Jev's cached answers the colony stores 5–11 % less** on seeds 1–6, with losses the same, though the local rule is level on those seeds and +5 % over seeds 1–20. Six seeds is a small sample, and all three caches point the same way, so it is recorded, not explained.
- **49.4's replay figures are stale too:** `main` today replays Warlike at 3,472, not 1,994 (and Forage 4,363, not 5,069). They were taken before the owner's review fixes in #41, as A6 was.

**Cost:** unchanged on every lane (no legend, question or brain version changed).

## 50. The fungus game: decisions (ja-lo8, 2026-11-06 / 07)

The page was a sim with everything on one screen. The owner asked for a game, to be built in ten stacked slices under the epic `ja-lo8` (slice beads `ja-lo8.1`–`.10`). These are the owner's decisions, from the plan's review.

**The game.**
- The player starts as a fungus that lands near a colony's entrance.
- **The fungus policy is always the player's, and it is the game's main handle.**
  - The player writes an aim in words. Jev sets a **level for every lever**, per situation the fungus senses inside its host. The answer is no longer one bundle: the owner wants to pull many levers at once, interpreted from natural language.
  - The levers bend what the host **perceives** and what it **gives off** ([fungus-policy §11](fungus-policy.md#11-what-the-fungus-senses-inside-an-ant-and-its-levers)).
  - The senses may be finer than before. The fungus's own load is dropped as a sense, and the host's mode was never one.
- **Answers fill in as situations come up.** When the aim changes, old answers stay in force, dimmed, until each situation's new answer arrives. *(Superseded where Jev can answer by §50.17: the local rule plays until the new answer arrives; the old answers play only while Jev can't run.)* Nothing re-asks the whole table, and nothing is pre-asked.
- **The table stays out of sight.** It and per-cell pins are available in Learn and Details, not on the main screen, so the main screen keeps some magic.
- **One fungus.** The three strains become lab presets.
- **Colony policy is hidden until the fungus infects a queen.**
  - After that, a colony's policy changes **only when a new queen is born**: a free rewrite, at that moment only.
  - The new words drive **only her offspring**, in the **daughter colony she founds**.
  - Her ants act on her mother's answers, dimmed, until their own arrive. *(Superseded by §50.17: on new words her ants play the local rule until their answers arrive; her mother's answers play only while Jev can't run.)*
- **How the new queen gets the fungus.** She picks it up by contact on her way out of the nest. No vertical transmission ([new-queens §4](new-queens.md#4-where-the-fungus-comes-in)).
- **The fungus's lever on queen birth** must be a real lever in the catalogue. There are two: *queen signal* (emission, in the queen) and *queen scent* (perception, in nurses). Both are design, and both are built.
- **Pace.**
  - The page defaults to a faster speed (4×) rather than a separate game clock, so every rate scales together and no sim constant changes.
  - Queen births may stay rare.
  - **Games are saved** (IndexedDB autosave, slots) and played over several sittings.
- **Jev is always on** (superseded by §50.11: Jev is asked only for situations with no cached answer, under one daily budget).
  - The page ships answers for the preset doctrines.
  - When Jev cannot answer (no key, funds or cap spent, the Pages build), the game keeps playing on cached answers, but **no policy can be changed**, the fungus's or the ants'.
- **Main screen and Details.** The main screen is decluttered. The colony table, Jev's figures, unity, infection, world settings and the lab tools move to a Details screen.

**Research.** [new-queens.md](new-queens.md) (new):
- colonies rear queens when large;
- the queen's pheromone holds it back, and in fire ants workers kill sexual larvae while they sense it (Klobuchar & Deslippe 2002);
- founding is claustral, on the queen's reserves.

The game's rule follows: a fed larva where nurses perceive a faint queen's mark becomes a gyne, and one where they perceive a strong mark is culled.

**Superseded.** `ja-ygc` (doctrine inherited by a fraction, through a founding queen) is superseded by the epic: a full rewrite, but only at a queen's birth.

**Cost.** This section changes no request. Slice 4 (`ja-lo8.4`) changes the fungus lane's legend, situation and questions, and will report its tokens per question.

### 50.1 Slice 2: the main screen, Details, Jev always on (ja-lo8.2, 2026-11-07)

**The main screen** holds four things:
- the field;
- a top bar: Play/Pause, speeds 0.5–4×, sim time, and one line on where the game stands;
- the fungus's panel: its share in each colony, unity, and its aim (presets and words);
- the followed ant's card.

**The Details screen** takes everything else:
- the colony table and mode counts;
- Jev's spend, caches, Stop and Resume;
- infection, resistance and unity figures;
- the world's settings (seed, ground, rival, ants, speed slider, trails);
- the **lab**: the fungus's menu, hide and cull, and each colony's doctrine, for experiments. (The spore brush and strain picker were here until §50.15.)

**Learn** shows doctrines read-only. **Removed:** the lure and alarm brushes, which painted only the first colony's fields.

**Jev is always on** (`ui/policyLock.ts`, tested):
- **When it starts.** The page starts a run once the server and its key are there, and starts a new one after a time cap. A spend cap or a Stop is final until the player presses Resume.
- **Cached answers play whether or not a run is on.** `colonyJev.ts` `#lookup` no longer falls back to the local rule just because no run is on; only uncached situations use the local rule.
- **What locks the policies:** the probe pending, no server, no key, a run starting, stopped or capped. While locked, every editor that sets words or the menu is disabled and says why, and `useColonyJev`'s setters refuse words. Losing Jev mid-game raises a notice (`ui/toasts.ts`).

**Measured.**
- A page load with a key started a run by itself: 17 requests and $0.0007 in 7 s.
- With the key unset, the aim is disabled and the panel reads "JEV_API_KEY is not set…".
- Desktop and phone layouts were checked with Playwright: no page errors, and no sideways scroll on the Details screen.

**No behaviour change in the sim.** Goldens are untouched, and requests and their contexts are byte-identical, so the cost is unchanged.

### 50.2 Slice 3: shipped answers, and stale answers that fill in (ja-lo8.3, 2026-11-07)

**Shipped answers.** `scripts/precache.mjs` asked Jev every mode situation (3,888) and every strategist view (324) under each preset doctrine (Forage, Cautious, Warlike):
- **Packing:** the browser's own packers, keys and contexts.
- **Cost:** 129 requests, **$0.1046** in total (estimate $0.1245), 0 failed.
- **Output:** 12,636 answers in `web/public/precache/`, 708 kB raw, about 11 kB gzipped per mode bundle.
- **Loading:** at start the page fetches them once (`ui/precache.ts`) and seeds the client's caches (`ColonyJev.seed`), under any answer the browser already has. Only answers the lane's question allows are kept.
- **Guard:** `tests/precache.test.ts` fails when a bundle's context or a brain version no longer matches the code.

**Measured:**
- **A fresh browser with a key:** 0 requests in 8 s, and 100 % of mode choices from the cache. Before, a page load made 17 requests in 7 s ($0.0007).
- **The Pages build** (`vite preview` under `/ant-sym/`) plays 3,888 mode and 324 stance answers with no server, and says why policies are locked.

**Stale answers fill in** (owner, PRD §50: "dim the old values and fill them in as they roll"):
- **Earlier contexts.** Each lane keeps up to three earlier contexts. On a new doctrine or aim, a situation with no answer under the new words plays the newest earlier answer, and is queued to be asked again.
- **Display.** The ant card shows it faded, "by Jev's answer under its earlier doctrine (aim), while the new one is asked".
- **Daughters.** `setDoctrineFor(k, words, inherit)` makes a lane fall back on other words instead: a daughter colony on her mother's doctrine (ja-lo8.9).
- **Nothing is asked all at once.**

**Superseded where Jev can answer** (§50.12, 2026-11-08): new words play the local rule until their answers arrive; the earlier answers act only while Jev can't run, and `inherit` is gone.

**No sim change.** The goldens are untouched. Requests and contexts are byte-identical, so there are no new tokens per question.

### 50.3 Slice 4: fungus v2: senses inside the ant, a level for every lever (ja-lo8.4, 2026-11-07)

**What changed** (fungus-policy §11):

*The fungal situation*
- **What it is now:** what the fungus senses inside its host:
  - arousal: calm, alarmed or fighting, from what the host last perceived;
  - touch: none, nestmate or foreigner;
  - place: outside, tunnel, chamber, or by the queen (her royal mark underfoot; a nest's disc on top-down maps);
  - task: the age band, nurse, inside or forager;
  - carrying: nothing, food or brood;
  - groomed.

  That makes 648 situations.
- **What is gone:** the host's mode, the fungus's load, the strain, and the chamber owner's `ground`. This closes `ja-k4k.7`. A test pins that a host's situation does not change with its mode.

*The answer*
- **Levels, not one intervention.** Each answer is a level per lever (`levers.ts`): 15 levers, of which 13 are non-lethal and on the menu by default (11 on top-down maps, with no floor marks). Jev is asked one `score` question per lever on the menu. The answer is cached as the levels in table order, so the key carries the levers asked.
- **The menu is a set of levers.** Lethal levers (odour weapon, crown) are off until turned on, and never asked while off.
- **Strains** keep their spread traits and a default preset, and lose their `allows` gating.
- **Presets.** The old interventions are now presets: named sets of levels whose values are exactly the old bundles'. So the local rule (each strain's default, plus the hide and cull settings) plays as before.
- **Goldens are unchanged:** they paint no spores.

*Hiding*
- Hiding is now the "fungus showing" lever (`Colony.show`, not lerped by load). It replaces `expr === 0` plus "dormant on the menu".
- `expr` names the preset a host's levels are, or `CUSTOM` (255) for Jev's own mix.

*The lane*
- **Batching:** at most 50 hosts to a request (`FUNGUS_BATCH`). The lane waits up to 2 s for a part-full request to fill (`FUNGUS_GATHER_MS`, `ColonyJevOptions.gatherMs`), since the legend is most of a small request. Hosts play their stale or default levels meanwhile.
- **The legend** names each lever in a few words (`brief`), about 807 estimated tokens. A first draft that spelled out every level's words was about 2,000.

*The UI*
- **The ant card** lists what the fungus senses, then the levers it pulls, with stale ones dimmed.
- **Learn → "How the fungus works"** has a one-line diagram, the senses, the levers, the local rule, and a "Show the table" toggle. The table lists Jev's answers so far, lazily filled, with an earlier aim's answers dimmed.
- **Lever chips** replace intervention chips, in Details and Learn.
- **Pins are not built** (`ja-lo8.11`): the owner asked that the table stay out of sight anyway.

**Cost (live):**
- **A live check of 4 situations under "Unite":** 3,530 input tokens, 883 per situation, against an estimate of 3,358. Every score parsed.
  - Jev pulled the fungal odour (some) and the calming cue (some) everywhere.
  - Where hosts touched foreigners it also had them read rival trails partly and damped the alarm laid.
  - It leaked trail where a forager carrying food met a foreigner.
- **Shipped fungus answers.** `precache.mjs --lanes fungus` asked the 90 situations a recorded side-view game meets (Garden on both royal chambers, Lockpick at both holes, 300 s) under each preset aim. That is 270 answers for **$0.0082**, about 724 real tokens per situation at about 45 to a request.

**Cost as a game asks** (`node scripts/fungus-cost.mjs`, estimated, 5 minutes, 600 + 600 ants, seed 1):

| Play | Situations | Requests | Tokens / situation | $ / game | $ / h |
|---|---|---|---|---|---|
| Garden | 91 | 23 | 842 | 0.0032 | 0.039 |
| Lockpick | 58 | 15 | 847 | 0.0021 | 0.025 |
| Bloom | 68 | 23 | 914 | 0.0026 | 0.031 |

Before (§39): 44–81 situations and about 560 tokens per situation as asked, $0.001–0.002 a game. Asking every lever costs about 1.5× per situation, under a cent an hour more.

### 50.4 Slice 5: start, 4×, the landing, goals (ja-lo8.5, 2026-11-07)

**Built:**
- **The start screen** (`ui/StartScreen.tsx`) explains what the player is and has a world seed and Start. The field waits behind it, paused.
- **Start lands the fungus.** `Game.land(k, strain)` drops spores on the ground just past colony k's hole: 3 cells along, radius 2, 3 spores, and no ant dosed directly. The first hosts are ants that walk through it. The game's fungus is Garden.
- **Every later game lands too.** Once started, New world and Restart also begin with the landing.
- **Speed.** The page defaults to **4×**, the top bar offers 1–8×, and Details has a slider to 8×. No sim constant changed (owner, §50).
- **"Running at N×".** The top bar shows it when the measured sim-seconds per wall-second fall below 85 % of the speed asked (`ColonyStats.pace`).
- **Goals.** `colony/chapters.ts` (pure, tested) drives a goal line in the top bar and a notice when a chapter ends:
  1. land;
  2. a first host;
  3. a quarter of the colony;
  4. the queen;
  5. a new queen;
  6. her colony.

  Chapters 4–6 wait on `ja-lo8.7` and `ja-lo8.9`.

**Measured:**
- **The landing:** the first host within 2 minutes (test). In the browser, Garden took the whole Ink colony about 80 s of sim after the landing, so chapter 3 passes almost at once. This is Garden's spread as built (`ja-260`, the fungus budget), and the goals wait on balance (`ja-lo8.10`).
- **Speed:** 3.6–3.8× real against 4× asked, on a 4-core machine with three benchmarks running, with no "running at" warning.

**The blocker: a 2-hour game runs every colony down.** `scripts/economy-bench.mjs`, 7,200 s (30 minutes at 4×), 600 + 600 ants, no fungus, local rule:

| Seed | First queen lost | At 7,200 s |
|---|---|---|
| 1 | Ink, by 3,600 s | Ink gone; Amber 95 ants, its intake 0.07/s |
| 2 | Ink, by 1,200 s | both gone: Amber's last ants aged out with 123 unfed larvae beside 325 food in its larder |
| 3 | Amber, by 1,200 s | Amber gone; Ink 137 ants, falling |

Three existing problems, each with its bead:
- **War (`ja-war`).** About 1,000 ants of the losing colony die in fights, and raids reach a queen within 20–60 min.
- **Surface food runs out (`ja-p0k`).** About three quarters of the map's food lies underground and is never foraged, so intake falls to 0 by 2,400 s.
- **Feeding collapses (`ja-xu6`).** On seed 2, larvae starve beside a full larder once the young are gone.

Since the queen and new queens are the game's middle chapters, slices 7–9 need colonies that last. The owner decides how (§50.5).

### 50.5 Keeping colonies alive in long games: the owner's choice, and food that regrows (2026-11-07)

**Decision** (owner, on §50.4's finding):
- **Built now:** food regrows.
- **Wanted, as beads if hard:** foraging underground food (`ja-p0k`) and fixing larvae that starve beside a full larder (`ja-xu6`). Both are behaviour MRs:
  - `ja-xu6`'s cause is the age bar on porting and nursing (`#port`, `#nurse`: band 2 never). When births stall, nobody old moves food to the brood. Lifting the bar changes behaviour from the first minute, since founders start up to half a lifespan old, so goldens and assays have to be redone (`ja-k4k.1`).
  - `ja-xu6` now blocks the queen-birth slice (`ja-lo8.9`).
- **Left alone:** the war (`ja-war`).

**Regrowth (`GameParams.regrow`, `GAME_REGROW` = 1,800 s).**
- **What grows back:** the food piles the world began with on the ground (the side view's walkway; every pile top-down) grow back toward their first size. Each unit comes back with chance deficit ÷ 1,800 a second.
- **Constraints:**
  - whole units only, so no trace amounts that ants would smell;
  - not under the mound;
  - on its own random stream, so the game's draws are untouched;
  - food that grows back is added to `map.foodTotal`, so food conservation still balances.
- **Where it's on:** the page. Off by default, so goldens, assays and tests are unchanged (`tests/regrow.test.ts`).
- **Ceiling:** about 7,000 units of ground food on seed 1's map, so at most about 4 food/s map-wide when it is all eaten.

**Measured** (`REGROW=1800 node scripts/economy-bench.mjs <seed> 7200 600 2 1200`; no fungus; 7,200 s is 30 minutes at 4×; Ink / Amber workers):

| Seed | Without regrowth | With regrowth |
|---|---|---|
| 1 | Ink gone; Amber 95 | **579 / 425**, both queens alive; intake 0.5–0.6/s each |
| 2 | both gone | Ink's workers all died in war by 4,800 s (1,065 lost; queen alive, no brood that can finish); **Amber 783** |
| 3 | Amber gone; Ink 137 | **858 / 381** at 6,000 s, both queens alive |

Regrowth ends the starvation: a lone colony now holds steady. War still ends a colony on one seed in three (`ja-war`, left as is). On seed 1 Ink held 129 unfed larvae for about 20 minutes beside 263 food in its larder before recovering: that is `ja-xu6`.

### 50.6 Slice 6: saving games (ja-lo8.6, 2026-11-07)

**How a save works.**
- **Contents.** `Game.save()` is the game as JSON:
  - the map as dug and eaten;
  - every colony, including all 64 of `Colony`'s private fields (save and load generated from their declarations);
  - each colony's scent;
  - the chamber table;
  - the fungus and recognition;
  - the game's clocks;
  - its random streams. `mulberry32` now exposes its `state`, with identical sequences.
- **Restore.** `Game.load()` pours a save into a game built afresh from the same world and settings, so every reference is wired as usual. Raid aims are saved as colony indices.
- **Format.** `colony/save.ts` encodes typed arrays as base64, chunk layers as their chunks, and Maps and Sets as lists. An object with `saveState` / `loadState` saves itself. Getters are skipped.

**The guard** (`tests/save.test.ts`, side and top-down, the fungus landed):
1. Run 40 s, save, JSON round-trip, restore into a fresh game.
2. Saving again reproduces the save field for field. A dropped field shows at once: a mutant that skips `#under` fails. `#restT` didn't, being all zeros at 40 s.
3. Run on 20 s: every typed array, scent and map layer, the spores, the brood and the chambers hash as the unbroken run's.

**On the page** (`ui/saves.ts`, IndexedDB; memory where IndexedDB can't open).
- **What a record holds:** the save, the settings that rebuild the world (seed, view, ants, rival, Restart count), and the player's state (aim, doctrines, menu, hide and cull).
- **Slots:** an autosave every 60 s and when the tab is hidden, plus two slots of the player's.
- **Where:** the start screen offers **Continue** (the newest), and Details has a Saved games card (Save here, Load).
- **Browser check:** saved at 0:48 of sim; after a page reload, Continue came back at 0:48, at chapter 4, with the fungus in all of Ink, and no page errors.

**No sim change.** Goldens are bit-exact. Nothing is asked of Jev, so the cost is unchanged.

### 50.7 Slice 7: the queen as a host (ja-lo8.7, 2026-11-07)

**Built:**
- **Her state.** `Colony.queen` (a `Queen`) gains load, strain, resistance, show and signal.
- **Infection.** `Fungus.step` adds her to the load grids, so she is a source like any host. `#stepQueen` steps her as an ant is stepped:
  - contact load from the ants around her, her attendants, at the strain's transmission;
  - spores under her;
  - grooming by the nestmates around her (up to the usual four).
- **Her own situation:** task `queen`, place `queen`, calm, touched by nestmates or none. That adds a value to `task`: 864 situations.
- **Her own levers:** "fungus showing", and the new emission lever **queen signal**. Its levels 0.1 / 0.4 / 1 / 1.5 / 2 multiply the royal mark she lays (`QUEEN_MARK × signal`, lerped by her load).
  - **Per-host asking.** Levers carry `hosts` (workers, queen, both), so a queen is asked only her two and a worker never hers (`askedLevers`, per-situation keys).
  - **What it is for.** Queen signal is the emission route to new queens (new-queens §4); the gyne rule that reads the mark comes with `ja-lo8.9`.
- **The reveal.** `Game.revealed[k]` is set the first tick the fungus is in colony k's queen (load ≥ `INFECTED`) and never cleared. It is saved with the game.
  - **What it opens:** chapter 4 ends, and Learn → Policy shows that colony's doctrine. Before, it reads "Closed to you: reach the … colony's queen". The "What Jev is sent" sample hides the words too.
  - **The lab:** Details hides the colonies' doctrines behind a "Show" button.
- **The fungus panel** shows the fungus in each queen.

**Jev:**
- `FUNGUS_BRAIN_VERSION` 6: the legend gains the queen task and the queen-signal lever.
- Re-shipped fungus answers: 93 situations per preset aim, 3 of them a queen's, for **$0.0083**.
  - Under Unite and Peace, Jev leaves a queen as she is.
  - Under Spread, it dims how much of the fungus she shows.

**Tests** (`tests/queenHost.test.ts`):
- loaded attendants infect her and clean ones don't;
- she is asked only her levers;
- a strongly damped signal cuts her mark to under half;
- the reveal fires once, stays, and survives a save.

**Pace (to balance, `ja-lo8.10` / `ja-260`).** In the browser at 8×, Garden from the landing reached Ink's queen at 46 s of sim (about 6 s of wall time), so chapters 2–4 pass almost at once. The game needs a slower or costlier spread before it is a game.

No change to the colony lanes: their requests are byte-identical, and the goldens are bit-exact (they paint no spores).

### 50.8 Slice 8: several colonies at runtime (ja-lo8.8, 2026-11-07)

**Built:**
- **`Game.addColony({ x, y, antCount, odour })`.**
  - In the side view it digs a hole in the column under x, with the world's own shaft and founding royal chamber (`world.foundNest`, exported from `digNest`). Top-down, it places a nest's disc.
  - It adds a `Colony` of that many workers at that odour (its queen in the side view), then rewires every colony: grids, burials, enemies, the other nests, raids.
  - **Kin.** A daughter at her mother's odour is kin, and is not raided by her.
- **Saves.** `Game.founded` records each founding. A save re-founds them on a fresh map before pouring the state back, and stays bit-exact (`tests/addColony.test.ts`).
- **Unity for any number of colonies.** The gap is the widest between any two standing nests' odours, and mixing counts ants within tolerance of another colony's nest. With two colonies it is the same as before.
- **The page draws any number of colonies.**
  - The field, the minimap, picking and the nest buttons (one per colony; `n` cycles them) take the colonies list.
  - `Followed` carries a colony index (`k`).
  - Names and tones go on past Ink and Amber: Jade, Rust, Slate, Moss.
  - The Jev client re-attaches when a colony is pushed onto the game's list.
- **Lab:** "Found a colony between the nests" (Details), until queens found colonies themselves (`ja-lo8.9`).

**Checked:**
- In the browser, Jade's hole, shaft, chamber and queen draw on the field, with its line in the fungus panel and its nest button.
- In tests, a third colony's ants choose and live, and the other colonies know its nest.

**Not done:** `Colony.foreign` stays "the nearest rival's trail", which already works for any number of colonies, rather than the strongest trail at the cell.

### 50.9 Review fixes (PR #42, 2026-11-07)

The PR's review found three blockers and six should-fix items; each is fixed on the branch with a test that fails without it.

**Founding colonies** (`Game.addColony`):
- **B1. A save restores the founded nest as dug.** A load re-dug each founded nest on the restored game's random stream, so a shaft could slant elsewhere (rng seed 13: x 411 instead of 417). `Founding.nest` records the nest as dug, and a load founds from it without digging.
- **B2. Its own nest index.** The colony took index k in `map.nests`, which always holds the world's two nests: with the rival off it took the unused second nest. It now takes the index of the nest it pushed.
- **S2. No shared holes.** A founding within `HOLE_GAP` (8) columns of a hole moves along to the nearest free column; top-down, `NEST_GAP` (12) between nests.
- **S3. Every colony keeps every hole open.** `Colony.seeHoles()` runs on every rewire, so an older colony's mound never buries a founded hole.
- A founded colony that falls no longer ends the game (`Game.fallen` reads the world's own colonies only).

**Saves:**
- **B3. An unreadable save never blanks the page.** Continue offers the newest save this version can read (`saves.newestReadable`); Details lists the others as from an older version, with Load disabled; a failed load plays a fresh game of the save's world with a notice; an error boundary round the app shows what broke and a Reload button.
- **S1. The save test reads Colony's `#field` declarations** and requires the save to hold exactly those, bar its random stream; the run-on hash includes each colony's private state. Dropping `tired` from the save now fails it.

**The fungus's touch is smell (S4).** `touch` was read from the colonies' occupancy grids, colony membership, which the fungus can't sense. It is now read from recognition's odour bands (`Recognition.around`, by odour, at the healthy tolerance, against the host colony's nest odour): as odours converge, a foreign ant that smells like home reads as a nestmate, and an estranged nestmate as a foreigner. The legend says so ("an ant that smells of another colony"): `FUNGUS_BRAIN_VERSION` 7.

**Jev runs only when the player changes a policy (S6, the owner's decision; superseded by §50.11).** This replaced §50's "Jev is always on":
- No run starts on page load or restarts at a time cap. A change of words, the fungus's aim or a colony's doctrine, starts one; the time cap ends it. Details → Resume still starts one by hand.
- The policy editors are open whenever Jev could run: running, starting, never started, or after a time cap. The spend cap, the player's Stop, a failed start, and no server or key lock them, saying why.
- The preset doctrines' and aims' words ship their answers and are never asked, even while a run is on (`ColonyJevOptions.shipped`): their unanswered situations play an earlier answer or the local rule, free. Restoring a save with words of the player's own starts a run.

**Cost (S5).**
- **Colony lanes:** unchanged (colony v5, stance v4).
- **Fungus lane, v7.** Re-shipped answers: 93 situations per preset aim, 279 answers for **$0.0083**, about 708 real tokens per situation. As a game asks them (`node scripts/fungus-cost.mjs`, estimated, 5 minutes, 600 + 600 ants, seed 1), now only under the player's own words:

  | Play | Situations | Requests | Tokens / situation | $ / game | $ / h |
  |---|---|---|---|---|---|
  | Garden | 94 | 24 | 867 | 0.0034 | 0.041 |
  | Lockpick | 60 | 16 | 877 | 0.0022 | 0.027 |
  | Bloom | 72 | 30 | 1,017 | 0.0031 | 0.037 |

  At v6 the same runs were 865–1,014. Under a preset aim and doctrines a game now asks nothing.

**Left as filed:** the autosave's size (6.7 MB of JSON, ~260 ms in node at the page's defaults: a hitch every 60 s), a founded colony starting on Forage rather than its mother's doctrine (`ja-lo8.9`), and the fungus precache being side view only (a top-down game under a preset aim plays the local rule where nothing ships).

### 50.10 Merging #41: shipping what the tests got (2026-11-07)

#41 (behaviour MR 5.2) raised `COLONY_BRAIN_VERSION` to 6: one sentence of the mode legend, what the raid stance asks. Asking every mode situation again under the three presets would cost about $0.12 (117 requests). The owner's direction: don't precompute everything; ship what comes out of the tests.

- `scripts/precache.mjs --import` ships the answers a live check already got (a `colony-live.mjs` cache), refusing any file asked under another context. Nothing is asked.
- MR 5.2's live check (`experiments/caches/mr52-top-*.json`, top-down, seed 1, 300 s) holds 290 mode answers per doctrine under the current context, so the mode bundles now hold those 290 (of 3,888), for $0. The stance bundles (v4, unchanged) keep all 324.
- `tests/precache.test.ts` now asks for a non-empty bundle of valid answers per preset, not every situation.
- **What it costs in play.** Under S6 (§50.9) a preset's words are never asked, so a situation with no shipped answer plays the local rule. How many a game meets: in 600 s of 600 + 600 ants under the local rule, side world 1 met 330 mode situations, both side worlds 558, and the side and top-down worlds of seeds 1 and 2 together 834. The 290 shipped are top-down ones; most side-view situations in the nest play the local rule until a side-view live check is imported.
- The merge also caught a field #41 added to `Colony` (`#gone`, a raider out on a raid) that the save left out: the S1 test (§50.9) failed on it, and it is now saved.

### 50.11 Asking only for what isn't cached; one daily budget (PR #42 re-review S7, S8, 2026-11-07)

The owner's rule: **don't spend while answers are cached; ask Jev only for the situations that aren't.** It replaces §50.9's S6 ("Jev runs only when the player changes a policy"; preset words never asked), which would have needed every situation pre-cached. The owner doesn't want a full precache while the game is in development.

**S7, what is asked:**
- The `shipped` exclusion is gone. A situation with no answer under the words in force, preset or the player's own, is asked, and its answer goes into the browser's cache. The shipped bundles are a head start, not a requirement.
- With no run on, a miss calls `ColonyJev.wantsRun`. The page starts a run if Jev could run (`policyLock.shouldStart`): server and key there, not stopped by the player, the budget not spent. A page whose every situation met is cached starts no run and spends nothing.
- On Pages (no API), presets play the shipped answers and the local rule, as before.
- Measured by the re-review against the 290-answer import (180 s, seed 1, 600 + 600 ants): 50.8 % of side-view mode questions came from the shipped bundle (32 distinct situations missing), 97.2 % top-down (115 missing). Those few situations are now asked once and cached.

**S8, one budget, not per-run caps:**
- The caps date from the picture demo, where a run asked for as long as it was open. Here an open run costs nothing, so a time cap guarded nothing, and a per-run spend cap set no ceiling on total spend once runs start themselves.
- The game's runs start with `GAME_CAPS` (no caps that bind), so a run stays open from the first miss until the page closes (its exit stops it).
- The server's ledger keeps **one budget per UTC day across every run and page load**: `JEV_DAILY_USD`, default `DAILY_BUDGET_USD` $0.10. It counts every reply billed, including one landing after its run ended, and reserves for calls in flight as the spend cap does. The day's spend is kept in `data/jev-budget.json` (gitignored), so a restarted server knows it.
- **When it is spent:** the run stops with reason `budget`, a new run ends as it starts, nothing more is asked, the game plays cached answers, stale answers and the local rule, and the policy editors lock with "Jev's daily budget ($0.10) is spent … until tomorrow".
- **Details shows the budget** (spent of today's, and what is left) beside the run's own figures. Tests: a second run on the same day starts with what the first spent; a new day starts again; a reply from a replaced run counts; the store carries a restart.
- The per-run caps stay in the ledger, with their old default, for any caller that asks for them.

### 50.12 Infection difficulty and the fungus's progress: a body, adaptations and reach (ja-lo8.12, 2026-11-07)

**The problem, measured.** The landing alone (no ant dosed) took the whole colony and its queen within half a minute of sim, on every strain and seed (`scripts/progression.mjs`, side world, 600 + 600 ants, local rule plus the shipped answers of an aim):

| Seeds 1–3, Unite | First host | A quarter | The queen |
|---|---|---|---|
| Garden as listed, the game before this | 2 s | 12–14 s | 19–25 s |

At 4× that is a few seconds of wall time, and the fungus started with every power it would ever have. Infection was a cliff, not a slope. In a mixed nest, every ant settles at the same load once transmission beats what four groomers take off a visible host, so there was no middle. Below that threshold, a lone host could not infect anyone: `clear` zeroed a clean ant's first step, so the minimum dose depended on step size.

**The owner's decisions.**
- **Strength unlocks, Jev answers the full range.** Upgrades widen how far each group of levers may go. Jev is still asked every lever on its full scale, and the level is held only where it takes effect, so caches are never re-asked at an unlock.
- **A grounded body, and adaptations from growth** rather than a currency: a real mycelium at the landing, and upgrades that come from fungus grown in hosts. A research note with primary sources comes first ([fungus-body.md](fungus-body.md)).
- **The queen keeps a larger grooming cap (8) as a stop-gap,** and grooming, still scripted, is filed as a vision gap (`ja-k4k.12`, a new row in the gap table).

**Built.**
- **Reach** (`levers.hold`, `Fungus.held`). Each lever's level is pulled toward "as is" until it is within the lever's reach (0, 1 or 2 levels). It is applied in `expressLevels` and in the queen's step. A lab or test preset (`express`) is not held. `fungalKey` and the request are unchanged, and a test pins that.
- **The fungus's body and evolution** (`colony/evolution.ts`, `Fungus.evolve`, `Fungus.root`, `Game.land(k, strain, { evolve: true })`, which only the page passes):
  - **Its strain starts weak:** transmission 0.12, decay 0.03/s. In a crowded nest, four groomers take more off a visible host than it passes on.
  - **A mycelium at the landing.** Its mass grows logistically (rate 0.03/s) up to the patch's capacity. It puts out a share of its mass a second as spores onto the landing cells, paid out of its mass, so it settles where growth meets sporulation. Foragers keep walking through it all game.
  - **Adaptations from fungus grown in hosts:** load taken on from spores or by contact (`Evolution.replicate`). The mycelium's own growth gives spores, not adaptations. The n-th adaptation comes at growth 10 × (1.28ⁿ − 1)/0.28, so each takes 1.28× the growth of the last.
  - **The upgrades,** costed in adaptations, 1–4 a level:
    - Spread: Infectivity (0.12 → 0.15 → 0.23 → 0.3), Persistence (decay 0.03 → 0.012 → 0), Mycelium (capacity 30 → 60 → 120), Fruiting body (0.6 → 1.2 → 2 % of mass a second as spores), Immune evasion (0 → 35 → 70 % of primed resistance slipped past).
    - Reach: Stealth (showing), Senses (starts at one step), Recognition, Trails, Royal (the side view only).
    - Lethal levers stay on the menu toggle. The 40 adaptations' worth is not all reached in 20 minutes, so what the player chooses matters. (Since §50.16 the lethal levers have upgrades too.)
- **The minimum dose is a rate** (`FungusParams.minDose` 0.02/s): a clean ant takes no load from a rate below it, at any step. `clear` zeroes only a falling load. At the 0.1 s step this is the old behaviour, and every earlier test passed unchanged.
- **The queen's retinue:** `queenGroomers` 8. It is a stop-gap; see `ja-k4k.12`. (Since §50.14, in the evolving game only.)
- **The page.**
  - The Fungus panel shows the mycelium, the fungus in ants, adaptations to choose with a bar toward the next, and each upgrade's next level with a button.
  - The ant card shows a held lever as what the host runs, plus "(wants …)" and the upgrade that would widen it.
  - A notice says when there is an adaptation to choose, and the guide has an entry on the body and adaptations.
  - `SAVE_VERSION` is 2: the fungus's save holds its evolution and its patch.

**Measured** (same harness; the evolving fungus chooses the next upgrade in a fixed order as soon as it can; 20 minutes; the order fits each aim: Spread takes Stealth first, Unite last):

| Aim | Seed | A quarter | Half | The queen | Adaptations at 20 min |
|---|---|---|---|---|---|
| Unite | 1 | 307 s | 372 s | 407 s | 29 |
| Unite | 2 | 301 s | 315 s | 340 s | 29 |
| Unite | 3 | 224 s | 257 s | 275 s | 29 |
| Spread | 1 | 265 s | 293 s | 325 s | 28 |
| Spread | 2 | 317 s | 332 s | 345 s | 29 |
| Spread | 3 | 193 s | 219 s | 226 s | 29 |
| Unite (confirm) | 11 | 360 s | 394 s | 400 s | 29 |
| Unite (confirm) | 12 | 406 s | 425 s | 426 s | 29 |
| Unite (confirm) | 13 | 281 s | 291 s | 336 s | 29 |
| Unite, choosing nothing | 1–3 | never in 15 min | — | never | 4–5 waiting |

- **The shape.** One adaptation arrives at the landing. Then a quiet two to three minutes follow while the trickle by the hole grows the next few. The breakthrough is the choice that tips transmission over grooming (Infectivity II, or Persistence with Infectivity I, or Stealth under an aim that hides). Then comes a run of choices as the nest fills, and a slower stream after that, about one a minute or two.
- **The worst seed:** a quarter at 406 s and the queen at 426 s (about 1¾ minutes of wall time at 4×). The best: 193 s and 226 s. Before, the spread was 12–25 s.
- **How the tuning got here.** Seed variance came from how many ants walk past the hole. A patch topped up to a fixed level from nothing, with income from carried load, varied 4× in early income between seeds (quarter at 27–295 s). A mycelium that pays for its spores, with adaptations from growth in hosts, narrowed it to the table's 193–406 s. The patch first starved to nothing when it kept a level topped up; spores as a share of mass settle instead.
- **Not settled:** once the nest is held, the colony's resistance climbs to 0.7–0.9 by 20 minutes, but the fungus holds 100 % on every seed. Whether the colony should claw back is for `ja-lo8.10` (balance).

**Jev cost: unchanged.** No legend, question, situation or brain version changed, and reach acts after the answer. So the fungus lane's ~708 real tokens per situation and its shipped answers stand (`precache.test` passes unchanged). An upgrade re-asks nothing.

**Tests** (`tests/evolution.test.ts`, 7):
- hold pulls toward as is, and leaves an unheld lever's range alone;
- reach changes the host's gains but not the asked levers or the cache key;
- adaptations come at rising thresholds and are given level by level, and a save round-trips;
- the mycelium settles where growth meets sporulation, and its growth gives no adaptations;
- the minimum dose means the same at a 0.1 s and a 0.02 s step;
- the landing roots, sporulates and grows adaptations, and a lab landing has no body;
- listed Garden takes over 90 % in 60 s, while the evolving one, choosing nothing, stays under half.

`tests/save.test.ts` now lands the fungus evolving, as the page does.

**Beads:** `ja-lo8.12` (this), `ja-k4k.12` (grooming from sensed cues), `ja-260` (the brush's cost: closed by §50.15, the brush removed), `ja-lo8.10` (balance: the colony clawing back).

### 50.13 Mutations that track growth, and parity for founded colonies (ja-lo8.12, 2026-11-07)

**The owner's direction.**
- **The first colony must have nothing a founded colony couldn't get.**
- **Adaptations should be mutation opportunities, and track growth rate.** "A little magical thinking in the interest of game joy" is allowed.
- **Two ideas for later, filed as beads:** the mycelium finds food (`ja-lo8.13`), and the mycelium offers itself as food (`ja-lo8.14`).

**Parity.**
- **The colony side was already equal.** A founded colony (`Game.addColony`) gets the same as a colony the world starts with: the same params except its identity, the same cap, a queen, chambers, the same policies and responses, and the same wiring (grids, enemies, burials, raids).
- **The one asymmetry was this slice's:** only the landing colony had a mycelium by its hole.
- **Fix.** `Founding.fungus` carries the founding queen's fungus. When it is the evolving strain, the fungus roots a patch by her new hole, so the landing colony gets nothing a founded one can't. Each patch brings its own start (`BODY.start`) and room (capacity × patches). `ja-lo8.9` passes the fungus when it builds founding.
- **A test pins both:** colony parity, and a patch only for a queen carrying the evolving fungus.

**Mutations** (`MUTATION` 0.25 per unit of new fungus) replace §50.12's adaptations at rising thresholds:
- **What counts:** every bit of new fungus is a chance to mutate. That is the mycelium growing on the ground, spores taking hold in an ant (no longer, since §50.14), and load passing on contact.
- **So the rate tracks growth.** A fungus that grows fast mutates fast, and the panel shows mutations a minute (averaged over 20 s).
- **The player keeps them,** giving mutations to an upgrade's next level. Each level asks more than the last: 2–10 for a first level, 300–1,500 for most second ones, 2,000–6,000 for the strongest. The rising costs stand in for selection and for adaptation's diminishing returns ([fungus-body §3](fungus-body.md#3-adapting-to-hosts)).
- **The licence taken:** growth on the ground counts too, though the passage study ties adaptation to hosts.
- **The harness picks like a player:** the first affordable upgrade in a priority order, so one it can't yet afford doesn't hold up a cheaper one.

**Measured** (`scripts/progression.mjs`, 20 minutes):

| Aim | Seeds | A quarter | The queen | Kept at 20 min |
|---|---|---|---|---|
| Unite | 1–3 | 155–206 s | 201–302 s | 14–16 upgrades |
| Spread | 1–3 | 136–182 s | 169–212 s | 16–17 |
| Unite (confirm) | 11–13 | 199–224 s | 216–244 s | 14–16 |
| Unite, keeping nothing | 1–3 | never in 15 min | never | 53–63 mutations waiting |

- **The rhythm:**
  - a first choice within 3 s of the landing;
  - one about every 30–60 s up to the breakthrough (two to three minutes in);
  - then every one to three minutes as costs climb.

  By 20 minutes about half of everything is kept (4,400–11,600 mutations earned, against 21,600 for all), so choices matter.
- **Compared with §50.12's thresholds:** the breakthrough comes about a minute earlier, because the mycelium's growth now mutates too. The worst seed is still under four minutes to a quarter of the colony.

**Jev: unchanged.** No request changed, and an upgrade re-asks nothing.

**Tests:** `evolution.test.ts` now has 9:
- mutations as a share of growth, with rising costs per level;
- the rate settling at `MUTATION` × growth, and ten times the growth giving ten times the mutations;
- two patches holding twice as much;
- parity between first and founded colonies, and a patch for a carried fungus.

### 50.14 Review of #43 (2026-11-08)

The review approved once S1 and S2 were settled; both are fixed in code, with tests.

- **S1: the queen's cap of 8 is the evolving game's only.**
  - **Before,** `queenGroomers` changed every game's queen once she became a host. Side seed 1, 300 + 300 ants, Garden landed without evolving: her load at 90 s was 0.398 against `main`'s 0.510.
  - **Now** a game that doesn't evolve grooms her with the usual cap (`groomers`, 4), so the lab, the assays and the earlier crown and regicide figures stand as measured.
  - **Test:** not evolving, the cap is never read; evolving, it is.
- **S2: mutations count only new fungus.**
  - **The bug:** a host's gain from ground spores was credited as growth, though the mycelium had already been credited when it grew those spores. The landing's painted spores were never grown at all. About 20 % of early mutations were counted twice.
  - **Now** only the contact share of a host's gain counts, since contact leaves the source its load.
  - **Test:** contact counts exactly what it passed on; a lone ant on spores takes load and adds nothing.
- **T1, T2:**
  - **T1:** a test that the queen's levels are held (Stealth decides how far she hides).
  - **T2:** a test that host mutations count, the same one as S2's.
  - Both fail under the review's mutations (removing the queen's hold; deleting the worker's credit).
- **Nits:**
  - **N1:** a guard that every `#field` of `Fungus` is saved, derived on load or per-step scratch, as #42 did for `Colony`.
  - **N2:** reach and immune evasion act only on hosts of the evolving strain; a lab brush's strain in an evolving game is as listed.
  - **N3:** spores a full cell can't hold go back into the mycelium instead of being paid for and clipped.
  - **N4:** a load with no evolution puts every strain back as listed.

**Re-measured** (`scripts/progression.mjs`, as §50.13):

| Aim | Seeds | A quarter | The queen | Kept at 20 min |
|---|---|---|---|---|
| Unite | 1–3 | 169–216 s | 219–314 s | 14–16 upgrades |
| Spread | 1–3 | 156–193 s | 182–217 s | 17 |
| Unite (confirm) | 11–13 | 218–241 s | 239–257 s | 14–16 |
| Unite, keeping nothing | 1–3 | never in 15 min | never | 43–46 mutations waiting |

- **The first choice** now comes 12–21 s after the landing, not at once: the landing's spores no longer count.
- **The rest is 10–30 s later than §50.13,** and the worst seed reaches a quarter of the colony at 241 s.

**Tests:** 402 fast tests pass, including 15 in `evolution.test.ts`. Jev cost: unchanged.

### 50.15 No spore brush (ja-260, 2026-11-08)

**The problem.** The lab's spore brush (Details) dosed every ant under a stroke for free, in any game: one drag skipped the weak start, the mycelium and every upgrade (§50.12–14). `ja-260` asked for the brush to cost the fungus, or to be a choice.

**Why not lock it after the landing.** Every game the app plays, started or loaded, lands an evolving fungus at once (`useColony`, `Game.land(…, { evolve: true })`). So there is never a game without one in which a brush could stay free, and a lock would remove the brush anyway.

**Decision (owner):** remove the brush and its strain picker from the app. The fungus reaches the ants only from where it lands.

- `Game.paintSpores` and `Fungus.paint` stay for tests and the scripts (`crown.mjs`, `muddle.mjs`, `fungus-cost.mjs`). The stroke they replay is `BRUSH` in `game.ts` (radius 3, spores 2, dose 0.15), moved from `useColony.ts`; the scripts import it.
- Gone from the field: the paint gesture, and space+drag to pan while painting.
- Gone from the lab: the brush and strain buttons. The lab keeps the fungus's menu, hide and cull, and the doctrines.
- The other strains (Lockpick, Bloom) remain as `STRAINS` entries, used by tests and scripts (and still described in `policyText.ts` and the Learn guide). Nothing in the app lays them now; `ja-lo8.10` decides whether they come back as something the game unlocks.
- The figures measured with "the UI brush" (§39, §49.4, §50.9) stand. Their harnesses replay the same stroke.

**Tests and cost:** no sim change, so the golden masters and the fast tests stand as they were. Jev cost: unchanged.

**Review (own agent):** nothing blocking. Fixed: the scripts import `BRUSH` instead of copying it; the Learn guide and two research notes (`fungus-policy.md`, `queens-and-merging.md`) no longer send readers to a brush or a lab strain picker; Space on the focused field is still kept from scrolling the page. Filed: the lethal levers (crown, odour weapon) are held to no reach, so a player who turns one on gets it at full strength from the first second (`ja-lo8.16`).

### 50.16 Lethal levers join the progression (ja-lo8.16, 2026-11-08)

**The problem.** The review of #46 found the last free power. `Evolution.reach()` gave a reach only to levers some upgrade named, and no upgrade named the lethal levers (odour weapon, crown). So a player who put one on the menu got it at full strength from the first second, from Jev or from the local rule's cull, while every other lever was held to the reach the fungus had earned (§50.12).

**Built.** Two reach upgrades, after Royal in `UPGRADES`, so that earlier indices and saves keep their meaning:

| Upgrade | Lever | Steps | Cost | Where |
|---|---|---|---|---|
| Odour weapon | `weapon` | held off → free | 2,500 | every map |
| Crown | `crown` | held off → free | 5,000 | the side view only (`nest`, as Royal) |

- **Both are binary levers,** so reach 0 holds one as is (off) and reach 1 frees it. `hold` already did the rest. The hosts (`expressLevels`, which covers Jev's answers and the local rule) and the queen go through `Fungus.held`, so nothing else changed.
- **Two gates, two meanings.** The menu chip is the player's permission, and the upgrade is the fungus's power. Both are needed.
- **The page:**
  - The Fungus panel lists both upgrades in the lethal red.
  - A followed host shows a held lethal lever as "crown: off (wants on)", with the upgrade to keep, through the ant card's existing hint.
  - The guide says so in its policy and evolution entries.
- **Costs are first guesses,** placed among the strongest second levels (2,000–6,000, §50.13). Balance (`ja-lo8.10`) tunes them.
- **Not held:** a game that does not evolve (the lab's landings, the assays, the tests), and a lab or test preset run with `express`.
- **Saves:** a version-2 save without these levels loads them at 0 (held off), so `SAVE_VERSION` stays 2. A save from a game with a lethal lever on the menu therefore stops culling or killing queens once loaded, until the player keeps the upgrade.

**Unchanged:**
- **Jev cost:** no request changed, and reach acts after the answer, so `precache.test` stands.
- **The golden masters:** they are bit-exact, since games that don't evolve have no reach.
- **`scripts/progression.mjs`:** its figures stand. Its order buys neither upgrade, and its menu has no lethal lever.

**Tests:**
- 404 fast tests pass.
- `evolution.test.ts` has a new test. It checks three things:
  - every lever has a reach;
  - weapon and crown start at 0;
  - on a side world with both on the menu, a host's `estrange` and `regicide` stay 0 until each upgrade is kept, then rise. A game that doesn't evolve holds nothing.
- It fails when the two upgrades start free.

**Review (own agent): nothing blocking.** The hold covers every path where a lethal lever takes effect. Fixed:
- **Copy.** The Learn drawer's local rule said the weapon works "only if it is on the menu"; it now also names the upgrade.
- **Lethal lever on the menu but held off.**
  - The Learn drawer's lever list now says "lethal, on, held off until you keep …".
  - The lever chip's tooltip says the same.
- **A lethal upgrade off the menu.**
  - The panel marks it "(not on the menu)".
  - The "mutations to keep" notice now ignores upgrades that would do nothing. It also ignores those the view hides, which was already true of Royal on the top-down view.
- **A step-level test.** A policy that culls, run through `Fungus.step`, estranges no host until Odour weapon is kept. It fails if the step skips the hold.
- **Nits.**
  - The ant card's tooltip names a lethal lever as lethal, and says "its policy wants" rather than "Jev wants".
  - The guide says "in the game", since the lab's own landings are not held.

### 50.17 The local rule while new words are asked (ja-lo8.15, 2026-11-08)

**Decision** (owner, 2026-11-08, replacing §50.2's stale fallback where Jev can answer): "we don't use the old values, unless … jev is broken". After the fungus's aim or a colony's doctrine changes, a situation with no answer under the words in force plays the **local rule** until Jev's answer arrives. Answers under earlier words play only while Jev can't run: no server or key, the daily budget spent, the player's Stop, a failed start. A daughter colony (ja-lo8.9) is no different: her mother's answers never stand in for hers. Where Jev can't run, the pen doesn't open and she keeps her mother's words, so the mother's answers are her own.

**Built:**
- `ColonyJev.canAsk` (default true), set by `useColonyJev` to `policyLock(...) === null`. A change makes every colony reconsider at once; the fungus re-reads its policy every step.
- `#lookup` and `#explain` use the fallback contexts only while `canAsk` is false. The follow card then says "by the local rule, while Jev is asked" (or "the strain's default" for the fungus) instead of a dimmed earlier answer.
- `fungusAnswers()` lists the earlier aim's rows, dimmed, only while they play.
- `setDoctrineFor(k, words)` loses `inherit`.
- Wording in the ant card, Learn's answer table and the guide.

**Tests:** a new doctrine plays the local rule, is asked, and takes Jev's answer; with `canAsk` off the old words' answer plays, stale, and flipping it reconsiders once per change; a daughter's new words play the local rule; a new aim plays the fungus's local rule and lists the old aim's rows only while Jev can't answer.

**No sim change.** The goldens are untouched; requests and contexts are byte-identical, so tokens per question are unchanged.

### 50.18 Energy and hunger: old ants answer the brood's hunger (ja-xu6, ja-xu6.1, 2026-11-08)

**The bug** (`ja-xu6`): in long side-view games, larvae starved beside a full larder. `#port` and `#nurse` refused every old ant (age band 2), so when births stalled the colony aged until nobody carried food to the brood or the queen, and births never restarted.

**Owner's decision (2026-11-08):** fix it with a real body state, not a grace time. Adults and larvae both have energy, drained with time and activity and refilled by eating. Hunger is felt by touch.

**Research** (web, 2026-11-08):
- Hungry larvae beg with movements, more when starved in *Gnamptogenys striatula* and in *Formica fusca* and *F. exsecta* (not in *F. aquilonia*). Workers were not drawn to the odour of starved larvae, and starved and fed larvae did not differ in cuticular hydrocarbons (Peignier et al. 2019, *Front. Ecol. Evol.* 7:398, [frontiersin.org](https://www.frontiersin.org/article/10.3389/fevo.2019.00398/full)). So hunger is a contact cue, not a scent.
- In *Myrmica rubra* a "gradient of hunger" runs from the foragers through the nurses to the larvae (cited there; the original not read).
- Response thresholds (Bonabeau, Theraulaz & Deneubourg 1996, fungus-policy §3): an ant responds to a stimulus s with the chance s² / (s² + θ²); age only shifts θ.

**Built** (`web/src/colony/hunger.ts`, `colony.ts #body`; the side view only, where a colony has a queen and brood; top-down maps are untouched):
- **Adults.** `energy[i]` drains at 1/2,400 a second inside, twice that outside. Below 0.7 an ant tops itself up from food lying in its own nest within two cells (not in a brood chamber, whose food is the larvae's, nor the queen's stock of 8), at 8 meals from empty a unit, or takes food by mouth from the best-fed nestmate it touches (above 0.75: trophallaxis, energy passed, not made). At 0 it dies of hunger (`diedHungry`).
- **Larvae.** `BroodItem.energy` drains at 1/600 a second. Food a nurse gives goes to its energy first, then to its growth; at 0 the larva dies (`broodStarved`), and its food leaves the economy.
- **The queen.** Her own energy (1/3,600 a second); she eats from her chamber; at 0 she dies.
- **Felt hunger.** Each tick a begging larva (below 0.8), a hungry adult (below 0.4) and a queen who has gone 20 s without laying for want of food are felt by the ants within one cell; each ant passes on 0.9 of what it felt last tick to those it touches. An ant's `need` rises toward the strongest it feels in 2 s and fades over 60 s.
- **What need does.** An old ant ports and takes in brood with the chance respond(need, 0.3); the young and middle-aged as before. An ant feeling need (0.3 for the old, 0.1 for the others) follows the stores' floor marks to where food is kept, and there ports it on. Porters also bring a meal to the chamber a hungry adult is in (`#wanted`, the existing table: `ja-k4k.4`).
- **Food conservation** gains the food eaten (`Colony.eaten`): map + jaws + larder + brood (1 + fed) + 4 a birth + eaten stays at what the map started with (food.test, economy-bench).
- **Saves**: `SAVE_VERSION` 2 (energy, need, the queen's energy and how long she has gone unfed, brood energy).
- **The follow card** shows an ant's energy and the hunger it feels.

**What didn't work, measured** (the economy test's setup: 256 × 160, 110 ants, 0.3 food, 3,600 s, worlds 1–8 at seeding n = 0 and 1):
- Eating only in the chamber an ant stands in: food piled up in stores nobody visits, and every adult starved by 2,400 s on world 1 (335 food left).
- Letting adults eat the queen's stock: the crowd resting in the royal chamber (`ja-3po`) ate it, she stopped laying, and the colony aged out.
- Following reception's marks to fetch: reception smells strongly and is usually empty; fetchers gathered there.
- Draining from full to empty in 20 minutes, eating below 0.5: foragers on an emptied map starved before they got home (40–56 adults on three worlds).
- A lower old-ant threshold (0.15), or need passed on at 0.95: the hunger response took foragers off the ground and nudged world 3 collapsed (60–80 adults starved). The dynamics are sensitive; need fading over 60 s rather than 30 was the one change that held everywhere.

**The queen's begging, the last change.** At first she begged whenever her chamber held less than an egg's food. Early on she lays two eggs a second, so that was nearly always, and it drew old ants into porting and jammed the tunnels on some seeds: G seed 3 had 95 foragers holding food over 120 s, A8 seeds 1 and 7 had 74 and 173 porters (main's worst: 3 and 14). With her begging off (or after a 60 s wait) the jams went on those seeds, but with the 60 s wait two nudged economy worlds collapsed again (65 and 92 workers): in the spiral there is no brood to beg, and only her signal draws the old in. She now begs once she has gone `QUEEN_WAIT` (20 s) without laying for want of food, rising to full over as long again.

**Measured, the 16 worlds** (main → this branch; workers at 3,600 s, worst larvae stranded at once, i.e. unfed over 120 s while the larder could feed them):

| World | n = 0 main | n = 0 now | n = 1 main | n = 1 now |
|---|---|---|---|---|
| 1 | 160, 0 | 160, 1 | **77, 15** | 161, 1 |
| 2 | 161, 0 | 148, 6 | **45, 13** | 129, 7 (25 adults starved) |
| 3 | 160, 0 | 159, 2 | 161, 0 | 152, 14 |
| 4 | 152, 7 | 156, 5 | **62, 44** | 134, 23 |
| 5 | 161, 0 | 163, 0 | 162, 1 | 160, 0 |
| 6 | 164, 0 | 159, 0 | 164, 0 | 161, 2 |
| 7 | 159, 0 | 159, 2 | 162, 0 | 134, 20 |
| 8 | 162, 0 | 164, 0 | 162, 7 | 164, 0 |

- **No collapse**: main lost three colonies to the death spiral (45–77 workers left); now the lowest is 129, and births at least match deaths of age everywhere.
- **Outside the test's bound** (≤ 5 stranded, ≥ 110 workers): main 5 of 16, now 5 of 16 too, but on strandings alone, late in the hour as this small map's food runs out. World 2 at n = 0 went from 0 to 6: `slow/economy.test`'s bound is loosened from 5 to 8 for it, and bead `ja-xu6.2` is to bring it back.
- Adults eat 34–54 food an hour here (110–165 workers): about a fifth of a unit an ant-hour. Hunger killed adults on two nudged worlds (25 and 5).
- **Guard:** `slow/economy.test` gains world 1 at seeding n = 1 (77 workers and 15 stranded on main; 161 and 1 now), and both cases assert no worker starved.

**Assays, seeds 1–10** (side view; main → now):
- G, the side-view game: pass 9/10 → **10/10**. Worst foragers holding food over 120 s 3 → 2; worst porters 8 → 6. Food home, median: Ink 2,199 → 2,377 (2,133–2,377 between the 5th and 6th seed).
- A8, nest flow: worst porters holding food over 120 s 14 → 35 (seed 7; the others 0–1); larvae starved 0.5 median both ways.
- A11 and A12: identical (top-down maps).

**The two-hour game** (600 + 600 ants, regrowth on as the page plays, seeds 1–2; measured before the queen's begging was delayed): the war (`ja-war`) decides it, as on main. Seed 1: on main Ink fell to 572 workers with 129 unfed larvae at 3,600 s; now Ink held 852–892 throughout, but Amber was wiped out by the war by 3,600 s (on main she survived at 425). Seed 2: Ink lost to the war both ways; Amber 783 → 797.

- **Golden masters re-recorded** (`GOLDEN_WRITE=1`): the side view (`tests/golden.json` "side view, seed 4", `tests/slow/golden.json` "side view war, seed 6") changes from the first tick, since founders now use energy and old ants' porting draws on the random stream. The top-down recording ("top-down war, seed 3") is bit-identical.
- **Colony lane cost unchanged**: no legend, situation or question changed, so the shipped answers stand.
- **Checks**: `npm test` 395 pass (the homing test now samples only ants on the ground line, its stated case: a young porter underground searched round a wrongly believed chamber by its nest vector, which the test's surface-vector filter never meant); `test:slow` 16 pass and the same 3 TODOs, of which `ja-3po`'s porter-hold guard now passes (left a TODO until that bead is looked at).

### 50.19 Slice 9: new queens, the flight, the queen's pen (ja-lo8.9, ja-lo8.9.1, 2026-11-08)

**What a player sees.** A colony whose nurses perceive the queen's scent faint rears new queens (gynes). Each ecloses as a winged alate, waits a minute in the nest among her nestmates, walks up and out, and flies. The game pauses. If the fungus is in her, her mother colony's queen was reached, and Jev can read new words, the **queen's pen** opens:
- the player writes her doctrine (her mother's to start with; the presets as quick picks), the only time a colony's words change (PRD §50);
- the player picks where she lands (east or west of the hole, 16–96 cells).

Otherwise she founds on her mother's doctrine at once, and a notice says why. Her colony plays the local rule until Jev's answers to new words come (§50.17). Her mother keeps her own words.

**Research** ([new-queens](new-queens.md) §2–§3, primary sources there):
- The mated queen holds queen-rearing back through the workers: nurses that sense her pheromone kill sexual larvae, and stop when she is gone (Klobuchar & Deslippe 2002).
- A large nest dilutes her signal; larvae stay bipotent early (Boulay et al. 2009).
- Founding is claustral: the queen raises a first brood of nanitics alone on her body's reserve.
- A daughter's odour drifts from her mother's: split *Aphaenogaster senilis* colonies differed in body odour within 5 days and could not be reunited by day 20 (bioRxiv 614719).

The thresholds, rates and the drift's size and speed are the game's own (design).

**Built** (`web/src/colony/royal.ts`; `colony.ts #body`, `#caste`, `#eclose`, `#alatesOut`; `game.ts` flights and `found`; the side view only):
- **The queen's scent, carried on the ants.** Her royal mark lies on her chamber's floor and doesn't spread, so what reaches far brood is carried.
  - She gives `SCENT_SUPPLY` (4 a second) × her signal to the ants within one cell of her, split among them. While nobody touches her she holds up to 20 s of it for the next ant.
  - Each ant's `scent[i]` fades (100 s) and moves toward the mean of the ants within one cell (8 s): shared by contact.
  - The supply is split, so a colony carries `SCENT_SUPPLY × SCENT_FADE / N` an ant. Measured: 2.4 at 165 ants, 0.45 at 900. The signal dilutes as the nest grows, with no count read.
  - Founders start at that share.
- **Caste** (`BroodItem.caste`), from the scent the nurses within two cells perceive (`scent × scentGain`, their strongest).
  - **Reared as a gyne:** a larva in its first 10 s (bipotent), well fed (energy 0.9 or more), with 2 food lying in its chamber, and every nurse round it perceiving the scent below `GYNE_MARK` (0.4) for 4 s.
  - **Culled:** a gyne larva by a nurse perceiving it at `CULL_MARK` (0.8) or more for 10 s. Its food leaves the economy (`eaten`).
  - **Cost:** a gyne is fed 3× a worker's food (9) and takes twice as long as larva and pupa.
  - No colony founding alone rears gynes.
- **The alate** (`Colony.alates`), an entity apart from the workers' arrays, like the queen. She takes no ant slot and no job.
  - She waits `ALATE_WAIT` (60 s), then walks out along the tunnels a cell every 0.4 s (`#climbOut`'s field), and flies at the hole: into `Colony.flown`, then `Game.flights`.
  - Her egg and food become her body (`Alate.food`), held apart from the larder and fattened while she waits, up to `ALATE_RESERVE` (§50.20). The fungus steps her load as it does the queen's (`Fungus.#royalLoad`, shared now): from the nestmates she passes, groomed off by them. No lever is asked in her.
- **Founding** (`Game.found`, `Founding.mother / reserve / load / strain`).
  - `addColony` with no workers. Her chamber holds her body (`Flight.food`, at most 24), moved off the books' royal line into her larder, not new on the map (§50.20), and her queen carries the fungus the alate did.
  - While `Colony.founding` she feeds her first brood herself (2 nurses' worth within two cells) and isn't beaten. Her first worker ends it.
  - `autoFound` (on by default: the lab, the assays, the tests) founds at once at `landing()`, 48 columns from the hole on the side with room. The page turns it off, pauses, and founds through the pen.
  - `MAX_COLONIES` (6, the page's colony names): an alate that flies past it is lost, as most founding queens are.
- **Odour drift** (`ja-lo8.9.1`). The daughter starts at her mother's nest odour and drifts (`Colony.odourAim`, `recognition.ts driftAim`) 1.5 tolerances away toward the middle of the odour range, with a 500 s time constant. They become strangers in about 9 minutes, unless the fungus's odour levers (stranger scent, fungal odour) hold them together. No new lever (owner, 2026-11-08).
- **The queen-scent lever** (`queenScent`, perception, nest only, workers). Its levels are 0.1, 0.3, 1, 1.5, 2 on `scentGain`, lerped by load as the other perception levers are. This is the second route of new-queens §4: it works before the queen is reached.
- **Chapters:** `gynes` and `daughters` now read the landed colony's lineage (`Game.lineage`): its gynes and its daughters, theirs, and so on.
- **The pen's gate** is pure (`ui/pen.ts penGate`): load at `INFECTED`, `revealed[mother]`, and `policyLock` null.
- **Outcome:** "unified" now needs two of the world's own colonies (a solo world with a kin daughter isn't one colony). With two, daughters count in `unity()`: the fungus must hold them too.
- **Saves:** `SAVE_VERSION` 3 (alates, flights, scent, castes, the founding flag, `odourAim`). A save founds its daughters again from `Founding.nest`, then pours their state back over them.

**Measured.**
- **Scent and thresholds** (probe, side view, seed 1–2): a healthy 900-ant colony's larvae perceive 0.52–0.82 (none below `GYNE_MARK`); a 165-ant colony's 2–6. No gyne was reared in 30–40 minutes of either.
- **The lifecycle assays** (new: `lifecycle`, `lifecycle-signal`, `lifecycle-scent`; solo, 600 ants, the fungus landed, 1,800 s, seeds 1–2; the lever arms force it in every ant from the start, to measure rearing apart from spread):

  | Arm | First gyne | First flight | Daughter's first worker | Her first forager out | Gynes | Culled | Daughters |
  |---|---|---|---|---|---|---|---|
  | none (dilution alone) | – | – | – | – | 0 | 0 | 0 |
  | queen signal 0.4 | 158–170 s | 296–311 s | 351–366 s | 386–901 s | 28–31 | 0–1 | 5 (cap) |
  | queen scent 0.3 | 28–129 s | 172–271 s | 227–327 s | 777–868 s | 47–69 | 0 | 5 (cap) |

- **For slice 10's balance** (`ja-lo8.10`):
  - a damped colony rears dozens of gynes, most lost past the cap;
  - daughters stay small (4–10 workers after 25 minutes);
  - the queen counts as reached about 20 s after landing (load 0.05; she lies 16 rows under the hole). That predates this slice: measured the same on the previous commit.
- **Golden masters bit-exact**: `tests/golden.json` and `tests/slow/golden.json` unchanged. No gyne is reared and no fungus painted in them; the scent is computed but read only by caste, and no random number is drawn for it.

**Gaps against the vision.**
- **Caste is a scripted choice**, not the colony policy's: `#caste` reads only local cues (the perceived scent within two cells, the larva's energy). But it reads the food lying in the larva's chamber from the chamber table, as larval feeding already does (`ja-k4k.4`).
- **The alate's walk out** uses the whole-nest distance field (`#climbOut`, `ja-k4k.2`).

**Cost.**
- **Fungus lane v8:** the new lever is in the legend and in every worker's question in the side view. Re-shipped (`node scripts/precache.mjs --lanes fungus`): 130 situations per preset aim, 390 answers for **$0.0126** (estimated $0.0114), about 770 real tokens per situation. Under the presets Jev leaves `queenScent` as it is in all but one situation: none of those aims is about queens.
- As a game asks them (`node scripts/fungus-cost.mjs`, estimated, 5 minutes, 600 + 600 ants, seed 1; these also carry §50.18's economy change):

  | Play | Situations | Requests | Tokens / situation | $ / game | $ / h |
  |---|---|---|---|---|---|
  | Garden | 85 | 15 | 852 | 0.0030 | 0.037 |
  | Lockpick | 79 | 28 | 1,026 | 0.0034 | 0.041 |
  | Bloom | 146 | 28 | 868 | 0.0053 | 0.064 |

- **Colony lanes:** unchanged. A daughter on her mother's words plays the cached answers; on new words, a daughter asks what she meets under them (a doctrine change's cost, as before).

**Checks.**
- `npm test`: all pass, 7 new (`royal.test`, `ui/tests/pen.test`).
- `test:slow`: 16 pass, the same 3 TODOs.
- Lint: 7 warnings, as on main.
- End to end (Playwright, the dev server with no key, `/api/health` stubbed as having one so the pen's gate is open, no spend): an infected alate pauses the game and opens the pen; Cautious and Found starts Jade, founding, carrying the fungus, and play resumes. A clean alate founds on Ink's words with the notice, no pen. Dev builds put the game on `window.jevAnts` for such checks.

### 50.20 Merging #43 and #44 into the new-queens branch (2026-11-08)

`main` gained the fungus's progression (#43, `ja-lo8.12`: §50.12–50.14) and raids (#44) while §50.17–50.19 were built (they were numbered 50.12–50.14 on the branch). The merge:
- **The royal body:** `#royalLoad` (the queen's and an alate's fungus, §50.19) takes #43's changes to the queen: resistance evaded by the evolving strain, the least dose, mutations from what is caught, the queen's retinue cap (in the evolving game only; an alate is groomed as any host), and the "clear only while falling" rule.
- **A daughter's fungus** goes in #43's `Founding.fungus`, which was left for this slice. So a daughter queen carrying the evolving fungus also roots its mycelium by her hole, and counts as a host.
- **The queen-scent lever is in the Royal upgrade** with the queen signal (`evolution.ts`): the evolving fungus earns both together, from none to the full range. Without that it would have had the new lever at full range from the start.
- **Saves:** version 3 (#43 had made it 2).
- **Checks:** `npm test` 418 pass; `test:slow` 16 pass, 2 TODOs (#43 resolved one); lint 7 warnings; golden masters as merged, bit-exact.

**A second merge** (#45, #46, #48–#52): `main`'s §50.15 (no spore brush) and §50.16 (lethal levers) came first, so this branch's sections moved to §50.17–50.20. `docs/new-queens.md` now describes gyne rearing and the queen-scent lever as built, not as on an unmerged branch. No code conflicted except `useColony`'s stats type (both fields kept). `npm test` 420 pass; lint 7 warnings.

**Review of 959d1fe** (PR #47):
- **S1, the reserve was made from nothing.** A daughter founded on 24 food while her eclosion wrote off at most 10 (her egg and `GYNE_FOOD` 9), and `foodTotal` was raised by 24 to balance. Now her body is the reserve, and it has its own place on the books:
  - an alate ecloses carrying `1 + fed` (`Alate.food`); while she waits, the nestmates by her feed her from the chamber she is in (`ALATE_FEED` 0.5 a second, by up to two nurses) up to `ALATE_RESERVE` 24, out of the larder into her body;
  - `Game.found()` moves her body into her colony's larder and changes no total; a lost queen's body (`lose()`, no room, `MAX_COLONIES`) is booked to her mother colony's `eaten`;
  - the food books are map + jaws + larders + brood + 4 a birth + eaten + `Game.royalFood()` (alates' and pending flights' bodies), in `food.test`, `royal.test` and `economy-bench`.
  - Alates fatten in the nest before the flight in the real thing too; the rate and the cap are design. Like larval feeding, fattening reads her chamber's food from the chamber table (`ja-k4k.4`). In small test worlds alates leave with 6–16 food, so a daughter can found leaner than before.
  - **Test:** food is conserved through gynes reared, alates fattened, flights and foundings, and `foodTotal` doesn't move (`royal.test`); a lost queen's body is booked once. Founding on 24 rather than her body, an alate with no body, fattening that takes nothing from the room, or a lost body not booked each fails it. (A first version raised `foodTotal` at founding, so the books balanced even with the reserve put back to 24; a review agent caught that, and the body's own place on the books fixes it.)
  - **Saves:** `SAVE_VERSION` 4, so a save from before alates had a body is refused rather than read with an undefined one.
- **S2, `found()` twice founded twice.** It now refuses a flight that is not pending (−1, nothing added); tested.
- **S3, `#wanted` reads every adult's energy.** Accepted for now and noted on `ja-k4k.4`, whose job is to replace `#wanted` with sensed signals.
- **N3:** the toast for a queen lost to `MAX_COLONIES` says so, not "no room to land". **N4:** §50.2's two superseded bullets are marked.
- **N1, N2, N5 stay:** a held larva still drains (not triggered in 60 s), the laying gate doesn't count larval upkeep (tuning, with `ja-xu6.2`), and the gyne's food cue reads the chamber's food as larval feeding does (`ja-k4k.4`).

**A third merge** (#53, each ant's own stance, top-down): `CLAUDE.md`'s cost line takes #53's colony figures and this branch's fungus figures; `colony.ts` keeps both #53's stance gate and the side view's energy step in `tick`; the assay list keeps #53's `defendHome` and the three lifecycle assays. `tests/golden.json` took both sides' entries (#53's top-down, this branch's side view) and passes as merged.

**Review of 718ec15** (a review agent):
- **S1, a founding daughter held unity at 0.** `Unity.met` is the least allied-contact share over the standing colonies, and a queen founding alone stands (`Game.beaten`) with no ants, so her share of 0 made `met` and the score 0 until her first workers met someone. A colony with no ants is now left out of `met` (`#metNow`): it has nobody to meet. Tested: two colonies that have met keep `met` over `MET` when a daughter founds; counting her fails it.
- **N1:** a books check while a flight waits for the page (`autoFound` off): dropping the flights from `royalFood()` now fails it.
- **N2:** `found()` with a site that has no room after all (`addColony` throws "no room") loses the queen and books her body, instead of dropping the flight with its body unbooked.

**Review of edc4088** (`pr-reviewer`): the PR body brought up to date (S4); §50.19's two lines on the reserve corrected (N6); a test for `found()` with no room for a hole (N7); the unity filter's comment says it leaves out any colony with no ants (a founding queen, or a colony whose workers all died), not only a founding one (N8); the alate's fattening reading her chamber's food from the chamber table is listed in `vision.md`'s food-flow row and on `ja-k4k.4` (N9).

### 50.21 Slice 10: balance (ja-lo8.10, 2026-11-08)

**No end screen** (owner, 2026-11-08): after the daughter chapter the game stays open. Nothing to build.

**Pace, re-measured on top of #43** (`node scripts/progression.mjs --seeds 1-3 --seconds 900 --evolve`, the Unite aim, the default buying order):

| Seed | A quarter | Half | The queen | Share / resistance at 15 min |
|---|---|---|---|---|
| 1 | 222 s | 250 s | 308 s | 84 % / 0.41 |
| 2 | 309 s | 346 s | 368 s | 100 % / 0.50 |
| 3 | 231 s | 247 s | 270 s | 96 % / 0.44 |

- **The queen is reached in 4½–6 minutes in the game.** The "about 20 s" of §50.19 is the lab's landing (an evolved strain at full strength, `lifecycle` assays), not play.
- **`ja-260` was closed by #46** (§50.15: the spore brush is gone), and the game's spread costs the fungus (§50.12–50.13).
- **The colony now claws some back** (seed 1 fell from 100 % to 84 % in the last minute, seed 3 dipped to 65 %), which §50.12 left open. Not tuned further here.
- **Royal**, the upgrade that reaches both queen levers, came 14th in the default order: seed 2 bought it at 753 s; seeds 1 and 3 had not by 900 s. A player who wants new queens buys it sooner.

**Three faults found, and fixed.**

1. **The gyne flood.** With a queen lever forced, nearly every young larva in a chamber with food was reared as a gyne at once. Seed 1, signal damped: 24 of 39 larvae were gyne brood at 240 s, 28 gynes in all, every flight after the fifth lost to the colony cap. Rearing stopped only when the colony hit its cap and the queen stopped laying.
   - **Fix:** nurses feeding a gyne rear no second beside her. A larva with gyne brood (a gyne larva or pupa) or an alate within `GYNE_SPACING` (2) cells takes no gyne cue (`Colony.#royalNear`).
   - **Why:** queens develop where larvae get more food (*Myrmica*: Brian's size threshold; *M. brevispinosa*, caste through larval nutrition: [antwiki](https://antwiki.org/wiki/Caste_Determination), [Sex Ratios and Caste Allocation](https://antwiki.org/wiki/Sex_Ratios_and_Caste_Allocation)), and workers tell gyne larvae apart (they cull them: Klobuchar & Deslippe 2002). That nurses round a gyne have no food for a second is the game's own (**design**). An alternative, alates damping rearing with a pheromone of their own, has no support: fire-ant virgin queens make queen pheromone only after shedding their wings (Vargo 1999), and Argentine-ant virgins not at all.
   - **Seed 1:** spacing 0 (as before), 2, 3, 5 gave 28, 3, 2, 2 gynes. Chosen: 2.
2. **Daughters shared a chamber.** Holes were kept 8 columns apart (`HOLE_GAP`). A founding chamber reaches up to 7 columns from its hole (the shaft slants about 2.5 over 14 rows, the disc 4.5 more), so daughters that landed by the same default spot dug into each other. Seed 1: queens 2 and 4 laid into and ate from one chamber, and the larder and the chambers' food drifted apart.
   - **Fix:** `HOLE_GAP` 16. **Owner, 2026-11-09 (PR #54 review, D1):** keep 16. This fixes the side-view half of `ja-tjo`; one world's founding (`HOLE_GAP_2D` 12) stays there. #47 and #54 ship back to back (#47 as a merge commit, then #54 retargeted to `main`), so the 8-column gap never goes live with gynes.
   - **Test:** `royal.test`, "dig apart", over three worlds. It fails at 8 (seed 1: two chambers 8.5 apart).
3. **Daughters didn't grow.**
   - **The reserve:** 24 food buys 6 eggs (1 each) and 18 for their larvae; with larval energy that is barely enough. In a shared chamber it wasn't, and all 6 starved at 940 s.
   - **The age bands:** her first workers eclosed young. With no forager, the colony brought in nothing for 10 minutes; a worker is old (foraging) only at 1,260 s of age.
   - **Fix: nanitics.** Brood laid while the queen founds alone ecloses at `NANITIC_AGE` (the old band's start), so her first workers forage at once, and live shorter.
   - **Why:** in incipient *Pogonomyrmex rugosus* colonies nanitics take on outside work, pushed out as later nanitics eclose into brood care ([escholarship](https://escholarship.org/content/qt37w2d1mh/qt37w2d1mh.pdf)). Foraging from the first hour is the game's own (**design**).
   - **Fix: the young colony's queen nurses.** With her nanitics out, nobody fed the next brood. While her colony is `incipient` (from founding until the first worker her workers reared ecloses), the queen feeds the brood by her that no worker tends.
   - **A rule for every queen strands larvae.** In a world's own colony it failed `slow/economy` (9 and 7 larvae stranded at once, against a bound of 8 and 5): the queen ate into her own laying stock. Hence `incipient`.

**Measured** (the `lifecycle` assays, a solo 600-ant colony, a queen lever forced in every host from the start, 30 minutes; median (min–max) over seeds 1–10):

| Arm | First gyne | Gynes | Flights | Daughters | First daughter's workers at 30 min |
|---|---|---|---|---|---|
| None (dilution only) | never | 0 | 0 | 0 | – |
| Signal damped, before (seeds 1–2) | ~160 s | 28–31 | 28–31 | 5 | 4–10 |
| Signal damped | 169 s (117–1,577) | 4 (1–9) | 4 (1–9) | 4 (1–5) | 13 (7–67) |
| Scent damped, before (seeds 1–2) | 28–129 s | 47–69 | – | 5 | – |
| Scent damped | 37 s (28–129) | 7 (4–11) | 7 (3–11) | 5 (3–5) | 31 (14–52) |

- **These rows are after #47's review (S1, §50.20) and the young queen feeding beside a nanitic (re-measured; the signal arm is unchanged):** a daughter founds on her mother's alate's body, fattened in the nest up to 24, not on 24 made from nothing. With the free 24 the first daughter had 26 (1–40) workers at 30 minutes (signal) and 33.5 (22–66) (scent); gynes were 4.5 and 6.5.
- **A daughter's first worker goes out 3–4 s after she ecloses** (nanitics), 56 s after the founding.
- **Confirmed on seeds 11–20** (signal damped, with the free reserve): first gyne 206 s (109–302), gynes 3 (1–7), daughters 3 (1–5), the first daughter's workers at 30 min 19 (7–39).
- **The colony cap still binds** with a lever forced for 30 minutes on most seeds (5 daughters). A player pulls a queen lever for a while, not a whole sitting; `MAX_COLONIES` stays 6. `ja-lo8.10` stays open for it, the colony's late claw-back and the lethal levers' costs.

**Review of 59eb236** (PR #54): S1, the young queen's nursing had no test that its removal fails. Two tests now pin it (`royal.test`): in a daughter whose nanitics are all out, a larva by the queen is fed while the colony is `incipient` and not once a worker her workers reared ecloses; a nanitic eclosing leaves the colony young. Dropping `incipient` from the nursing rule, or never clearing it, each fails them. N1 (a stale "env override" comment) went in the merge with #47. A review agent then found: one nanitic beside the brood halved its feeding (the queen stood in only when no worker was there); she now feeds as two nurses beside any (`Math.max`), tested. `incipient`, like `founding`, is a colony-wide fact the queen can't sense: a vision gap row and `ja-k4k.13`. The alate branch of `#royalNear` and the spacing edge (gyne brood exactly `GYNE_SPACING` away blocks, one further doesn't) are now tested; the `HOLE_GAP` comment no longer claims a daughter can't land against a grown nest's outer chambers. N2–N4 are as described: the founding queen now stands in for absent nurses rather than adding to them (the same while she is alone), `#royalNear` scans the brood (fine at today's sizes), and `incipient` can outlive a dead queen harmlessly.

**Golden masters bit-exact**: no gyne is reared, no colony founded, in them. The economy is unchanged for a world's own colony (`incipient` is a daughter's only).

**Checks:** `npm test` passes, with 6 new tests in `royal.test` for this slice: gyne spacing (with its edge and an alate); daughters dig apart; a daughter raises her first brood beside her sisters; the young queen feeds while `incipient` and stops after; she feeds at full rate beside a nanitic; a nanitic eclosing leaves the colony young; and nanitic and `incipient` asserts in the flight test. The food-conservation test now runs until the first daughter is no longer young, through her nanitics and the queen's nursing; `test:slow` 16 pass, 2 TODOs; lint 7 warnings, as on main.

**Cost:** unchanged. No legend, situation or question changed.

**A third merge** (#53, each ant's own stance, top-down): `CLAUDE.md`'s cost line takes #53's colony figures and this branch's fungus figures; `colony.ts` keeps both #53's stance gate and the side view's energy step in `tick`; the assay list keeps #53's `defendHome` and the three lifecycle assays.

## 51. One world: the surface and a curtain under the line between the holes (design, ja-lp4, 2026-11-08)

The owner asked for the top-down view and the side view to be two views of one game. The side view would be a cut along a line through the nests' holes, zig-zagging as nests are added, and a new nest may not be founded nearer an interior nest's hole, so the line always grows from an end. Today they are two unrelated games, and the Ground control throws the game away to switch (§27 created the split without choosing it).

**Decisions (owner, 2026-11-08):**
- **Underground is a curtain under the line, not a 3D volume.**
  - The surface is a 2D plane with today's top-down physics.
  - Everything underground lives in one vertical sheet under the line, with today's side-view physics, and the side view shows all of it.
  - A hole is the only way between the two.
  - A full 3D underground was set aside: depth-times the memory and tick cost, 3D digging and homing, and a side view that would miss tunnels.
- **The founding rule.** A colony may be founded only where its nearest hole is an end of the line (ties to an interior hole are invalid; ties between ends grow at V₀), its segment from that end turns back by at most 120° and, away from the shared vertex, neither crosses the line nor comes within a clearance of it, it is a 2D hole gap from every hole, and the ground is open.
- **Design first.** `docs/one-world.md` holds the model, the rule, what changes in the colony code, the two linked views, the stages U1–U6 with their guards, and the open questions. Nothing is built yet. The legacy side and open maps stay as test beds until U6 re-baselines the assays.

**The note's open questions, answered (owner, 2026-11-08):**
- **Tunnels of neighbouring colonies may meet** in the curtain; the contact response decides. A dig-stop rule would read another nest's position.
- **A founding flight with no valid landing within her radius fails**, and the game says why. `new-queens.md` §3 is changed to match.
- **Wide screens get the above/below switch first**; both views at once is a follow-up (`ja-lp4.8`).
- **After U6 the old side and open maps leave the page**, kept as test beds until their assays are re-baselined.

**U1 built, and two geometry calls (owner, 2026-11-08, `ja-lp4.1`).** `web/src/colony/transect.ts` is the line: holes in order, signed *s*, P(s), `canFound` with its refusal reason, `nearestValid`, `grow`. Nothing in the game uses it yet, so behaviour and the golden masters are unchanged.
- **Columns are hex steps.** A segment's columns are the hex line between its holes (`hexLine` in `hex.ts`), so neighbouring columns always lie over the same or adjacent cells; a segment is `hexDistance` columns, up to ~15% longer than the surface at a slant, never shorter.
- **Rule 2 covers the new margin.** The new segment and the margin it will carry must both keep clear of the line, so a founding whose margin would fold back is refused.

**U2 built (`ja-lp4.2`, 2026-11-08).** `web/src/colony/oneWorld.ts`: `generateOneWorld(seed)` returns the plane, the curtain and the line.
- **The plane** is `generateWorld(seed, OPEN_WORLD)`, unchanged. Its nests' holes, in order, make the line.
- **The curtain** is laid out as a side view: 40 rows of sky; a ground strip copied from the plane under the line (`refreshStrip`; never simulated); the crust, open only at the holes; and 300 rows of the side view's ground, with each nest's shaft and royal chamber dug by `foundNest`.
- **Stable under growth.** Its ground goes by *s* and the row, and each nest by its own hole, so a column keeps its ground when the line grows.
- **The preview** is at `?world=one`: above and below, no ants. Nothing else on the page changes, and nothing in the game uses it yet, so behaviour and the golden masters are unchanged; `generateOneWorld` has its own golden.
- **The margin stays 64.** Measured with `scripts/dig-spread.mjs` (the page's side-view game with no fungus landed, 600 ants a colony, seeds 1–3): after 600 s the farthest cell dug outward past an end hole (west of the westmost, east of the eastmost) lay 34, 51 and 36 columns beyond it, with the 99th percentile at 30–46.

**The founding radius (research, `ja-lp4.7`).** `docs/nest-spacing.md`: mature harvester nests sit 9–14 m apart (one neighbour gap, the game's 140 cells); queens fly 5 gaps or more; spacing is made by young colonies dying near old ones (~8 m), not by where queens land. Design: `FLIGHT` 140 cells; keep `HOLE_GAP_2D` and `CLEARANCE` at 12 (the hole gap became 16 in U4a, owner 2026-11-09, `ja-tjo`).

**The founding radius is 140 (owner, 2026-11-08, `ja-lp4.10`).** Proposed at 70, but measured: flight 140 with a 70-cell radius failed 51% of flights from end nests and 55% from interior ones; with 140, 6% and 28% (`scripts/flight-failure.mjs`, 300 seeds on the default plane). At 70 failure is noise, half of all flights wherever the nest; at 140 it shows the line growing from its ends. Queens should die mostly of contact after landing, as real foundresses do, not of geometry. U4's assay rechecks it with rock; the endless world (`ja-qpv`) looks at it again without the plane's edges.

**Cost.** None yet. The mode situation keeps its fields, so one world should not change Jev's cost; U3 checks it with `colony-cost` (U3a did: below). Tick cost will rise toward the side view's 7.0–7.3 ms at 1,200 + 1,200 ants (§36, §37); U6 measures it before the page switches.

**Review of #45 (agent, 2026-11-08):** the tick estimate (it had cited the old underground map, not the side view), the founding rule's clearance at the shared vertex and a minimum turn, ties, the hex rasterisation of the line, what growing the line does to the old end's margin, the larder (kept; it no longer makes ants), the 2D hole gap, the curtain's crust and margin, and where the fungus's mycelium lies were corrected in the note.

**The mycelium lives in the soil (owner, 2026-11-08).** Not on the surface: the sun's UV would kill it. In one world it grows in the shaft's soil walls just under the hole, in the curtain, and ants pick it up brushing past; its spores reach the plane only on ants and corpses. Today's game roots it on the open cells by the hole, where ants walk (§50.12); `ja-yo3` moves it into the soil, with UV and habitat sources added to `fungus-body.md` first.

**U3a built (`ja-lp4.3`, 2026-11-09).** A `Game` can run on one world: each ant on one layer, crossing only at the holes; pheromones, fights, recognition, allied contact and the fungus per layer; the queen economy; all workers start underground. The owner split U3 into three PRs, and decided that every returner goes down its hole, activation inside waits for `ja-web` (so one world never asks `leave`, and raids stay off until then), each ant keeps its own stance, and spoil and corpses go out at the hole until U3c (`one-world.md` §4, §8 items 8–13). The page still plays the two old maps. The old golden masters are bit-exact; one world has its own (`oneWorldGolden.test.ts`: seed 7's 160 × 100 plane, 150 + 150 ants, 90 s, about 7 s to run).
- **Jev's cost** (`colony-cost --one`: seed 1, 600 + 600 ants, 10 sim-minutes, offline). The mode lane's request is the same size as the side view's: ~229 tokens a situation plus ~1,086 a request, in both. Batched as the page asks, ~783 tokens a question (the side view, run the same day: ~630), because fewer new situations arrive in each 0.3 s batch (1.9 a request, against 2.6). That is ~$0.074/h, against the side view's ~$0.156/h the same day: 122 distinct situations against 343, and no stance lane (0 stance choices). The leave lane asks nothing. The five other response lanes, if asked, would add ~$0.092/h.
- **Tick time** (`colony-bench --one 600`: seed 1, 600 + 600 ants, 60 s, after a 5 s warm-up): mean 5.48 ms, median 5.11 ms, p90 7.98 ms; at the end 339/260 and 359/239 ants on the plane/in the curtain. A spot check; U6 measures 1,200 + 1,200 against the 7–9 ms budget.

**U3b built (`ja-lp4.3.2`, 2026-11-09).** On the plane a homing ant steers by its own drifting home vector in 2D, started afresh only up out of its own hole, and snaps to the hole within sight of it. Where the vector ran out it searches in loops round that point, a quarter turn apart and 1.6 times wider each loop of four: a simplification of the sources' loops, which start and end at the search's centre (Müller & Wehner 1994; centred loops are `ja-lp4.11`). The spike forced two more rules: any returner on the plane that gets no nearer its belief for 3 s searches on, which unblocks beliefs in rock but also fires often far from the belief (seed 1, 120 s: 81 % of 596 firings more than 10 cells off; narrower versions delivered about the same, so it stays), and a searching ant follows the home trail under its antennae until its hole is in sight. Over seeds 1–3 food carried down changed by −28 % to +6 % against U3a (`one-world.md` §4, "U3b as built"). The owner moved 2D own-nest, neighbour and midden-side to U3c, from the ant's own vector (`ja-k4k.5`). No situation, legend or question changed, so Jev's cost is unchanged. The old golden masters are bit-exact; the one-world golden was re-recorded.

**U3c built (`ja-lp4.3.3`, 2026-11-09).** The mound and the midden are on the plane (`one-world.md` §4, "U3c as built"). The mound is a height field of spoil per plane cell, heaped as a 2D sandpile at a level a cell (≈41°), with a ring round every hole (at most distance − 1 levels) that keeps it open. Spoil carried up the shaft is walked out on a heading drawn at the crossing and heaped where the carrier's own vector says it is far enough (the side view's draw, its reach grown as a disc's area rather than a strip's length); explorers pick pellets off its flanks to spread them farther out by vector, or take them down the hole to backfill, asked by the `get` response as in the side view. **The owner decided the midden's place (2026-11-09):** a ring set by the undertaker's own vector, the first cell off the mound at least 8 from home, not facing a rival's hole, which would read other nests' positions (`ja-k4k.5`); one pile found by corpse odour follows a research note. Its mark is laid on the plane, a Bloom host's spores land there, and rival raiders on the plane shy from it. A corpse put down at will (Jev's "put down" or "drop and run") counts as the midden only out on that ring; elsewhere it lies unmarked (owner, 2026-11-09). The old golden masters are bit-exact; the one-world golden was re-recorded.
- **Spike** (`one-world-spike.mjs`, seeds 1–3, 300 + 300 ants, 300 s): food carried down changed by −25 % to +11 % against U3b, and over seeds 1–6 by +3.4 % in total (−13 % to +66 % on 4–6), the change of the random stream. Mounds of 216–450 pellets, 95 % within 10–21 cells of the hole, 2–3 levels high. No corpse reaches the midden in 300 s; on seed 1 over 2,400 s, 10 and 34 did, a median 13 and 16 cells out.
- **Dig spread** (`dig-spread.mjs --one`, seeds 1–3, 600 + 600 ants, 600 s, Garden landed): at most 45, 46 and 49 columns dug past an end hole (p99 42–44), so the curtain's 64-column margin holds.
- **Jev's cost** (`colony-cost --one`, seed 1): ~769 tokens a question, ~$0.092/h for the mode lane; U3b the same day ~753 and ~$0.082/h. No situation, legend or question changed; the difference is the situations each game visited (159 against 147).
- **Tick time** (`colony-bench --one`, seed 1, 1,200 + 1,200 ants, 60 s): mean 12.78 ms (U3b the same day 12.05 ms): U3c adds about 6 %, and both are over U6's 7–9 ms budget.

**U4a built (`ja-lp4.4.1`, 2026-11-10).** A colony can be founded on one world, beyond an end of the line, by the lab or by a queen's flight; saves stay refused until U4b (`ja-lp4.4.2`). The owner decided (2026-11-09) three things: U4 is two PRs; maps get an x origin, so the curtain is indexed by *s* and growing at V₀ renumbers nothing; and `HOLE_GAP_2D` goes from 12 to 16, which fixes one world's half of `ja-tjo` (on one world's default curtains, seeds 1–20, founded royal chambers shared a cell in 15 of 80 pairs at 12 and 0 of 80 at 16; `ja-tjo`'s own count on side worlds was 25 of 80 at 12). `one-world.md` §4, "U4a as built".
- **Founding.** `Game.addColony` moves a founding to the nearest spot within 140 cells where the founding rule allows it, or refuses it: "no room beyond the line's ends within her flight". `growWorld` grows the line and the curtain, whose new columns get their own ground and buried food while the old keep theirs, and puts the nest on both layers (dug in the curtain; on the plane, which has no soil, nothing is dug). A founding's hole must join the plane's main open ground, not a pocket closed in by rock (owner, 2026-11-10, PR #62 review D1; one-world §3 rule 4, §8 item 15). A flight is 140 cells from the mother's hole in a direction from the game's stream; a queen with nowhere to land is lost, and `Game.lastLoss` says why. The lab's "Found beyond ‹end nest›" shows when the game is one world.
- **The founding radius, rechecked** (`flight-failure.mjs --rock`, seeds 1–20, each plane's own rock): flight 140 with radius 140 fails 8 % of flights from end nests and 27 % from interior ones (the bare plane, 300 seeds, at gap 16: 7 % and 28 %), so 140 stands. With rule 4 as the main open ground (D1), 8 % and 28 %.
- **Cost.** No situation, legend or question changed. `colony-cost --one` (seed 1): ~791 tokens a question, ~$0.101/h for the mode lane (160 situations; U3c ~$0.092/h, 159). Tick time (`colony-bench --one`, same machine): 12.38 → 12.71 ms mean, within noise; the side view's unchanged within noise. A founding costs ~30 ms once.
- The old golden masters are bit-exact; the one-world golden was re-recorded once, for the x origin (every curtain position 64 lower).

**U4b built (`ja-lp4.4.2`, 2026-11-10).** One-world games save and load (`one-world.md` §4, "U4b as built"). The owner decided three things: `SAVE_VERSION` goes to 5 and older saves are refused, not migrated (first a no-op migration from 4 with version-4 fixtures from main, dropped in the review of #63: nobody plays the game yet, so backward compatibility doesn't matter); the fight-tick save drift (`ja-7ej`: a save on a tick with a fight death diverged on reload, in every game, because load rebuilt the occupancy grids and recognition bands from the living) is fixed here, by saving them; and compressing saves waits for a measurement over ~20 MB. Measured at page scale (seed 1, 800 + 800 ants, 600 s): one world with a founding 17.1 MB (1.7 MB gzipped), the side view 8.8 MB, top-down 7.5 MB, so no compression yet. No situation, legend or question changed: Jev's cost is unchanged. The golden masters are bit-exact.

**U5.1 built (`ja-lp4.5`, 2026-11-10).** One world is playable on the page: Details → Ground → "one world", with an above/below switch (and the key v) that moves the camera, not the game; the side view stays the page's default until U6. The owner decided (2026-11-10) that U5 is two PRs (U5.1 playable, U5.2 the views linked) and that in one world the player's queen will land where the player clicks on the top view (U5.2). `one-world.md` §5, "U5.1 as built".
- **The strip is drawn, not stored** (`one-world.md` §8 item 6): the curtain's strip row is sky and `refreshStrip` is gone; a step from a hole into the surface rows is a crossing whatever the cell holds, and the side view's walkers read the strip over a hole as their walkway (`walkable`). The one-world golden was re-recorded once for it; the old golden masters are bit-exact.
- **The renderer** draws one layer at a time: above, the plane with its mound, the line and each hole's name; below, the curtain with the strip and the mound's cut drawn from the plane under the line, the plane's ants on it, and a rule at each bend with its turn. Each view keeps its camera; the curtain's extent is read again when a founding widens it. `?world=one` is retired.
- **Cost.** No situation, legend or question changed. `colony-cost --one` (seed 1, 600 + 600, 10 sim-minutes; main the same day): ~784 tokens a question, ~$0.095/h for the mode lane, 158 situations (main: ~791, ~$0.101/h, 160). `colony-bench --one` (1,200 + 1,200, 60 s): 9.76 and 10.29 ms mean against main's 10.36 and 10.44, within noise.

**U5.2 built (`ja-lp4.5.2`, 2026-11-10).** The two views are linked (`one-world.md` §5, "U5.2 as built"): a click on the line above opens the side view at that column, a click on the strip below opens the top view at P(s), and a followed ant that goes through a hole takes the camera with it ("Carry across", on by default). In one world the player's queen lands where the player clicks on the top view, within her flight (140) of her mother's hole; the field previews where she would settle (`Game.settleAt`, the reading `addColony` founds by) or why not. A one-world game opens above (owner, 2026-11-10); a founding mid-game still doesn't re-fit the camera. The guide has an entry for the line and the curtain. Guard: `npm run e2e` (Playwright, by hand, ~20 s). Nothing in the simulation changed: the golden masters are bit-exact, and no situation, legend or question changed, so Jev's cost is U5.1's.

**U6a built (`ja-lp4.6.1`, 2026-11-10).** The owner staged U6 (2026-11-10): U6a (guards and assays on one world), then `ja-web` (activation moved just inside the hole: a port, not a new mechanic), then U6b (the leave and raid assays, final baselines, the page switched); the tick budget is set after U6a's profile. Nothing in the simulation changed: the golden masters, one world's included, are bit-exact, and the legacy assays' output is identical. `one-world.md` §5, "U6a as built".
- **Assays on the plane** (`npm run exp -- --one`, seeds 1–10; `oneArena` makes each arena the plane, a hole at each nest, the curtain under the line): A2a, A3, A4 10/10, A2b 9/10; A1 6/10, A6 5/10 (its raiders go down the defenders' shaft), A9 3/10 (the same losses over a seventh of the food), A10 0/10. A5, A5b need `ja-web`; A11, A12 are U6b's.
- **G1** fails the held-food bound on every seed (4–44 foragers a colony holding food over 120 s, all on the plane): skipped in `slow/oneWorld.test.ts` unless `G1=1`, the bound not loosened.
- **Unity** is reachable but rare: Garden in both colonies, seeds 1–3, no game clears `MET` in 600 s (peak 0.11–0.43 %); by 1,800 s one of six does (seed 3, 600 + 600, unified at 732 s). The odours become alike; the colonies seldom meet, and only on the plane. Guarded on seed 3; `MET` unchanged.
- **Tick** (`colony-bench --one --page`, seed 1): 6.1–6.4 ms mean at 600 + 600 and 9.9–10.4 ms at 1,200 + 1,200 (8.5–9.3 ms in the second minute, once the JIT has settled), against the 7–9 ms budget. The ants' step is ~73 % of it; no easy win was found. No situation, legend or question changed, so Jev's cost is unchanged.

**`ja-web` built (2026-11-10).** Activation at the top of each shaft: every outgoing forager is held at a gate within `WAIT_STEPS` of its own hole and asked `leave` there; carriers have a pass; held ants smell the raid trail at their hole. A5b passes 7/10 on one world, A5 0/10 (the middle-aged go out unheld); G1's food carried down is unchanged and raids return; the tick at 1,200 + 1,200 is over the 10 ms gate (10.7–10.8 ms in the second half), and the slow unity guard (seed 3) no longer unifies (skipped behind `ja-lp4.6.6`). §48.6; `one-world.md` §5, "ja-web as built".

## 52. Entrances: the crust stays a mechanic, for now (research, ja-nzx, 2026-11-08)

The owner asked whether the side view's undiggable crust could become an ant's own choice, and whether colonies could open new entrances (`ja-nzx`, `ja-4h2`, `ja-lp4.9`). `docs/entrances.md` holds the research:
- Older, larger harvester colonies keep more entrances, funnelled into one entrance chamber (Gordon 2025).
- Entrances are sealed at night and plugged by rivals.
- Soil CO₂, moisture and temperature change with depth, and diggers respond to CO₂ (in a leaf-cutter) and moisture in choice tests; no study shows ants reading depth from them. Light matters only once the soil is open.

No source found says what makes a colony open a new entrance from inside.

**Decisions:**
- **The crust stays a mechanic.** It keeps the walkway from hanging and the hole from being cut off.
- **`ja-4h2` is deferred.** The cues exist, but the response that would use them would be invented. It reopens on a source about what triggers a new entrance, or when another behaviour needs a depth sense (for example chamber placement, `ja-k4k.3`).
- **No vision sense-table row yet.**
- **Two ideas filed:** new entrances that scale with colony size, into one entrance chamber (noted on `ja-lp4.9`), and closing entrances at night and plugging a rival's (`ja-lsu`, blocked by day and night, `ja-0qs`).

**Review (agent):** corrected the light study's journal, the venting test's citation (Tschinkel 2013), placeholder titles, the fire-ant figure's source (Hays 1986), and an overclaim that ants read depth from the gradients; an untraceable claim on morning sealing was dropped and the evening sealing is sourced to a secondary page.

**Search note.** Web searches on how long an insect-killing fungus survives sunlight (`ja-2qv`) were stopped by a safety filter this session; that research waits for a new session. This note's topic was not affected.

**Cost.** None: docs and beads only.


## 53. Unity needs contact (ja-i0f, 2026-11-08)

**Problem.** `Game.unity()` called the colonies one when their nests smelled alike (gap within tolerance) and nobody had died fighting for a minute. Nothing asked whether they had met. Colonies that never touch have a quiet minute for free, so the underground world "unified" at about 105 s with zero contact (§22).

**The signal: `Unity.met`.**
- An ant is in **allied contact** when an ant of another standing colony is in its cell or the six around it (that tick's occupancy grids, `battle.ts` `around`), and its own odour is within tolerance of that colony's nest odour. It smells like them: a meeting, not strangers.
- Each colony keeps the share of its living ants in allied contact, faded over `QUIET` (60 s) like the fight-death count. `met` is the **least** of the standing colonies' shares, so every colony must have met someone: one pair meeting a lot cannot carry a third that never touched anyone.
- It is read in `tick()` after odours move (`Game.#meet`). It reads only: no ant state and no random stream moves.

**The rule.**
- `unified` = gap ≤ tolerance, quiet ≥ 60 s, **`met` ≥ `MET` = 0.01**, and every colony standing.
- **Latched once won.** When all of that holds, the game remembers it. Unity then stays while the nests stay alike and nobody dies fighting, even if contact fades. Kin forage at home (the strategist does not raid kin), so contact can fade after the win; without the latch the outcome would flap and toast "One colony" again each time. A fight death or the nests drifting apart clears the latch, and the colonies must then meet again. The latch arms only on the whole condition, so contact from before a fight does not re-arm it while the quiet minute is still owed.
- Enough contact is about 1 % of each colony's ants on average over the fading minute, not a minute of it: with every ant in contact `met` passes the floor in under a second, and at a 3 % share in about 24 s.
- The unity score is multiplied by `min(1, met / MET)` (1 once latched).
- `Unity.alike` (gap within tolerance) lets the panel say "the nests smell alike, but the colonies have not met yet".
- Details shows `met` beside the other unity figures.

**Measured** (Garden painted on both nests, the easiest case; `met` as a share, and as ants on average; the side rows were measured with the pooled share before review, which can only be higher than the least colony's):

| World | Seed | Ants | Peak `met` | Peak ants in contact | Unified (new rule) | Unified (old rule) |
|---|---|---|---|---|---|---|
| open 160×100 | 2 | 150 + 150 | 2.7 % at 300 s, rising | ~12 | 235 s | ~120 s |
| side | 1 | 300 + 300 | 0.34 % | 2.7 | no (600 s) | ~120 s |
| side | 2 | 300 + 300 | 0.10 % | 0.9 | no (600 s) | ~120 s |
| side | 3 | 300 + 300 | 0.002 % | 0.02 | no (600 s) | ~120 s |

On the side view the two colonies hardly touch: no fight deaths in ten minutes, and at most a few ants meeting. The old rule's two-minute "win" there was this bug.

**Why the floor stays at 1 % (owner, 2026-11-08: "consider the ongoing work toward a unified world").**
- One world (§51, `ja-lp4`) puts the colonies on one top-down plane, where they meet as they do on the open map and clear the floor.
- Their tunnels may also meet in the curtain.
- After U6 the old side and open maps leave the page.
- So the side view's missing contact belongs to a map on its way out. It is no reason to lower the floor, and no new world bead.
- The interim cost: until U6 switches the page, the side-view default can't be won by unity.
- Follow-ups noted on the beads:
  - U3 (`ja-lp4.3`) counts contact per layer, the plane and the curtain;
  - U6 (`ja-lp4.6`) guards that Garden in both clears `MET` on one world.

**Saves.** Each colony's contact and the latch are saved (`private.metBy`, `private.haveMet`). A save from before has neither and loads as not met, so the colonies must meet again before they can be one. `SAVE_VERSION` is unchanged.

**Unchanged.**
- The golden masters, bit-exact: `#meet` writes nothing an ant reads.
- Jev cost: no legend, question or situation moved.
- The assays' outcome metric (`experiment.ts`) can now read "playing" where it read "unified". `npm run exp` was not rerun (slow).

**Tests** (`recognition.test.ts`):
- the unity unit test: alike and quiet but not met is not one; a minute together is;
- colonies that smell alike but are kept apart for two minutes are not one;
- strangers in contact count for nothing;
- `met` and the latch survive a save, and a save without them loads as not met;
- the five-minute Garden game asserts `met ≥ MET`;
- after review: alike and met but not yet quiet is not one; unity holds once won while the colonies keep apart, and breaks when the nests drift; a fight death breaks it while the nests stay alike, and old contact does not re-arm it; `met` is the least colony's share, not the pooled one; contact is the cell and the six around, not two cells off.

Each rule has a mutation that fails a test: drop `met` from `unified`, the quiet gate, the latch, its clearing on a fight death or on drift, arming without the quiet, or the per-colony least.

**Review (own agent, PR #56).** No correctness bug.
- Confirmed:
  - the occupancy grids are fresh where `#meet` reads them;
  - nothing it does moves ant state or a random stream (goldens bit-exact);
  - save/load works;
  - it runs in every two-colony game;
  - its cost is in the noise (5.3 against 5.0 ms a tick at 1,200 + 1,200 ants, every odour forced alike);
  - no consumer breaks: the slow tests never read unity.
- Fixed:
  - **R1:** the quiet gate had lost its test;
  - **R2:** unity flapped as contact faded after the win (now latched);
  - **R3:** `met` was pooled, so with three colonies a pair meeting could carry one that never touched anyone (now the least colony's);
  - **N2:** "a minute" of contact was the wrong claim.
- Noted, not changed:
  - **R4:** contact reads ant odour against the other nest, as `mixing` does, not ant against ant as fights do; unity's gap and quiet gates mask the difference;
  - **N1:** ants killed in a tick's fights still count for that tick;
  - **N4:** `Colony.met` is an unrelated per-ant field;
  - **N5:** the save run-on test does not hash unity.

**Cost.** None (no Jev change).

## 54. Each ant's own stance (top-down; ja-k4k.6, ja-d8e, 2026-11-08)

Research basis: `docs/stance.md`. Every figure was read in a search summary, not the paper, so all are **unverified**.
- **Defence is an individual's threshold.** A pavement-ant worker fights a stranger once an internal state passes a threshold, raised by recent encounters (Hoover et al. 2016; Bubak et al. 2016: octopamine and serotonin). *Pheidole* defence moves closer to the nest as the threat grows.
- **Hunger does not raise aggression.** Sugar-starved Argentine ants grew less aggressive (Grover et al. 2007); starved and fed colonies were no different (Thomas et al. 2005).
- **Crowded colonies raid.** Fire-ant brood raiding rose from 0 % to 68.5 % with colony density (Tschinkel et al. 1995). The denser side wins boundary disputes.

### 54.1 What was there

- **A colony-level strategist.** Every 5 s it chose one stance (forage, defend or raid) and told every ant. It read:
  - food brought home, averaged over 60 s;
  - deaths in fights, fading over 30 s;
  - a map scan for strangers near the nest;
  - size against the cap, and the larder.
- **Its rule** raided when no food came in, which had no source behind it, or when the larder was full and the colony large.
- **"Defend"** sent every ant that smelt alarm to fight, wherever it was, and sent every waiting forager out.

### 54.2 What changed (open ground; `stanceGate` 1)

- **Each ant's stance is its own** (`#stanceOf`):
  - **defend** while its `threat` is past `defendAt` (1) within `homeGround` (10) of its nest. Threat is seconds of alarm smelt or strangers in reach, leaking with a 20 s half-life.
  - **raid** once recruited.
  - **forage** otherwise.

  What each stance does is unchanged. `Situation.stance` and `Touch.stance` keep their three values. Defence lingers: 5 s of faint alarm near home keeps an ant defending for about 40 s (half-life 20 s, `defendAt` 1). That is the fading internal state, and is intended.
- **No strategist on open ground.** The game loop skips it. Its 60 s intake average, 30 s loss decay and map scan are not read there. The side view keeps it (`ja-1a9`).
- **Raid scouts go on a `leave` answer.** The answers are now/soon/wait/**raid**.
  - "raid" sends a waiting forager out at `raidScout` (1/90 s) as a raid scout.
  - `Touch.crowd` (few, many) is how crowded home is, felt by a waiting ant: nestmates in its cell and the six round it over 5 s, "many" from `crowdAt` 40.
  - Local rule: returns none and crowd many → raid.
- **No raid without a living rival** (review of #53, S1). With none left, or only kin, the game clears `Colony.raidable`, and neither a "raid" answer nor a raid trail recruits; "raid" is then a wait. This is interim, until the world grows a neighbour (`ja-5hm`, `ja-506`).
- **The raid trail recruits at home and by degrees.** An idle ant at home that smells it is recruited at `raidRecruit` (0.1/s) × the trail's level (up to strong).
- **Why "by degrees":**
  - Recruiting anywhere ran away: G′ seed 1 had 773 of 899 ants raiding.
  - Recruiting all at once at home made every raid a war: one scout's trail called the 150–200 ants idle there. On G′ seeds 1–4 that lost about 880 ants, against 170 with no raids and main's 800, whatever `crowdAt` (6–80).
  - Ants differ in threshold (*Pheidole* majors answer only intense recruitment).
- **Assays.**
  - A11, A12 and A9 set raiding through the leave response (`RAIDING`, `NEVER_RAID`).
  - A6's two sides keep the broadcast (`stanceGate` 0): with their own stance, defenders 40 cells from home turned away from the pass.
  - New A13 `defendHome`: a war party marches on a colony that forages a far pile.
- **HUD:** top-down, the side stats show how many ants defend and raid.

### 54.3 Results (local rule)

| | This MR | `main` |
|---|---|---|
| G′ seeds 1–20: ants alive (median, worst) | **900, 507** | 892, 223 |
| G′ food stored (median, worst) | **4,406**, 1,912 | 4,274, 1,816 |
| G′ ants lost (median, worst) | **441**, 870 | 848, 1,113 |
| Rival: food / lost | 4,536 / 438 | 4,179 / 828 |
| A11 seeds 1–20 (pass, gain median, worst) | **20/20, 2.65, 1.64** | 16/20, 2.04, 1.32 |
| A11 seeds 21–40 | **20/20, 3.01, 1.59** | 13/20, 1.84, 0.97 |
| A13 (pass; food against no war party; against the broadcast) | 15/20; 0.63; broadcast 0.62 | 1/10 at the original mark |
| A6 (broadcast, the march) | 14/20, gain 1.74 | 14/20, 1.74 |
| A1–A5b, A9, A12 | as `main`: 20/20 each; A2b 19/20 (seed 15 fails on `main` too) | |
| A10 | 5/20 (ja-je8) | |

- **No G′ seed ends with fewer ants than on `main`.** Seed 5 stores 13 % less food (4,339 against 5,012).
- **A13's first mark** (food at least 0.8 of the no-war-party control) failed under both stances: an 80-strong war party forced to fight costs a 200-ant colony 120–130 ants whoever defends. The mark is now relative to the broadcast stance. Defenders near home: 0.27 on average sampled, against the broadcast's whole colony.
- **Tried:**
  - a default that never raids: G′ seeds 1–4 lost about 170 ants;
  - crowd-only raids with recruitment all at once: about 880 lost;
  - `raidRecruit` 0.02: A11 8/10, worst seed 1.07.

### 54.4 Jev (spent ≈ $0.029 of $0.10)

- **Legends** (colony v7, response v10; the stance lane is unchanged, for the side view):
  - Stance, on open ground, is the ant's own: "forage, the usual one; defend, only while it smells alarm or meets strangers close to its own nest; or raid, once recruited".
  - `crowd` is sent to the leave lane with the returns. The leave question gains "raid".
  - The leave lane's key adds `crowd`.
- **Two wordings were corrected after replays:**
  - **"crowd" tied only to raiding.** Cautious and Forage answered "wait" for a crowded home with many foragers coming back, and Warlike raided with food coming back. Cautious's replay stored 1,228 against main's 3,853. Now returns come first: a crowded home with none coming back is the one case left to the doctrine.
  - **A stance sentence leading with threat and defence.** Cautious answered "return" in 125 of 151 mode situations. Now forage is "the usual one".
- **A third wording, after review of #53 (D1).** Cautious's mode answers kept rested ants at home with food ahead. A sentence now says caution means going home from danger, not staying home from food.
- **Live:** `colony-live.mjs all --top`, four full runs at $0.0065–0.0066, plus two leave-only runs and one Cautious mode run (about $0.0024).
  - Real tokens per question: mode 202, leave 404, contact 262, trail 250.
  - Caches: `experiments/caches/stance-top-*.json` (7 / 4 / 10). The mode bundles are re-shipped from them (`precache.mjs --import`, 151 answers per doctrine); the stance bundles stand.
- **Replays,** G′ seeds 1–6, the first colony; `main` is MR 5.2's caches replayed today. The local rule on this branch: 4,207 food, 648 lost.

| Cache | Food | Lost | Before the caution sentence: food | `main`: food | Lost |
|---|---|---|---|---|---|
| Forage | 4,018 | 502 | 3,955 | 4,363 | 824 |
| Cautious | **3,595** | 91 | 2,234 | 3,853 | 592 |
| Warlike | 3,093 | 641 | 3,467 | 3,472 | 866 |

- **Losses fall under every doctrine.**
- **Cautious kept rested foragers at home under the second wording** (2,234 food). The cause was in its mode answers: with them removed it stored 4,801 (seeds 1–3); with MR 5.2's answers restored for the 15 situations where they differed, 3,645.
  - The caution sentence brings it to 3,595, 7 % under `main`'s, with a sixth of its losses. Some sacrifice is the doctrine's (the owner's call on #53).
  - Some of those situations stay ambiguous on open ground: a "return" situation doesn't say whether the ant is home or walking there.
- **Warlike fell 11 %** between the two recordings (3,467 to 3,093), with the same losses. Its answer counts barely moved (fight 80 → 82), so that is taken as Jev's run-to-run variance, not the sentence.
- **The shipped mode answers** are 151 per doctrine, from top-down caches (they were 290, from the side view and top-down). The side view, still on the broadcast stance, will miss more at first and ask live under the daily budget (§50.11).

### 54.5 Cost

Offline estimates (`colony-cost`), on this branch against `main` on the same machine:

| | This branch | `main` |
|---|---|---|
| Top-down, mode lane | ~$0.024/h (no stance lane) | ~$0.030/h |
| Top-down, the six response lanes | ~$0.020/h | ~$0.015/h |
| Side view, mode | ~671 tok/q, ~$0.102/h | ~652 tok/q, ~$0.099/h |
| Side view, response lanes | ~$0.127/h | ~$0.117/h |

The longer legends cost a few per cent; the top-down stance lane is gone. The estimates were taken before the last two wording changes, which are within a sentence of them.

### 54.6 Left out

- **The side view** keeps the strategist and raids by coordinates (`ja-1a9`; `ja-k4k.6` stays open for it).
- **A fight-recruitment signal** (pavement ants' escalation): alarm already draws defenders.
- **Brood need** as a raid cue (`ja-gkl`).

## 55. The page plays one world only (ja-97n, 2026-11-10)

The owner (2026-11-10) removed the side-view and top-down games from the page and made one world (§51) its only game, so Details has no Ground choice. This takes the page switch out of U6b (`ja-lp4.6.2`), whose leave and raid assays and final baselines are still open. Only the UI changed:

- `buildGame` always builds `generateOneWorld(seed)`. `ColonyControls`, the saved settings (`GameSettings`) and `hasNests` no longer carry a ground. Saves made before this change will not load into the same world; there is no migration, because nobody plays yet.
- The Nest tab, the fungus panel's nest upgrades and the notices no longer check whether the map has nests. The Nest tab's "Switch to the side view" empty state is gone.
- The simulation keeps its side and open maps (`generateSideWorld`, `generateWorld`): the assays, golden masters, benches and lab scripts still use them. Every golden master is bit-exact.
- Cost: no legend, question or schema changed, but the page's game is now one world. `colony-cost --one` (seed 1, 600 + 600, 10 sim-minutes, offline, 2026-11-11): ~776 tokens a question, ~$0.103/h for the mode lane, 192 situations, and 0 stance choices (one world has no strategist). The side view measured ~$0.102/h (CLAUDE.md).
- Review (PR #69): the Learn panel's strategist section and its stance request were removed, because one world never asks them. The follow card's stance chip now opens the guide's Strangers entry. Continue offers only one-world saves (`readable`). Player-facing text says "on the surface" or "below" instead of the side view or the top-down maps. `buildGame.test.ts` guards that the page builds one world.

## 56. Lost carriers search in loops back through where their vector ran out, and smell their own mound (design, ja-lp4.11, ja-lp4.6.3, 2026-11-11)

**Research basis:** [nest-search.md](nest-search.md). No full text could be fetched (network policy), so every figure is **unverified**.
- **Loops from the origin.** A *Cataglyphis* forager whose vector runs out at no nest searches in loops of ever-increasing size that start and end at that spot and point different ways. The search stays centred there for an hour or more (Wehner & Srinivasan 1981; Müller & Wehner 1994; modelled by Waldner & Merkle 2018).
- **Width by the trip.** The search is wider after a longer trip out, set by the distance the vector gives (Merkle, Knaden & Wehner 2006; Merkle & Wehner 2010).
- **Smell, while searching.** Homing ants follow their nest's odour only once their vector has run out (Buehlmann, Hansson & Knaden 2012; Spehr et al. 2026). Harvester ants' mounds carry colony hydrocarbons, strongest at the entrance, which speed returning foragers (Sturgis, Greene & Gordon 2011).

**The problem (measured).** G1 fails its bound on every seed. In ja-web's diagnosis (seeds 10 and 5), every carrier on the plane that held food over 120 s was homing and searching:
- **The trips:** median 364–417 cells out, so the vector's miss is a median 48–51 cells, against `HOLE_SIGHT` 6.
- **The search:** U3b's 4-point spiral had grown to a median reach of 57–64 cells (160–260 at the 90th percentile). It never comes back over the centre.
- **Offline geometry:** today's spiral finds 74 % of carriers on 400-cell trips within 120 s, and never more than 81 %. Centred loops reach 99 % in 20 minutes but are no faster in the first 120 s. A hole sensed from 20 cells lifts the 120-s share to 86–93 % ([nest-search.md](nest-search.md), "What the game does today").

**Decisions.**
- Do both, centred loops and the mound's smell (owner, 2026-11-11).
- Sources from abstracts, marked unverified (owner, 2026-11-11).
- Parameters, all **design** and tuned against S1 and G1 (proposed: needs the owner after S1's baseline):
  - loops headed a golden angle apart;
  - a first reach of σ/2, growing σ/8 a loop, with σ from the ant's own trip;
  - `SEARCH_STALL` skipping a waypoint instead of widening.

**The mechanic.** One world's plane only (`line !== null`); the side view and top-down are bit-exact.
- **Loops:** where the vector ran out at no hole, the ant runs loops out from that spot and back, each further out than the last and turned from it. Off: today's spiral (`SEARCH_GROW_2D`).
- **The mound's smell:** a searching ant within its own mound's reach of its hole, on mound ground, steers up its colony's smell to its hole. The reach is the mound's as dug, at least `HOLE_SIGHT`. It is colony-specific and gated on searching. Off: sight 6 only.
- **The sense row:** "Landmarks and entrance odour" widens from near the hole to its own mound, while searching.

**Play.** Lost carriers loop back through the spot they took for home and walk in once they reach their own mound. Fewer ants wander for minutes with food. No new fungus lever: this is groundwork for U6b's one-world baselines.

**Assays and targets.** These land first, with no behaviour change:
- **S1, a search assay on one world.** Carriers are set down on the plane with a set miss, at trips of 100, 200, 400 and 600 cells, seeds 1–10. Targets: ≥ 99 % home within 600 s at every trip length, the search centred on its origin, and the 120-s share reported.
- **G1:** ≤ 2 held over 120 s per colony on seeds 5 and 9, which un-skips its guard in `slow/oneWorld.test.ts`.

The full G1 table on seeds 1–10 is reported against ja-web's.

**Cost (estimated).** None in Jev: steering only, with no situation, legend or question changed. The per-ant work is small; the tick is checked with `colony-bench --one` against ja-lp4.6.7's figure.

**As built (2026-11-11, `ja-lp4.11.1`–`.4`).** One world's plane only; the side-view and top-down golden masters are bit-exact; the one-world golden is unchanged: no carrier searches on its own mound within its window, so it does not exercise the smell (the smell's tests and S1 do). `SAVE_VERSION` 7 (`searchLeg`).
- **Shipped: U3b's spiral with the mound's smell** (`searchLoops` 0, `moundSmell` 1; owner, 2026-11-11, by G1's worst seed without losing A1). The loops are built and tested but switched off: with them G1's worst seed was 49 against 35, and A1 fell to 4/10. Everything below on the loops is measured with `--set colony.searchLoops=…`.
- **S1** (`experiment.ts` `search1`, `npm run exp -- --one s1`): on each seed's default plane (512 × 368), 40 of the player's carriers per trip length T (100, 200, 400, 600 cells) set down at t = 0 at their vector's end: odoSurf = T, each drift part drawn as the game draws it (σ = 0.1/√2 per axis); a draw ending in rock, within 2 of an edge, or in open ground walled off from the hole is drawn again. The player's mound starts as the game heaps 1,000 pellets (about G1 at 5 minutes; reach ~16). Every other ant is young, no scouts, and a carrier home is made young, so the carriers search alone. 600 s. Reported: the share home (down its own hole) in 120 s and 600 s, the median time of those home, `centre` (each carrier's mean position from its origin, sampled each second; mean, cells) and `spread` (its mean distance from the origin).
- **Loops** (`#searchOn`, `#believePlane`, params `searchLoops`, `searchGrow`, `searchTurn`, `searchPetal`, `searchStall`): where the vector ran out at no hole, the ant visits three points a loop: out to the loop's reach at its heading − half the petal's width, across to + half, back to the origin (reached within `LOOP_AT` 2: it turns no tighter than ~1.2 cells and circled a point 1 away). Loop k heads `searchTurn` × k on from the first (which heads the way the ant faces; no random draw) and reaches σ × (`searchLoops` + `searchGrow` × k), at least `SEARCH_START` 3; σ = 0.1/√2 × its own odoSurf. No cap but the plane's longer side. `searchLoops` 0 is U3b's spiral bit for bit. The home trail still leads a searcher.
- **The mound's smell** (`#onOwnMound`, `moundSmell`): a searching ant (`search` ≠ 0) on the plane within `max(HOLE_SIGHT, 2 + planeMoundReach(heaped))` of its own hole (the mound's reach as dug: the farthest `#carryOut` sends a pellet now) and on spoil underfoot (the plane's height field, as the undertaker's midden rule reads it) believes its hole where it is, as in sight of it. Not on a full vector; the reach is its own colony's, so a rival's mound doesn't pull. Off: `HOLE_SIGHT` only.
- **S1, seeds 1–10** (shares pooled over 400 carriers a trip, worst seed in brackets; T = 100 is 99.3–100 % in 120 s in every row):

  | T | `main` (U3b spiral) 120 s / 600 s | loops (design: σ/2, σ/8, golden, 60°, skip) | loops + smell (design) | loops + smell (tuned: 1.5σ) |
  |---|---|---|---|---|
  | 200 | 93.5 % (80) / 97.7 % (90) | 90.8 % (77.5) / 99.8 % (97.5) | 96.0 % (85) / 99.5 % (95) | 97.7 % (87.5) / 100 % (100) |
  | 400 | 58.5 % (40) / 88.0 % (72.5) | 62.2 % (42.5) / 96.7 % (90) | 69.0 % (40) / 99.3 % (95) | 81.8 % (60) / 98.7 % (95) |
  | 600 | 32.5 % (5) / 77.5 % (55) | 41.3 % (25) / 88.0 % (70) | 51.5 % (32.5) / 92.3 % (82.5) | 57.5 % (22.5) / 94.5 % (80) |
  | median s (400 / 600) | 89 / 136 | 71 / 134 | 40 / 98 | 29 / 65 |
  | centre / spread (600) | 24.7 / 51.3 | 8.5 / 31.7 | 8.5 / 29.1 | 20.3 / 45.3 |

  **Shipped, the spiral with the smell:** 200 cells 97.0 % (85) / 98.8 % (95); 400 cells 71.0 % (50) / 92.3 % (75); 600 cells 42.0 % (20) / 86.3 % (70); medians 60 and 121 s; centre / spread at 600 cells 18.8 / 41.8. Better than `main` at every trip, short of the loops in S1.
- **Confirmed on seeds 11–20** (loops + smell, 1.5σ): 400 cells 74.5 % (50) / 97.2 % (90), `main` 56.3 % (32.5) / 86.3 % (72.5); 600 cells 52.3 % (30) / 91.5 % (77.5), `main` 37.5 % (10) / 76.3 % (67.5). Loops alone (1.5σ): 61.2 % / 96.2 % and 41.8 % / 86.5 %.
- **The target is not met:** ≥ 99 % home in 600 s holds at 100–200 cells with the loops but not at 400 (98.7 %) or 600 (94.5 %); with the shipped spiral and smell, at 100 cells only (98.8 / 92.3 / 86.3 % at 200 / 400 / 600). The carriers left are mostly far in the vector's tail (misses of 2–3σ) or behind rock: on seed 4, eleven origins lie in a pocket 20–50 cells from the hole across a rock band, 75–130 steps round it.
- **Tuning the loops** (S1 seeds 1–10, one at a time, by the worst seed; 20 a trip until the last rounds, then 40):
  - first reach (`searchLoops`): 0.25, 0.5, 1, 1.5, 2 σ: 1.5 best at 400 cells (81.8 %, worst seed 60, in 120 s; 98.7 %, worst 95, in 600 s). **1.5.**
  - growth (`searchGrow`): σ/16, σ/8, σ/4: within noise of each other; σ/16 worst at 600 cells. **σ/8** (the design).
  - turn (`searchTurn`): the golden angle against 90° and 180°: golden best (600 cells in 600 s: 94.5 %, against 90.3 % and 85.5 %). **Golden.**
  - petal width (`searchPetal`): 60°, 90°, 120°: no gain from wider. **60°** (the design).
  - **the stall rule** (`searchStall`, 3 s no nearer its point): skip to the next point (1) against start the next, wider loop (0): 400 cells 98.7 % (95) against 98.0 % (92.5) in 600 s, 600 cells 94.5 % (80) against 93.8 % (82.5), centre 20 against 26. A third rule, not stalling while following a wall (15 s instead), was no better (90.5 % at 600). **Skip (1)** (the design).
- **G1** (seeds 1–10, both colonies, against `main` = ja-web, which this run reproduced exactly: food carried down 44,582, births 7,276, ants lost 1,679, raid scouts 187). Most foragers holding food over 120 s, you / rival:

  | seed | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | `main` | 15 / 17 | 14 / 20 | 11 / 24 | 41 / 18 | 17 / 7 | 16 / 28 | 11 / 16 | 14 / 12 | 18 / 8 | 22 / 14 |
  | loops 1.5σ + smell | 8 / 8 | 8 / 16 | 13 / 25 | 49 / 8 | 12 / 3 | 9 / 19 | 6 / 21 | 13 / 8 | 9 / 3 | 24 / 11 |
  | **shipped: spiral + smell** | 10 / 13 | 19 / 8 | 12 / 24 | 35 / 7 | 6 / 10 | 10 / 18 | 6 / 11 | 11 / 10 | 7 / 2 | 18 / 8 |

  Worst colony per seed: `main` 17, 20, 24, 41, 17, 28, 16, 14, 18, 22 (worst 41, sum 217); loops + smell 8, 16, 25, 49, 12, 19, 21, 13, 9, 24 (49, 196); **spiral + smell 13, 19, 24, 35, 10, 18, 11, 11, 7, 18 (35, 166)**.

  - **G1 still fails, 0/10.** Shipped: the guard's seeds 5 and 9 at 10 and 7 (bound 2); better than `main` on 9 seeds, equal on 1 (seed 3, 24). All held are on the plane. Loops + smell: 5 and 9 at 12 and 9; food carried down 44,075 (−1.1 %), births 7,199 (−1.1 %), ants lost 1,618 (−3.6 %). The guard stays skipped behind `G1=1`.
  - **Which part helps G1** (seeds 4, 5, 9, 10, worst colony): `main` 41, 17, 18, 22; loops 1.5σ alone 57, 19, 26, 38; spiral + smell 35, 10, 7, 18; loops 1σ + smell 70, 14, 10, 22; loops 1.5σ + smell 49, 12, 9, 24. **In G1 the smell does the good and the loops cost**, the reverse of S1's 600-s share. Seed 4's player: carriers back from a pocket north-east of its hole, across a rock band, believe home 20–30 cells away through rock; their loops grow by a point each 3-s stall (25–55 points) and never get round.
  - **Why the bound is hard:** held carriers sampled on seed 9 (loops + smell, every 30 s from 150 s) had missed by 1.2–3.2σ, median ~2.3σ. In 120 s at 7 cells a second an ant sweeps at most ~840 × 12 cells² with sight 6: a disc of ~56 cells, ~1.9σ at a 420-cell trip, so even a perfect search leaves ~16 % of such carriers over 120 s; a mound of reach 16 raises that to ~3σ. Hundreds of carriers a minute then keep several held at any moment.
  - **The first reach against G1 and A1.** At σ/2 (the design) G1 was worse still on seeds 4, 5, 9, 10: 92, 9, 10, 31 (seed 4's pocket: the loops grew by stalls). Among the loops, 1.5σ was best by G1's worst seed as well as S1's.
- **The assays on one world, shipped (spiral + smell)** (`npm run exp -- --one`, seeds 1–10, against ja-web's table in [one-world.md](one-world.md) §5): A1 8/10 (ja-web 8/10; fail 5, 9; worst 0.69), A2a 10/10 (worst 0.76), A2b 9/10 (8/10; fail 3, 0.11), A3 10/10 (clear ≤ 33 s), A4 10/10 (scatter ≤ 0.35), A5 0/10, A5b 8/10 (7/10), A6 5/10 (5/10; worst seed 8, 0.81), A9 3/10 (worst 9.99, seed 7), A10 0/10, A8 reports (carried past reception 0.41–1.00).
- **The same with the loops** (1.5σ + smell): A1 **4/10** (ja-web 8/10; worst seed 2, 0.63), A2a 10/10 (worst 0.79), A2b 8/10 (fail 4, 6; worst 0.16), A3 10/10 (clear ≤ 21 s), A4 10/10 (scatter ≤ 0.40), A5 0/10, A5b 6/10 (7/10), A6 4/10 (5/10; worst seed 8, 0.74), A9 3/10 (worst 9.87, seed 7), A10 0/10, A8 reports (carried past reception 0.28–1.00). **A1 is the loops' doing:** spiral 8/10, spiral + smell 8/10, loops 1.5σ alone 4/10, loops σ/2 7/10. Lost carriers with food run their long loops over both branches.
- **Tick** (`colony-bench --one --page`, 1,200 + 1,200, seed 1, two runs each, second-half mean): shipped 10.63 and 10.59 ms; loops + smell 10.19 and 10.73 ms; against 10.38 and 10.85 with the search off (this branch before the defaults changed) and ja-lp4.6.7's 10.66 and 10.81. No cost.
- **Cost:** none in Jev (steering only: no situation, legend or question changed; `precache.test` passes).

**Owner (2026-11-11): the bound stays.** G1's bound stays at 2; its guard stays skipped behind `G1=1`, and `ja-lp4.6.3` stays open. Why it still fails: the carriers held over 120 s missed by a median ~2.3σ, while an ant can sweep only ~1.9σ round its vector's end in 120 s (sight 6; the mound's smell widens that only near the hole). On seed 4, carriers back from a pocket across a rock band can't get round to a hole 20–30 cells away. Proposed follow-ups (beads to file):
- **Shorter trips:** the error grows with the trip (σ = 0.1/√2 × the way out). G1's median trip is 364–417 cells; foragers that turn for home sooner, or food nearer the holes, keep misses within reach.
- **Route memory for rock pockets:** a carrier retraces the way it came out (route following, beside path integration) where its vector points through rock.

**Still open.** The follow-ups above; the loops, switched off, wait on them: they win S1 (94.5 % against 86.3 % home in 600 s at 600-cell trips) but lose G1 and A1, where carriers with food run long loops through rock and over trails.

**Beads.** `ja-lp4.11` (epic), with children in build order: the S1 assay; centred loops; the mound's smell; tuning, G1 and docs. `ja-lp4.6.3` waits on the epic.

**To read when the network allows:** the full texts of Waldner & Merkle 2018, Merkle et al. 2006 and Sturgis et al. 2011.

## 57. Foragers on the plane search less and go back to their last find (design, ja-lp4.15, ja-lp4.6.3, 2026-11-11)

**Research basis:** [forager-trips.md](forager-trips.md). No full text could be fetched (network policy), so every figure is **unverified**.

**The problem (measured).** G1 still fails after §56. The carriers it counts found food no farther away than anyone else (seed 10: 61–66 cells from their hole, against 38–67 for every pickup), but had searched 32–46 s for it (a normal pickup: 1–6 s), so they had walked 5–7 times their distance from home, and the game's home-vector error grows with every cell walked. Cutting `patience` for both colonies to 30 s met G1's bound on seeds 5 and 9 (worst colony 2 and 0, against 10 and 7) but cost births 8–25 % a colony and the rival's food on seed 9 a third.

**Decisions.**
- Owner (2026-11-11): both levers, one PR: a shorter search on the plane for G1, and site fidelity to win back the food it costs.
- Owner (2026-11-11, PR #70): G1's bound stays at 2.
- Design: one world's plane only, each behind a setting whose "off" is main bit for bit (`planePatience` 1, `siteFidelity` 0).

**The mechanic.**
- **A shorter search on the plane:** a forager tires at `patience × planePatience` (the fungus's `clock` still scales it).
- **Site fidelity:** a forager that picks up food on the plane keeps its own vector to the spot (drift and all) and, on its next trip, walks it straight and searches round it. A trail it meets still takes over. It forgets on tiring there or on its next find. New saved state: the food vector per ant; save version bumped once.

**Assays.** F1 (new): of foragers set down after a find 40–80 cells out, with fidelity on, at least 80 % reach the spot within 30 s, walking under 1.5 times the straight line. G1, seeds 1–10: at most 2 on seeds 5 and 9, food carried down and births within 5 % of §56's, summed. `exp --one all` against §56 (A1 stays 8/10).

**Play.** Foragers fan out each to its own patch and come back to it; fewer wander far with food. The fungus's "time out" lever matters more on the plane, and a host's route becomes predictable. No new lever.

**Cost.** None: steering and the ant's own body; no situation field, legend or question changes.

**Beads.** `ja-lp4.15` (epic), children in build order: F1 and its baseline; the shorter search; site fidelity; tuning, G1 and docs. `ja-lp4.6.3` waits on it and on `ja-lp4.16` (route memory round rock).

**Still open.** `planePatience`'s value (the build sweeps it with fidelity on). The error law (proportional to cells walked today, a random walk would be their square root) is the owner's call and not part of this. The full texts of Merkle & Wehner 2010, Wolf et al. 2012, Cheng et al. 2006 and Beverly et al. 2009.

