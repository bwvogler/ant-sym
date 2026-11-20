# Map food and aphid glyphs

| Atlas | Dimensions | Source frame | Stride | World frame |
| --- | --- | --- | --- | --- |
| `resource-tiny.png` | 56 × 8 | 6 × 6 | 8 | 0.5 units |
| `resource-near.png` | 112 × 16 | 14 × 14 | 16 | 0.5 units |

Both files have seven columns: ordinary food, sweet food, crumbs, and an aphid facing right/down/left/up. Each frame has one transparent pixel of padding. Runtime sampling is nearest neighbour. Editable geometry and regeneration scripts live at `art/resources/` in the repository root.

The world records food quality, not an ingredient identity. The three classes retain the existing thresholds: quality below 0.99 is crumb-coloured; above 1.01 is sweet-coloured; otherwise ordinary green. Sugar and honeydew share the sweet appearance. Carried food uses the ant's recorded quality and the same world scale as ground food.

For positive food amounts, one to five fixed-size marks communicate compressed abundance: `ceil(log2(1 + amount))`, clamped to 1…5. This is neither a count of pieces nor a five-unit cell cap. Fractional amounts fade. Food depleted to zero draws no marks. At hex zoom on either surface or underground maps the sprites replace the full-cell food wash, allowing the existing sensed trails underneath to remain visible. Distant, minimap, and image-loading-failure paths retain their existing food representation.

Aphids retain the previous clump convention: glyph count is `round(aphidCount / cells / 2)` clamped to 1…4, and alpha is `min(1, 0.35 + aphidCount / cells / 4)`. The world models aggregate clumps, not individually positioned aphids. Glyphs therefore indicate clump density, not literal per-cell population. No clump capacity or population rule changed. Cell and mark index choose a stable heading; the glyphs do not invent motion. The existing distant dots and crash fade remain.

Both resources use the tiny atlas at 12 CSS px/hex and the near atlas from 14 CSS px/hex, matching the worker LOD. The game's zoom limits and all simulation fields are unchanged. The live regular map has been checked in Chromium at desktop, iPad, and phone CSS viewport sizes. That layout check does not emulate physical touch or Safari, and is not a browser frame-rate benchmark. Native Canvas checks use the same drawing helpers as the live renderer.
