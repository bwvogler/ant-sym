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
| Deployment | Local first (port **38500**, key from `JEV_API_KEY` in the shell), server written so it can be hosted later with per-visitor budgets. | Same shape as lingo-dojo / travel-guide. |
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

- **Porters jam the nest** (review of #36): resting foragers crowd the royal chamber's tunnels. On `side-bench 1-6 600 600 2` the porters holding food over 120 s at the end went from 1 to 20. The held guard and assay G leave porters out, so `heldProbe` now reports `maxPorting`, and `slow/side.test` carries a todo for it. This is ja-3po.
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
