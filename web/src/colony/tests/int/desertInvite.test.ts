import { test } from "node:test";
import assert from "node:assert/strict";
import { DESERT_ANT } from "../../desertAnt.ts";
import { touch } from "../../sense.ts";
import { RETURN } from "../../vocab.ts";
import { desertChamber, invitationChamber, runAssay } from "../../experiment.ts";
import { Game, gameRng } from "../../game.ts";
import { leaveRate, paceAfter, paceReturns } from "../../invite.ts";
import { generateOneWorld } from "../../oneWorld.ts";
import { DEFAULT_COLONY, type ColonyParams } from "../../params.ts";
import { mulberry32 } from "../../world.ts";
import { run } from "../builders.ts";

// ja-rf5.6 (docs/desert-ant.md §1, PRD §60.6; Razin, Eckmann & Feinerman 2013, full text, C. niger): the desert ant's invitation. A finder
// coming down the shaft raises the pace of the nestmates waiting at the top; a crowd damps it back; an ant leaves by its own pace.

const P: ColonyParams = { ...DEFAULT_COLONY, ...DESERT_ANT.params } as ColonyParams;
const leave = DESERT_ANT.responses.leave;

test("the rule: a finder's pass pulls a waiting ant's pace toward its own; it relaxes to rest, the faster in a crowd; it leaves by its pace", () => {
  const once = paceAfter(P, P.paceRest, 1, 0, 1 / 30);
  assert.ok(once > P.paceFew, `one pass lifts it past paceFew (${once.toFixed(2)})`);
  const alone = paceAfter(P, once, 0, 0, 5);
  const crowded = paceAfter(P, once, 0, 12, 5);
  assert.ok(crowded < alone, `a crowd of 12 damps it faster (${crowded.toFixed(2)} against ${alone.toFixed(2)} after 5 s)`);
  assert.equal(paceReturns(P, P.paceRest), "none");
  assert.equal(paceReturns(P, P.paceFew), "few");
  assert.equal(paceReturns(P, P.paceMany), "many");
  assert.ok(leaveRate(P, "soon") > 10 * leaveRate(P, "wait"), "a raised pace leaves far sooner than a scout");
  assert.equal(paceAfter({ ...P, paceGain: 0 }, P.paceRest, 3, 0, 1), P.paceRest, "with no pull a pass does nothing");
});

test("D2c, Razin's chamber staged: at least sevenfold leaving after a finder in groups of 4 and 8, and fewer exits in a crowd", () => {
  for (const seed of [1, 2]) {
    const m = runAssay(desertChamber, seed).metrics;
    assert.equal(m.pass, 1, `seed ${seed}: ratio4 ${m.ratio4}, ratio8 ${m.ratio8}, after4 ${m.after4}, after13 ${m.after13}`);
  }
});

test("the ablation: with no pull, a finder changes nothing (the cue does the work)", () => {
  const r = invitationChamber({ ...P, paceGain: 0 }, leave, 4, 400, mulberry32(3));
  const ratio = r.after / r.expAfter / (r.before / r.expBefore);
  assert.ok(ratio > 0.5 && ratio < 2, `after against before with no pull: ${ratio.toFixed(2)}`);
});

test("in a game, a finder coming down the shaft raises the pace of ants waiting at the top, and they leave by it", () => {
  const g = new Game(generateOneWorld(1), { antCount: 60, rival: false, species: DESERT_ANT }, gameRng(1));
  let raised = 0;
  for (let k = 0; k < 60 * 30; k++) {
    g.tick(1 / 30);
    const c = g.player;
    for (let i = 0; i < c.n; i++) if (c.alive[i] && c.pace[i] >= P.paceFew) raised++;
  }
  assert.ok(raised > 0, `ant-ticks at a raised pace in a minute: ${raised}`);
  const generic = new Game(generateOneWorld(1), { antCount: 60, rival: false }, gameRng(1));
  run(generic, 30);
  assert.ok(
    generic.player.pace.every((v) => v === 0),
    "the generic ant keeps no pace",
  );
});

test("in a game, what an ant's leave response reads as returns is its own pace", () => {
  const g = new Game(generateOneWorld(1), { antCount: 60, rival: false, species: DESERT_ANT }, gameRng(1));
  run(g, 1);
  const c = g.player;
  const i = c.alive.indexOf(1);
  for (const [pace, returns] of [
    [P.paceRest, "none"],
    [P.paceFew, "few"],
    [P.paceMany, "many"],
  ] as const) {
    c.pace[i] = pace;
    assert.equal(touch(c, i, false, RETURN, "none").returns, returns, `pace ${pace}`);
  }
});
