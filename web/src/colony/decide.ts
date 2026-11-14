// Decide (docs/refactor.md S3.4): the third stage of an ant's step in tick. Where homing heads (the goal: its chamber, the hole, a brood or food chamber), the mode it takes (a load sends it home; else the mode policy is asked when its situation changed, or it waits held at the gate), and strangers in reach, where the contact response decides over the policy. Moved out of Colony.tick verbatim but for `this` becoming `col`; what it decided goes to the next stages through the step record.
import type { Colony } from "./colony.ts";
import { chamberGoal, putDown } from "./dig.ts";
import { homeField, homeGoal } from "./homing.ts";
import type { Item } from "./responses.ts";
import { touch } from "./sense.ts";
import { MODE_STRIDE, packSituation } from "./situation.ts";
import type { AntStep } from "./step.ts";
import {
  encodeSteering,
  EXPLORE,
  FIGHT,
  FOLLOW,
  type Mode,
  MODES,
  RETURN,
  type SpeciesSituation,
  type Stance,
  STANCES,
  STEER_NEUTRAL,
  trailLevel,
} from "./vocab.ts";

export function decide(col: Colony, i: number, s: AntStep): void {
  const p = s.p;
  const dt = s.dt;
  const gate = s.gate;
  const fl = s.fl;
  const ff = s.ff;
  const fr = s.fr;
  const hl = s.hl;
  const hf = s.hf;
  const hr = s.hr;
  const al = s.al;
  const af = s.af;
  const ar = s.ar;
  const toEnemy = s.toEnemy;
  const held = s.held;
  const carrying = s.carrying;
  const pellet = s.pellet;
  const nursing = s.nursing;
  const reporting = s.reporting;
  // Where homing heads: the chamber; in the side view, the entrance for a pellet carrier (soil goes up and
  // out) and for any ant on the ground line (path integration home is to the hole, not through the ground).
  let goal = homeGoal(col, i, pellet);
  // A nurse heads for its brood chamber; out on the ground line (lost), for the hole first, like any homing ant. Only
  // where there is a hole into the layer: one world's plane has no chambers (its carriers home to the hole: crossDown).
  if (nursing && goal === col.nest && col.entrance) goal = chamberGoal(col, col.broodTo[i]);
  // Food flow (slice 5): food goes to a chamber, not to "the nest": underground, a carrier heads for the one it takes
  // its food to (a forager: reception, or the royal chamber until there is one).
  else if (carrying && col.queen && goal === col.nest && col.entrance) goal = chamberGoal(col, col.foodTo(i));
  let nest = goal;
  const x0 = col.x[i];
  const y0 = col.y[i];
  let mode = col.mode[i];
  const prevMode = mode;
  const item: Item = carrying ? "food" : pellet ? (col.corpse[i] ? "corpse" : "soil") : nursing ? "brood" : "none";
  const resp = col.responses;
  let situation0 = -1; // the situation's code with mode 0 (encode), when the mode policy was consulted this step
  let modeStride = MODE_STRIDE; // the mode field's step in that code: the species' own schema's, when it has one
  let waiting = false;
  let rolled = false; // asked `leave` this step already (behaviour MR 5): one roll a step, at the rate it answers
  if (carrying || pellet || nursing || reporting) {
    // A carrier takes its load where it belongs (the carry response, in stanceStep, said so): home, not a mode choice; the next
    // question comes once the load is down.
    mode = RETURN;
    col.mode[i] = mode;
    col.asked[i] = -1;
    col.question[i] = -1;
    if (!reporting) col.loaded[i] = 1;
  } else {
    // Its load just put down, wherever that was (spoil on the mound, a corpse on the midden, food in the larder): the
    // carrying trip is over, so it is not returning any more (ja-qnx; `arrive`). It heads back out along its trail: a
    // follower, which a fresh ant is asked as the local rule asked a returner (both follow a trail, explore without
    // one). As an explorer, the middle-aged diggers no longer followed the carriers' scent down to reception, where
    // they port its food on: food piled up there (A8, seeds 5-6: 30-37 % of the nest's food carried on, main 87-100 %).
    if (col.loaded[i]) {
      col.loaded[i] = 0;
      if (p.arrive !== "return" && mode === RETURN) {
        mode = p.follows ? FOLLOW : EXPLORE;
        col.mode[i] = mode;
      }
    }
    const tired = col.isTired(i);
    const food = trailLevel(Math.max(fl, ff, fr));
    const home = homeField(col, i, hl, hf, hr);
    const alarm = trailLevel(Math.max(al, af, ar));
    const enemy = toEnemy === null ? 0 : 1;
    const stance = STANCES.indexOf(col.stanceOf(i));
    // A species' own situation (ja-fnd.5.10): the generic fields and its own, encoded by its schema; the generic ant's stays packSituation.
    const own = col.own;
    let asks: SpeciesSituation | null = null;
    if (own) {
      asks = {
        mode: MODES[mode] as Mode,
        tired,
        foodTrail: food,
        homeTrail: home,
        alarm,
        enemy: enemy ? "near" : "none",
        stance: STANCES[stance] as Stance,
      };
      if (own.sense) {
        const sensed = own.sense(col, i);
        for (const name in sensed) {
          const ok = own.allowed.get(name);
          if (ok && !ok.includes(sensed[name]))
            throw new Error(`sense: "${name}" is ${String(sensed[name])}, not one of its field's values`);
        }
        asks = { ...asks, ...sensed };
      }
      // Its policy is handed only the fields its schema asks (owner, review of #122 D1): an ant chooses only from what its species senses.
      asks = own.schema.state(asks);
      modeStride = own.modeStride;
    }
    const before = own ? own.schema.encode(asks!) : packSituation(mode, tired, food, home, alarm, enemy, stance);
    situation0 = before - mode * modeStride;
    // Waiting at home (behaviour MR 5): where the colony gates leaving, a forager home in "return" is asked `leave`
    // (in tick, after this stage), not its mode: the mode policy sends any ant out that smells no food trail, gate or no gate.
    // One world (ja-web): nobody waits on the plane (every returner goes down its hole); an ant held at the gate at the
    // top of its shaft waits, and rolls `leave` once a step, asked as a returning forager (as a raider if recruited).
    // A yes is its pass: it climbs out, and its mode policy is asked afresh next step.
    waiting = held || (gate && mode === RETURN && !enemy && col.atNestTop(i) && !col.inbound(i, mode));
    if (held) {
      rolled = true;
      if (col.leaves(i, dt, false)) {
        col.leaveOk[i] = 1;
        col.asked[i] = -1;
      }
    }
    // A drawn mode is drawn afresh after `reroll` seconds in the same situation (ja-nan3): its question is
    // forgotten, so the policy is asked again below. Only an ant whose last answer was drawn has a clock (else −1).
    if (col.redraw[i] > 0 && (col.redraw[i] -= dt) <= 0) {
      col.redraw[i] = -1;
      col.asked[i] = -1;
    }
    if (before !== col.asked[i] && !waiting) {
      col.policyDrew = false;
      const sit = asks ?? {
        mode: MODES[mode] as Mode,
        tired,
        foodTrail: food,
        homeTrail: home,
        alarm,
        enemy: enemy ? "near" : "none",
        stance: col.stanceOf(i),
      };
      mode = MODES.indexOf(col.policy(sit, col.policyDraw));
      col.redraw[i] = col.policyDrew && p.reroll > 0 ? p.reroll : -1;
      if (mode < 0) mode = tired ? RETURN : EXPLORE; // a policy answering nonsense falls back to the plain rule
      if (mode === FOLLOW && !p.follows) mode = EXPLORE; // a species with no follow mode can't follow (ja-fnd.5.9)
      // Zoned by age: an ant that may not go out is no raider. Sent raiding, a young one climbed to its hole, was put
      // back down the shaft, and climbed again (review of #26: 70–93 of ~110 young raiders parked at the hole). With
      // no enemy near, it explores (with one near, it fights where it is).
      if (mode === FIGHT && !enemy && col.stanceOf(i) === "raid" && col.queen && !col.mayGoOut(i)) mode = EXPLORE;
      if (mode === RETURN && col.mode[i] !== RETURN) col.homeAfresh(i);
      col.mode[i] = mode;
      // Its steering weights (staging, ja-ykmu; docs/steering.md): asked for the situation with the mode it now has, when that
      // sends it out exploring or following; any other mode steers by its own routine, so its code goes back to none.
      // Its weights with no find remembered, or, remembering one, away from it and near it: steer.ts takes whichever its memory says.
      if (p.steerLane > 0) {
        const out = mode === EXPLORE || mode === FOLLOW;
        const now = { ...sit, mode: MODES[mode] as Mode };
        const remembers = !Number.isNaN(col.foodX[i]);
        col.steerCode[i] = out
          ? encodeSteering(col.steerPolicy({ ...now, find: remembers ? "far" : "none" }, col.policyDraw))
          : STEER_NEUTRAL;
        col.steerNear[i] = out && remembers ? encodeSteering(col.steerPolicy({ ...now, find: "near" }, col.policyDraw)) : col.steerCode[i];
      }
      col.asked[i] = own ? situation0 + mode * modeStride : packSituation(mode, tired, food, home, alarm, enemy, stance);
      col.seen[before] = 1;
      // The generic code of the situation it was asked in (its mode before the answer), whatever the species asks: the fungus, the journal and the
      // ant card read the generic situation (review of #122, S1, S3).
      col.question[i] = own ? packSituation(MODES.indexOf(asks!.mode), tired, food, home, alarm, enemy, stance) : before;
      col.decisions++;
    }
  }
  let fleeFrom: number | null = null;
  // Strangers in reach: the contact response (behaviour MR 4) decides, every step they are, over what the mode policy
  // said. Before it, every ant with an enemy near fought. A fleeing ant runs away from the strangers while they are in
  // reach; once they are gone its mode policy is asked afresh (locally: back to its trail, or exploring).
  if (toEnemy !== null) {
    const answer = resp.contact(touch(col, i, true, mode, item));
    if (answer === "fight" && !reporting) {
      if (mode !== FIGHT && !carrying && !pellet && !nursing) mode = FIGHT;
    } else {
      if (answer === "drop and run" && (carrying || pellet || nursing)) putDown(col, i);
      if (mode !== RETURN) col.homeAfresh(i);
      mode = RETURN;
      // A carrier flees by taking its load home: turned straight away from the strangers, on the side view's ground
      // line that was often away from its hole (G seed 5, raid stance: 3–5 carriers held over 120 s between the nests).
      if (!carrying && !pellet && !nursing) fleeFrom = toEnemy;
    }
    col.mode[i] = mode;
    // The situation as answered, with the mode the contact response set: else the mode policy, asked again next step,
    // put the ant back on its trail and contact turned it round again, resetting its homing every other step (review
    // of #38: 6,170 flips in 150 s on G′ seed 1).
    if (situation0 >= 0) col.asked[i] = situation0 + mode * modeStride;
  }
  s.goal = goal;
  s.nest = nest;
  s.x0 = x0;
  s.y0 = y0;
  s.mode = mode;
  s.prevMode = prevMode;
  s.item = item;
  s.resp = resp;
  s.waiting = waiting;
  s.rolled = rolled;
  s.fleeFrom = fleeFrom;
}
