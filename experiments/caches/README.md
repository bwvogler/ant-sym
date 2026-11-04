# Jev answer caches kept for reproduction

`scripts/colony-live.mjs` writes caches to `experiments/out/`, which is gitignored. The ones the PRD's numbers rest on are copied here, so anyone can replay them offline, at no cost. `experiment.mjs --policy cache:` and `scripts/ablate.mjs` refuse a cache asked under brain versions or question contexts other than the code's, so each replays only at the commit noted.

| File | Asked | Versions (colony / stance / response) | Replays at | Used in |
|---|---|---|---|---|
| `mr2-forage.json` | 2026-11-03, behaviour MR 2 (#35), Forage, side view, seed 1, 600 + 600, 300 s, with a second round | 4 / 3 / 3 | c168ce2 (MR 3.1's first commit; any commit before the v5 legend) | PRD §43.6, the ja-5ty ablation (§44.1): `node scripts/ablate.mjs experiments/caches/mr2-forage.json --seconds 600 --seeds 1-10 --match "<group>"` |
| `mr3.1-forage.json`, `mr3.1-cautious.json`, `mr3.1-warlike.json` | 2026-11-03, MR 3.1 (#36), each doctrine, same game, with second rounds | 5 / 3 / 4 | e3021d1 (#36), and any later commit until a version bump | PRD §44.3: `npm run exp -- game twin regulate nestFlow --seeds 1-10 --policy cache:experiments/caches/mr3.1-forage.json` |

| `mr3-side-forage.json`, `mr3-side-cautious.json`, `mr3-side-warlike.json` | 2026-11-04, MR 3, each doctrine, side view, seed 1, 600 + 600, 300 s: lanes mode, trail, get, carry | 5 / 3 / 5 | MR 3's last commit, until a version bump | PRD §45.6: `npm run exp -- game --seeds 1-10 --policy cache:experiments/caches/mr3-side-forage.json` |
| `mr3-top-forage.json`, `mr3-top-cautious.json`, `mr3-top-warlike.json` | 2026-11-04, MR 3, each doctrine, top-down (`--top`), same game: the trail lane | 5 / 3 / 5 | as above | PRD §45.6: `npm run exp -- bridge twin richPoor deplete --seeds 1-10 --policy cache:experiments/caches/mr3-top-forage.json` |

The MR 3.1 caches no longer replay after MR 3: they were asked under response version 4.

`mr2-forage.json` is the ablation's "all of Jev's answers" input: the cache MR 2's live check wrote, which MR 3.1's live check later overwrote in `experiments/out/`.
