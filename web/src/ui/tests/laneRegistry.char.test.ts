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
  localStance,
  packFungusRequest,
  packModeRequest,
  packStanceRequest,
  policyContext,
  readLevels,
  readMode,
  readStance,
  SITUATIONS,
  situationKey,
  STANCE_SCHEMA,
  stanceContext,
  stanceKey,
  validLevels,
  type FungalSituation,
  type Situation,
  type StanceSituation,
} from "../../colony/index.ts";
import { ColonyJev } from "../colonyJev.ts";
import { requestFor, SAMPLE_FUNGAL, SAMPLE_SITUATION, SAMPLE_STANCE, tokensPerQuestion } from "../prompt.ts";
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
const STANCE_SITUATIONS: StanceSituation[] = [
  SAMPLE_STANCE,
  { stance: "defend", ants: "few", losses: "heavy", enemyNearNest: true, intake: "none", larder: "full" },
  { stance: "raid", ants: "many", losses: "some", enemyNearNest: false, intake: "plenty", larder: "low" },
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
  assert.deepEqual(STANCE_SITUATIONS.map(stanceKey), [
    "forage|some|none|clear|intake:some|low",
    "defend|few|heavy|enemy|intake:none|full",
    "raid|many|some|clear|intake:plenty|low",
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
    DOCTRINE_TEXTS.map((d) => stanceContext(d)),
    ["stance-v4-657ca221", "stance-v4-a2c72d8e"],
  );
  assert.deepEqual(
    AIM_TEXTS.flatMap((a) => (["top", "side"] as const).map((v) => fungusContext(a, v))),
    ["fungus-v8-ec1a7461", "fungus-v8-side-ec1a7461", "fungus-v8-0859ac1c", "fungus-v8-side-0859ac1c"],
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
    DOCTRINE_TEXTS.map((d) =>
      idOf(
        packStanceRequest(
          STANCE_SITUATIONS.map((situation, i) => ({ id: `c${i}`, situation })),
          d,
        ),
      ),
    ),
    [
      ["6b1b44a5bcf04a3b", 2150],
      ["f9594868990ccb04", 1985],
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
      ["c9226995458e5dab", 4941],
      ["7e3b23f9b6d9b6cf", 2869],
      ["66d251acb1dbcedf", 4860],
      ["4bc4b45e5fa72a24", 2788],
    ],
  );
  // A fungus request asks one question per lever asked, by host id.
  const three = packFungusRequest([{ id: "h0", situation: SAMPLE_FUNGAL, asked: ["food", "rival", "trail"] }], AIM_TEXTS[0]!);
  assert.deepEqual(Object.keys(three.questions), ["h0_food", "h0_rival", "h0_trail"]);
});

test("each local rule over every situation it can be asked in (a hash of all its answers, and how many of each)", () => {
  const modes = Array.from({ length: SITUATIONS }, (_, c) => localPolicy(decodeSituation(c)));
  const stances = Array.from({ length: STANCE_SCHEMA.size }, (_, c) => localStance(STANCE_SCHEMA.decode(c)));
  const count = (a: string[]) => Object.fromEntries([...new Set(a)].sort().map((k) => [k, a.filter((x) => x === k).length]));
  assert.equal(sha(modes), "62b63730107db786");
  assert.deepEqual(count(modes), { explore: 396, fight: 756, follow: 576, return: 2160 });
  assert.equal(sha(stances), "7a7f8053a84da201");
  assert.deepEqual(count(stances), { defend: 108, forage: 144, raid: 72 });
});

test("a doctrine or aim is trimmed in its context, so stray spaces are not a new cache", () => {
  assert.equal(policyContext(`  ${DOCTRINE_TEXTS[1]}\n`), policyContext(DOCTRINE_TEXTS[1]!));
  assert.equal(stanceContext(`  ${DOCTRINE_TEXTS[1]}\n`), stanceContext(DOCTRINE_TEXTS[1]!));
  assert.equal(fungusContext(`  ${AIM_TEXTS[1]}\n`, "top"), fungusContext(AIM_TEXTS[1]!, "top"));
});

