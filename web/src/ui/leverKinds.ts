import type { LeverKind } from "../colony/index.ts";

// How a lever's kind looks and reads (ja-fnd.6.4.4, docs/refactor.md S5.4): the colour of its name, the words for its kind, and the colours of
// its chip on the Levers tab. Three places chose them for themselves (the ant card, the Policy tab, the Lab's levers), the same each time;
// here they are once, and `leverKinds.test.ts` holds that every kind has its row.

export interface LeverLook {
  /** the classes of a lever's name (its colour): what it perceives is the fungus's own spore colour, what it gives off the accent, the lethal ones the error's */
  nameClass: string;
  /** a row's label on the Levers tab */
  row: string;
  /** what the lever is, in a few words (the ant card's tooltip, the Policy tab's list) */
  what: string;
  /** a chip's colours while the lever is on the menu */
  chipOn: string;
}

export const LEVER_KIND: Record<LeverKind, LeverLook> = {
  perceive: { nameClass: "text-spore", row: "perceives", what: "what it perceives", chipOn: "border-accent bg-accent-soft text-accent" },
  emit: { nameClass: "text-accent", row: "gives off", what: "what it gives off", chipOn: "border-accent bg-accent-soft text-accent" },
  lethal: { nameClass: "text-err", row: "lethal", what: "lethal", chipOn: "border-err bg-err-soft text-err" },
};

/** The kinds in the order the Levers tab lists them. */
export const LEVER_KINDS = ["perceive", "emit", "lethal"] as const satisfies readonly LeverKind[];

/** A lever's name's classes: its kind's colour first, then the place's own (a font, a size, a frame). The only reader of `nameClass`: LeverName.tsx calls this. */
export const leverNameClass = (kind: LeverKind, more = ""): string => `${LEVER_KIND[kind].nameClass}${more ? ` ${more}` : ""}`;
