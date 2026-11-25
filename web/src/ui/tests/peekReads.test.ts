import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CELL,
  CHUNK,
  ChunkLayer,
  CURTAIN,
  cellAt,
  cellOf,
  centreX,
  centreY,
  Game,
  gameRng,
  generateEndlessWorld,
  lineOfLayer,
  OPEN,
  PLANE,
  ROCK,
  rockAt,
  STRIP,
  type WorldMap,
} from "../../colony/index.ts";
import { inspectCell } from "../cellInspection.ts";
import type { FieldCtx, FieldTheme } from "../field/ctx.ts";
import type { FieldEnv } from "../field/env.ts";
import { planeGround } from "../field/fogCull.ts";
import { Ground, type GroundShow } from "../field/ground.ts";
import { Minimap } from "../field/minimap.ts";
import { extentOf } from "../field/rig.ts";
import { sensedFor } from "../fog/sources.ts";
import { seenCell, seenRock } from "../groundPeek.ts";
import { inspectPatch } from "../inspectionPatch.ts";
import { probe } from "../lens.ts";
import { RecordedCanvas, RecordedPath, recordingContext } from "./recordingContext.ts";

// ja-qpv.4.8 (PRD §66, E5.4's "Not peek yet"): on an endless plane the page makes no chunk by reading. A click (the cell card and the six-hex patch), the lens,
// planeGround without the fog, the side-view strip's plane reads and the minimap read ground with `peek`: an unmade cell reads as the layer's empty (rock, no
// food, no spoil). Every test here runs two games built alike, one read by the page and one never, and holds that their chunks stay equal; a bounded map's
// reads are held to the exact calls they were (the last tests).

const THEME = {
  paper: "#paper",
  ink: "#ink",
  accent: "#accent",
  warn: "#warn",
  trail: [51, 52, 53],
  alarm: [61, 62, 63],
  rock: [11, 12, 13],
  soil: [21, 22, 23],
  sky: [31, 32, 33],
  spoil: [41, 42, 43],
  accentRgb: [71, 72, 73],
  paperRgb: [240, 241, 242],
  inkRgb: [10, 20, 30],
  warnRgb: [200, 100, 50],
  sporeRgb: [81, 82, 83],
  chamber: [91, 92, 93],
} as unknown as FieldTheme;
const SHOW: GroundShow = { food: true, home: true };
const TRAILS = { food: true, home: true };

function env(): FieldEnv {
  return {
    now: () => 0,
    dpr: () => 1,
    dev: false,
    reducedMotion: () => false,
    newPath: () => new RecordedPath() as unknown as Path2D,
    newCanvas: (w, h) => new RecordedCanvas(w, h) as unknown as HTMLCanvasElement,
    sprites: () => {
      throw new Error("no sprite");
    },
  };
}

function game(): Game {
  const g = new Game(generateEndlessWorld(4), {}, gameRng(4), [{ antCount: 20 }, { antCount: 20 }]);
  for (let k = 0; k < 40; k++) g.tick(0.05); // the ants make the ground they walk on
  return g;
}

/** Two games built alike: the page reads `read`'s, and never `quiet`'s. */
function twin() {
  return { read: game(), quiet: game() };
}

/** The plane of a game built on `generateEndlessWorld`, as the endless map it is. */
const planeOf = (g: Game) => g.world.plane as unknown as ReturnType<typeof generateEndlessWorld>["plane"];

/** Every count a read could change: the chunks of each plane layer and the generator's misses and prefetches. */
const key = (g: Game) => {
  const p = planeOf(g);
  return [p.rock.count, p.food.count, p.quality?.count, p.spoil?.count, p.chambers?.cell.count, p.gen.misses, p.gen.prefetched];
};

/** World positions of the cameras the reads are made at: near the start nests, in the gap between them, far, negative, and ~2e6 cells out (inside the box). */
function places(g: Game): [number, number][] {
  const [a] = planeOf(g).plane.startNests();
  return [
    [a!.x, a!.y],
    [a!.x + 700, a!.y - 500],
    [5000, -3000],
    [-3e5, 2e5],
    [2.0e6, 1.6e6],
    [-2.0e6, -1.6e6],
    [1.9e6, -1.7e6],
  ];
}

