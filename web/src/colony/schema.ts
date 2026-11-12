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
