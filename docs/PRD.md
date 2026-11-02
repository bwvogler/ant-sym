# jev-ants — product requirements

*Written 2026-10-25 from an interview with Aaron. Every decision below was chosen explicitly; the "why" is kept so later work can revisit it on purpose rather than by accident.*

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
│ sim/       picture: pure TS, no DOM    │           │ api.ts    wrap(): same-origin    │
│   grid, ants, local, engine            │  POST     │ http.ts   JSON bodies, HttpError │
│   jevBrain   ants → request → intent   │ /api/jev  │ jev.ts    node:https Agent pool  │
│   policyCache situations, cache        │ ────────► │           of N → TypeSafe        │
│   overseer   images → box / noul       │ ◄──────── │ ledger.ts tokens, $, caps, width │
│   targets    text/image → grid (DOM)   │  answers  └──────────────────────────────────┘
│ colony/    colony + fungus: pure TS    │                         │ Bearer JEV_API_KEY
│   world, colony, pheromone, battle,    │                         ▼
│   recognition, fungus, game, brains    │            https://api.typesafe.ai/v1/systemone
│ ui/        React, canvas, Jev clients  │
│   jevScheduler (picture), colonyJev    │   shared/jev.ts: wire types, price, caps,
│   Field / ColonyField, panels, hooks   │                  in-flight width (both sides)
└────────────────────────────────────────┘
```

- **Sim loop** runs in the browser with `requestAnimationFrame`. Each tick: move ants by heading × pace, update the density grid, decay pheromone, redraw. Jev answers arrive asynchronously and update each ant's *intent* (heading, pace, settled); the tick loop never waits on the network.
- **Scheduler**: every 200 ms, pick the ants whose last decision is oldest (and not settled, or settled but with a deficit that changed), pack them 100 per request, post. In-flight limit 5 (browsers allow 6 connections per host; one stays free so Stop reaches the server at once). The server retries 429/529 honouring `retry-after`; the browser treats a 429 "busy" from the proxy as "release these ants, try next cycle".
- **Server** holds the key, forwards packed requests, counts `usage.input_tokens` and enforces the caps. The overseer is the browser's (`sim/overseer.ts`, `ui/overseerImages.ts`): it renders two PNGs and posts them as one more request.
- **Connection pool**: Node's `fetch` on one dispatcher serialised our requests (10 × 50 ants took 2.9 s stacked; separate connections took 0.65 s for 8 × 100). The server uses a `node:https` `Agent` sized for the in-flight limit (an undici `Agent` queued behind one warm socket too, `web/server/jev.ts`), and a test pins that parallel requests overlap.
- `sim/` (but `targets.ts`) and `colony/` are pure and covered by `node --test`; the renderer and React layer are thin.

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
- On 409 it stops and goes back to the local rule. On busy it requeues. On a failure it cools down for 5 cycles.

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

*§24–28 were §15–19 on the side-view stack (MR 8–15 and the nest design); they were renumbered when `main` (the fungus, §15–23) was merged in (nest slice 0, ja-6nm).*

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
- Forks take ±60° plus noise. New tunnels start along the face.
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
     - closed caverns all get home (26–28 s mean);
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
  - **Stale branches.** At a cell where a neighbour smells far staler than the path, a carrier turns in 30 % of the time (only in the first 20 s of its trip). It walks on by the stalest way ahead to the branch's end and fills the last cell, so branches shrink from the tip, a cell per pellet; at an end with nothing to fill it heads home. A branch's mouth and first cells touch the tunnel it leaves, so they are never tunnel cells on hexes: this is decided in the tick on arrival, not in the tunnel walk.
  - **Unchanged guards:** no food in the cell, no ant of either colony (grids plus a direct look at nestmates), not within the nest's radius + 2.
  - **Tuning** is in `BACKFILL`, mutable for sweeps and tests.
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
  | wait 2.5 s, pellet scent 60 s ×7 (chosen) | 53 % at 600 s | food home −12 % |
- **Measured** (seeds 1–5, 600 s, 600 + 600 ants, underground):

  | | MR 11 | MR 12 |
  |---|---|---|
  | dug soil refilled | 0.6 % | **53.3 %** (the *Atta* end; *Pogonomyrmex* 2.5 %) |
  | cells dug per colony | ~3,500 | ~6,200 (leaf-cutter churn: space dug, refilled, dug again) |
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
- **Food.** Piles 3–6 cells wide lie on the walkway (seeds and bits, as harvester ants forage): about three per 64 columns, at least 16 from an entrance. Pockets lie in the soil at least 10 rows down. Everything is reachable, walking or digging.

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

**MR 15: the mound is carried and loose** (owner, 2026-11-01): "Why is the mound not movable? They should be pellets that are actually easier for ants to move… right now ants can touch the mound from below and it just grows somewhere." Both were true. A pellet "dropped" at the hole was put in a random column up to 90 away, and loose soil could never be dug. The owner chose for ants to both spread the mound and take it down to backfill.
- **Carried out.** A pellet carrier comes up through the hole and walks out along the ground, away from the hole on a random side. It drops the pellet where it stands, once it is a chosen distance out. That distance grows with the mound (√ of a uniform draw over a reach of 3 + cells ÷ 6, at most 90).
  - The cell lands on that spot and slides only to the angle of repose. The mound grows where you see ants drop soil.
  - Funnels: every hole's funnel still holds.
  - Give-up: a carrier that can't get onto the ground within 15 s drops the pellet anyway, heaped on top of its column clear of the crater.
- **Loose.** Mound soil (`map.loose`) is no crust. Dug from below, it comes up in a quarter of packed soil's time (`LOOSE_DIG`). The pellet is a *moved* one: it doesn't count as dug, and it goes back out like any other.
  - **Settling:** taken from inside the heap, the column settles a cell, so it is the column's top that goes, never a hole under hanging spoil.
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

The research and the design are in [`docs/nest-and-home.md`](nest-and-home.md), not built yet:
- **Outside,** home is the hole: a step-counting vector that drifts, corrected by landmarks and the entrance's smell, and reset in the shaft.
- **Inside,** ants go by **gravity**, memory and **chemical road signs** on the floor. Each chamber has its own smell.
- **The queen's scent** says where she is, not where home is.
- **Real nests** are shafts and chambers with jobs: royal, brood, store (deep), reception (top) and midden, with workers zoned by age.
- **Losing the only queen dooms a colony**, without ending it at once: no new workers, then a slow decline. So *orphaned* becomes a state, and *fallen* stays "no workers left".

Slices 0–9 are beads under the epic, starting with merging the fungus milestone (`main`, PR #7) into this stack.

## 29. The fungus on hexes: `main` merged into the side view (nest slice 0, ja-6nm, 2026-11-02)

The fungus milestone (§15–23, PR #7) and the maintenance review (#13) were built on square cells; the side-view stack (§24–27) rewrote the colony on hexes. This merge puts them together. The sections were renumbered (see the note above §24).

**How it was merged.** `colony.ts` keeps the stack's hex movement and homing. Main's fungus hooks were ported onto it:
- the per-ant fungus arrays and `asIs`;
- the perception gains in `#sense`;
- `look` and the `ENEMY` threshold in enemy sensing;
- the fungal clock on tiredness, and calm on charging;
- `layGain`, and the food leak into the rival's field.

