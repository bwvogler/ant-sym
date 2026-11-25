import { test } from "node:test";
import assert from "node:assert/strict";
import { Evolution, canKeep, pathTo } from "../../evolution.ts";
import { cellKey, nx, ny } from "../../hex.ts";
import { algaAt, Lichen, LICHEN } from "../../lichen.ts";
import { generateWorld, ROCK, rockAt, type WorldMap } from "../../world.ts";

// A lichen partner (ja-vlla.11.3, PRD §90): films and wild lichens are a pure hash of the seed and the cell.

const rockCells = (map: WorldMap, n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = 0; y < map.size.h && out.length < n; y++)
    for (let x = map.x0; x < map.x0 + map.size.w && out.length < n; x++) if (rockAt(map, x, y) === ROCK) out.push([x, y]);
  return out;
};

test("algae lie only on rock, the same on every look, and are scarce", () => {
  const map = generateWorld(3);
  let film = 0,
    wild = 0,
    rock = 0;
  for (let y = 0; y < map.size.h; y++)
    for (let x = map.x0; x < map.x0 + map.size.w; x++) {
      const a = algaAt(map, x, y);
      assert.equal(a, algaAt(map, x, y));
      if (a) assert.equal(rockAt(map, x, y), ROCK, "an alga is on a rock cell");
      if (rockAt(map, x, y) === ROCK) rock++;
      if (a === "film") film++;
      if (a === "wild") wild++;
    }
  assert.ok(film > 0 && wild > 0, `films ${film}, wild ${wild}`);
  assert.ok((film + wild) / rock < 0.1, "algae are scarce on rock");
});

test("a hypha beside a film makes lichen of it, and a wild lichen is taken whole", () => {
  const map = generateWorld(3);
  let film: [number, number] | null = null;
  let wild: [number, number] | null = null;
  for (let y = 0; y < map.size.h; y++)
    for (let x = map.x0; x < map.x0 + map.size.w; x++) {
      const a = algaAt(map, x, y);
      if (a === "film" && !film) film = [x, y];
      if (a === "wild" && !wild) wild = [x, y];
    }
  const l = new Lichen();
  // a "hypha" on each of the film's six neighbours that is not rock stands for the contact
  const near = (c: [number, number]) => [
    cellKey(c[0] - 1, c[1]),
    cellKey(c[0] + 1, c[1]),
    cellKey(c[0], c[1] - 1),
    cellKey(c[0], c[1] + 1),
  ];
  const made = l.touch(map, near(film!), null, 7);
  assert.ok(made >= 1 && l.first === 7 && l.cells.has(cellKey(film![0], film![1])), "the film's rock cell is lichen");
  const w = new Lichen();
  w.touch(map, near(wild!), null, 1);
  assert.ok(w.cells.size >= 3, `a wild lichen is a disc, took ${w.cells.size}`);
});

test("the rim grows a cell from each lichen cell every LICHEN.every seconds, only over rock", () => {
  const map = generateWorld(3);
  const l = new Lichen();
  const [x, y] = rockCells(map, 1)[0] as [number, number];
  l.cells.add(cellKey(x, y));
  l.step(map, LICHEN.every - 1);
  assert.equal(l.cells.size, 1);
  l.step(map, 1);
  assert.ok(l.cells.size >= 1);
  const before = l.cells.size;
  for (let i = 0; i < 5; i++) l.step(map, LICHEN.every);
  assert.ok(l.cells.size > before);
  const back = Lichen.load(JSON.parse(JSON.stringify(l.save())));
  assert.deepEqual([...back.cells], [...l.cells]);
});

test("the lichen upgrade is the free pool's and comes only after a borer", () => {
  const e = new Evolution(0);
  assert.deepEqual(
    e.locked("lichen").map((n) => `${n.id} ${n.level}`),
    ["mycelium 1"],
    "not offered before Mycelium level 1 (a borer)",
  );
  assert.equal(canKeep({ mycelium: 0, lichen: 0 }, { ants: 99, free: 99 }, "lichen"), false);
  assert.deepEqual(pathTo({ mycelium: 0, lichen: 0 }, "lichen"), ["mycelium", "lichen"]);
  assert.equal(canKeep({ mycelium: 1, lichen: 0 }, { ants: 0, free: 99 }, "lichen"), true);
  assert.equal(canKeep({ mycelium: 1, lichen: 0 }, { ants: 99, free: 0 }, "lichen"), false, "paid from the free pool only");
});

const firstFilm = (map: WorldMap): [number, number] => {
  for (let y = 0; y < map.size.h; y++) for (let x = map.x0; x < map.x0 + map.size.w; x++) if (algaAt(map, x, y) === "film") return [x, y];
  throw new Error("no film on this map");
};
const beside = (map: WorldMap, [x, y]: [number, number]): number => {
  for (let d = 0; d < 6; d++) if (rockAt(map, nx(x, y, d), ny(y, d)) !== ROCK) return cellKey(nx(x, y, d), ny(y, d));
  throw new Error("a film has a non-rock neighbour");
};

test("a film within LICHEN.keepOut of the landing is not taken; one beyond it is", () => {
  const map = generateWorld(3);
  const film = firstFilm(map);
  const hypha = [beside(map, film)];
  const inside = new Lichen();
  assert.equal(inside.touch(map, hypha, [film[0] + LICHEN.keepOut - 1, film[1]], 1), 0, "inside the keep-out: none");
  const outside = new Lichen();
  assert.ok(outside.touch(map, hypha, [film[0] + LICHEN.keepOut, film[1]], 1) >= 1, "at the keep-out's edge: taken");
});

test("a fungus holds no more than LICHEN.cap lichen cells: contact and the rim add none past it", () => {
  const map = generateWorld(3);
  assert.ok(LICHEN.cap > 0 && LICHEN.cap <= 5000, "the cap is a bound on work, not a number to raise freely");
  const l = new Lichen();
  for (let i = 0; i < LICHEN.cap; i++) l.cells.add(cellKey(-1000 - i, -1000));
  assert.equal(l.touch(map, [beside(map, firstFilm(map))], null, 1), 0, "contact at the cap");
  const [x, y] = rockCells(map, 1)[0] as [number, number];
  l.cells.add(cellKey(x, y)); // already over: the rim must not grow it
  const before = l.cells.size;
  l.step(map, LICHEN.every * 3);
  assert.equal(l.cells.size, before, "the rim at the cap");
});
