# The mutation tree: upgrades that need others first, at one rising price

*Design note for epic `ja-52ui`, PRD §78. Written 2026-11-15. Pure game design: the owner chose (2026-11-15) to build the tree for play, with no research step, so every edge below is **design** and none is a claim about real organisms.*

Today the fungus has 14 upgrades with 26 levels to buy (`web/src/colony/evolution.ts`, `UPGRADES`). None needs another. Each level has its own hand-set price, from 2–10 for a first level to 2,000–6,000 for the strongest (PRD §50.13), so the price does all the pacing and the choice is mostly "what is cheapest now". This note turns the menu into a tree and replaces the price list with one price.

## The price

- **One price for every level, rising with each level kept** (owner, 2026-11-15): `PRICE(n) = round(BASE · RATIO^n)`, `n` the number of levels kept so far.
- First guess BASE 3, RATIO 1.38: the first level costs 3, the tenth about 75, the twentieth about 1,900, and all 26 about 34,000 together, today's total. Tuned against pacing and P1 (below).
- What it changes: a first level of the strongest upgrade no longer costs thousands just for what it is; it costs whatever the next level costs. The tree's depth carries the pacing the price list carried: a strong level is late because what it needs comes first.

**In the game:** the panel shows one "next level" price for everything buyable; keeping any level raises it for all.

## The tree

Within one upgrade, levels still go in order. A level not listed below needs only the level before it in its own upgrade.

**Roots** (buyable from landing): Infectivity·fair, Persistence·clears slowly, Mycelium·a borer, Fruiting·thick, Stealth·dim, Recognition·one step, Trails·one step. Seven roots, so the first choice is a real one.

| Level | Needs | Why (design) |
|---|---|---|
| Infectivity·strong | Persistence·clears slowly | passing on more pays once a host keeps the fungus a while |
| Immune evasion·some | Persistence·clears slowly | the host branch deepens from staying in a host |
| Immune evasion·most | Persistence·never clears | |
| Infectivity·virulent | Immune evasion·some | the top of infectivity waits on the body branch |
| Knots·a few | Mycelium·a borer | knots form along a mycelium that spreads into the soil |
| Knots·many | Mycelium·a web | |
| Stalks·a stalk | Fruiting·thick | a stalk spreads spores, worth little before there are many |
| Stalks·a tall stalk | Fruiting·dense | |
| Senses·the full range | Recognition·one step, Trails·one step | the wide senses lever after a first step on both odour branches |
| Stealth·hidden | Fruiting·thick | a choice between spreading and hiding comes early, then joins |
| Royal·one step | Recognition·the full range | the queen's levers sit at the end of the odour branches |
| Royal·the full range | Trails·the full range | |
| Odour weapon | Infectivity·strong | the lethal levers come late |
| Crown | Royal·the full range, Odour weapon | the last level in the game |

The lethal levers still need the menu as well, as today (`idle`, `ColonyApp.tsx`). Mycelium's level 1 is labelled "a borer", as the owner renamed it (2026-11-12).

**In the game:** `Upgrade.needs` (one list of `{id, level}` per level) replaces `Upgrade.costs`; `locked(id)` names what is missing, and `buy` refuses a locked level. A guard at load checks every need names a real level, that there is no cycle, and that every level can be reached from a root. Per-level effects (`KNOT`, `STALK`, `TIP_STEP`, the Mycelium checks) do not change.

## Play

- **See:** the Mutations drawer draws the tree: branches as columns (body, mycelium, reach, lethal), each upgrade a column of its levels joined to what they need. A locked level is dim and says "needs Persistence: clears slowly"; the next level that can be kept shows the one price. At phone width it falls back to today's list with the lock text where the button was.
- **Choose:** a path, not the cheapest item. Every buy raises the price of everything else, so a branch you open early costs the others.
- **Progression:** seven cheap roots keep the weak start and a first choice within seconds of landing; the deep levels (virulent, most evasion, the queen's levers, the lethal ones) come late because of depth and price together.
- **Cost:** none. No Jev question, legend or cache key reads upgrade levels; reach is applied after the answer.
- **Risks, and how we would notice:** a dead branch nobody buys (the progression script's buy log); a cliff where the price outruns the mutation rate (the "kept by 20 minutes" count, §50.13's aim of about half); a P1 miss because the old cheap first levels of strong upgrades are now gated (P1, §63.4, seeds 1–20); the "something to keep" badge pointing at a locked level (it counts only unlocked, affordable, on-menu levels).

## Open questions

- The edges: the owner edits the table before code.
- BASE and RATIO: chosen from the pacing and P1 runs.
- Whether a level may need either of two others (an "or") rather than both. Not in this draft.

## Sources

Design, not research; the repo's own decisions it builds on:
- PRD §50.12–50.16 (the fungus's body, mutations and the lethal upgrades): [docs/PRD.md](https://github.com/bwvogler/ant-sym/blob/main/docs/PRD.md)
- The upgrade table today: [web/src/colony/evolution.ts](https://github.com/bwvogler/ant-sym/blob/main/web/src/colony/evolution.ts)
