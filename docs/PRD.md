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

## 14. The player is the fungus: infection, spread and the spore brush (fungus 1a, 2026-11-01)

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

## 15. The perception layer: the fungus bends what a host senses (fungus 1b, 2026-11-01)

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

## 16. Recognition: strangers by odour, and one colony at the end (fungus 1c, 2026-11-01)

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

- Garden in **one** colony moves that colony's nest halfway (to 0.5) and no further, so the colonies stay apart (tested on seed 2). On a small map (160×100, seed 1) Garden crossed into the rival by contact on its own, and the colonies unified anyway.
- Lockpick (soothe) alone calms but never unifies, because it does not touch odour.
- Checked in the browser (light and dark): Garden swept over the map at 4× speed reaches **unified** in about 45 s of real time; both stances return to forage, with 0 fighting and food coming home. No console errors.

**Cost per tick** (`npm run colony-bench`, 1,200 + 1,200 ants, 60 sim-s, 512×320): no spores 3.79 ms mean (3.56 before 1c), with the same food stored; every ant loaded 4.38 ms.

**Jev:** the situation and the request are unchanged, so tokens per ant are unchanged. Peace also makes Jev **cheaper**: a unifying game meets fewer situations (122–178 against 275–319), because war situations stop arising.

## 17. Emission: what a host gives off (fungus 1d, 2026-11-01)

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

They are tools for the fungus policy (`ja-t4d.5`) to use where they help, not traits to run in every host of a strain. Garden's shared odour (§16) is still what unifies.

**Jev:** the request state and the situation are unchanged, so tokens per ant are unchanged. Quieter and leakier fronts make some games meet more situations (up to 141 → 258). At ~451 tokens per question that is ≈ 50k tokens, ≈ $0.002 per doctrine.