Two of main's homing fixes apply on hexes too and were ported:
- **A trip home starts afresh**, whether the ant picked up food or its policy sent it home: no detour or bumps carried over.
- **No progress for `TUNNEL_STALL` (20 s):** the tunnel walker picks branches by the home vector for `BY_VECTOR` (15 s), then goes back to scent. Without this, homing carriers can circle a ring of scented tunnels for ever.

The agent review of this merge found that the first cut had dropped both, and reproduced the ring trap on hexes (6 of 6 seeds). Each now has a test that fails without it.

Main's "lost wall" fix (`WALL_LOST`) is not carried over. On hexes a wall-follower walks the wall cell by cell with a hand on it, so it can't drift off into the open.

**Grid code moved to hexes** (`hex.ts`):

| Where | Change |
|---|---|
| `Recognition.build` | bins each ant by its hex cell |
| `Recognition.around` | the cell and its neighbours within `r` hex steps (was a (2r+1)² square) |
| `Fungus.step`, `#gather` | an ant's cell, and its six neighbours (was the 3×3 square) |
| `Fungus.paint` | the brush is a disc of hex centres |
| `Game.enemiesNearNest` | the hex disc round the chamber, and the entrance as well |

Backfill now asks Recognition for every ant of another colony (`look` at tolerance −1), so it won't wall one in, stranger or not. Tests that placed ants at square-cell centres (`x + 0.5, y + 0.5`) place them at hex centres instead (`centreX`, `centreY`).