test("each lane's local answer, and how each lane reads a reply, a bad one and none", () => {
  assert.deepEqual(MODE_SITUATIONS.map(localPolicy), ["explore", "return", "follow"]);
  assert.deepEqual(STANCE_SITUATIONS.map(localStance), ["forage", "defend", "forage"]);
  assert.deepEqual(
    [
      readMode({ s0_mode: { type: "choice", choice: "follow" } }, "s0"),
      readMode({ s0_mode: { type: "choice", choice: "dance" } }, "s0"),
      readMode({}, "s0"),
    ],
    ["follow", null, null],
  );
  assert.deepEqual(
    [
      readStance({ c0_stance: { type: "choice", choice: "raid" } }, "c0"),
      readStance({ c0_stance: { type: "choice", choice: "flee" } }, "c0"),
      readStance({}, "c0"),
    ],
    ["raid", null, null],
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
    requestFor({ lane: "stance", situation: SAMPLE_STANCE }, DOCTRINE_TEXTS[0]!, 3),
    requestFor({ lane: "fungus", situation: SAMPLE_FUNGAL }, AIM_TEXTS[0]!, 3),
  ];
  assert.deepEqual(samples.map(idOf), [
    ["d08b5e29ecdab99a", 3741],
    ["5412af7a49137dcb", 2150],
    ["6325a426a255b960", 6366],
  ]);
  // The sample asks what a host in that situation is asked: a worker's levers, not a queen's.
  const workerLevers = askedLevers(new Set(DEFAULT_MENU), false);
  assert.equal(workerLevers.length, 14);
  assert.deepEqual(
    Object.keys(samples[2]!.questions).filter((q) => q.startsWith("h0_")),
    workerLevers.map((id) => `h0_${id}`),
  );
  // The Learn panel shows a followed host's own situation, a queen's too: she is asked her two levers (what the page sends her), not the menu's.
  const queenRequest = requestFor({ lane: "fungus", situation: { ...SAMPLE_FUNGAL, task: "queen" } }, AIM_TEXTS[0]!, 1);
  assert.deepEqual(Object.keys(queenRequest.questions), ["h0_show", "h0_queenSignal"]);
  // The fungus sample takes a menu (the Learn panel shows the levers the player has on): the request asks only those.
  assert.deepEqual(idOf(requestFor({ lane: "fungus", situation: SAMPLE_FUNGAL, menu: new Set(MENUS[1]) }, AIM_TEXTS[0]!, 2)), [
    "0a8d8be9e2350816",
    2869,
  ]);
  assert.deepEqual(idOf(requestFor({ lane: "fungus", situation: SAMPLE_FUNGAL }, AIM_TEXTS[0]!, 2)), ["5fd1111c0ab03d17", 4941]);
  assert.deepEqual(
    [
      tokensPerQuestion("mode", DOCTRINE_TEXTS[0]!),
      tokensPerQuestion("stance", DOCTRINE_TEXTS[0]!),
      tokensPerQuestion("fungus", AIM_TEXTS[0]!),
    ],
    [240, 197, 706],
  );
});

test("each lane's flags: id prefix, counter, context prefix, hits, reconsidering, situations a request carries", () => {
  assert.deepEqual(LANE_KINDS, {
    mode: { idPrefix: "s", counter: "asked", contextPrefix: "colony-", countsHits: true, reconsiders: true, perRequest: 100 },
    stance: { idPrefix: "c", counter: "stancesAsked", contextPrefix: "stance-", countsHits: false, reconsiders: true, perRequest: 100 },
    fungus: { idPrefix: "h", counter: "fungusAsked", contextPrefix: "fungus-", countsHits: false, reconsiders: false, perRequest: 50 },
  });
});

test("the client's state carries these fields, in this order (the page shows and counts by them)", () => {
  assert.deepEqual(Object.keys(new ColonyJev().state), [
    "phase",
    "run",
    "asked",
    "stancesAsked",
    "requests",
    "hits",
    "misses",
    "cached",
    "stancesCached",
    "doctrineCached",
    "fungusAsked",
    "fungusCached",
    "failures",
    "lastError",
  ]);
});

test("every context the shipped precache holds belongs to the lane its bundle says", () => {
  const dir = fileURLToPath(new URL("../../../public/precache/", import.meta.url));
  const index = JSON.parse(readFileSync(`${dir}index.json`, "utf8")) as PrecacheIndex;
  assert.ok(index.bundles.length >= 9);
  for (const b of index.bundles) assert.equal(laneOfContext(b.context), b.lane, `${b.file}'s context ${b.context}`);
});
