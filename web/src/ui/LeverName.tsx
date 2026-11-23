import type { HTMLAttributes } from "react";
import type { LeverKind } from "../colony/index.ts";
import { LEVER_KIND } from "./leverKinds.ts";

// A lever's name, in the colour of its kind (ja-fnd.6.4.6): what it perceives is the fungus's spore colour, what it gives off the accent, the
// lethal ones the error's. The one way to write it: a place that has a lever's name hands this its `kind`, never a colour, and never a flag
// derived from the kind (that is how the upgrade tooltip came to colour perceive levers its own way). `leverKinds.test.ts` holds that the tone
// is read here and nowhere else.

export default function LeverName({ kind, className = "", children, ...rest }: { kind: LeverKind } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`${LEVER_KIND[kind].tone}${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </span>
  );
}
