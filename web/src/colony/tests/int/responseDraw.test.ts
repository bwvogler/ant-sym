import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../../game.ts";
import { responseKey, responseOf, responsesFromAnswers, validResponse } from "../../colonyBrain.ts";
import { localResponses, type Touch } from "../../responses.ts";
import { mulberry32 } from "../../world.ts";
import { pickFor, unitOf, type AntDraw } from "../../weighted.ts";
import { smallOne, ticks } from "../builders.ts";

// The response lanes drawn from Jev's probabilities (ja-m7rr; weighted.ts AntDraw): each ant draws its own answer for a
// hook and situation, keeps it while the situation lasts (the hooks are asked every step), and draws afresh after `reroll`.

const colony = () => new Game(smallOne(1), { antCount: 40, rival: false }, mulberry32(3)).player;

const near: Touch = {
  mode: "explore",
  carrying: "none",
  porter: false,
  digging: false,
  place: "out",
  offered: "none",
  enemy: true,
  stance: "forage",
  quality: "fair",
  alarm: "none",
  odds: "even",
  returns: "none",
  raid: "none",
  crowd: "few",
};

test("pickFor draws once with the ant's draw for its salt; with no draw, or a certain or bare answer, Jev's own", () => {
  const seen: string[] = [];
  const at = (u: number): AntDraw => Object.assign((salt: string) => (seen.push(salt), u), { temperature: 1 });
  assert.equal(pickFor("fight=0.3,flee=0.7", undefined, "s"), "fight");
  assert.equal(pickFor("fight=0.3,flee=0.7", at(0.1), "contact|k"), "fight");
  assert.equal(pickFor("fight=0.3,flee=0.7", at(0.5), "contact|k"), "flee");
  assert.deepEqual(seen, ["contact|k", "contact|k"], "one draw a pick, under its salt");
  assert.equal(pickFor("fight=1", at(0.9), "s"), "fight");
  assert.equal(pickFor("flee", at(0.0), "s"), "flee");
  assert.equal(seen.length, 2, "a certain or bare answer never draws");
});

test("unitOf spreads near strings over [0, 1)", () => {
  const us = Array.from({ length: 4000 }, (_, n) => unitOf(`0.5|${n}|0|0|contact|k`));
  assert.ok(us.every((u) => u >= 0 && u < 1));
  const bins = [0, 0, 0, 0];
  for (const u of us) bins[Math.floor(u * 4)]!++;
  for (const b of bins) assert.ok(b > 900 && b < 1100, `quarters ${bins.join(", ")}`);
});

test("responseOf: get and drop read as booleans; validResponse holds an answer to the hook's options", () => {
  assert.equal(responseOf("get", "k", "true=0.9,false=0.1"), true);
  assert.equal(responseOf("drop", "k", "false=0.5,true=0.5"), false);
  assert.equal(responseOf("contact", "k", "drop and run=0.6,flee=0.4"), "drop and run");
  assert.ok(validResponse("contact", "drop and run=0.6,flee=0.4"));
  assert.ok(validResponse("get", "true=1"));
  assert.ok(!validResponse("get", "yes=1"));
  assert.ok(!validResponse("carry", "take=0.5,return=0.5"), "a mode is no carry answer");
});

