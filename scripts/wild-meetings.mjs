// Offline, no key, no spend: how the player's colonies meet the endless plane's wild colonies, by wild density (PRD §66 E6 measured; ja-qpv.5, the bead's
// follow-up note on `ja-qpv.5`: "unwoken sites have no scent, so hosts find nest ground by chance"). One game per seed on generateEndlessWorld(seed, ...)
// with the awake rule on, as scripts/awake-bench.mjs --endless plays it: two start colonies of `ants`, Garden landed on the first, no flights (autoFound
// off), no Jev, nothing changed in the colony (Game.wakeSite is wrapped here only to read why a site woke). Per game it reports:
//   woken      wild sites that woke, the time of the first, and why each woke, read the instant the game woke it: the fungus's body within W (280) of the
//              site, an awake host (an ant carrying spores) inside the 16-cell nest ground, or both
//   entries    episodes of a host entering the nest ground of a site or wild hole (a site, woken or not; an episode ends when no host has been inside for 10 s)
//   meetings   episodes (and those with a wild colony whose odour is a stranger's: further than the tolerance, ja-s37s) of an ant of an own colony (a start colony) within CONTACT cells of an ant of an awake wild colony, per (own, wild) pair (an
//              episode ends after 10 s apart), all ants and hosts alone; also the contact-seconds. Sampled once a second, awake colonies only
//   listed     the sites Game.sites lists (Game.feedSites), mean over the run and per awake colony
// The rates are per game hour scaled up from `seconds` of play (default 600 s): a short game under-counts, since the fungus is still spreading.
//
// Usage: node scripts/wild-meetings.mjs [--seeds 1-4] [--region 4] [--density 1] [--seconds 600] [--ants 400] [--cap 6] [--contact 4] [--json out.json]
import { Game, gameRng, generateEndlessWorld, STRAINS, PLANE, TOLERANCE } from "../web/src/colony/index.ts";
import { helpAndExit } from "./lib/usage.mjs";
import { writeFileSync } from "node:fs";
helpAndExit(import.meta.url);

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? dflt : process.argv[i + 1];
};
const seeds = [];
for (const part of String(arg("seeds", "1-4")).split(",")) {
  const [a, b = a] = part.split("-").map(Number);
  for (let k = a; k <= b; k++) seeds.push(k);
}
const REGION = Number(arg("region", 4));
const DENSITY = Number(arg("density", 1));
const SECONDS = Number(arg("seconds", 600));
const ANTS = Number(arg("ants", 400));
const CAP = Number(arg("cap", 6));
const CONTACT = Number(arg("contact", 4));
const W = 280;
const NEST_GROUND = 16;
const DT = 1 / 30;
const GAP_S = 10;

