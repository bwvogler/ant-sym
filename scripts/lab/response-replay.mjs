// Offline replay (no key, no spend; review of #281, D1): do colonies feed and fight as well when the six response hooks play Jev's
// SHIPPED answers (web/public/precache/<hook>-<doctrine>.json, drawn as the page draws them) as when they play the local rule?
// One world as the page builds it (directed combat on, hyphae), both colonies on the same arm, paired seeds.
// Usage (repository root): node scripts/lab/response-replay.mjs [--doctrine forage] [--seeds 1-10] [--ants 150] [--seconds 300]
import { readFileSync } from "node:fs";
import {
  Game,
  generateOneWorld,
  gameRng,
  GAME_REGROW,
  DEFAULT_FIGHT,
  RESPONSE_HOOKS,
  responsesFromAnswers,
  localResponses,
} from "../../web/src/colony/index.ts";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const doctrine = value("--doctrine", "forage");
const [from, to] = String(value("--seeds", "1-10")).split("-").map(Number);
const ants = Number(value("--ants", 150));
const seconds = Number(value("--seconds", 300));

const cache = Object.fromEntries(
  RESPONSE_HOOKS.map((h) => [
    h,
    Object.fromEntries(JSON.parse(readFileSync(new URL(`../../web/public/precache/${h}-${doctrine}.json`, import.meta.url), "utf8"))),
  ]),
);

function play(seed, shipped) {
  const hits = Object.fromEntries(RESPONSE_HOOKS.map((h) => [h, [0, 0]]));
  const r = shipped ? responsesFromAnswers(cache, localResponses, (h, hit) => hits[h][hit ? 0 : 1]++) : localResponses;
  const g = new Game(
    generateOneWorld(seed),
    {
      regrow: GAME_REGROW,
      autoFound: false,
      fungus: { hyphae: true },
      fight: { ...DEFAULT_FIGHT, intent: true, attackDistance: 0.65, counterattack: true },
    },
    gameRng(seed, 0),
    [
      { antCount: ants, responses: r },
      { antCount: ants, responses: r },
    ],
  );
  for (let t = 0; t < seconds; t += 1 / 30) g.tick(1 / 30);
  const [a, b] = g.colonies;
  return { stored: a.stored + b.stored, p1: a.stored, losses: a.losses + b.losses, pop: a.population + b.population, hits };
}

console.log(
  `doctrine ${doctrine}, ${ants} + ${ants} ants, ${seconds} s; shipped answers vs the local rule (stored food, losses, population; both colonies)`,
);
console.log("| seed | stored local | stored shipped | ratio | losses local | losses shipped | pop local | pop shipped | lookups hit |");
console.log("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
const ratios = [];
for (let seed = from; seed <= to; seed++) {
  const l = play(seed, false);
  const s = play(seed, true);
  const hit = Object.values(s.hits).reduce((n, [h]) => n + h, 0);
  const all = Object.values(s.hits).reduce((n, [h, m]) => n + h + m, 0);
  ratios.push(l.stored ? s.stored / l.stored : NaN);
  console.log(
    `| ${seed} | ${l.stored} | ${s.stored} | ${ratios.at(-1).toFixed(2)} | ${l.losses} | ${s.losses} | ${l.pop} | ${s.pop} | ${all ? Math.round((100 * hit) / all) : 0} % |`,
  );
}
ratios.sort((a, b) => a - b);
console.log(
  `\nstored-food ratio shipped / local: worst ${ratios[0].toFixed(2)}, median ${((ratios[(ratios.length - 1) >> 1] + ratios[ratios.length >> 1]) / 2).toFixed(2)}, best ${ratios.at(-1).toFixed(2)}`,
);
