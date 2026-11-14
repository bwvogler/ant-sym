// What a colony asks its policies about (docs/refactor.md S3.3, ja-fnd.4.12): a species' own situation for the mode lane (its schema and senses), and the strategist's view of the colony for the stance lane. Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `col`; setSituation and stanceSituation stay the colony's methods and call these.

import type { Colony } from "./colony.ts";
import { type Schema } from "./schema.ts";
import { SITUATIONS } from "./situation.ts";
import { INTAKE_NONE, INTAKE_PLENTY, INTAKE_WINDOW } from "./tuning.ts";
import { MODES, type SpeciesSituation, type StanceSituation } from "./vocab.ts";

/**
 * Ask the mode policy about the species' own situation (ja-fnd.5.10): `schema` names the fields its key and its question hold, `sense` adds the
 * fields of its own (it must read, not draw from the game's random stream, so the game plays on as before). Null: the generic situation. The
 * schema keeps the mode field with every mode (the tick reads a situation's mode off its code), and stays small enough for the ants' question codes.
 */
export function speciesSituation(
  col: Colony,
  own: { schema: Schema<SpeciesSituation>; sense?: (c: Colony, i: number) => Readonly<Record<string, unknown>> } | null,
): void {
  if (!own) {
    col.own = null;
    col.seen = new Uint8Array(SITUATIONS);
    return;
  }
  const at = own.schema.fields.findIndex((f) => f.name === "mode");
  const values = at < 0 ? [] : (own.schema.fields[at]!.values as readonly unknown[]);
  if (at < 0 || values.length !== MODES.length || MODES.some((m, k) => values[k] !== m))
    throw new Error("setSituation: a species' schema keeps the mode field, with every mode in order");
  if (own.schema.size > 0x7fff) throw new Error(`setSituation: ${own.schema.size} situations; an ant's question code holds at most 32,767`);
  const allowed = new Map(own.schema.fields.map((f) => [String(f.name), f.values as readonly unknown[]] as const));
  col.own = { schema: own.schema, sense: own.sense ?? null, modeStride: own.schema.strides[at]!, allowed };
  col.seen = new Uint8Array(own.schema.size);
}

/** The strategist's view of this colony. `enemyNearNest` comes from the game, which sees both colonies. */
export function stanceView(col: Colony, enemyNearNest: boolean): StanceSituation {
  const pop = col.population / col.params.maxAnts;
  const intake = col.intakeRate / Math.max(1, col.population);
  return {
    stance: col.stance,
    ants: pop < 0.4 ? "few" : pop < 0.8 ? "some" : "many",
    losses: col.recentLosses < 1 ? "none" : col.recentLosses < 10 ? "some" : "heavy",
    enemyNearNest,
    // Until it has watched a whole window the colony can't tell: "some".
    intake: col.time < INTAKE_WINDOW ? "some" : intake < INTAKE_NONE ? "none" : intake >= INTAKE_PLENTY ? "plenty" : "some",
    larder: col.spare() >= 2 * col.params.foodPerAnt ? "full" : "low",
  };
}