test("an ant keeps the answer it drew while its situation holds; ants in one situation differ, by Jev's odds", () => {
  const c = colony();
  assert.equal(c.drawSalt, -1, "nothing drawn yet");
  const r = responsesFromAnswers({ contact: { [responseKey("contact", near)]: "fight=0.3,flee=0.7" } });
  let fights = 0;
  const n = c.gen.length;
  for (let i = 0; i < n; i++) {
    const first = r.contact(near, c.antDraw(i));
    for (let step = 0; step < 30; step++) assert.equal(r.contact(near, c.antDraw(i)), first, `ant ${i} flipped`);
    if (first === "fight") fights++;
  }
  assert.ok(c.drawSalt >= 0 && c.drawSalt < 1, "the salt taken at the first draw");
  assert.ok(fights > 0 && fights < n, `${fights} of ${n} fight`);
  // Over many situations (each its own draw), the share that fights is Jev's.
  let all = 0;
  let total = 0;
  for (let s = 0; s < 100; s++) {
    const t = {
      ...near,
      odds: (["none", "outnumbered", "even", "outnumbering"] as const)[s % 4],
      stance: s % 8 < 4 ? "forage" : "raid",
    } as Touch;
    const k = `${responseKey("contact", t)}#${s}`;
    for (let i = 0; i < n; i++) {
      if (responseOf("contact", k, "fight=0.3,flee=0.7", c.antDraw(i)) === "fight") all++;
      total++;
    }
  }
  assert.ok(Math.abs(all / total - 0.3) < 0.04, `fight ${(all / total).toFixed(3)} of ${total}`);
});

test("the draw sharpens with the colony's temperature, and each hook draws apart from the others", () => {
  const c = colony();
  const k = responseKey("contact", near);
  const share = () => {
    let fights = 0;
    let total = 0;
    for (let s = 0; s < 300; s++)
      for (let i = 0; i < c.gen.length; i++) {
        if (responseOf("contact", `${k}#${s}`, "fight=0.3,flee=0.7", c.antDraw(i)) === "fight") fights++;
        total++;
      }
    return fights / total;
  };
  c.params.sampleTemp = 0.3;
  // p^(1/T), renormalised: 0.3^(10/3) / (0.3^(10/3) + 0.7^(10/3)) ≈ 0.057
  const cold = share();
  assert.ok(cold > 0.035 && cold < 0.08, `fight at T 0.3: ${cold.toFixed(3)}`);
  c.params.sampleTemp = 1;
  assert.ok(Math.abs(share() - 0.3) < 0.03);
  // One ant, one situation: its get and its drop are separate draws (an ant bold in every lane at once would be one draw).
  let agree = 0;
  let total = 0;
  for (let s = 0; s < 100; s++)
    for (let i = 0; i < c.gen.length; i++) {
      const key = `${k}#${s}`;
      if (responseOf("get", key, "true=0.5,false=0.5", c.antDraw(i)) === responseOf("drop", key, "true=0.5,false=0.5", c.antDraw(i)))
        agree++;
      total++;
    }
  assert.ok(Math.abs(agree / total - 0.5) < 0.05, `get and drop agree ${(agree / total).toFixed(3)}`);
});

test("an ant draws afresh after `reroll` seconds, each at its own phase; with reroll 0 it never does", () => {
  const c = colony();
  const k = responseKey("contact", near);
  const answers = (cc: typeof c) => Array.from({ length: cc.gen.length }, (_, i) => cc.antDraw(i)(`contact|${k}`));
  const before = answers(c);
  c.time += 1;
  const soon = answers(c);
  const moved = soon.filter((u, i) => u !== before[i]).length;
  assert.ok(moved > 0 && moved < before.length / 2, `${moved} redrew within a second of ${c.params.reroll} s`);
  c.time += c.params.reroll;
  assert.ok(
    answers(c).every((u, i) => u !== soon[i]),
    "after a whole reroll, every ant has drawn afresh",
  );
  const held = colony();
  held.params.reroll = 0;
  const first = answers(held);
  held.time += 100;
  assert.deepEqual(answers(held), first);
  // A new ant in a slot draws its own.
  held.gen[0]!++;
  assert.notEqual(answers(held)[0], first[0]);
});

test("the local responses never draw: a game on them takes no salt from the rng", () => {
  const g = new Game(smallOne(1), { antCount: 40 }, mulberry32(3));
  ticks(g, 300);
  for (const c of g.colonies) assert.equal(c.drawSalt, -1);
  assert.equal(localResponses.contact(near), "flee");
});
