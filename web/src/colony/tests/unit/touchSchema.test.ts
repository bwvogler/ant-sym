import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { RESPONSE_HOOKS, RESPONSE_LEGEND, responseKey } from "../../colonyBrain.ts";
import { ITEMS, QUALITY, WHERE, touchKey, touchSchemaOf, type Touch } from "../../responses.ts";
import { MODES, STANCES } from "../../vocab.ts";

// The response lanes' cache keys and legend (ja-fnd.5.6): Touch on a schema must leave every key and the legend byte for
// byte as they were written by hand, since a cached answer is found by its key and asked under its legend's hash.

// The keys as they were written by hand before the schema (responses.ts touchKey, colonyBrain.ts responseKey).
const touchKeyByHand = (t: Touch) =>
  `${t.mode}|${t.carrying}|${t.porter ? "porter" : "-"}|${t.digging ? "digging" : "-"}|${t.place}|${t.offered}|${t.enemy ? "enemy" : "clear"}|${t.stance}${t.quality === "fair" ? "" : `|${t.quality}`}`;
const responseKeyByHand = (hook: string, t: Touch) =>
  hook === "carry"
    ? `deliveryAttempt:${t.deliveryAttempt}|${touchKeyByHand(t)}`
    : hook === "contact"
      ? `${touchKeyByHand(t)}|alarm:${t.alarm}|odds:${t.odds}`
      : hook === "leave"
        ? `${touchKeyByHand(t)}|${t.mode === "fight" ? `raid:${t.raid}` : `returns:${t.returns}|crowd:${t.crowd}`}`
        : touchKeyByHand(t);

const LEVELS = ["none", "faint", "strong"] as const;
const ODDS = ["none", "outnumbered", "even", "outnumbering"] as const;
const RETURNS = ["none", "few", "many"] as const;
const CROWD = ["few", "many"] as const;

/** Every combination of the fields a key reads (the rest cycle through their values alongside, so each value is seen). */
function* touches(): Generator<Touch> {
  let k = 0;
  for (const mode of MODES)
    for (const carrying of ITEMS)
      for (const porter of [false, true])
        for (const digging of [false, true])
          for (const place of WHERE)
            for (const offered of ITEMS)
              for (const enemy of [false, true])
                for (const stance of STANCES)
                  for (const quality of QUALITY) {
                    k++;
                    yield {
                      mode,
                      carrying,
                      porter,
                      digging,
                      place,
                      offered,
                      enemy,
                      stance,
                      quality,
                      alarm: LEVELS[k % 3]!,
                      odds: ODDS[k % 4]!,
                      returns: RETURNS[(k >> 2) % 3]!,
                      raid: LEVELS[(k >> 3) % 3]!,
                      crowd: CROWD[(k >> 1) % 2]!,
                      deliveryAttempt: "none",
                    };
                  }
}

test("touchKey and every hook's responseKey are the hand-written keys, for every combination of the key's fields", () => {
  let n = 0;
  for (const t of touches()) {
    n++;
    assert.equal(touchKey(t), touchKeyByHand(t));
    for (const hook of RESPONSE_HOOKS) assert.equal(responseKey(hook, t), responseKeyByHand(hook, t));
  }
  assert.equal(n, 4 * 5 * 2 * 2 * 4 * 5 * 2 * 3 * 3);
});

test("contact's and leave's keys read every value of the fields only they are sent", () => {
  const base = touches().next().value as Touch;
  for (const alarm of LEVELS)
    for (const odds of ODDS) {
      const t = { ...base, alarm, odds };
      assert.equal(responseKey("contact", t), responseKeyByHand("contact", t));
    }
  for (const mode of MODES)
    for (const raid of LEVELS)
      for (const returns of RETURNS)
        for (const crowd of CROWD) {
          const t = { ...base, mode, raid, returns, crowd };
          assert.equal(responseKey("leave", t), responseKeyByHand("leave", t));
        }
});

// As schema.test.ts pins the other legends: a change to a byte is a change to every cached response's context.
test("the response legend is byte for byte the one written whole", () => {
  assert.equal(RESPONSE_LEGEND.length, 4056);
  assert.equal(
    createHash("sha256").update(RESPONSE_LEGEND).digest("hex"),
    "de77b4ccfaa288ddc84743865189de4808c945da9734cc2c4cb1a03c25a57184",
  );
});

test("a lane's key over a field Touch doesn't have does not build (review of #199, N4)", () => {
  assert.throws(() => touchSchemaOf(["mode", "smell" as keyof Touch]), /no field "smell"/);
});
