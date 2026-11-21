# Desert ants and Jev action policies

Desert ants have a species-specific Jev mode schema, while the action hooks use the shared `Touch` situation. The page currently enables its Jev action lanes only when the mode lane lacks a custom schema. As a result, desert ants use their local responses for every action. The engine already calls these same action hooks for all species.

## Scope for the follow-up PR

1. Make Jev action support an explicit choice per species and hook in `species.ts` and `colonyJev.ts`. Keep the desert mode schema and mode cache intact. Preserve the current hook set for generic and invasive garden ants.
2. Enable desert `contact` first. Reuse the shared contact action executor and directed combat. Give the desert contact prompt its own description of sensed cues and fallback behavior. Keep its cache context distinct from other species and from earlier prompt versions.
3. Extend the same mechanism to `get`, `carry`, `drop`, and `leave`, after verifying each hook's inputs and executable choices. For `leave`, represent desert invitation signals and supported departures. Keep food-trail choices out of the desert action set while its descriptor lacks those channels. Preserve its floor marks and heat behavior.
4. Keep fallback at the original species response. Without a usable Jev contact answer, an empty-jawed desert worker fights a stranger and a worker with a load retreats. Without a usable departure answer, the existing invitation behavior applies. Jev answers choose actions from the ant's sensed situation. Fungal recognition and calming continue through the shared simulation.

## Acceptance checks

- The desert mode lane and its cached entries still work. A desert contact answer cannot leak into another species' cache, and the shared species retain their current action lanes.
- In a controlled encounter, a seeded desert Jev contact answer can make an empty-jawed worker retreat. With an empty cache or while an answer is pending, the same situation uses the desert fallback.
- Exercise a carrying worker and the invitation-driven departure decision. Verify unsupported food-trail or raid actions are never requested for desert ants, and invalid answers fall back.
- Replay matched seeds with empty action caches and compare existing desert foraging, contact, and departure behavior. Run type checking and the species, Jev, and directed-combat tests.

Keep the implementation in a follow-up PR to #281. The first behavior change to verify is the contact override. Extend the other hooks only once their desert cues and action choices are represented correctly.
