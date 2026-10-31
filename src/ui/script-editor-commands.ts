import { EditorState, type Transaction, type TransactionSpec } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { ensureSyntaxTree, indentRange, syntaxTree } from '@codemirror/language';
import { SearchQuery, replaceAll, replaceNext, search, setSearchQuery } from '@codemirror/search';
import { history, redo, undo } from '@codemirror/commands';
import { parser } from '@lezer/javascript';

/** Editor commands for CandleScript documents. Everything here is local text processing: nothing executes guest code. */
export const SCRIPT_SOURCE_BYTES = 65536;
export const SCRIPT_CONSOLE_LIMIT = 200;
export const SCRIPT_CONSOLE_MESSAGE_CHARS = 1000;
/** The ctx members CandleScript v1 defines (electron/script-runtime.cjs). Anything else reads as undefined at run time. */
export const LVSCRIPT_CONTEXT_MEMBERS = Object.freeze(['bar', 'index', 'state', 'sma', 'plot', 'alert', 'alertcondition', 'order', 'exit', 'cancel', 'input', 'request', 'timeframe', 'symbol', 'random', 'ta', 'history', 'series', 'hline', 'fill', 'bgcolor', 'plotshape', 'plotchar', 'barcolor', 'label', 'line', 'box', 'table', 'log', 'strategy', 'plotarrow', 'calendar', 'insession', 'nz', 'barstate', 'linefill', 'polyline']);
/** The ctx.ta library (electron/script-ta.cjs). */
export const LVSCRIPT_TA_FUNCTIONS = Object.freeze(['sma', 'ema', 'rma', 'wma', 'vwma', 'hma', 'rsi', 'macd', 'stoch', 'tr', 'atr', 'bb', 'kc', 'dmi', 'cci', 'mfi', 'obv', 'highest', 'lowest', 'highestbars', 'lowestbars', 'change', 'mom', 'roc', 'stdev', 'variance', 'correlation', 'crossover', 'crossunder', 'cross', 'rising', 'falling', 'barssince', 'valuewhen', 'pivothigh', 'pivotlow', 'cum', 'sum', 'alma', 'dema', 'tema', 'swma', 'linreg', 'vwap', 'wpr', 'cmo', 'tsi', 'percentrank', 'cog', 'median', 'dev', 'range', 'percentile_nearest_rank', 'percentile_linear_interpolation', 'max', 'min', 'bbw', 'kcw', 'sar', 'supertrend', 'accdist', 'pvt', 'source', 'fixnan', 'mode', 'wad', 'wvad', 'iii', 'nvi', 'pvi', 'pivot_point_levels']);
export interface ScriptDiagnostic { readonly line: number; readonly column: number; readonly offset: number; readonly severity: 'error' | 'warning'; readonly code: string; readonly message: string }
export interface ScriptCompilation { readonly ok: boolean; readonly diagnostics: readonly ScriptDiagnostic[] }

const MAX_DIAGNOSTICS = 50;
function position(source: string, offset: number) {
  const bounded = Math.max(0, Math.min(offset, source.length)), before = source.slice(0, bounded), line = before.split('\n').length;
  return { offset: bounded, line, column: bounded - (before.lastIndexOf('\n') + 1) + 1 };
}
const diagnostic = (source: string, offset: number, severity: ScriptDiagnostic['severity'], code: string, message: string): ScriptDiagnostic => Object.freeze({ ...position(source, offset), severity, code, message });

/**
 * Static check of a CandleScript v1 definition without executing it. Errors match what the restricted runtime rejects:
 * the 64 KiB UTF-8 bound, control characters, the async/module token ban (applied even inside comments and strings,
 * exactly as the runtime does) and JavaScript syntax of `(` + source + `)`, the expression the runtime compiles.
 * Warnings flag constructs that would fail or silently read undefined at run time.
 */