/** One game; the tallies. */
function play(seed) {
  const world = generateEndlessWorld(seed, {
    regionChunks: REGION,
    density: DENSITY,
  });
  const game = new Game(world, { autoFound: false }, gameRng(seed), [{ antCount: ANTS }, { antCount: ANTS }]);
  game.enableSleep({ cap: CAP });
  game.land(
    0,
    STRAINS.findIndex((s) => s.id === "garden"),
    { evolve: true },
  );
  const wild = new Set(); // colony indexes of woken sites
  const holeOf = (k) => game.colonies[k].layers[PLANE].nest;
  const wakes = [];
  const wake = game.wakeSite.bind(game);
  game.wakeSite = (s, o) => {
    // Game calls this only for a site that is listed, so only for one that has not woken yet
    const body = game.fungus.bodyNear(PLANE, [s], W)[0];
    let host = false;
    game.colonies.forEach((c, j) => {
      if (game.isFrozen(j)) return;
      for (let i = 0; i < c.n && !host; i++)
        if (c.alive[i] && c.load[i] > 0 && c.layer[i] === PLANE && Math.hypot(s.x - c.x[i], s.y - c.y[i]) <= NEST_GROUND) host = true;
    });
    wakes.push({
      t: game.time,
      by: body && host ? "both" : body ? "body" : host ? "host" : "?",
    });
    const k = wake(s, o);
    wild.add(k);
    return k;
  };
  let ep = new Map(); // pair key -> { last: second of the last sample in contact, on: bool }
  const tally = {
    meet: 0,
    meetStranger: 0,
    hostMeet: 0,
    meetSeconds: 0,
    entries: 0,
  };
  const episode = (map, key, now, hit, count) => {
    const e = map.get(key) ?? { last: -1e9 };
    if (hit) {
      if (now - e.last > GAP_S) tally[count]++;
      e.last = now;
    }
    map.set(key, e);
  };
  const hostEp = new Map();
  const strangerEp = new Map();
  // odours further apart than the tolerance are strangers (recognition.ts); kin ally, so a kin wild colony is met but not fought (ja-s37s)
  const isStranger = (key) => {
    const [a, b] = key.split(":").map(Number);
    return Math.abs(game.colonies[a].nestOdour - game.colonies[b].nestOdour) > TOLERANCE;
  };
  const entryEp = new Map();
  let listed = 0;
  let listedPerAwake = 0;
  let samples = 0;
  const ms = [];
  const steps = Math.round(SECONDS / DT);
  for (let k = 0; k < steps; k++) {
    const a = performance.now();
    game.tick(DT);
    ms.push(performance.now() - a);
    if (k % 30 !== 29) continue;
    const now = Math.round((k + 1) * DT);
    samples++;
    const awake = game.colonies.map((_, j) => !game.isFrozen(j));
    const nAwake = awake.filter(Boolean).length;
    listed += game.sites.length;
    listedPerAwake += game.sites.length / Math.max(1, nAwake);
    // wild ants on a bucket grid, awake colonies only
    const grid = new Map();
    const bucket = (x, y) => `${Math.floor(x / 16)},${Math.floor(y / 16)}`;
    for (const j of wild) {
      if (!awake[j]) continue;
      const c = game.colonies[j];
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.layer[i] !== PLANE) continue;
        const key = bucket(c.x[i], c.y[i]);
        (grid.get(key) ?? grid.set(key, []).get(key)).push({
          j,
          x: c.x[i],
          y: c.y[i],
        });
      }
    }
    const pairs = new Map();
    const hostPairs = new Set();
    for (let j = 0; j < game.colonies.length; j++) {
      if (wild.has(j) || !awake[j]) continue;
      const c = game.colonies[j];
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.layer[i] !== PLANE) continue;
        const bx = Math.floor(c.x[i] / 16);
        const by = Math.floor(c.y[i] / 16);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (const o of grid.get(`${bx + dx},${by + dy}`) ?? [])
              if (Math.hypot(o.x - c.x[i], o.y - c.y[i]) <= CONTACT) {
                const key = `${j}:${o.j}`;
                pairs.set(key, (pairs.get(key) ?? 0) + 1);
                if (c.load[i] > 0) hostPairs.add(key);
              }
      }
    }
    tally.meetSeconds += pairs.size;
    for (const key of new Set([...ep.keys(), ...pairs.keys()])) episode(ep, key, now, pairs.has(key), "meet");
    const strangers = new Map([...pairs].filter(([key]) => isStranger(key)));
    for (const key of new Set([...strangerEp.keys(), ...strangers.keys()]))
      episode(strangerEp, key, now, strangers.has(key), "meetStranger");
    for (const key of new Set([...hostEp.keys(), ...hostPairs])) episode(hostEp, key, now, hostPairs.has(key), "hostMeet");
    // hosts inside a site's (or a wild hole's) nest ground
    const spots = [
      ...game.sites.map((s) => ({ key: `s${s.rx},${s.ry}`, x: s.x, y: s.y })),
      ...[...wild].map((j) => ({
        key: `w${j}`,
        x: holeOf(j).x,
        y: holeOf(j).y,
      })),
    ];
    const inside = new Set();
    game.colonies.forEach((c, j) => {
      if (!awake[j]) return;
      for (let i = 0; i < c.n; i++) {
        if (!c.alive[i] || c.load[i] <= 0 || c.layer[i] !== PLANE || wild.has(j)) continue;
        for (const s of spots) if (Math.hypot(s.x - c.x[i], s.y - c.y[i]) <= NEST_GROUND) inside.add(s.key);
      }
    });
    for (const s of spots) episode(entryEp, s.key, now, inside.has(s.key), "entries");
  }
  // an unwoken site's key and its woken colony's key differ ("s.." then "w.."), so a host standing on a site as it wakes counts twice at most
  ms.sort((a, b) => a - b);
  const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  return {
    seed,
    woken: wakes.length,
    firstWake: wakes.length ? wakes[0].t : null,
    atStart: wakes.filter((w) => w.t < 2).length,
    wakes: wakes.map((w) => [Math.round(w.t), w.by]),
    by: Object.fromEntries(["body", "host", "both", "?"].map((b) => [b, wakes.filter((w) => w.by === b).length])),
    ...tally,
    listed: listed / samples,
    listedPerAwake: listedPerAwake / samples,
    colonies: game.colonies.length,
    awake: game.colonies.filter((_, j) => !game.isFrozen(j)).length,
    tickMedian: q(0.5),
    tickP90: q(0.9),
    tickMax: ms[ms.length - 1],
    over50: ms.filter((t) => t > 50).length,
    chunks: world.plane.rock.count,
    body: game.fungus.bodyBuckets(PLANE, W).length,
  };
}

const rows = [];
const hours = SECONDS / 3600;
console.log(
  `endless plane, region ${REGION}x${REGION} chunks, density ${DENSITY}, ${ANTS} ants x 2 start colonies, cap ${CAP}, ${SECONDS} s, contact ${CONTACT}`,
);
for (const seed of seeds) {
  const r = play(seed);
  rows.push(r);
  console.log(
    `seed ${seed}: woken ${r.woken} (${r.atStart} in the first 2 s, first at ${r.firstWake?.toFixed(0) ?? "-"} s; body ${r.by.body}, host ${r.by.host}, both ${r.by.both}), host entries ${r.entries} (${(r.entries / hours).toFixed(0)}/h), ` +
      `meetings ${r.meet} (${(r.meet / hours).toFixed(0)}/h; strangers ${r.meetStranger}; hosts ${r.hostMeet}, ${r.meetSeconds} contact-s), sites listed ${r.listed.toFixed(1)} (${r.listedPerAwake.toFixed(1)} per awake), ` +
      `${r.colonies} colonies, ${r.awake} awake, tick ${r.tickMedian.toFixed(1)}/${r.tickP90.toFixed(1)}/${r.tickMax.toFixed(0)} ms, ${r.over50} over 50 ms, ${r.chunks} chunks`,
  );
}
const file = arg("json", "");
if (file) writeFileSync(file, JSON.stringify({ args: process.argv.slice(2), rows }, null, 1));
