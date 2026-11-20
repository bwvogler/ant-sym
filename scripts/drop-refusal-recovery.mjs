// Default-size, two-colony runs: node scripts/drop-refusal-recovery.mjs [--isolate | --split] [seed ...]
import { CURTAIN, STRAINS, Game, encodeLevels, gameRng, generateOneWorld, localResponses } from "../web/src/colony/index.ts";

const dt = 1 / 30;
const seconds = 120;
const garden = STRAINS.findIndex((strain) => strain.id === "garden");
const damp = encodeLevels({ marks: 0 }, ["marks"]);

function run(seed, directed, contextual, recover) {
  const game = new Game(generateOneWorld(seed), {}, gameRng(seed));
  const colony = game.player;
  colony.params.dropRefusalLimit = recover ? 2 : 0;
  let dropRefusals = 0;
  if (directed) {
    game.params.fight = { ...game.params.fight, intent: true, attackReach: 1, attackDistance: 0.65 };
  }
  if (contextual) {
    colony.params.deliveryLane = 1;
    colony.responses = {
      ...localResponses,
      trail(t, draw) {
        return contextual !== "drop" && t.carrying === "food" && t.place === "tunnel" ? "none" : localResponses.trail(t, draw);
      },
      drop(t, draw) {
        if (contextual !== "trail" && t.carrying === "food" && !t.porter && t.place === "tunnel") {
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
const isolate = args.includes("--isolate");
const split = args.includes("--split");
const seeds = args.filter((arg) => arg !== "--isolate" && arg !== "--split").map(Number);
for (const seed of seeds.length ? seeds : [41, 42, 43, 44]) {
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
