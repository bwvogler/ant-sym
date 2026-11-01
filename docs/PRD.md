# jev-ants — product requirements

*Written 2026-10-25 from an interview with Aaron. Every decision below was chosen explicitly; the "why" is kept so later work can revisit it on purpose rather than by accident.*

## 1. Vision

A web app where a few hundred to a couple of thousand ants, scattered at random, walk around and collectively form whatever the user typed or uploaded: a word, a letter, a black-and-white image. The point of the app is to **showcase Jev** (TypeSafe's System One decision model): every ant's step is a Jev decision made from what the ant can see around it. Nothing central plans the picture. It emerges.

Tone is the spirit of the ant colony: self-coordination, local information, a picture nobody drew.

## 2. Decisions from the interview

| Topic | Decision | Why |
|---|---|---|
| Format | Web app. Vite + React + TypeScript + Tailwind v4, Canvas 2D for the field, a small Node proxy for the API key. | Moving a few thousand dots is trivial in a browser; the bottleneck is Jev round trips, not rendering. No heavier engine needed. WebGL points only if we ever want 20k+ ants. |
| Agent model | **Packed requests.** ~100 ants share one `state`; each ant gets its own questions. | Jev evaluates every question in isolation against the shared state, so each ant still gets an independent decision and can genuinely see its neighbours. One state per request is the API's shape; there is no batch endpoint. Measured: 100 ants in ~0.5 s. |
| Ant brain | Three questions per ant: **direction** (choice: 8 compass points + stay), **pace** (score: creep / walk / hurry), **settle** (noul: "this cell still needs ants, stay"). | Extra questions cost almost no latency. Settling is what makes the picture sharpen instead of jitter. |
| Scale | 500 to 2,000 ants, default 1,000. | Enough density for letters and simple images at a 64×64 grid. |
| Cadence | Each **unsettled** ant re-decides about every 2 s and coasts in between; settled ants ask again only when their cell's deficit changes. Scheduler takes the stalest ants every ~200 ms. | 1,000 ants → ≤5 requests of 100 per second at the start, decaying as ants settle. Measured headroom: 8 parallel requests of 100 ants in 0.65 s wall. Parallelism buys latency, not cost (see §8). |
| Spend control | Explicit **Start / Stop**. Running cost from the real `usage.input_tokens` of every response × $0.042/M, never estimated. Three stop conditions, whichever first: **formed** (local grid error under threshold, confirmed by the overseer noul), **time cap** (default 3 min), **spend cap** (default $0.50). Caps editable. After a stop, ants idle on the local rule and Jev is not called. | A demo must never run away, and a formed picture should cost nothing to look at. Cost plan in §8. |
| Images (Jev) | **Overseer.** Every few seconds, send the current field and the target as two images; ask a `box` ("the region of current that most lacks ants vs target") and a `noul` ("current is a recognisable copy of target"). The box becomes an attractor hint in each ant's state; the noul drives a "formed" badge. | Showcases Jev's new image input without making the core loop depend on a feature TypeSafe calls "dreamer-ready, not production-ready". |
| Shading | Target image → greyscale → downsample to a grid (64×64 default) → darkness per cell → normalised so Σ target = ant count. Density is tone. | Text and images are the same pipeline: text is rendered to an offscreen canvas first. |
| Baseline | A **local-rule** mode (greedy toward max neighbouring deficit, with noise) next to Jev mode. | A greedy rule would also form the picture; the demo should show the difference, not assert it. Also the fallback at the spend cap and under 429s. |
| Look | **Ink on warm paper**: lingo-dojo palette. Light: ink ants on `#f6f4ef`; dark: pale ants on charcoal. One jade accent for the overseer box and selected things. Ants are 2 px oriented ticks. | More ants = darker reads naturally as a pen drawing. Reuses an existing, tested token scheme. |
| Controls (v1) | Text input + image upload with live target-grid preview; ant count, sim speed, Jev/local toggle; Jev telemetry panel; overlays (deficit heatmap, overseer box, pheromone trails). | All chosen. |
| End state | Overseer "formed" badge; **Scatter** button; **Morph** (type a new target while formed and ants walk to it). GIF recording deferred to a later milestone. | Scatter is the replay moment. Morph is cheap once the target is just a grid. |
| Deployment | Local first (port **38500**, key from `JEV_API_KEY` in the shell), server written so it can be hosted later with per-visitor budgets. | Same shape as lingo-dojo / travel-guide. |
| Process | Beads (prefix `ja`) + one PR per milestone with agent review before merge. | House convention. |
| Repo | Public, `scalefreegan/jev-ants`, MIT. | Showcase piece. |

## 3. Architecture

```
browser (Vite + React)                          node (Vite dev-server middleware, web/server/)
┌──────────────────────────────────┐            ┌─────────────────────────────────┐
│ sim/        pure TS, no DOM      │            │ api.ts    wrap(): same-origin   │
│   grid.ts   target density grid  │  POST      │ jev.ts    pool of N parallel    │
│   ants.ts   positions, headings  │  /api/jev  │           connections → TypeSafe│
│   local.ts  greedy baseline      │ ─────────► │ budget.ts token/cost ledger     │
│   pack.ts   ants → Jev request   │ ◄───────── │ overseer.ts images → box/noul   │
│   apply.ts  answers → ant intent │  answers   └─────────────────────────────────┘
│ ui/         React, Tailwind v4   │                        │ Bearer JEV_API_KEY
│   Field.tsx canvas renderer      │                        ▼
│   Panel.tsx controls/telemetry   │              https://api.typesafe.ai/v1/systemone
└──────────────────────────────────┘
```

- **Sim loop** runs in the browser with `requestAnimationFrame`. Each tick: move ants by heading × pace, update the density grid, decay pheromone, redraw. Jev answers arrive asynchronously and update each ant's *intent* (heading, pace, settled); the tick loop never waits on the network.
- **Scheduler**: every 200 ms, pick the ants whose last decision is oldest (and not settled, or settled but with a deficit that changed), pack them 100 per request, post. In-flight limit 5 (browsers allow 6 connections per host; one stays free so Stop reaches the server at once). The server retries 429/529 honouring `retry-after`; the browser treats a 429 "busy" from the proxy as "release these ants, try next cycle".
- **Server** holds the key, forwards packed requests, counts `usage.input_tokens`, enforces the session cap, and runs the overseer (renders nothing itself; the browser sends two PNGs).
- **Connection pool**: Node's `fetch` on one dispatcher serialised our requests (10 × 50 ants took 2.9 s stacked; separate connections took 0.65 s for 8 × 100). The server must use an undici `Agent` sized for the in-flight limit, and a test must pin that parallel requests overlap.
- `sim/` is pure and covered by `node --test`; the renderer and React layer are thin.

## 4. The Jev contract

### 4.1 Ant request (packed)

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

`box` returns normalised `{top,bottom,left,right}` in 0..1 and has no "not found"; `done` gates whether we trust it. Runs every ~3 s while not formed, every ~10 s once formed. Image tokens bill at the normal input rate.

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

**Cost model.** tokens/s = ants × tokens-per-ant ÷ cadence. At 1,000 ants, 376 tok/ant, 2 s: 188k tok/s → $0.0079/s → **~$28/hour** at full tilt; ~$20/hour with the terser schema; roughly halves at 500 ants or a 4 s cadence. Settled ants are scheduled rarely, so a formed picture costs little to hold. The $1 default cap is about 2–3 minutes of forming at 1,000 ants. The telemetry panel shows all of this live.

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

**A navigation fix found on the way.** On seed 3 the rival's nest sat behind a wall. Tired ants homing in a straight line bumped the wall, took a 1 s detour and bumped it again, while nobody walked out to lay a fresh home trail: 447 of 450 ants stuck. Detours now double with each bump in a row, from 0.5–1.5 s on the first bump up to 8–24 s, and during a detour the ant wanders instead of homing. (Review found this is not enough on every map: a long wall can still trap homing ants; PR #5 replaces straight-line homing with a walking-distance map.)

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
  - After 45 s it tries the other side once. After 120 s it gives up and wanders 8–24 s, then tries afresh.
- **Hints and physics:**
  - The home trail is a hint, climbed at a quarter of the turn rate. At full rate, clusters circled on their own trail.
  - `squeezes()` stops ants slipping diagonally between two rocks.
- **Measured:** seeds 1–10 at 600 s with the UI defaults (600 + 600 ants), each colony's share of ants out more than 120 s.
  - Before (straight line): up to 100 %, and 18 of 20 colony-runs over 5 %.
  - With the map: 0 %.
  - Now: at most 7 % (seeds 2 and 10), with 16 of 20 runs at 5 % or below.
  - Most of those are slow, not trapped: within the next 30 s about 40 % reach home and more get closer. Truly stalled ants are at most ~3 % of a colony (`ja-` bead filed).
  - Ticks are ~10 % slower (3.7 vs 3.3 ms mean), because wall-followers spread trails over more ground (59 vs 48 awake chunks).

**Measured** (`npm run colony-bench`: 1,200 + 1,200 ants, 60 sim-s, local rule, same container):

| Map | Before (dense) | After (chunked) |
|---|---|---|
| 160×100 | 3.58 ms median | 2.74 ms mean, 2.57 ms median |
| 512×320 | 12.12 ms median | **3.27 ms mean**, 2.96 ms median, 4.81 ms p90 |

The browser holds 60 fps at 512×320 in headless Chromium, with no console errors in light, dark or phone layouts. The renderer walks the map chunk by chunk, but still fits the whole map to the canvas; MR 6 adds the camera.

**Jev:** no change. Situations don't depend on the map: 1,296 possible, 248 met in a 4-minute `colony-cost` run (600 + 600 ants), at ~451 tokens per question. That run cost ≈ $0.009, ≈ $0.13/hour while retuning every 0.8 minutes, against the ≤ $0.25/h target. The request state is unchanged, so tokens/ant are unchanged.
