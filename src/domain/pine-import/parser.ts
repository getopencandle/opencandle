// Clean-room recursive-descent parser for the common Pine Script v5/v6 indicator subset. Written for
// OpenCandle from general public knowledge of the language; no third-party code is used. Constructs outside
// the subset become 'unsupported' statements that keep their source lines, so the translator can emit TODO comments.
import { lexPine, type Token } from './lexer';

export interface Arg { name: string | null; value: Expr }
export type Expr =
  | { k: 'num'; v: string; line: number }
  | { k: 'str'; v: string; line: number }
  | { k: 'bool'; v: boolean; line: number }
  | { k: 'na'; line: number }
  | { k: 'color'; v: string; line: number }
  | { k: 'name'; path: string; line: number }
  | { k: 'call'; path: string; args: Arg[]; line: number }
  | { k: 'index'; target: Expr; index: Expr; line: number }
  | { k: 'unary'; op: '-' | '+' | 'not'; arg: Expr; line: number }
  | { k: 'binary'; op: string; left: Expr; right: Expr; line: number }
  | { k: 'ternary'; cond: Expr; then: Expr; else: Expr; line: number }
  | { k: 'tuple'; items: Expr[]; line: number }
  | { k: 'ifx'; stmt: IfStmt; line: number }
  | { k: 'switchx'; stmt: SwitchStmt; line: number }
  | { k: 'bad'; text: string; line: number };

export interface IfStmt { k: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] | null; line: number; end: number }
export interface SwitchStmt { k: 'switch'; subject: Expr | null; cases: { when: Expr | null; body: Stmt[] }[]; line: number; end: number }
export interface Param { name: string; def: Expr | null }
export type Stmt =
  | { k: 'decl'; mode: 'let' | 'var' | 'varip'; type: string | null; name: string; expr: Expr; line: number; end: number }
  | { k: 'tdecl'; names: string[]; expr: Expr; line: number; end: number }
  | { k: 'assign'; name: string; op: string; expr: Expr; line: number; end: number }
  | IfStmt
  | SwitchStmt
  | { k: 'for'; v: string; from: Expr; to: Expr; step: Expr | null; body: Stmt[]; line: number; end: number }
  | { k: 'while'; cond: Expr; body: Stmt[]; line: number; end: number }
  | { k: 'fn'; name: string; params: Param[]; body: Stmt[] | Expr; line: number; end: number }
  | { k: 'expr'; expr: Expr; line: number; end: number }
  | { k: 'break' | 'continue'; line: number; end: number }
  | { k: 'unsupported'; reason: string; line: number; end: number };

export interface ParseResult { body: Stmt[]; version: number | null; lines: string[]; errors: { line: number; message: string }[] }

const TYPE_WORDS = new Set(['int', 'float', 'bool', 'string', 'color', 'line', 'label', 'box', 'table', 'linefill', 'polyline', 'chart.point']);
const QUALIFIERS = new Set(['simple', 'series', 'const', 'input']);
const UNSUPPORTED_KEYWORDS: Record<string, string> = {
  import: 'library imports are not supported in v1', export: 'library exports are not supported in v1', method: 'methods are not supported in v1',
  type: 'user-defined types are not supported in v1', enum: 'enums are not supported in v1',
};
class ParseError extends Error { constructor(message: string, readonly line: number) { super(message); } }

class Parser {
  private at = 0;
  readonly errors: ParseResult['errors'] = [];
  constructor(private readonly tokens: Token[]) {}
  private peek(offset = 0): Token { return this.tokens[Math.min(this.at + offset, this.tokens.length - 1)]; }
  private next(): Token { const token = this.peek(); if (this.at < this.tokens.length - 1) this.at++; return token; }
  private is(value: string, offset = 0): boolean { const token = this.peek(offset); return (token.type === 'op' || token.type === 'id') && token.value === value; }
  private eat(value: string): boolean { if (this.is(value)) { this.next(); return true; } return false; }
  private expect(value: string): Token { if (!this.is(value)) throw new ParseError(`Expected "${value}" but found "${this.peek().value || this.peek().type}".`, this.peek().line); return this.next(); }
  private ident(): string { const token = this.peek(); if (token.type !== 'id') throw new ParseError(`Expected a name but found "${token.value || token.type}".`, token.line); this.next(); return token.value; }
  private lastLine(): number { return this.tokens[Math.max(0, this.at - 1)].line; }

  program(): Stmt[] { const body: Stmt[] = []; while (this.peek().type !== 'eof') { if (this.peek().type === 'nl' || this.peek().type === 'dedent') { this.next(); continue; } if (this.peek().type === 'indent') { this.skipBlock(); continue; } body.push(this.statementSafe()); } return body; }

