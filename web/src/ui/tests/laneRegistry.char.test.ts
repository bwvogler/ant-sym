import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AIMS,
  askedLevers,
  decodeSituation,
  DEFAULT_MENU,
  DOCTRINES,
  fungalKey,
  fungusContext,
  laneOfContext,
  LANE_KINDS,
  localPolicy,
  packFungusRequest,
  packModeRequest,
  policyContext,
  readLevels,
  readMode,
  SITUATIONS,
  situationKey,
  validLevels,
  type FungalSituation,
  type Situation,
} from "../../colony/index.ts";
import { ColonyJev } from "../colonyJev.ts";
import { requestFor, SAMPLE_FUNGAL, SAMPLE_SITUATION, tokensPerQuestion } from "../prompt.ts";
import type { PrecacheIndex } from "../precache.ts";

// Characterization of every lane (docs/refactor.md S4.2, ja-fnd.5.2.1): what each lane's key, request, context, local answer,
// reading and cost are TODAY, as literals taken from the code before the lane registry moved anything. The registry's slices
// must leave each of them as it is; none is computed from the code under test. A deliberate change to a lane re-dumps them.

const sha = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
/** A request's identity: a hash of its JSON and its length. */
const idOf = (x: unknown): [string, number] => [sha(x), JSON.stringify(x).length];

const MODE_SITUATIONS: Situation[] = [
  SAMPLE_SITUATION,
  { mode: "return", tired: true, foodTrail: "none", homeTrail: "brood", alarm: "strong", enemy: "near", stance: "defend" },
  { mode: "follow", tired: false, foodTrail: "strong", homeTrail: "faint", alarm: "faint", enemy: "none", stance: "raid" },
];
const FUNGAL_SITUATIONS: FungalSituation[] = [
  SAMPLE_FUNGAL,
  { arousal: "fighting", touch: "foreigner", place: "chamber", task: "nurse", carrying: "brood", groomed: true },
  { arousal: "calm", touch: "none", place: "queen", task: "queen", carrying: "nothing", groomed: false },
];
/** Two doctrines and two aims: a closure over the wrong words shows as a hash that is the other one's. */
const DOCTRINE_TEXTS = [DOCTRINES[0]!.text, "Be bold."];
const AIM_TEXTS = [AIMS[0]!.text, "Spread quietly."];
/** Two menus: every non-lethal lever, and three. */
const MENUS = [[...DEFAULT_MENU] as string[], ["food", "rival", "trail"]];

test("each lane's cache key for fixed situations", () => {
  assert.deepEqual(MODE_SITUATIONS.map(situationKey), [
    "explore|fresh|faint|strong|none|none|forage",
    "return|tired|none|brood|strong|near|defend",
    "follow|fresh|strong|faint|faint|none|raid",
  ]);
  // The fungus's key carries the levers asked (the menu's, a queen's or a worker's), in table order.
  assert.deepEqual(
    FUNGAL_SITUATIONS.map((s, i) => fungalKey(s, askedLevers(new Set(MENUS[i % 2]), s.task === "queen"))),
    [
      "calm|nestmate|outside|forager|nothing|unseen|food,rival,home,alarm,strangers,marks,time,queenScent,trail,leak,alarmLaid,calm,odour,show",
      "fighting|foreigner|chamber|nurse|brood|groomed|food,rival,trail",
      "calm|none|queen|queen|nothing|unseen|show,queenSignal",
    ],
  );
});

test("each lane's cache context, under two doctrines or aims, and the fungus's two views", () => {
  assert.deepEqual(
    DOCTRINE_TEXTS.map((d) => policyContext(d)),
    ["colony-v7-47f9dbc6", "colony-v7-97971313"],
  );
  assert.deepEqual(
    AIM_TEXTS.map((a) => fungusContext(a)),
    ["fungus-v8-side-bb724482", "fungus-v8-side-abe11431"],
  );
});

