// Clean-room translator from the common Pine Script v5/v6 indicator subset (parser.ts) to LVScript.
// Original OpenCandle code written from general public knowledge of Pine; no third-party code is used.
// Every construct outside the subset becomes a "TODO(pine)" comment in the output and a row in the report, so the
// translated script still runs and the user sees exactly what was not translated.
//
// Semantics the output keeps (our own mapping):
// - na is null. Arithmetic and comparisons that may meet na go through small helpers, so na propagates as in Pine
//   instead of JavaScript's null-as-zero. Expressions that can never be na use plain operators.
// - Every ta.* call site gets its own LV series key; a user function that holds series state takes a call-site key
//   as its first argument, so each Pine call site keeps its own state, as in Pine.
// - var/varip variables live in ctx.state. x[n] on a global variable reads a history ring recorded at the end of
//   each bar; on built-in series it reads ctx.history; on anything else it records the value where it is read.
import { parsePine, type Arg, type Expr, type IfStmt, type Param, type Stmt, type SwitchStmt } from './parser';
import { helperSource } from './helpers';
import { APPROXIMATED_CONSTANTS, JS_RESERVED, LV_SERIES_COLORS, MATH_CONSTANTS, MATH_UNARY, PINE_COLORS, PINE_CONSTANTS, TA, TA_VARIABLES, UNSUPPORTED_NAMESPACES, type TaSpec } from './tables';

export interface PineImportIssue { line: number; construct: string; reason: string }
export interface PineImportReport {
  version: number | null;
  declaration: 'indicator' | 'strategy' | 'library' | null;
  title: string;
  statements: { total: number; translated: number };
  /** Pine features that were translated, sorted. */
  translated: string[];
  /** Constructs that were not translated (each also has a TODO(pine) comment in the output). */
  unsupported: PineImportIssue[];
  /** Approximations: translated, but with LV semantics that differ from Pine in a stated way. */
  notes: string[];
  /** Source problems found while parsing. */
  errors: { line: number; message: string }[];
}
export interface PineImportResult {
  /** False when nothing usable could be produced (the report says why). */
  ok: boolean;
  name: string;
  kind: 'indicator' | 'strategy';
  pane: 'price' | 'new';
  source: string;
  report: PineImportReport;
}

type T = 'num' | 'bool' | 'str' | 'color' | 'tuple' | 'plot' | 'hline' | 'const' | 'void' | 'any';
interface Code { c: string; safe: boolean; t: T; title?: string; fields?: string[]; nn?: boolean }
interface FnInfo { js: string; params: Param[]; stateful: boolean; tuple: number | null }
interface Sym { js: string; safe: boolean; t: T; nn?: boolean; kind: 'let' | 'const' | 'state' | 'fn' | 'plot' | 'hline'; record?: string; title?: string; fn?: FnInfo }
interface FnCtx { stateful: boolean }
type Sink = { kind: 'assign'; target: string } | { kind: 'return' } | null;