  /** Skips an indented block (indent ... matching dedent). */
  private skipBlock(): void { let level = 0; do { const token = this.next(); if (token.type === 'indent') level++; else if (token.type === 'dedent') level--; else if (token.type === 'eof') return; } while (level > 0); }
  /** Skips the rest of the logical line and any indented block under it. */
  private skipStatement(): void { while (!['nl', 'eof'].includes(this.peek().type)) this.next(); if (this.peek().type === 'nl') this.next(); if (this.peek().type === 'indent') this.skipBlock(); }

  private statementSafe(): Stmt {
    const start = this.at, line = this.peek().line;
    try { return this.statement(); }
    catch (error) {
      if (!(error instanceof ParseError)) throw error;
      this.at = start; this.skipStatement();
      this.errors.push({ line: error.line, message: error.message });
      return { k: 'unsupported', reason: 'could not be parsed: ' + error.message, line, end: this.lastLine() };
    }
  }
  private endStatement(): void { if (this.peek().type === 'nl') { this.next(); return; } if (this.peek().type === 'eof' || this.peek().type === 'dedent') return; throw new ParseError(`Unexpected "${this.peek().value}" after the statement.`, this.peek().line); }
  private endAfter(expr: Expr): void { if (expr.k !== 'ifx' && expr.k !== 'switchx') this.endStatement(); }
  private block(): Stmt[] {
    if (this.peek().type === 'nl') this.next();
    if (this.peek().type !== 'indent') throw new ParseError('Expected an indented block.', this.peek().line);
    this.next(); const body: Stmt[] = [];
    while (this.peek().type !== 'dedent' && this.peek().type !== 'eof') { if (this.peek().type === 'nl') { this.next(); continue; } if (this.peek().type === 'indent') { this.skipBlock(); continue; } body.push(this.statementSafe()); }
    if (this.peek().type === 'dedent') this.next();
    return body;
  }
  private statement(): Stmt {
    const token = this.peek(), line = token.line;
    if (token.type === 'id' && Object.hasOwn(UNSUPPORTED_KEYWORDS, token.value) && (token.value !== 'type' || this.peek(1).type === 'id')) {
      this.skipStatement(); return { k: 'unsupported', reason: UNSUPPORTED_KEYWORDS[token.value], line, end: this.lastLine() };
    }
    if (this.is('if')) { const stmt = this.ifStatement(); return stmt; }
    if (this.is('switch')) return this.switchStatement();
    if (this.is('for')) return this.forStatement();
    if (this.is('while')) { this.next(); const cond = this.expression(); const body = this.block(); return { k: 'while', cond, body, line, end: this.lastLine() }; }
    if (this.is('break') || this.is('continue')) { const k = this.next().value as 'break' | 'continue'; this.endStatement(); return { k, line, end: line }; }
    // [a, b] = f(...)
    if (this.is('[') && this.tupleTargetAhead()) {
      this.next(); const names = [this.ident()]; while (this.eat(',')) names.push(this.ident()); this.expect(']'); this.expect('=');
      const expr = this.valueExpression(); this.endAfter(expr); return { k: 'tdecl', names, expr, line, end: this.lastLine() };
    }
    // name(params) => body
    if (token.type === 'id' && this.is('(', 1) && this.arrowAfterParens()) return this.functionDef();
    // [var|varip] [qualifier] [type] name = expr
    let mode: 'let' | 'var' | 'varip' = 'let', type: string | null = null;
    const save = this.at;
    if (this.is('var') || this.is('varip')) mode = this.next().value as 'var' | 'varip';
    if (this.peek().type === 'id' && QUALIFIERS.has(this.peek().value) && this.peek(1).type === 'id') this.next();
    if (this.peek().type === 'id' && this.peek(1).type === 'id' && this.is('=', 2)) type = this.next().value;
    else if (this.peek().type === 'id' && this.is('<', 1)) { const generic = this.genericTypeAhead(); if (generic) { this.at += generic; type = 'generic'; } }
    if (this.peek().type === 'id' && this.is('=', 1)) {
      const name = this.ident(); this.next(); const expr = this.valueExpression(); this.endAfter(expr);
      if (type !== null && !TYPE_WORDS.has(type)) return { k: 'unsupported', reason: `the "${type}" type is not supported in v1`, line, end: this.lastLine() };
      if (type !== null && ['line', 'label', 'box', 'table', 'linefill', 'polyline'].includes(type)) return { k: 'unsupported', reason: `${type} drawing objects are not supported in v1`, line, end: this.lastLine() };
      return { k: 'decl', mode, type, name, expr, line, end: this.lastLine() };
    }
    if (mode !== 'let' || type !== null) throw new ParseError('Expected a variable declaration.', line);
    this.at = save;
    if (this.peek().type === 'id' && this.peek(1).type === 'op' && [':=', '+=', '-=', '*=', '/=', '%='].includes(this.peek(1).value)) {
      const name = this.ident(), op = this.next().value, expr = this.valueExpression(); this.endAfter(expr);
      return { k: 'assign', name, op, expr, line, end: this.lastLine() };
    }
    const expr = this.expression(); this.endStatement();
    return { k: 'expr', expr, line, end: this.lastLine() };
  }
  /** Number of tokens in a generic type such as array<float>, or 0. */
  private genericTypeAhead(): number { let i = 1; if (!this.is('<', i)) return 0; i++; while (this.peek(i).type === 'id' || this.is(',', i) || this.is('.', i)) i++; if (!this.is('>', i)) return 0; i++; return this.peek(i).type === 'id' && this.is('=', i + 1) ? i : 0; }
  private tupleTargetAhead(): boolean { let i = 1; while (this.peek(i).type === 'id' || this.is(',', i)) i++; return this.is(']', i) && this.is('=', i + 1); }
  private arrowAfterParens(): boolean { let i = 1, level = 0; for (; this.peek(i).type !== 'eof' && this.peek(i).type !== 'nl'; i++) { if (this.is('(', i)) level++; else if (this.is(')', i)) { level--; if (level === 0) break; } } return level === 0 && this.is('=>', i + 1); }
  private functionDef(): Stmt {
    const line = this.peek().line, name = this.ident(); this.expect('(');
    const params: Param[] = [];
    while (!this.is(')')) {
      if (this.peek().type === 'id' && QUALIFIERS.has(this.peek().value) && this.peek(1).type === 'id') this.next();
      if (this.peek().type === 'id' && this.peek(1).type === 'id') this.next();
      const param = this.ident(); let def: Expr | null = null; if (this.eat('=')) def = this.expression(); params.push({ name: param, def });
      if (!this.eat(',')) break;
    }
    this.expect(')'); this.expect('=>');
    if (this.peek().type === 'nl') { const body = this.block(); return { k: 'fn', name, params, body, line, end: this.lastLine() }; }
    const body = this.expression(); this.endStatement(); return { k: 'fn', name, params, body, line, end: this.lastLine() };
  }
  private ifStatement(): IfStmt {
    const line = this.expect('if').line, cond = this.expression(), then = this.block();
    let otherwise: Stmt[] | null = null;
    if (this.is('else')) {
      this.next();
      if (this.is('if')) otherwise = [this.ifStatement()];
      else otherwise = this.block();
    }
    return { k: 'if', cond, then, else: otherwise, line, end: this.lastLine() };
  }
  private switchStatement(): SwitchStmt {
    const line = this.expect('switch').line;
    const subject = this.peek().type === 'nl' ? null : this.expression();
    if (this.peek().type === 'nl') this.next();
    if (this.peek().type !== 'indent') throw new ParseError('Expected switch cases.', this.peek().line);
    this.next(); const cases: SwitchStmt['cases'] = [];
    while (this.peek().type !== 'dedent' && this.peek().type !== 'eof') {
      if (this.peek().type === 'nl') { this.next(); continue; }
      const when = this.is('=>') ? null : this.expression(); this.expect('=>');
      let body: Stmt[];
      if (this.peek().type === 'nl') body = this.block();
      else { const at = this.peek().line, expr = this.statementAfterArrow(); body = [expr]; void at; }
      cases.push({ when, body });
    }
    if (this.peek().type === 'dedent') this.next();
    return { k: 'switch', subject, cases, line, end: this.lastLine() };
  }
  /** A single-line switch branch: an assignment or an expression. */
  private statementAfterArrow(): Stmt {
    const line = this.peek().line;
    if (this.peek().type === 'id' && this.peek(1).type === 'op' && [':=', '+=', '-=', '*=', '/=', '%='].includes(this.peek(1).value)) {
      const name = this.ident(), op = this.next().value, expr = this.expression(); this.endStatement(); return { k: 'assign', name, op, expr, line, end: this.lastLine() };
    }
    const expr = this.expression(); this.endStatement(); return { k: 'expr', expr, line, end: this.lastLine() };
  }
  private forStatement(): Stmt {
    const line = this.expect('for').line;
    if (this.is('[') || this.is('in', 1)) { this.skipStatement(); return { k: 'unsupported', reason: 'for...in loops over arrays are not supported in v1', line, end: this.lastLine() }; }
    const v = this.ident(); this.expect('='); const from = this.expression(); this.expect('to'); const to = this.expression();
    const step = this.eat('by') ? this.expression() : null; const body = this.block();
    return { k: 'for', v, from, to, step, body, line, end: this.lastLine() };
  }
  /** An expression on the right of = or :=, which may also be an if or switch block. */
  private valueExpression(): Expr {
    const line = this.peek().line;
    if (this.is('if')) return { k: 'ifx', stmt: this.ifStatement(), line };
    if (this.is('switch')) return { k: 'switchx', stmt: this.switchStatement(), line };
    if (this.is('for') || this.is('while')) throw new ParseError('Loops used as values are not supported in v1.', line);
    return this.expression();
  }
  expression(): Expr { return this.ternary(); }
  private ternary(): Expr {
    const cond = this.or();
    if (this.eat('?')) { const then = this.ternary(); this.expect(':'); const otherwise = this.ternary(); return { k: 'ternary', cond, then, else: otherwise, line: cond.line }; }
    return cond;
  }
  private or(): Expr { let left = this.and(); while (this.is('or')) { this.next(); left = { k: 'binary', op: 'or', left, right: this.and(), line: left.line }; } return left; }
  private and(): Expr { let left = this.not(); while (this.is('and')) { this.next(); left = { k: 'binary', op: 'and', left, right: this.not(), line: left.line }; } return left; }
  private not(): Expr { if (this.is('not')) { const line = this.next().line; return { k: 'unary', op: 'not', arg: this.not(), line }; } return this.equality(); }
  private equality(): Expr { let left = this.comparison(); while (this.is('==') || this.is('!=')) { const op = this.next().value; left = { k: 'binary', op, left, right: this.comparison(), line: left.line }; } return left; }
  private comparison(): Expr { let left = this.additive(); while (['<', '>', '<=', '>='].some(op => this.is(op))) { const op = this.next().value; left = { k: 'binary', op, left, right: this.additive(), line: left.line }; } return left; }
  private additive(): Expr { let left = this.multiplicative(); while (this.is('+') || this.is('-')) { const op = this.next().value; left = { k: 'binary', op, left, right: this.multiplicative(), line: left.line }; } return left; }
  private multiplicative(): Expr { let left = this.unary(); while (this.is('*') || this.is('/') || this.is('%')) { const op = this.next().value; left = { k: 'binary', op, left, right: this.unary(), line: left.line }; } return left; }
  private unary(): Expr { if (this.is('-') || this.is('+')) { const token = this.next(); return { k: 'unary', op: token.value as '-' | '+', arg: this.unary(), line: token.line }; } return this.postfix(); }
  private postfix(): Expr {
    let expr = this.primary();
    for (;;) {
      if (this.is('[')) { this.next(); const index = this.expression(); this.expect(']'); expr = { k: 'index', target: expr, index, line: expr.line }; continue; }
      if (this.is('.') && this.peek(1).type === 'id') { this.next(); const member = this.ident(); const path = expr.k === 'name' ? expr.path + '.' + member : expr.k === 'call' ? expr.path + '(...).' + member : '(...).' + member; expr = { k: 'name', path, line: expr.line }; if (this.is('(')) expr = this.call(path, expr.line); continue; }
      return expr;
    }
  }
  private call(path: string, line: number): Expr {
    this.expect('('); const args: Arg[] = [];
    while (!this.is(')')) {
      let name: string | null = null;
      if (this.peek().type === 'id' && this.is('=', 1)) { name = this.next().value; this.next(); }
      args.push({ name, value: this.expression() });
      if (!this.eat(',')) break;
    }
    this.expect(')'); return { k: 'call', path, args, line };
  }
  private primary(): Expr {
    const token = this.peek(), line = token.line;
    if (token.type === 'num') { this.next(); return { k: 'num', v: token.value, line }; }
    if (token.type === 'str') { this.next(); return { k: 'str', v: token.value, line }; }
    if (token.type === 'color') { this.next(); return { k: 'color', v: token.value, line }; }
    if (this.is('(')) { this.next(); const inner = this.expression(); this.expect(')'); return inner; }
    if (this.is('[')) { this.next(); const items: Expr[] = []; while (!this.is(']')) { items.push(this.expression()); if (!this.eat(',')) break; } this.expect(']'); return { k: 'tuple', items, line }; }
    if (token.type === 'id') {
      this.next();
      if (token.value === 'true' || token.value === 'false') return { k: 'bool', v: token.value === 'true', line };
      if (token.value === 'na' && !this.is('(')) return { k: 'na', line };
      // generic call such as array.new<float>(...)
      if (this.is('<') && this.peek(1).type === 'id' && this.is('>', 2) && this.is('(', 3)) { this.at += 3; const call = this.call(token.value, line); return call; }
      if (this.is('(')) return this.call(token.value, line);
      return { k: 'name', path: token.value, line };
    }
    throw new ParseError(`Unexpected "${token.value || token.type}".`, line);
  }
}

/** Parses Pine source into the importer AST. Never throws for malformed source: problems become errors/unsupported rows. */
export function parsePine(source: string): ParseResult {
  const lexed = lexPine(source);
  const parser = new Parser(lexed.tokens);
  const body = parser.program();
  return { body, version: lexed.version, lines: lexed.lines, errors: [...lexed.errors, ...parser.errors] };
}