export function compileLVScript(source: string): ScriptCompilation {
  if (typeof source !== 'string') throw new TypeError('Script source must be text.');
  const diagnostics: ScriptDiagnostic[] = [], push = (value: ScriptDiagnostic) => { if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(value); };
  if (new TextEncoder().encode(source).byteLength > SCRIPT_SOURCE_BYTES) return Object.freeze({ ok: false, diagnostics: Object.freeze([diagnostic(source, 0, 'error', 'SOURCE_LIMIT', 'Script source exceeds 64 KiB UTF-8.')]) });
  const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.exec(source);
  if (control) push(diagnostic(source, control.index, 'error', 'CONTROL_CHARACTER', 'Control characters are not allowed in script source.'));
  for (const match of source.matchAll(/\b(async|await|import|export|Promise)\b/g)) push(diagnostic(source, match.index!, 'error', 'UNSUPPORTED_SYNTAX', `CandleScript v1 rejects "${match[1]}": asynchronous code, modules and Promise are unsupported (also inside comments and strings).`));
  const wrapped = '(' + source + ')', tree = parser.parse(wrapped), seen = new Set<number>();
  let syntaxErrors = 0;
  tree.iterate({ enter: node => {
    if (!node.type.isError) return;
    const offset = Math.min(Math.max(node.from - 1, 0), source.length);
    if (seen.has(offset)) return false;
    seen.add(offset); if (++syntaxErrors > 10) return false;
    const near = source.slice(offset, offset + 20).split('\n')[0], lastLine = source.slice(source.lastIndexOf('\n') + 1);
    push(diagnostic(source, offset, 'error', 'SYNTAX', offset >= source.length ? 'Syntax error: the definition ends before an expression, bracket or string is closed.' + (/\/\//.test(lastLine) ? ' A line comment on the last line also hides the closing parenthesis the runtime appends.' : '') : `Syntax error near "${near}".`));
    return false;
  } });
  if (!syntaxErrors) {
    const top = tree.topNode.firstChild;
    if (!top || top.name !== 'ExpressionStatement' || top.nextSibling) push(diagnostic(source, 0, 'error', 'SYNTAX', 'The source must be one expression that evaluates to the script definition object.'));
  }
  if (!/\bonBar\b/.test(source)) push(diagnostic(source, 0, 'warning', 'MISSING_ONBAR', 'Define an onBar(ctx) function; the runtime rejects a definition without one.'));
  for (const match of source.matchAll(/\bctx\s*\.\s*([A-Za-z_$][\w$]*)/g)) if (!LVSCRIPT_CONTEXT_MEMBERS.includes(match[1])) push(diagnostic(source, match.index! + match[0].length - match[1].length, 'warning', 'UNKNOWN_API', `ctx.${match[1]} is not part of CandleScript v1 and reads as undefined. Available: ${LVSCRIPT_CONTEXT_MEMBERS.join(', ')}.`));
  for (const match of source.matchAll(/\bctx\s*\.\s*ta\s*\.\s*([A-Za-z_$][\w$]*)/g)) if (!LVSCRIPT_TA_FUNCTIONS.includes(match[1])) push(diagnostic(source, match.index! + match[0].length - match[1].length, 'warning', 'UNKNOWN_API', `ctx.ta.${match[1]} is not part of the CandleScript TA library and reads as undefined. Available: ${LVSCRIPT_TA_FUNCTIONS.join(', ')}.`));
  for (const match of source.matchAll(/\bMath\s*\.\s*random\b/g)) push(diagnostic(source, match.index!, 'warning', 'NONDETERMINISTIC', 'Math.random throws in CandleScript; use ctx.random() for deterministic randomness.'));
  for (const match of source.matchAll(/\b(Date|Proxy|eval|Function)\b/g)) push(diagnostic(source, match.index!, 'warning', 'UNAVAILABLE_GLOBAL', `${match[1]} is unavailable inside the restricted runtime.`));
  diagnostics.sort((a, b) => a.offset - b.offset || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return Object.freeze({ ok: !diagnostics.some(row => row.severity === 'error'), diagnostics: Object.freeze(diagnostics) });
}

function scriptState(source: string, extra: readonly import('@codemirror/state').Extension[] = []) { return EditorState.create({ doc: source, extensions: [javascript(), ...extra] }); }
/**
 * LV original formatting: re-indent every line with the JavaScript language's indentation rules (2-space unit) and
 * remove trailing spaces/tabs. Lines inside template strings and block comments are left untouched. Refuses
 * sources with syntax errors so a broken parse cannot reshape code.
 */
export function formatLVScript(source: string): string {
  const compiled = compileLVScript(source);
  if (compiled.diagnostics.some(row => row.code === 'SYNTAX' || row.code === 'SOURCE_LIMIT')) throw new Error('Fix syntax errors before formatting. Nothing was changed.');
  let state = scriptState(source);
  if (!ensureSyntaxTree(state, state.doc.length, 5000)) throw new Error('The document could not be parsed in time. Nothing was changed.');
  state = state.update({ changes: indentRange(state, 0, state.doc.length) }).state;
  const tree = ensureSyntaxTree(state, state.doc.length, 5000) ?? syntaxTree(state), changes: { from: number; to: number }[] = [];
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number), trailing = /[ \t]+$/.exec(line.text);
    if (!trailing) continue;
    const protectedNode = tree.resolveInner(line.to, -1);
    let inside = false; for (let node: typeof protectedNode | null = protectedNode; node; node = node.parent) if (node.name === 'TemplateString' || node.name === 'BlockComment' || node.name === 'String') { inside = true; break; }
    if (!inside) changes.push({ from: line.from + trailing.index, to: line.to });
  }
  return state.update({ changes }).state.doc.toString();
}

export interface ScriptSearchSpec { readonly search: string; readonly caseSensitive?: boolean; readonly regexp?: boolean; readonly wholeWord?: boolean; readonly replace?: string }
export interface ScriptMatch { readonly from: number; readonly to: number; readonly line: number; readonly column: number }
function query(spec: ScriptSearchSpec) { const value = new SearchQuery({ search: spec.search, caseSensitive: spec.caseSensitive ?? false, regexp: spec.regexp ?? false, wholeWord: spec.wholeWord ?? false, replace: spec.replace ?? '' }); if (!value.valid) throw new Error('Enter a valid search text or regular expression.'); return value; }
/** Matches with the same SearchQuery engine the editor's Find panel uses. Never changes the document. */
export function findScriptMatches(source: string, spec: ScriptSearchSpec, limit = 1000): ScriptMatch[] {
  const state = scriptState(source), cursor = query(spec).getCursor(state) as Iterator<{ from: number; to: number }>, rows: ScriptMatch[] = [];
  for (let next = cursor.next(); !next.done && rows.length < limit; next = cursor.next()) { const { line, column } = position(source, next.value.from); rows.push(Object.freeze({ from: next.value.from, to: next.value.to, line, column })); }
  return rows;
}
/**
 * Runs the editor panel's own replaceNext/replaceAll commands. Those commands read only `state` and call `dispatch`
 * (@codemirror/search 6.7), so a state host reproduces the panel's replacement semantics exactly, including regular
 * expression group references. replaceNext replaces the match at the selection, then selects the following match.
 */
export function replaceScriptMatches(source: string, spec: ScriptSearchSpec & { replace: string }, mode: 'next' | 'all', selection: { anchor: number; head?: number } = { anchor: 0 }) {
  let state = scriptState(source, [search()]);
  state = state.update({ effects: setSearchQuery.of(query(spec)), selection }).state;
  const host = { get state() { return state; }, dispatch(input: TransactionSpec | Transaction) { state = 'startState' in input ? input.state : state.update(input).state; } };
  const changed = (mode === 'all' ? replaceAll : replaceNext)(host as never);
  return { source: state.doc.toString(), changed, selection: { anchor: state.selection.main.anchor, head: state.selection.main.head } };
}

/** Editor-document history only. Uses the same history() extension and undo/redo commands as the editor keymap. */
export function scriptHistoryState(source: string) { return EditorState.create({ doc: source, extensions: [history()] }); }
export function scriptHistoryCommand(state: EditorState, command: 'undo' | 'redo') {
  let next = state; const ran = (command === 'undo' ? undo : redo)({ state, dispatch: transaction => { next = transaction.state; } });
  return { state: next, ran };
}

export interface ScriptConsoleEntry { readonly sequence: number; readonly time: string; readonly level: 'info' | 'warning' | 'error'; readonly message: string }
/** Bounded plain-text log. Control characters are removed; React renders entries as text, never HTML. */
export function appendScriptConsole(entries: readonly ScriptConsoleEntry[], level: ScriptConsoleEntry['level'], message: string, now: Date = new Date()): ScriptConsoleEntry[] {
  if (!['info', 'warning', 'error'].includes(level)) throw new Error('Unknown console level.');
  const clean = String(message).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, SCRIPT_CONSOLE_MESSAGE_CHARS), sequence = (entries.at(-1)?.sequence ?? 0) + 1;
  return [...entries, Object.freeze({ sequence, time: now.toISOString(), level, message: clean })].slice(-SCRIPT_CONSOLE_LIMIT);
}
/** The compile summary. The compile step of a run (`running`) does not claim that
 * nothing was executed when it passes, since the run goes on to execute the script. */
export function describeCompilation(result: ScriptCompilation, options: { running?: boolean } = {}): string {
  const errors = result.diagnostics.filter(row => row.severity === 'error').length, warnings = result.diagnostics.length - errors;
  return result.ok ? `Compiled without errors${warnings ? ` (${warnings} warning${warnings === 1 ? '' : 's'})` : ''}.${options.running ? '' : ' Nothing was executed.'}` : `Compilation failed: ${errors} error${errors === 1 ? '' : 's'}${warnings ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}. Nothing was executed.`;
}
