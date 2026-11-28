import { porterObservers } from "../../web/src/colony/porterObservation.ts";
import { CELL, cellKey, cellOf, hexDistance, keyX, keyY } from "../../web/src/colony/hex.ts";

export function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.ceil(fraction * sorted.length) - 1] ?? null;
  return { count: sorted.length, p50Seconds: at(0.5), p95Seconds: at(0.95) };
}

export function observePorterTrips(colony, onReversal, onVisit) {
  const active = new Map();
  const finished = [];
  const reversalCells = new Map();
  const byDestination = new Map();
  let started = 0;
  let interrupted = 0;
  let retargetEvents = 0;
  let alternateDeposits = 0;
  let steps = 0;
  let reversals = 0;

  function currentCell(ant) {
    cellOf(colony.x[ant], colony.y[ant]);
    return cellKey(CELL[0], CELL[1]);
  }
  porterObservers.set(colony, {
    start(ant, destination) {
      if (active.has(ant)) interrupted++;
      started++;
      const x = CELL[0];
      const y = CELL[1];
      const cell = currentCell(ant);
      CELL[0] = x;
      CELL[1] = y;
      const room = byDestination.get(destination) ?? { started: 0, completed: 0 };
      room.started++;
      byDestination.set(destination, room);
      active.set(ant, { at: colony.time, destination, target: destination, last: cell, prev: null });
    },
    deposit(ant, destination) {
      const trip = active.get(ant);
      if (!trip) return;
      if (trip.destination !== destination) alternateDeposits++;
      byDestination.get(trip.destination).completed++;
      finished.push(colony.time - trip.at);
      active.delete(ant);
    },
  });

  function sample() {
    for (const [ant, trip] of active) {
      if (!colony.alive[ant] || colony.layer[ant] !== colony.home || !colony.porter[ant] || !colony.carrying[ant]) {
        interrupted++;
        active.delete(ant);
        continue;
      }
      const target = colony.portTo[ant];
      if (trip.target !== target) retargetEvents++;
      trip.target = target;
      const cell = currentCell(ant);
      if (cell === trip.last) continue;
      onVisit?.(cell);
      const adjacent = hexDistance(keyX(cell), keyY(cell), keyX(trip.last), keyY(trip.last)) === 1;
      if (adjacent) {
        steps++;
        if (cell === trip.prev) {
          reversals++;
          reversalCells.set(trip.last, (reversalCells.get(trip.last) ?? 0) + 1);
          onReversal?.(trip.last, ant);
        }
      }
      trip.prev = adjacent ? trip.last : null;
      trip.last = cell;
    }
  }

  function checkpoint() {
    if (started !== finished.length + interrupted + active.size) throw Error("Porter trip accounting");
    const pending = [...active.values()];
    const destinations = new Map();
    for (const trip of pending) destinations.set(trip.target, (destinations.get(trip.target) ?? 0) + 1);
    const rooms = colony.layers[colony.home].map.chambers?.list;
    return {
      started,
      completed: finished.length,
      interrupted,
      outstanding: active.size,
      retargetEvents,
      alternateDeposits,
      pickupToDeposit: distribution(finished),
      outstandingAge: distribution(pending.map((trip) => colony.time - trip.at)),
      outstandingOver30s: pending.filter((trip) => colony.time - trip.at >= 30).length,
      tripsByFirstDestination: [...byDestination].map(([id, counts]) => ({
        id,
        role: rooms?.[id]?.role ?? null,
        ...counts,
      })),
      outstandingByDestination: [...destinations]
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ id, role: rooms?.[id]?.role ?? null, count })),
      sampledAdjacentMoves: steps,
      sampledReversals: reversals,
      busiestReversalCells: [...reversalCells]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([cell, count]) => ({ x: keyX(cell), y: keyY(cell), count })),
    };
  }
  return { sample, checkpoint };
}
