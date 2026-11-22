// What a colony asks its policies about (docs/refactor.md S3.3, ja-fnd.4.12): a species' own situation for the mode lane (its schema and senses). Moved out of class Colony as functions over the colony, verbatim but for `this` becoming `col`; setSituation stays the colony's methods and call these.

import type { Colony } from "./colony.ts";
import { type Schema } from "./schema.ts";
import { SITUATIONS } from "./situation.ts";
import { MODES, type SpeciesSituation } from "./vocab.ts";

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
