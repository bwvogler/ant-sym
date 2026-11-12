# colony/ (pure TypeScript, no DOM)

- To see what a game does (why an ant changed mode, who died of what, what a colony's stance did), watch it with the journal instead of adding a `console.log` here: `npm run exp -- game --seeds 1 --log detail`, or `?log=detail` on the page. The `watching-a-game` skill has the spec and recipes.
- A change that shouldn't alter behaviour keeps the golden masters bit-exact; the journal and probes only read the game (the `journal.ts` header says why).
