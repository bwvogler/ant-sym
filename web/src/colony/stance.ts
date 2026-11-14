// Stance and raid bookkeeping (docs/refactor.md S3.4): the second stage of an ant's step in tick. Whether it is held at the gate, what it has felt of strangers (foes, threat, defending), its place in a raid (recruited, gone, past the end, a finder home to tell), a load the carry response puts down, and what it carries now. Moved out of Colony.tick verbatim but for `this` becoming `col`; what it decided goes to the next stages through the step record.

import type { Colony } from "./colony.ts";
import { carryOut, holdsAt } from "./crossing.ts";
import { putDown } from "./dig.ts";
import { SOIL_FILL } from "./grid.ts";
import { fromHomePlane } from "./homing.ts";
import { localResponses } from "./responses.ts";
import { raidLevel, raidSmelt, touch } from "./sense.ts";
import type { AntStep } from "./step.ts";
import { FIGHT, PLANE, STRONG } from "./vocab.ts";

export function stanceStep(col: Colony, i: number, s: AntStep): void {
  const p = s.p;
  const rng = s.rng;
  const dt = s.dt;
  const hold = s.hold;
  const rgate = s.rgate;
  const foeLeak = s.foeLeak;
  const sgate = s.sgate;
  const threatLeak = s.threatLeak;
  let heldNow = s.heldNow;
  const toEnemy = s.toEnemy;
  // One world (ja-web): an outgoing forager at the top of its own shaft, its jaws empty and with no pass, is held at the
  // gate there (holdsAt): it waits as a forager home on open ground does, and is asked `leave` (in decide). With a
  // stranger near it isn't waiting: it isn't asked, and it fights or flees in the shaft as anywhere; but the gate still
  // bars the way out (mayCrossUp asks holdsAt, which doesn't look for strangers), so it doesn't climb out without a
  // pass. Intended: a stranger at the top of the shaft is met there, not left behind.
  const held = hold && toEnemy === null && holdsAt(col, i);
  if (held) heldNow++;
  if (rgate) {
    col.foes[i] = col.foes[i] * foeLeak + (toEnemy === null ? 0 : dt);
    // (One world, ja-web: a finder lays its trail on to its hole, and is done telling once it goes down it, crossDown:
    // ended at the disc round the hole, the trail never reached the ants held at the top of the shaft.)
    if (col.reporting[i] === 1 && col.line === null && col.atNestTop(i)) col.reporting[i] = 0;
  }
  // Defence is the ant's own (docs/stance.md): alarm smelt or strangers in reach raise its threat, which fades; past defendAt,
  // on home ground (within homeGround of its hole as its own drifting vector has it: fromHomePlane, ja-k4k.6.2), it
  // defends. Far out, it forages as before. (Where no vector is kept, as on the open maps, the vector is the hole.)
  if (sgate) {
    const felt = toEnemy !== null || col.alarmSmelt !== "none";
    const th = col.threat[i] * threatLeak + (felt ? dt : 0);
    col.threat[i] = th;
    col.defending[i] = th >= p.defendAt && fromHomePlane(col, i) <= p.homeGround ? 1 : 0;
  }
  // Raid stance (behaviour MR 5.2): a raid is a bias, not an order. An ant is recruited by smelling a scout's raid trail, or goes out
  // as a scout at raidScout when it is home with empty jaws; the others forage. A recruited ant's raid ends when it comes home
  // with no trail under it: no trail was laid for it, or the trail has faded.
  if (rgate && (sgate || col.stance === "raid")) {
    const homeNow = col.atNestTop(i);
    if (!homeNow) col.gone[i] = 1;
    if (col.recruited[i] === 0) {
      // Where each ant's stance is its own, the trail recruits at home (docs/stance.md; Polyergus scouts recruit the workers at their
      // own nest): an ant out at its work crosses it and carries on. Recruiting anywhere ran away: G′ seed 1, 773 of 899 raiding.
      // And it recruits by degrees: at raidRecruit a second on a strong trail, less on a faint one (thresholds differ between ants,
      // as Pheidole majors answer only intense recruitment). All at once, one scout's trail called the 150-200 ants idle at home,
      // and every raid was a war (G′ seeds 1-4: 880 lost against no raids' 170).
      if (
        raidSmelt(col, i) !== "none" &&
        (!sgate ||
          (col.raidable &&
            homeNow &&
            !col.carrying[i] &&
            col.rng() < 1 - Math.exp(-p.raidRecruit * Math.min(1, raidLevel(col, i) / STRONG) * dt)))
      ) {
        col.recruited[i] = 1;
        col.gone[i] = 0;
        col.recruits++;
      } else if (
        !sgate &&
        homeNow &&
        !col.carrying[i] &&
        !col.pellet[i] &&
        !col.broodHeld[i] &&
        col.rng() < 1 - Math.exp(-p.raidScout * dt)
      ) {
        col.recruited[i] = 1;
        col.gone[i] = 0;
        col.mode[i] = FIGHT; // out it goes
        col.raidScouts++;
      }
    } else if (homeNow && col.gone[i] === 1 && raidSmelt(col, i) === "none") {
      col.recruited[i] = 0;
      col.gone[i] = 0;
    }
    if (homeNow || col.recruited[i] === 0) col.pastEnd[i] = 0;
  } else if (col.recruited[i] === 1 && col.line === null) {
    // (In one world a raider keeps its stance underground: its raid ends at home on the plane.)
    col.recruited[i] = 0;
    col.pastEnd[i] = 0;
  }
  // One world (ja-web): an ant held at the gate smells the plane's raid trail where it ends, at its own hole (raidSmelt:
  // a finder recruits at its own entrance, Topoff et al. 1987), and is recruited by it by degrees, as an idle ant at
  // home on open ground is.
  if (
    held &&
    col.recruited[i] === 0 &&
    p.raidGate > 0 &&
    p.stanceGate > 0 &&
    col.raidable &&
    raidSmelt(col, i) !== "none" &&
    rng() < 1 - Math.exp(-p.raidRecruit * Math.min(1, raidLevel(col, i) / STRONG) * dt)
  ) {
    col.recruited[i] = 1;
    col.gone[i] = 0;
    col.recruits++;
  }
  // The carry response (ja-1pm): a load is taken where it belongs, or put down here; put down, the ant is not carrying
  // this step (its trip is over: see `arrive`).
  // (The local carry response always takes, so it isn't asked: building a Touch for every carrier every step cost
  // the side view ~11 % a tick for nothing, review of #35.)
  if (
    col.responses.carry !== localResponses.carry &&
    (col.carrying[i] || col.pellet[i] || col.broodHeld[i]) &&
    col.responses.carry(touch(col, i, toEnemy !== null)) === "put down"
  )
    putDown(col, i);

  // What it carries now, for decide's mode choice (asked only when the situation changed since the ant was last asked).
  // A carrying ant goes home: a mechanic, never asked (and asked afresh once it puts the food down).
  // So does one carrying a soil pellet it dug, to drop on the mound.
  const carrying = col.carrying[i] === 1;
  const pellet = col.pellet[i] === 1;
  const nursing = col.broodHeld[i] === 1;
  // One world's plane (U3c): carrying spoil or a corpse out from its hole, by its own vector (carryOut). Spoil or a
  // corpse on the plane is always on its way out (one put there some other way, a test's, sets out now); only a loose
  // pellet taken home to backfill is not.
  if (pellet && col.line !== null && col.cur === PLANE && col.soil[i] !== SOIL_FILL && Number.isNaN(col.spoilTo[i])) carryOut(col, i);
  const outward = pellet && col.line !== null && col.cur === PLANE && !Number.isNaN(col.spoilTo[i]);
  if (!pellet) col.staleWalk[i] = 0; // a stale walk is part of one trip home with a pellet
  // A finder (behaviour MR 5.2): a raider outside, its jaws empty, no raid trail under it, that has been in contact with
  // strangers for findAt seconds goes home to tell, laying the raid trail on the way. (A raider on the trail meeting
  // strangers fights them: the trail is where the scout was before.)
  if (
    rgate &&
    toEnemy !== null &&
    col.reporting[i] === 0 &&
    !carrying &&
    !pellet &&
    !nursing &&
    col.stanceOf(i) === "raid" &&
    col.foes[i] >= p.findAt &&
    !col.atNestTop(i) &&
    raidSmelt(col, i) === "none"
  ) {
    col.reporting[i] = 1;
    col.since[i] = 0;
    col.homeAfresh(i);
    col.finds++;
  }
  const reporting = col.reporting[i] === 1;
  s.heldNow = heldNow;
  s.held = held;
  s.carrying = carrying;
  s.pellet = pellet;
  s.nursing = nursing;
  s.outward = outward;
  s.reporting = reporting;
}
