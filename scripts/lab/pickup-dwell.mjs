// Observational only: consecutive ticks with food offers for one ant generation.
// No offer on a tick ends an episode; observation-end episodes are censored.
export class PickupDwell {
  active = new Map();
  episodes = [];
  observe(id, tick, cell, x, y, accepted) {
    let e = this.active.get(id);
    if (e && e.last < tick - 1) this.close(id, "gap");
    if (e && e.cell.split(":")[0] !== cell.split(":")[0])
      this.close(id, "layer-change");
    e = this.active.get(id);
    if (!e) {
      e = {
        id,
        first: tick,
        last: tick,
        ticks: 0,
        offers: 0,
        accepted: 0,
        cell,
        cells: new Set(),
        same: 0,
        maxSame: 0,
        transitions: 0,
        x,
        y,
        startX: x,
        startY: y,
        path: 0,
        radius: 0,
      };
      this.active.set(id, e);
    }
    e.offers++;
    e.accepted += Number(accepted);
    if (e.ticks && tick === e.last) return; // two call sites in one tick are not two ticks of dwell
    if (e.ticks) {
      const d = Math.hypot(x - e.x, y - e.y);
      e.path += d;
      if (cell !== e.cell) e.transitions++;
    }
    e.same = cell === e.cell ? e.same + 1 : 1;
    e.maxSame = Math.max(e.maxSame, e.same);
    e.cell = cell;
    e.cells.add(cell);
    e.x = x;
    e.y = y;
    e.radius = Math.max(e.radius, Math.hypot(x - e.startX, y - e.startY));
    e.last = tick;
    e.ticks++;
  }
  close(id, end) {
    const e = this.active.get(id);
    if (!e) return;
    const { cells, ...rest } = e;
    this.episodes.push({ ...rest, uniqueCells: cells.size, end });
    this.active.delete(id);
  }
  endTick(tick, reason = () => "no-offer") {
    for (const [id, e] of this.active)
      if (e.last < tick) this.close(id, reason(id));
  }
  finish() {
    for (const id of this.active.keys()) this.close(id, "observation-end");
    const quantiles = (values) => {
      const a = [...values].sort((a, b) => a - b);
      const at = (p) =>
        a.length
          ? a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)]
          : null;
      return { n: a.length, median: at(0.5), p95: at(0.95), max: at(1) };
    };
    const e = this.episodes,
      completed = e.filter((x) => x.end !== "observation-end");
    return {
      ants: new Set(e.map((x) => x.id)).size,
      episodes: e.length,
      ends: Object.fromEntries(
        [...new Set(e.map((x) => x.end))].map((end) => [
          end,
          e.filter((x) => x.end === end).length,
        ]),
      ),
      completedSeconds: quantiles(completed.map((x) => x.ticks / 30)),
      observedSeconds: quantiles(e.map((x) => x.ticks / 30)),
      sameCellSeconds: quantiles(e.map((x) => x.maxSame / 30)),
      multiCellEpisodes: e.filter((x) => x.uniqueCells > 1).length,
      // ≥1 world unit is a descriptive threshold, not a biological target.
      movingEpisodes: e.filter((x) => x.path >= 1).length,
      longest: [...e].sort((a, b) => b.ticks - a.ticks).slice(0, 10),
    };
  }
}
