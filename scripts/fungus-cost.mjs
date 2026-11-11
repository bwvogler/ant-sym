// Offline, no key, no spend: what would the fungus's Jev lane cost a game? Runs the side view as the app sets it up
// (generateSideWorld(seed), Game with mulberry32(seed * 7919)) with a stand-in for Jev behind the lane's own cache
// logic (ui/colonyJev.ts): each new fungal situation, keyed with the levers asked (the menu's), is one question (a score
// per lever), asked once and only with a lever on (worthAsking); questions go out in requests of at most
// FUNGUS_BATCH (fungusBrain.ts), a part-full one only after FUNGUS_GATHER_MS. The
// stand-in answers with the local rule, so the fungus does what it does without Jev. Tokens per request are estimated
// from its size (colonyBrain.estimateTokens), as colony-cost does; the ledger counts the real ones live.
//
// Plays: lockpick (painted on both holes), bloom (on colony 1's hole), bloom-crown (the same, crown on the menu, and
// crowning wherever a host is by the queen or in a chamber: crown.mjs's policy), garden (on both royal chambers). Each paint is the app's old
// spore brush (radius 3, spores 2, dose 0.15), STROKES events in a short drag, at 30 s.
//
// Usage: node scripts/fungus-cost.mjs [play=lockpick] [minutes=5] [ants=600] [seed=1] [strokes=6]
import {
  estimateTokens,
  FUNGUS_BATCH,
  FUNGUS_GATHER_MS,
  fungalKey,
  packFungusRequest,
  worthAsking,
  AIMS,
  STRAINS,
  BRUSH as SPORES,
  Game,
  centreX,
  centreY,
  generateSideWorld,
  mulberry32,
} from "../web/src/colony/index.ts";
import { USD_PER_INPUT_TOKEN } from "../web/shared/jev.ts";

const play = process.argv[2] ?? "lockpick";
const [minutes = 5, ants = 600, seed = 1, strokes = 6] = process.argv.slice(3).map(Number);
const DT = 1 / 30;
const BATCH_EVERY = FUNGUS_GATHER_MS / 1000; // the lane lets a part-full request gather this long (colonyJev gatherMs)
const aim = AIMS[0].text;
const map = generateSideWorld(seed);
const g = new Game(map, { antCount: ants, rivalAnts: ants }, mulberry32(seed * 7919));
const strain = STRAINS.findIndex((s) => s.id === (play.startsWith("bloom") ? "bloom" : play));
if (play === "bloom-crown") g.fungus.menu = new Set([...g.fungus.menu, "crown"]);
const menu = g.fungus.menu;
const local = (s) => g.fungus.local(s);
const crown = (s) => (s.place === "queen" || s.place === "chamber" ? "crown" : local(s));
const asked = new Set();
const queue = new Map();
let tokens = 0;
let requests = 0;
g.fungus.policy = (s) => {
  const levers = g.fungus.asked;
  const key = fungalKey(s, levers);
  if (worthAsking(levers) && !asked.has(key)) queue.set(key, { situation: s, asked: levers });
  return play === "bloom-crown" ? crown(s) : local(s);
};
const flush = () => {
  const items = [...queue.entries()].filter(([k]) => !asked.has(k));
  queue.clear();
  for (let b = 0; b < items.length; b += FUNGUS_BATCH) {
    const chunk = items.slice(b, b + FUNGUS_BATCH);
    tokens += estimateTokens(
      packFungusRequest(
        chunk.map(([, it], n) => ({ id: `h${n}`, ...it })),
        aim,
      ),
    );
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
  if (t >= next || queue.size >= FUNGUS_BATCH) {
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
