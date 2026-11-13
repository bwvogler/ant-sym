// Extract a run of top-level statements of tick()'s per-ant loop into a stage function (docs/refactor.md S3.4).
// From the repo root: node scripts/lab/tick-stage.mjs <firstLine> <lastLine> <name> <file.ts> "<header comment>" [--write]
// (lines of web/src/colony/colony.ts; without --write it prints what crosses and changes nothing). Imports of the new file
// and the call's import in colony.ts are left to add by hand (tsc names them).
// Locals crossing the boundary are copied into the per-ant AntStep record (step.ts) before the call and back after it:
// the code moves verbatim (but `this` -> col), so the RNG draw order is unchanged.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ts = createRequire(ROOT + "web/package.json")("typescript");
const [a0, b0, name, file, header, ...flags] = process.argv.slice(2);
const write = flags.includes("--write");
const A = Number(a0),
  B = Number(b0);
const dir = ROOT + "web/src/colony";
const srcPath = dir + "/colony.ts";
const program = ts.createProgram([srcPath], {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  noEmit: true,
  strict: true,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();
const sf = program.getSourceFile(srcPath);
const text = sf.text;
const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const cls = sf.statements.find((s) => ts.isClassDeclaration(s) && s.name?.text === "Colony");
const tick = cls.members.find((m) => ts.isMethodDeclaration(m) && m.name.getText() === "tick");
const loop = tick.body.statements.find((s) => ts.isForStatement(s) && s.initializer?.getText().startsWith("let i = 0"));
const body = loop.statement.statements;
const seg = body.filter((s) => line(s.getStart()) >= A && line(s.getStart()) <= B);
if (!seg.length) throw new Error("no statements in range");
const i0 = body.indexOf(seg[0]);
const i1 = body.indexOf(seg[seg.length - 1]);
if (i1 - i0 + 1 !== seg.length) throw new Error("not contiguous");
const segStart = seg[0].getFullStart();
const segEnd = seg[seg.length - 1].getEnd();
const inSeg = (n) => n.getStart() >= segStart && n.getEnd() <= segEnd;
const loopVar = loop.initializer.declarations[0].symbol ?? checker.getSymbolAtLocation(loop.initializer.declarations[0].name);
const dtSym = checker.getSymbolAtLocation(tick.parameters[0].name);

// Locals of tick: declared at tick's top level or the loop body's top level (crossing can only be those).
const topDecl = new Map(); // symbol -> { level: 'tick'|'ant', decl }
const addDecls = (stmts, level) => {
  for (const s of stmts) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      const visit = (n) => {
        if (ts.isIdentifier(n)) topDecl.set(checker.getSymbolAtLocation(n), { level, decl: d, stmt: s, id: n });
        else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n))
          n.elements.forEach((e) => !ts.isOmittedExpression(e) && visit(e.name));
      };
      visit(d.name);
    }
  }
};
addDecls(tick.body.statements, "tick");
addDecls(body, "ant");

const isWrite = (id) => {
  let n = id;
  let p = n.parent;
  if (ts.isShorthandPropertyAssignment(p)) {
    n = p;
    p = p.parent;
  }
  if (ts.isPropertyAssignment(p) && p.initializer === n) {
    n = p;
    p = p.parent;
  }
  while (ts.isObjectLiteralExpression(p) || ts.isArrayLiteralExpression(p) || ts.isParenthesizedExpression(p)) {
    n = p;
    p = p.parent;
  }
  if (
    ts.isBinaryExpression(p) &&
    p.left === n &&
    p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    p.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  )
    return true;
  if (
    (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) &&
    (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)
  )
    return true;
  return false;
};
// Every reference to each tick local.
const refs = new Map(); // symbol -> [{id, inSeg, write, afterSeg}]
const walk = (n) => {
  if (ts.isIdentifier(n)) {
    const p = n.parent;
    const isName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n);
    let sym = isName
      ? null
      : ts.isShorthandPropertyAssignment(p)
        ? checker.getShorthandAssignmentValueSymbol(p)
        : checker.getSymbolAtLocation(n);
    if (sym && (topDecl.has(sym) || sym === dtSym) && sym !== loopVar) {
      if (!refs.has(sym)) refs.set(sym, []);
      refs
        .get(sym)
        .push({ id: n, inSeg: inSeg(n), write: isWrite(n), after: n.getStart() >= segEnd && n.getStart() < loop.statement.getEnd() });
    }
  }
  ts.forEachChild(n, walk);
};
walk(tick.body);
const inputs = []; // declared outside, used inside
const outputs = []; // declared inside (ant level), used after in the loop body
for (const [sym, list] of refs) {
  const d = topDecl.get(sym);
  const declIn = d && inSeg(d.id);
  const usedIn = list.some((r) => r.inSeg);
  if (!declIn && usedIn) inputs.push({ sym, name: sym.name, written: list.some((r) => r.inSeg && r.write), level: d?.level ?? "param" });
  if (declIn && list.some((r) => !r.inSeg && r.after))
    outputs.push({ sym, name: sym.name, reassignedAfter: list.some((r) => !r.inSeg && r.write) });
}
const typeOf = (sym) => {
  const decl = sym.valueDeclaration ?? sym.declarations[0];
  let t = checker.getTypeOfSymbolAtLocation(sym, decl);
  t = checker.getBaseTypeOfLiteralType(t);
  return checker.typeToString(t, decl, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope);
};
// The stage body: the segment's text with `this` -> col, and `continue` (of the ant loop) -> copy out, return true.
const edits = [];
const writtenIn = inputs.filter((v) => v.written);
const copyOut = (vars) => vars.map((v) => `s.${v.name} = ${v.name};`).join(" ");
let hasContinue = false;
const visitSeg = (n, inLoop) => {
  if (n.kind === ts.SyntaxKind.ThisKeyword) edits.push({ pos: n.getStart(), end: n.getEnd(), text: "col" });
  if (ts.isContinueStatement(n) && !inLoop && !n.label) {
    hasContinue = true;
    const out = copyOut(writtenIn);
    edits.push({ pos: n.getStart(), end: n.getEnd(), text: out ? `{ ${out} return true; }` : "return true;" });
  }
  if (ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) throw new Error("function expression in segment");
  if (ts.isBreakStatement(n) && !inLoop && !n.label) throw new Error("break of the ant loop in segment");
  if (ts.isReturnStatement(n)) throw new Error("return in segment");
  const loopish = ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n);
  ts.forEachChild(n, (c) => visitSeg(c, inLoop || loopish || ts.isSwitchStatement(n)));
};
seg.forEach((s) => visitSeg(s, false));
edits.sort((a, b) => a.pos - b.pos);
let segText = "";
let cur = seg[0].getStart();
for (const e of edits) {
  segText += text.slice(cur, e.pos) + e.text;
  cur = e.end;
}
segText += text.slice(cur, segEnd);
const ind = (s, k) =>
  s
    .split("\n")
    .map((l) => (l.trim() ? " ".repeat(k) + l.replace(/^ {6}/, "") : l))
    .join("\n");