**Measured** (`scripts/colony-bench.mjs 1200 60 1`, merged vs the stack's tip mr15):
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
- After `GROUND_FLIP` (24) cells it turns back with the other hand.
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
  - top-down maps keep no vector.
- side.test.ts's "never away from the hole" now reads "never away from where it believes the hole is" (searching aside).

**Jev cost:** unchanged. `down` is a sense in the sim, but not yet in the situation; slice 3 decides that.

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
- **Roomy,** every other kind of digging happens at `ROOMY_DIG` (15 %) of its rate: tunnel ends, starts off walls, faces met head-on. A 30-ant colony in the founding chamber dug 3–7 cells in two minutes, against about 78 without chambers.

**Chambers never join.** A chamber face (widening or new) is dug whatever the tunnel spacing rules say, so it may open onto a tunnel (a junction), but never onto another chamber of either colony. The first cut forbade opening onto any passage, and chambers stayed at 1–6 cells with every colony crowded 100 % of the time.

**Measured** (side view, 600 + 600 ants, 600 s, seeds 1–6; the slice 1 numbers are from §30):

| | Slice 1 | Slice 2 |
|---|---|---|
| Cells dug, all colonies | 43,422 | 31,116 (−28 %) |
| Floor per ant underground | none | held at about 0.1 (crowded 24–64 % of the time) |
| Chambers per colony at 600 s | 1 (given) | 8–18 |
| Out over 120 s, mean / worst | 1.45 % / 11 % | 1.45 % / 11 % |
| Food home | 16,705 | 15,676 (−6 %) |

Food home is down because less digging reaches less of the food underground. Pellet carriers climbing out of wide chambers by straight line and Bug2 can still wander (filed as a follow-up).

**Depth profile** (Tschinkel; per 10-row band below the ground):
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
- Marks fade slowly (1 % a second) and don't spread. Spreading them kept twice the chunks awake and cost about 10 % of a tick.
- On the ground and on the top-down maps they are never laid and stay asleep.
- **Homing in a tunnel** goes by the mark of where it is going (`SIGN_WEIGHT` 4 × the home trail). For now that is royal; slice 5 sends food carriers to reception.
- **A strong mark underfoot** corrects the in-nest memory, as the home trail does (slice 1).

**The situation.** Underground in the side view, `homeTrail` no longer reads the home trail. It says where the ant is: `tunnel`, or a chamber of its colony by role. On the ground, and on the top-down maps, it is the home trail's level as before.
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

The cost figures above come from a scratch script on the side view: `scripts/colony-cost.mjs` uses the top-down map, which meets no in-nest situation.

**Tests:** `marks.test.ts`:
- every chamber gets a role, and the royal mark is strongest in the royal chamber;
- an ant home with food is asked "royal", and on the ground the home trail level;
- a policy that always answers "return" to a returning ant no longer parks the colony, on either view.

## 33. The queen and brood; births from pupae; losing the queen orphans the colony (nest slice 4, ja-eyp, 2026-11-02)

In the side view, workers come from brood, not from a counter (docs/nest-and-home.md §3.4, "Queen loss"). The top-down maps keep the larder → ants rule and have no queen.

**The queen** lies on the royal chamber's floor.
- **Laying:** she lays an egg at most every `LAY_INTERVAL` (0.5 s). She lays only while the larder holds, beyond what the brood already laid will be fed, a whole worker's food, and while there is room under the cap. Without that reserve, eggs laid into an empty larder starved as larvae.
- **Her pheromone** is the royal mark, strongest where she lies.
- **She can be killed** by strangers at her side (rate `QUEEN_FIGHT` per stranger: a raid that reaches the royal chamber), or by `killQueen()` (the fungus's, slice 8).

**Brood** (`brood.ts`, pure) goes from egg to larva to pupa to worker.
- **Egg:** 1 food, 15 s.
- **Larva:** fed 3 food from the larder by the nurses within two cells of it (0.5 a second with two or more), for at least 20 s.
- **Pupa:** 20 s, then a worker is born where it lay.
- A worker still costs 4 food (`foodPerAnt`) and arrives about a minute after its egg.
- **Nurses:** an idle ant in the royal chamber picks up an egg near it and takes it to the brood chamber holding the least brood, steering by the homing machinery and the brood mark. With no brood chamber yet, brood stays with the queen. Each chamber counts the brood lying in it, so slice 2's brood pull works.

**Ageing.** Workers have a lifespan of `LIFESPAN` (1,800 s), 0.7–1.3× it each. The founding workers start between newborn and half a lifespan old, so none dies of age in a 10-minute game. Old age doesn't count as a loss for the strategist.

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

**Jev cost:** unchanged. The ants' situation is the same; the brood is not in it.
