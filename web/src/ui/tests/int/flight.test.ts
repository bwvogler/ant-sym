import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, gameRng, generateOneWorld, MAX_COLONIES, NO_ROOM, type Flight } from "../../../colony/index.ts";
import { foundOnMothers, foundOnWords, lostNotice, type Words } from "../../flight.ts";
import { colonyName } from "../../names.ts";
import type { DoctrineChoice } from "../../useColonyJev.ts";

// A new queen's founding on the page, without React (ja-fnd.6.2): ui/flight.ts over a real one-world game.

const game = (seed = 1): Game => new Game(generateOneWorld(seed), { regrow: 0 }, gameRng(seed), [{ antCount: 8 }, { antCount: 8 }]);

/** A flight from colony `mother`, pending (as Colony.flown gives one). */
function fly(g: Game, mother: number): Flight {
  const m = g.colonies[mother]!;
  const f: Flight = { mother, x: m.nest.x, y: m.nest.y, load: 0, strain: 0, at: g.time, food: 2 };
  g.flights.push(f);
  return f;
}

function words(): Words & { calls: [number, DoctrineChoice][] } {
  const calls: [number, DoctrineChoice][] = [];
  return { calls, foundWith: (k, d) => calls.push([k, d]) };
}

const MINE: DoctrineChoice = { id: "custom", text: "dig deep" };
const DOCTRINES: DoctrineChoice[] = [
  { id: "a", text: "first" },
  { id: "b", text: "second" },
];

test("founding on the player's words: the colony gets them, the page says so, and play resumes once no queen is in the air", () => {
  const g = game();
  const w = words();
  const f = fly(g, 1);
  const r = foundOnWords(g, w, f, MINE, g.landing(1));
  assert.equal(r.k, 2);
  assert.deepEqual(w.calls, [[2, MINE]]);
  assert.deepEqual(r.notice, { text: `${colonyName(2)} is founded, on your words.`, tone: "good" });
  assert.equal(r.resume, true);
});

test("the pen shut: she founds on her mother's words (or the first colony's), with the gate's reason; play waits while another flies", () => {
  const g = game();
  const w = words();
  const f = fly(g, 1);
  fly(g, 1); // another queen still in the air (from the same mother: below, her words are missing)
  const r = foundOnMothers(g, w, DOCTRINES, f, "No pen: why.");
  assert.equal(r.k, 2);
  assert.deepEqual(w.calls, [[2, DOCTRINES[1]]]);
  assert.deepEqual(r.notice, { text: `No pen: why. Her colony is ${colonyName(2)}.`, tone: "info" });
  assert.equal(r.resume, false, "a queen is still in the air");
  const r2 = foundOnMothers(g, w, [DOCTRINES[0]!], g.flights[0]!, "No pen.");
  assert.deepEqual(w.calls[1], [3, DOCTRINES[0]], "a mother with no words of her own: the first colony's");
  assert.equal(r2.resume, true);
});

test("a lost queen: the game's reason, no words set, and the notice warns", () => {
  const g = game();
  const w = words();
  const f = fly(g, 0);
  const r = foundOnWords(g, w, f, MINE, { x: -5000, y: -5000 });
  assert.equal(r.k, -1);
  assert.deepEqual(w.calls, []);
  assert.deepEqual(r.notice, { text: `A new queen from ${colonyName(0)} was lost: ${NO_ROOM}.`, tone: "warn" });
  assert.equal(r.resume, true);
});

test("the lost notice: a full map says so first; with no reason kept, no room to land", () => {
  const g = game();
  const f = fly(g, 0);
  assert.equal(lostNotice(g, f).text, `A new queen from ${colonyName(0)} found no room to land, and was lost.`);
  const full = { colonies: { length: MAX_COLONIES }, lastLoss: null } as unknown as Game;
  assert.equal(
    lostNotice(full, f).text,
    `A new queen from ${colonyName(0)} flew, but the map already holds ${MAX_COLONIES} colonies: she was lost.`,
  );
});

test("the pen shut and the queen lost: no words set, the loss notice (review of #241, S2)", () => {
  const g = game();
  const w = words();
  const f = fly(g, 0);
  g.flights.length = 0; // no longer pending: game.found gives -1
  const r = foundOnMothers(g, w, DOCTRINES, f, "No pen.");
  assert.equal(r.k, -1);
  assert.deepEqual(w.calls, []);
  assert.equal(r.notice?.tone, "warn");
});
