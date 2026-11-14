// The aim field's keys (PRD §69.2): pure, so `node --test` covers them; AimBar applies them.

/**
 * What a key in the aim's field does: Enter (without Shift, and not confirming an input method's composition) or Escape
 * is "done" (the field blurs: Enter commits, Escape leaves the words as typed and gives the map the keys); anything else,
 * Shift+Enter's new line among it, is the field's.
 */
export function aimKey(key: string, shift: boolean, composing: boolean): "done" | "type" {
  if (key === "Escape") return "done";
  return key === "Enter" && !shift && !composing ? "done" : "type";
}
