// Observational bookkeeping for a single map's loose food. No food-unit identities.
export function observeLooseFood(field, now) {
  const sum = () => {
    let n = 0;
    field.forEach((_x, _y, cells) => {
      for (const v of cells) n += v;
    });
    return n;
  };
  const initial = sum();
  let ground = initial,
    added = 0,
    removed = 0,
    pickups = 0,
    pickupsAtAddedSites = 0;
  let repeatedSitePickups = 0,
    maxPickupsAtSite = 0,
    peakGround = initial,
    groundSeconds = 0,
    lastAt = now();
  let addedBacklog = 0,
    peakAddedBacklog = 0,
    addedBacklogSeconds = 0,
    collectedAdded = 0,
    additionsMixingInitialFood = 0;
  const credits = new Map();
  let pending = null;
  const addedSites = new Set(),
    pickupCounts = new Map();
  const integrate = () => {
    const at = now();
    if (at < lastAt) throw Error("food ledger clock moved backwards");
    groundSeconds += ground * (at - lastAt);
    addedBacklogSeconds += addedBacklog * (at - lastAt);
    lastAt = at;
  };
  const original = field.set;
  field.set = function (x, y, value) {
    const before = field.get(x, y),
      key = `${x},${y}`,
      expected = pending;
    pending = null;
    const result = original.call(this, x, y, value);
    const delta = field.get(x, y) - before;
    integrate();
    ground += delta;
    peakGround = Math.max(peakGround, ground);
    if (delta > 0) {
      added += delta;
      if (before > (credits.get(key) ?? 0)) additionsMixingInitialFood++;
      credits.set(key, (credits.get(key) ?? 0) + delta);
      addedBacklog += delta;
      peakAddedBacklog = Math.max(peakAddedBacklog, addedBacklog);
      addedSites.add(key);
    }
    if (delta < 0) {
      removed -= delta;
      // Accounting convention: remove new deposits before any initial food in a mixed cell.
      const credited = Math.min(credits.get(key) ?? 0, -delta);
      credits.set(key, (credits.get(key) ?? 0) - credited);
      addedBacklog -= credited;
      if (expected === key) {
        pickups -= delta;
        collectedAdded += credited;
        if (addedSites.has(key)) pickupsAtAddedSites -= delta;
        const count = (pickupCounts.get(key) ?? 0) + 1;
        pickupCounts.set(key, count);
        if (count > 1) repeatedSitePickups++;
        maxPickupsAtSite = Math.max(maxPickupsAtSite, count);
      }
    }
    return result;
  };
  return {
    expectPickup(x, y) {
      pending = `${x},${y}`;
    },
    clearPickup() {
      pending = null;
    },
    snapshot() {
      integrate();
      const actual = sum();
      if (Math.abs(actual - ground) > 1e-6 || Math.abs(initial + added - removed - ground) > 1e-6)
        throw Error("loose food ledger does not balance");
      return {
        addedBacklog,
        peakAddedBacklog,
        addedBacklogSeconds,
        collectedAdded,
        additionsMixingInitialFood,
        initial,
        ground,
        added,
        removed,
        pickups,
        pickupsAtAddedSites,
        repeatedSitePickups,
        maxPickupsAtSite,
        peakGround,
        groundSeconds,
        pickupSites: pickupCounts.size,
      };
    },
  };
}