function fieldCtx(g: Game, o: Partial<FieldCtx> = {}): FieldCtx {
  const rec = recordingContext();
  const plane = g.world.plane;
  return {
    ctx: rec.ctx,
    theme: THEME,
    d: 1,
    v: { w: 800, h: 600, dpr: 1 },
    c: { x: 0, y: 0, zoom: 8 },
    lv: PLANE,
    m: plane,
    ext: extentOf(plane),
    world: g.world,
    colonies: g.colonies,
    fungus: {},
    smellAll: false,
    strip: false,
    trails: [],
    alarms: [],
    spores: new ChunkLayer<Float32Array>((n) => new Float32Array(n), 0),
    sensedLayer: null,
    sensedNow: 0,
    ...o,
  } as unknown as FieldCtx;
}

/** Every plane-side read the page makes on a click and under the lens, at one world position, with and without the fog. */
function click(g: Game, x: number, y: number): void {
  for (const fog of [false, true]) {
    const sensed = sensedFor(g, fog);
    inspectCell(g, sensed, PLANE, x, y, TRAILS);
    inspectPatch(g, sensed, PLANE, x, y, TRAILS);
    probe(g, sensed, PLANE, x, y, TRAILS);
  }
}

/**
 * Positions the page can be clicked at that the plane half-made: an open cell of a chunk whose rock the game made and whose food it did not (the layers are
 * separate: an ant's step reads rock alone), so a food read there would make the food chunk.
 */
function halfMade(g: Game): [number, number][] {
  const plane = g.world.plane;
  const out: [number, number][] = [];
  plane.rock.forEach((cx, cy, rc) => {
    if (plane.food.peek(cx, cy) !== undefined) return;
    const i = rc.indexOf(OPEN);
    if (i >= 0) out.push([centreX(cx * CHUNK + (i & 63), cy * CHUNK + (i >> 6)), centreY(cy * CHUNK + (i >> 6))]);
  });
  return out;
}

/** Clicks on the side view's strip over line 0's columns whose plane chunk is unmade (the card then reads the plane under the line). */
function stripClicks(g: Game, each: (x: number, y: number) => void): number {
  const line = lineOfLayer(g.world, CURTAIN);
  let n = 0;
  for (let s = line.sMin; s <= line.sMax; s += 3)
    if (cellAt(line, s) && g.world.plane.rock.peek(CELL[0]! >> 6, CELL[1]! >> 6) === undefined) {
      each(centreX(s, STRIP), centreY(STRIP));
      n++;
    }
  return n;
}

/** planeGround without the fog over a block of cells round world position (x, y). */
function ground(g: Game, x: number, y: number): void {
  const k = fieldCtx(g);
  cellOf(x, y);
  const [gx, gy] = [CELL[0]!, CELL[1]!];
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) planeGround(k, gx + i * 17, gy + j * 17);
}

/** The side view of line 0: the curtain's strip chunks painted from the plane under the line. Returns the strip cells whose plane chunk was unmade before. */
function strip(g: Game, ground: Ground): { unmade: number; k: FieldCtx; cc: ReturnType<Ground["chunkCanvas"]>[] } {
  const line = lineOfLayer(g.world, CURTAIN);
  const plane = g.world.plane;
  let unmade = 0;
  for (let s = line.sMin; s <= line.sMax; s++) if (cellAt(line, s) && plane.rock.peek(CELL[0]! >> 6, CELL[1]! >> 6) === undefined) unmade++;
  const k = fieldCtx(g, { m: g.world.curtain, lv: CURTAIN, strip: true, ext: { x0: 0, w: 512, h: 512 } as never });
  const cc = [];
  for (let cx = line.sMin >> 6; cx <= line.sMax >> 6; cx++) {
    const rc = g.world.curtain.rock.chunk(cx, STRIP >> 6);
    if (!rc) continue;
    const c = ground.chunkCanvas(cx, STRIP >> 6);
    ground.paintChunk(k, SHOW, cx, STRIP >> 6, c, rc, false);
    cc.push(c);
  }
  return { unmade, k, cc };
}

test("a click and the lens, at near, far, negative and ~2e6 cameras, make no chunk: the twin game that was read stays chunk for chunk the one never read", () => {
  const { read, quiet } = twin();
  assert.deepEqual(key(read), key(quiet), "built alike");
  for (let round = 0; round < 3; round++) {
    for (const [x, y] of places(read)) {
      click(read, x, y);
      assert.deepEqual(key(read), key(quiet), `round ${round}: a click at ${x}, ${y}`);
    }
    for (let k = 0; k < 8; k++) {
      read.tick(0.05);
      quiet.tick(0.05);
    }
    assert.deepEqual(key(read), key(quiet), `round ${round}: after ticks the games still hold the same chunks`);
  }
  assert.ok(read.world.plane.rock.count > 0);
});

