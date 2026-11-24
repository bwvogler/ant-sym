import assert from "node:assert/strict";
import { test } from "node:test";
import { isEndless } from "../../endlessMap.ts";
import { generateEndlessWorld, type EndlessWorld } from "../../endlessWorld.ts";
import { Game, gameRng } from "../../game.ts";
import { PLANE } from "../../vocab.ts";
import { DT } from "../builders.ts";

// The endless world as a game (PRD §66 E6.0.3, `ja-qpv.9`): a OneWorld over the endless plane, and the wild sites listed near what is awake.

const SPECS = [{ antCount: 30 }, { antCount: 30 }];
const game = (seed = 4) => new Game(generateEndlessWorld(seed), {}, gameRng(seed), SPECS);

test("the endless world is a one world over the endless plane: its start nests on one line, a curtain under it, no site in it", () => {
  const w = generateEndlessWorld(4);
  assert.ok(isEndless(w.plane));
  assert.equal(w.lines.length, 1);
  assert.equal(w.line.holes.length, 2);
  assert.deepEqual(
    w.plane.nests.map((n) => [n.x, n.y]),
    w.plane.plane.startNests().map((n) => [n.x, n.y]),
  );
  const again = generateEndlessWorld(4);
  assert.deepEqual(again.line.holes, w.line.holes, "the same seed makes the same world");
  assert.notDeepEqual(generateEndlessWorld(5).line.holes, w.line.holes);
});

test("a game over it turns new lines on and lists the wild sites in a box of 2 W round each awake hole", () => {
  const g = game();
  assert.equal(g.newLines, true);
  assert.ok(g.sites.length > 0, "wild sites are listed");
  const plane = (g.world as EndlessWorld).plane;
  const holes = g.colonies.map((c) => (c.layers[PLANE] as { nest: { x: number; y: number } }).nest);
  for (const s of g.sites) {
    assert.ok(s.rx !== undefined && s.ry !== undefined, "each carries its lattice cell: it can wake");
    assert.ok(
      holes.some((h) => Math.abs(h.x - s.x) <= 560 && Math.abs(h.y - s.y) <= 560),
      "and lies within 2 W of a hole",
    );
  }
  // equal to the plane's own sites in those boxes
  const want = new Set<string>();
  for (const h of holes) for (const s of plane.plane.sitesIn(h.x - 560, h.y - 560, h.x + 560, h.y + 560)) want.add(`${s.rx},${s.ry}`);
  assert.deepEqual(new Set(g.sites.map((s) => `${s.rx},${s.ry}`)), want);
});

test("feeding sites generates no chunk; a sleeping colony's box is dropped, the fungus's body brings its own", () => {
  const g = game();
  const plane = (g.world as EndlessWorld).plane;
  const chunks = plane.rock.count;
  g.feedSites();
  assert.equal(plane.rock.count, chunks, "the feed reads the plane's lattice, not the map's chunks");
  g.freeze(0);
  g.freeze(1);
  g.feedSites();
  assert.equal(g.sites.length, 0, "far from everything awake: no site is listed");
  // spores 1,400 cells east of the start, on open ground or not (the body is spores on cells): sites near them are listed
  const h = (g.colonies[0]!.layers[PLANE] as { nest: { x: number; y: number } }).nest;
  g.paintSpores(h.x + 1400, h.y, 3, 5, 0, 0, PLANE);
  const made = plane.rock.count; // the brush reads the ground it paints on
  g.feedSites();
  assert.ok(g.sites.length > 0, "sites near the fungus's body are listed");
  for (const s of g.sites) assert.ok(Math.abs(s.x - (h.x + 1400)) <= 3 * 280 + 280, `site at ${s.x} is within a few W of the body`);
  assert.equal(plane.rock.count, made, "and still no chunk made by the feed");
});

test("a woken site is a colony and is no longer listed; the feed keeps the others", () => {
  const g = game();
  const site = g.sites[0]!;
  const before = g.sites.length;
  const k = g.wakeSite({ x: site.x, y: site.y, rx: site.rx!, ry: site.ry!, heading: site.heading }, { ants: 20 });
  assert.equal(g.colonies.length, 3);
  assert.equal(k, 2);
  g.feedSites();
  assert.ok(!g.sites.some((s) => s.rx === site.rx && s.ry === site.ry), "it has woken: not listed");
  assert.ok(g.sites.length >= before - 1);
  for (let i = 0; i < 30 * 5; i++) g.tick(DT);
});

test("a founding on the endless plane asks a local rule 4 (no whole-plane pass) and a far landing starts a line", () => {
  const g = game();
  const h = (g.colonies[0]!.layers[PLANE] as { nest: { x: number; y: number } }).nest;
  const t0 = Date.now();
  const far = g.settleAt({ x: h.x + 700, y: h.y + 40 });
  assert.ok(Date.now() - t0 < 5000, "answered without scanning the plane");
  if (far.ok) {
    assert.ok(far.newLine, "far from every hole, it begins a line of its own");
    assert.equal(far.line, 1);
  } else assert.ok(far.reason.length > 0);
  const k = g.tryFoundBeyond("end", 20);
  if (k.ok) for (let i = 0; i < 30 * 3; i++) g.tick(DT);
});
