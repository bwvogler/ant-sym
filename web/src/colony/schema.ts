// A situation schema as data (docs/refactor.md S4.1): the fields of a question a lane asks, in order, each with the
// values it can take. The encoder, the decoder, the count, the cache key and the state Jev reads come from the one
// list, so a new species' lane declares its fields once instead of writing each of them again (they were written four
// times: colony.ts, colonyBrain.ts and the legend).

/** One field of S: its name, its values (few, so an answer can be cached per situation), and how its value reads in the cache key. */
export type FieldOf<S> = {
  [K in keyof S]: { readonly name: K; readonly values: readonly S[K][]; readonly key?: (v: S[K]) => string };
}[keyof S];

export interface Schema<S> {
  readonly fields: readonly FieldOf<S>[];
  /** how many situations there are: the product of the fields' value counts */
  readonly size: number;
  /** the step of each field in a situation's code, in field order: code = Σ index × stride; the last field's is 1 */
  readonly strides: readonly number[];
  /** a situation's index in 0 .. size − 1 (the first field is the most significant) */
  encode(s: S): number;
  /** the situation at an index: the inverse of encode */
  decode(code: number): S;
  /** the cache key: the fields' values in order, joined by "|" */
  key(s: S): string;
  /** what a situation looks like in the request to Jev: just the schema's fields, in order */
  state(s: S): S;
}

export function defineSchema<S extends object>(fields: readonly FieldOf<S>[]): Schema<S> {
  const strides: number[] = [];
  let size = 1;
  for (let i = fields.length - 1; i >= 0; i--) {
    strides[i] = size;
    size *= (fields[i] as FieldOf<S>).values.length;
  }
  // The field table is heterogeneous (each field has its own value type), so reads of one go through `unknown`.
  const read = (s: S, f: FieldOf<S>): unknown => (s as Record<PropertyKey, unknown>)[f.name];
  return {
    fields,
    size,
    strides,
    encode(s) {
      let code = 0;
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i] as FieldOf<S>;
        code += (f.values as readonly unknown[]).indexOf(read(s, f)) * (strides[i] as number);
      }
      return code;
    },
    decode(code) {
      const s: Record<PropertyKey, unknown> = {};
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i] as FieldOf<S>;
        s[f.name] = f.values[Math.floor(code / (strides[i] as number)) % f.values.length];
      }
      return s as S;
    },
    key(s) {
      return fields
        .map((f) => {
          const v = read(s, f);
          return f.key ? (f.key as (v: unknown) => string)(v) : String(v);
        })
        .join("|");
    },
    state(s) {
      const out: Record<PropertyKey, unknown> = {};
      for (const f of fields) out[f.name] = read(s, f);
      return out as S;
    },
  };
}

/**
 * The words a legend uses for a schema's fields, in the order the prose reads them: an intro, one passage per field (an empty
 * one for a field another passage already covers), an outro. Every field must have a passage and none may repeat, so a field
 * added to a schema without its words fails when the module loads, not when Jev answers oddly. The result is the legend
 * Jev reads, byte for byte (a change to it is a change to every cached answer's context: see colonyBrain.policyContext).
 */
export function legendOf<S extends object>(
  schema: Schema<S>,
  parts: { intro: string; fields: readonly (readonly [keyof S, string])[]; outro?: string },
): string {
  const names = schema.fields.map((f) => String(f.name));
  const given = parts.fields.map(([n]) => String(n));
  for (const n of names) if (!given.includes(n)) throw new Error(`legend: no words for the field "${n}"`);
  for (const n of given) if (!names.includes(n)) throw new Error(`legend: words for "${n}", which is not a field`);
  if (new Set(given).size !== given.length) throw new Error("legend: a field has words twice");
  // A passage opens with its own field's name (the legends read "mode is …", "tired means …"), so words can't sit under the wrong field.
  for (const [n, text] of parts.fields)
    if (text !== "" && !text.startsWith(String(n))) throw new Error(`legend: the words for "${String(n)}" should begin with its name`);
  return parts.intro + parts.fields.map(([, text]) => text).join("") + (parts.outro ?? "");
}