test("a click on a chunk whose rock the game made but whose food it did not, and on the strip over unmade plane, makes no chunk either", () => {
  const { read, quiet } = twin();
  const spots = halfMade(read);
  assert.ok(spots.length >= 2, `the game left some chunks half made (${spots.length})`);
  for (const [x, y] of spots) {
    click(read, x, y);
    assert.deepEqual(key(read), key(quiet), `a click at ${x}, ${y}`);
  }
  assert.equal(read.world.plane.food.count, quiet.world.plane.food.count);
  const n = stripClicks(read, (x, y) => {
    for (const fog of [false, true]) {
      const sensed = sensedFor(read, fog);
      inspectCell(read, sensed, CURTAIN, x, y, TRAILS);
      inspectPatch(read, sensed, CURTAIN, x, y, TRAILS);
      probe(read, sensed, CURTAIN, x, y, TRAILS);
    }
  });
  assert.ok(n > 5, `clicks on the strip over ground nobody made (${n})`);
  assert.deepEqual(key(read), key(quiet), "the strip's projected plane cells were read without making them");
});

test("a click on ground the game has not made reads rock with no food (not yet explored), and on ground it has made reads the truth", () => {
  const g = game();
  const plane = g.world.plane;
  const sensed = sensedFor(g, false);
  const [x, y] = [2.0e6, 1.6e6];
  cellOf(x, y);
  const [cx, cy] = [CELL[0]! >> 6, CELL[1]! >> 6]; // CELL is shared: every read below moves it
  assert.equal(plane.rock.peek(cx, cy), undefined, "the far chunk is unmade");
  const far = probe(g, sensed, PLANE, x, y, TRAILS);
  assert.deepEqual([far.ground, far.food, far.mound], ["rock", 0, 0]);
  const card = inspectCell(g, sensed, PLANE, x, y, TRAILS);
  assert.deepEqual([card.place.ground, card.quality, card.ants.length], ["rock", 1, 0]);
  const patch = inspectPatch(g, sensed, PLANE, x, y, TRAILS);
  assert.equal(patch.cells.length, 7, "all seven hexes, no crash");
  assert.equal(patch.surfaceFood!.size, 0, "unmade ground is rock, so no food shows on it");
  assert.equal(plane.rock.peek(cx, cy), undefined, "and it is still unmade");
  // ground the game made reads as the game has it
  let open = 0;
  let fed = 0;
  plane.rock.forEach((cx, cy, rc) => {
    const fc = plane.food.peek(cx, cy);
    for (let i = 0; i < rc.length && (open < 5 || fed < 5); i++) {
      const [gx, gy] = [cx * CHUNK + (i & 63), cy * CHUNK + (i >> 6)];
      const p = probe(g, sensed, PLANE, centreX(gx, gy), centreY(gy), TRAILS);
      assert.equal(p.ground, rc[i] === OPEN ? "open" : rc[i] === ROCK ? "rock" : "soil", "the made ground's terrain");
      assert.equal(p.food, fc?.[i] ?? 0, "and its food");
      if (rc[i] === OPEN) open++;
      if ((fc?.[i] ?? 0) > 0) fed++;
    }
  });
  assert.ok(open >= 5, "the check saw open ground the game made");
});

test("planeGround without the fog makes no chunk at any camera, and reads what the game made", () => {
  const { read, quiet } = twin();
  for (const [x, y] of places(read)) {
    ground(read, x, y);
    assert.deepEqual(key(read), key(quiet), `planeGround round ${x}, ${y}`);
  }
  const plane = read.world.plane;
  let checked = 0;
  plane.rock.forEach((cx, cy, rc) => {
    const fc = plane.food.peek(cx, cy);
    for (let i = 0; i < rc.length; i += 97) {
      const [gx, gy] = [cx * CHUNK + (i & 63), cy * CHUNK + (i >> 6)];
      const p = planeGround(fieldCtx(read), gx, gy);
      assert.deepEqual([p.rock, p.food, p.spoil], [rc[i], fc?.[i] ?? 0, 0]);
      checked++;
    }
  });
  assert.ok(checked > 100);
  cellOf(2.0e6, 1.6e6);
  const none = planeGround(fieldCtx(read), CELL[0]!, CELL[1]!);
  assert.deepEqual([none.rock, none.food, none.spoil], [ROCK, 0, 0], "unmade ground: rock, no food, no spoil");
});