const prologue = inputs.map((v) => `  ${v.written ? "let" : "const"} ${v.name} = s.${v.name};`).join("\n");
const epilogue = [copyOut([...writtenIn, ...outputs]), hasContinue ? "return false;" : ""]
  .filter(Boolean)
  .map((l) => "  " + l)
  .join("\n");
const ret = hasContinue ? "boolean" : "void";
const fn = `${header.trim()}\nexport function ${name}(col: Colony, i: number, s: AntStep): ${ret} {\n${prologue}\n  ${ind(segText, 2).trimStart()}\n${epilogue}\n}\n`;
// The call site in tick.
const pad = " ".repeat(6);
const callLines = [];
for (const v of inputs) callLines.push(`s.${v.name} = ${v.name};`);
const call = `${name}(this, i, s)`;
const back = writtenIn.map((v) => `${v.name} = s.${v.name};`);
if (hasContinue) {
  callLines.push(`const ${name}Done = ${call};`);
  callLines.push(...back);
  callLines.push(`if (${name}Done) continue;`);
} else {
  callLines.push(`${call};`);
  callLines.push(...back);
}
for (const v of outputs) callLines.push(`${v.reassignedAfter ? "let" : "const"} ${v.name} = s.${v.name};`);
const callText = callLines.map((l, k) => (k ? pad : "") + l).join("\n");
let rest = text.slice(0, seg[0].getStart()) + callText + text.slice(segEnd);
// The step record (step.ts): fields for every crossing local, merged with what is there.
const stepPath = dir + "/step.ts";
const fields = new Map(); // name -> its declaration line
if (existsSync(stepPath)) for (const m of readFileSync(stepPath, "utf8").matchAll(/^  (\w+)[!:= ].*;$/gm)) fields.set(m[1], m[0]);
// Initialised where the type allows (numbers stay unboxed in V8: review of #147); objects get `!`.
const fieldLine = (n, t) =>
  t === "number" ? `  ${n} = 0;` : t === "boolean" ? `  ${n} = false;` : / \| null$/.test(t) ? `  ${n}: ${t} = null;` : `  ${n}!: ${t};`;
for (const v of [...inputs, ...outputs]) if (!fields.has(v.name)) fields.set(v.name, fieldLine(v.name, typeOf(v.sym)));
// `const s = new AntStep()` once per tick, before the loop.
if (!/const s = new AntStep\(\);/.test(rest)) {
  const loopAt = rest.indexOf("for (let i = 0; i < this.n; i++) {", tick.getStart());
  rest = rest.slice(0, loopAt) + "const s = new AntStep();\n    " + rest.slice(loopAt);
}
console.log(
  `${name}: ${seg.length} statements, lines ${line(seg[0].getStart())}-${line(segEnd)}; inputs ${inputs.length} (${writtenIn.length} written: ${writtenIn.map((v) => v.name)}), outputs ${outputs.length} (${outputs.map((v) => v.name)}), continue: ${hasContinue}`,
);
console.log("fields:", [...fields.values()].map((l) => l.trim()).join(" "));
if (write) {
  writeFileSync(`${dir}/${file}`, `${fn}`);
  writeFileSync(srcPath, rest);
  const old = existsSync(stepPath) ? readFileSync(stepPath, "utf8") : "export class AntStep {\n}\n";
  const head = old.slice(0, old.indexOf("export class AntStep {"));
  writeFileSync(stepPath, `${head}export class AntStep {\n${[...fields.values()].join("\n")}\n}\n`);
}
