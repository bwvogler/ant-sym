// Default-size, two-colony runs: node scripts/drop-refusal-recovery.mjs [seed ...]
import { CURTAIN, STRAINS, Game, encodeLevels, gameRng, generateOneWorld, localResponses } from "../web/src/colony/index.ts";

const dt = 1 / 30;
const seconds = 120;
const garden = STRAINS.findIndex((strain) => strain.id === "garden");
const damp = encodeLevels({ marks: 0 }, ["marks"]);

function run(seed, actions, recover) {
  const game = new Game(generateOneWorld(seed), {}, gameRng(seed));
  const colony = game.player;
  colony.params.dropRefusalLimit = recover ? 2 : 0;
  let dropRefusals = 0;
  if (actions) {
    game.params.fight = { ...game.params.fight, intent: true, attackReach: 1, attackDistance: 0.65 };
    colony.params.deliveryLane = 1;
    colony.responses = {
      ...localResponses,
      trail(t, draw) {
        return t.carrying === "food" && t.place === "tunnel" ? "none" : localResponses.trail(t, draw);
      },
      drop(t, draw) {
        if (t.carrying === "food" && !t.porter && t.place === "tunnel") {
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

  for (let tick = 0; tick < seconds / dt; tick++) game.tick(dt);
  return {
    initialHosts,
    dropRefusals,
    hosts: game.fungus.hosts,
    player: {
      stored: colony.stored,
      losses: colony.losses,
      alive: colony.population,
      held: colony.carrying.reduce((n, load) => n + load, 0),
      refusedStillHeld: colony.dropRefusalTime.reduce((n, time, i) => n + Number(time > 0 && colony.carrying[i]), 0),
    },
    rival: { stored: game.colonies[1].stored, losses: game.colonies[1].losses, alive: game.colonies[1].population },
  };
}

const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds.length ? seeds : [41, 42, 43, 44]) {
  console.log(
    JSON.stringify({ seed, existing: run(seed, false, false), actions: run(seed, true, false), recovery: run(seed, true, true) }),
  );
}