test("each lane's packed request (a hash of its JSON, and its length), under two doctrines or aims and two menus", () => {
  assert.deepEqual(
    DOCTRINE_TEXTS.map((d) =>
      idOf(
        packModeRequest(
          MODE_SITUATIONS.map((situation, i) => ({ id: `s${i}`, situation })),
          d,
        ),
      ),
    ),
    [
      ["dd23f31db6be0146", 3737],
      ["17685becca019aea", 3572],
    ],
  );
  assert.deepEqual(
    AIM_TEXTS.flatMap((aim) =>
      MENUS.map((menu) => {
        const asked = askedLevers(new Set(menu), false);
        return idOf(
          packFungusRequest(
            FUNGAL_SITUATIONS.slice(0, 2).map((situation, i) => ({ id: `h${i}`, situation, asked })),
            aim,
          ),
        );
      }),
    ),
    [
      ["50559d14fdbc416e", 5041],
      ["af70a960ed5e28ff", 2969],
      ["372c25c4e37bc978", 4960],
      ["ab7c12fe6b851770", 2888],
    ],
  );
  // A fungus request asks one question per lever asked, by host id.
  const three = packFungusRequest([{ id: "h0", situation: SAMPLE_FUNGAL, asked: ["food", "rival", "trail"] }], AIM_TEXTS[0]!);
  assert.deepEqual(Object.keys(three.questions), ["h0_food", "h0_rival", "h0_trail"]);
});

test("each local rule over every situation it can be asked in (a hash of all its answers, and how many of each)", () => {
  const modes = Array.from({ length: SITUATIONS }, (_, c) => localPolicy(decodeSituation(c)));
  const count = (a: string[]) => Object.fromEntries([...new Set(a)].sort().map((k) => [k, a.filter((x) => x === k).length]));
  assert.equal(sha(modes), "62b63730107db786");
  assert.deepEqual(count(modes), { explore: 396, fight: 756, follow: 576, return: 2160 });
});

test("a doctrine or aim is trimmed in its context, so stray spaces are not a new cache", () => {
  assert.equal(policyContext(`  ${DOCTRINE_TEXTS[1]}\n`), policyContext(DOCTRINE_TEXTS[1]!));
  assert.equal(fungusContext(`  ${AIM_TEXTS[1]}\n`), fungusContext(AIM_TEXTS[1]!));
});

test("each lane's local answer, and how each lane reads a reply, a bad one and none", () => {
  assert.deepEqual(
    MODE_SITUATIONS.map((s) => localPolicy(s)),
    ["explore", "return", "follow"],
  );
  assert.deepEqual(
    [
      readMode({ s0_mode: { type: "choice", choice: "follow" } }, "s0"),
      readMode({ s0_mode: { type: "choice", choice: "dance" } }, "s0"),
      readMode({}, "s0"),
    ],
    ["follow", null, null],
  );
  const asked = ["food", "rival", "trail"];
  assert.deepEqual(
    [
      readLevels(
        { h0_food: { type: "score", score: 3 }, h0_rival: { type: "score", score: 1 }, h0_trail: { type: "score", score: 0.6 } },
        "h0",
        asked,
      ),
      readLevels({ h0_food: { type: "score", score: 3 } }, "h0", asked),
      // scores outside a lever's scale are clamped to it
      readLevels(
        { h0_food: { type: "score", score: 9 }, h0_rival: { type: "score", score: -4 }, h0_trail: { type: "score", score: 1 } },
        "h0",
        asked,
      ),
    ],
    ["3,1,1", null, "4,0,1"],
  );
  const key = "calm|none|outside|forager|nothing|unseen|food,rival,trail";
  assert.deepEqual([validLevels(key, "2,1,1"), validLevels(key, "9,1,1")], [true, false]);
});

