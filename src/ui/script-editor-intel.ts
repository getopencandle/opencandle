import { EditorView, ViewPlugin, hoverTooltip, type ViewUpdate } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { linter, lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { compileLVScript, LVSCRIPT_CONTEXT_MEMBERS, LVSCRIPT_TA_FUNCTIONS, type ScriptDiagnostic } from './script-editor-commands';

/**
 * Editor intelligence for CandleScript: API reference data, completion, hover documentation, error squiggles, a minimap-lite and
 * the command palette model. Everything is local text processing; nothing here executes guest code. Wording is original.
 */
export interface ScriptApiDoc { readonly signature: string; readonly summary: string }
const doc = (signature: string, summary: string): ScriptApiDoc => Object.freeze({ signature, summary });

export const LVSCRIPT_CONTEXT_DOCS: Readonly<Record<string, ScriptApiDoc>> = Object.freeze({
  bar: doc('ctx.bar', 'The current bar: id, revision, time (Unix seconds), open, high, low, close and volume. Read-only.'),
  index: doc('ctx.index', 'Zero-based count of bars processed before the current one.'),
  state: doc('ctx.state', 'Plain JSON object that carries values from one bar to the next.'),
  sma: doc('ctx.sma(key, value, length)', 'Simple moving average with its own trailing window. Returns null until the window is full.'),
  plot: doc('ctx.plot(title, valueOrNull, colorOrOptions?)', 'Emits one plotted value for the current bar; null leaves a gap. The colour may change per bar (null: none). Options: color, style (line, stepline, histogram, columns, circles, cross, area, areabr, linebr), linewidth 1 to 10, offset in bars, display (all, none, pane, data_window, status_line, price_scale or a list).'),
  alert: doc('ctx.alert(name, message)', 'Raises a named alert once per bar observation.'),
  alertcondition: doc('ctx.alertcondition(name, condition, message?)', 'Publishes a named true/false series that alert rules can use.'),
  order: doc("ctx.order('buy'|'sell', quantity, options?)", 'Proposes a virtual order. Nothing reaches a real account.'),
  exit: doc('ctx.exit(name, specification)', 'Proposes a virtual exit (stop, limit or both) for the open position.'),
  cancel: doc('ctx.cancel(name)', 'Cancels a pending virtual proposal by name.'),
  input: doc('ctx.input(name)', 'Reads the value of an input declared in the definition inputs list.'),
  request: doc('ctx.request(name)', 'Reads a named source request declared in the definition. Absent data stays unavailable.'),
  timeframe: doc('ctx.timeframe(name, n = 0)', 'The latest completed bar (n = 0) or an earlier completed bar of a higher timeframe declared in timeframes, with its period end, or null. A developing bar is never returned.'),
  symbol: doc('ctx.symbol(name, n = 0)', 'The latest completed bar (n = 0) or an earlier one of a loaded symbol declared in symbols, at the chart interval, or null. Never opens a data connection.'),
  random: doc('ctx.random()', 'Deterministic random number in [0, 1). Use it instead of Math.random.'),
  ta: doc('ctx.ta.<function>(key, ...)', 'The technical-analysis library. Each call takes a series key (1 to 128 characters) first.'),
  history: doc('ctx.history(n, source?)', 'The bar n steps back (0 is the current bar), or null. With a price source such as close or hl2, that number instead. Depth up to 500; never a later bar.'),
  series: doc('ctx.series(key, value, depth = 100)', 'Retains a bounded series and returns an accessor; call it as saved(n). Depth up to 500.'),
  hline: doc('ctx.hline(title, price, options?)', 'Draws a horizontal line at a price level. Options: color, lineStyle, width.'),
  fill: doc('ctx.fill(title, from, to, options?)', "Shades between two plot titles, or two hline titles with between: 'hlines'. The color may change per bar; null leaves a bar unfilled."),
  bgcolor: doc('ctx.bgcolor(color)', 'Tints the background of the current bar.'),
  plotshape: doc('ctx.plotshape(condition, options?)', 'Draws a marker shape on bars where the condition holds.'),
  plotchar: doc('ctx.plotchar(condition, options?)', 'Draws a text character on bars where the condition holds.'),
  barcolor: doc('ctx.barcolor(color)', 'Recolors the current candle.'),
  label: doc('ctx.label.new(options)', 'Chart labels. Also set(id, options), get(id), delete(id) and all().'),
  line: doc('ctx.line.new(options)', 'Chart lines between two points. Also set, get, delete and all.'),
  box: doc('ctx.box.new(options)', 'Chart boxes. Also set, get, delete and all.'),
  table: doc('ctx.table.new({position, columns, rows})', 'Anchored tables: new, cell(id, column, row, options), clear, delete and all. At most 20 columns and 50 rows.'),
  log: doc('ctx.log.info(...values)', 'Writes 1 to 16 values to the Logs view. Also warn and error.'),
  strategy: doc('ctx.strategy', 'The simulated position as the Strategy tester supplies it. Only present with that feed.'),
  plotarrow: doc('ctx.plotarrow(title, valueOrNull, options?)', 'Up arrow below the bar for a positive value, down arrow above it for a negative one. Options: colorup, colordown, size.'),
  calendar: doc("ctx.calendar(time = bar time, zone = 'UTC')", 'Year, month, dayofmonth, dayofweek (1 is Sunday), dayofyear, hour, minute, second and offset minutes of a Unix-seconds time in a zone such as UTC+5 or America/New_York.'),
  insession: doc("ctx.insession(session, zone = 'UTC', time = bar time)", 'True when the time falls inside a session such as 0930-1600:23456 (day digits, 1 is Sunday) or 24x7.'),
  nz: doc('ctx.nz(value, replacement = 0)', 'The value, or the replacement when it is null, undefined or NaN.'),
  barstate: doc('ctx.barstate', 'Flags of the current bar: isfirst (first processed bar) and islast (last bar of this calculation).'),
  linefill: doc('ctx.linefill.new({line1, line2, color})', 'Fills between two live lines; deleting either line deletes it. Also set(id, {color}), get, delete and all. 50 kept by default.'),
  polyline: doc('ctx.polyline.new({points, xloc, curved, closed, lineColor, fillColor, lineWidth, lineStyle})', 'A path through 2 to 1,000 {x, y} points. Also get, delete and all. 50 kept by default, at most 100.')
});

const TA_ROWS: readonly (readonly [string, string, string])[] = [
  ['sma', 'key, value, length', 'Simple moving average.'], ['ema', 'key, value, length', 'Exponential moving average.'], ['rma', 'key, value, length', 'Smoothed moving average with alpha 1/length.'],
  ['wma', 'key, value, length', 'Linearly weighted moving average.'], ['vwma', 'key, value, length', 'Volume weighted moving average.'], ['hma', 'key, value, length', 'Hull moving average.'],
  ['rsi', 'key, value, length', 'Relative strength index, 0 to 100.'], ['macd', 'key, value, fast = 12, slow = 26, signal = 9', 'Moving average convergence divergence: line, signal and histogram.'],
  ['stoch', 'key, value, high, low, length', 'Stochastic oscillator percent K.'], ['tr', 'handleNa = false', 'True range of the current bar.'],
  ['atr', 'key, length', 'Average true range.'], ['bb', 'key, value, length, multiplier = 2', 'Bollinger bands: basis, upper and lower.'],
  ['kc', 'key, value, length, multiplier, useTrueRange = true', 'Keltner channels: basis, upper and lower.'], ['dmi', 'key, diLength, adxSmoothing', 'Directional movement: plus DI, minus DI and ADX.'],
  ['cci', 'key, value, length', 'Commodity channel index.'], ['mfi', 'key, value, length', 'Money flow index.'], ['obv', 'key', 'On-balance volume.'],
  ['highest', 'key, value, length', 'Highest value over the window.'], ['lowest', 'key, value, length', 'Lowest value over the window.'],
  ['highestbars', 'key, value, length', 'Bars back to the window high (zero or negative).'], ['lowestbars', 'key, value, length', 'Bars back to the window low (zero or negative).'],
  ['change', 'key, value, length = 1', 'Difference from length bars ago.'], ['mom', 'key, value, length', 'Momentum: value minus value length bars ago.'], ['roc', 'key, value, length', 'Rate of change in percent.'],
  ['stdev', 'key, value, length, biased = true', 'Standard deviation over the window.'], ['variance', 'key, value, length, biased = true', 'Variance over the window.'],
  ['correlation', 'key, a, b, length', 'Correlation of two series over the window.'], ['crossover', 'key, a, b', 'True on the bar where a rises above b.'],
  ['crossunder', 'key, a, b', 'True on the bar where a falls below b.'], ['cross', 'key, a, b', 'True on a crossing in either direction.'],
  ['rising', 'key, value, length', 'True when the series rose on each of the last length bars.'], ['falling', 'key, value, length', 'True when the series fell on each of the last length bars.'],
  ['barssince', 'key, condition', 'Bars since the condition was last true.'], ['valuewhen', 'key, condition, value, occurrence = 0', 'The value on the bar the condition was last true.'],
  ['pivothigh', 'key, value, left, right', 'Pivot high price once confirmed by right bars, else null.'], ['pivotlow', 'key, value, left, right', 'Pivot low price once confirmed by right bars, else null.'],
  ['cum', 'key, value', 'Running total.'], ['sum', 'key, value, length', 'Sum over the window.'],
  ['alma', 'key, value, length, offset = 0.85, sigma = 6, floor = false', 'Gaussian weighted moving average.'], ['dema', 'key, value, length', 'Double exponential moving average.'],
  ['tema', 'key, value, length', 'Triple exponential moving average.'], ['swma', 'key, value', 'Four-bar symmetric weighted average.'],
  ['linreg', 'key, value, length, offset = 0', 'Least-squares regression line value.'], ['vwap', 'key, value, anchor = false, multiplier?', 'Volume weighted average price, optionally with bands.'],
  ['wpr', 'key, length', 'Williams percent range.'], ['cmo', 'key, value, length', 'Chande momentum oscillator.'], ['tsi', 'key, value, shortLength, longLength', 'True strength index as a ratio.'],
  ['percentrank', 'key, value, length', 'Percent of preceding values at or below the current one.'], ['cog', 'key, value, length', 'Center of gravity oscillator.'],
  ['median', 'key, value, length', 'Median over the window.'], ['dev', 'key, value, length', 'Mean absolute deviation.'], ['range', 'key, value, length', 'Highest minus lowest over the window.'],
  ['percentile_nearest_rank', 'key, value, length, percentage', 'Percentile by nearest rank.'], ['percentile_linear_interpolation', 'key, value, length, percentage', 'Percentile by linear interpolation.'],
  ['max', 'key, value', 'Running maximum.'], ['min', 'key, value', 'Running minimum.'], ['bbw', 'key, value, length, multiplier = 2', 'Bollinger band width as a ratio.'],
  ['kcw', 'key, value, length, multiplier, useTrueRange = true', 'Keltner channel width as a ratio.'], ['sar', 'key, start, increment, maximum', 'Parabolic stop and reverse.'],
  ['supertrend', 'key, factor, atrLength', 'Supertrend: value and direction (-1 up, +1 down).'], ['accdist', 'key', 'Accumulation/distribution.'], ['pvt', 'key', 'Price volume trend.'],
  ['source', 'name', 'A price source of the current bar: open, high, low, close, hl2, hlc3, ohlc4 or hlcc4.'],
  ['fixnan', 'key, value', 'The latest finite value; null before the first one.'], ['mode', 'key, value, length', 'Most frequent value of the window; ties take the smallest.'],
  ['wad', 'key', 'Williams accumulation/distribution.'], ['wvad', '', 'Williams variable accumulation/distribution of the current bar.'],
  ['iii', '', 'Intraday intensity of the current bar.'], ['nvi', 'key', 'Negative volume index, starting at 1.'], ['pvi', 'key', 'Positive volume index, starting at 1.'],
  ['pivot_point_levels', 'key, type, anchor, developing = false', 'Eleven pivot levels [P, R1, S1, R2, S2, R3, S3, R4, S4, R5, S5] from the period before the latest anchor. Types: Traditional, Fibonacci, Woodie, Classic, DM, Camarilla.']
];
export const LVSCRIPT_TA_DOCS: Readonly<Record<string, ScriptApiDoc>> = Object.freeze(Object.fromEntries(TA_ROWS.map(([name, params, summary]) => [name, doc(`ctx.ta.${name}(${params})`, summary)])));

/** Top-level keys of the definition object. */
export const LVSCRIPT_DEFINITION_DOCS: Readonly<Record<string, ScriptApiDoc>> = Object.freeze({
  init: doc('init(ctx) { }', 'Runs once before the first bar. Use it to seed ctx.state.'),
  onBar: doc('onBar(ctx) { }', 'Runs once per bar. Required.'),
  onFill: doc('onFill(ctx, fill) { }', 'Strategy tester only: runs at a supplied fill, before that bar onBar.'),
  inputs: doc('inputs: [ ... ]', 'Up to 32 typed inputs read with ctx.input(name).'),
  requests: doc('requests: [ ... ]', 'Up to four named source requests read with ctx.request(name).'),
  timeframes: doc("timeframes: { name: '1D' }", 'Up to four higher timeframes built from the chart bars, read with ctx.timeframe(name, n).'),
  symbols: doc("symbols: { name: 'QQQ' }", 'Up to four other symbols from data already loaded in the app, read with ctx.symbol(name, n).'),
  objectLimits: doc('objectLimits: { labels, lines, boxes, linefills, polylines }', 'How many drawing objects of each kind stay on the chart; the oldest goes first. 1 to 500 (polylines 1 to 100).'),
  conditions: doc("conditions: { name: 'message' }", 'Up to 32 alert conditions listed in the alert dialog in this order; set each bar with ctx.alertcondition(name, true or false).')
});

export type ScriptApiTarget = 'ctx' | 'ta' | 'definition';
/** Documentation for a dotted path such as "ctx.ta.rsi", "ctx.plot" or "onBar"; null when CandleScript v1 does not define it. */
export function scriptApiDoc(path: string): ScriptApiDoc | null {
  const parts = path.split('.').map(part => part.trim());
  if (parts[0] === 'ctx' && parts.length === 3 && parts[1] === 'ta') return LVSCRIPT_TA_DOCS[parts[2]] ?? null;
  if (parts[0] === 'ctx' && parts.length === 2) return LVSCRIPT_CONTEXT_DOCS[parts[1]] ?? null;
  if (parts.length === 1) return LVSCRIPT_DEFINITION_DOCS[parts[0]] ?? null;
  return null;
}

/** What the text just before the caret is completing: ctx members, ctx.ta functions, or a definition key. */
export function scriptCompletionTarget(before: string): { target: ScriptApiTarget; prefix: string } | null {
  const ta = /\bctx\s*\.\s*ta\s*\.\s*([A-Za-z_$][\w$]*)?$/.exec(before);
  if (ta) return { target: 'ta', prefix: ta[1] ?? '' };
  const ctx = /\bctx\s*\.\s*([A-Za-z_$][\w$]*)?$/.exec(before);
  if (ctx) return { target: 'ctx', prefix: ctx[1] ?? '' };
  const key = /^\s*([A-Za-z_$][\w$]*)$/.exec(before);
  return key ? { target: 'definition', prefix: key[1] } : null;
}
/** Names offered for a target, filtered by case-insensitive prefix. Definition keys only appear once typing has begun. */
export function scriptCompletionNames(target: ScriptApiTarget, prefix: string): string[] {
  const names = target === 'ta' ? LVSCRIPT_TA_FUNCTIONS : target === 'ctx' ? LVSCRIPT_CONTEXT_MEMBERS : Object.keys(LVSCRIPT_DEFINITION_DOCS);
  if (target === 'definition' && !prefix) return [];
  const lower = prefix.toLowerCase();
  return names.filter(name => name.toLowerCase().startsWith(lower));
}
function docFor(target: ScriptApiTarget, name: string): ScriptApiDoc | undefined {
  return target === 'ta' ? LVSCRIPT_TA_DOCS[name] : target === 'ctx' ? LVSCRIPT_CONTEXT_DOCS[name] : LVSCRIPT_DEFINITION_DOCS[name];
}
export const scriptCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const line = context.state.doc.lineAt(context.pos), before = line.text.slice(0, context.pos - line.from), found = scriptCompletionTarget(before);
  if (!found) return null;
  const options: Completion[] = scriptCompletionNames(found.target, found.prefix).map(name => {
    const row = docFor(found.target, name);
    return { label: name, type: found.target === 'definition' || /\(/.test(row?.signature ?? '') ? 'function' : 'property', detail: row ? row.signature.replace(/^ctx\.(ta\.)?/, '') : undefined, info: row?.summary };
  });
  return options.length ? { from: context.pos - found.prefix.length, options, validFor: /^[\w$]*$/ } : null;
};

/** The dotted API path under a position: "ctx.ta.rsi" when hovering rsi. Null when the word is not part of a ctx path. */
export function scriptPathAt(text: string, offset: number): { path: string; from: number; to: number } | null {
  if (offset < 0 || offset > text.length) return null;
  let from = offset, to = offset;
  while (from > 0 && /[\w$]/.test(text[from - 1])) from--;
  while (to < text.length && /[\w$]/.test(text[to])) to++;
  if (from === to) return null;
  const word = text.slice(from, to), head = text.slice(Math.max(0, from - 40), from), pathHead = /\bctx\s*\.\s*ta\s*\.\s*$/.exec(head) ? 'ctx.ta.' : /\bctx\s*\.\s*$/.exec(head) ? 'ctx.' : '';
  if (pathHead) return { path: pathHead + word, from, to };
  return word === 'ctx' ? { path: 'ctx', from, to } : LVSCRIPT_DEFINITION_DOCS[word] ? { path: word, from, to } : null;
}

const scriptHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos), hit = scriptPathAt(line.text, pos - line.from);
  if (!hit) return null;
  const row = hit.path === 'ctx' ? doc('ctx', 'The context object every callback receives.') : scriptApiDoc(hit.path);
  const unknown = !row && /^ctx\.(ta\.)?[\w$]+$/.test(hit.path);
  if (!row && !unknown) return null;
  return { pos: line.from + hit.from, end: line.from + hit.to, above: true, create() {
    const dom = document.createElement('div'); dom.className = 'script-api-hover';
    const head = document.createElement('code'), body = document.createElement('p');
    head.textContent = row ? row.signature : hit.path; body.textContent = row ? row.summary : `${hit.path} is not part of CandleScript v1 and reads as undefined.`;
    dom.append(head, body); return { dom };
  } };
});

