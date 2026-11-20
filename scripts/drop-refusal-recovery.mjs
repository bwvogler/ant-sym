// Default-size comparisons: node scripts/drop-refusal-recovery.mjs [--isolate | --split | --candidate] [seed ...]
// Use ANT_ASSAY_SECONDS=600 for a ten-minute match.
// Existing guards: node scripts/drop-refusal-recovery.mjs --guard <contact|defendHome|game1> <seed> [attackDistance]
import { CURTAIN, STRAINS, Game, encodeLevels, gameRng, generateOneWorld, localResponses } from "../web/src/colony/index.ts";

import { oneAssay, runAssay } from "../web/src/colony/experiment.ts";

const dt = 1 / 30;
const seconds = Number(process.env.ANT_ASSAY_SECONDS ?? 120);
const garden = STRAINS.findIndex((strain) => strain.id === "garden");
const damp = encodeLevels({ marks: 0 }, ["marks"]);
const directedFight = { intent: true, attackReach: 1, attackDistance: 0.65 };
const refuseTunnelDrop = (t) => t.carrying === "food" && !t.porter && t.place === "tunnel";

function run(seed, directed, contextual, recover) {
  const game = new Game(generateOneWorld(seed), {}, gameRng(seed));
  const colony = game.player;
  colony.params.dropRefusalLimit = recover ? 2 : 0;
  let dropRefusals = 0;
  if (directed) {
    game.params.fight = { ...game.params.fight, ...directedFight };
  }
  if (contextual) {
    colony.params.deliveryLane = 1;
    colony.responses = {
      ...localResponses,
      trail(t, draw) {
        return contextual !== "drop" && t.carrying === "food" && t.place === "tunnel" ? "none" : localResponses.trail(t, draw);
      },
      drop(t, draw) {
        if (contextual !== "trail" && refuseTunnelDrop(t)) {
          dropRefusals++;
          return false;
        }
        return localResponses.drop(t, draw);
      },
    };
  }
  const queen = colony.queen;
  game.fungus.menu = ["marks"];
  game.fungus.bindPolicy("fungus", () => damp);
  game.fungus.paint([colony], queen.x, queen.y, 3, 0, 0.95, garden, CURTAIN);
  const initialHosts = game.fungus.hosts;
  if (initialHosts === 0) throw Error("The initial dose reached no workers");

  const wasCarrying = new Uint8Array(colony.n);
  let pickups = 0;
  let surfacePickups = 0;
  for (let tick = 0; tick < seconds / dt; tick++) {
    game.tick(dt);
    for (let i = 0; i < colony.n; i++) {
      const carrying = colony.alive[i] ? colony.carrying[i] : 0;
      if (carrying && !wasCarrying[i] && !colony.porter[i]) {
        pickups++;
        if (colony.layer[i] !== CURTAIN) surfacePickups++;
      }
      wasCarrying[i] = carrying;
    }
  }
  return {
    initialHosts,
    dropRefusals,
    hosts: game.fungus.hosts,
    player: {
      stored: colony.stored,
      pickups,
      surfacePickups,
      handedOn: colony.handedOn,
      losses: colony.losses,
      alive: colony.population,
      held: colony.carrying.reduce((n, load) => n + load, 0),
      refusedStillHeld: colony.dropRefusalTime.reduce((n, time, i) => n + Number(time > 0 && colony.carrying[i]), 0),
    },
    rival: { stored: game.colonies[1].stored, losses: game.colonies[1].losses, alive: game.colonies[1].population },
  };
}

const args = process.argv.slice(2);
if (args[0] === "--guard") {
  const [, id, seedArg, distanceArg] = args;
  const seed = Number(seedArg);
  if (!id || !Number.isSafeInteger(seed) || seed <= 0) throw Error("--guard requires an assay id and positive integer seed");
  const attackDistance = distanceArg === undefined ? directedFight.attackDistance : Number(distanceArg);
  if (!(attackDistance > 0 && attackDistance <= 1)) throw Error("attackDistance must be in (0, 1]");
  const assay = oneAssay(id);
  const existing = runAssay(assay, seed).metrics;
  const candidate = runAssay(assay, seed, {
    game: { fight: { ...directedFight, attackDistance } },
    colony: { deliveryLane: 1, dropRefusalLimit: 2 },
    responses: { drop: (t, draw) => !refuseTunnelDrop(t) && localResponses.drop(t, draw) },
  }).metrics;
  console.log(JSON.stringify({ id, seed, attackDistance, existing, candidate }));
  process.exit(0);
}
const isolate = args.includes("--isolate");
const split = args.includes("--split");
const candidate = args.includes("--candidate");
const seeds = args.filter((arg) => arg !== "--isolate" && arg !== "--split" && arg !== "--candidate").map(Number);
for (const seed of seeds.length ? seeds : [41, 42, 43, 44]) {
  if (candidate) {
    console.log(JSON.stringify({ seed, existing: run(seed, false, null, false), candidate: run(seed, true, "drop", true) }));
    continue;
  }
  if (split) {
    console.log(
      JSON.stringify({
        seed,
        directed: run(seed, true, null, false),
        trail: run(seed, true, "trail", true),
        drop: run(seed, true, "drop", true),
      }),
    );
    continue;
  }
  const existing = run(seed, false, null, false);
  const recovery = run(seed, true, "both", true);
  const controls = isolate
    ? { directed: run(seed, true, null, false), contextual: run(seed, false, "both", true) }
    : { actions: run(seed, true, "both", false) };
  console.log(JSON.stringify({ seed, existing, ...controls, recovery }));
}