test("the side view's strip paints from the plane under the line without making a plane chunk, and an unmade column is rock", () => {
  const { read, quiet } = twin();
  const g = new Ground(env());
  const before = key(read);
  const s = strip(read, g);
  assert.ok(s.unmade > 20, `some of the line runs over ground nobody made (${s.unmade} cells)`);
  assert.deepEqual(key(read), before, "painting the strip made no plane chunk");
  assert.deepEqual(key(read), key(quiet));
  const line = lineOfLayer(read.world, CURTAIN);
  let seen = 0;
  for (let c = line.sMin; c <= line.sMax; c++) {
    if (!cellAt(line, c)) continue;
    const [qx, qy] = [CELL[0]!, CELL[1]!];
    if (read.world.plane.rock.peek(qx >> 6, qy >> 6) !== undefined) continue;
    const img = s.cc.find((cc) => cc.cx === c >> 6)!.img.data;
    const o = (((STRIP & 63) << 6) | (c & 63)) * 4;
    assert.deepEqual([...img.slice(o, o + 4)], [...THEME.rock, 255], `column ${c}: unmade ground is rock on the strip`);
    seen++;
  }
  assert.equal(seen, s.unmade);
});

test("the minimap, at the same cameras, makes no chunk either", () => {
  const { read, quiet } = twin();
  for (const [x, y] of places(read)) {
    const k = fieldCtx(read, { c: { x, y, zoom: 8 } });
    k.env = env();
    const minimap = new Minimap(k.env);
    minimap.resize(k.ext);
    minimap.paint(k);
    assert.deepEqual(key(read), key(quiet), `the minimap at ${x}, ${y}`);
  }
});

test("everything together, interleaved with the game's own ticks: the read game and the quiet one never part", () => {
  const { read, quiet } = twin();
  const g = new Ground(env());
  for (let round = 0; round < 4; round++) {
    for (const [x, y] of places(read)) {
      click(read, x, y);
      ground(read, x, y);
    }
    strip(read, g);
    for (let k = 0; k < 10; k++) {
      read.tick(0.05);
      quiet.tick(0.05);
    }
    assert.deepEqual(key(read), key(quiet), `round ${round}`);
  }
});

// ---- the helper itself, and a plane whose every layer generates ----

/** A plane by hand whose rock, food, quality and spoil each make a chunk on a read, counting the makes. */
function generating() {
  const made = { rock: 0, food: 0, quality: 0, spoil: 0 };
  const rock = new ChunkLayer<Uint8Array>(
    (n) => new Uint8Array(n),
    ROCK,
    (_x, _y, a) => {
      made.rock++;
      a.fill(OPEN);
    },
  );
  const food = new ChunkLayer<Float32Array>(
    (n) => new Float32Array(n),
    0,
    (_x, _y, a) => {
      made.food++;
      a.fill(2);
    },
  );
  const quality = new ChunkLayer<Float32Array>(
    (n) => new Float32Array(n),
    1,
    (_x, _y, a) => {
      made.quality++;
      a.fill(0.5);
    },
  );
  const spoil = new ChunkLayer<Uint16Array>(
    (n) => new Uint16Array(n),
    0,
    (_x, _y, a) => {
      made.spoil++;
      a.fill(3);
    },
  );
  const m = { endless: true, x0: -1e9, size: { w: 2e9, h: 2e9 }, rock, food, quality, spoil } as unknown as WorldMap;
  return { m, made, rock, food, quality, spoil };
}

test("on an endless plane whose layers all generate, the page's reads read the empty and make nothing; the game's own `get` still makes", () => {
  const p = generating();
  const k = { world: { plane: p.m }, fog: undefined } as unknown as FieldCtx;
  for (const [x, y] of [
    [3, 4],
    [-9000, 12],
    [2e6, -2e6],
  ] as const) {
    assert.equal(seenRock(p.m, x, y), ROCK);
    assert.equal(seenCell(p.m, p.m.food, x, y), 0);
    assert.equal(seenCell(p.m, p.m.quality!, x, y), 1);
    assert.equal(seenCell(p.m, p.m.spoil!, x, y), 0);
    assert.deepEqual(
      (({ rock, food, spoil }) => [rock, food, spoil])(planeGround(k, x, y)),
      [ROCK, 0, 0],
      "planeGround: the layers' empty",
    );
  }
  assert.deepEqual(p.made, { rock: 0, food: 0, quality: 0, spoil: 0 });
  assert.equal(p.rock.get(3, 4), OPEN, "the game's own read makes the chunk, as it always did");
  assert.equal(p.made.rock, 1);
  assert.equal(seenRock(p.m, 3, 4), OPEN, "and the page then reads it as the game has it");
  assert.equal(seenCell(p.m, p.m.food, 3, 4), 0, "(food was not made: still the empty)");
  assert.equal(p.m.food.get(3, 4), 2);
  assert.equal(seenCell(p.m, p.m.food, 3, 4), 2);
});