/** Editor ranges for compiler diagnostics: the identifier at the offset, else one character. An error at the very end of the text (an unclosed bracket) marks the last character, never an invisible empty range. */
export function scriptLintDiagnostics(text: string, rows: readonly ScriptDiagnostic[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const row of rows) {
    let from = Math.max(0, Math.min(row.offset, text.length));
    let to = from; while (to < text.length && to - from < 40 && /[\w$]/.test(text[to])) to++;
    if (to === from) { if (from >= text.length && text.length > 0) from = text.length - 1; to = Math.min(text.length, from + 1); }
    out.push({ from, to, severity: row.severity, message: row.message, source: 'CandleScript' });
  }
  return out;
}
/** Live error and warning squiggles from the static compiler. Never executes the script. */
export const scriptLinter = linter(view => { const text = view.state.doc.toString(); return scriptLintDiagnostics(text, compileLVScript(text).diagnostics); }, { delay: 350 });
/** Shows a compile result in the editor at once (Compile, Run): squiggles plus the gutter markers, and scrolls the first error
 * into view without moving the cursor. */
export function showScriptDiagnostics(view: EditorView, rows: readonly ScriptDiagnostic[]): void {
  const text = view.state.doc.toString(), marks = scriptLintDiagnostics(text, rows), first = marks.find(row => row.severity === 'error');
  view.dispatch(setDiagnostics(view.state, marks), first ? { effects: EditorView.scrollIntoView(first.from, { y: 'nearest' }) } : {});
}