const SERIES_PARAMS = new Set(['source', 'series', 'source1', 'source2', 'high', 'low']);
const SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'];
const BAR_FIELDS = ['open', 'high', 'low', 'close', 'volume'];
const CALENDAR = ['year', 'month', 'dayofmonth', 'dayofweek', 'hour', 'minute', 'second'];
const DAYS: Record<string, number> = { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 };
const FORBIDDEN = /\b(async|await|import|export|Promise)\b/g;
const NAME = /^(?!__)[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const str = (value: string) => JSON.stringify(value);
const lit = (e: Expr | undefined): string | number | boolean | null | undefined => {
  if (!e) return undefined;
  if (e.k === 'num') return Number(e.v);
  if (e.k === 'str') return e.v;
  if (e.k === 'bool') return e.v;
  if (e.k === 'na') return null;
  if (e.k === 'color') return e.v.toLowerCase();
  if (e.k === 'unary' && e.op === '-') { const v = lit(e.arg); return typeof v === 'number' ? -v : undefined; }
  if (e.k === 'name' && e.path.startsWith('color.') && Object.hasOwn(PINE_COLORS, e.path.slice(6))) return PINE_COLORS[e.path.slice(6)];
  if (e.k === 'call' && e.path === 'color.new' && e.args.length === 2) {
    const c = lit(e.args[0].value), t = lit(e.args[1].value);
    if (typeof c === 'string' && /^#[0-9a-f]{6}/.test(c) && typeof t === 'number') return c.slice(0, 7) + hex2(255 * (100 - t) / 100);
  }
  if (e.k === 'call' && e.path === 'color.rgb' && e.args.length >= 3) {
    const v = e.args.map(arg => lit(arg.value));
    if (v.slice(0, 3).every(x => typeof x === 'number') && (v[3] === undefined || typeof v[3] === 'number')) return '#' + hex2(v[0] as number) + hex2(v[1] as number) + hex2(v[2] as number) + (v[3] ? hex2(255 * (100 - (v[3] as number)) / 100) : '');
  }
  return undefined;
};
const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
/** Binds call arguments to parameter names: positional first, then named. */
function bind(args: Arg[], params: string[]): { map: Record<string, Expr>; extra: string[]; positional: number } {
  const map: Record<string, Expr> = {}, extra: string[] = [];
  let positional = 0;
  for (const arg of args) {
    if (arg.name === null) { if (positional < params.length) map[params[positional]] = arg.value; else extra.push('argument ' + (positional + 1)); positional++; }
    else if (params.includes(arg.name)) map[arg.name] = arg.value; else extra.push(arg.name);
  }
  return { map, extra, positional };
}

class Translator {
  private out: string[] = [];
  private depth = 3;
  private readonly helpers = new Set<string>();
  private readonly features = new Set<string>();
  private readonly issues: PineImportIssue[] = [];
  private readonly notes = new Set<string>();
  private readonly inputs: string[] = [];
  private readonly inputIds = new Set<string>();
  private readonly conditions = new Map<string, string>();
  private readonly titles = new Set<string>();
  private readonly counters: Record<string, number> = {};
  private readonly scopes: Map<string, Sym>[] = [new Map()];
  private fn: FnCtx | null = null;
  private block = 0;
  private loops = 0;
  private pending: string[] = [];
  private readonly recorded: { key: string; js: string; depth: number }[] = [];
  private readonly histDepth = new Map<string, number>();
  private readonly reassigned = new Map<string, Expr[]>();
  private colorTurn = 0;
  private statementCount = 0;
  private statementClean = 0;
  declaration: 'indicator' | 'strategy' | 'library' | null = null;
  title = '';
  overlay = false;
  private qty = '1';
  private qtyInput = '';
  constructor(private readonly lines: string[]) {}

  // ---------- bookkeeping ----------
  private count(name: string) { this.counters[name] = (this.counters[name] ?? 0) + 1; return this.counters[name]; }
  private emit(line: string) { this.out.push('  '.repeat(this.depth) + line); }
  private use(...names: string[]) { for (const name of names) this.helpers.add(name); }
  private feature(name: string) { this.features.add(name); }
  private note(text: string) { this.notes.add(text); }
  private todo(line: number, construct: string, reason: string): Code {
    this.issues.push({ line, construct, reason });
    this.pending.push(`// TODO(pine): ${construct}: ${reason} (Pine line ${line}).`);
    return { c: 'null', safe: false, t: 'any' };
  }
  private flush() { for (const text of this.pending) this.emit(text); this.pending = []; }
  private key(prefix: string): string {
    const id = prefix + this.count('key:' + prefix);
    if (this.fn) { this.fn.stateful = true; return `__k + ${str('|' + id)}`; }
    return str(id);
  }
  private lookup(name: string): Sym | undefined { for (let i = this.scopes.length - 1; i >= 0; i--) { const sym = this.scopes[i].get(name); if (sym) return sym; } return undefined; }
  private declare(name: string, sym: Sym) { this.scopes[this.scopes.length - 1].set(name, sym); }
  private jsName(name: string): string { return JS_RESERVED.has(name) ? name + '_' : name; }
  private uniqueTitle(base: string): string { let title = base.slice(0, 120) || 'Plot', n = 2; while (this.titles.has(title)) title = base.slice(0, 120) + ' ' + n++; this.titles.add(title); return title; }
  private inScope<R>(run: () => R): R { this.scopes.push(new Map()); try { return run(); } finally { this.scopes.pop(); } }

  // ---------- pre-pass ----------
  prepass(body: Stmt[]) {
    const walkExpr = (e: Expr | null | undefined): void => {
      if (!e) return;
      switch (e.k) {
        case 'index': {
          if (e.target.k === 'name') { const n = lit(e.index); const depth = typeof n === 'number' && Number.isInteger(n) && n >= 0 ? Math.max(1, n) : 500; this.histDepth.set(e.target.path, Math.min(500, Math.max(this.histDepth.get(e.target.path) ?? 1, depth))); }
          walkExpr(e.target); walkExpr(e.index); return;
        }
        case 'call': e.args.forEach(arg => walkExpr(arg.value)); return;
        case 'unary': walkExpr(e.arg); return;
        case 'binary': walkExpr(e.left); walkExpr(e.right); return;
        case 'ternary': walkExpr(e.cond); walkExpr(e.then); walkExpr(e.else); return;
        case 'tuple': e.items.forEach(walkExpr); return;
        case 'ifx': walk([e.stmt]); return;
        case 'switchx': walk([e.stmt]); return;
        default: return;
      }
    };
    const walk = (stmts: Stmt[]): void => {
      for (const s of stmts) {
        switch (s.k) {
          case 'decl': walkExpr(s.expr); break;
          case 'tdecl': walkExpr(s.expr); break;
          case 'assign': walkExpr(s.expr); { const list = this.reassigned.get(s.name) ?? []; list.push(s.op === ':=' ? s.expr : { k: 'binary', op: s.op[0], left: { k: 'name', path: s.name, line: s.line }, right: s.expr, line: s.line }); this.reassigned.set(s.name, list); } break;
          case 'if': walkExpr(s.cond); walk(s.then); if (s.else) walk(s.else); break;
          case 'switch': walkExpr(s.subject); s.cases.forEach(c => { walkExpr(c.when); walk(c.body); }); break;
          case 'for': walkExpr(s.from); walkExpr(s.to); walkExpr(s.step); walk(s.body); break;
          case 'while': walkExpr(s.cond); walk(s.body); break;
          case 'fn': if (Array.isArray(s.body)) walk(s.body); else walkExpr(s.body); break;
          case 'expr': walkExpr(s.expr); break;
          default: break;
        }
      }
    };
    walk(body);
  }

  // ---------- safety (can the value be na?) without emitting anything ----------
  private safe(e: Expr, assume: string | null = null): boolean {
    switch (e.k) {
      case 'num': case 'str': case 'bool': case 'color': return true;
      case 'na': return false;
      case 'name': {
        if (e.path === assume) return true;
        const sym = this.lookup(e.path);
        if (sym) return sym.safe;
        return [...BAR_FIELDS, 'hl2', 'hlc3', 'ohlc4', 'hlcc4', 'bar_index', 'time', ...CALENDAR].includes(e.path) || e.path.startsWith('math.') && Object.hasOwn(MATH_CONSTANTS, e.path.slice(5))
          || e.path.startsWith('color.') && Object.hasOwn(PINE_COLORS, e.path.slice(6)) || Object.hasOwn(PINE_CONSTANTS, e.path) || e.path.startsWith('barstate.');
      }
      case 'call': {
        if (e.path === 'na' || e.path.startsWith('str.') || e.path === 'color.new' || e.path === 'color.rgb') return true;
        if (e.path === 'nz') return e.args.length < 2 || this.safe(e.args[1].value, assume);
        if (['math.abs', 'math.ceil', 'math.floor', 'math.sign', 'math.max', 'math.min', 'math.round', 'math.sin', 'math.cos', 'math.atan', 'math.avg', 'math.todegrees', 'math.toradians', 'int', 'float'].includes(e.path)) return e.args.every(arg => arg.name === 'precision' || this.safe(arg.value, assume));
        return false;
      }
      case 'unary': return this.safe(e.arg, assume);
      case 'binary': {
        if (['==', '!=', '<', '>', '<=', '>='].includes(e.op)) return true;
        if (['+', '-', '*', 'and', 'or'].includes(e.op)) return this.safe(e.left, assume) && this.safe(e.right, assume);
        if (e.op === '/' || e.op === '%') { const d = lit(e.right); return typeof d === 'number' && d !== 0 && this.safe(e.left, assume); }
        return false;
      }
      case 'ternary': return this.safe(e.then, assume) && this.safe(e.else, assume);
      default: return false;
    }
  }
  /** A variable is na-free when its first value and every later reassignment are. */
  private variableSafe(name: string, first: Expr): boolean {
    if (!this.safe(first, name)) return false;
    return (this.reassigned.get(name) ?? []).every(expr => this.safe(expr, name));
  }

  // ---------- statements ----------
  program(body: Stmt[]) {
    this.prepass(body);
    for (const stmt of body) this.statement(stmt);
    for (const row of this.recorded) { this.use('$rec'); this.emit(`$rec(S, ${str(row.key)}, ${row.js}, ${row.depth});`); }
  }
  private statements(stmts: Stmt[], sink: Sink = null) {
    stmts.forEach((stmt, index) => {
      const last = index === stmts.length - 1;
      if (last && sink) this.lastStatement(stmt, sink); else this.statement(stmt);
    });
    if (!stmts.length && sink?.kind === 'return') this.emit('return null;');
  }
  /** The final statement of a block whose value is used (function bodies, if/switch expressions). */
  private lastStatement(stmt: Stmt, sink: Exclude<Sink, null>) {
    const put = (code: string) => this.emit(sink.kind === 'return' ? `return ${code};` : `${sink.target} = ${code};`);
    if (stmt.k === 'expr') {
      const before = this.issues.length; this.statementCount++;
      const code = stmt.expr.k === 'tuple' ? this.tuple(stmt.expr) : this.expr(stmt.expr);
      this.flush(); put(code.c);
      if (this.issues.length === before) this.statementClean++;
      return;
    }
    if (stmt.k === 'if') { this.ifStatement(stmt, sink); return; }
    if (stmt.k === 'switch') { this.switchStatement(stmt, sink); return; }
    this.statement(stmt);
    if (stmt.k === 'decl' || stmt.k === 'assign') { const sym = this.lookup(stmt.name); if (sym) put(sym.js); }
    else if (sink.kind === 'return') this.emit('return null;');
  }
  private statement(stmt: Stmt) {
    const leaf = !['if', 'switch', 'for', 'while', 'fn'].includes(stmt.k) || (stmt.k === 'fn' && !Array.isArray(stmt.body));
    const before = this.issues.length;
    if (leaf) this.statementCount++;
    switch (stmt.k) {
      case 'decl': this.declaration_(stmt); break;
      case 'tdecl': this.tupleDeclaration(stmt); break;
      case 'assign': this.assignment(stmt); break;
      case 'if': this.ifStatement(stmt, null); break;
      case 'switch': this.switchStatement(stmt, null); break;
      case 'for': this.forStatement(stmt); break;
      case 'while': {
        const cond = this.expr(stmt.cond); this.flush(); this.feature('while');
        this.emit(`while (${cond.c}) {`); this.depth++; this.loops++; this.block++; this.inScope(() => this.statements(stmt.body)); this.block--; this.loops--; this.depth--; this.emit('}');
        break;
      }
      case 'fn': this.functionDefinition(stmt); break;
      case 'expr': this.expressionStatement(stmt); break;
      case 'break': case 'continue': this.emit(stmt.k + ';'); break;
      case 'unsupported': this.unsupportedLines(stmt.line, stmt.end, stmt.reason); break;
    }
    if (leaf && this.issues.length === before) this.statementClean++;
  }
  private unsupportedLines(start: number, end: number, reason: string) {
    const first = this.lines[start - 1]?.trim() ?? '';
    this.issues.push({ line: start, construct: first.slice(0, 80), reason });
    this.emit(`// TODO(pine): not translated: ${reason} (Pine lines ${start}-${end}):`);
    for (let line = start; line <= Math.min(end, start + 19); line++) this.emit('//   ' + (this.lines[line - 1] ?? '').replace(/\s+$/, ''));
    if (end > start + 19) this.emit(`//   ... ${end - start - 19} more lines`);
  }
  private declaration_(stmt: Extract<Stmt, { k: 'decl' }>) {
    const name = stmt.name, js = this.jsName(name);
    if (stmt.expr.k === 'call' && (stmt.expr.path === 'input' || stmt.expr.path.startsWith('input.'))) {
      const input = this.input(stmt.expr, name, stmt.line); this.flush();
      if (input) { this.emit(`const ${js} = ${input.c};`); this.declare(name, { js, safe: true, t: input.t, kind: 'const' }); this.maybeRecord(name, js, true); }
      else { this.emit(`const ${js} = null;`); this.declare(name, { js, safe: false, t: 'any', kind: 'const' }); }
      return;
    }
    if (stmt.mode === 'var' || stmt.mode === 'varip') {
      this.feature(stmt.mode); if (stmt.mode === 'varip') this.note('varip variables behave like var: CandleScript runs once per completed bar, so there are no intrabar updates.');
      const safe = this.variableSafe(name, stmt.expr);
      const keyName = this.block > 0 || this.fn ? name + '_' + stmt.line : name;
      const target = this.fn ? `S[__k + ${str('.' + keyName)}]` : /^[A-Za-z_][A-Za-z0-9_]*$/.test(keyName) ? `S.${keyName}` : `S[${str(keyName)}]`;
      if (this.fn) this.fn.stateful = true;
      const sym: Sym = { js: target, safe, t: 'any', kind: 'state' };
      if (stmt.expr.k === 'ifx' || stmt.expr.k === 'switchx') {
        this.emit(`if (!(${this.fn ? `(__k + ${str('.' + keyName)})` : str(keyName)} in S)) {`); this.depth++; this.emit(`${target} = null;`); this.valueBlock(stmt.expr, target); this.depth--; this.emit('}');
      } else {
        const value = this.expr(stmt.expr); sym.t = value.t; this.flush();
        this.emit(`if (!(${this.fn ? `(__k + ${str('.' + keyName)})` : str(keyName)} in S)) ${target} = ${value.c};`);
      }
      this.declare(name, sym); this.maybeRecord(name, target, false);
      return;
    }
    if (stmt.expr.k === 'ifx' || stmt.expr.k === 'switchx') {
      this.emit(`let ${js} = null;`); this.declare(name, { js, safe: false, t: 'any', kind: 'let' }); this.valueBlock(stmt.expr, js); this.maybeRecord(name, js, false); return;
    }
    const value = this.expr(stmt.expr); this.flush();
    if (value.t === 'plot' || value.t === 'hline') { this.emit(value.c + ';'); this.declare(name, { js, safe: true, t: value.t, kind: value.t, title: value.title }); return; }
    if (value.t === 'tuple') { this.todo(stmt.line, name, 'a tuple needs the [a, b] = ... form'); this.flush(); return; }
    const safe = value.safe && this.variableSafe(name, stmt.expr);
    this.emit(`let ${js} = ${value.c};`);
    this.declare(name, { js, safe, t: value.t, nn: !!value.nn && !(this.reassigned.get(name) ?? []).length, kind: 'let' }); this.maybeRecord(name, js, false);
  }
  private maybeRecord(name: string, js: string, constant: boolean) {
    const depth = this.histDepth.get(name);
    if (depth === undefined || this.fn || this.block > 0) return;
    const sym = this.lookup(name)!; sym.record = name;
    void constant; this.recorded.push({ key: name, js, depth });
    this.feature('history references');
  }
  /** Emits an if/switch used as a value: each branch assigns its last value to the target. */
  private valueBlock(expr: Expr, target: string) {
    if (expr.k === 'ifx') this.ifStatement(expr.stmt, { kind: 'assign', target });
    else if (expr.k === 'switchx') this.switchStatement(expr.stmt, { kind: 'assign', target });
  }
  private tupleDeclaration(stmt: Extract<Stmt, { k: 'tdecl' }>) {
    const value = stmt.expr.k === 'ifx' || stmt.expr.k === 'switchx' ? this.todo(stmt.line, 'tuple from an if/switch block', 'not supported in v1') : this.expr(stmt.expr);
    this.flush();
    if (value.fields) {
      const temp = '$t' + this.count('tuple');
      this.emit(`const ${temp} = ${value.c};`);
      const parts = stmt.names.map((name, index) => { const js = this.jsName(name); const field = value.fields![index]; this.declare(name, { js, safe: false, t: 'num', kind: 'let' }); return `${js} = ${field ? `${temp}.${field}` : 'null'}`; });
      this.emit(`let ${parts.join(', ')};`);
    } else if (value.t === 'tuple' || value.t === 'any') {
      const names = stmt.names.map(name => this.jsName(name));
      this.emit(value.c === 'null' ? `let ${names.map(n => n + ' = null').join(', ')};` : `let [${names.join(', ')}] = ${value.c};`);
      stmt.names.forEach((name, index) => this.declare(name, { js: names[index], safe: false, t: 'any', kind: 'let' }));
    } else {
      this.todo(stmt.line, 'tuple declaration', 'the right side does not return a tuple'); this.flush();
      stmt.names.forEach(name => { const js = this.jsName(name); this.emit(`let ${js} = null;`); this.declare(name, { js, safe: false, t: 'any', kind: 'let' }); });
    }
    stmt.names.forEach(name => { const sym = this.lookup(name)!; this.maybeRecord(name, sym.js, false); });
  }
  private assignment(stmt: Extract<Stmt, { k: 'assign' }>) {
    const sym = this.lookup(stmt.name);
    if (!sym || sym.kind === 'fn' || sym.kind === 'plot' || sym.kind === 'hline') { this.todo(stmt.line, stmt.name, 'reassignment of an unknown variable'); this.flush(); return; }
    if (sym.kind === 'const') { this.todo(stmt.line, stmt.name, 'inputs cannot be reassigned'); this.flush(); return; }
    this.feature(stmt.op === ':=' ? ':= reassignment' : stmt.op + ' assignment');
    if (stmt.expr.k === 'ifx' || stmt.expr.k === 'switchx') { if (stmt.op !== ':=') { this.todo(stmt.line, stmt.op, 'compound assignment from a block'); this.flush(); return; } this.valueBlock(stmt.expr, sym.js); return; }
    const value = stmt.op === ':=' ? this.expr(stmt.expr) : this.binary({ k: 'binary', op: stmt.op[0], left: { k: 'name', path: stmt.name, line: stmt.line }, right: stmt.expr, line: stmt.line });
    this.flush(); this.emit(`${sym.js} = ${value.c};`);
  }
  private ifStatement(stmt: IfStmt, sink: Sink, chained = false) {
    const cond = this.expr(stmt.cond); this.flush(); this.feature('if/else');
    this.emit(`${chained ? '} else ' : ''}if (${cond.c}) {`);
    this.branch(stmt.then, sink);
    if (stmt.else && stmt.else.length === 1 && stmt.else[0].k === 'if') { this.ifStatement(stmt.else[0], sink, true); return; }
    if (stmt.else) { this.emit('} else {'); this.branch(stmt.else, sink); }
    else if (sink?.kind === 'return') { this.emit('}'); this.emit('return null;'); return; }
    this.emit('}');
  }
  private branch(stmts: Stmt[], sink: Sink) { this.depth++; this.block++; this.inScope(() => this.statements(stmts, sink)); this.block--; this.depth--; }
  private switchStatement(stmt: SwitchStmt, sink: Sink) {
    this.feature('switch');
    let subject = '';
    if (stmt.subject) { const value = this.expr(stmt.subject); this.flush(); subject = '$s' + this.count('switch'); this.emit(`const ${subject} = ${value.c};`); }
    let first = true, hasDefault = false;
    for (const branch of stmt.cases) {
      if (branch.when === null) { hasDefault = true; this.emit(first ? '{' : '} else {'); this.branch(branch.body, sink); first = false; continue; }
      const when = this.expr(branch.when); this.flush();
      const test = subject ? `${subject} === ${when.c}` : when.c;
      this.emit(`${first ? '' : '} else '}if (${test}) {`); this.branch(branch.body, sink); first = false;
    }
    if (!first) this.emit('}');
    if (!hasDefault && sink?.kind === 'return') this.emit('return null;');
  }
  private forStatement(stmt: Extract<Stmt, { k: 'for' }>) {
    this.feature('for loop');
    const from = this.expr(stmt.from), to = this.expr(stmt.to), step = stmt.step ? this.expr(stmt.step) : null; this.flush();
    const v = this.jsName(stmt.v), a = lit(stmt.from), b = lit(stmt.to), s = stmt.step ? lit(stmt.step) : undefined;
    this.inScope(() => {
      this.declare(stmt.v, { js: v, safe: from.safe && to.safe, t: 'num', kind: 'let' });
      if (typeof a === 'number' && typeof b === 'number' && (s === undefined || typeof s === 'number')) {
        const by = s === undefined ? (a <= b ? 1 : -1) : (a <= b ? Math.abs(s) : -Math.abs(s));
        this.emit(`for (let ${v} = ${from.c}; ${v} ${by > 0 ? '<=' : '>='} ${to.c}; ${v} += ${by}) {`);
      } else {
        const n = this.count('loop'), end = `$to${n}`, by = `$by${n}`;
        this.emit(`const ${end} = ${to.c}, ${by} = ${from.c} <= ${end} ? ${step ? `Math.abs(${step.c})` : '1'} : -${step ? `Math.abs(${step.c})` : '1'};`);
        this.emit(`for (let ${v} = ${from.c}; ${by} > 0 ? ${v} <= ${end} : ${v} >= ${end}; ${v} += ${by}) {`);
      }
      this.depth++; this.loops++; this.block++; this.statements(stmt.body); this.block--; this.loops--; this.depth--; this.emit('}');
    });
  }
  private functionDefinition(stmt: Extract<Stmt, { k: 'fn' }>) {
    if (this.fn || this.block > 0) { this.unsupportedLines(stmt.line, stmt.end, 'functions must be declared at the top level'); return; }
    this.feature(Array.isArray(stmt.body) ? 'user functions (block)' : 'user functions (=>)');
    const js = this.jsName(stmt.name), saved = this.out, savedDepth = this.depth, ctxFn: FnCtx = { stateful: false };
    this.out = []; this.depth = savedDepth + 1; this.fn = ctxFn;
    let tuple: number | null = null;
    const defaults: string[] = [];
    this.inScope(() => {
      for (const param of stmt.params) {
        const pjs = this.jsName(param.name);
        let def = '';
        if (param.def) { const value = this.expr(param.def); def = ' = ' + value.c; }
        defaults.push(pjs + def);
        this.declare(param.name, { js: pjs, safe: false, t: 'any', kind: 'let' });
      }
      if (Array.isArray(stmt.body)) {
        const last = stmt.body[stmt.body.length - 1];
        if (last && last.k === 'expr' && last.expr.k === 'tuple') tuple = last.expr.items.length;
        this.statements(stmt.body, { kind: 'return' });
      } else {
        this.statementCount++; const before = this.issues.length;
        if (stmt.body.k === 'tuple') tuple = stmt.body.items.length;
        const value = stmt.body.k === 'tuple' ? this.tuple(stmt.body) : this.expr(stmt.body); this.flush(); this.emit(`return ${value.c};`);
        if (this.issues.length === before) this.statementClean++;
      }
    });
    const body = this.out; this.out = saved; this.depth = savedDepth; this.fn = null;
    const params = (ctxFn.stateful ? ['__k'] : []).concat(defaults);
    this.emit(`const ${js} = (${params.join(', ')}) => {`); this.out.push(...body); this.emit('};');
    this.declare(stmt.name, { js, safe: false, t: tuple ? 'tuple' : 'any', kind: 'fn', fn: { js, params: stmt.params, stateful: ctxFn.stateful, tuple } });
  }
  private expressionStatement(stmt: Extract<Stmt, { k: 'expr' }>) {
    const e = stmt.expr;
    if (e.k === 'call' && (e.path === 'indicator' || e.path === 'strategy' || e.path === 'library' || e.path === 'study')) { this.declarationCall(e); return; }
    const value = this.expr(e); this.flush();
    if (value.c !== 'null') this.emit(value.c + ';');
  }
  private declarationCall(e: Extract<Expr, { k: 'call' }>) {
    if (this.declaration) { this.todo(e.line, e.path, 'a second declaration statement is ignored'); this.flush(); return; }
    if (e.path === 'library') { this.declaration = 'library'; this.todo(e.line, 'library()', 'Pine libraries are not supported in v1'); this.flush(); return; }
    if (e.path === 'study') { this.todo(e.line, 'study()', 'Pine v4 study() is read as indicator()'); }
    this.declaration = e.path === 'strategy' ? 'strategy' : 'indicator';
    this.feature(this.declaration + '()');
    const params = this.declaration === 'strategy'
      ? ['title', 'shorttitle', 'overlay', 'format', 'precision', 'scale', 'pyramiding', 'calc_on_order_fills', 'calc_on_every_tick', 'max_bars_back', 'backtest_fill_limits_assumption', 'default_qty_type', 'default_qty_value', 'initial_capital', 'currency']
      : ['title', 'shorttitle', 'overlay', 'format', 'precision', 'scale', 'max_bars_back', 'timeframe', 'timeframe_gaps'];
    const { map } = bind(e.args, params);
    const title = lit(map.title); this.title = typeof title === 'string' ? title : 'Pine script';
    this.overlay = lit(map.overlay) === true;
    if (map.timeframe) this.todo(e.line, 'timeframe argument', 'multi-timeframe indicators are not translated in v1; the script runs on the chart interval');
    if (this.declaration === 'strategy') {
      const qtyType = map.default_qty_type?.k === 'name' ? map.default_qty_type.path : 'strategy.fixed';
      const qty = lit(map.default_qty_value);
      if (typeof qty === 'number' && qty > 0) this.qty = String(qty);
      if (qtyType !== 'strategy.fixed') this.note(`default_qty_type ${qtyType} is not translated: orders use a fixed unit size input (default ${this.qty}).`);
      const pyramiding = lit(map.pyramiding);
      if (typeof pyramiding === 'number' && pyramiding > 1) this.note('pyramiding above 1 is not translated: an entry in the direction of the open position is skipped.');
      for (const name of ['initial_capital', 'currency', 'calc_on_every_tick', 'calc_on_order_fills']) if (map[name]) this.note(`strategy() argument ${name} is not translated: the Strategy tester settings apply.`);
    }
  }

  // ---------- expressions ----------
  private tuple(e: Extract<Expr, { k: 'tuple' }>): Code { const items = e.items.map(item => this.expr(item).c); return { c: `[${items.join(', ')}]`, safe: false, t: 'tuple' }; }
  expr(e: Expr): Code {
    switch (e.k) {
      case 'num': return { c: e.v, safe: true, t: 'num' };
      case 'str': return { c: str(e.v), safe: true, t: 'str' };
      case 'bool': return { c: String(e.v), safe: true, t: 'bool' };
      case 'na': return { c: 'null', safe: false, t: 'any' };
      case 'color': { this.feature('colour literals'); return { c: str(e.v.toLowerCase()), safe: true, t: 'color' }; }
      case 'name': return this.name(e);
      case 'call': return this.call(e);
      case 'index': return this.history(e);
      case 'unary': {
        const arg = this.expr(e.arg);
        if (e.op === 'not') return { c: `!${arg.c}`, safe: true, t: 'bool' };
        if (e.op === '+') return arg;
        if (arg.safe) return { c: `(-${arg.c})`, safe: true, t: 'num' };
        this.use('$neg'); return { c: `$neg(${arg.c})`, safe: false, t: 'num' };
      }
      case 'binary': return this.binary(e);
      case 'ternary': {
        const cond = this.expr(e.cond), a = this.expr(e.then), b = this.expr(e.else); this.feature('ternary');
        return { c: `(${cond.c} ? ${a.c} : ${b.c})`, safe: a.safe && b.safe, t: a.t === b.t ? a.t : a.t === 'any' ? b.t : a.t };
      }
      case 'tuple': return this.todo(e.line, 'tuple', 'tuples are only supported as function results and in [a, b] = ... declarations');
      case 'ifx': case 'switchx': return this.todo(e.line, e.k === 'ifx' ? 'if expression' : 'switch expression', 'an if/switch value is only supported on the right of = or :=');
      case 'bad': return this.todo(e.line, e.text, 'not understood');
    }
  }
  private binary(e: Extract<Expr, { k: 'binary' }>): Code {
    const a = this.expr(e.left), b = this.expr(e.right);
    if (e.op === 'and' || e.op === 'or') return { c: `(${a.c} ${e.op === 'and' ? '&&' : '||'} ${b.c})`, safe: a.safe && b.safe, t: 'bool' };
    const both = a.safe && b.safe;
    if (e.op === '+' && (a.t === 'str' || b.t === 'str') && both) return { c: `(${a.c} + ${b.c})`, safe: true, t: 'str' };
    if (['+', '-', '*'].includes(e.op)) {
      if (both) return { c: `(${a.c} ${e.op} ${b.c})`, safe: true, t: 'num' };
      const helper = e.op === '+' ? '$add' : e.op === '-' ? '$sub' : '$mul'; this.use(helper);
      const text = e.op === '+' && (a.t === 'str' || b.t === 'str'); return { c: `${helper}(${a.c}, ${b.c})`, safe: false, t: text ? 'str' : 'num', nn: !text && a.t !== 'str' && b.t !== 'str' && a.t !== 'any' && b.t !== 'any' };
    }
    if (e.op === '/' || e.op === '%') {
      const d = lit(e.right);
      if (a.safe && typeof d === 'number' && d !== 0) return { c: `(${a.c} ${e.op} ${b.c})`, safe: true, t: 'num' };
      const helper = e.op === '/' ? '$div' : '$mod'; this.use(helper); return { c: `${helper}(${a.c}, ${b.c})`, safe: false, t: 'num', nn: true };
    }
    const compare: Record<string, [string, string]> = { '<': ['<', '$lt'], '>': ['>', '$gt'], '<=': ['<=', '$le'], '>=': ['>=', '$ge'], '==': ['===', '$eq'], '!=': ['!==', '$ne'] };
    const [op, helper] = compare[e.op];
    if (both) return { c: `(${a.c} ${op} ${b.c})`, safe: true, t: 'bool' };
    this.use(helper); return { c: `${helper}(${a.c}, ${b.c})`, safe: true, t: 'bool' };
  }
  private name(e: Extract<Expr, { k: 'name' }>): Code {
    const path = e.path, sym = this.lookup(path);
    if (sym) {
      if (sym.kind === 'fn') return this.todo(e.line, path, 'a function used as a value');
      return { c: sym.js, safe: sym.safe, t: sym.t, title: sym.title, nn: sym.nn };
    }
    if (BAR_FIELDS.includes(path)) { this.feature('built-in series'); return { c: `ctx.bar.${path}`, safe: true, t: 'num' }; }
    if (['hl2', 'hlc3', 'ohlc4', 'hlcc4'].includes(path)) { this.feature('built-in series'); return { c: `ctx.ta.source(${str(path)})`, safe: true, t: 'num' }; }
    if (path === 'bar_index') { this.feature('bar_index'); return { c: 'ctx.index', safe: true, t: 'num' }; }
    if (path === 'time') { this.feature('time'); this.note('time is the bar open time in Unix milliseconds (OpenCandle bar time x 1000).'); return { c: '(ctx.bar.time * 1000)', safe: true, t: 'num' }; }
    if (CALENDAR.includes(path)) { this.feature('calendar variables'); this.note('year, month, dayofmonth, dayofweek, hour, minute and second use the UTC calendar, not the exchange time zone.'); return { c: `ctx.calendar().${path}`, safe: true, t: 'num' }; }
    if (path.startsWith('dayofweek.') && Object.hasOwn(DAYS, path.slice(10))) return { c: String(DAYS[path.slice(10)]), safe: true, t: 'num' };
    if (path.startsWith('barstate.')) {
      const field = path.slice(9);
      if (field === 'isfirst' || field === 'islast') { this.feature('barstate'); return { c: `ctx.barstate.${field}`, safe: true, t: 'bool' }; }
      if (['isconfirmed', 'ishistory', 'isnew'].includes(field)) { this.feature('barstate'); this.note(`barstate.${field} is always true: CandleScript calculates completed bars only.`); return { c: 'true', safe: true, t: 'bool' }; }
      if (field === 'isrealtime') { this.note('barstate.isrealtime is always false: CandleScript calculates completed bars only.'); return { c: 'false', safe: true, t: 'bool' }; }
      if (field === 'islastconfirmedhistory') { this.note('barstate.islastconfirmedhistory is read as barstate.islast.'); return { c: 'ctx.barstate.islast', safe: true, t: 'bool' }; }
    }
    if (path.startsWith('color.') && Object.hasOwn(PINE_COLORS, path.slice(6))) { this.feature('color constants'); return { c: str(PINE_COLORS[path.slice(6)]), safe: true, t: 'color' }; }
    if (path.startsWith('math.') && Object.hasOwn(MATH_CONSTANTS, path.slice(5))) { this.feature(path); return { c: MATH_CONSTANTS[path.slice(5)], safe: true, t: 'num' }; }
    if (path.startsWith('ta.') && Object.hasOwn(TA_VARIABLES, path.slice(3))) {
      const spec = TA_VARIABLES[path.slice(3)]; this.feature(path);
      if (this.loops) this.loopNote(e.line, path);
      return { c: spec.key ? `ctx.ta.${spec.lv}(${this.key('t')})` : `ctx.ta.${spec.lv}`, safe: false, t: 'num' };
    }
    if (path === 'ta.vwap') { this.use('$newDay'); this.feature('ta.vwap'); this.note('ta.vwap resets at each UTC day, not at the exchange session start.'); return { c: `ctx.ta.vwap(${this.key('t')}, ctx.ta.source('hlc3'), $newDay(ctx))`, safe: false, t: 'num' }; }
    if (path === 'strategy.position_size') { this.use('$pos'); this.feature('strategy.position_size'); return { c: '$pos(ctx, S)', safe: true, t: 'num' }; }
    if (Object.hasOwn(PINE_CONSTANTS, path)) { if (Object.hasOwn(APPROXIMATED_CONSTANTS, path)) this.note(APPROXIMATED_CONSTANTS[path] + '.'); return { c: str(PINE_CONSTANTS[path]), safe: true, t: 'const' }; }
    const namespace = path.split('.')[0];
    if (path.includes('.') && Object.hasOwn(UNSUPPORTED_NAMESPACES, namespace)) return this.todo(e.line, path, UNSUPPORTED_NAMESPACES[namespace]);
    return this.todo(e.line, path, 'unknown name');
  }
  private loopNote(line: number, what: string) { this.issues.push({ line, construct: what + ' inside a loop', reason: 'OpenCandle keeps one series per call site and refuses a second update on the same bar with other values; move the call out of the loop' }); this.pending.push(`// TODO(pine): ${what} inside a loop: OpenCandle keeps one series per call site; move it out of the loop (Pine line ${line}).`); }
  private history(e: Extract<Expr, { k: 'index' }>): Code {
    this.feature('history references');
    const index = this.expr(e.index), n = lit(e.index);
    const depth = typeof n === 'number' && Number.isInteger(n) && n >= 0 ? Math.max(1, Math.min(500, n)) : 500;
    if (e.target.k === 'name' && !this.lookup(e.target.path)) {
      const path = e.target.path;
      if (SOURCES.includes(path)) return { c: `ctx.history(${index.c}, ${str(path)})`, safe: false, t: 'num', nn: true };
      if (path === 'volume') { this.use('$hb'); return { c: `$hb(ctx, ${index.c}, 'volume')`, safe: false, t: 'num' }; }
      if (path === 'time') { this.use('$ht'); return { c: `$ht(ctx, ${index.c})`, safe: false, t: 'num' }; }
      if (path === 'bar_index') { this.use('$bi'); return { c: `$bi(ctx, ${index.c})`, safe: false, t: 'num' }; }
    }
    if (e.target.k === 'name') {
      const sym = this.lookup(e.target.path);
      if (sym && sym.record) { this.use('$past'); return { c: `$past(S, ${str(sym.record)}, ${index.c}, ${sym.js})`, safe: false, t: sym.t }; }
    }
    const value = this.expr(e.target); this.use('$H');
    return { c: `$H(S, ${this.key('h')}, ${value.c}, ${index.c}, ctx.index, ${depth})`, safe: false, t: value.t };
  }

  // ---------- calls ----------
  private call(e: Extract<Expr, { k: 'call' }>): Code {
    const path = e.path, user = this.lookup(path);
    if (user?.kind === 'fn' && user.fn) return this.userCall(e, user.fn);
    if (path === 'input' || path.startsWith('input.')) { const input = this.input(e, null, e.line); return input ?? { c: 'null', safe: false, t: 'any' }; }
    if (path.startsWith('ta.') && Object.hasOwn(TA, path.slice(3))) return this.ta(e, TA[path.slice(3)]);
    if (path === 'ta.vwap') return this.vwap(e);
    if (path.startsWith('math.')) return this.math(e);
    switch (path) {
      case 'na': { this.use('$na'); this.feature('na()'); return { c: `$na(${this.arg(e, 0).c})`, safe: true, t: 'bool' }; }
      case 'nz': { this.feature('nz()'); const v = this.arg(e, 0), r = e.args[1] ? this.expr(e.args[1].value) : null; return { c: `ctx.nz(${v.c}${r ? ', ' + r.c : ''})`, safe: r ? r.safe : true, t: v.t === 'any' && r ? r.t : v.t }; }
      case 'fixnan': { this.feature('fixnan()'); return { c: `ctx.ta.fixnan(${this.key('t')}, ${this.num(this.arg(e, 0))})`, safe: false, t: 'num' }; }
      case 'int': { const v = this.arg(e, 0); this.use('$int'); return { c: `$int(${v.c})`, safe: v.safe, t: 'num' }; }
      case 'float': return this.arg(e, 0);
      case 'bool': { this.use('$b'); return { c: `$b(${this.arg(e, 0).c})`, safe: true, t: 'bool' }; }
      case 'str.tostring': case 'string': { this.use('$str'); this.feature('str.tostring'); const v = this.arg(e, 0), f = e.args[1] ? this.expr(e.args[1].value) : null; if (f && f.t === 'const') this.note('str.tostring with a format.* constant uses OpenCandle default number formatting.'); return { c: `$str(${v.c}${f && f.t !== 'const' ? ', ' + f.c : ''})`, safe: true, t: 'str' }; }
      case 'color.new': return this.colorCall(e, ['color', 'transp'], '$rgba');
      case 'color.rgb': return this.colorCall(e, ['red', 'green', 'blue', 'transp'], '$rgb');
      case 'color.from_gradient': this.note('color.from_gradient is stepped in 16ths: an OpenCandle plot may use at most 64 distinct colours.'); return this.colorCall(e, ['value', 'bottom_value', 'top_value', 'bottom_color', 'top_color'], '$grad');
      case 'plot': return this.plot(e);
      case 'plotshape': return this.plotshape(e, false);
      case 'plotchar': return this.plotshape(e, true);
      case 'plotarrow': return this.plotarrow(e);
      case 'hline': return this.hline(e);
      case 'fill': return this.fill(e);
      case 'bgcolor': { this.feature('bgcolor'); const { map } = bind(e.args, ['color', 'offset', 'editable', 'show_last', 'title', 'display']); if (map.offset) this.note('bgcolor offset is not translated.'); return { c: `ctx.bgcolor(${map.color ? this.expr(map.color).c : 'null'})`, safe: true, t: 'void' }; }
      case 'barcolor': { this.feature('barcolor'); this.use('$bar'); const { map } = bind(e.args, ['color', 'offset', 'editable', 'show_last', 'title', 'display']); return { c: `$bar(ctx, ${map.color ? this.expr(map.color).c : 'null'})`, safe: true, t: 'void' }; }
      case 'alertcondition': return this.alertcondition(e);
      case 'alert': { this.feature('alert()'); const msg = this.arg(e, 0); this.use('$str'); return { c: `ctx.alert(${str('Pine alert ' + this.count('alert'))}, ${msg.t === 'str' && msg.safe ? msg.c : `$str(${msg.c})`})`, safe: true, t: 'void' }; }
      case 'log.info': case 'log.warning': case 'log.error': { this.feature(path); const msg = this.arg(e, 0); this.use('$str'); return { c: `ctx.log.${path === 'log.warning' ? 'warn' : path.slice(4)}(${msg.t === 'str' && msg.safe ? msg.c : `$str(${msg.c})`})`, safe: true, t: 'void' }; }
      case 'indicator': case 'strategy': case 'library': case 'study': return this.todo(e.line, path + '()', 'a declaration must be a top-level statement');
      default: break;
    }
    if (path.startsWith('strategy.')) return this.strategyCall(e);
    const namespace = path.split('.')[0];
    if (path.includes('.') && Object.hasOwn(UNSUPPORTED_NAMESPACES, namespace)) return this.todo(e.line, path + '()', UNSUPPORTED_NAMESPACES[namespace]);
    return this.todo(e.line, path + '()', 'unknown function');
  }
  private arg(e: Extract<Expr, { k: 'call' }>, index: number): Code { const arg = e.args[index]; return arg ? this.expr(arg.value) : { c: 'null', safe: false, t: 'any' }; }
  private num(code: Code): string { if (code.safe && code.t === 'num' || code.nn) return code.c; this.use('$n'); return `$n(${code.c})`; }
  private bool(code: Code): string { if (code.safe && code.t === 'bool') return code.c; this.use('$b'); return `$b(${code.c})`; }
  private colorCall(e: Extract<Expr, { k: 'call' }>, params: string[], helper: string): Code {
    this.feature(e.path);
    const folded = lit(e); if (typeof folded === 'string') return { c: str(folded), safe: true, t: 'color' };
    const { map } = bind(e.args, params); this.use(helper);
    return { c: `${helper}(${params.map(p => map[p] ? this.expr(map[p]).c : 'null').join(', ')})`.replace(/(, null)+\)$/, ')'), safe: helper !== '$grad', t: 'color' };
  }
  private userCall(e: Extract<Expr, { k: 'call' }>, fn: FnInfo): Code {
    const { map, extra } = bind(e.args, fn.params.map(p => p.name));
    if (extra.length) this.todo(e.line, e.path + '()', 'extra arguments ' + extra.join(', ') + ' are ignored');
    const values = fn.params.map(p => map[p.name] ? this.expr(map[p.name]).c : 'undefined');
    while (values.length && values[values.length - 1] === 'undefined') values.pop();
    if (fn.stateful) values.unshift(this.key('f'));
    return { c: `${fn.js}(${values.join(', ')})`, safe: false, t: fn.tuple ? 'tuple' : 'any' };
  }
  private ta(e: Extract<Expr, { k: 'call' }>, spec: TaSpec): Code {
    this.feature(e.path);
    if (this.loops) this.loopNote(e.line, e.path);
    let params = spec.params;
    const fill: Record<string, string> = {};
    const positional = e.args.filter(arg => arg.name === null).length;
    if (spec.short && positional === spec.short.count && !e.args.some(arg => arg.name === 'source')) { params = spec.short.shift; Object.assign(fill, spec.short.fill); }
    const { map, extra } = bind(e.args, params);
    if (extra.length) this.todo(e.line, e.path + '()', 'arguments ' + extra.join(', ') + ' are not translated');
    const values: string[] = [];
    for (const name of spec.args) {
      if (map[name]) { const value = this.expr(map[name]); values.push(spec.bools?.includes(name) ? this.bool(value) : SERIES_PARAMS.has(name) ? this.num(value) : value.c); }
      else if (fill[name]) values.push(fill[name]);
      else values.push('undefined');
    }
    // trailing omitted arguments use the LV defaults; omitted middle arguments use the stated defaults
    while (values.length && values[values.length - 1] === 'undefined') values.pop();
    for (let i = 0; i < values.length; i++) if (values[i] === 'undefined') { const d = spec.defaults?.[spec.args[i]]; if (d === undefined) return this.todo(e.line, e.path + '()', `missing argument ${spec.args[i]}`); values[i] = d; }
    const call = spec.keyless ? `ctx.ta.${spec.lv}(${values.join(', ')})` : `ctx.ta.${spec.lv}(${[this.key('t'), ...values].join(', ')})`;
    if (spec.tuple) return { c: call, safe: false, t: 'tuple', fields: spec.tuple };
    return { c: call, safe: false, t: spec.type ?? 'num', nn: (spec.type ?? 'num') === 'num' };
  }
  private vwap(e: Extract<Expr, { k: 'call' }>): Code {
    this.feature('ta.vwap');
    const { map } = bind(e.args, ['source', 'anchor', 'stdev_mult']);
    if (map.stdev_mult) return this.todo(e.line, 'ta.vwap() bands', 'the stdev_mult tuple form is not translated in v1');
    const source = map.source ? this.num(this.expr(map.source)) : `ctx.ta.source('hlc3')`;
    let anchor: string;
    if (map.anchor) anchor = this.bool(this.expr(map.anchor)); else { this.use('$newDay'); anchor = '$newDay(ctx)'; this.note('ta.vwap without an anchor resets at each UTC day, not at the exchange session start.'); }
    return { c: `ctx.ta.vwap(${this.key('t')}, ${source}, ${anchor})`, safe: false, t: 'num' };
  }
  private math(e: Extract<Expr, { k: 'call' }>): Code {
    const name = e.path.slice(5); this.feature(e.path);
    if (Object.hasOwn(MATH_UNARY, name)) {
      const spec = MATH_UNARY[name], v = this.arg(e, 0);
      if (v.safe && spec.total) return { c: `${spec.fn}(${v.c})`, safe: true, t: 'num' };
      this.use('$m1'); return { c: `$m1(${spec.fn}, ${v.c})`, safe: false, t: 'num' };
    }
    if (name === 'round') { const { map } = bind(e.args, ['number', 'precision']); const v = map.number ? this.expr(map.number) : { c: 'null', safe: false, t: 'num' as T }; this.use('$round'); return { c: `$round(${v.c}${map.precision ? ', ' + this.expr(map.precision).c : ''})`, safe: v.safe, t: 'num' }; }
    if (name === 'pow') { const { map } = bind(e.args, ['base', 'exponent']); this.use('$m2'); return { c: `$m2(Math.pow, ${map.base ? this.expr(map.base).c : 'null'}, ${map.exponent ? this.expr(map.exponent).c : 'null'})`, safe: false, t: 'num' }; }
    if (name === 'max' || name === 'min' || name === 'avg') {
      const values = e.args.map(arg => this.expr(arg.value));
      if (name !== 'avg' && values.every(v => v.safe)) return { c: `Math.${name}(${values.map(v => v.c).join(', ')})`, safe: true, t: 'num' };
      this.use('$' + name); return { c: `$${name}(${values.map(v => v.c).join(', ')})`, safe: values.every(v => v.safe), t: 'num' };
    }
    if (name === 'sum') { const { map } = bind(e.args, ['source', 'length']); if (this.loops) this.loopNote(e.line, e.path); return { c: `ctx.ta.sum(${this.key('t')}, ${map.source ? this.num(this.expr(map.source)) : 'null'}, ${map.length ? this.expr(map.length).c : '1'})`, safe: false, t: 'num' }; }
    if (name === 'random') { const { map } = bind(e.args, ['min', 'max', 'seed']); this.use('$rand'); if (map.seed) this.note('math.random seed is not translated: CandleScript uses its own snapshotted generator.'); return { c: `$rand(ctx, ${map.min ? this.expr(map.min).c : '0'}, ${map.max ? this.expr(map.max).c : '1'})`, safe: true, t: 'num' }; }
    return this.todo(e.line, e.path + '()', UNSUPPORTED_NAMESPACES.math);
  }

  // ---------- inputs ----------
  private input(e: Extract<Expr, { k: 'call' }>, hint: string | null, line: number): Code | null {
    const kind = e.path === 'input' ? 'generic' : e.path.slice(6);
    const paramsByKind: Record<string, string[]> = {
      generic: ['defval', 'title'], int: ['defval', 'title', 'minval', 'maxval', 'step', 'tooltip', 'inline', 'group', 'confirm'], float: ['defval', 'title', 'minval', 'maxval', 'step', 'tooltip', 'inline', 'group', 'confirm'],
      bool: ['defval', 'title', 'tooltip', 'inline', 'group', 'confirm'], string: ['defval', 'title', 'options', 'tooltip', 'inline', 'group', 'confirm'], text_area: ['defval', 'title', 'tooltip', 'group', 'confirm'],
      color: ['defval', 'title', 'tooltip', 'inline', 'group', 'confirm'], source: ['defval', 'title', 'tooltip', 'inline', 'group'], timeframe: ['defval', 'title', 'options', 'tooltip', 'inline', 'group', 'confirm'],
      symbol: ['defval', 'title', 'tooltip', 'inline', 'group', 'confirm'], session: ['defval', 'title', 'options', 'tooltip', 'inline', 'group', 'confirm'], price: ['defval', 'title', 'tooltip', 'inline', 'group', 'confirm'],
    };
    const params = paramsByKind[kind];
    if (!params) { this.todo(line, e.path + '()', UNSUPPORTED_NAMESPACES.input); return null; }
    const numericOptions = (kind === 'int' || kind === 'float') && e.args[2]?.name === null && e.args[2].value.k === 'tuple';
    const { map } = bind(e.args, numericOptions ? ['defval', 'title', 'options'] : params);
    if (e.args.some(arg => arg.name === 'options')) map.options = e.args.find(arg => arg.name === 'options')!.value;
    let def: unknown = lit(map.defval);
    let type = kind === 'generic' ? null : kind;
    if (map.defval?.k === 'name' && SOURCES.includes(map.defval.path) && (kind === 'source' || kind === 'generic')) { def = map.defval.path; type = 'source'; }
    if (type === null) type = typeof def === 'boolean' ? 'bool' : typeof def === 'string' ? (/^#[0-9a-f]{6}/.test(def) && map.defval?.k !== 'str' ? 'color' : 'string') : typeof def === 'number' ? (map.defval?.k === 'num' && !/[.eE]/.test(map.defval.v) ? 'int' : 'float') : null;
    if (type === 'text_area') type = 'string';
    if (def === undefined || def === null || type === null) { this.todo(line, e.path + '()', 'the default value must be a constant'); return null; }
    if (type === 'source' && typeof def !== 'string') { this.todo(line, e.path + '()', 'source inputs must default to a built-in price source'); return null; }
    let id = hint && NAME.test(hint) && !this.inputIds.has(hint) ? hint : '';
    if (!id) { let n = this.count('input'); while (this.inputIds.has('input_' + n)) n = this.count('input'); id = 'input_' + n; }
    this.inputIds.add(id); this.feature('input.' + (kind === 'generic' ? type : kind));
    const title = lit(map.title);
    const fields: string[] = [`type: ${str(type)}`, `default: ${typeof def === 'string' ? str(def) : String(def)}`, `title: ${str((typeof title === 'string' && title ? title : hint ?? id).slice(0, 100))}`];
    const options = map.options?.k === 'tuple' ? map.options.items.map(item => lit(item)) : null;
    if (type === 'int' || type === 'float' || type === 'price') {
      const lo = lit(map.minval), hi = lit(map.maxval), step = lit(map.step);
      let min = typeof lo === 'number' ? lo : null, max = typeof hi === 'number' ? hi : null;
      if (options && options.every(o => typeof o === 'number')) { min = Math.min(...options as number[]); max = Math.max(...options as number[]); this.note(`input ${id}: numeric options are kept as a minimum and maximum (OpenCandle numeric inputs have no option list).`); }
      if (type === 'int') { if (min !== null) min = Math.ceil(min); if (max !== null) max = Math.floor(max); }
      if (min !== null) fields.push(`min: ${min}`); if (max !== null) fields.push(`max: ${max}`);
      if (typeof step === 'number' && step > 0 && (type !== 'int' || Number.isInteger(step))) fields.push(`step: ${step}`);
    } else if ((type === 'string' || type === 'timeframe' || type === 'session') && options && options.every(o => typeof o === 'string')) {
      if (type !== 'string') { this.note(`input ${id}: a ${type} input with options is kept as a string choice.`); fields[0] = `type: 'string'`; }
      fields.push(`options: [${(options as string[]).map(str).join(', ')}]`);
    }
    if (map.tooltip || map.group || map.inline) this.note('input tooltip, group and inline arguments are not translated.');
    this.inputs.push(`${id}: { ${fields.join(', ')} }`);
    const read = `ctx.input(${str(id)})`;
    if (type === 'source') return { c: `ctx.ta.source(${read})`, safe: true, t: 'num' };
    const t: T = type === 'bool' ? 'bool' : type === 'color' ? 'color' : ['string', 'timeframe', 'symbol', 'session'].includes(type) ? 'str' : 'num';
    return { c: read, safe: true, t };
  }

  // ---------- outputs ----------
  private nextColor(): string { const color = LV_SERIES_COLORS[this.colorTurn % LV_SERIES_COLORS.length]; this.colorTurn++; return str(color); }
  private titleOf(e: Expr | undefined, base: string, line: number): string {
    const value = lit(e);
    if (e && typeof value !== 'string') this.todo(line, base + ' title', 'a title must be a constant string; a generated title is used');
    return this.uniqueTitle(typeof value === 'string' && value ? value : base);
  }
  private constant(e: Expr | undefined, line: number, what: string): string | null {
    if (!e) return null;
    if (e.k === 'name' && Object.hasOwn(PINE_CONSTANTS, e.path)) { if (Object.hasOwn(APPROXIMATED_CONSTANTS, e.path)) this.note(APPROXIMATED_CONSTANTS[e.path] + '.'); return PINE_CONSTANTS[e.path]; }
    this.todo(line, what, 'must be a constant such as plot.style_line; the OpenCandle default is used');
    return null;
  }
  private plot(e: Extract<Expr, { k: 'call' }>): Code {
    this.feature('plot');
    const { map, extra } = bind(e.args, ['series', 'title', 'color', 'linewidth', 'style', 'trackprice', 'histbase', 'offset', 'join', 'editable', 'show_last', 'display', 'format', 'precision', 'force_overlay']);
    const title = this.titleOf(map.title, 'Plot', e.line), value = map.series ? this.expr(map.series) : { c: 'null', safe: false, t: 'num' as T };
    const opts: string[] = [`color: ${map.color ? this.expr(map.color).c : this.nextColor()}`];
    const width = lit(map.linewidth); if (typeof width === 'number') opts.push(`linewidth: ${Math.max(1, Math.min(10, Math.round(width)))}`);
    const style = this.constant(map.style, e.line, 'plot style'); if (style) opts.push(`style: ${str(style)}`);
    const offset = lit(map.offset); if (map.offset) { if (typeof offset === 'number' && Number.isInteger(offset)) opts.push(`offset: ${Math.max(-500, Math.min(500, offset))}`); else this.todo(e.line, 'plot offset', 'must be a constant integer'); }
    const display = map.display ? this.constant(map.display, e.line, 'plot display') : null; if (display) opts.push(`display: ${str(display)}`);
    for (const name of ['trackprice', 'histbase', 'join', 'show_last', 'format', 'precision']) if (map[name]) this.note(`plot argument ${name} is not translated.`);
    if (extra.length) this.todo(e.line, 'plot()', 'arguments ' + extra.join(', ') + ' are not translated');
    return { c: `ctx.plot(${str(title)}, ${this.num(value)}, { ${opts.join(', ')} })`, safe: true, t: 'plot', title };
  }
  private plotshape(e: Extract<Expr, { k: 'call' }>, char: boolean): Code {
    this.feature(char ? 'plotchar' : 'plotshape');
    const params = char ? ['series', 'title', 'char', 'location', 'color', 'offset', 'text', 'textcolor', 'editable', 'size', 'show_last', 'display'] : ['series', 'title', 'style', 'location', 'color', 'offset', 'text', 'textcolor', 'editable', 'size', 'show_last', 'display'];
    const { map } = bind(e.args, params);
    const title = this.titleOf(map.title, char ? 'Character' : 'Shape', e.line), cond = map.series ? this.expr(map.series) : { c: 'false', safe: true, t: 'bool' as T };
    const opts: string[] = [];
    if (!char) { const shape = this.constant(map.style, e.line, 'plotshape style'); if (shape) opts.push(`shape: ${str(shape)}`); }
    const location = this.constant(map.location, e.line, 'location'); if (location) opts.push(`location: ${str(location)}`);
    opts.push(`color: ${map.color ? this.expr(map.color).c : this.nextColor()}`);
    const size = this.constant(map.size, e.line, 'size'); if (size) opts.push(`size: ${str(size)}`);
    if (!char && map.text) { const text = lit(map.text); if (typeof text === 'string') opts.push(`text: ${str(text.slice(0, 40))}`); else this.todo(e.line, 'plotshape text', 'must be a constant string'); }
    if (map.offset || map.textcolor) this.note('plotshape/plotchar offset and textcolor are not translated.');
    if (char) { const ch = lit(map.char); const glyph = typeof ch === 'string' && ch.length >= 1 ? [...ch].slice(0, 1).join('') : '*'; return { c: `ctx.plotchar(${str(title)}, ${this.bool(cond)}, ${str(glyph)}, { ${opts.join(', ')} })`, safe: true, t: 'void' }; }
    return { c: `ctx.plotshape(${str(title)}, ${this.bool(cond)}, { ${opts.join(', ')} })`, safe: true, t: 'void' };
  }
  private plotarrow(e: Extract<Expr, { k: 'call' }>): Code {
    this.feature('plotarrow');
    const { map } = bind(e.args, ['series', 'title', 'colorup', 'colordown', 'offset', 'minheight', 'maxheight', 'editable', 'show_last', 'display']);
    const title = this.titleOf(map.title, 'Arrows', e.line), value = map.series ? this.expr(map.series) : { c: 'null', safe: false, t: 'num' as T };
    const opts: string[] = []; if (map.colorup) opts.push(`colorup: ${this.expr(map.colorup).c}`); if (map.colordown) opts.push(`colordown: ${this.expr(map.colordown).c}`);
    return { c: `ctx.plotarrow(${str(title)}, ${this.num(value)}${opts.length ? `, { ${opts.join(', ')} }` : ''})`, safe: true, t: 'void' };
  }
  private hline(e: Extract<Expr, { k: 'call' }>): Code {
    this.feature('hline');
    const { map } = bind(e.args, ['price', 'title', 'color', 'linestyle', 'linewidth', 'editable', 'display']);
    const title = this.titleOf(map.title, 'Level', e.line), price = map.price ? this.expr(map.price) : { c: '0', safe: true, t: 'num' as T };
    const opts: string[] = []; if (map.color) opts.push(`color: ${this.expr(map.color).c}`);
    const style = this.constant(map.linestyle, e.line, 'hline style'); if (style) opts.push(`lineStyle: ${str(style)}`);
    const width = lit(map.linewidth); if (typeof width === 'number') opts.push(`width: ${Math.max(1, Math.min(4, Math.round(width)))}`);
    return { c: `ctx.hline(${str(title)}, ${price.c}${opts.length ? `, { ${opts.join(', ')} }` : ''})`, safe: true, t: 'hline', title };
  }
  private fill(e: Extract<Expr, { k: 'call' }>): Code {
    this.feature('fill');
    if (e.args.some(arg => arg.name === 'top_value' || arg.name === 'top_color') || e.args.filter(arg => arg.name === null).length >= 6) return this.todo(e.line, 'gradient fill()', 'gradient fills are not translated in v1');
    const { map } = bind(e.args, ['hline1', 'hline2', 'color', 'title', 'editable', 'fillgaps', 'display']);
    const a = map.hline1 ? this.expr(map.hline1) : null, b = map.hline2 ? this.expr(map.hline2) : null;
    if (!a?.title || !b?.title || a.t !== b.t) return this.todo(e.line, 'fill()', 'both ends must be plot() or hline() results stored in variables');
    const title = this.titleOf(map.title, 'Fill', e.line);
    const opts: string[] = []; if (map.color) opts.push(`color: ${this.expr(map.color).c}`); if (a.t === 'hline') opts.push(`between: 'hlines'`);
    return { c: `ctx.fill(${str(title)}, ${str(a.title)}, ${str(b.title)}${opts.length ? `, { ${opts.join(', ')} }` : ''})`, safe: true, t: 'void' };
  }
  private alertcondition(e: Extract<Expr, { k: 'call' }>): Code {
    this.feature('alertcondition');
    const { map } = bind(e.args, ['condition', 'title', 'message']);
    const titleValue = lit(map.title), message = lit(map.message);
    const title = this.uniqueTitle(typeof titleValue === 'string' && titleValue ? titleValue : 'Alert ' + (this.conditions.size + 1));
    if (map.message && typeof message !== 'string') this.note('alertcondition messages must be constant strings; the title is used as the message.');
    this.conditions.set(title, typeof message === 'string' ? message.slice(0, 1000) : title);
    if (typeof message === 'string' && /\{\{/.test(message)) this.note('alertcondition {{placeholders}} are kept as text.');
    return { c: `ctx.alertcondition(${str(title)}, ${map.condition ? this.bool(this.expr(map.condition)) : 'false'})`, safe: true, t: 'void' };
  }
  private qtyRead(): string {
    if (!this.qtyInput) { let id = 'order_qty'; while (this.inputIds.has(id)) id += '_'; this.qtyInput = id; this.inputIds.add(id); }
    return `ctx.input(${str(this.qtyInput)})`;
  }
  private strategyCall(e: Extract<Expr, { k: 'call' }>): Code {
    const name = e.path.slice(9);
    if (this.declaration !== 'strategy') return this.todo(e.line, e.path + '()', 'strategy functions need a strategy() declaration');
    const opt = (map: Record<string, Expr>, key: string) => map[key] ? this.expr(map[key]).c : 'null';
    if (name === 'entry' || name === 'order') {
      this.feature(e.path); this.use('$entry');
      const { map } = bind(e.args, ['id', 'direction', 'qty', 'limit', 'stop', 'oca_name', 'oca_type', 'comment', 'alert_message', 'disable_alert']);
      if (map.oca_name || map.comment || map.alert_message) this.note('strategy order oca_name, comment and alert_message are not translated.');
      const qty = map.qty ? this.expr(map.qty).c : this.qtyRead();
      return { c: `$entry(ctx, S, ${opt(map, 'id')}, ${map.direction ? this.expr(map.direction).c : "'long'"}, ${qty}, ${opt(map, 'limit')}, ${opt(map, 'stop')}, ${name === 'entry'})`, safe: true, t: 'void' };
    }
    if (name === 'close' || name === 'close_all') {
      this.feature(e.path); this.use('$close');
      const { map } = bind(e.args, name === 'close' ? ['id', 'comment', 'qty', 'qty_percent', 'alert_message', 'immediately', 'disable_alert'] : ['comment', 'alert_message', 'immediately', 'disable_alert']);
      if (name === 'close') this.note('strategy.close closes the whole open position (OpenCandle keeps one net position), not only the named entry.');
      if (map.qty || map.qty_percent) this.note('strategy.close qty and qty_percent are not translated: the whole position is closed.');
      return { c: `$close(ctx, S, ${name === 'close' ? opt(map, 'id') : 'null'}, ${this.qtyRead()})`, safe: true, t: 'void' };
    }
    if (name === 'exit') {
      this.feature(e.path); this.use('$clean');
      const { map } = bind(e.args, ['id', 'from_entry', 'qty', 'qty_percent', 'profit', 'limit', 'loss', 'stop', 'trail_price', 'trail_points', 'trail_offset', 'oca_name', 'comment']);
      const fields: [string, string][] = [['fromEntry', 'from_entry'], ['quantity', 'qty'], ['quantityPercent', 'qty_percent'], ['profit', 'profit'], ['limit', 'limit'], ['loss', 'loss'], ['stop', 'stop'], ['trailPrice', 'trail_price'], ['trailPoints', 'trail_points'], ['trailOffset', 'trail_offset'], ['ocaName', 'oca_name']];
      const spec = fields.filter(([, pine]) => map[pine]).map(([lv, pine]) => `${lv}: ${this.expr(map[pine]).c}`);
      return { c: `ctx.exit(${opt(map, 'id')}, $clean({ ${spec.join(', ')} }))`, safe: true, t: 'void' };
    }
    if (name === 'cancel') { this.feature(e.path); return { c: `ctx.cancel(${this.arg(e, 0).c})`, safe: true, t: 'void' }; }
    return this.todo(e.line, e.path + '()', UNSUPPORTED_NAMESPACES.strategy);
  }

  // ---------- result ----------
  finish(version: number | null, errors: PineImportReport['errors']): PineImportResult {
    const kind: 'indicator' | 'strategy' = this.declaration === 'strategy' ? 'strategy' : 'indicator';
    if (this.qtyInput) this.inputs.push(`${this.qtyInput}: { type: 'float', default: ${this.qty}, min: 0.00000001, title: 'Order size (units)' }`);
    if (this.inputs.length > 32) this.issues.push({ line: 0, construct: 'inputs', reason: `CandleScript allows 32 inputs; this script declares ${this.inputs.length}` });
    if (this.conditions.size > 32) this.issues.push({ line: 0, construct: 'alertcondition', reason: `CandleScript allows 32 alert conditions; this script declares ${this.conditions.size}` });
    const lines: string[] = ['(() => {'];
    lines.push(`  // Translated from Pine Script${version ? ' v' + version : ''} by the OpenCandle Pine importer: "${this.title.replace(/[\r\n]/g, ' ')}".`);
    lines.push('  // Review every TODO(pine) comment: those parts were not translated. na is null in CandleScript.');
    for (const code of helperSource(this.helpers)) lines.push('  ' + code);
    lines.push('  return {');
    if (this.inputs.length) { lines.push('    inputs: {'); lines.push(this.inputs.map(row => '      ' + row).join(',\n')); lines.push('    },'); }
    if (this.conditions.size) { lines.push('    conditions: {'); lines.push([...this.conditions].map(([name, message]) => `      ${str(name)}: ${str(message)}`).join(',\n')); lines.push('    },'); }
    lines.push('    onBar(ctx) {');
    const body = this.out.join('\n');
    if (/\bS\b/.test(body.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/gm, ''))) lines.push('      const S = ctx.state;');
    if (body) lines.push(body);
    lines.push('    }');
    lines.push('  };');
    lines.push('})()');
    const source = lines.join('\n').replace(FORBIDDEN, word => '\\u00' + word.charCodeAt(0).toString(16) + word.slice(1));
    const ok = this.declaration !== 'library' && (version === null || version >= 5);
    const report: PineImportReport = {
      version, declaration: this.declaration, title: this.title,
      statements: { total: this.statementCount, translated: this.statementClean },
      translated: [...this.features].sort(), unsupported: [...this.issues].sort((a, b) => a.line - b.line), notes: [...this.notes], errors,
    };
    if (version !== null && version < 5) report.unsupported.unshift({ line: 1, construct: '//@version=' + version, reason: 'only Pine v5 and v6 are supported; update the script to v5 or later first' });
    if (this.declaration === null) report.notes.unshift('No indicator() or strategy() declaration was found; the script is imported as an indicator.');
    return { ok, name: (this.title || 'Imported Pine script').slice(0, 100), kind, pane: this.overlay ? 'price' : 'new', source, report };
  }
}

/** Translates Pine Script v5/v6 source to an LVScript source with a report of what was and was not translated. */
export function translatePine(source: string): PineImportResult {
  const parsed = parsePine(source);
  const translator = new Translator(parsed.lines);
  translator.program(parsed.body);
  return translator.finish(parsed.version, parsed.errors);
}
