import assert from "node:assert/strict";
import { test } from "node:test";
import { centreX, centreY } from "../../hex.ts";
import { Game } from "../../game.ts";
import type { Site } from "../../endlessPlane.ts";
import { generateOneWorld, mainGround } from "../../oneWorld.ts";
import { mulberry32 } from "../../world.ts";

// The wake trigger (docs/endless-world.md §6, PRD §66 E4.3b): the fungus's body within W of a site, or a host in its nest ground; nothing else.

const SEED = 2;
const fresh = () => new Game(generateOneWorld(SEED), { regrow: 0, autoFound: false }, mulberry32(5), [{ antCount: 30 }, { antCount: 30 }]);
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds * 30; t++) g.tick(1 / 30);
};
const RULE = { distance: 30, delay: 20, cap: 6 };

/** A game with the awake rule on and one site, at a plane cell far from every hole where a founding would start a line. */
function withSite(): { g: Game; site: Site } {
  const g = fresh();
  const ground = mainGround(g.world);
  g.newLines = true;
  for (let y = 20; y < 360; y += 20)
    for (let x = 20; x < 500; x += 20) {
      const s = g.settleAt({ x, y }, ground);
      if (s.ok && s.newLine) {
        g.newLines = false;
        const site: Site = { x: centreX(s.cell.x, s.cell.y), y: centreY(s.cell.y), r: 6, rx: 1, ry: 2, heading: s.newLine.heading };
        g.sites = [{ x: site.x, y: site.y, heading: site.heading, rx: 1, ry: 2 }];
        g.enableSleep(RULE);
        return { g, site };
      }
    }
  throw new Error("no far open cell");
}

test("a site nothing awake comes near stays asleep, however long", () => {
  const { g } = withSite();
  run(g, 60);
  assert.equal(g.colonies.length, 2);
  assert.equal(g.sites.length, 1, "still reserved");
});

test("the fungus's body within W wakes the site, once, as a colony on a line of its own", () => {
  const { g, site } = withSite();
  run(g, 2);
  g.fungus.paint(g.colonies, site.x + 20, site.y, 3, 2, 0, 0, 0);
  run(g, 3);
  assert.equal(g.colonies.length, 3);
  assert.equal(g.sites.length, 0);
  assert.equal(g.colonies[2]!.lineIndex, 1);
  run(g, 5);
  assert.equal(g.colonies.length, 3, "woken once");
});

test("a host in the nest ground wakes it; one foraging past within W does not", () => {
  const trial = (dx: number) => {
    const { g, site } = withSite();
    run(g, 2);
    const c = g.colonies[0]!;
    c.load[0] = 1;
    c.putAnt(0, 0, site.x + dx, site.y);
    run(g, 2);
    return g.colonies.length;
  };
  assert.equal(trial(5), 3, "inside the nest ground (16)");
  assert.equal(trial(25), 2, "within W (30) but outside the nest ground");
});

test("a site without its lattice cell cannot wake", () => {
  const { g, site } = withSite();
  g.sites = [{ x: site.x, y: site.y, heading: site.heading }];
  run(g, 2);
  g.fungus.paint(g.colonies, site.x + 20, site.y, 3, 2, 0, 0, 0);
  run(g, 3);
  assert.equal(g.colonies.length, 2);
});

test("with the rule off a site never wakes: the trigger is part of the awake rule", () => {
  const g = fresh();
  const s = g.colonies[0]!.layers[0]!.nest;
  g.sites = [{ x: s.x + 200, y: s.y, heading: 0.5, rx: 1, ry: 2 }];
  g.fungus.paint(g.colonies, s.x + 200, s.y, 3, 2, 0, 0, 0);
  run(g, 5);
  assert.equal(g.colonies.length, 2);
});

test("only an awake host wakes a site: an ant without the fungus, or a host asleep with its colony, in the nest ground wakes nothing", () => {
  const trial = (load: number, asleep: boolean) => {
    const { g, site } = withSite();
    run(g, 2);
    const c = g.colonies[0]!;
    c.load[0] = load;
    c.putAnt(0, 0, site.x + 5, site.y);
    if (asleep) g.freeze(0);
    run(g, 2);
    return g.colonies.length;
  };
  assert.equal(trial(1, false), 3, "an awake host does");
  assert.equal(trial(0, false), 2, "an ant that carries nothing does not");
  assert.equal(trial(1, true), 2, "a host asleep with its colony does not");
});