/** Minimap-lite model: the document folded into at most `rows` rows, each with a 0..1 density and the worst severity inside it. */
export interface MinimapRow { readonly from: number; readonly to: number; readonly density: number; readonly indent: number; readonly severity: 'error' | 'warning' | null }
export function minimapRows(text: string, rows = 120, diagnosticLines: ReadonlyMap<number, 'error' | 'warning'> = new Map()): MinimapRow[] {
  const lines = text.split('\n'), count = Math.max(1, Math.min(rows, lines.length)), per = lines.length / count, out: MinimapRow[] = [];
  for (let row = 0; row < count; row++) {
    const from = Math.floor(row * per), to = Math.max(from + 1, Math.floor((row + 1) * per));
    let length = 0, indent = Infinity, severity: MinimapRow['severity'] = null;
    for (let i = from; i < to && i < lines.length; i++) {
      const trimmed = lines[i].trim(); length = Math.max(length, trimmed.length);
      if (trimmed) indent = Math.min(indent, lines[i].length - lines[i].trimStart().length);
      const found = diagnosticLines.get(i + 1); if (found === 'error' || (found && !severity)) severity = found;
    }
    out.push({ from: from + 1, to: Math.min(to, lines.length), density: Math.min(1, length / 80), indent: Number.isFinite(indent) ? Math.min(indent, 24) : 0, severity });
  }
  return out;
}
/** Fraction of the document the scroll viewport covers, and where it starts, both in 0..1. */
export function minimapViewport(scrollTop: number, clientHeight: number, scrollHeight: number): { top: number; height: number } {
  if (scrollHeight <= 0) return { top: 0, height: 1 };
  const height = Math.min(1, Math.max(0.02, clientHeight / scrollHeight));
  return { top: Math.min(1 - height, Math.max(0, scrollTop / scrollHeight)), height };
}
const scriptMinimap = ViewPlugin.fromClass(class {
  readonly dom = document.createElement('div'); readonly body = document.createElement('div'); readonly thumb = document.createElement('div');
  frame = 0; drag = false; readonly onScroll = () => this.place();
  constructor(readonly view: EditorView) {
    this.dom.className = 'script-minimap'; this.dom.setAttribute('aria-hidden', 'true'); this.dom.title = 'Document overview. Click or drag to scroll.';
    this.body.className = 'script-minimap-rows'; this.thumb.className = 'script-minimap-thumb'; this.dom.append(this.body, this.thumb);
    view.dom.classList.add('script-has-minimap'); view.dom.append(this.dom);
    this.dom.addEventListener('pointerdown', event => { this.drag = true; this.dom.setPointerCapture?.(event.pointerId); this.seek(event); });
    this.dom.addEventListener('pointermove', event => { if (this.drag) this.seek(event); });
    const stop = () => { this.drag = false; }; this.dom.addEventListener('pointerup', stop); this.dom.addEventListener('pointercancel', stop);
    view.scrollDOM.addEventListener('scroll', this.onScroll); this.draw();
  }
  seek(event: PointerEvent) { const box = this.dom.getBoundingClientRect(); if (box.height <= 0) return; const scroller = this.view.scrollDOM, ratio = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)); scroller.scrollTop = ratio * scroller.scrollHeight - scroller.clientHeight / 2; }
  update(update: ViewUpdate) { if (update.docChanged || update.geometryChanged) { if (this.frame) cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); }); } }
  draw() {
    const text = this.view.state.doc.toString(), marks = new Map<number, 'error' | 'warning'>();
    for (const row of compileLVScript(text).diagnostics) if (marks.get(row.line) !== 'error') marks.set(row.line, row.severity);
    this.body.textContent = '';
    for (const row of minimapRows(text, 120, marks)) { const el = document.createElement('div'); el.className = 'script-minimap-row' + (row.severity ? ' ' + row.severity : ''); el.style.marginLeft = row.indent + 'px'; el.style.width = Math.max(2, Math.round(row.density * 48)) + 'px'; if (!row.density) el.style.opacity = '0'; this.body.append(el); }
    this.place();
  }
  place() { const s = this.view.scrollDOM, box = minimapViewport(s.scrollTop, s.clientHeight, s.scrollHeight); this.thumb.style.top = box.top * 100 + '%'; this.thumb.style.height = box.height * 100 + '%'; }
  destroy() { this.view.scrollDOM.removeEventListener('scroll', this.onScroll); if (this.frame) cancelAnimationFrame(this.frame); this.view.dom.classList.remove('script-has-minimap'); this.dom.remove(); }
});

