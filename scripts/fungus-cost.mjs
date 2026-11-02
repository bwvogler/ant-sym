// Offline, no key, no spend: what would the fungus's Jev lane cost a game? Runs the side view as the app sets it up
// (generateSideWorld(seed), Game with mulberry32(seed * 7919)) with a stand-in for Jev behind the lane's own cache
// logic (ui/colonyJev.ts): each new fungal situation, keyed with what its host is offered, is one question, asked once
// and only when there is a real choice (worthAsking); questions go out every 0.3 s in requests of at most 100. The
// stand-in answers with the local rule, so the fungus does what it does without Jev. Tokens per request are estimated
// from its size (colonyBrain.estimateTokens), as colony-cost does; the ledger counts the real ones live.
//
// Plays: lockpick (painted on both holes), bloom (on colony 1's hole), bloom-crown (the same, crown on the menu, and
// crowning wherever a host is at home: crown.mjs's policy), garden (on both royal chambers). Each paint is the UI's
// spore brush (radius 3, spores 2, dose 0.15), STROKES events in a short drag, at 30 s.
//
// Usage: node scripts/fungus-cost.mjs [play=lockpick] [minutes=5] [ants=600] [seed=1] [strokes=6]
import { estimateTokens } from "../web/src/colony/colonyBrain.ts";
import { fungalKey, offeredFor, packFungusRequest, worthAsking, AIMS } from "../web/src/colony/fungusBrain.ts";
import { STRAINS } from "../web/src/colony/fungus.ts";
import { Game } from "../web/src/colony/game.ts";
import { centreX, centreY } from "../web/src/colony/hex.ts";
import { generateSideWorld, mulberry32 } from "../web/src/colony/world.ts";
import { USD_PER_INPUT_TOKEN } from "../web/shared/jev.ts";

const play = process.argv[2] ?? "lockpick";
const [minutes = 5, ants = 600, seed = 1, strokes = 6] = process.argv.slice(3).map(Number);
const SPORES = { radius: 3, spores: 2, dose: 0.15 }; // web/src/ui/useColony.ts
const DT = 1 / 30;
const BATCH_EVERY = 0.3;
const aim = AIMS[0].text;
const map = generateSideWorld(seed);
const g = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed * 7919));
const strain = STRAINS.findIndex((s) => s.id === (play.startsWith("bloom") ? "bloom" : play));
if (play === "bloom-crown") g.fungus.menu = new Set([...g.fungus.menu, "crown"]);
const menu = g.fungus.menu;
const local = (s) => g.fungus.local(s);
const crown = (s) => (s.strain === "bloom" && s.ground === "home" ? "crown" : local(s));
const asked = new Set();
const queue = new Map();
let tokens = 0;
let requests = 0;
g.fungus.policy = (s) => {
  const offered = offeredFor(s.strain, menu);
  const key = fungalKey(s, offered);
  if (worthAsking(offered) && !asked.has(key)) queue.set(key, { situation: s, offered });
  return play === "bloom-crown" ? crown(s) : local(s);
};
const flush = () => {
  const items = [...queue.entries()].filter(([k]) => !asked.has(k));
  queue.clear();
  for (let b = 0; b < items.length; b += 100) {
    const chunk = items.slice(b, b + 100);
    tokens += estimateTokens(packFungusRequest(chunk.map(([, it], n) => ({ id: `h${n}`, ...it })), aim));
    requests++;
    for (const [k] of chunk) asked.add(k);
  }
};
const paint = (x, y) => {
  for (let s = 0; s < strokes; s++) g.paintSpores(x - 3 + s, y, SPORES.radius, SPORES.spores, SPORES.dose, strain);
};
let next = 0;
let painted = false;
for (let t = 0; t < minutes * 60; t += DT) {
  g.tick(DT);
  if (!painted && g.time >= 30) {
    painted = true;
    if (play === "garden")
      for (const c of g.colonies) {
        const royal = map.chambers.list.find((k) => k.colony === c.params.nest && k.role === "royal");
        paint(centreX(Math.round((royal.x0 + royal.x1) / 2), royal.floorRow), centreY(royal.floorRow));
      }
    else for (const c of play === "lockpick" ? g.colonies : [g.colonies[1]]) paint(c.nest.entrance.x, c.nest.entrance.y);
  }
  if (t >= next) {
    flush();
    next = t + BATCH_EVERY;
  }
}
flush();
const q = asked.size;
const perQ = Math.round(tokens / Math.max(1, q));
console.log(
  JSON.stringify({
    play,
    seed,
    minutes,
    ants,
    menu: [...menu],
    situations: q,
    requests,
    tokens,
    tokensPerQuestion: perQ,
    usdPerGame: +(tokens * USD_PER_INPUT_TOKEN).toFixed(5),
    usdPerHourAtThisPace: +((tokens * USD_PER_INPUT_TOKEN * 60) / minutes).toFixed(5),
  }),
);
