// Default-size comparisons: node scripts/drop-refusal-recovery.mjs [--isolate | --split | --candidate] [seed ...]
// Use ANT_ASSAY_SECONDS=600 for a ten-minute match.
// Existing guards: node scripts/drop-refusal-recovery.mjs --guard <contact|defendHome|game1> <seed> [attackDistance] [counterattack|alarm-counterattack|attack-counterattack]
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
  const [, id, seedArg, distanceArg, defense] = args;
  const seed = Number(seedArg);
  if (!id || !Number.isSafeInteger(seed) || seed <= 0) throw Error("--guard requires an assay id and positive integer seed");
  const attackDistance = distanceArg === undefined ? directedFight.attackDistance : Number(distanceArg);
  if (!(attackDistance > 0 && attackDistance <= 1)) throw Error("attackDistance must be in (0, 1]");
  const assay = oneAssay(id);
  if (defense !== undefined && !["counterattack", "alarm-counterattack", "attack-counterattack"].includes(defense))
    throw Error("Unknown defense rule");
  const existing = runAssay(assay, seed).metrics;
  const baseContact = assay.spec(seed).sides?.responses?.contact ?? localResponses.contact;
  let defender;
  let attackers = [];
  const observed =
    defense === "attack-counterattack"
      ? {
          ...assay,
          spec(seed) {
            const spec = assay.spec(seed);
            return {
              ...spec,
              probes: [
                ...(spec.probes ?? []),
                {
                  tick(game) {
                    defender = game.player;
                    attackers = [];
                    const rival = game.rival;
                    if (!rival) return;
                    for (let i = 0; i < rival.n; i++) {
                      if (rival.alive[i] && rival.attackLayer[i] === rival.layer[i])
                        attackers.push({ x: rival.x[i], y: rival.y[i], layer: rival.layer[i] });
                    }
                  },
                  summary: () => ({}),
                },
              ],
            };
          },
        }
      : assay;
  function sawAttack() {
    if (!defender) return false;
    const i = defender.ti;
    return attackers.some(({ x, y, layer }) => layer === defender.layer[i] && (x - defender.x[i]) ** 2 + (y - defender.y[i]) ** 2 <= 1);
  }
  const candidate = runAssay(observed, seed, {
    game: { fight: { ...directedFight, attackDistance } },
    colony: { deliveryLane: 1, dropRefusalLimit: 2 },
    responses: {
      drop: (t, draw) => !refuseTunnelDrop(t) && localResponses.drop(t, draw),
      ...(defense
        ? {
            contact(t, draw) {
              if (
                t.enemy &&
                t.carrying === "none" &&
                t.odds === "outnumbering" &&
                (defense === "counterattack" || (defense === "alarm-counterattack" ? t.alarm !== "none" : sawAttack()))
              )
                return "fight";
              return baseContact(t, draw);
            },
          }
        : {}),
    },
  }).metrics;
  console.log(JSON.stringify({ id, seed, attackDistance, defense, existing, candidate }));
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
