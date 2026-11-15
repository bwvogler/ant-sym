// Each ant's own stance (docs/stance.md): the half-lives of its foes, threat and crowd. Part of the colony's tuning constants (docs/refactor.md S3.5, ja-fnd.4.5),
// re-exported by ../tuning.ts; moved verbatim from it, comments and values unchanged.

/** half-life (s) of a scout's count of seconds in contact with strangers (behaviour MR 5.2) */
export const FOES_HALF = 20;

/** half-life (s) of an ant's threat (docs/stance.md: the fading internal state behind a defender's threshold) */
export const THREAT_HALF = 20;

/** half-life (s) over which a waiting ant feels how crowded home is (docs/stance.md) */
export const CROWD_HALF = 5;