/** A map whose layers log every method called on them, bounded or endless. */
function spied(endless: boolean) {
  const log: string[] = [];
  const layer = (name: string, empty: number, cell: (x: number, y: number) => number) =>
    ({
      empty,
      get: (x: number, y: number) => (log.push(`${name}.get(${x},${y})`), cell(x, y)),
      peek: (cx: number, cy: number) => (log.push(`${name}.peek(${cx},${cy})`), undefined),
      chunk: (cx: number, cy: number) => (log.push(`${name}.chunk(${cx},${cy})`), undefined),
    }) as unknown as ChunkLayer<Uint8Array>;
  const h = (x: number, y: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  const m = {
    ...(endless ? { endless: true } : {}),
    x0: 0,
    size: { w: 200, h: 120 },
    rock: layer("rock", ROCK, (x, y) => h(x, y) % 3),
    food: layer("food", 0, (x, y) => h(y, x) % 5),
    quality: layer("quality", 1, (x, y) => (h(x, x + y) % 4) / 4),
    spoil: layer("spoil", 0, (x, y) => h(x + y, y) % 7),
  } as unknown as WorldMap;
  return { m, log };
}

test("a bounded map's reads are the exact calls they were: same value, same layer call, in the box and out of it, over random cells", () => {
  const { m, log } = spied(false);
  let s = 1;
  const rnd = (n: number) => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) % n) - 20;
  for (let i = 0; i < 2000; i++) {
    const [x, y] = [rnd(260), rnd(180)];
    log.length = 0;
    const old = [rockAt(m, x, y), m.food.get(x, y), m.quality!.get(x, y), m.spoil!.get(x, y)];
    const oldLog = log.slice();
    log.length = 0;
    const now = [seenRock(m, x, y), seenCell(m, m.food, x, y), seenCell(m, m.quality!, x, y), seenCell(m, m.spoil!, x, y)];
    assert.deepEqual(now, old, `${x},${y}`);
    assert.deepEqual(log, oldLog, `the same calls at ${x},${y}`);
    assert.ok(
      log.every((l) => l.includes(".get(")),
      "only `get`: a bounded map is never peeked",
    );
  }
});

test("an endless map's page reads call only `peek`, never `get` or `chunk`, over random cells", () => {
  const { m, log } = spied(true);
  for (let i = 0; i < 500; i++) {
    const [x, y] = [((i * 7919) % 5000) - 2500, ((i * 104729) % 9000) - 4500];
    seenRock(m, x, y);
    seenCell(m, m.food, x, y);
    seenCell(m, m.quality!, x, y);
    seenCell(m, m.spoil!, x, y);
  }
  assert.equal(log.length, 2000);
  assert.ok(log.every((l) => l.includes(".peek(")));
});

test("planeGround on a bounded game is what it was: rockAt, food.get and spoil.get, cell by cell", async () => {
  const { buildGame } = await import("../useColony.ts");
  const g = buildGame({ species: "generic", seed: 3, antCount: 30, rival: false, generation: 0 });
  for (let t = 0; t < 60; t++) g.tick(1 / 30);
  const plane = g.world.plane;
  const k = { world: g.world, fog: undefined } as unknown as FieldCtx;
  let n = 0;
  for (let y = -3; y < plane.size.h + 3; y += 3)
    for (let x = plane.x0 - 3; x < plane.x0 + plane.size.w + 3; x += 3) {
      const p = planeGround(k, x, y);
      assert.deepEqual([p.rock, p.food, p.spoil], [rockAt(plane, x, y), plane.food.get(x, y), plane.spoil?.get(x, y) ?? 0], `${x},${y}`);
      n++;
    }
  assert.ok(n > 1000);
});