// Changed on purpose by the lane registry's slice 3 (ja-fnd.5.2.4): the fungus sample used to ask every lever on the menu (15 under the default
// menu), but a worker host's key asks the 14 that are not a queen's (and a queen's, her two), so the Learn panel's sample request and its cost per
// question (758 → 706 tokens) now match what the page sends. The ants' lanes, and the fungus's request under a custom menu, are byte for byte as before.
test("what the Learn panel and the cost estimates send: the sample requests and the tokens a question costs", () => {
  const samples = [
    requestFor({ lane: "mode", situation: SAMPLE_SITUATION }, DOCTRINE_TEXTS[0]!, 3),
    requestFor({ lane: "fungus", situation: SAMPLE_FUNGAL }, AIM_TEXTS[0]!, 3),
  ];
  assert.deepEqual(samples.map(idOf), [
    ["d08b5e29ecdab99a", 3741],
    ["0901c198dcb08ba0", 6466],
  ]);
  // The sample asks what a host in that situation is asked: a worker's levers, not a queen's.
  const workerLevers = askedLevers(new Set(DEFAULT_MENU), false);
  assert.equal(workerLevers.length, 14);
  assert.deepEqual(
    Object.keys(samples[1]!.questions).filter((q) => q.startsWith("h0_")),
    workerLevers.map((id) => `h0_${id}`),
  );
  // The Learn panel shows a followed host's own situation, a queen's too: she is asked her two levers (what the page sends her), not the menu's.
  const queenRequest = requestFor({ lane: "fungus", situation: { ...SAMPLE_FUNGAL, task: "queen" } }, AIM_TEXTS[0]!, 1);
  assert.deepEqual(Object.keys(queenRequest.questions), ["h0_show", "h0_queenSignal"]);
  // The fungus sample takes a menu (the Learn panel shows the levers the player has on): the request asks only those.
  assert.deepEqual(idOf(requestFor({ lane: "fungus", situation: SAMPLE_FUNGAL, menu: new Set(MENUS[1]) }, AIM_TEXTS[0]!, 2)), [
    "b59d6066325e496e",
    2969,
  ]);
  assert.deepEqual(idOf(requestFor({ lane: "fungus", situation: SAMPLE_FUNGAL }, AIM_TEXTS[0]!, 2)), ["2db96f666465cfc3", 5041]);
  assert.deepEqual([tokensPerQuestion("mode", DOCTRINE_TEXTS[0]!), tokensPerQuestion("fungus", AIM_TEXTS[0]!)], [240, 707]);
});

test("each lane's flags: id prefix, context prefix, hits, reconsidering, situations a request carries", () => {
  assert.deepEqual(LANE_KINDS, {
    mode: { idPrefix: "s", contextPrefix: "colony-", countsHits: true, reconsiders: true, perRequest: 100 },
    fungus: { idPrefix: "h", contextPrefix: "fungus-", countsHits: false, reconsiders: false, perRequest: 50 },
    growth: { idPrefix: "g", contextPrefix: "growth-", countsHits: false, reconsiders: false, perRequest: 48 },
    get: { idPrefix: "aget", contextPrefix: "get-", countsHits: false, reconsiders: false, perRequest: 100 },
    carry: { idPrefix: "acarry", contextPrefix: "carry-", countsHits: false, reconsiders: false, perRequest: 100 },
    drop: { idPrefix: "adrop", contextPrefix: "drop-", countsHits: false, reconsiders: false, perRequest: 100 },
    trail: { idPrefix: "atrail", contextPrefix: "trail-", countsHits: false, reconsiders: false, perRequest: 100 },
    contact: { idPrefix: "acontact", contextPrefix: "contact-", countsHits: false, reconsiders: false, perRequest: 100 },
    leave: { idPrefix: "aleave", contextPrefix: "leave-", countsHits: false, reconsiders: false, perRequest: 100 },
    steer: { idPrefix: "w", contextPrefix: "steer-", countsHits: false, reconsiders: true, perRequest: 100 },
  });
});

test("the client's state carries these fields, in this order (the page shows and counts by them)", () => {
  assert.deepEqual(Object.keys(new ColonyJev().state), [
    "phase",
    "run",
    "lanes", // per lane of the registry: { asked, cached } (ja-fnd.5.7)
    "requests",
    "hits",
    "misses",
    "doctrineCached",
    "failures",
    "lastError",
  ]);
  assert.deepEqual(new ColonyJev().state.lanes, {
    mode: { asked: 0, cached: 0 },
    fungus: { asked: 0, cached: 0 },
    growth: { asked: 0, cached: 0 },
    steer: { asked: 0, cached: 0 },
    get: { asked: 0, cached: 0 },
    carry: { asked: 0, cached: 0 },
    drop: { asked: 0, cached: 0 },
    trail: { asked: 0, cached: 0 },
    contact: { asked: 0, cached: 0 },
    leave: { asked: 0, cached: 0 },
  });
});

test("every context the shipped precache holds belongs to the lane its bundle says", () => {
  const dir = fileURLToPath(new URL("../../../public/precache/", import.meta.url));
  const index = JSON.parse(readFileSync(`${dir}index.json`, "utf8")) as PrecacheIndex;
  assert.ok(index.bundles.length >= 9);
  for (const b of index.bundles) assert.equal(laneOfContext(b.context), b.lane, `${b.file}'s context ${b.context}`);
});
