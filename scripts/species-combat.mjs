// Compare both combat rules through the normal game constructor.
// Usage: node scripts/species-combat.mjs <desert|neglectus> <seed> <existing|directed> [seconds]
import { DEFAULT_FIGHT, STRAINS } from "../web/src/colony/index.ts";
import { combatObservers } from "../web/src/colony/combatObservation.ts";
import { buildGame } from "../web/src/ui/useColony.ts";

const [species, seedArg, arm, secondsArg = "600"] = process.argv.slice(2);
const seed = Number(seedArg);
const seconds = Number(secondsArg);
if (
  !["desert", "neglectus"].includes(species) ||
  !["existing", "directed"].includes(arm) ||
  !Number.isSafeInteger(seed) ||
  seed <= 0 ||
  !Number.isSafeInteger(seconds) ||
  seconds <= 0
) {
  throw Error("Expected a species, a positive integer seed, an arm and optionally a duration in seconds");
}

const game = buildGame({ species, seed, antCount: 800, rival: true, generation: 0 });
if (arm === "existing") game.params.fight = { ...DEFAULT_FIGHT };
const initialWorkers = game.colonies.map((colony) => colony.population);
const decisions = game.colonies.map((colony) => {
  const counts = { attacks: 0, withdrawals: 0, combatDeaths: 0 };
  combatObservers.set(colony, {
    contact(action) {
      if (action.movement === "attack") counts.attacks++;
      if (action.movement === "withdraw") counts.withdrawals++;
    },
    exposure(_pressure, _allies, killed) {
      if (killed) counts.combatDeaths++;
    },
  });
  return counts;
});

game.land(
  0,
  STRAINS.findIndex((strain) => strain.id === "garden"),
  { evolve: true },
);
for (let tick = 0; tick < seconds * 30; tick++) game.tick(1 / 30);

console.log(
  JSON.stringify({
    species,
    seed,
    seconds,
    arm,
    outcome: game.outcome(),
    initialWorkers,
    colonies: game.colonies.map((colony, i) => ({
      ...decisions[i],
      food: colony.stored,
      losses: colony.losses,
      alive: colony.population,
      foodHeld: colony.carrying.reduce((count, carrying) => count + carrying, 0),
    })),
  }),
);