/** All CandleScript editor intelligence as one extension set. */
export function scriptEditorIntelligence(): Extension[] {
  return [EditorState.languageData.of(() => [{ autocomplete: scriptCompletionSource }]), scriptHover, scriptLinter, lintGutter(), scriptMinimap];
}

/* ---------- Command palette model ---------- */
export type ScriptPaletteAction = 'compile' | 'format' | 'find' | 'replace' | 'gotoLine' | 'undo' | 'redo' | 'save' | 'run' | 'wrap' | 'snippet:plot' | 'snippet:input' | 'snippet:alert' | 'snippet:cross';
export interface ScriptPaletteCommand { readonly action: ScriptPaletteAction; readonly label: string; readonly keys?: string; readonly hint: string }
export const SCRIPT_PALETTE_COMMANDS: readonly ScriptPaletteCommand[] = Object.freeze([
  { action: 'compile', label: 'Compile script', hint: 'Check syntax and API use without running' },
  { action: 'format', label: 'Format document', hint: 'Re-indent and trim trailing spaces' },
  { action: 'find', label: 'Find in script', keys: 'Ctrl+F', hint: 'Open the find bar' },
  { action: 'replace', label: 'Find and replace', hint: 'Open find with the replace field' },
  { action: 'gotoLine', label: 'Go to line', keys: 'Ctrl+G', hint: 'Jump to a line number (or type :42 here)' },
  { action: 'undo', label: 'Undo edit', keys: 'Ctrl+Z', hint: 'Undo the last editor change' },
  { action: 'redo', label: 'Redo edit', keys: 'Ctrl+Y', hint: 'Redo the editor change' },
  { action: 'save', label: 'Save script', keys: 'Ctrl+S', hint: 'Save a version locally' },
  { action: 'run', label: 'Run on chart', keys: 'Ctrl+Enter', hint: 'Run with the selected chart action' },
  { action: 'wrap', label: 'Toggle word wrap', keys: 'Alt+Z', hint: 'Wrap long lines' },
  { action: 'snippet:plot', label: 'Insert snippet: plot a value', hint: 'Adds a ctx.plot line' },
  { action: 'snippet:input', label: 'Insert snippet: read an input', hint: 'Adds a ctx.input read' },
  { action: 'snippet:alert', label: 'Insert snippet: alert', hint: 'Adds a ctx.alert line' },
  { action: 'snippet:cross', label: 'Insert snippet: crossover test', hint: 'Adds a ctx.ta.crossover test' }
]);
export const SCRIPT_SNIPPETS: Readonly<Record<string, string>> = Object.freeze({
  'snippet:plot': "ctx.plot('Title', ctx.bar.close, '#6fa8ff');",
  'snippet:input': "const length = ctx.input('length');",
  'snippet:alert': "ctx.alert('signal', 'Condition met');",
  'snippet:cross': "const crossed = ctx.ta.crossover('cross-1', ctx.bar.close, ctx.ta.sma('cross-sma', ctx.bar.close, 20));"
});
/** Subsequence score (higher is better) of query inside text; null when it does not match. */
export function paletteScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase(), t = text.toLowerCase();
  if (!q) return 0;
  let at = -1, score = 0, run = 0;
  for (const ch of q) {
    if (ch === ' ') { run = 0; continue; }
    const next = t.indexOf(ch, at + 1); if (next < 0) return null;
    run = next === at + 1 ? run + 1 : 0; score += 1 + run * 2 + (next === 0 || t[next - 1] === ' ' ? 3 : 0) - Math.min(next - at - 1, 5) * 0.1; at = next;
  }
  return score;
}
export type PaletteResult = { kind: 'command'; command: ScriptPaletteCommand } | { kind: 'line'; line: number };
/** ":42" jumps to a line (bounded to the document); otherwise a ranked command list. */
export function paletteResults(query: string, lineCount: number, commands: readonly ScriptPaletteCommand[] = SCRIPT_PALETTE_COMMANDS): PaletteResult[] {
  const jump = /^\s*:\s*(\d{1,7})\s*$/.exec(query);
  if (jump) return [{ kind: 'line', line: Math.min(Math.max(1, Number(jump[1])), Math.max(1, lineCount)) }];
  return commands.map((command, index) => ({ command, index, score: paletteScore(query, command.label) })).filter(row => row.score !== null)
    .sort((a, b) => (b.score! - a.score!) || a.index - b.index).map(row => ({ kind: 'command' as const, command: row.command }));
}
