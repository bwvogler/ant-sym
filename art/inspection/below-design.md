# Below inspection: proposed visual direction

Status: visual design proposal. The current below-labelled inspection still reuses the surface diorama and is a placeholder; this document does not mark the underground artwork as complete.

The game's curtain is a vertical two-dimensional sheet under the surface transect, rather than a second horizontal map. Underground inspection should therefore show a vertical soil cutaway, with a little oblique depth for the voxel finish. It should not show an exposed soil platform viewed from above.

## Framing and scale

Frame the selected hex and its six neighbours at one fixed world scale. Keep the selected cell identifiable and include neighbours as context: tunnels and chamber walls often cannot be understood from one cell alone. Neighbouring open cells form connected empty space; they are not seven separate bowls. A larger chamber extends beyond the framing. Use a fixed cutaway orientation that agrees with the below map's horizontal column and downward depth axes.

Soil occupies solid cells; excavated cells are voids. Show wall and floor surfaces only where the actual neighbouring terrain provides them. Rock remains visually distinct from diggable soil. The added front-to-back thickness is illustrative, since the simulation does not model a volumetric tunnel network. Do not invent tunnels going into the screen, roots, plants, support beams, or separate chamber rooms.

Retain the existing ant, food, and brood world proportions. An ant-hole-sized hex remains the spatial unit; do not enlarge the cell to fit occupants. Workers retain their continuous coordinates and heading in the vertical sheet. All selected-cell workers are included, with no packing or capacity cap. If neighbouring occupants are shown, distinguish them from the exact selected-cell count.

## Three art studies before implementation

| Study | Terrain relationship to show | Contents |
| --- | --- | --- |
| Narrow passage | A connected open run between solid soil cells, with a clear one-cell width | Worker orientation and carried soil/brood |
| Chamber floor | Several connected open cells above actual solid floor neighbours | Queen, worker, and grouped brood; any chamber-wide stores identified as chamber-wide |
| Digging face | Open passage meeting undug soil or rock | Clear distinction between excavated space, diggable face, and solid rock |

These are calibration studies, not screenshots or claims about a recorded cell. Approve the cutaway direction before replacing the below inspection's placeholder artwork.

## State fidelity

The live reader must provide selected and neighbouring terrain from the curtain itself, including negative columns. Surface-strip cells are a special projection of the plane: the curtain stores them as AIR, so they must not silently become tunnels. A below inspection at that strip needs an explicit surface-transition treatment or a clearly limited presentation.

Brood and fallen workers have cell positions only: grouped floor icons and exact counts remain appropriate. Held items follow their carriers and are excluded from floor counts. Queens use their recorded home-layer positions. Actual fungal connections follow the below layer's mycelium graph. Trail and spore visibility continue to use the existing lens rules. Chamber roles and stores have chamber scope, rather than an invented per-cell distribution.

This is an inspection-view design. The existing below-map renderer and all simulation rules remain unchanged.
